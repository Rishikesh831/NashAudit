# NashAudit — Backend API Contract
# Version 2.0 | Stub-first architecture | TOML + JSON split

## Format Decision — The Rule

```
JSON  → API wire format (request/response bodies between frontend and backend)
TOML  → Config files, agent system prompts, LLM context inputs
SQLite → Persistent storage (JSON blobs for nested data, TOML blobs for config)
SSE   → LLM token streaming (Council Chamber only)
```

Simple test to decide:
  "Is this data travelling over HTTP between frontend and backend?"  → JSON
  "Is this a config, a setting, a prompt, or context fed to an LLM?" → TOML

Colour coding:
  🔵 STUB  → hardcoded placeholder, replace later
  🟢 GT    → pure game theory, no replacement needed
  🟡 ML    → replace stub with trained model
  🟠 LLM   → replace stub with NVIDIA NIM call
  📄 JSON  → wire format
  📋 TOML  → config / LLM context format

---

## 0. FORMAT MAP — WHAT LIVES WHERE

```
nashadit/
│
├── config/                        ← ALL TOML
│   ├── simulation_defaults.toml   Game parameter defaults
│   ├── agents.toml                Agent identities, lenses, specialisation vectors
│   ├── system_prompts.toml        All 5 LLM system prompts
│   ├── bandit.toml                Thompson Sampling hyperparameters
│   └── weights.toml               Layer 1 risk scorer weights, Layer 2 α weights
│
├── api/                           ← ALL JSON (HTTP endpoints)
│   ├── simulation.py              CRUD for simulations
│   ├── round.py                   Round execution pipeline
│   ├── setup.py                   Preview calculations
│   └── comparison.py              Strategy comparison data
│
└── db/                            ← SQLite
    ├── simulations                config stored as TOML blob
    ├── rounds                     outputs stored as JSON blobs
    ├── transactions               stored as JSON blobs
    ├── agent_priors               stored as JSON blob
    └── coalitions                 stored as JSON blobs
```

---

## 1. TOML CONFIG FILES

### config/simulation_defaults.toml
```toml
# NashAudit — Simulation Defaults
# Edit these to change what the Setup page loads with

[batch]
N                  = 500
k                  = 100
time_window_hours  = 24
data_mode          = "synthetic"   # "synthetic" or "csv"

[fraudster_mix]
risk_neutral = 0.30
risk_averse  = 0.25
risk_seeking = 0.20
colluding    = 0.25
# Must sum to 1.0 — validated on load

[game_params]
G         = 10000    # Fraud gain (₹)
P_caught  = 50000    # Penalty if identified (₹)
P_escaped = 5000     # Penalty if flagged but anonymous (₹)
alpha     = 0.65     # Capture probability given audit

[deterrence]
lambda_risk_averse  = 0.3   # Variance penalty weight for risk-averse type
lambda_risk_seeking = 0.3   # Variance reward weight for risk-seeking type
beta_synergy        = 0.7   # Coalition subadditivity parameter
partial_regime_threshold = 0.5  # q < 0.5*q* → no deterrence
```

---

### config/weights.toml
```toml
# Heuristic weights for Layer 1 and Layer 2 computations
# These are fixed (not learned). Change here to recalibrate.

[layer1.risk_scorer]
# ρ = σ(w1·z_amount + w2·velocity + w3·device + w4·geo + w5·time)
w1_amount_zscore   = 0.40
w2_velocity        = 0.25
w3_device_mismatch = 0.20
w4_geo_anomaly     = 0.10
w5_time_anomaly    = 0.05

[layer2.alpha_estimator]
# α = σ(v1·ρ + v2·trail_depth + v3·links + v4·device_evidence + v5·flags)
v1_risk_score      = 0.30
v2_trail_depth     = 0.25
v3_cross_links     = 0.20
v4_device_evidence = 0.15
v5_prior_flags     = 0.10
```

---

