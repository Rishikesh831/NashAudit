"""
NashAudit — ML Models (Phase 4)
================================
Replaces heuristic sigmoid scorers with real ML models.

- Risk Scorer: XGBoost classifier trained on synthetic data
- Alpha Estimator: XGBoost regressor trained on synthetic data
- Coalition Detector: NetworkX community detection

Models are trained once at startup on synthetic data and cached in memory.
Falls back to heuristic functions if training fails.
"""

import math
import random
import logging
from typing import Optional

import numpy as np
import networkx as nx

logger = logging.getLogger("nashaudit.ml")

# ─── Lazy imports for ML libs (may not be installed) ───
_xgb = None
_MODELS_READY = False
_risk_model = None
_alpha_model = None


def _ensure_xgboost():
    """Lazy-load XGBoost."""
    global _xgb
    if _xgb is None:
        try:
            import xgboost as xgb
            _xgb = xgb
        except ImportError:
            logger.warning("XGBoost not installed. Using heuristic fallback.")
            _xgb = False
    return _xgb if _xgb is not False else None


# ═══════════════════════════════════════════════════════════════
# SYNTHETIC DATA GENERATION (for training)
# ═══════════════════════════════════════════════════════════════

def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-500, min(500, x))))


def _randn() -> float:
    u1 = max(random.random(), 1e-12)
    u2 = random.random()
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _generate_training_data(n_samples: int = 5000) -> tuple:
    """
    Generate synthetic training data for risk scorer and alpha estimator.

    Returns:
        X_risk: (n, 5) features for risk scoring
        y_risk: (n,) binary labels (is_fraudulent)
        X_alpha: (n, 6) features for alpha estimation
        y_alpha: (n,) continuous labels (capture probability)
    """
    X_risk = []
    y_risk = []
    X_alpha = []
    y_alpha = []

    for _ in range(n_samples):
        is_fraud = random.random() < 0.25  # 25% fraud rate for training

        # Generate features (same distribution as transaction_generator.py)
        amount_z = _clamp(_randn() * 0.3 + (0.7 if is_fraud else 0.3))
        velocity = _clamp(_randn() * 0.25 + (0.6 if is_fraud else 0.25))
        device = _clamp(_randn() * 0.2 + (0.55 if is_fraud else 0.2))
        geo = _clamp(_randn() * 0.2 + (0.5 if is_fraud else 0.2))
        time_anom = _clamp(_randn() * 0.15 + (0.45 if is_fraud else 0.15))

        X_risk.append([amount_z, velocity, device, geo, time_anom])
        y_risk.append(1 if is_fraud else 0)

        # For alpha estimation: risk_score + trail features → capture probability
        raw_risk = 0.40 * amount_z + 0.25 * velocity + 0.20 * device + 0.10 * geo + 0.05 * time_anom
        risk_score = _sigmoid((raw_risk - 0.35) * 8)
        trail_depth = random.randint(0, 5)
        cross_links = random.randint(0, 4) if is_fraud else random.randint(0, 1)
        prior_flags = random.randint(0, 3) if is_fraud else 0

        X_alpha.append([risk_score, trail_depth / 5.0, cross_links / 5.0, device, prior_flags / 3.0, velocity])
        # Ground truth alpha: higher for fraud with strong evidence
        base_alpha = 0.3 + 0.4 * risk_score + 0.15 * (trail_depth / 5.0) + 0.1 * (cross_links / 5.0)
        noise = _randn() * 0.05
        y_alpha.append(_clamp(base_alpha + noise, 0.1, 0.95))

    return (
        np.array(X_risk, dtype=np.float32),
        np.array(y_risk, dtype=np.int32),
        np.array(X_alpha, dtype=np.float32),
        np.array(y_alpha, dtype=np.float32),
    )


# ═══════════════════════════════════════════════════════════════
# MODEL TRAINING
# ═══════════════════════════════════════════════════════════════

