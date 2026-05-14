"""
NashAudit — Setup Preview API
Phase 1 Task 5: POST /setup/preview — pure GT computation, no stubs.
🟢 GT — final code, no replacement needed.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..engine.game_theory import (
    compute_q_star,
    compute_e_cheat,
    compute_safety_margin,
    get_deterrence_regime,
    compute_best_response_curves,
)
from ..engine.transaction_generator import FRAUDSTER_TYPES

router = APIRouter(prefix="/setup", tags=["setup"])


class PreviewRequest(BaseModel):
    N: int = 500
    k: int = 100
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


@router.post("/preview")
def setup_preview(req: PreviewRequest):
    """
    POST /setup/preview — Live deterrence preview.
    Pure game theory computation. Returns q*, E[cheat], margin, regime per type.
    """
    q = req.k / req.N

    type_kpis = []
    for type_id, ftype in FRAUDSTER_TYPES.items():
        m = ftype["utility_multiplier"]
        q_star = compute_q_star(req.G, req.alpha, req.P_caught, req.P_escaped, m)
        e_cheat = compute_e_cheat(q, req.G, req.alpha, req.P_caught, req.P_escaped, m)
        margin = compute_safety_margin(e_cheat, req.G, m)
        regime = get_deterrence_regime(q, q_star)

        type_kpis.append({
            "type_id": type_id,
            "type_name": ftype["name"],
            "color": ftype["color"],
            "utility_multiplier": m,
            "q_star": round(q_star, 4),
            "e_cheat": round(e_cheat, 2),
            "margin": round(margin, 4),
            "regime": regime,
        })

    full_deterred = sum(1 for k in type_kpis if k["regime"] == "full")
    max_q_star = max(k["q_star"] for k in type_kpis)

    return {
        "q": round(q, 4),
        "audit_rate_pct": round(q * 100, 1),
        "type_kpis": type_kpis,
        "full_deterred": full_deterred,
        "total_types": len(type_kpis),
        "min_q_for_full_deterrence": round(max_q_star, 4),
        "min_k_for_full_deterrence": int(max_q_star * req.N) + 1,
    }


@router.get("/defaults")
def get_defaults():
    """GET /setup/defaults — Return default simulation parameters."""
    from ..engine.config_loader import build_default_params
    return build_default_params()


@router.post("/best-response-curves")
def get_best_response_curves(req: PreviewRequest):
    """POST /setup/best-response-curves — Data for best response chart."""
    curves = compute_best_response_curves(
        req.G, req.alpha, req.P_caught, req.P_escaped,
    )
    return {"curves": curves, "q": round(req.k / req.N, 4)}
