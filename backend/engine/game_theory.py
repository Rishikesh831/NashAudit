"""
NashAudit — Game Theory Engine
Phase 2: Pure GT computations, no ML/LLM.

Tasks 11-17:
  11. Layer 1: sigmoid risk scorer (reads weights.toml)
  12. Layer 2C: leader election (reads agents.toml spec_vec)
  13. Layer 3: CE mediator LP (scipy.optimize.linprog)
  14. Layer 4A: Stackelberg LP (scipy.optimize.linprog)
  15. Layer 4B: Shapley values (exact formula)
  16. Layer 5: Thompson Sampling (reads bandit.toml)
  17. Fictitious play belief update
"""

import math
import random
from itertools import combinations
from typing import Optional

import numpy as np
from scipy.optimize import linprog

from .config_loader import get_weights, get_agents, get_bandit_config
from .transaction_generator import FRAUDSTER_TYPES


# ═══════════════════════════════════════════════════════════════
# LAYER 1 — Sigmoid Risk Scorer (Task 11)
# ═══════════════════════════════════════════════════════════════

def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def compute_risk_score(features: dict) -> float:
    """
    ρ = σ(w1·z_amount + w2·velocity + w3·device + w4·geo + w5·time)
    Reads weights from config/weights.toml.
    """
    w = get_weights()["layer1"]["risk_scorer"]
    raw = (
        w["w1_amount_zscore"] * features.get("amount_zscore", 0)
        + w["w2_velocity"] * features.get("velocity", 0)
        + w["w3_device_mismatch"] * features.get("device_mismatch", 0)
        + w["w4_geo_anomaly"] * features.get("geo_anomaly", 0)
        + w["w5_time_anomaly"] * features.get("time_anomaly", 0)
    )
    return round(sigmoid((raw - 0.35) * 8), 3)


def compute_alpha_estimate(features: dict, risk_score: float) -> float:
    """
    α = σ(v1·ρ + v2·trail_depth + v3·links + v4·device_evidence + v5·flags)
    Layer 2A stub — sigmoid estimator from weights.toml.
    """
    v = get_weights()["layer2"]["alpha_estimator"]
    raw = (
        v["v1_risk_score"] * risk_score
        + v["v2_trail_depth"] * min(features.get("trail_depth", 0) / 5.0, 1.0)
        + v["v3_cross_links"] * min(features.get("cross_account_links", 0) / 5.0, 1.0)
        + v["v4_device_evidence"] * features.get("device_mismatch", 0)
        + v["v5_prior_flags"] * min(features.get("prior_flags", 0) / 3.0, 1.0)
    )
    return round(sigmoid((raw - 0.25) * 6), 3)


# ═══════════════════════════════════════════════════════════════
# CORE GAME THEORY FORMULAS
# ═══════════════════════════════════════════════════════════════

def compute_q_star(G: float, alpha: float, P_caught: float, P_escaped: float,
                   utility_multiplier: float = 1.0) -> float:
    """q* = G·m / [α·P_caught + (1−α)·P_escaped]"""
    effective_gain = G * utility_multiplier
    denom = alpha * P_caught + (1 - alpha) * P_escaped
    if denom == 0:
        return 1.0
    return max(0.0, min(1.0, effective_gain / denom))


def compute_e_cheat(q: float, G: float, alpha: float, P_caught: float,
                    P_escaped: float, utility_multiplier: float = 1.0) -> float:
    """E[cheat] = (1−q)·G·m − q·[α·P_caught + (1−α)·P_escaped]"""
    effective_gain = G * utility_multiplier
    effective_penalty = alpha * P_caught + (1 - alpha) * P_escaped
    return (1 - q) * effective_gain - q * effective_penalty


def compute_safety_margin(e_cheat: float, G: float, utility_multiplier: float = 1.0) -> float:
    """margin = E[cheat] / (G·m)"""
    denom = G * utility_multiplier
    return e_cheat / denom if denom != 0 else 0.0


def get_deterrence_regime(q: float, q_star: float, threshold: float = 0.5) -> str:
    """Determine deterrence regime: full, partial, or none."""
    if q >= q_star:
        return "full"
    if q >= q_star * threshold:
        return "partial"
    return "none"