def train_models(n_samples: int = 5000) -> bool:
    """
    Train all ML models on synthetic data. Called once at startup.
    Returns True if models trained successfully, False if falling back to heuristics.
    """
    global _risk_model, _alpha_model, _MODELS_READY

    xgb = _ensure_xgboost()
    if xgb is None:
        logger.warning("XGBoost unavailable. ML models will use heuristic fallback.")
        _MODELS_READY = False
        return False

    try:
        logger.info(f"Training ML models on {n_samples} synthetic samples...")
        X_risk, y_risk, X_alpha, y_alpha = _generate_training_data(n_samples)

        # ── Risk Scorer (XGBoost Classifier) ──
        _risk_model = xgb.XGBClassifier(
            n_estimators=50,
            max_depth=4,
            learning_rate=0.1,
            eval_metric="logloss",
            use_label_encoder=False,
            verbosity=0,
            random_state=42,
        )
        _risk_model.fit(X_risk, y_risk)

        # ── Alpha Estimator (XGBoost Regressor) ──
        _alpha_model = xgb.XGBRegressor(
            n_estimators=50,
            max_depth=4,
            learning_rate=0.1,
            eval_metric="rmse",
            verbosity=0,
            random_state=42,
        )
        _alpha_model.fit(X_alpha, y_alpha)

        _MODELS_READY = True
        logger.info("ML models trained successfully.")
        return True

    except Exception as e:
        logger.error(f"ML model training failed: {e}. Using heuristic fallback.")
        _MODELS_READY = False
        return False


# ═══════════════════════════════════════════════════════════════
# PREDICTION FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def predict_risk_score(features: dict) -> float:
    """
    Predict fraud risk score using XGBoost classifier.
    Returns probability of fraud (0.0 to 1.0).
    Falls back to sigmoid heuristic if model not available.
    """
    if _MODELS_READY and _risk_model is not None:
        try:
            X = np.array([[
                features.get("amount_zscore", 0),
                features.get("velocity", 0),
                features.get("device_mismatch", 0),
                features.get("geo_anomaly", 0),
                features.get("time_anomaly", 0),
            ]], dtype=np.float32)
            proba = _risk_model.predict_proba(X)[0][1]  # probability of class 1 (fraud)
            return round(float(proba), 3)
        except Exception as e:
            logger.debug(f"Risk model prediction failed: {e}, using fallback")

    # Heuristic fallback (same as game_theory.compute_risk_score)
    raw = (
        0.40 * features.get("amount_zscore", 0)
        + 0.25 * features.get("velocity", 0)
        + 0.20 * features.get("device_mismatch", 0)
        + 0.10 * features.get("geo_anomaly", 0)
        + 0.05 * features.get("time_anomaly", 0)
    )
    return round(_sigmoid((raw - 0.35) * 8), 3)


def predict_alpha(features: dict, risk_score: float) -> float:
    """
    Predict capture probability (α) using XGBoost regressor.
    Falls back to sigmoid heuristic if model not available.
    """
    if _MODELS_READY and _alpha_model is not None:
        try:
            X = np.array([[
                risk_score,
                min(features.get("trail_depth", 0) / 5.0, 1.0),
                min(features.get("cross_account_links", 0) / 5.0, 1.0),
                features.get("device_mismatch", 0),
                min(features.get("prior_flags", 0) / 3.0, 1.0),
                features.get("velocity", 0),
            ]], dtype=np.float32)
            pred = _alpha_model.predict(X)[0]
            return round(float(_clamp(pred, 0.1, 0.95)), 3)
        except Exception as e:
            logger.debug(f"Alpha model prediction failed: {e}, using fallback")

    # Heuristic fallback (same as game_theory.compute_alpha_estimate)
    raw = (
        0.30 * risk_score
        + 0.25 * min(features.get("trail_depth", 0) / 5.0, 1.0)
        + 0.20 * min(features.get("cross_account_links", 0) / 5.0, 1.0)
        + 0.15 * features.get("device_mismatch", 0)
        + 0.10 * min(features.get("prior_flags", 0) / 3.0, 1.0)
    )
    return round(_sigmoid((raw - 0.25) * 6), 3)


# ═══════════════════════════════════════════════════════════════
# COALITION DETECTOR (NetworkX)
# ═══════════════════════════════════════════════════════════════

