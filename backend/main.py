"""
NashAudit — FastAPI Application
Main entry point. Wires all routers, initializes DB, loads TOML configs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.schema import init_db
from .engine.config_loader import get_simulation_defaults, get_agents, get_weights
from .api.simulation import router as simulation_router
from .api.round import router as round_router
from .api.setup import router as setup_router
from .api.council_stream import router as council_router

app = FastAPI(
    title="NashAudit",
    description="Bayesian Stackelberg Security Game for Digital Payment Fraud Deterrence",
    version="2.0.0",
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


@app.on_event("startup")
def on_startup():
    """Initialize database and load configs on startup."""
    init_db()
    # Validate configs load correctly
    defaults = get_simulation_defaults()
    agents = get_agents()
    weights = get_weights()
    print(f"[OK] Configs loaded -- {len(agents)} agents, defaults: N={defaults['batch']['N']}, k={defaults['batch']['k']}")


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
    return {"status": "ok"}
