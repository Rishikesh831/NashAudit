"""NashAudit — Round Pipeline
Phase 1-4: Wires all layers (1→5) into a single round execution.
Now uses ML models (XGBoost) for risk scoring and alpha estimation,
NIM-first council deliberation, and NetworkX coalition detection.
"""

import json
import random
import logging
from typing import Optional

from .config_loader import get_agents, build_default_params
from .transaction_generator import FRAUDSTER_TYPES, generate_transactions
from .game_theory import (
    compute_risk_score,
    compute_type_kpis,
    compute_e_cheat,
    compute_q_star,
    compute_safety_margin,
    compute_ce_allocation,
    compute_stackelberg_strategy,
    compute_shapley_values,
    compute_best_response_curves,
    ThompsonSamplingBandit,
    update_agent_priors,
    update_fraudster_belief,
    get_deterrence_regime,
)
from .council_stub import run_council_deliberation
from .ml_models import predict_risk_score, predict_alpha, detect_coalitions, apply_coalition_labels, models_ready
from ..db import repository as repo

logger = logging.getLogger("nashaudit.pipeline")


def run_simulation_round(
    simulation_id: str,
    transactions: list[dict],
    params: dict,
    round_history: list[dict],
    agent_priors: dict,
) -> dict:
    """
    Execute a single simulation round through all 5 layers.

    Pipeline:
      Layer 1: Risk scoring (sigmoid, weights.toml)
      Layer 2: Council deliberation (stub / leader election)
      Layer 3: CE mediator allocation (LP)
      Layer 4: Stackelberg strategy + Shapley values
      Layer 5: Thompson Sampling + Fictitious play
    """
    N = params["N"]
    k = params["k"]
    G = params["G"]
    alpha = params["alpha"]
    P_caught = params["P_caught"]
    P_escaped = params["P_escaped"]
    q = k / N
    round_number = len(round_history) + 1

    game_params = {
        "q": q,
        "G": G,
        "alpha": alpha,
        "P_caught": P_caught,
        "P_escaped": P_escaped,
        "N": N,
        "k": k,
    }

    # ─── Layer 1: Risk Scoring (XGBoost if available, sigmoid fallback) ───
    for txn in transactions:
        if models_ready():
            txn["risk_score"] = predict_risk_score(txn.get("features", {}))
        else:
            txn["risk_score"] = compute_risk_score(txn.get("features", {}))

    # Compute type KPIs
    type_kpis = {}
    for type_id in FRAUDSTER_TYPES:
        type_kpis[type_id] = compute_type_kpis(type_id, q, G, alpha, P_caught, P_escaped)

    # ─── Layer 4C: ML Coalition Detection (NetworkX) ───
    if models_ready():
        ml_coalitions = detect_coalitions(transactions)
        apply_coalition_labels(transactions, ml_coalitions)

    # ─── Layer 4B: Shapley Values for Coalitions ───
    coalition_groups = {}
    for txn in transactions:
        cid = txn.get("coalition_id")
        if cid:
            coalition_groups.setdefault(cid, []).append(txn)

    for cid, members in coalition_groups.items():
        compute_shapley_values(members)

    # ─── Layer 2: Council Deliberation (NIM-first, stub-fallback) ───
    # Sort by risk score, take top 2k candidates
    sorted_txns = sorted(transactions, key=lambda t: t["risk_score"], reverse=True)
    candidates = sorted_txns[: min(k * 2, N)]

    deliberations = []
    for txn in candidates:
        delib = run_council_deliberation(txn, game_params, agent_priors, round_number)
        deliberations.append({
            "transaction": txn,
            "deliberation": delib,
        })

        # Log LLM calls for each agent in the deliberation
        for agent_pos in delib.get("round1", []):
            try:
                repo.log_llm_call(
                    simulation_id=simulation_id,
                    round_number=round_number,
                    agent_id=agent_pos["agent"]["id"],
                    context_toml="",
                    response_raw=agent_pos.get("reasoning", ""),
                    position=agent_pos.get("position"),
                    confidence=agent_pos.get("confidence"),
                    reasoning=agent_pos.get("reasoning"),
                    latency_ms=agent_pos.get("latency_ms", 0),
                    stub_used=agent_pos.get("stub_used", True),
                )
            except Exception as e:
                logger.debug(f"Failed to log LLM call: {e}")

    # ─── Layer 3: CE Allocation ───
    ce_result = compute_ce_allocation(transactions, k, G, alpha, P_caught, P_escaped)

    # ─── Select top k for audit (AUDIT decisions first, then risk score) ───
    audit_decisions = sorted(
        deliberations,
        key=lambda d: (
            0 if d["deliberation"]["leader_decision"] == "AUDIT" else 1,
            -d["transaction"]["risk_score"],
        ),
    )[:k]

    audited_ids = set(d["transaction"]["id"] for d in audit_decisions)

    # ─── Layer 4A: Stackelberg Strategy ───
    stackelberg = compute_stackelberg_strategy(N, k, G, alpha, P_caught, P_escaped)

    # ─── Determine Outcomes ───
    outcomes = []
    for txn in transactions:
        audited = txn["id"] in audited_ids
        was_fraud = txn.get("is_fraudulent", False)
        caught = audited and was_fraud and random.random() < alpha
        type_kpi = type_kpis.get(txn["type_id"], {})
        deterred = type_kpi.get("regime") == "full"
        outcomes.append({
            **txn,
            "audited": audited,
            "caught": caught,
            "deterred": deterred,
        })

    fraud_attempts = [o for o in outcomes if o["is_fraudulent"] and not o["deterred"]]
    fraud_caught = [o for o in outcomes if o.get("caught", False)]

    # ─── Layer 5: Thompson Sampling — Update Agent Priors ───
    new_priors = {k: {**v} for k, v in agent_priors.items()}
    for d in audit_decisions:
        leader_id = d["deliberation"]["leader_id"]
        was_correct = d["transaction"]["is_fraudulent"] == (d["deliberation"]["leader_decision"] == "AUDIT")
        new_priors = update_agent_priors(new_priors, leader_id, was_correct)

    # ─── Layer 5: Fictitious Play Belief Update ───
    prev_belief = round_history[-1]["fraudster_belief"] if round_history else 0.0
    current_audit_rate = len(audited_ids) / N
    belief_update = update_fraudster_belief(prev_belief, current_audit_rate, round_number)

    # ─── Compute Round KPIs ───
    full_deterred = sum(1 for kpi in type_kpis.values() if kpi["regime"] == "full")
    txns_deterred = sum(1 for o in outcomes if o["deterred"])
    DER = txns_deterred / k if k > 0 else 0.0

    ic_satisfied = ce_result["ic_satisfied"]

    # Random baseline
    total_fraudulent = sum(1 for t in transactions if t.get("is_fraudulent", False))
    random_fraud = total_fraudulent * (1 - q * alpha)

    # Nash-optimal baseline
    max_q_star = max((kpi["q_star"] for kpi in type_kpis.values()), default=1.0)
    nash_optimal_fraud = total_fraudulent * max(0, 1 - min(1, q / max_q_star))

    # Cumulative regret
    optimal_value = max((abs(kpi["e_cheat"]) for kpi in type_kpis.values()), default=0)
    actual_value = sum(abs(kpi["e_cheat"]) for kpi in type_kpis.values()) / len(type_kpis) if type_kpis else 0
    round_regret = max(0, optimal_value - actual_value)
    prev_cumulative = round_history[-1].get("cumulative_regret", 0) if round_history else 0

    round_data = {
        "round_number": round_number,
        "q": round(q, 4),
        "type_kpis": type_kpis,
        "audit_decisions": [
            {
                "transaction_id": d["transaction"]["id"],
                "risk_score": d["transaction"]["risk_score"],
                "type_id": d["transaction"]["type_id"],
                "leader_id": d["deliberation"]["leader_id"],
                "leader_decision": d["deliberation"]["leader_decision"],
                "consensus": d["deliberation"]["consensus"],
                "agreeing": d["deliberation"]["agreeing"],
            }
            for d in audit_decisions
        ],
        "fraud_attempts": len(fraud_attempts),
        "fraud_caught": len(fraud_caught),
        "fraudster_belief": belief_update["belief"],
        "credibility_gap": belief_update["gap"],
        "full_deterred": full_deterred,
        "txns_deterred": txns_deterred,
        "DER": round(DER, 4),
        "ic_satisfied": ic_satisfied,
        "stackelberg": stackelberg,
        "ce_allocation": {
            "ic_satisfied": ce_result["ic_satisfied"],
            "total_allocated": round(sum(ce_result["allocations"]), 2),
        },
        "random_fraud": round(random_fraud, 2),
        "nash_optimal_fraud": round(nash_optimal_fraud, 2),
        "council_fraud": len(fraud_attempts),
        "round_regret": round(round_regret, 2),
        "cumulative_regret": round(prev_cumulative + round_regret, 2),
        "margins": {tid: kpi["margin"] for tid, kpi in type_kpis.items()},
        "agent_priors": new_priors,
    }

    return {
        "round_data": round_data,
        "new_priors": new_priors,
        "deliberations": deliberations[:k],  # Full deliberation objects for council chamber
        "outcomes": outcomes,
    }