def compute_type_kpis(type_id: str, q: float, G: float, alpha: float,
                      P_caught: float, P_escaped: float,
                      partial_threshold: float = 0.5) -> dict:
    """Compute all KPIs for a single fraudster type."""
    ftype = FRAUDSTER_TYPES[type_id]
    m = ftype["utility_multiplier"]
    q_star = compute_q_star(G, alpha, P_caught, P_escaped, m)
    e_cheat = compute_e_cheat(q, G, alpha, P_caught, P_escaped, m)
    margin = compute_safety_margin(e_cheat, G, m)
    regime = get_deterrence_regime(q, q_star, partial_threshold)
    return {
        "type_id": type_id,
        "type_name": ftype["name"],
        "q_star": round(q_star, 4),
        "e_cheat": round(e_cheat, 2),
        "margin": round(margin, 4),
        "regime": regime,
        "utility_multiplier": m,
    }


# ═══════════════════════════════════════════════════════════════
# LAYER 2C — Leader Election (Task 12)
# ═══════════════════════════════════════════════════════════════

def elect_leader(transaction: dict, agent_priors: dict) -> dict:
    """
    Leader = argmax_i [spec_i · feat_vec(t)] · accuracy_i

    Uses spec_vec from agents.toml and accuracy from Thompson Sampling Beta posterior.
    Feature vector: [amount_anomaly, velocity, graph/coalition, device_geo, history/risk]
    """
    agents = get_agents()
    features = transaction.get("features", {})

    # Build feature vector matching spec_vec dims
    feat_vec = np.array([
        features.get("amount_zscore", 0),
        features.get("velocity", 0),
        1.0 if transaction.get("coalition_id") else features.get("device_mismatch", 0),
        features.get("geo_anomaly", 0),
        transaction.get("risk_score", 0),
    ])

    best_score = -1.0
    leader_id = None
    leader_data = None
    all_scores = {}

    for agent_id, agent in agents.items():
        spec_vec = np.array(agent["spec_vec"])
        dot_product = float(np.dot(spec_vec, feat_vec))

        # Accuracy from Thompson Sampling Beta posterior
        prior = agent_priors.get(agent_id, {"alpha": 1.0, "beta": 1.0})
        accuracy = prior["alpha"] / (prior["alpha"] + prior["beta"])

        score = dot_product * accuracy
        all_scores[agent_id] = round(score, 4)

        if score > best_score:
            best_score = score
            leader_id = agent_id
            leader_data = agent

    # Determine dominant feature
    feat_names = ["amount_anomaly", "velocity", "graph", "device_geo", "risk_score"]
    dominant_idx = int(np.argmax(feat_vec))
    dominant_feature = feat_names[dominant_idx] if dominant_idx < len(feat_names) else "unknown"

    return {
        "leader_id": leader_id,
        "leader": leader_data,
        "score": round(best_score, 4),
        "all_scores": all_scores,
        "dominant_feature": dominant_feature,
    }


# ═══════════════════════════════════════════════════════════════
# LAYER 3 — Correlated Equilibrium Mediator LP (Task 13)
# ═══════════════════════════════════════════════════════════════

