"""
NashAudit — TOML Config Loader
Phase 1, Task 2: Load all TOML configs on startup.
"""

import tomllib
from pathlib import Path
from typing import Any

CONFIG_DIR = Path(__file__).parent.parent / "config"

_cache: dict[str, Any] = {}


def _load(filename: str) -> dict:
    """Load and cache a TOML config file."""
    if filename not in _cache:
        path = CONFIG_DIR / filename
        with open(path, "rb") as f:
            _cache[filename] = tomllib.load(f)
    return _cache[filename]


def get_simulation_defaults() -> dict:
    """Return simulation defaults from simulation_defaults.toml."""
    return _load("simulation_defaults.toml")


def get_weights() -> dict:
    """Return layer weights from weights.toml."""
    return _load("weights.toml")


def get_agents() -> dict:
    """Return agent definitions from agents.toml."""
    return _load("agents.toml")["agents"]


def get_agent_list() -> list[dict]:
    """Return agent definitions as a flat list."""
    agents = get_agents()
    return list(agents.values())


def get_system_prompts() -> dict:
    """Return LLM system prompts from system_prompts.toml."""
    return _load("system_prompts.toml")["prompts"]


def get_bandit_config() -> dict:
    """Return Thompson Sampling config from bandit.toml."""
    return _load("bandit.toml")


def build_default_params() -> dict:
    """Build the default simulation parameter set from TOML configs."""
    defaults = get_simulation_defaults()
    batch = defaults["batch"]
    mix = defaults["fraudster_mix"]
    game = defaults["game_params"]
    det = defaults["deterrence"]

    return {
        "N": batch["N"],
        "k": batch["k"],
        "time_window_hours": batch["time_window_hours"],
        "data_mode": batch["data_mode"],
        "fraudster_mix": {
            "risk_neutral": mix["risk_neutral"],
            "risk_averse": mix["risk_averse"],
            "risk_seeking": mix["risk_seeking"],
            "colluding": mix["colluding"],
        },
        "G": game["G"],
        "P_caught": game["P_caught"],
        "P_escaped": game["P_escaped"],
        "alpha": game["alpha"],
        "lambda_risk_averse": det["lambda_risk_averse"],
        "lambda_risk_seeking": det["lambda_risk_seeking"],
        "beta_synergy": det["beta_synergy"],
        "partial_regime_threshold": det["partial_regime_threshold"],
    }


def reload_configs():
    """Clear cache and reload all configs (for hot-reload during development)."""
    _cache.clear()
