# NashAudit
### A Bayesian Stackelberg Security Game Engine for Digital Payment Fraud Deterrence

> Most fraud systems answer the question *"was this transaction fraudulent?"*
> NashAudit answers a different question: *"can we design an audit policy under which attempting fraud is irrational in the first place?"*

This document explains what NashAudit is, why it is built the way it is, and the reasoning behind every major design decision — including the game theory, the reinforcement learning loop, and some of the less obvious engineering choices (like why the LLM context is TOML instead of JSON).

---

## 1. The Core Idea — Detection vs. Deterrence

Almost every fraud system in production today is a **classifier**. A transaction comes in, a model scores it, and if the score crosses a threshold, the transaction is flagged. This is *detection*. It is reactive by construction — the model can only act after a fraud attempt has already happened.

The problem with pure detection is that it does not change the underlying incentive structure for the fraudster. A rational fraudster doesn't ask "will I get caught on this specific transaction?" — they ask:

> *"Across many attempts, is my expected payoff from committing fraud positive or negative?"*

If the expected payoff is positive — even slightly — a rational fraudster will keep trying, no matter how good the classifier is, because the classifier only changes the *probability* of being flagged, not the underlying *economics* of the decision.

NashAudit reframes the problem as a **Stackelberg security game**: a two-player game between an **Auditor** (the system, who moves first and commits publicly to an audit policy) and a population of **Fraudsters** (who observe this commitment and respond rationally). The goal is not to catch every fraudster — it's to design a policy under which the *expected value of attempting fraud is negative*, so that fraud becomes a bad bet by construction.

This is the difference between **deterrence** and **detection**. Detection tries to win every individual battle. Deterrence tries to make the fraudster not want to fight at all.

---

## 2. The Two-Penalty Payoff Model

Most academic Stackelberg security game models use a single penalty: if you're audited and caught, you lose `P`. NashAudit splits this into two distinct outcomes, because in the real world, **being audited and being identified are not the same event**.

| Outcome | What happens | Penalty |
|---|---|---|
| Not audited | Fraud succeeds, fraudster keeps the gain | `+G` |
| Audited, identified | Fraudster is traced, prosecuted, account frozen | `-P_caught` (large) |
| Audited, not identified | Transaction flagged but fraudster remains anonymous | `-P_escaped` (small) |

This gives the fraudster's **expected payoff from cheating**:

```
E[cheat] = (1 - q) · G  +  q · α · (-P_caught)  +  q · (1 - α) · (-P_escaped)

where:
  q  = audit probability (the auditor's committed policy)
  G  = fraud gain if undetected
  α  = capture probability given the transaction is audited
  P_caught, P_escaped = the two penalties described above
```

### Why this matters

If you collapse `P_caught` and `P_escaped` into a single penalty (as most models do), you implicitly assume that being audited *always* means being identified. In practice, identification depends on evidence quality — device fingerprints, transaction graph depth, account history. A transaction can be flagged and the fraudster can simply walk away, having lost nothing but the value of that one transaction.

By separating these two outcomes, the model captures a more realistic picture: **deterrence depends not just on how often you audit, but on how good your forensic capability (`α`) is once you do.** A system with high audit rate but low `α` gives a false sense of security — fraudsters get flagged constantly but are never actually identified, so the real deterrent effect is weak.

### The deterrence threshold

Setting `E[cheat] ≤ 0` and solving for `q` gives the **minimum audit rate required for full deterrence**:

```
q* = G / [α · P_caught + (1 - α) · P_escaped]
```

This single formula is the backbone of the entire system. Every fraudster type has its own `q*` (because `G`, and sometimes `α`, differ by type). The auditor must satisfy the **binding** `q*` — the highest one across all active fraudster types — within its audit budget.

Three regimes fall out of this naturally:

- **Full deterrence**: `q ≥ q*` — fraud is irrational for this type
- **Partial deterrence**: `0.5·q* ≤ q < q*` — fraud is marginally rational; small policy changes flip the outcome
- **No deterrence**: `q < 0.5·q*` — fraud is comfortably rational; this type is actively exploiting the system

---