### config/agents.toml
```toml
# NashAudit — Council Agent Definitions
# Each agent has: identity, lens description, specialisation vector
# Specialisation vector dims: [amount_anomaly, velocity, graph, device_geo, history]

[agents.risk_analyst]
id          = "risk_analyst"
name        = "Risk Analyst"
icon        = "📊"
color       = "#1D9E75"
lens        = "Quantitative expected value reasoning using E[cheat] formula"
spec_vec    = [1.0, 0.5, 0.0, 0.2, 0.0]
default_position = "AUDIT"

[agents.forensics_agent]
id          = "forensics_agent"
name        = "Forensics Agent"
icon        = "🔬"
color       = "#0C447C"
lens        = "Evidence depth and capture probability α estimation"
spec_vec    = [0.3, 0.2, 1.0, 0.8, 0.5]
default_position = "AUDIT"

[agents.coalition_detector]
id          = "coalition_detector"
name        = "Coalition Detector"
icon        = "🕸️"
color       = "#7F77DD"
lens        = "Graph structure, cross-account links, Shapley values"
spec_vec    = [0.0, 0.1, 1.0, 0.3, 0.8]
default_position = "AUDIT"

[agents.behavioural_agent]
id          = "behavioural_agent"
name        = "Behavioural Agent"
icon        = "🧠"
color       = "#BA7517"
lens        = "Variance-adjusted utility, irrational fraudster modelling"
spec_vec    = [0.5, 0.8, 0.2, 0.0, 0.3]
default_position = "UNCERTAIN"

[agents.adversarial_agent]
id          = "adversarial_agent"
name        = "Adversarial Agent"
icon        = "⚖️"
color       = "#D85A30"
lens        = "Red-team defence — argue against audit, find false positive risk"
spec_vec    = [0.8, 0.4, 0.3, 0.5, 0.5]
default_position = "SKIP"
```

---

### config/system_prompts.toml
```toml
# NashAudit — LLM System Prompts
# Fed to NVIDIA NIM (Llama 70B) as the system message per agent
# Context block (transaction data + game params) is appended at runtime as TOML

[prompts.risk_analyst]
role = "system"
content = """
You are a quantitative risk analyst in a fraud audit council.
Your job: decide whether a transaction should be audited using expected value reasoning.

You have access to:
- E[cheat] = the fraudster's expected payoff if they attempt fraud
- q* = minimum audit rate needed to deter this transaction
- risk_score = transaction's prior risk weight (0 to 1)

Rules:
- Recommend AUDIT if E[cheat] > 0 or risk_score > 0.75
- Recommend SKIP if E[cheat] < -0.1*G and risk_score < 0.4
- Otherwise recommend UNCERTAIN with your reasoning

Respond in this exact structure:
position: AUDIT | SKIP | UNCERTAIN
confidence: [0.0 to 1.0]
reasoning: [one paragraph, cite the numbers]
"""

[prompts.forensics_agent]
role = "system"
content = """
You are a digital forensics expert in a fraud audit council.
Your job: evaluate how likely we are to actually identify the fraudster if we audit.

You have access to:
- alpha = estimated capture probability for this transaction
- trail_depth = number of traceable hops in the transaction graph
- device_evidence = strength of device fingerprint evidence
- prior_flags = number of prior suspicious flags on this account

Rules:
- Recommend AUDIT if alpha > 0.6 and trail_depth > 2
- Recommend SKIP if alpha < 0.3 (auditing is unlikely to result in identification)
- Otherwise UNCERTAIN

Respond in this exact structure:
position: AUDIT | SKIP | UNCERTAIN
confidence: [0.0 to 1.0]
reasoning: [one paragraph, cite alpha and evidence]
"""

[prompts.coalition_detector]
role = "system"
content = """
You are a network fraud analyst in a fraud audit council.
Your job: identify whether this transaction is part of a coordinated fraud coalition.

You have access to:
- coalition_id = detected coalition this transaction belongs to (null if none)
- shapley_value = this account's marginal contribution to coalition gain
- is_keystone = true if auditing this account collapses the most coalition value
- cross_account_links = number of linked suspicious accounts

Rules:
- Recommend AUDIT if is_keystone = true or shapley_value > 0.25
- Recommend SKIP if coalition_id is null and cross_account_links = 0
- Otherwise UNCERTAIN

Respond in this exact structure:
position: AUDIT | SKIP | UNCERTAIN
confidence: [0.0 to 1.0]
reasoning: [one paragraph, cite Shapley value and coalition structure]
"""

[prompts.behavioural_agent]
role = "system"
content = """
You are a behavioural economist in a fraud audit council.
Your job: model whether the fraudster is behaving irrationally — taking risks
a purely rational agent would not. High variance = high uncertainty.

You have access to:
- fraudster_type = estimated behavioural type (risk_neutral/averse/seeking/colluding)
- variance_adjusted_utility = E[cheat] adjusted for payoff variance
- lambda = variance weighting coefficient

Rules:
- Recommend AUDIT if fraudster_type = risk_seeking (they ignore deterrence signals)
- Recommend UNCERTAIN if variance_adjusted_utility is within 5% of zero
- Recommend SKIP if fraudster_type = risk_averse and margin < -0.15

Respond in this exact structure:
position: AUDIT | SKIP | UNCERTAIN
confidence: [0.0 to 1.0]
reasoning: [one paragraph, cite behavioural type and variance]
"""

[prompts.adversarial_agent]
role = "system"
content = """
You are a defence lawyer in a fraud audit council.
Your job: argue AGAINST auditing this transaction. Find every legitimate
explanation for suspicious signals. Protect against false positives.
You are the system's built-in red-team.

You have access to all transaction signals. Your bias is always toward SKIP.

Rules:
- Always start from SKIP and only move to UNCERTAIN if evidence is overwhelming
- Never recommend AUDIT — that is not your role
- Challenge: amount anomalies (could be salary day), velocity (could be shopping),
  device mismatch (could be new phone), geo anomaly (could be travel)

Respond in this exact structure:
position: SKIP | UNCERTAIN
confidence: [0.0 to 1.0]
reasoning: [one paragraph arguing against audit, cite alternative explanations]
"""
```

