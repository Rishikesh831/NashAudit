"""
NashAudit — Council Deliberation Engine (Phase 3)
===================================================
Replaces the pure-stub pipeline with NIM-first, stub-fallback logic.

Flow:
  1. Load system prompts from system_prompts.toml
  2. Build TOML context via context_builder.py
  3. Query each agent via NIM (async)
  4. On NIM failure → fall back to heuristic stub
  5. Run 2-round deliberation with leader election
  6. Log every call to llm_calls table
"""

import asyncio
import random
import logging
import tomllib
from pathlib import Path
from typing import Optional

from .config_loader import get_agents
from .game_theory import (
    compute_e_cheat, compute_q_star, compute_alpha_estimate,
    compute_safety_margin, elect_leader,
)
from .transaction_generator import FRAUDSTER_TYPES
from .nim_client import get_nim_client
from .nim_response_parser import parse_agent_response

logger = logging.getLogger("nashaudit.council")

# ─── Load system prompts ───────────────────────────────────────
_system_prompts: Optional[dict] = None

def _get_system_prompts() -> dict:
    global _system_prompts
    if _system_prompts is None:
        prompts_path = Path(__file__).parent.parent / "config" / "system_prompts.toml"
        with open(prompts_path, "rb") as f:
            data = tomllib.load(f)
        _system_prompts = {
            agent_id: entry["content"]
            for agent_id, entry in data.get("prompts", {}).items()
        }
    return _system_prompts


# ═══════════════════════════════════════════════════════════════
# STUB FUNCTIONS (heuristic fallback — Phase 1 logic preserved)
# ═══════════════════════════════════════════════════════════════

def _stub_risk_analyst(txn: dict, game_params: dict) -> dict:
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


# ═══════════════════════════════════════════════════════════════
# TOML CONTEXT BUILDER (lightweight — for pipeline use)
# ═══════════════════════════════════════════════════════════════

def _build_agent_context_toml(txn: dict, game_params: dict, round_number: int) -> str:
    """Build a lightweight TOML context string for a single transaction."""
    import tomli_w

    ftype = FRAUDSTER_TYPES.get(txn["type_id"], FRAUDSTER_TYPES["risk_neutral"])
    features = txn.get("features", {})
    q = game_params["q"]
    G = game_params["G"]
    alpha = game_params["alpha"]
    P_caught = game_params["P_caught"]
    P_escaped = game_params["P_escaped"]
    m = ftype["utility_multiplier"]

    e_cheat = compute_e_cheat(q, G, alpha, P_caught, P_escaped, m)
    q_star = compute_q_star(G, alpha, P_caught, P_escaped, m)

    doc = {
        "transaction": {
            "txn_id": txn["id"],
            "amount": txn.get("amount", 0),
            "risk_score": txn["risk_score"],
            "velocity": features.get("velocity", 0),
            "device_mismatch": features.get("device_mismatch", 0) > 0.5,
            "geo_anomaly": round(features.get("geo_anomaly", 0), 3),
            "time_anomaly": features.get("time_anomaly", 0) > 0.5,
        },
        "game_state": {
            "q_current": round(q, 4),
            "G": G,
            "P_caught": P_caught,
            "P_escaped": P_escaped,
            "alpha": round(alpha, 3),
            "e_cheat": round(e_cheat, 2),
            "q_star": round(q_star, 4),
            "margin": round(e_cheat / (G * m) if G * m else 0, 4),
            "regime": "full" if q >= q_star else ("partial" if q >= q_star * 0.5 else "none"),
            "deterred": e_cheat <= 0,
        },
        "coalition": {
            "coalition_id": txn.get("coalition_id", ""),
            "shapley_value": round(txn.get("shapley_value", 0), 4),
            "is_keystone": txn.get("is_keystone", False),
            "cross_account_links": txn.get("cross_account_links", 0),
        },
        "fraudster_estimate": {
            "type": txn["type_id"],
            "variance_adjusted_utility": round(
                txn["risk_score"] * m * (1 + features.get("velocity", 0) * 0.5), 2
            ),
            "lambda_val": 0.3,
        },
    }
    return tomli_w.dumps(doc)


# ═══════════════════════════════════════════════════════════════
# NIM-FIRST AGENT QUERY (with stub fallback)
# ═══════════════════════════════════════════════════════════════

