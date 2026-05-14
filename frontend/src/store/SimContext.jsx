import { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { createInitialState, runSimulationRound, FRAUDSTER_TYPES, AGENTS } from '../engine/simulation';

const SimContext = createContext(null);

const DEFAULT_PARAMS = {
  N: 200,
  k: 30,
  G: 10000,
  alpha: 0.65,
  P_caught: 50000,
  P_escaped: 5000,
  typeMix: [30, 25, 25, 20], // Risk-neutral, Risk-averse, Risk-seeking, Colluding
  timeWindow: 24,
  dataMode: 'synthetic', // 'synthetic' | 'csv'
};

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

    case 'INIT_SIMULATION': {
      const initial = createInitialState(state.params);
      return { ...state, ...initial, currentRound: 0, isRunning: false };
    }

    case 'ADD_ROUND': {
      return {
        ...state,
        roundHistory: [...state.roundHistory, action.roundData],
        agentPriors: action.newPriors,
        currentRound: state.currentRound + 1,
      };
    }

    case 'SET_RUNNING':
      return { ...state, isRunning: action.value };

    case 'SET_SPEED':
      return { ...state, speed: action.value };

    case 'RESET':
      return { ...initialState, params: state.params };

    default:
      return state;
  }
}

const initialState = {
  params: DEFAULT_PARAMS,
  transactions: [],
  roundHistory: [],
  agentPriors: {},
  isRunning: false,
  currentRound: 0,
  speed: 1,
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

  const initSimulation = useCallback(() => {
    dispatch({ type: 'INIT_SIMULATION' });
  }, []);

  const runOneRound = useCallback(() => {
    // Use a callback form to access latest state
    dispatch((prevState) => prevState); // no-op to get state
  }, []);

  const startSimulation = useCallback((maxRounds = 20) => {
    dispatch({ type: 'SET_RUNNING', value: true });
  }, []);

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

  const value = {
    state,
    dispatch,
    setParam,
    setTypeMix,
    setDataMode,
    initSimulation,
    startSimulation,
    stopSimulation,
    setSpeed,
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