## 3. The Coefficient Matrix — Best Response Across Fraudster Types

NashAudit models **four heterogeneous fraudster types**, each with a different relationship to risk:

| Type | Decision rule |
|---|---|
| Risk-neutral | `E[cheat]` directly — maximizes expected value |
| Risk-averse | `E[cheat] − λ·Var[payoff]` — penalized by uncertainty |
| Risk-seeking | `E[cheat] + λ·Var[payoff]` — *rewarded* by uncertainty, harder to deter |
| Colluding | Payoff split via Shapley values across coalition members |

For each round, the system computes a **4 × |Q| best-response coefficient matrix**, where `|Q|` is the number of audit-rate sample points (`q` ranging from 0 to 1). Each cell `(i, j)` gives `E[cheat]` for fraudster type `i` at audit rate `q_j`.

This matrix is what produces the **Best Response curves** — one line per fraudster type, showing exactly where each type flips from "cheat" to "don't cheat" as the audit rate increases. The auditor's chosen `q` must sit to the right of the *rightmost* crossing point (the binding `q*`) to achieve full deterrence across the entire population.

The variance term `Var[payoff]` for the risk-sensitive types is computed as:

```
Var[payoff] = q·(1-q)·(G + α·P_caught + (1-α)·P_escaped)²
```

This is the variance of a Bernoulli-distributed payoff (audited vs. not audited), scaled by the spread between the best and worst outcomes. Risk-seeking fraudsters are *attracted* to this variance — meaning they require a higher `q*` to deter than a risk-neutral fraudster with identical `G`. This is one of the more important practical findings: **uniform audit policies under-deter risk-seeking actors while over-deterring risk-averse ones.**

---

## 4. Bilateral Learning — Both Sides Adapt

A static Stackelberg model assumes the game is played once. NashAudit treats it as a **repeated game**, where both the auditor and the fraudsters learn from history. This is the part of the system grounded in reinforcement learning and online learning theory.

### The auditor's side — Thompson Sampling

The auditor maintains several candidate audit *strategies* (e.g. "prioritize high-velocity transactions", "prioritize coalition keystones"). Each strategy is modeled as an **arm** in a multi-armed bandit, with a `Beta(α, β)` posterior over its effectiveness.

```
Each round:
  1. Sample θ_k ~ Beta(α_k, β_k) for each arm k
  2. Pull arm k* = argmax θ_k
  3. Observe: did this strategy successfully deter fraud this round?
  4. Update: if yes, α_k += 1, else β_k += 1
```

This is **Thompson Sampling** — a Bayesian approach to the explore/exploit tradeoff. Early on, the system tries different strategies because it's uncertain which works best. Over time, as evidence accumulates, it converges on the strategy with the highest posterior mean (`α / (α + β)`), while still occasionally exploring others in case conditions change.

### The fraudster's side — Fictitious Play

Symmetrically, the fraudster population doesn't just react to the auditor's *announced* policy — they form a **belief** about the *actual* audit rate based on what they've observed:

```
q̂_T = (1/T) · Σ_t (audits executed at round t / N)
```

This is **fictitious play** — best-responding to the empirical frequency of the opponent's past actions, a classical learning rule in game theory. If the auditor announces `q = 0.20` but historically only executes `0.14` due to budget constraints, fraudsters will eventually learn `q̂ ≈ 0.14` and recalibrate their behavior accordingly — re-entering the "active fraud" region even though the *announced* policy still claims full deterrence.

The gap between `q_committed` and `q̂` is tracked explicitly as the **credibility gap**. A shrinking gap means the system's commitments are being honored in practice; a persistent gap is an early warning that deterrence is eroding silently.

### Why this matters theoretically

When both players use no-regret learning algorithms — Thompson Sampling on one side, fictitious play on the other — there's a classical result (Hart & Mas-Colell, 2000) that **the time-average of play converges to a Correlated Equilibrium**. This gives NashAudit a *provable* convergence guarantee, not just an empirical one. The system isn't just "adaptive" in a vague sense — it's adaptive in a way that has a known theoretical destination.

---

## 5. The Five-Layer Pipeline