---

### config/bandit.toml
```toml
# Thompson Sampling Bandit Configuration

[bandit]
initial_alpha = 1.0    # Beta distribution prior — no knowledge
initial_beta  = 1.0    # Beta distribution prior — no knowledge

[arms]
# Each arm = one audit strategy variant
# Name = strategy, spec = which feature it prioritises
names = [
  "high_risk_score",
  "high_velocity",
  "coalition_keystone",
  "high_amount_anomaly",
  "balanced"
]
```

---

## 2. LLM CONTEXT FORMAT — TOML AT RUNTIME

When the council agents are called, their transaction context is
assembled as a TOML block and appended to the system prompt.
This is what the LLM actually reads — not a JSON blob.

```toml
# Transaction Context — fed to each council agent at runtime
# Generated programmatically, not hand-written

[transaction]
txn_id         = "txn_042"
amount         = 14500.0
z_amount       = 2.3
velocity       = 4
device_mismatch = true
geo_anomaly    = 0.7
time_anomaly   = false
risk_score     = 0.87

[game_state]
q_current  = 0.20
G          = 10000
P_caught   = 50000
P_escaped  = 5000
alpha      = 0.71
e_cheat    = 310.0
q_star     = 0.267
margin     = 0.031
regime     = "none"
deterred   = false

[coalition]
coalition_id         = "coal_003"
shapley_value        = 0.34
is_keystone          = true
cross_account_links  = 3
keystone_gain_reduction_pct = 0.62

[fraudster_estimate]
type                    = "colluding"
variance_adjusted_utility = 285.0
lambda                  = 0.3

# Round 2 only — other agents' Round 1 positions appended here
[council_round1]
risk_analyst       = "AUDIT"
forensics_agent    = "AUDIT"
coalition_detector = "AUDIT"
behavioural_agent  = "UNCERTAIN"
adversarial_agent  = "SKIP"
```

Why TOML here instead of JSON:
  LLMs parse flat key=value tables more reliably than nested JSON in context.
  Sections like [game_state] and [coalition] are immediately legible.
  No bracket noise, no quote noise, no comma errors to confuse the model.

---

## 3. API ENDPOINTS — ALL JSON WIRE FORMAT

No change to endpoint signatures from v1.0.
All request/response bodies remain JSON.
TOML is internal — the frontend never sees it.

### POST /simulation/create
📄 JSON request + response (unchanged from v1.0)

### POST /setup/preview
📄 JSON request + response (unchanged from v1.0)
🟢 GT — pure formula computation

### POST /round/execute/{simulation_id}
📄 JSON response
Internally: loads TOML configs, assembles TOML context for LLM, returns JSON

### GET /simulation/{id}/state
📄 JSON (full canonical state — unchanged)

### GET /simulation/{id}/game-state
📄 JSON (Page 2 data — unchanged)

### GET /simulation/{id}/comparison
📄 JSON (Page 5 data — unchanged)

---

## 4. SSE STREAMING — COUNCIL DELIBERATION

One endpoint uses SSE instead of JSON for LLM token streaming.

### GET /council/stream/{simulation_id}/{round_number}
Transport: Server-Sent Events
Used by: Page 3 — Council Chamber

**Stream event types:**
```
event: round_start
data: {"round": 1, "agent_count": 5}

event: agent_token
data: {"agent_id": "risk_analyst", "token": "E[cheat]"}

event: agent_complete
data: {"agent_id": "risk_analyst", "position": "AUDIT", "confidence": 0.79, "full_reasoning": "..."}

event: round_complete
data: {"round": 1, "positions": {"risk_analyst": "AUDIT", ...}}

event: leader_elected
data: {"leader": "coalition_detector", "confidence_score": 0.81, "dominant_feature": "cross_account_links"}

event: final_decision
data: {"decision": "AUDIT", "decided_by": "coalition_detector", "consensus_score": 0.60}

event: stream_end
data: {"council_result_id": "cr_013"}
```

Frontend assembles tokens per agent into the debate log.
After `stream_end`, frontend fetches full CouncilResult as JSON
from GET /round/{id}/council-result for storage and report generation.

🔵 STUB → SSE stream emits pre-written tokens at 50ms intervals (fake typing effect).
🟠 LLM  → SSE stream proxies real NVIDIA NIM token stream per agent.

---

## 5. SQLITE DATABASE SCHEMA