def compute_ce_allocation(
    transactions: list[dict],
    k: int,
    G: float,
    alpha: float,
    P_caught: float,
    P_escaped: float,
) -> dict:
    """
    Solve the Correlated Equilibrium mediator LP.

    Minimize total expected fraud loss subject to:
      1. Budget constraint: Σ x_i ≤ k
      2. IC constraints: E[cheat | audited] ≤ 0 for each type
      3. 0 ≤ x_i ≤ 1

    Returns audit probability allocation per transaction.
    """
    n = len(transactions)
    if n == 0:
        return {"allocations": [], "ic_satisfied": True}

    # Objective: minimize negative deterrence value (maximize deterrence)
    # c_i = -risk_score_i (higher risk → more value in auditing)
    c = np.array([-t["risk_score"] for t in transactions])

    # Budget constraint: Σ x_i ≤ k
    A_ub = [np.ones(n)]
    b_ub = [float(k)]

    # IC constraints per type: expected payoff from cheating must be ≤ 0
    # For each type, sum of allocated audit over type's transactions must
    # make E[cheat] ≤ 0 for that type group
    for type_id, ftype in FRAUDSTER_TYPES.items():
        type_indices = [i for i, t in enumerate(transactions) if t["type_id"] == type_id]
        if not type_indices:
            continue

        m = ftype["utility_multiplier"]
        n_type = len(type_indices)

        # IC: the effective audit rate over this type's txns must ≥ q*
        q_star = compute_q_star(G, alpha, P_caught, P_escaped, m)

        # Constraint: -Σ x_i (for type) ≤ -q_star * n_type
        # i.e., Σ x_i ≥ q_star * n_type (audit enough to deter this type)
        row = np.zeros(n)
        for idx in type_indices:
            row[idx] = -1.0
        A_ub.append(row)
        b_ub.append(-q_star * n_type)

    A_ub = np.array(A_ub)
    b_ub = np.array(b_ub)
    bounds = [(0.0, 1.0)] * n

    try:
        result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
        if result.success:
            allocations = [round(float(x), 4) for x in result.x]
            # Check IC: all type groups have sufficient audit coverage
            ic_satisfied = True
            for type_id, ftype in FRAUDSTER_TYPES.items():
                type_indices = [i for i, t in enumerate(transactions) if t["type_id"] == type_id]
                if not type_indices:
                    continue
                type_alloc = sum(allocations[i] for i in type_indices)
                q_eff = type_alloc / len(type_indices) if type_indices else 0
                q_star = compute_q_star(G, alpha, P_caught, P_escaped, ftype["utility_multiplier"])
                if q_eff < q_star * 0.95:  # 5% tolerance
                    ic_satisfied = False
                    break
            return {"allocations": allocations, "ic_satisfied": ic_satisfied}
        else:
            # Fallback: proportional to risk score
            return _fallback_allocation(transactions, k)
    except Exception:
        return _fallback_allocation(transactions, k)


def _fallback_allocation(transactions: list[dict], k: int) -> dict:
    """Fallback allocation proportional to risk score."""
    total_risk = sum(t["risk_score"] for t in transactions)
    if total_risk == 0:
        alloc = [k / len(transactions)] * len(transactions)
    else:
        alloc = [t["risk_score"] / total_risk * k for t in transactions]
    return {
        "allocations": [round(min(1.0, a), 4) for a in alloc],
        "ic_satisfied": False,
    }


# ═══════════════════════════════════════════════════════════════
# LAYER 4A — Stackelberg LP (Task 14)
# ═══════════════════════════════════════════════════════════════

def compute_stackelberg_strategy(
    N: int,
    k: int,
    G: float,
    alpha: float,
    P_caught: float,
    P_escaped: float,
) -> dict:
    """
    Compute the auditor's optimal mixed strategy in the Stackelberg game.

    The auditor (leader) commits to an audit rate q.
    Each fraudster type (follower) best-responds to q.

    We solve: maximize welfare subject to budget = k/N and deterrence constraints.

    Returns optimal q and type-specific deterrence outcomes.
    """
    q = k / N
    type_results = {}

    for type_id, ftype in FRAUDSTER_TYPES.items():
        m = ftype["utility_multiplier"]
        q_star = compute_q_star(G, alpha, P_caught, P_escaped, m)
        e_cheat = compute_e_cheat(q, G, alpha, P_caught, P_escaped, m)
        margin = compute_safety_margin(e_cheat, G, m)
        regime = get_deterrence_regime(q, q_star)

        # Fraudster best response: cheat if E[cheat] > 0
        best_response = "cheat" if e_cheat > 0 else "not_cheat"

        type_results[type_id] = {
            "q_star": round(q_star, 4),
            "e_cheat": round(e_cheat, 2),
            "margin": round(margin, 4),
            "regime": regime,
            "best_response": best_response,
        }

    # Compute optimal q via LP over type weights
    # Minimize total fraud: for each type, fraud probability = 1 if q < q*, 0 otherwise
    # This is a step function, so we enumerate critical points
    q_stars = sorted(set(
        compute_q_star(G, alpha, P_caught, P_escaped, FRAUDSTER_TYPES[tid]["utility_multiplier"])
        for tid in FRAUDSTER_TYPES
    ))

    # At each critical q*, one more type gets deterred
    # Find the q that maximises welfare = types deterred, given budget constraint
    optimal_q = q
    best_welfare = 0
    for candidate_q in q_stars:
        if candidate_q > 1.0:
            continue
        deterred = sum(
            1 for tid in FRAUDSTER_TYPES
            if compute_q_star(G, alpha, P_caught, P_escaped, FRAUDSTER_TYPES[tid]["utility_multiplier"]) <= candidate_q
        )
        if deterred > best_welfare and candidate_q <= q + 0.01:  # within budget tolerance
            best_welfare = deterred
            optimal_q = candidate_q

    return {
        "committed_q": round(q, 4),
        "optimal_q": round(optimal_q, 4),
        "type_results": type_results,
        "total_deterred": sum(1 for r in type_results.values() if r["regime"] == "full"),
    }


