"""
NashAudit — FastAPI Application
Main entry point. Wires all routers, initializes DB, loads TOML configs,
trains ML models, and validates NIM availability.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.schema import init_db
from .engine.config_loader import get_simulation_defaults, get_agents, get_weights
from .engine.ml_models import train_models, get_model_status
from .engine.nim_client import get_nim_client
from .api.simulation import router as simulation_router
from .api.round import router as round_router
from .api.setup import router as setup_router
from .api.council_stream import router as council_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("nashaudit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # ── Startup ──
    init_db()
    logger.info("Database initialized.")

    # Validate configs
    defaults = get_simulation_defaults()
    agents = get_agents()
    weights = get_weights()
    logger.info(
        f"Configs loaded — {len(agents)} agents, defaults: N={defaults['batch']['N']}, k={defaults['batch']['k']}"
    )

    # Train ML models on synthetic data
    ml_success = train_models(n_samples=5000)
    status = get_model_status()
    logger.info(f"ML models: {status}")

    # Check NIM availability (non-blocking)
    nim = get_nim_client()
    if nim.is_configured:
        try:
            available = await nim.check_availability()
            if available:
                logger.info("NVIDIA NIM API is available. Council will use real LLM.")
            else:
                logger.warning("NVIDIA NIM API check failed. Council will use stub fallback.")
        except Exception as e:
            logger.warning(f"NIM availability check error: {e}. Using stub fallback.")
    else:
        logger.warning("NVIDIA_NIM_API_KEY not set. Council will use stub fallback.")

    logger.info("NashAudit backend ready.")
    yield
    # ── Shutdown ──
    logger.info("NashAudit backend shutting down.")


app = FastAPI(
    title="NashAudit",
    description="Bayesian Stackelberg Security Game for Digital Payment Fraud Deterrence",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(simulation_router)
app.include_router(round_router)
app.include_router(setup_router)
app.include_router(council_router)


@app.get("/")
def root():
    return {
        "service": "NashAudit",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    nim = get_nim_client()
    ml = get_model_status()
    return {
        "status": "ok",
        "ml_models": ml,
        "nim_configured": nim.is_configured,
        "nim_available": nim._available,
    }
