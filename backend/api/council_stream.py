"""
NashAudit — SSE Council Stream (Phase 3)
==========================================
Real-time token streaming for the Council Chamber.
Proxies NVIDIA NIM token stream per agent, with stub fallback.

SSE Event types (from API contract):
  - round_start
  - agent_token
  - agent_complete
  - round_complete
  - leader_elected
  - final_decision
  - stream_end
"""

import json
import asyncio
import tomllib
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..db import repository as repo
from ..engine.config_loader import get_agents
from ..engine.nim_client import get_nim_client
from ..engine.game_theory import elect_leader

router = APIRouter(prefix="/council", tags=["council"])

# Load system prompts
_prompts_cache = None

def _load_prompts() -> dict:
    global _prompts_cache
    if _prompts_cache is None:
        prompts_path = Path(__file__).parent.parent / "config" / "system_prompts.toml"
        with open(prompts_path, "rb") as f:
            data = tomllib.load(f)
        _prompts_cache = {
            agent_id: entry["content"]
            for agent_id, entry in data.get("prompts", {}).items()
        }
    return _prompts_cache


# ─── Stub responses (fallback) ───
STUB_RESPONSES = {
    "risk_analyst": {
        "reasoning": "E[cheat] is positive at current audit rate. Risk score exceeds threshold. Recommend audit to deter rational fraud.",
        "position": "AUDIT",
        "confidence": 0.79,
    },
    "forensics_agent": {
        "reasoning": "Trail depth of 3 hops provides sufficient evidence chain. Device fingerprint mismatch confirms anomalous access pattern.",
        "position": "AUDIT",
        "confidence": 0.72,
    },
    "coalition_detector": {
        "reasoning": "Transaction linked to coalition C-2. Shapley value of 0.34 indicates significant marginal contribution. Keystone position detected.",
        "position": "AUDIT",
        "confidence": 0.81,
    },
    "behavioural_agent": {
        "reasoning": "Risk-seeking behavioural profile detected. Variance-adjusted utility remains positive despite deterrence signals. Agent may ignore rational thresholds.",
        "position": "UNCERTAIN",
        "confidence": 0.55,
    },
    "adversarial_agent": {
        "reasoning": "Amount anomaly could be explained by quarterly bonus payment. Velocity spike consistent with end-of-month batch processing. Recommend preserving audit budget.",
        "position": "SKIP",
        "confidence": 0.68,
    },
}