async def _query_agent_nim(
    agent_id: str,
    txn: dict,
    game_params: dict,
    round_number: int,
) -> dict:
    """
    Query a single agent via NIM. Falls back to stub on any failure.
    Returns: {"position", "confidence", "reasoning", "stub_used", "latency_ms", "raw_response"}
    """
    nim = get_nim_client()
    prompts = _get_system_prompts()
    system_prompt = prompts.get(agent_id, "You are a fraud audit council member.")

    # Build TOML context
    context_toml = _build_agent_context_toml(txn, game_params, round_number)

    # Try NIM
    result = await nim.query_agent(
        agent_id=agent_id,
        context_toml=context_toml,
        system_prompt=system_prompt,
    )

    # If NIM returned a result (even with parse issues), use it
    if not result["stub_used"]:
        return {**result, "context_toml": context_toml}

    # Fall back to stub
    stub_fn = STUB_AGENTS.get(agent_id)
    if stub_fn:
        stub_result = stub_fn(txn, game_params)
        return {
            "position": stub_result["position"],
            "confidence": stub_result["confidence"],
            "reasoning": stub_result["reasoning"],
            "stub_used": True,
            "latency_ms": result.get("latency_ms", 0),
            "raw_response": "",
            "context_toml": context_toml,
            "parse_success": True,
        }

    return {**result, "context_toml": context_toml}


# ═══════════════════════════════════════════════════════════════
# MAIN DELIBERATION FUNCTION
# ═══════════════════════════════════════════════════════════════

def run_council_deliberation(
    transaction: dict,
    game_params: dict,
    agent_priors: dict,
    round_number: int,
) -> dict:
    """
    Run a 2-round council deliberation for a single transaction.
    Uses NIM where available, falls back to stubs.

    This is a SYNC function (called by pipeline.py).
    Internally uses asyncio to call async NIM client.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context (e.g., FastAPI) — use nest_asyncio pattern
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _deliberation_async(transaction, game_params, agent_priors, round_number))
                return future.result(timeout=60)
        else:
            return loop.run_until_complete(
                _deliberation_async(transaction, game_params, agent_priors, round_number)
            )
    except RuntimeError:
        # No event loop — create one
        return asyncio.run(
            _deliberation_async(transaction, game_params, agent_priors, round_number)
        )


async def _deliberation_async(
    transaction: dict,
    game_params: dict,
    agent_priors: dict,
    round_number: int,
) -> dict:
    """Async implementation of council deliberation."""
    agents_cfg = get_agents()

    # ─── Round 1: Query all agents concurrently ───
    nim_tasks = []
    agent_ids = list(STUB_AGENTS.keys())
    for agent_id in agent_ids:
        nim_tasks.append(
            _query_agent_nim(agent_id, transaction, game_params, round_number)
        )

    # Run all agents concurrently
    nim_results = await asyncio.gather(*nim_tasks, return_exceptions=True)

    round1 = []
    for i, agent_id in enumerate(agent_ids):
        result = nim_results[i]
        if isinstance(result, Exception):
            # Exception during query — use stub
            logger.error(f"Agent {agent_id} raised exception: {result}")
            stub_fn = STUB_AGENTS[agent_id]
            stub_result = stub_fn(transaction, game_params)
            result = {**stub_result, "stub_used": True, "latency_ms": 0, "raw_response": "", "context_toml": ""}

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
            "stub_used": result.get("stub_used", True),
            "latency_ms": result.get("latency_ms", 0),
        })

    # ─── Round 2: Deliberation (position adjustment) ───
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

    leader_pos = next((r for r in round2 if r["agent"]["id"] == leader_id), round2[0])
    leader_decision = leader_pos["position"] if leader_pos["position"] in ("AUDIT", "SKIP") else "SKIP"

    # Consensus
    final_positions = [r["position"] for r in round2]
    agreeing = sum(1 for p in final_positions if p == leader_decision)
    consensus = agreeing / len(round2)

    dissenters = [r["agent"] for r in round2 if r["position"] != leader_decision]

    # Track stub usage
    any_real_llm = any(not r.get("stub_used", True) for r in round1)

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
        "any_real_llm": any_real_llm,
    }
