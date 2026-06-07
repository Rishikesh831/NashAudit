/**
 * NashAudit — API Client
 * Central module for all backend API communication.
 * Replaces local JS simulation engine.
 */

const BASE_URL = 'http://127.0.0.1:8000';

class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);

  if (!res.ok) {
    let errData;
    try { errData = await res.json(); } catch { errData = { detail: res.statusText }; }
    throw new APIError(
      errData.detail || `API error: ${res.status}`,
      res.status,
      errData,
    );
  }

  return res.json();
}

// ─── Simulation ───────────────────────────────────────────────

/**
 * POST /simulation/create
 * Create a new simulation with the given parameters.
 */
export async function createSimulation(params) {
  const body = {
    N: params.N,
    k: params.k,
    time_window_hours: params.timeWindow || 24,
    data_mode: params.dataMode || 'synthetic',
    G: params.G,
    P_caught: params.P_caught,
    P_escaped: params.P_escaped,
    alpha: params.alpha,
    fraudster_mix: {
      risk_neutral: (params.typeMix?.[0] ?? 30) / 100,
      risk_averse: (params.typeMix?.[1] ?? 25) / 100,
      risk_seeking: (params.typeMix?.[2] ?? 20) / 100,
      colluding: (params.typeMix?.[3] ?? 25) / 100,
    },
  };
  return request('POST', '/simulation/create', body);
}

/**
 * GET /simulation/{id}/state
 * Get full simulation state.
 */
export async function getSimulationState(simId) {
  return request('GET', `/simulation/${simId}/state`);
}

/**
 * GET /simulation/{id}/game-state
 * Get game theory data for visualiser.
 */
export async function getGameState(simId) {
  return request('GET', `/simulation/${simId}/game-state`);
}

/**
 * GET /simulation/{id}/comparison
 * Get strategy comparison data.
 */
export async function getComparison(simId) {
  return request('GET', `/simulation/${simId}/comparison`);
}

// ─── Round Execution ──────────────────────────────────────────

/**
 * POST /round/execute/{sim_id}
 * Execute a single simulation round.
 */
export async function executeRound(simId) {
  return request('POST', `/round/execute/${simId}`);
}

/**
 * GET /round/{sim_id}/history
 * Get all rounds for a simulation.
 */
export async function getRoundHistory(simId) {
  return request('GET', `/round/${simId}/history`);
}

/**
 * GET /round/{sim_id}/{round_number}/council-result
 * Get detailed council result for a specific round.
 */
export async function getCouncilResult(simId, roundNumber) {
  return request('GET', `/round/${simId}/${roundNumber}/council-result`);
}

// ─── Setup Preview ────────────────────────────────────────────

/**
 * POST /setup/preview
 * Live deterrence preview calculation.
 */
export async function setupPreview(params) {
  const body = {
    N: params.N,
    k: params.k,
    G: params.G,
    P_caught: params.P_caught,
    P_escaped: params.P_escaped,
    alpha: params.alpha,
    fraudster_mix: {
      risk_neutral: (params.typeMix?.[0] ?? 30) / 100,
      risk_averse: (params.typeMix?.[1] ?? 25) / 100,
      risk_seeking: (params.typeMix?.[2] ?? 20) / 100,
      colluding: (params.typeMix?.[3] ?? 25) / 100,
    },
  };
  return request('POST', '/setup/preview', body);
}

/**
 * GET /setup/defaults
 * Get default simulation parameters.
 */
export async function getDefaults() {
  return request('GET', '/setup/defaults');
}

/**
 * POST /setup/best-response-curves
 * Get best response curve data.
 */
export async function getBestResponseCurves(params) {
  return request('POST', '/setup/best-response-curves', {
    N: params.N,
    k: params.k,
    G: params.G,
    P_caught: params.P_caught,
    P_escaped: params.P_escaped,
    alpha: params.alpha,
  });
}

// ─── Health ───────────────────────────────────────────────────

/**
 * GET /health
 * Check backend health and service status.
 */
export async function checkHealth() {
  try {
    return await request('GET', '/health');
  } catch {
    return { status: 'unreachable' };
  }
}

// ─── SSE Stream ───────────────────────────────────────────────

/**
 * Connect to the council SSE stream.
 * Returns an EventSource instance.
 * 
 * @param {string} simId - Simulation ID
 * @param {number} roundNumber - Round number
 * @param {object} handlers - Event handlers: { onToken, onAgentComplete, onRoundComplete, onLeaderElected, onFinalDecision, onStreamEnd, onError }
 * @returns {{ close: Function }} - Call close() to disconnect
 */
export function streamCouncil(simId, roundNumber, handlers = {}) {
  const url = `${BASE_URL}/council/stream/${simId}/${roundNumber}`;
  const source = new EventSource(url);

  source.addEventListener('round_start', (e) => {
    handlers.onRoundStart?.(JSON.parse(e.data));
  });

  source.addEventListener('agent_token', (e) => {
    handlers.onToken?.(JSON.parse(e.data));
  });

  source.addEventListener('agent_complete', (e) => {
    handlers.onAgentComplete?.(JSON.parse(e.data));
  });

  source.addEventListener('round_complete', (e) => {
    handlers.onRoundComplete?.(JSON.parse(e.data));
  });

  source.addEventListener('leader_elected', (e) => {
    handlers.onLeaderElected?.(JSON.parse(e.data));
  });

  source.addEventListener('final_decision', (e) => {
    handlers.onFinalDecision?.(JSON.parse(e.data));
  });

  source.addEventListener('stream_end', (e) => {
    handlers.onStreamEnd?.(JSON.parse(e.data));
    source.close();
  });

  source.onerror = (e) => {
    handlers.onError?.(e);
    source.close();
  };

  return {
    close: () => source.close(),
    source,
  };
}

export { APIError };