# ═══════════════════════════════════════════════════════════════
# LAYER 4B — Shapley Values (Task 15)
# ═══════════════════════════════════════════════════════════════

def compute_shapley_values(coalition_members: list[dict]) -> list[dict]:
    """
    Exact Shapley value computation.

    φᵢ(v) = Σ_{S ⊆ N\\{i}} [|S|!(n−|S|−1)!/n!] · [v(S∪{i}) − v(S)]

    Value function v(S) = total risk of coalition subset,
    with subadditivity (β_synergy < 1 means diminishing returns).
    """
    n = len(coalition_members)
    if n == 0:
        return []
    if n == 1:
        coalition_members[0]["shapley_value"] = 1.0
        coalition_members[0]["is_keystone"] = True
        return coalition_members

    # Value function: v(S) = β^(|S|-1) * Σ risk_scores in S
    # Subadditivity makes adding more members slightly less valuable
    from .config_loader import get_simulation_defaults
    try:
        beta = get_simulation_defaults()["deterrence"]["beta_synergy"]
    except (KeyError, TypeError):
        beta = 0.7

    def value(subset_indices: frozenset) -> float:
        if not subset_indices:
            return 0.0
        total = sum(coalition_members[i]["risk_score"] for i in subset_indices)
        return total * (beta ** (len(subset_indices) - 1))

    # Compute Shapley for each player
    all_indices = set(range(n))
    shapley_vals = []

    for i in range(n):
        phi_i = 0.0
        others = all_indices - {i}

        for s_size in range(0, n):
            for subset in combinations(others, s_size):
                S = frozenset(subset)
                S_with_i = S | {i}
                marginal = value(S_with_i) - value(S)
                weight = (math.factorial(s_size) * math.factorial(n - s_size - 1)) / math.factorial(n)
                phi_i += weight * marginal

        shapley_vals.append(round(phi_i, 4))

    # Normalise
    total_shapley = sum(shapley_vals) if sum(shapley_vals) > 0 else 1.0
    for i, member in enumerate(coalition_members):
        member["shapley_value"] = round(shapley_vals[i] / total_shapley, 4)

    # Mark keystone (highest Shapley value)
    max_idx = shapley_vals.index(max(shapley_vals))
    for i, member in enumerate(coalition_members):
        member["is_keystone"] = (i == max_idx)

    return coalition_members


# ═══════════════════════════════════════════════════════════════
# LAYER 5 — Thompson Sampling (Task 16)
# ═══════════════════════════════════════════════════════════════

