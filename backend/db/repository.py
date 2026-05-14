"""
NashAudit — Database Repository
CRUD operations for simulations, rounds, transactions, agent priors, coalitions.
"""

import json
import sqlite3
from datetime import datetime
from typing import Optional

from .schema import get_connection


# ─── Simulations ───

def create_simulation(sim_id: str, config_toml: str, status: str = "created") -> dict:
    conn = get_connection()
    now = datetime.utcnow().isoformat()
    conn.execute(
        "INSERT INTO simulations (id, status, config_toml, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (sim_id, status, config_toml, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM simulations WHERE id = ?", (sim_id,)).fetchone()
    conn.close()
    return dict(row)


def get_simulation(sim_id: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM simulations WHERE id = ?", (sim_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_simulation_status(sim_id: str, status: str):
    conn = get_connection()
    conn.execute(
        "UPDATE simulations SET status = ?, updated_at = ? WHERE id = ?",
        (status, datetime.utcnow().isoformat(), sim_id),
    )
    conn.commit()
    conn.close()


def list_simulations() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM simulations ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Rounds ───

def save_round(simulation_id: str, round_number: int, **layer_outputs) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO rounds
           (simulation_id, round_number, layer1_output, layer2_output,
            layer3_output, layer4_output, layer5_output, round_kpis, llm_context)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            simulation_id,
            round_number,
            layer_outputs.get("layer1_output"),
            layer_outputs.get("layer2_output"),
            layer_outputs.get("layer3_output"),
            layer_outputs.get("layer4_output"),
            layer_outputs.get("layer5_output"),
            layer_outputs.get("round_kpis"),
            layer_outputs.get("llm_context"),
        ),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_rounds(simulation_id: str) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM rounds WHERE simulation_id = ? ORDER BY round_number",
        (simulation_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_latest_round(simulation_id: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM rounds WHERE simulation_id = ? ORDER BY round_number DESC LIMIT 1",
        (simulation_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Transactions ───

def save_transactions(simulation_id: str, round_number: int, transactions: list[dict]):
    conn = get_connection()
    conn.executemany(
        "INSERT OR REPLACE INTO transactions (id, simulation_id, round_number, data, audited) VALUES (?, ?, ?, ?, ?)",
        [(t["id"], simulation_id, round_number, json.dumps(t), 0) for t in transactions],
    )
    conn.commit()
    conn.close()


def get_transactions(simulation_id: str, round_number: Optional[int] = None) -> list[dict]:
    conn = get_connection()
    if round_number is not None:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE simulation_id = ? AND round_number = ?",
            (simulation_id, round_number),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM transactions WHERE simulation_id = ? ORDER BY round_number",
            (simulation_id,),
        ).fetchall()
    conn.close()
    return [json.loads(dict(r)["data"]) for r in rows]


def mark_audited(transaction_ids: list[str]):
    conn = get_connection()
    conn.executemany(
        "UPDATE transactions SET audited = 1 WHERE id = ?",
        [(tid,) for tid in transaction_ids],
    )
    conn.commit()
    conn.close()


# ─── Agent Priors ───

def save_agent_priors(simulation_id: str, priors: dict):
    conn = get_connection()
    now = datetime.utcnow().isoformat()
    for agent_id, p in priors.items():
        conn.execute(
            """INSERT OR REPLACE INTO agent_priors
               (simulation_id, agent_id, alpha, beta, rounds_led, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (simulation_id, agent_id, p["alpha"], p["beta"], p.get("rounds_led", 0), now),
        )
    conn.commit()
    conn.close()


def get_agent_priors(simulation_id: str) -> dict:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM agent_priors WHERE simulation_id = ?",
        (simulation_id,),
    ).fetchall()
    conn.close()
    result = {}
    for r in rows:
        d = dict(r)
        result[d["agent_id"]] = {
            "alpha": d["alpha"],
            "beta": d["beta"],
            "rounds_led": d["rounds_led"],
        }
    return result


# ─── Coalitions ───

def save_coalitions(simulation_id: str, round_number: int, coalitions: list[dict]):
    conn = get_connection()
    conn.executemany(
        "INSERT OR REPLACE INTO coalitions (id, simulation_id, round_number, data) VALUES (?, ?, ?, ?)",
        [(c["id"], simulation_id, round_number, json.dumps(c)) for c in coalitions],
    )
    conn.commit()
    conn.close()


def get_coalitions(simulation_id: str, round_number: Optional[int] = None) -> list[dict]:
    conn = get_connection()
    if round_number is not None:
        rows = conn.execute(
            "SELECT data FROM coalitions WHERE simulation_id = ? AND round_number = ?",
            (simulation_id, round_number),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT data FROM coalitions WHERE simulation_id = ?",
            (simulation_id,),
        ).fetchall()
    conn.close()
    return [json.loads(dict(r)["data"]) for r in rows]


# ─── LLM Calls ───

def log_llm_call(simulation_id: str, round_number: int, agent_id: str,
                 context_toml: str, response_raw: str = None,
                 position: str = None, confidence: float = None,
                 reasoning: str = None, latency_ms: int = None,
                 stub_used: bool = True):
    conn = get_connection()
    conn.execute(
        """INSERT INTO llm_calls
           (simulation_id, round_number, agent_id, context_toml, response_raw,
            position, confidence, reasoning, latency_ms, stub_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (simulation_id, round_number, agent_id, context_toml, response_raw,
         position, confidence, reasoning, latency_ms, 1 if stub_used else 0),
    )
    conn.commit()
    conn.close()
