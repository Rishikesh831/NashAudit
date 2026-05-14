"""
NashAudit — Simulation API
Phase 1 Tasks 3-4: POST /simulation/create, GET /simulation/{id}/state
"""

import uuid
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from ..db import repository as repo
from ..engine.config_loader import build_default_params, get_agents
from ..engine.transaction_generator import generate_transactions

router = APIRouter(prefix="/simulation", tags=["simulation"])


class CreateSimulationRequest(BaseModel):
    N: int = 500
    k: int = 100
    time_window_hours: int = 24
    data_mode: str = "synthetic"
    G: float = 10000
    P_caught: float = 50000
    P_escaped: float = 5000
    alpha: float = 0.65
    fraudster_mix: dict = Field(default_factory=lambda: {
        "risk_neutral": 0.30,
        "risk_averse": 0.25,
        "risk_seeking": 0.20,
        "colluding": 0.25,
    })


@router.post("/create")
def create_simulation(req: CreateSimulationRequest):
    """POST /simulation/create — Create a new simulation with parameters."""
    sim_id = str(uuid.uuid4())[:8]

    # Validate mix sums to ~1.0
    mix_sum = sum(req.fraudster_mix.values())
    if abs(mix_sum - 1.0) > 0.05:
        raise HTTPException(400, f"Fraudster mix must sum to 1.0, got {mix_sum:.3f}")

    if req.k > req.N:
        raise HTTPException(400, f"k ({req.k}) cannot exceed N ({req.N})")

    # Build config
    params = {
        "N": req.N,
        "k": req.k,
        "time_window_hours": req.time_window_hours,
        "data_mode": req.data_mode,
        "G": req.G,
        "P_caught": req.P_caught,
        "P_escaped": req.P_escaped,
        "alpha": req.alpha,
        "fraudster_mix": req.fraudster_mix,
    }

    # Store as TOML blob
    import tomli_w
    config_toml = tomli_w.dumps(params)

    # Create simulation record
    sim = repo.create_simulation(sim_id, config_toml)

    # Generate transactions
    transactions = generate_transactions(
        req.N,
        req.fraudster_mix,
        req.time_window_hours,
    )
    repo.save_transactions(sim_id, 0, transactions)

    # Initialize agent priors
    agents = get_agents()
    priors = {
        agent_id: {"alpha": 1.0, "beta": 1.0, "rounds_led": 0}
        for agent_id in agents
    }
    repo.save_agent_priors(sim_id, priors)

    return {
        "simulation_id": sim_id,
        "status": "created",
        "params": params,
        "transaction_count": len(transactions),
    }


@router.get("/{sim_id}/state")
def get_simulation_state(sim_id: str):
    """GET /simulation/{id}/state — Full canonical state."""
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    # Parse config
    import tomllib
    params = tomllib.loads(sim["config_toml"])

    # Get all data
    transactions = repo.get_transactions(sim_id)
    rounds = repo.get_rounds(sim_id)
    agent_priors = repo.get_agent_priors(sim_id)

    # Parse round data
    round_history = []
    for r in rounds:
        round_data = {}
        for key in ["layer1_output", "layer2_output", "layer3_output",
                     "layer4_output", "layer5_output", "round_kpis"]:
            if r[key]:
                round_data[key] = json.loads(r[key])
        round_data["round_number"] = r["round_number"]
        round_history.append(round_data)

    return {
        "simulation_id": sim_id,
        "status": sim["status"],
        "params": params,
        "transactions": transactions,
        "round_history": round_history,
        "agent_priors": agent_priors,
        "current_round": len(round_history),
    }


@router.get("/list")
def list_simulations():
    """GET /simulation/list — List all simulations."""
    return repo.list_simulations()


@router.get("/{sim_id}/game-state")
def get_game_state(sim_id: str):
    """GET /simulation/{id}/game-state — Page 2 data."""
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    import tomllib
    params = tomllib.loads(sim["config_toml"])

    from ..engine.game_theory import (
        compute_type_kpis as _kpis,
        compute_best_response_curves,
    )
    from ..engine.transaction_generator import FRAUDSTER_TYPES

    q = params["k"] / params["N"]
    type_kpis = {
        tid: _kpis(tid, q, params["G"], params["alpha"], params["P_caught"], params["P_escaped"])
        for tid in FRAUDSTER_TYPES
    }

    br_curves = compute_best_response_curves(
        params["G"], params["alpha"], params["P_caught"], params["P_escaped"],
    )

    rounds = repo.get_rounds(sim_id)
    belief_data = []
    for r in rounds:
        if r["round_kpis"]:
            kpis = json.loads(r["round_kpis"])
            belief_data.append({
                "round": r["round_number"],
                "committed": q,
                "belief": kpis.get("fraudster_belief", 0),
                "gap": kpis.get("credibility_gap", 0),
            })

    return {
        "q": q,
        "type_kpis": type_kpis,
        "best_response_curves": br_curves,
        "belief_convergence": belief_data,
    }


@router.get("/{sim_id}/comparison")
def get_comparison(sim_id: str):
    """GET /simulation/{id}/comparison — Page 5 data."""
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    rounds = repo.get_rounds(sim_id)
    comparison_data = []
    for r in rounds:
        if r["round_kpis"]:
            kpis = json.loads(r["round_kpis"])
            comparison_data.append({
                "round": r["round_number"],
                "random_fraud": kpis.get("random_fraud", 0),
                "nash_optimal_fraud": kpis.get("nash_optimal_fraud", 0),
                "council_fraud": kpis.get("council_fraud", 0),
                "cumulative_regret": kpis.get("cumulative_regret", 0),
                "fraudster_belief": kpis.get("fraudster_belief", 0),
                "credibility_gap": kpis.get("credibility_gap", 0),
                "margins": kpis.get("margins", {}),
            })

    return {
        "rounds": comparison_data,
        "total_rounds": len(comparison_data),
    }
