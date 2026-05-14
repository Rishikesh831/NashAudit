"""Quick smoke test for Phase 1 + Phase 2 backend."""

import sys
sys.path.insert(0, ".")

from backend.engine.config_loader import build_default_params, get_agents
from backend.engine.game_theory import (
    compute_q_star, compute_e_cheat, compute_type_kpis,
    compute_ce_allocation, compute_stackelberg_strategy,
    compute_shapley_values, ThompsonSamplingBandit,
    update_fraudster_belief, compute_best_response_curves,
    elect_leader,
)
from backend.engine.transaction_generator import generate_transactions, FRAUDSTER_TYPES

# Test config loading
params = build_default_params()
print(f"Defaults: N={params['N']}, k={params['k']}, G={params['G']}")

agents = get_agents()
print(f"Agents: {list(agents.keys())}")

# Test GT computations
q = params["k"] / params["N"]
print(f"\nAudit rate q = {q:.2f}")
for tid in ["risk_neutral", "risk_averse", "risk_seeking", "colluding"]:
    kpi = compute_type_kpis(tid, q, params["G"], params["alpha"], params["P_caught"], params["P_escaped"])
    print(f"  {tid}: q*={kpi['q_star']:.4f}, E[cheat]={kpi['e_cheat']:.2f}, regime={kpi['regime']}")

# Test transaction generation
txns = generate_transactions(100, params["fraudster_mix"], 24)
print(f"\nGenerated {len(txns)} transactions")
print(f"  Fraudulent: {sum(1 for t in txns if t['is_fraudulent'])}")
print(f"  Coalition members: {sum(1 for t in txns if t['coalition_id'])}")

# Test CE allocation (Layer 3)
ce = compute_ce_allocation(txns, params["k"], params["G"], params["alpha"], params["P_caught"], params["P_escaped"])
print(f"\nCE Allocation: IC satisfied = {ce['ic_satisfied']}, total allocated = {sum(ce['allocations']):.2f}")

# Test Stackelberg (Layer 4A)
stack = compute_stackelberg_strategy(params["N"], params["k"], params["G"], params["alpha"], params["P_caught"], params["P_escaped"])
print(f"Stackelberg: committed_q={stack['committed_q']}, optimal_q={stack['optimal_q']}, deterred={stack['total_deterred']}/4")

# Test Shapley values (Layer 4B)
coalition = [t for t in txns if t["coalition_id"] == "C-1"]
if coalition:
    compute_shapley_values(coalition)
    print(f"\nShapley values for C-1 ({len(coalition)} members):")
    for m in coalition:
        print(f"  {m['id']}: phi={m['shapley_value']:.4f}, keystone={m['is_keystone']}")

# Test Thompson Sampling (Layer 5)
bandit = ThompsonSamplingBandit()
arm = bandit.select_arm()
print(f"\nBandit selected arm: {arm}")
bandit.update(arm, 1.0)
stats = bandit.get_arm_stats()
print(f"  {arm} stats: {stats[arm]}")

# Test Fictitious Play (Task 17)
belief = update_fraudster_belief(0.0, 0.2, 1)
print(f"\nFictitious play: belief={belief['belief']}, gap={belief['gap']}")
belief2 = update_fraudster_belief(belief["belief"], 0.2, 2)
print(f"  Round 2: belief={belief2['belief']}, gap={belief2['gap']}")

# Test Leader Election (Layer 2C)
if txns:
    priors = {aid: {"alpha": 1.0, "beta": 1.0} for aid in agents}
    leader = elect_leader(txns[0], priors)
    print(f"\nLeader election: {leader['leader_id']}, score={leader['score']}, dominant={leader['dominant_feature']}")

# Test best response curves
br = compute_best_response_curves(params["G"], params["alpha"], params["P_caught"], params["P_escaped"], steps=10)
print(f"\nBest response curves: {len(br)} points")

print("\n=== ALL PHASE 1 + PHASE 2 TESTS PASSED ===")