```sql
CREATE TABLE simulations (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL,
  config_toml TEXT NOT NULL,    -- TOML blob (simulation_defaults + user overrides)
  created_at  DATETIME,
  updated_at  DATETIME
);

CREATE TABLE rounds (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_id   TEXT NOT NULL,
  round_number    INTEGER NOT NULL,
  layer1_output   TEXT,    -- JSON blob
  layer2_output   TEXT,    -- JSON blob (CouncilResult)
  layer3_output   TEXT,    -- JSON blob
  layer4_output   TEXT,    -- JSON blob
  layer5_output   TEXT,    -- JSON blob
  round_kpis      TEXT,    -- JSON blob
  llm_context     TEXT,    -- TOML blob (what was fed to LLM this round)
  created_at      DATETIME,
  FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE transactions (
  id             TEXT PRIMARY KEY,
  simulation_id  TEXT NOT NULL,
  round_number   INTEGER NOT NULL,
  data           TEXT NOT NULL,   -- JSON blob
  audited        INTEGER,
  FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE agent_priors (
  simulation_id  TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  alpha          REAL NOT NULL DEFAULT 1.0,
  beta           REAL NOT NULL DEFAULT 1.0,
  rounds_led     INTEGER DEFAULT 0,
  updated_at     DATETIME,
  PRIMARY KEY (simulation_id, agent_id),
  FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE coalitions (
  id             TEXT PRIMARY KEY,
  simulation_id  TEXT NOT NULL,
  round_number   INTEGER NOT NULL,
  data           TEXT NOT NULL,   -- JSON blob
  FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE llm_calls (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_id  TEXT NOT NULL,
  round_number   INTEGER NOT NULL,
  agent_id       TEXT NOT NULL,
  context_toml   TEXT NOT NULL,   -- exact TOML fed to LLM
  response_raw   TEXT,            -- raw LLM output
  position       TEXT,            -- parsed: AUDIT|SKIP|UNCERTAIN
  confidence     REAL,            -- parsed float
  reasoning      TEXT,            -- parsed string
  latency_ms     INTEGER,
  stub_used      INTEGER DEFAULT 1,  -- 0 when real LLM, 1 when stub
  created_at     DATETIME,
  FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);
-- llm_calls table logs every LLM interaction for debugging + replay
```

---

## 6. BUILD ORDER (updated)

```
Phase 1 — Skeleton
  1.  SQLite schema + migrations
  2.  Load TOML configs on startup (simulation_defaults, agents, weights)
  3.  POST /simulation/create
  4.  GET /simulation/{id}/state
  5.  POST /setup/preview  (pure GT — final code immediately)
  6.  Transaction generator (synthetic, uses fraudster_mix from config)
  7.  Stub pipeline: Layers 1→5
  8.  POST /round/execute — wires stubs, returns JSON
  9.  SSE stub endpoint — fake token stream at 50ms/token
  10. All remaining GET endpoints

Phase 2 — Game Theory (pure GT, no ML/LLM)
  11. Layer 1: sigmoid risk scorer (reads weights.toml)
  12. Layer 2C: leader election (reads agents.toml spec_vec)
  13. Layer 3: CE mediator LP (scipy.optimize.linprog)
  14. Layer 4A: Stackelberg LP (scipy.optimize.linprog)
  15. Layer 4B: Shapley values (exact formula)
  16. Layer 5: Thompson Sampling (reads bandit.toml)
  17. Fictitious play belief update

Phase 3 — LLM Integration
  18. TOML context builder (assembles transaction context per agent)
  19. NVIDIA NIM client (reads system_prompts.toml)
  20. SSE proxy — real token stream from NIM
  21. Response parser (extracts position/confidence/reasoning from LLM output)
  22. llm_calls table logging

Phase 4 — ML Integration
  23. Layer 2A: Alpha estimator (sigmoid → XGBoost if data available)
  24. Layer 4C: Coalition detector (account grouping → GNN)

Phase 5 — Frontend Integration
  25. Connect all JSON endpoints to Streamlit/React
  26. Wire SSE stream to Council Chamber debate log
  27. PDF report generation
```

---

## 7. FORMAT DECISION SUMMARY

```
What                          Format   Why
─────────────────────────────────────────────────────────────────
HTTP request/response bodies  JSON     Universal HTTP standard
Game params + defaults        TOML     Human-editable config
Agent definitions             TOML     Readable, version-controllable
LLM system prompts            TOML     Clean multi-line strings
LLM transaction context       TOML     Better LLM comprehension than JSON
Simulation config in DB       TOML     Stored as-is, loaded directly
Round outputs in DB           JSON     Nested structured data
LLM token streaming           SSE      One-directional server push
```

---

*NashAudit Backend Contract v2.0*
*JSON for the wire. TOML for the brain. SSE for the show.*