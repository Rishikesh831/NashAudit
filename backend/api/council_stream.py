"""
NashAudit — SSE Stub Endpoint
Phase 1 Task 9: Fake token stream at 50ms intervals.
🔵 STUB — replaced by real NVIDIA NIM streaming in Phase 3.
"""

import json
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..db import repository as repo
from ..engine.config_loader import get_agents

router = APIRouter(prefix="/council", tags=["council"])


async def _stub_stream(sim_id: str, round_number: int):
    """Generate a fake SSE token stream mimicking council deliberation."""
    agents = get_agents()
    agent_list = list(agents.values())

    # Round start
    yield f"event: round_start\ndata: {json.dumps({'round': 1, 'agent_count': len(agent_list)})}\n\n"
    await asyncio.sleep(0.1)

    # Simulate each agent's reasoning token by token
    stub_responses = {
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

    for agent_id, agent in agents.items():
        resp = stub_responses.get(agent_id, {
            "reasoning": "No specific analysis available.",
            "position": "UNCERTAIN",
            "confidence": 0.5,
        })

        # Stream tokens
        words = resp["reasoning"].split()
        for word in words:
            yield f"event: agent_token\ndata: {json.dumps({'agent_id': agent_id, 'token': word})}\n\n"
            await asyncio.sleep(0.05)

        # Agent complete
        yield f"event: agent_complete\ndata: {json.dumps({'agent_id': agent_id, 'position': resp['position'], 'confidence': resp['confidence'], 'full_reasoning': resp['reasoning']})}\n\n"
        await asyncio.sleep(0.1)

    # Round 1 complete
    positions = {aid: stub_responses.get(aid, {}).get("position", "UNCERTAIN") for aid in agents}
    yield f"event: round_complete\ndata: {json.dumps({'round': 1, 'positions': positions})}\n\n"
    await asyncio.sleep(0.2)

    # Leader elected
    yield f"event: leader_elected\ndata: {json.dumps({'leader': 'coalition_detector', 'confidence_score': 0.81, 'dominant_feature': 'cross_account_links'})}\n\n"
    await asyncio.sleep(0.1)

    # Final decision
    yield f"event: final_decision\ndata: {json.dumps({'decision': 'AUDIT', 'decided_by': 'coalition_detector', 'consensus_score': 0.60})}\n\n"
    await asyncio.sleep(0.05)

    # Stream end
    yield f"event: stream_end\ndata: {json.dumps({'council_result_id': f'cr_{sim_id}_{round_number}'})}\n\n"


@router.get("/stream/{sim_id}/{round_number}")
async def council_stream(sim_id: str, round_number: int):
    """
    GET /council/stream/{simulation_id}/{round_number}
    SSE endpoint for council deliberation streaming.
    """
    sim = repo.get_simulation(sim_id)
    if not sim:
        raise HTTPException(404, f"Simulation {sim_id} not found")

    return StreamingResponse(
        _stub_stream(sim_id, round_number),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
