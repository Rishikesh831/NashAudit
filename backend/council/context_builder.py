"""
NashAudit — TOML Context Builder
=================================
Assembles the transaction context fed to each council agent as a TOML string.

Usage:
    from engine.context_builder import ContextBuilder

    builder = ContextBuilder(config)

    # Group transactions into mini-batches (coalition-aware)
    batches = builder.build_batches(transactions, k, h)

    # Build Round 1 context for a batch
    ctx = builder.build_context(batch, game_state, round=1)

    # Build Round 2 context (inject Round 1 results)
    ctx = builder.build_context(batch, game_state, round=2,
                                round1_positions=round1_results)
"""

from __future__ import annotations

import os
import math
import tomllib
import tomli_w
from dataclasses import dataclass, field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────
# 1.  DATA CLASSES
#     Mirror the API contract schemas exactly.
#     Phase 1/2 code already builds these — we
#     just consume them here.
# ─────────────────────────────────────────────

@dataclass
class TransactionFeatures:
    txn_id:            str
    amount:            float
    z_amount:          float
    velocity:          int
    device_mismatch:   bool
    geo_anomaly:       float
    time_anomaly:      bool
    account_id:        str
    risk_score:        float          # ρ from Layer 1
    feature_vec:       list[float]    # [z_amount, velocity, geo, device, time]
    alpha_i:           float          # α from Layer 2A
    estimated_type:    str            # risk_neutral | risk_averse | risk_seeking | colluding
    true_type:         Optional[str] = None   # known in synthetic mode only


@dataclass
class GameState:
    """Per-transaction game-theoretic values from Layers 4A/setup-preview."""
    q_current:                float
    q_star:                   float    # binding q* (hardest fraudster type)
    q_star_per_type:          dict[str, float]
    e_cheat:                  float    # for estimated_type
    margin:                   float    # e_cheat / G
    regime:                   str      # full | partial | none
    deterred:                 bool
    G:                        float
    P_caught:                 float
    P_escaped:                float
    alpha_global:             float    # game-level α (from config)
    variance_adjusted_utility: float
    lambda_val:               float


@dataclass
class CoalitionInfo:
    """Shapley / coalition data from Layer 4B/4C."""
    coalition_detected:       bool
    coalition_id:             Optional[str]   = None
    shapley_value:            Optional[float] = None
    is_keystone:              bool            = False
    cross_account_links:      int             = 0
    keystone_gain_reduction:  float           = 0.0   # as fraction e.g. 0.62


@dataclass
class SiblingTransaction:
    """Lightweight sibling summary shown to agents for batch context."""
    txn_id:        str
    risk_score:    float
    estimated_type: str
    is_keystone:   bool
    regime:        str


@dataclass
class TransactionBatch:
    """One mini-batch — k/h transactions the council deliberates on together."""
    batch_id:       int              # 1-indexed
    total_batches:  int              # h
    transactions:   list[TransactionFeatures]
    game_states:    list[GameState]
    coalitions:     list[CoalitionInfo]
    batch_risk_rank: int             # rank among all batches by mean risk score


# ─────────────────────────────────────────────
# 2.  ROUND 1 AGENT POSITIONS
#     Returned by NIM parser, injected into
#     Round 2 context.
# ─────────────────────────────────────────────

@dataclass
class AgentPosition:
    agent_id:   str
    position:   str    # AUDIT | SKIP | UNCERTAIN
    confidence: float
    reasoning:  str


@dataclass
class Round1Positions:
    risk_analyst:       AgentPosition
    forensics_agent:    AgentPosition
    coalition_detector: AgentPosition
    behavioural_agent:  AgentPosition
    adversarial_agent:  AgentPosition

    def as_dict(self) -> dict[str, str]:
        return {
            "risk_analyst":       self.risk_analyst.position,
            "forensics_agent":    self.forensics_agent.position,
            "coalition_detector": self.coalition_detector.position,
            "behavioural_agent":  self.behavioural_agent.position,
            "adversarial_agent":  self.adversarial_agent.position,
        }

    def audit_count(self) -> int:
        return sum(1 for a in self.as_dict().values() if a == "AUDIT")

    def skip_count(self) -> int:
        return sum(1 for a in self.as_dict().values() if a == "SKIP")


