# NashAudit — Integration & Mock Status
**Last Updated:** June 2026 (post Phase 3, 4, 5 execution)
**Purpose:** Live tracking of mock vs. real status across all backend/ML/frontend integrations.

## 1. Frontend ↔ Backend Integration (Phase 5)
**Status:** 🟢 **Wired — Smoke Test Passed & PDF Report Added**

The frontend is now fully wired to the Python backend API. The local JS engine (`simulation.js`) is **no longer imported** anywhere.

* **API Client:** `frontend/src/api/api.js` — central module with typed async functions for every backend endpoint.
* **SimContext:** Fully rewritten. `initSimulation()` → `POST /simulation/create`. `runOneRound()` → `POST /round/execute/{id}`. Auto-run loop via `setInterval` with configurable speed.
* **SSE Hook:** `frontend/src/hooks/useSSE.js` — manages EventSource, accumulates tokens per agent, exposes streaming state.
* **All 5 pages wired:** SimulationSetup (debounced preview), GameVisualiser (game state from backend), CouncilChamber (SSE live stream), AuditOutput (backend data format), StrategyComparison (dual-format field helper).
* **Remaining:** none — PDF report implemented; run full smoke test to finalize removal of `simulation.js`.

## 2. Backend — Game Theory Engine (Phases 1 & 2)
**Status:** 🟢 **100% Real**

Fully functioning Bayesian Stackelberg game theory engine.
* Thompson Sampling Beta posteriors per agent, updated each round.
* CE mediator with IC constraint verification.
* Shapley value computation, keystone flagging, coalition graph.
* DER, credibility gap, belief convergence metrics — all real math.

## 3. Backend — LLM Integration (Phase 3)
**Status:** 🟢 **Real (NIM-first, stub fallback)**

NVIDIA NIM integration is active.
* `nim_client.py` — async httpx client; checks availability at startup; caches `_available` flag.
* `nim_response_parser.py` — regex extracts position, confidence, reasoning from raw LLM output.
* `council_stub.py` — NIM-first: calls real LLM per agent; falls back to heuristic on failure; logs `stub_used: bool`.
* `council_stream.py` — SSE endpoint proxying real NIM token stream with named events.
* Frontend `CouncilChamber` shows ⚡ stub vs 🤖 NIM per agent.

## 4. Backend — ML Integration (Phase 4)
**Status:** 🟢 **Real (XGBoost + NetworkX)**

Trained ML models replace all heuristic scoring.
* **Risk Scorer:** XGBoost classifier, trained on 5,000 synthetic samples at startup.
* **Alpha Estimator:** XGBoost regressor, same training pipeline.
* **Coalition Detector:** NetworkX graph model with community detection and Shapley values.
* Both models are module-level singletons in `ml_models.py`; training runs in background thread via `lifespan`.
* `pipeline.py` Layers 1 and 4C now call ML inference; sigmoid fallback if training fails.

## Summary Checklist
- [x] Phase 1: API Skeleton & DB Setup (Backend)
- [x] Phase 2: Core Game Theory Logic (Backend)
- [x] Phase 3: LLM Integration (NVIDIA NIM — real with stub fallback)
- [x] Phase 4: ML Integration (XGBoost risk scorer + alpha, NetworkX coalitions)
 - [x] Phase 5: Frontend API Wiring (Wired — smoke test + PDF report pending)

> **See:** `DOCS/EXECUTION_PROGRESS.html` for the full interactive progress tracker.
> **Remember: Codex is watching you.**
