"""
NashAudit — Multi-Round Rapid Simulation Runner
Runs 15 rounds rapidly and shows KPI progression to demonstrate
dynamic data changes in the frontend.

Usage:
  python run_multi_round_simulation.py
"""

import sys
import json
import time
import httpx
from pathlib import Path

# Add backend module to path
sys.path.insert(0, str(Path(__file__).parent))

def run_simulation():
    """Create a simulation and run 15 rounds, printing progress."""
    BASE_URL = "http://127.0.0.1:8000"
    
    print("\n" + "="*70)
    print("NashAudit Multi-Round Simulation Runner")
    print("="*70 + "\n")
    
    # Create simulation with varied parameters
    create_req = {
        "N": 500,
        "k": 100,
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
    
    print("[1/2] Creating simulation...")
    with httpx.Client(timeout=30) as client:
        resp = client.post(f"{BASE_URL}/simulation/create", json=create_req)
        sim_data = resp.json()
        sim_id = sim_data["simulation_id"]
        print(f"✓ Simulation created: {sim_id}\n")
        
        # Run 15 rounds
        print("[2/2] Running 15 simulation rounds...")
        print("-" * 70)
        print(f"{'Round':<8} {'Belief':<12} {'Gap':<12} {'Attempts':<12} {'Caught':<12} {'Regret':<12}")
        print("-" * 70)
        
        for round_num in range(1, 16):
            try:
                start = time.time()
                resp = client.post(f"{BASE_URL}/round/execute/{sim_id}")
                elapsed = time.time() - start
                
                round_data = resp.json()
                
                belief = round_data.get("fraudster_belief", 0)
                gap = round_data.get("credibility_gap", 0)
                attempts = round_data.get("fraud_attempts", 0)
                caught = round_data.get("fraud_caught", 0)
                regret = round_data.get("round_regret", 0)
                
                print(
                    f"{round_num:<8} "
                    f"{belief:<12.4f} "
                    f"{gap:<12.4f} "
                    f"{attempts:<12} "
                    f"{caught:<12} "
                    f"{regret:<12.2f}"
                )
                
                time.sleep(0.5)  # Brief pause between rounds
                
            except Exception as e:
                print(f"✗ Round {round_num} failed: {e}")
                break
        
        print("-" * 70)
        
        # Fetch final results
        print(f"\n[3/3] Fetching final simulation state...")
        resp = client.get(f"{BASE_URL}/round/{sim_id}/history")
        history = resp.json()
        
        total_rounds = len(history["rounds"])
        print(f"✓ Completed {total_rounds} rounds\n")
        
        # Show belief convergence over all rounds
        print("Belief Convergence (Fraudster Learning):")
        print("-" * 70)
        beliefs = [r.get("fraudster_belief", 0) for r in history["rounds"]]
        for i, b in enumerate(beliefs, 1):
            bar_len = int(b * 50)
            bar = "█" * bar_len + "░" * (50 - bar_len)
            print(f"Round {i:2d}: {bar} {b:.4f}")
        
        print("\n" + "="*70)
        print(f"Simulation ID: {sim_id}")
        print("Open http://localhost:5173 and select this simulation to view live")
        print("="*70 + "\n")


if __name__ == "__main__":
    try:
        run_simulation()
    except KeyboardInterrupt:
        print("\n\nSimulation interrupted by user.")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        sys.exit(1)