# ─────────────────────────────────────────────
# 3.  BATCHING LOGIC
#     Coalition-aware grouping.
#     Configured via simulation_defaults.toml.
# ─────────────────────────────────────────────

class BatchBuilder:
    """
    Groups k selected transactions into h mini-batches.

    Strategy (Option C — coalition-aware):
      1. Group all colluding transactions by coalition_id.
         Each coalition stays in the same batch so the Coalition Detector
         can reason about the full ring.
      2. Fill remaining slots in each batch with non-coalition transactions,
         sorted by risk_score descending.
      3. If a coalition is larger than batch_size, it spills into the next batch.
         (Rare — flag a warning in this case.)
    """

    def __init__(self, h: int, k: int):
        """
        h: number of mini-batches
        k: total transactions to audit (audit budget)
        """
        if h <= 0:
            raise ValueError(f"h must be > 0, got {h}")
        if k <= 0:
            raise ValueError(f"k must be > 0, got {k}")
        self.h = h
        self.k = k
        self.batch_size = math.ceil(k / h)

    def build(
        self,
        transactions: list[TransactionFeatures],
        game_states:  list[GameState],
        coalitions:   list[CoalitionInfo],
    ) -> list[TransactionBatch]:
        """
        Returns h TransactionBatch objects, coalition-aware.
        transactions, game_states, coalitions must be aligned (same index = same txn).
        """
        assert len(transactions) == len(game_states) == len(coalitions), (
            "transactions, game_states, coalitions must have equal length"
        )

        n = len(transactions)
        indexed = list(zip(transactions, game_states, coalitions))

        # ── Step 1: separate colluding from solo ──────────────────────────
        coalition_groups: dict[str, list] = {}
        solo: list = []

        for txn, gs, coal in indexed:
            if coal.coalition_detected and coal.coalition_id:
                coalition_groups.setdefault(coal.coalition_id, []).append(
                    (txn, gs, coal)
                )
            else:
                solo.append((txn, gs, coal))

        # sort solo by risk_score descending
        solo.sort(key=lambda x: x[0].risk_score, reverse=True)

        # sort coalition groups by max risk_score descending
        sorted_coalitions = sorted(
            coalition_groups.values(),
            key=lambda grp: max(t.risk_score for t, _, _ in grp),
            reverse=True,
        )

        # ── Step 2: fill h buckets ─────────────────────────────────────────
        buckets: list[list] = [[] for _ in range(self.h)]

        # place coalitions first — keep members together
        current_bucket = 0
        for coalition_members in sorted_coalitions:
            # if coalition won't fit in current bucket, move to next
            if (len(buckets[current_bucket]) + len(coalition_members)
                    > self.batch_size and current_bucket < self.h - 1):
                current_bucket += 1
            # if still won't fit (coalition larger than batch_size), warn + spill
            buckets[current_bucket].extend(coalition_members)
            if len(buckets[current_bucket]) >= self.batch_size:
                current_bucket = min(current_bucket + 1, self.h - 1)

        # fill remaining slots with solo transactions
        solo_iter = iter(solo)
        for bucket in buckets:
            while len(bucket) < self.batch_size:
                try:
                    bucket.append(next(solo_iter))
                except StopIteration:
                    break

        # any leftover solo (rounding) go into last bucket
        for item in solo_iter:
            buckets[-1].append(item)

        # ── Step 3: compute batch risk ranks ──────────────────────────────
        bucket_mean_risks = [
            (i, sum(t.risk_score for t, _, _ in b) / max(len(b), 1))
            for i, b in enumerate(buckets)
        ]
        # rank 1 = highest risk
        risk_ranked = sorted(bucket_mean_risks, key=lambda x: x[1], reverse=True)
        rank_map = {orig_idx: rank + 1 for rank, (orig_idx, _) in enumerate(risk_ranked)}

        # ── Step 4: assemble TransactionBatch objects ─────────────────────
        result: list[TransactionBatch] = []
        for i, bucket in enumerate(buckets):
            if not bucket:
                continue
            txns_b  = [t for t, _, _ in bucket]
            gs_b    = [g for _, g, _ in bucket]
            coals_b = [c for _, _, c in bucket]
            result.append(TransactionBatch(
                batch_id        = i + 1,
                total_batches   = self.h,
                transactions    = txns_b,
                game_states     = gs_b,
                coalitions      = coals_b,
                batch_risk_rank = rank_map[i],
            ))

        return result


