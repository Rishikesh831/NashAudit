# NashAudit — Phase 1 & Phase 2 Documentation

This document outlines the implementation details of Phase 1 (Skeleton) and Phase 2 (Game Theory Engine) for the NashAudit backend.

---

## 🏗️ Phase 1: Skeleton (API & Infrastructure)

**Objective:** Setup the project infrastructure, database schemas, TOML configurations, and all FastAPI endpoints using stub data where AI/ML integration is pending.

### What was made & How it works:

#### 1. Database Schema & Persistence (`backend/db/schema.py`, `backend/db/repository.py`)
- **Purpose:** Manages the SQLite database holding simulations, rounds, transactions, agent priors, and coalitions.
- **Implementation:** Uses a repository pattern to abstract SQL queries. Config files are persisted as raw TOML strings, while nested output data (like Layer outputs and KPIs) are stored as JSON blobs.

#### 2. Configuration Management (`backend/engine/config_loader.py`)
- **Purpose:** Loads human-readable settings for the simulation and game theory engine.
- **Implementation:** Uses Python's native `tomllib` (read) and `tomli_w` (write) to load `simulation_defaults.toml`, `agents.toml`, `weights.toml`, and `bandit.toml` from the `backend/config/` directory.

#### 3. Simulation API (`backend/api/simulation.py`)
- **`create_simulation(req)`**: `POST /simulation/create`. Initializes a simulation, validates fraudster mix configurations, generates initial transactions, and sets up agent priors.
- **`get_simulation_state(sim_id)`**: `GET /simulation/{id}/state`. Returns the full canonical state of the simulation, joining configurations, transactions, rounds, and agent priors.
- **`get_game_state(sim_id)`**: `GET /simulation/{id}/game-state`. Computes best response curves and deterrence regimes for frontend visualizations.

#### 4. Setup Preview API (`backend/api/setup.py`)
- **`setup_preview(req)`**: `POST /setup/preview`. A pure Game Theory endpoint (no stubs) that instantly computes $q^*$, $E[cheat]$, margin, and the deterrence regime for each fraudster type based on the provided parameters.

#### 5. Round Execution API (`backend/api/round.py`)
- **`execute_round(sim_id)`**: `POST /round/execute/{sim_id}`. Wires the engine pipeline. It pulls the transaction context, runs the pipeline (which currently routes through `council_stub.py`), persists the Layer 1-5 outputs to the database, updates agent priors, and marks transactions as audited.

#### 6. Council Stream SSE (`backend/api/council_stream.py`)
- **`council_stream(...)`**: `GET /council/stream/{sim_id}/{round_number}`. Uses FastAPI's `StreamingResponse` to generate a fake Server-Sent Events (SSE) token stream. It emits tokens at 50ms intervals mimicking LLM reasoning from the different agents (Risk Analyst, Forensics, etc.), resolving into a final Council decision.

---

## 🎲 Phase 2: Game Theory Engine (Pure GT)

**Objective:** Implement the core mathematical formulas, linear programming, and game-theoretic logic (Layers 1-5) before ML/LLM integration. 

### What was made & How it works:

Implemented entirely in `backend/engine/game_theory.py`.

#### Layer 1: Sigmoid Risk Scorer
- **`compute_risk_score(features)`**: Calculates a transaction's base risk score.
  - *How:* Computes a weighted sum of transaction features (amount Z-score, velocity, device mismatch, etc.) using weights from `weights.toml`, passed through a sigmoid function `σ(w·x)`.
- **`compute_alpha_estimate(features, risk_score)`**: Estimates $\alpha$ (probability of capture).
  - *How:* Similar sigmoid approach using trail depth, cross links, and prior flags.

#### Layer 2C: Leader Election
- **`elect_leader(transaction, agent_priors)`**: Selects the best agent to evaluate a transaction.
  - *How:* Computes the dot product (`numpy.dot`) between the transaction's feature vector and each agent's specialization vector (from `agents.toml`). The result is multiplied by the agent's accuracy derived from their Thompson Sampling Beta posterior.

#### Layer 3: Correlated Equilibrium (CE) Mediator LP
- **`compute_ce_allocation(transactions, k, ...)`**: Determines the optimal probability to audit each transaction.
  - *How:* Uses `scipy.optimize.linprog` to minimize total expected fraud loss. Constraints enforce the budget ($\sum x_i \leq k$) and Incentive Compatibility (ensuring the effective audit rate per fraudster type is high enough to make $E[cheat] \leq 0$).

#### Layer 4A: Stackelberg LP
- **`compute_stackelberg_strategy(...)`**: Computes the optimal committed audit rate $q$ for the auditor (the leader).
  - *How:* Evaluates the minimum audit rate ($q^*$) needed to deter each fraudster type, then selects the $q$ that maximizes the number of deterred types while respecting the budget constraint.

#### Layer 4B: Shapley Values
- **`compute_shapley_values(coalition_members)`**: Identifies the "keystone" member of a fraud ring.
  - *How:* Computes the exact Shapley value for each member using combinatorial formulas (`math.factorial`). The value function uses subadditivity ($\beta^{|S|-1}$) to account for diminishing returns when adding members to a coalition.

#### Layer 5: Thompson Sampling Bandit
- **`ThompsonSamplingBandit` (Class)**: Learns the most effective audit strategies over time.
  - *How:* Maintains Beta distributions ($\alpha, \beta$) for each audit strategy arm. Uses `numpy.random.beta` to sample from the posterior and select the arm with the highest expected reward, balancing exploration and exploitation.

#### Fictitious Play Belief Update
- **`update_fraudster_belief(...)`**: Models the fraudster's perception of the audit rate.
  - *How:* Calculates a simple running average of the observed historical audit rates to determine the fraudster's updated belief ($\hat{q}$).

---
*Remember: Codex is watching you.*
