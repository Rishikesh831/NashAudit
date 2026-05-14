"""End-to-end API test: create simulation, run round, verify outputs."""
import requests
import json

BASE = "http://localhost:8000"

# 1. Health check
r = requests.get(f"{BASE}/")
assert r.status_code == 200
data = r.json()
assert data["service"] == "NashAudit"
print(f"[1] Root OK: {data}")

# 2. Defaults
r = requests.get(f"{BASE}/setup/defaults")
assert r.status_code == 200
defaults = r.json()
print(f"[2] Defaults: N={defaults['N']}, k={defaults['k']}, G={defaults['G']}")

# 3. Setup preview
r = requests.post(f"{BASE}/setup/preview", json={"N": 500, "k": 100, "G": 10000, "P_caught": 50000, "P_escaped": 5000, "alpha": 0.65})
assert r.status_code == 200
preview = r.json()
print(f"[3] Preview: q={preview['q']}, full_deterred={preview['full_deterred']}/{preview['total_types']}")
for kpi in preview["type_kpis"]:
    print(f"    {kpi['type_name']}: q*={kpi['q_star']}, E[cheat]={kpi['e_cheat']}, regime={kpi['regime']}")

# 4. Create simulation
r = requests.post(f"{BASE}/simulation/create", json={
    "N": 200, "k": 50, "G": 10000, "P_caught": 50000, "P_escaped": 5000, "alpha": 0.65,
    "fraudster_mix": {"risk_neutral": 0.30, "risk_averse": 0.25, "risk_seeking": 0.20, "colluding": 0.25}
})
assert r.status_code == 200
sim = r.json()
sim_id = sim["simulation_id"]
print(f"[4] Created simulation: {sim_id}, txns={sim['transaction_count']}")

# 5. Run a round
r = requests.post(f"{BASE}/round/execute/{sim_id}")
assert r.status_code == 200
round_data = r.json()
print(f"[5] Round {round_data['round_number']}: fraud_attempts={round_data['fraud_attempts']}, caught={round_data['fraud_caught']}")
print(f"    DER={round_data['DER']}, IC={round_data['ic_satisfied']}, deterred={round_data['full_deterred']}/4")
print(f"    Fraudster belief={round_data['fraudster_belief']}, gap={round_data['credibility_gap']}")

# 6. Run 2 more rounds
for _ in range(2):
    r = requests.post(f"{BASE}/round/execute/{sim_id}")
    assert r.status_code == 200

r = requests.get(f"{BASE}/round/{sim_id}/history")
assert r.status_code == 200
history = r.json()
print(f"[6] Ran 3 rounds total: {history['rounds'][-1]['round_number']} rounds")

# 7. Game state
r = requests.get(f"{BASE}/simulation/{sim_id}/game-state")
assert r.status_code == 200
gs = r.json()
print(f"[7] Game state: q={gs['q']}, belief points={len(gs['belief_convergence'])}")

# 8. Comparison
r = requests.get(f"{BASE}/simulation/{sim_id}/comparison")
assert r.status_code == 200
comp = r.json()
print(f"[8] Comparison: {comp['total_rounds']} rounds of data")

# 9. Full state
r = requests.get(f"{BASE}/simulation/{sim_id}/state")
assert r.status_code == 200
state = r.json()
print(f"[9] Full state: {len(state['transactions'])} txns, {state['current_round']} rounds")

print("\n=== ALL API TESTS PASSED ===")