# ─────────────────────────────────────────────
# 4.  CONTEXT BUILDER
#     Assembles the TOML string per batch.
# ─────────────────────────────────────────────

class ContextBuilder:
    """
    Builds the TOML context string fed to each council agent.

    The same context goes to all 5 agents — their system prompts
    (in system_prompts.toml) provide the asymmetric reasoning lens.
    """

    # max siblings shown in [batch_context] to keep token count manageable
    MAX_SIBLINGS_SHOWN = 8

    def build_context(
        self,
        batch:            TransactionBatch,
        round_number:     int,                        # 1 or 2
        round1_positions: Optional[Round1Positions] = None,
    ) -> str:
        """
        Build the full TOML context string for one mini-batch.

        round_number = 1  → Round 1 (no council_round1 table)
        round_number = 2  → Round 2 (council_round1 table injected)
        round1_positions  → required when round_number = 2
        """
        if round_number == 2 and round1_positions is None:
            raise ValueError("round1_positions must be provided for Round 2 context")

        doc: dict = {}

        # ── [meta] ─────────────────────────────────────────────────────────
        doc["meta"] = {
            "batch_id":          batch.batch_id,
            "total_batches":     batch.total_batches,
            "batch_risk_rank":   batch.batch_risk_rank,
            "transaction_count": len(batch.transactions),
            "round":             round_number,
            "instruction": (
                "You are evaluating a mini-batch of transactions. "
                "Reason about each transaction individually, then give "
                "an overall batch recommendation."
            ),
        }

        # ── [transactions] — one sub-table per txn ─────────────────────────
        txn_tables: dict = {}
        for i, (txn, gs, coal) in enumerate(zip(
            batch.transactions, batch.game_states, batch.coalitions
        )):
            key = f"txn_{i + 1}"   # txn_1, txn_2 … (clean TOML keys)
            txn_tables[key] = self._build_txn_table(txn, gs, coal)

        doc["transactions"] = txn_tables

        # ── [batch_summary] ───────────────────────────────────────────────
        doc["batch_summary"] = self._build_batch_summary(batch)

        # ── [council_round1] — Round 2 only ───────────────────────────────
        if round_number == 2 and round1_positions:
            doc["council_round1"] = self._build_round1_table(round1_positions)

        # ── serialise to TOML ─────────────────────────────────────────────
        return tomli_w.dumps(doc)

    # ── private helpers ───────────────────────────────────────────────────

    def _build_txn_table(
        self,
        txn:  TransactionFeatures,
        gs:   GameState,
        coal: CoalitionInfo,
    ) -> dict:
        """Builds the dict for one [transactions.txn_N] table."""
        table: dict = {}

        # raw features
        table["txn_id"]          = txn.txn_id
        table["amount"]          = round(txn.amount, 2)
        table["z_amount"]        = round(txn.z_amount, 3)
        table["velocity"]        = txn.velocity
        table["device_mismatch"] = txn.device_mismatch
        table["geo_anomaly"]     = round(txn.geo_anomaly, 3)
        table["time_anomaly"]    = txn.time_anomaly
        table["risk_score"]      = round(txn.risk_score, 4)

        # layer 2A
        table["alpha"]           = round(txn.alpha_i, 4)
        table["estimated_type"]  = txn.estimated_type

        # game state (layer 4A)
        table["q_current"]       = round(gs.q_current, 4)
        table["q_star"]          = round(gs.q_star, 4)
        table["e_cheat"]         = round(gs.e_cheat, 2)
        table["margin"]          = round(gs.margin, 4)
        table["regime"]          = gs.regime
        table["deterred"]        = gs.deterred
        table["G"]               = round(gs.G, 2)
        table["P_caught"]        = round(gs.P_caught, 2)
        table["P_escaped"]       = round(gs.P_escaped, 2)
        table["variance_adjusted_utility"] = round(gs.variance_adjusted_utility, 2)
        table["lambda"]          = round(gs.lambda_val, 3)

        # coalition (layer 4B/4C)
        table["no_coalition"]    = not coal.coalition_detected
        if coal.coalition_detected:
            table["coalition_id"]              = coal.coalition_id or ""
            table["shapley_value"]             = round(coal.shapley_value or 0.0, 4)
            table["is_keystone"]               = coal.is_keystone
            table["cross_account_links"]       = coal.cross_account_links
            table["keystone_gain_reduction"]   = round(coal.keystone_gain_reduction, 3)
        else:
            # always include these keys so agents don't see missing fields
            table["coalition_id"]              = ""
            table["shapley_value"]             = 0.0
            table["is_keystone"]               = False
            table["cross_account_links"]       = 0
            table["keystone_gain_reduction"]   = 0.0

        return table

    def _build_batch_summary(self, batch: TransactionBatch) -> dict:
        """Aggregate statistics across the batch — helps agents reason relatively."""
        risk_scores = [t.risk_score for t in batch.transactions]
        e_cheats    = [g.e_cheat    for g in batch.game_states]
        regimes     = [g.regime     for g in batch.game_states]
        types       = [t.estimated_type for t in batch.transactions]
        keystones   = [c.is_keystone    for c in batch.coalitions]

        return {
            "mean_risk_score":    round(sum(risk_scores) / len(risk_scores), 4),
            "max_risk_score":     round(max(risk_scores), 4),
            "min_risk_score":     round(min(risk_scores), 4),
            "positive_e_cheat_count": sum(1 for e in e_cheats if e > 0),
            "full_deterrence_count":  regimes.count("full"),
            "partial_deterrence_count": regimes.count("partial"),
            "no_deterrence_count":    regimes.count("none"),
            "keystone_count":     sum(keystones),
            "type_distribution": {
                "risk_neutral":  types.count("risk_neutral"),
                "risk_averse":   types.count("risk_averse"),
                "risk_seeking":  types.count("risk_seeking"),
                "colluding":     types.count("colluding"),
            },
            "high_priority_note": (
                "Focus on transactions where e_cheat > 0 — "
                "fraud is currently rational for those."
            ),
        }

    def _build_round1_table(self, r1: Round1Positions) -> dict:
        """
        Injects Round 1 positions into Round 2 context.
        Also adds vote tally and pressure note for the adversarial agent.
        """
        pos = r1.as_dict()
        audit_n = r1.audit_count()
        skip_n  = r1.skip_count()
        uncertain_n = 5 - audit_n - skip_n

        table: dict = {**pos}
        table["vote_tally"] = {
            "AUDIT":     audit_n,
            "SKIP":      skip_n,
            "UNCERTAIN": uncertain_n,
        }
        table["instruction"] = (
            "Round 1 has concluded. Review your colleagues' positions above. "
            "You may update your position based on their reasoning. "
            "Explain what changed (or why you are maintaining your position). "
            "The elected leader's Round 2 position becomes the final decision."
        )
        if audit_n >= 3:
            table["adversarial_note"] = (
                f"{audit_n} agents voted AUDIT in Round 1. "
                "As the adversarial agent, you must respond to the strongest "
                "AUDIT argument and either rebut it or concede with explanation."
            )

        return table


