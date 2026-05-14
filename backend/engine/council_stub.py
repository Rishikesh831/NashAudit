"""
NashAudit — Council Stub (Phase 1 Task 7)
Stub pipeline for council deliberation.
🔵 STUB — hardcoded agent reasoning, replaced by LLM in Phase 3.
"""

import random
from .config_loader import get_agents
from .game_theory import (
    compute_e_cheat, compute_q_star, compute_alpha_estimate,
    compute_safety_margin, elect_leader,
)
from .transaction_generator import FRAUDSTER_TYPES


def _stub_risk_analyst(txn: dict, game_params: dict) -> dict:
    """Stub for risk analyst agent."""
    ftype = FRAUDSTER_TYPES.get(txn["type_id"], FRAUDSTER_TYPES["risk_neutral"])
    e_cheat = compute_e_cheat(
        game_params["q"], game_params["G"], game_params["alpha"],
        game_params["P_caught"], game_params["P_escaped"],
        ftype["utility_multiplier"],
    )
    risk = txn["risk_score"]
    if e_cheat > 0 and risk > 0.5:
        position = "AUDIT"
    elif e_cheat < -0.1 * game_params["G"] and risk < 0.4:
        position = "SKIP"
    else:
        position = "UNCERTAIN"

    return {
        "position": position,
        "confidence": round(min(0.95, risk * 1.2), 3),
        "reasoning": (
            f"E[cheat] = {e_cheat:.0f}. Risk score ρ = {risk:.3f}. "
            f"{'Fraud is rational at current audit rate.' if position == 'AUDIT' else 'Expected gain is negative — deterred.'}"
        ),
    }


def _stub_forensics(txn: dict, game_params: dict) -> dict:
    """Stub for forensics agent."""
    features = txn.get("features", {})
    alpha_est = compute_alpha_estimate(features, txn["risk_score"])
    trail = txn.get("trail_depth", 0)
    if alpha_est > 0.6 and trail > 2:
        position = "AUDIT"
    elif alpha_est < 0.3:
        position = "SKIP"
    else:
        position = "UNCERTAIN"

    return {
        "position": position,
        "confidence": round(alpha_est, 3),
        "reasoning": (
            f"α estimate = {alpha_est:.3f}, trail depth = {trail}. "
            f"{'Multiple forensic indicators converge.' if position == 'AUDIT' else 'Insufficient forensic evidence.'}"
        ),
    }


def _stub_coalition_detector(txn: dict, game_params: dict) -> dict:
    """Stub for coalition detector agent."""
    shapley = txn.get("shapley_value", 0)
    is_keystone = txn.get("is_keystone", False)
    coal_id = txn.get("coalition_id")

    if is_keystone or shapley > 0.25:
        position = "AUDIT"
    elif coal_id is None and txn.get("cross_account_links", 0) == 0:
        position = "SKIP"
    else:
        position = "UNCERTAIN"

    if coal_id:
        reasoning = (
            f"Coalition {coal_id}, φᵢ = {shapley:.2f}. "
            f"{'KEYSTONE — auditing collapses coalition gain.' if is_keystone else 'Non-keystone member.'}"
        )
    else:
        reasoning = "No coalition links detected."

    return {
        "position": position,
        "confidence": 0.8 if coal_id else 0.3,
        "reasoning": reasoning,
    }


def _stub_behavioural(txn: dict, game_params: dict) -> dict:
    """Stub for behavioural agent."""
    ftype = FRAUDSTER_TYPES.get(txn["type_id"], FRAUDSTER_TYPES["risk_neutral"])
    features = txn.get("features", {})
    var_adj = txn["risk_score"] * ftype["utility_multiplier"] * (1 + features.get("velocity", 0) * 0.5)

    if ftype["id"] == "risk_seeking":
        position = "AUDIT"
    elif var_adj > 0.55:
        position = "AUDIT"
    elif abs(var_adj) < 0.05:
        position = "UNCERTAIN"
    else:
        position = "SKIP"

    return {
        "position": position,
        "confidence": round(min(var_adj, 0.95), 3),
        "reasoning": (
            f"Variance-adjusted utility = {var_adj:.3f}. Type: {ftype['name']} (multiplier {ftype['utility_multiplier']}). "
            f"{'Behavioural profile suggests active fraud intent.' if position == 'AUDIT' else 'Profile within normal parameters.'}"
        ),
    }