class ThompsonSamplingBandit:
    """
    Thompson Sampling bandit for selecting audit strategy arms.

    Each arm corresponds to an audit strategy (e.g., high_risk_score, coalition_keystone).
    The bandit learns which strategy produces the best fraud detection rate.
    """

    def __init__(self, agent_priors: Optional[dict] = None):
        bandit_cfg = get_bandit_config()
        self.initial_alpha = bandit_cfg["bandit"]["initial_alpha"]
        self.initial_beta = bandit_cfg["bandit"]["initial_beta"]
        self.arm_names = bandit_cfg["arms"]["names"]

        # Initialize arm priors
        self.arms = {}
        for arm in self.arm_names:
            if agent_priors and arm in agent_priors:
                self.arms[arm] = {
                    "alpha": agent_priors[arm].get("alpha", self.initial_alpha),
                    "beta": agent_priors[arm].get("beta", self.initial_beta),
                    "pulls": agent_priors[arm].get("pulls", 0),
                }
            else:
                self.arms[arm] = {
                    "alpha": self.initial_alpha,
                    "beta": self.initial_beta,
                    "pulls": 0,
                }

    def select_arm(self) -> str:
        """Sample from each arm's Beta posterior and select the best."""
        samples = {}
        for arm_name, arm in self.arms.items():
            samples[arm_name] = np.random.beta(arm["alpha"], arm["beta"])
        return max(samples, key=samples.get)

    def update(self, arm_name: str, reward: float):
        """Update the selected arm with the observed reward (0 or 1)."""
        if arm_name not in self.arms:
            return
        if reward > 0.5:
            self.arms[arm_name]["alpha"] += 1
        else:
            self.arms[arm_name]["beta"] += 1
        self.arms[arm_name]["pulls"] += 1

    def get_arm_stats(self) -> dict:
        """Return current arm statistics."""
        stats = {}
        for arm_name, arm in self.arms.items():
            stats[arm_name] = {
                "alpha": arm["alpha"],
                "beta": arm["beta"],
                "pulls": arm["pulls"],
                "mean": round(arm["alpha"] / (arm["alpha"] + arm["beta"]), 4),
            }
        return stats

    def get_state(self) -> dict:
        """Serializable state for persistence."""
        return {arm: {**data} for arm, data in self.arms.items()}


# ═══════════════════════════════════════════════════════════════
# LAYER 5 EXTENSION — Agent Thompson Sampling
# ═══════════════════════════════════════════════════════════════

def update_agent_priors(
    agent_priors: dict,
    leader_id: str,
    was_correct: bool,
) -> dict:
    """
    Update the agent's Beta posterior after a round.
    Correct prediction → alpha += 1, wrong → beta += 1.
    """
    if leader_id not in agent_priors:
        agent_priors[leader_id] = {"alpha": 1.0, "beta": 1.0, "rounds_led": 0}

    if was_correct:
        agent_priors[leader_id]["alpha"] += 1
    else:
        agent_priors[leader_id]["beta"] += 1
    agent_priors[leader_id]["rounds_led"] += 1

    return agent_priors


# ═══════════════════════════════════════════════════════════════
# FICTITIOUS PLAY — Belief Update (Task 17)
# ═══════════════════════════════════════════════════════════════

def update_fraudster_belief(
    prev_belief: float,
    current_audit_rate: float,
    round_number: int,
) -> dict:
    """
    Fraudster belief update via fictitious play averaging.

    q̂_T = (1/T) · Σ_{t=1}^{T} (audits_t / N)

    The fraudster observes the audit rate each round and averages.
    """
    if round_number <= 1:
        new_belief = current_audit_rate
    else:
        # Running average
        new_belief = (prev_belief * (round_number - 1) + current_audit_rate) / round_number

    return {
        "belief": round(new_belief, 4),
        "gap": round(abs(current_audit_rate - new_belief), 4),
    }


# ═══════════════════════════════════════════════════════════════
# BEST RESPONSE CURVES — For visualisation
# ═══════════════════════════════════════════════════════════════

def compute_best_response_curves(
    G: float, alpha: float, P_caught: float, P_escaped: float,
    steps: int = 100,
) -> list[dict]:
    """Generate best response curve data for all fraudster types."""
    points = []
    for q_int in range(steps + 1):
        q = q_int / steps
        row = {"q": round(q, 4)}
        for type_id, ftype in FRAUDSTER_TYPES.items():
            row[type_id] = round(
                compute_e_cheat(q, G, alpha, P_caught, P_escaped, ftype["utility_multiplier"]),
                2,
            )
        points.append(row)
    return points