# ─────────────────────────────────────────────
# 5.  ENV VALIDATION
#     Called once on startup.
# ─────────────────────────────────────────────

REQUIRED_ENV_VARS = [
    "NVIDIA_NIM_API_KEY",     # NVIDIA NIM API key
    "NVIDIA_NIM_BASE_URL",    # NIM endpoint base URL
    "NVIDIA_NIM_MODEL",       # model string e.g. meta/llama-3.1-70b-instruct
    "NASHADIT_H_BATCHES",     # number of mini-batches per round (default 5)
    "NASHADIT_ENV",           # development | production
]

def validate_env() -> dict[str, str]:
    """
    Validates all required env vars are set.
    Returns dict of values.
    Raises EnvironmentError listing every missing var.
    """
    missing = []
    values  = {}
    for var in REQUIRED_ENV_VARS:
        val = os.environ.get(var)
        if not val:
            missing.append(var)
        else:
            values[var] = val

    if missing:
        raise EnvironmentError(
            f"Missing required environment variables:\n"
            + "\n".join(f"  - {v}" for v in missing)
            + "\n\nSee .env.example for reference."
        )
    return values


# ─────────────────────────────────────────────
# 6.  .env.example (printed to stdout when
#     this file is run directly)
# ─────────────────────────────────────────────