```
Layer 1 — Risk Scorer
  ρ = σ(w₁·z_amount + w₂·velocity + w₃·device_mismatch + w₄·geo_anomaly + w₅·time_anomaly)
  → A heuristic sigmoid over transaction features. Fixed weights, fully interpretable.

Layer 2 — Agent Council + α Estimation
  α = σ(v₁·ρ + v₂·trail_depth + v₃·cross_links + v₄·device_evidence + v₅·prior_flags)
  → 5 LLM agents (NVIDIA NIM, Llama-70B) deliberate over each transaction batch,
    each reasoning through a different lens (see Section 6).

Layer 3 — Correlated Equilibrium Mediator
  → A linear program (scipy.optimize.linprog) that merges the council's
    recommendations into a joint distribution over audit decisions,
    subject to Incentive Compatibility constraints (Aumann, 1974).
    Does NOT simply average — finds an allocation no agent wants to deviate from.

Layer 4 — Stackelberg LP + Shapley Values
  → Computes the optimal k-transaction audit allocation (bounded knapsack via LP),
    and exact Shapley values to identify "keystone" members of fraud coalitions —
    i.e. which account, if audited, collapses the most value from a colluding group.

Layer 5 — Thompson Sampling Bandit
  → Adapts the audit strategy over rounds based on observed deterrence outcomes.
    Updates agent accuracy priors, which feed back into Layer 2's leader election.
```

Each layer is independently testable and (except for the LLM council) is **pure game theory or closed-form math** — no black boxes. This was a deliberate choice: every number the system produces should be traceable to a formula, not a learned weight that can't be explained.

---

## 6. The LLM Council — Multi-Agent, Multi-Lens

Layer 2 is the most novel part of the system. Instead of a single model scoring transactions, NashAudit runs **5 LLM agents on the same underlying model (Llama-70B via NVIDIA NIM)**, but with **5 different system prompts** that bake in 5 different decision-theoretic objectives:

| Agent | Lens | Optimizes for |
|---|---|---|
| Risk Analyst | Expected utility | Sign of `E[cheat]` |
| Forensics Agent | Evidence sufficiency | Is `α` high enough to act on? |
| Coalition Detector | Cooperative game theory | Shapley value — who collapses the network? |
| Behavioural Agent | Variance-adjusted utility | Predictability of fraudster type |
| Adversarial Agent | Null hypothesis defence | False-positive cost (always argues *against* audit) |

This is **not** "5 different models" — it's **5 different information structures applied to the same model**, which maps directly to the multi-sender asymmetric information setup studied in mechanism design (e.g. Shannon Meets Myerson). Same signal, different priors, different conclusions — and the disagreement itself is informative.

### The two-round deliberation

```
Round 1 — Independent reasoning
  All 5 agents receive identical context, called in parallel.
  Each returns: position (AUDIT/SKIP/UNCERTAIN), confidence, reasoning.
  No agent sees any other agent's output yet.

        ↓ Round 1 positions injected into context as [council_round1]

Round 2 — Deliberative reasoning
  All 5 agents called again, now aware of everyone's Round 1 position.
  The Adversarial Agent, if outvoted 3-2 or more, is explicitly prompted
  to respond to the strongest AUDIT argument — forced red-teaming.
  Each agent reports whether their position changed and why.

        ↓

Leader Election (pure game theory, no LLM)
  Leader = argmax_i [specialisation_i · feature_vec(t)] · accuracy_i

  The agent whose specialisation vector best matches this transaction's
  feature profile — weighted by their historical accuracy from the
  Thompson Sampling bandit — becomes the leader. Their Round 2 position
  becomes the final decision. Dissenters are logged for the SAR report.
```

This means leadership is **endogenous** — a coalition-heavy transaction is led by the Coalition Detector, while a high-variance transaction is led by the Behavioural Agent. The system literally hands decision rights to whichever agent's expertise is most relevant *for that specific transaction*, and that allocation itself adapts over time as agent accuracy is updated.

---

## 7. Why TOML Instead of JSON for LLM Context

This is a small decision with an outsized effect on reliability, so it's worth explaining.