async def _real_stream(sim_id: str, round_number: int):
    """
    SSE stream that attempts real NIM streaming per agent.
    Falls back to stub tokens if NIM is unavailable.
    """
    agents = get_agents()
    agent_list = list(agents.items())
    nim = get_nim_client()
    prompts = _load_prompts()

    # Get simulation context for building TOML
    sim = repo.get_simulation(sim_id)
    config = tomllib.loads(sim["config_toml"]) if sim else {}

    # Build a simple context TOML for streaming
    import tomli_w
    context_toml = tomli_w.dumps({
        "meta": {
            "simulation_id": sim_id,
            "round": round_number,
            "instruction": "Evaluate the batch of transactions and provide your position.",
        },
        "game_state": {
            "q_current": round(config.get("k", 100) / config.get("N", 500), 4),
            "G": config.get("G", 10000),
            "P_caught": config.get("P_caught", 50000),
            "P_escaped": config.get("P_escaped", 5000),
            "alpha": config.get("alpha", 0.65),
        },
    })

    # ─── Round 1 Start ───
    yield f"event: round_start\ndata: {json.dumps({'round': 1, 'agent_count': len(agent_list)})}\n\n"
    await asyncio.sleep(0.1)

    positions = {}
    agent_results = {}

    for agent_id, agent_cfg in agent_list:
        system_prompt = prompts.get(agent_id, "You are a fraud audit council member.")
        full_text = ""
        stub_used = False

        # Try real NIM streaming
        if nim.is_configured and nim._available is not False:
            try:
                token_count = 0
                async for token in nim.stream_agent(agent_id, context_toml, system_prompt):
                    full_text += token
                    # Emit tokens (debounce: emit word-by-word for smoother UI)
                    words = token.strip().split()
                    for word in words:
                        if word:
                            yield f"event: agent_token\ndata: {json.dumps({'agent_id': agent_id, 'token': word})}\n\n"
                            token_count += 1
                    await asyncio.sleep(0.02)  # Small delay between tokens

                if token_count == 0:
                    stub_used = True

            except Exception:
                stub_used = True
        else:
            stub_used = True

        # Fallback to stub
        if stub_used or not full_text.strip():
            resp = STUB_RESPONSES.get(agent_id, {
                "reasoning": "No specific analysis available.",
                "position": "UNCERTAIN",
                "confidence": 0.5,
            })
            words = resp["reasoning"].split()
            for word in words:
                yield f"event: agent_token\ndata: {json.dumps({'agent_id': agent_id, 'token': word})}\n\n"
                await asyncio.sleep(0.05)

            full_text = resp["reasoning"]
            position = resp["position"]
            confidence = resp["confidence"]
        else:
            # Parse the NIM response
            from ..engine.nim_response_parser import parse_agent_response
            parsed = parse_agent_response(full_text, agent_id)
            position = parsed["position"]
            confidence = parsed["confidence"]

        positions[agent_id] = position
        agent_results[agent_id] = {
            "position": position,
            "confidence": confidence,
            "reasoning": full_text[:500] if not stub_used else STUB_RESPONSES.get(agent_id, {}).get("reasoning", ""),
            "stub_used": stub_used,
        }

        # Agent complete event
        yield f"event: agent_complete\ndata: {json.dumps({'agent_id': agent_id, 'position': position, 'confidence': confidence, 'full_reasoning': agent_results[agent_id]['reasoning'], 'stub_used': stub_used})}\n\n"
        await asyncio.sleep(0.1)

    # ─── Round 1 Complete ───
    yield f"event: round_complete\ndata: {json.dumps({'round': 1, 'positions': positions})}\n\n"
    await asyncio.sleep(0.2)

    # ─── Leader Election ───
    # Use first agent with highest confidence as proxy for leader election
    audit_agents = [aid for aid, pos in positions.items() if pos == "AUDIT"]
    if audit_agents:
        leader_id = max(audit_agents, key=lambda a: agent_results[a]["confidence"])
    else:
        leader_id = max(agent_results, key=lambda a: agent_results[a]["confidence"])

    leader_cfg = agents.get(leader_id, {})
    dominant_feature = "risk_score"  # Simplified for streaming

    yield f"event: leader_elected\ndata: {json.dumps({'leader': leader_id, 'leader_name': leader_cfg.get('name', leader_id), 'confidence_score': agent_results[leader_id]['confidence'], 'dominant_feature': dominant_feature})}\n\n"
    await asyncio.sleep(0.1)

    # ─── Final Decision ───
    leader_pos = positions.get(leader_id, "SKIP")
    final_decision = leader_pos if leader_pos in ("AUDIT", "SKIP") else "SKIP"
    agreeing = sum(1 for p in positions.values() if p == final_decision)
    consensus = agreeing / len(positions) if positions else 0

    yield f"event: final_decision\ndata: {json.dumps({'decision': final_decision, 'decided_by': leader_id, 'consensus_score': round(consensus, 2)})}\n\n"
    await asyncio.sleep(0.05)

    # ─── Stream End ───
    any_real = any(not r["stub_used"] for r in agent_results.values())
    yield f"event: stream_end\ndata: {json.dumps({'council_result_id': f'cr_{sim_id}_{round_number}', 'any_real_llm': any_real})}\n\n"


@router.get("/stream/{sim_id}/{round_number}")
async def council_stream(sim_id: str, round_number: int):
    """
    GET /council/stream/{simulation_id}/{round_number}
    SSE endpoint for council deliberation streaming.
    Proxies real NVIDIA NIM token stream with stub fallback.
    """
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    return StreamingResponse(
        _real_stream(sim_id, round_number),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