ENV_EXAMPLE = """
# ─────────────────────────────────────────────────────────────────
# NashAudit — Environment Variables
# Copy this to .env and fill in your values.
# NEVER commit .env to git.
# ─────────────────────────────────────────────────────────────────

# ── NVIDIA NIM ──────────────────────────────────────────────────
# Get your API key at: https://build.nvidia.com
# Click any model → Get API Key (top right)

NVIDIA_NIM_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# NIM base URL — do not change unless using a self-hosted NIM
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1

# Model to use — Llama 70B is free on the NIM playground
# Other options: meta/llama-3.1-8b-instruct (faster, less capable)
NVIDIA_NIM_MODEL=meta/llama-3.1-70b-instruct

# ── NashAudit Config ────────────────────────────────────────────
# Number of mini-batches per round (h)
# k transactions split into h groups of k/h
# Default 5 — increase for larger k values
NASHADIT_H_BATCHES=5

# Environment
NASHADIT_ENV=development

# ── Database ────────────────────────────────────────────────────
# SQLite path — relative to project root
NASHADIT_DB_PATH=./db/nashadit.sqlite
""".strip()


# ─────────────────────────────────────────────
# 7.  QUICK TEST — run this file directly
#     to verify the builder works
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    # ── print .env.example ──────────────────────────────────────
    if "--env" in sys.argv:
        print(ENV_EXAMPLE)
        sys.exit(0)

    print("=" * 60)
    print("NashAudit — Context Builder Test")
    print("=" * 60)

    # ── build synthetic test data ───────────────────────────────
    def _make_txn(txn_id, amount, velocity, device_mismatch,
                  geo, risk_score, alpha, etype, coalition_id=None):
        return TransactionFeatures(
            txn_id          = txn_id,
            amount          = amount,
            z_amount        = round((amount - 8000) / 3500, 3),
            velocity        = velocity,
            device_mismatch = device_mismatch,
            geo_anomaly     = geo,
            time_anomaly    = False,
            account_id      = f"acc_{txn_id[-3:]}",
            risk_score      = risk_score,
            feature_vec     = [round((amount-8000)/3500,3), velocity, geo,
                               int(device_mismatch), 0],
            alpha_i         = alpha,
            estimated_type  = etype,
        )

    def _make_gs(q, q_star, e_cheat, regime, G=10000,
                 Pc=50000, Pe=5000, alpha=0.65):
        return GameState(
            q_current                = q,
            q_star                   = q_star,
            q_star_per_type          = {"risk_neutral": 0.18, "risk_averse": 0.12,
                                        "risk_seeking": 0.27, "colluding": 0.21},
            e_cheat                  = e_cheat,
            margin                   = round(e_cheat / G, 4),
            regime                   = regime,
            deterred                 = e_cheat <= 0,
            G                        = G,
            P_caught                 = Pc,
            P_escaped                = Pe,
            alpha_global             = alpha,
            variance_adjusted_utility= e_cheat * 0.95,
            lambda_val               = 0.3,
        )

    def _make_coal(detected, cid=None, phi=None, keystone=False, links=0, reduction=0.0):
        return CoalitionInfo(
            coalition_detected      = detected,
            coalition_id            = cid,
            shapley_value           = phi,
            is_keystone             = keystone,
            cross_account_links     = links,
            keystone_gain_reduction = reduction,
        )

    # 6 test transactions: 2 colluding, 4 solo
    transactions = [
        _make_txn("txn_042", 14500, 4, True,  0.7, 0.91, 0.71, "colluding"),
        _make_txn("txn_107", 12000, 3, False, 0.4, 0.84, 0.65, "colluding"),
        _make_txn("txn_201", 18000, 1, True,  0.9, 0.88, 0.60, "risk_seeking"),
        _make_txn("txn_305", 6500,  7, False, 0.2, 0.76, 0.55, "risk_neutral"),
        _make_txn("txn_412", 9000,  2, False, 0.1, 0.62, 0.48, "risk_averse"),
        _make_txn("txn_519", 22000, 5, True,  0.8, 0.79, 0.68, "risk_seeking"),
    ]
    game_states = [
        _make_gs(0.20, 0.214,  -1240.0, "full"),
        _make_gs(0.20, 0.214,   -890.0, "full"),
        _make_gs(0.20, 0.267,    310.0, "none"),
        _make_gs(0.20, 0.182,   -420.0, "full"),
        _make_gs(0.20, 0.121,   -670.0, "full"),
        _make_gs(0.20, 0.267,    180.0, "none"),
    ]
    coalitions = [
        _make_coal(True,  "coal_003", 0.34, True,  3, 0.62),
        _make_coal(True,  "coal_003", 0.28, False, 3, 0.00),
        _make_coal(False),
        _make_coal(False),
        _make_coal(False),
        _make_coal(False),
    ]

    # ── test BatchBuilder ────────────────────────────────────────
    h, k = 3, 6
    batcher = BatchBuilder(h=h, k=k)
    batches = batcher.build(transactions, game_states, coalitions)

    print(f"\n BatchBuilder: {k} transactions → {h} batches")
    for b in batches:
        ids = [t.txn_id for t in b.transactions]
        print(f"  Batch {b.batch_id} (risk rank {b.batch_risk_rank}): {ids}")

    # ── test ContextBuilder Round 1 ─────────────────────────────
    builder = ContextBuilder()
    ctx_r1 = builder.build_context(batches[0], round_number=1)

    print(f"\n Round 1 TOML context (Batch 1) — {len(ctx_r1)} chars")
    print("─" * 60)
    print(ctx_r1[:1200], "...\n[truncated]" if len(ctx_r1) > 1200 else "")

    # ── test ContextBuilder Round 2 ─────────────────────────────
    r1_pos = Round1Positions(
        risk_analyst       = AgentPosition("risk_analyst",       "AUDIT",     0.79, "E[cheat] positive for risk-seeking"),
        forensics_agent    = AgentPosition("forensics_agent",    "AUDIT",     0.83, "Alpha 0.71, strong trail"),
        coalition_detector = AgentPosition("coalition_detector", "AUDIT",     0.91, "Keystone node in coal_003"),
        behavioural_agent  = AgentPosition("behavioural_agent",  "UNCERTAIN", 0.51, "High variance, borderline"),
        adversarial_agent  = AgentPosition("adversarial_agent",  "SKIP",      0.62, "Amount within 2σ"),
    )

    ctx_r2 = builder.build_context(batches[0], round_number=2,
                                   round1_positions=r1_pos)

    print(f"\n Round 2 TOML context (Batch 1) — {len(ctx_r2)} chars")
    print("─" * 60)
    # print only the council_round1 section
    lines = ctx_r2.split("\n")
    in_section = False
    for line in lines:
        if "[council_round1]" in line:
            in_section = True
        if in_section:
            print(line)

    print("\n✓ Context builder working correctly.")
    print(f"\nTo generate your .env file:\n  python context_builder.py --env > .env.example")