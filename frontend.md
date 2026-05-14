# NashAudit Frontend Documentation

This document describes the purpose of all frontend pages in the NashAudit application and the data inputs they require from the backend / ML systems.

## Overview of Pages

The frontend consists of 5 main pages that guide the user through setting up a simulation, visualising the game-theoretic engine, observing the multi-agent council deliberations, reviewing the operational audit outputs, and finally comparing strategies.

---

### 1. Simulation Setup (`SimulationSetup.jsx`)
**Purpose:** 
The entry point for configuring the Bayesian Stackelberg game parameters. Users can adjust transaction batch size ($N$), audit budget ($k$), fraudster population mix, and game parameters (Fraud Gain $G$, Penalties, Capture Probability $\alpha$). It features a "Live Deterrence Preview" that updates in real-time to show $q^*$ thresholds, Deterrence Regimes, $E[cheat]$, and safety margins.

**Inputs Required from Backend/ML:**
*   **Data Ingestion API:** Endpoints to either generate synthetic transaction data based on parameters or to handle CSV uploads for real-world transaction batches.
*   *Note: Currently, calculations like $q^*$ and $E[cheat]$ are computed locally on the client, but for a full deployment, parameter validation and initial state setup might be synced with the backend.*

---

### 2. Game Visualiser (`GameVisualiser.jsx`)
**Purpose:**
Real-time visualisation of the game theory execution. It displays Best Response curves for different fraudster types, a Deterrence Distribution donut chart, a Payoff Heatmap (showing where fraud is rational vs irrational), and a Belief Convergence chart (Fraudster belief $\hat{q}$ vs Committed $q$). It also includes a live Rational Decision Table showing the status of each fraudster type.

**Inputs Required from Backend/ML:**
*   **Round-by-Round State:** The backend must provide the simulation state for each round, including:
    *   $E[cheat]$, $q^*$, safety margins, and deterrence regimes per fraudster type.
    *   System-wide KPIs: `fraudAttempts`, `fraudCaught`, Deterrence Efficiency Ratio (`DER`), and IC (Incentive Compatibility) constraint satisfaction.
    *   Fictitious play data: `fraudsterBelief` and the `credibilityGap`.

---

### 3. Council Chamber (`CouncilChamber.jsx`)
**Purpose:**
Visualises the deliberative multi-agent LLM council in action. It shows which agent was elected as the leader (based on Thompson Sampling and feature matching), the consensus score among the 5 agents, and a detailed "Debate Log" showing Round 1 (initial positions) and Round 2 (deliberations and position changes). It also tracks Agent Accuracy and Leadership Frequency.

**Inputs Required from Backend/ML:**
*   **LLM Deliberation Logs:** The ML backend must provide detailed structured output for the multi-agent deliberation process for each audited transaction:
    *   `leader` (the agent chosen to lead), `leaderScore`, and `dominantFeature`.
    *   Consensus metrics: number of `agreeing` agents and a list of `dissenters`.
    *   Detailed chat logs for `round1` and `round2` containing each agent's `position` (e.g., AUDIT, PASS) and their natural language `reasoning`.
*   **Agent Priors:** Current Beta distribution parameters ($\alpha$, $\beta$) for each agent to calculate and display their accuracy over time.

---

### 4. Audit Output (`AuditOutput.jsx`)
**Purpose:**
Displays the operational decisions of the system—what gets audited and why. It features top-level KPIs (DER, IC Constraint, Budget Utilisation) and a detailed table of selected transactions. Users can expand rows to see a "SAR (Suspicious Activity Report) Rationale Block". It also renders a force-directed Coalition Network graph showing colluding nodes based on Shapley values.

**Inputs Required from Backend/ML:**
*   **Audit Decisions:** A list of transactions chosen for audit, enriched with:
    *   Risk scores ($\rho$) and estimated fraudster type.
    *   **Cooperative Game Theory Outputs:** `coalitionId`, `shapleyValue` ($\phi_i$), and a boolean flag `isKeystone` indicating if the transaction is a coalition ringleader.
    *   The final decision rationale linking back to the council leader and deterrence regimes.

---

### 5. Strategy Comparison (`StrategyComparison.jsx`)
**Purpose:**
The final reporting page that compares the NashAudit strategy against a naive baseline (Random Audit) and a Nash-optimal LP. It visualises Fraud Volume Over Rounds, Bilateral Learning Convergence, Cumulative Bandit Regret, and Safety Margin Trajectories. It highlights the "Nash Welfare Gain" and allows downloading a generated game-theoretic certification report.

**Inputs Required from Backend/ML:**
*   **Comparative Baseline Data:** To render the comparison charts, the backend needs to provide simulated outcomes of alternative strategies alongside the NashAudit results:
    *   Fraud attempts under `randomFraud` and `nashOptimalFraud`.
    *   `cumulativeRegret` over rounds to plot against the theoretical $O(\sqrt{T \log T})$ bound.
    *   Final verification flags for the report: $E[cheat] \le 0$ status, IC satisfaction, and convergence round number.