def detect_coalitions(
    transactions: list[dict],
    similarity_threshold: float = 0.6,
    min_coalition_size: int = 2,
) -> list[dict]:
    """
    Detect fraud coalitions using NetworkX graph analysis.

    Strategy:
    1. Build a graph where nodes = transactions
    2. Add edges between transactions with:
       - Same coalition_id (already assigned by generator)
       - Similar device/geo patterns AND both flagged as suspicious
       - Shared account linkage signals (cross_account_links > 0)
    3. Run community detection (greedy modularity)
    4. Return coalition assignments with keystone flags

    Returns list of coalition dicts:
        [{"id": "ML-C-1", "members": [txn_ids], "keystone_id": "TXN-0042"}, ...]
    """
    if not transactions:
        return []

    G = nx.Graph()

    # Add all transactions as nodes
    for txn in transactions:
        G.add_node(txn["id"], **{
            "risk_score": txn.get("risk_score", 0),
            "type_id": txn.get("type_id", ""),
            "coalition_id": txn.get("coalition_id"),
        })

    # Build edges
    n = len(transactions)
    for i in range(n):
        for j in range(i + 1, n):
            t1, t2 = transactions[i], transactions[j]
            weight = 0.0

            # Same existing coalition → strong edge
            if (t1.get("coalition_id") and t2.get("coalition_id")
                    and t1["coalition_id"] == t2["coalition_id"]):
                weight += 0.8

            # Both have cross-account links → moderate edge
            if t1.get("cross_account_links", 0) > 0 and t2.get("cross_account_links", 0) > 0:
                weight += 0.3

            # Similar feature profiles (high risk, same type)
            if (t1.get("type_id") == t2.get("type_id")
                    and t1.get("risk_score", 0) > 0.6
                    and t2.get("risk_score", 0) > 0.6):
                f1 = t1.get("features", {})
                f2 = t2.get("features", {})
                # Device or geo similarity
                if (f1.get("device_mismatch", 0) > 0.5 and f2.get("device_mismatch", 0) > 0.5):
                    weight += 0.2
                if abs(f1.get("geo_anomaly", 0) - f2.get("geo_anomaly", 0)) < 0.15:
                    weight += 0.15

            if weight >= similarity_threshold:
                G.add_edge(t1["id"], t2["id"], weight=weight)

    # Run community detection
    if G.number_of_edges() == 0:
        return []

    try:
        communities = list(nx.community.greedy_modularity_communities(G))
    except Exception:
        # Fallback: connected components
        communities = list(nx.connected_components(G))

    # Filter and format
    coalitions = []
    coal_idx = 1
    for community in communities:
        members = [tid for tid in community if G.degree(tid) > 0]
        if len(members) < min_coalition_size:
            continue

        # Find keystone: node with highest weighted degree
        keystone_id = max(
            members,
            key=lambda tid: sum(
                G[tid][nbr].get("weight", 1.0) for nbr in G.neighbors(tid) if nbr in members
            )
        )

        # Compute risk contribution per member
        member_risks = {
            tid: next(t["risk_score"] for t in transactions if t["id"] == tid)
            for tid in members
        }
        total_risk = sum(member_risks.values()) or 1.0
        gain_reduction = member_risks.get(keystone_id, 0) / total_risk

        coalitions.append({
            "id": f"ML-C-{coal_idx}",
            "members": sorted(members),
            "keystone_id": keystone_id,
            "size": len(members),
            "total_risk": round(total_risk, 4),
            "keystone_gain_reduction": round(gain_reduction, 4),
        })
        coal_idx += 1

    return coalitions


def apply_coalition_labels(transactions: list[dict], coalitions: list[dict]) -> None:
    """
    Apply ML-detected coalition labels back onto transaction dicts.
    Updates: coalition_id, is_keystone, cross_account_links
    """
    # Build lookup: txn_id → coalition info
    member_map = {}
    for coal in coalitions:
        for member_id in coal["members"]:
            member_map[member_id] = coal

    for txn in transactions:
        coal = member_map.get(txn["id"])
        if coal:
            # Only update if ML detected something new (don't overwrite existing)
            if not txn.get("coalition_id"):
                txn["coalition_id"] = coal["id"]
            txn["is_keystone"] = (txn["id"] == coal["keystone_id"])
            txn["cross_account_links"] = max(
                txn.get("cross_account_links", 0),
                coal["size"] - 1,
            )


# ═══════════════════════════════════════════════════════════════
# STATUS
# ═══════════════════════════════════════════════════════════════

def models_ready() -> bool:
    """Check if ML models are trained and ready."""
    return _MODELS_READY


def get_model_status() -> dict:
    """Return status of all ML models."""
    return {
        "models_ready": _MODELS_READY,
        "risk_scorer": "xgboost" if _MODELS_READY and _risk_model else "heuristic_fallback",
        "alpha_estimator": "xgboost" if _MODELS_READY and _alpha_model else "heuristic_fallback",
        "coalition_detector": "networkx",
    }
