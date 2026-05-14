"""
NashAudit — Transaction Generator
Phase 1, Task 6: Synthetic transaction generation using fraudster_mix from config.
"""

import math
import random
import uuid
from typing import Optional

from .config_loader import get_weights

# Fraudster type definitions (canonical)
FRAUDSTER_TYPES = {
    "risk_neutral": {
        "id": "risk_neutral",
        "name": "Risk-Neutral",
        "color": "#1D9E75",
        "description": "Maximises expected monetary value. Cheats if E[cheat] > 0.",
        "utility_multiplier": 1.0,
    },
    "risk_averse": {
        "id": "risk_averse",
        "name": "Risk-Averse",
        "color": "#D4A843",
        "description": "Overweights penalty. Requires higher E[cheat] to act.",
        "utility_multiplier": 0.7,
    },
    "risk_seeking": {
        "id": "risk_seeking",
        "name": "Risk-Seeking",
        "color": "#E06C5A",
        "description": "Underweights penalty. Cheats even when margins are thin.",
        "utility_multiplier": 1.4,
    },
    "colluding": {
        "id": "colluding",
        "name": "Colluding",
        "color": "#8B6CC1",
        "description": "Coordinates with others. Shares risk across coalition members.",
        "utility_multiplier": 1.2,
    },
}


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _randn() -> float:
    """Box-Muller normal."""
    u1 = random.random()
    u2 = random.random()
    return math.sqrt(-2 * math.log(max(u1, 1e-12))) * math.cos(2 * math.pi * u2)


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def generate_transactions(
    N: int,
    fraudster_mix: dict[str, float],
    time_window_hours: int = 24,
) -> list[dict]:
    """
    Generate N synthetic transactions.

    Each transaction has:
      - features: amount_zscore, velocity, device_mismatch, geo_anomaly, time_anomaly
      - risk_score ρ computed via Layer 1 sigmoid scorer
      - type assignment based on fraudster_mix
      - coalition assignments for colluding types
      - Shapley values for coalition members
    """
    # Load Layer 1 weights from config
    weights_cfg = get_weights()
    w = weights_cfg["layer1"]["risk_scorer"]

    # Build cumulative distribution from mix
    type_keys = list(fraudster_mix.keys())
    type_probs = [fraudster_mix[k] for k in type_keys]
    cumulative = []
    total = 0.0
    for p in type_probs:
        total += p
        cumulative.append(total)

    transactions = []
    import time as _time
    now_ms = int(_time.time() * 1000)

    for i in range(N):
        # Assign type
        r = random.random()
        type_key = type_keys[-1]
        for j, c in enumerate(cumulative):
            if r <= c:
                type_key = type_keys[j]
                break

        ftype = FRAUDSTER_TYPES[type_key]
        is_fraudulent = random.random() < (0.15 + list(FRAUDSTER_TYPES.keys()).index(type_key) * 0.05)

        # Generate feature scores
        features = {
            "amount_zscore": _clamp(_randn() * 0.3 + (0.7 if is_fraudulent else 0.3)),
            "velocity": _clamp(_randn() * 0.25 + (0.6 if is_fraudulent else 0.25)),
            "device_mismatch": _clamp(_randn() * 0.2 + (0.55 if is_fraudulent else 0.2)),
            "geo_anomaly": _clamp(_randn() * 0.2 + (0.5 if is_fraudulent else 0.2)),
            "time_anomaly": _clamp(_randn() * 0.15 + (0.45 if is_fraudulent else 0.15)),
        }

        # Layer 1: risk score ρ = σ(w1·z_amount + w2·velocity + w3·device + w4·geo + w5·time)
        raw_score = (
            w["w1_amount_zscore"] * features["amount_zscore"]
            + w["w2_velocity"] * features["velocity"]
            + w["w3_device_mismatch"] * features["device_mismatch"]
            + w["w4_geo_anomaly"] * features["geo_anomaly"]
            + w["w5_time_anomaly"] * features["time_anomaly"]
        )
        risk_score = round(_sigmoid((raw_score - 0.35) * 8), 3)

        txn = {
            "id": f"TXN-{i+1:04d}",
            "amount": round(1000 + random.random() * 99000),
            "timestamp": now_ms - int(random.random() * time_window_hours * 3600 * 1000),
            "type_id": type_key,
            "type": ftype,
            "is_fraudulent": is_fraudulent,
            "features": features,
            "risk_score": risk_score,
            "shapley_value": 0.0,
            "is_keystone": False,
            "coalition_id": None,
            "trail_depth": random.randint(0, 5),
            "cross_account_links": 0,
            "prior_flags": random.randint(0, 3) if is_fraudulent else 0,
        }
        transactions.append(txn)

    # Assign coalitions for colluding types
    colluding = [t for t in transactions if t["type_id"] == "colluding"]
    num_coalitions = max(1, len(colluding) // 4) if colluding else 0
    for idx, t in enumerate(colluding):
        coal_id = f"C-{(idx % num_coalitions) + 1}"
        t["coalition_id"] = coal_id
        t["cross_account_links"] = random.randint(1, 4)

    # Compute Shapley values for coalition members
    for c_idx in range(1, num_coalitions + 1):
        members = [t for t in colluding if t["coalition_id"] == f"C-{c_idx}"]
        n = len(members)
        if n == 0:
            continue
        total_risk = sum(m["risk_score"] for m in members)
        for m in members:
            m["shapley_value"] = round(m["risk_score"] / total_risk, 2) if total_risk > 0 else 0.0
        keystone = max(members, key=lambda m: m["shapley_value"])
        keystone["is_keystone"] = True

    return transactions
