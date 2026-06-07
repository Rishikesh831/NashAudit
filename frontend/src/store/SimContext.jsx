import { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { createSimulation, executeRound, getSimulationState, setupPreview } from '../api/api';

const SimContext = createContext(null);

const DEFAULT_PARAMS = {
  N: 200,
  k: 30,
  G: 10000,
  alpha: 0.65,
  P_caught: 50000,
  P_escaped: 5000,
  typeMix: [30, 25, 25, 20],
  timeWindow: 24,
  dataMode: 'synthetic',
};

// Agent definitions (for display — backend is source of truth)
export const AGENTS = [
  { id: 'risk_analyst', name: 'Risk Analyst', icon: '📊', color: '#1D9E75', specialty: 'E[cheat] formula analysis' },
  { id: 'forensics_agent', name: 'Forensics Agent', icon: '🔬', color: '#0C447C', specialty: 'α estimation and evidence depth' },
  { id: 'coalition_detector', name: 'Coalition Detector', icon: '🕸️', color: '#7F77DD', specialty: 'Shapley values and graph links' },
  { id: 'behavioural_agent', name: 'Behavioural Agent', icon: '🧠', color: '#BA7517', specialty: 'Variance-adjusted utility' },
  { id: 'adversarial_agent', name: 'Adversarial Agent', icon: '⚖️', color: '#D85A30', specialty: 'Red-team: argues AGAINST audit' },
];

export const FRAUDSTER_TYPES = [
  { id: 'risk_neutral', name: 'Risk-Neutral', color: '#1D9E75', utilityMultiplier: 1.0 },
  { id: 'risk_averse', name: 'Risk-Averse', color: '#D4A843', utilityMultiplier: 0.7 },
  { id: 'risk_seeking', name: 'Risk-Seeking', color: '#E06C5A', utilityMultiplier: 1.4 },
  { id: 'colluding', name: 'Colluding', color: '#8B6CC1', utilityMultiplier: 1.2 },
];

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PARAM':
      return { ...state, params: { ...state.params, [action.key]: action.value } };

    case 'SET_TYPE_MIX': {
      const newMix = [...state.params.typeMix];
      newMix[action.index] = action.value;
      return { ...state, params: { ...state.params, typeMix: newMix } };
    }

    case 'SET_DATA_MODE':
      return { ...state, params: { ...state.params, dataMode: action.value } };

    case 'SET_SIMULATION': {
      return {
        ...state,
        simulationId: action.simulationId,
        transactions: action.transactions || [],
        agentPriors: action.agentPriors || {},
        currentRound: 0,
        roundHistory: [],
        isRunning: false,
        loading: false,
        error: null,
      };
    }

    case 'ADD_ROUND': {
      return {
        ...state,
        roundHistory: [...state.roundHistory, action.roundData],
        agentPriors: action.roundData.agent_priors || state.agentPriors,
        currentRound: state.currentRound + 1,
        loading: false,
      };
    }

    case 'SET_PREVIEW':
      return { ...state, preview: action.data };

    case 'SET_RUNNING':
      return { ...state, isRunning: action.value };

    case 'SET_SPEED':
      return { ...state, speed: action.value };

    case 'SET_LOADING':
      return { ...state, loading: action.value };

    case 'SET_ERROR':
      return { ...state, error: action.value, loading: false };

    case 'RESET':
      return { ...initialState, params: state.params };

    default:
      return state;
  }
}

const initialState = {
  params: DEFAULT_PARAMS,
  simulationId: null,
  transactions: [],
  roundHistory: [],
  agentPriors: {},
  preview: null,
  isRunning: false,
  currentRound: 0,
  speed: 1,
  loading: false,
  error: null,
};

export function SimProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timerRef = useRef(null);

  const setParam = useCallback((key, value) => {
    dispatch({ type: 'SET_PARAM', key, value });
  }, []);

  const setTypeMix = useCallback((index, value) => {
    dispatch({ type: 'SET_TYPE_MIX', index, value });
  }, []);

  const setDataMode = useCallback((value) => {
    dispatch({ type: 'SET_DATA_MODE', value });
  }, []);

  // ─── Create simulation via backend API ───
  const initSimulation = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    try {
      const result = await createSimulation(state.params);
      dispatch({
        type: 'SET_SIMULATION',
        simulationId: result.simulation_id,
        transactions: [],
        agentPriors: {},
      });
      return result;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', value: err.message || 'Failed to create simulation' });
      throw err;
    }
  }, [state.params]);

  // ─── Execute one round via backend API ───
  const runOneRound = useCallback(async () => {
    if (!state.simulationId) return;
    dispatch({ type: 'SET_LOADING', value: true });
    try {
      const roundData = await executeRound(state.simulationId);
      dispatch({ type: 'ADD_ROUND', roundData });
      return roundData;
    } catch (err) {
      dispatch({ type: 'SET_ERROR', value: err.message || 'Failed to execute round' });
      throw err;
    }
  }, [state.simulationId]);

  // ─── Auto-run simulation ───
  const startSimulation = useCallback((maxRounds = 20) => {
    if (!state.simulationId) return;
    dispatch({ type: 'SET_RUNNING', value: true });

    let roundCount = state.currentRound;
    const interval = Math.max(200, 2000 / state.speed);

    const tick = async () => {
      if (roundCount >= maxRounds) {
        stopSimulation();
        return;
      }
      try {
        const roundData = await executeRound(state.simulationId);
        dispatch({ type: 'ADD_ROUND', roundData });
        roundCount++;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', value: err.message });
        stopSimulation();
      }
    };

    timerRef.current = setInterval(tick, interval);
  }, [state.simulationId, state.currentRound, state.speed]);

  const stopSimulation = useCallback(() => {
    dispatch({ type: 'SET_RUNNING', value: false });
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setSpeed = useCallback((value) => {
    dispatch({ type: 'SET_SPEED', value });
  }, []);

  // ─── Preview via backend API (debounced by caller) ───
  const fetchPreview = useCallback(async (params) => {
    try {
      const data = await setupPreview(params || state.params);
      dispatch({ type: 'SET_PREVIEW', data });
      return data;
    } catch (err) {
      // Silently fail preview — non-critical
      console.warn('Preview failed:', err);
    }
  }, [state.params]);

  const value = {
    state,
    dispatch,
    setParam,
    setTypeMix,
    setDataMode,
    initSimulation,
    runOneRound,
    startSimulation,
    stopSimulation,
    setSpeed,
    fetchPreview,
    timerRef,
  };

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error('useSim must be used within SimProvider');
  return ctx;
}

export { DEFAULT_PARAMS };
