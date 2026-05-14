"""
NashAudit — SQLite Schema & Migrations
Phase 1, Task 1: Database schema as defined in NashAudit.md §5
"""

import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent / "nashaudit.db"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS simulations (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'created',
    config_toml TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rounds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_id   TEXT NOT NULL,
    round_number    INTEGER NOT NULL,
    layer1_output   TEXT,
    layer2_output   TEXT,
    layer3_output   TEXT,
    layer4_output   TEXT,
    layer5_output   TEXT,
    round_kpis      TEXT,
    llm_context     TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id             TEXT PRIMARY KEY,
    simulation_id  TEXT NOT NULL,
    round_number   INTEGER NOT NULL,
    data           TEXT NOT NULL,
    audited        INTEGER DEFAULT 0,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE IF NOT EXISTS agent_priors (
    simulation_id  TEXT NOT NULL,
    agent_id       TEXT NOT NULL,
    alpha          REAL NOT NULL DEFAULT 1.0,
    beta           REAL NOT NULL DEFAULT 1.0,
    rounds_led     INTEGER DEFAULT 0,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (simulation_id, agent_id),
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE IF NOT EXISTS coalitions (
    id             TEXT PRIMARY KEY,
    simulation_id  TEXT NOT NULL,
    round_number   INTEGER NOT NULL,
    data           TEXT NOT NULL,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);

CREATE TABLE IF NOT EXISTS llm_calls (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_id  TEXT NOT NULL,
    round_number   INTEGER NOT NULL,
    agent_id       TEXT NOT NULL,
    context_toml   TEXT NOT NULL,
    response_raw   TEXT,
    position       TEXT,
    confidence     REAL,
    reasoning      TEXT,
    latency_ms     INTEGER,
    stub_used      INTEGER DEFAULT 1,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (simulation_id) REFERENCES simulations(id)
);
"""


def get_connection() -> sqlite3.Connection:
    """Get a connection to the SQLite database."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database with the schema."""
    conn = get_connection()
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    conn.close()
    print(f"[OK] Database initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
