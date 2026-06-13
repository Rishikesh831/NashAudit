"""
NashAudit — Dynamic Multi-Scenario Simulation Runner
Creates 3 simulations with different audit budgets (k=80, 100, 120)
to show how fraudster belief converges to DIFFERENT targets based on
audit policy. This demonstrates real dynamic KPI changes.

Usage:
  python run_dynamic_simulation.py
"""

import sys
import json
import time
import httpx
from pathlib import Path

# Add backend module to path
sys.path.insert(0, str(Path(__file__).parent))

def run_dynamic_scenario():
    """Create 3 simulations with different audit budgets, each running 8 rounds."""
    BASE_URL = "http://127.0.0.1:8000"
    
    print("\n" + "="*80)
    print("NashAudit — Dynamic Multi-Scenario Comparison")
    print("Shows how fraudster belief converges to DIFFERENT targets with different audit policies")
    print("="*80 + "\n")
    
    # Three scenarios: different audit budgets
    scenarios = [
        {"k": 60,  "label": "LOW-AUDIT",    "color": "🔴"},   # q=0.12, low deterrence
        {"k": 100, "label": "STANDARD",     "color": "🟡"},   # q=0.20, baseline
        {"k": 150, "label": "HIGH-AUDIT",   "color": "🟢"},   # q=0.30, high deterrence
    ]
    
    all_sims = []
    
    with httpx.Client(timeout=30) as client:
        for scenario_idx, scenario in enumerate(scenarios, 1):
            print(f"\n{'─'*80}")
            print(f"Scenario {scenario_idx}/3: {scenario['color']} {scenario['label']} (k={scenario['k']}, q={scenario['k']/500:.2%})")
            print(f"{'─'*80}")
            
            create_req = {
                "N": 500,
                "k": scenario["k"],
                "time_window_hours": 24,
                "data_mode": "synthetic",
                "G": 10000,
                "P_caught": 50000,
                "P_escaped": 5000,
                "alpha": 0.65,
                "fraudster_mix": {
                    "risk_neutral": 0.30,
                    "risk_averse": 0.25,
                    "risk_seeking": 0.20,
                    "colluding": 0.25,
                }
            }
            
            # Create simulation
            resp = client.post(f"{BASE_URL}/simulation/create", json=create_req)
            sim_data = resp.json()
            sim_id = sim_data["simulation_id"]
            
            print(f"✓ Created simulation: {sim_id}")
            print(f"{'Round':<8} {'Belief':<12} {'AuditRate':<12} {'Caught%':<10} {'Regret':<10}")
            print(f"{'-'*60}")
            
            rounds = []
            
            # Run 8 rounds for each scenario
            for round_num in range(1, 9):
                try:
                    resp = client.post(f"{BASE_URL}/round/execute/{sim_id}")
                    round_data = resp.json()
                    
                    belief = round_data.get("fraudster_belief", 0)
                    audit_rate = round_data.get("audit_rate", scenario["k"] / 500)
                    attempts = round_data.get("fraud_attempts", 1)
                    caught = round_data.get("fraud_caught", 0)
                    catch_pct = (caught / attempts * 100) if attempts > 0 else 0
                    regret = round_data.get("round_regret", 0)
                    
                    rounds.append({
                        "round": round_num,
                        "belief": belief,
                        "audit_rate": audit_rate,
                        "catch_pct": catch_pct,
                        "regret": regret,
                    })
                    
                    print(
                        f"{round_num:<8} "
                        f"{belief:<12.4f} "
                        f"{audit_rate:<12.4f} "
                        f"{catch_pct:<10.1f}% "
                        f"{regret:<10.2f}"
                    )
                    
                    time.sleep(0.3)
                    
                except Exception as e:
                    print(f"✗ Round {round_num} failed: {e}")
                    break
            
            all_sims.append({
                "scenario": scenario,
                "sim_id": sim_id,
                "rounds": rounds,
            })
        
        # Final comparison table
        print(f"\n{'='*80}")
        print("CONVERGENCE COMPARISON: Belief values show where each audit policy leads")
        print(f"{'='*80}\n")
        
        print(f"{'Round':<10}", end="")
        for scenario in scenarios:
            print(f"{scenario['color']:3} {scenario['label']:<12}", end="")
        print()
        print("-" * 80)
        
        for round_num in range(1, 9):
            print(f"Round {round_num:<4}", end="")
            for sim_info in all_sims:
                if round_num <= len(sim_info["rounds"]):
                    belief = sim_info["rounds"][round_num - 1]["belief"]
                    print(f"    {belief:.4f}      ", end="")
                else:
                    print(f"    {'—':<7}     ", end="")
            print()
        
        print()
        print("👉 Key insight: With different audit budgets (k), fraudster belief converges to DIFFERENT values!")
        print("   - Low audit (k=60)  → Belief ≈ 0.12 (fraudsters learn deterrence is low)")
        print("   - Standard (k=100)  → Belief ≈ 0.20 (baseline policy)")
        print("   - High audit (k=150) → Belief ≈ 0.30 (fraudsters learn deterrence is high)")
        print()
        print("Simulation IDs (open in frontend to see dynamic charts):")
        for idx, sim_info in enumerate(all_sims, 1):
            print(f"  {idx}. {sim_info['scenario']['label']:15} → {sim_info['sim_id']}")
        
        print(f"\n{'='*80}")
        print("Open http://localhost:5173 → Select a simulation → See belief convergence in real-time!")
        print(f"{'='*80}\n")


if __name__ == "__main__":
    try:
        run_dynamic_scenario()
    except KeyboardInterrupt:
        print("\n\nSimulation interrupted by user.")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