def _stub_adversarial(txn: dict, game_params: dict) -> dict:
    """Stub for adversarial agent — always argues against audit (red team)."""
    risk = txn["risk_score"]
    return {
        "position": "SKIP",
        "confidence": round(0.6 + random.random() * 0.3, 3),
        "reasoning": (
            f"Red-team objection: auditing TXN {txn['id']} consumes budget. "
            f"False positive risk = {(1 - risk) * 100:.0f}%. Recommend skip to preserve audit capacity."
        ),
    }


STUB_AGENTS = {
    "risk_analyst": _stub_risk_analyst,
    "forensics_agent": _stub_forensics,
    "coalition_detector": _stub_coalition_detector,
    "behavioural_agent": _stub_behavioural,
    "adversarial_agent": _stub_adversarial,
}


def run_council_deliberation(
    transaction: dict,
    game_params: dict,
    agent_priors: dict,
    round_number: int,
) -> dict:
    """
    Run a 2-round council deliberation for a single transaction.

    Round 1: Each agent independently evaluates.
    Round 2: Agents can change position based on Round 1 results.
    Leader is elected, final decision is made.
    """
    agents_cfg = get_agents()

    # ─── Round 1: Independent evaluation ───
    round1 = []
    for agent_id, agent_fn in STUB_AGENTS.items():
        result = agent_fn(transaction, game_params)
        agent_info = agents_cfg.get(agent_id, {})
        round1.append({
            "agent": {
                "id": agent_id,
                "name": agent_info.get("name", agent_id),
                "icon": agent_info.get("icon", "❓"),
                "color": agent_info.get("color", "#888"),
            },
            "position": result["position"],
            "confidence": result["confidence"],
            "reasoning": result["reasoning"],
            "round": 1,
        })

    # ─── Round 2: Deliberation ───
    audit_votes = sum(1 for r in round1 if r["position"] == "AUDIT")
    risk_score = transaction["risk_score"]

    round2 = []
    for pos in round1:
        new_position = pos["position"]
        changed = False

        if pos["agent"]["id"] == "adversarial_agent":
            if audit_votes >= 4 and risk_score > 0.8:
                new_position = "AUDIT"
                changed = True
        elif pos["position"] == "UNCERTAIN":
            new_position = "AUDIT" if audit_votes >= 3 else "SKIP"
            changed = True
        elif pos["position"] == "SKIP" and audit_votes >= 3 and risk_score > 0.6:
            new_position = "AUDIT"
            changed = True

        reasoning = (
            f"Revised after deliberation. {audit_votes} agents initially favoured AUDIT. "
            f"{'Concurring with majority.' if new_position == 'AUDIT' else 'Maintaining dissent.'}"
            if changed else pos["reasoning"]
        )

        round2.append({
            **pos,
            "position": new_position,
            "changed": changed,
            "round": 2,
            "reasoning": reasoning,
        })

    # ─── Leader Election ───
    leader_result = elect_leader(transaction, agent_priors)
    leader_id = leader_result["leader_id"]

    # Find leader's Round 2 position
    leader_pos = next((r for r in round2 if r["agent"]["id"] == leader_id), round2[0])
    leader_decision = leader_pos["position"] if leader_pos["position"] in ("AUDIT", "SKIP") else "SKIP"

    # Consensus
    final_positions = [r["position"] for r in round2]
    agreeing = sum(1 for p in final_positions if p == leader_decision)
    consensus = agreeing / len(round2)

    dissenters = [r["agent"] for r in round2 if r["position"] != leader_decision]

    return {
        "round1": round1,
        "round2": round2,
        "leader": leader_result["leader"],
        "leader_id": leader_id,
        "leader_decision": leader_decision,
        "leader_score": leader_result["score"],
        "consensus": round(consensus, 2),
        "agreeing": agreeing,
        "dissenters": dissenters,
        "dominant_feature": leader_result["dominant_feature"],
    }
