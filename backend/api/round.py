"""
NashAudit — Round Execution API
Phase 1 Task 8: POST /round/execute/{simulation_id}
"""

import json
import tomllib
from fastapi import APIRouter, HTTPException

from ..db import repository as repo
from ..engine.pipeline import run_simulation_round
from ..engine.transaction_generator import generate_transactions

router = APIRouter(prefix="/round", tags=["round"])


@router.post("/execute/{sim_id}")
def execute_round(sim_id: str):
    """POST /round/execute/{simulation_id} — Run one simulation round."""
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    params = tomllib.loads(sim["config_toml"])

    # Get existing data
    transactions = repo.get_transactions(sim_id)
    if not transactions:
        # Regenerate if needed
        transactions = generate_transactions(
            params["N"],
            params["fraudster_mix"],
            params.get("time_window_hours", 24),
        )
        repo.save_transactions(sim_id, 0, transactions)

    # Get round history
    rounds = repo.get_rounds(sim_id)
    round_history = []
    for r in rounds:
        if r["round_kpis"]:
            round_history.append(json.loads(r["round_kpis"]))

    # Get agent priors
    agent_priors = repo.get_agent_priors(sim_id)
    if not agent_priors:
        from ..engine.config_loader import get_agents
        agents = get_agents()
        agent_priors = {
            aid: {"alpha": 1.0, "beta": 1.0, "rounds_led": 0}
            for aid in agents
        }

    # Run the pipeline
    result = run_simulation_round(
        simulation_id=sim_id,
        transactions=transactions,
        params=params,
        round_history=round_history,
        agent_priors=agent_priors,
    )

    round_data = result["round_data"]

    # Persist round
    repo.save_round(
        simulation_id=sim_id,
        round_number=round_data["round_number"],
        layer1_output=json.dumps({"risk_scores": {t["id"]: t["risk_score"] for t in transactions}}),
        layer2_output=json.dumps(round_data["audit_decisions"]),
        layer3_output=json.dumps(round_data["ce_allocation"]),
        layer4_output=json.dumps(round_data["stackelberg"]),
        layer5_output=json.dumps(round_data["agent_priors"]),
        round_kpis=json.dumps(round_data),
    )

    # Update priors
    repo.save_agent_priors(sim_id, result["new_priors"])

    # Mark audited transactions
    audited_ids = [d["transaction_id"] for d in round_data["audit_decisions"]]
    repo.mark_audited(audited_ids)

    # Update simulation status
    repo.update_simulation_status(sim_id, "running")

    return round_data


@router.get("/{sim_id}/history")
def get_round_history(sim_id: str):
    """GET /round/{sim_id}/history — All rounds for a simulation."""
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    rounds = repo.get_rounds(sim_id)
    history = []
    for r in rounds:
        entry = {"round_number": r["round_number"]}
        if r["round_kpis"]:
            entry.update(json.loads(r["round_kpis"]))
        history.append(entry)

    return {"simulation_id": sim_id, "rounds": history}


@router.get("/{sim_id}/{round_number}/council-result")
def get_council_result(sim_id: str, round_number: int):
    """GET /round/{sim_id}/{round_number}/council-result — Council deliberation for a round."""
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    rounds = repo.get_rounds(sim_id)
    target = None
    for r in rounds:
        if r["round_number"] == round_number:
            target = r
            break

    if not target:
        raise HTTPException(404, f"Round {round_number} not found")

    if target["layer2_output"]:
        return json.loads(target["layer2_output"])
    return {"message": "No council data for this round"}