NashAudit uses **JSON everywhere on the API/wire layer** — request/response bodies, database blobs, frontend communication. That's standard and there was no reason to deviate from it.

But for the **context fed into the LLM agents**, we use **TOML** instead. Here's the same data in both formats:

**JSON:**
```json
{
  "game_state": {
    "q_current": 0.20,
    "e_cheat": 310.0,
    "q_star": 0.267,
    "regime": "none",
    "deterred": false
  }
}
```

**TOML:**
```toml
[game_state]
q_current = 0.20
e_cheat   = 310.0
q_star    = 0.267
regime    = "none"
deterred  = false
```

The information content is identical. But there are practical reasons TOML works better as *LLM input specifically*:

1. **Flat key-value structure reduces tokenization noise.** JSON's nested braces, repeated quotation marks, and comma-separation add tokens that carry no semantic information but the model still has to "spend attention" parsing. TOML's `key = value` lines are closer to how the information would appear in a natural-language table.

2. **Section headers (`[game_state]`, `[coalition]`) act as explicit topic boundaries.** This is closer to how humans organize information — under labeled headings — than JSON's nesting, which requires tracking bracket depth to know which object you're "inside."

3. **Fewer syntax errors degrade gracefully.** If an LLM is asked to *echo back* or *modify* structured data, a missing comma or unclosed brace in JSON breaks the entire object. A malformed line in TOML usually only affects that one line.

4. **It mirrors how the system prompts are written.** Each agent's system prompt (also TOML) and the per-transaction context (also TOML) share the same "shape" — tables of named values. This consistency seems to help agents generalize their reasoning across the prompt boundary, since they're not switching mental formats between instructions and data.

The rule of thumb we settled on:

> **JSON is for machines talking to machines. TOML is for machines talking to a language model that has to *read* the data, not just parse it.**

This is not a universal claim — for very large, deeply nested data, TOML becomes unwieldy and JSON (or even just prose) wins. But for the kind of flat, tabular, per-transaction context NashAudit feeds its agents — a transaction's features, the current game state, coalition info — TOML's table-based structure is a better fit than JSON's object nesting.

---

## 8. SAR Output — Every Decision Is Explainable

The final output of each round is a set of audit decisions, each carrying a full **rationale block**:

```
For each audited transaction:
  - Deterrence regime + q* + E[cheat] + safety margin
  - Estimated fraudster type and behavioural profile
  - Which council agent led the decision, and why (which feature dominated)
  - Which agents dissented, and their stated objection
  - Shapley position within its coalition (if applicable)
  - IC constraint satisfaction status
```

Nothing in this system is a black box. Every audit decision can be traced back to: a formula, a council deliberation log, and (if relevant) a Shapley computation. This was a deliberate design constraint from the start — a system that *recommends auditing someone* needs to be able to explain *why* in terms a human reviewer (or regulator) can verify.

---

## 9. Tech Stack Summary

```
Backend:     FastAPI + SQLite
Game theory: scipy.optimize.linprog (CE mediator, Stackelberg LP)
             numpy (Shapley values, leader election dot products)
LLM:         NVIDIA NIM API (Llama-3.1-70B-instruct), SSE streaming
Config:      TOML (game params, agent definitions, system prompts)
API:         JSON (all request/response bodies)
Frontend:    Streamlit / React + Plotly/Recharts
```

---

## 10. What This Project Is — and Isn't

**It is:**
- A working implementation of a Bayesian Stackelberg security game with a novel two-penalty payoff structure
- A demonstration of multi-agent LLM deliberation grounded in formal game theory rather than ad-hoc prompting
- A system where every output is mathematically traceable — no unexplainable model weights

**It isn't:**
- A production fraud detection system — it doesn't ingest live transaction streams or integrate with banking infrastructure
- A claim that LLMs "solve" game theory — the LLMs operate *within* a game-theoretic structure defined entirely in closed-form math; they don't determine the equilibrium, they reason about specific cases within it
- A replacement for classifier-based detection — NashAudit assumes a risk-scoring layer exists upstream and focuses on what to *do* with that information from a policy-design perspective

---

*NashAudit — deterrence by design.*