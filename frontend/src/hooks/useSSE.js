/**
 * NashAudit — useSSE Hook
 * Custom React hook for consuming the council SSE stream.
 * 
 * Usage:
 *   const { startStream, tokens, agentResults, leader, finalDecision, isStreaming, error } = useSSE();
 *   startStream(simId, roundNumber);
 */

import { useState, useCallback, useRef } from 'react';
import { streamCouncil } from '../api/api';

export function useSSE() {
  const [tokens, setTokens] = useState({});          // { agent_id: "accumulated text" }
  const [agentResults, setAgentResults] = useState([]); // completed agent results
  const [roundPositions, setRoundPositions] = useState(null);
  const [leader, setLeader] = useState(null);
  const [finalDecision, setFinalDecision] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const sourceRef = useRef(null);

  const startStream = useCallback((simId, roundNumber) => {
    // Reset state
    setTokens({});
    setAgentResults([]);
    setRoundPositions(null);
    setLeader(null);
    setFinalDecision(null);
    setIsStreaming(true);
    setError(null);

    // Close any existing stream
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    const stream = streamCouncil(simId, roundNumber, {
      onRoundStart: (data) => {
        // Round started
      },

      onToken: (data) => {
        const { agent_id, token } = data;
        setTokens(prev => ({
          ...prev,
          [agent_id]: (prev[agent_id] || '') + token + ' ',
        }));
      },

      onAgentComplete: (data) => {
        setAgentResults(prev => [...prev, data]);
      },

      onRoundComplete: (data) => {
        setRoundPositions(data.positions);
      },

      onLeaderElected: (data) => {
        setLeader(data);
      },

      onFinalDecision: (data) => {
        setFinalDecision(data);
      },

      onStreamEnd: (data) => {
        setIsStreaming(false);
      },

      onError: (e) => {
        setError('Stream connection lost');
        setIsStreaming(false);
      },
    });

    sourceRef.current = stream;
  }, []);

  const stopStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    startStream,
    stopStream,
    tokens,
    agentResults,
    roundPositions,
    leader,
    finalDecision,
    isStreaming,
    error,
  };
}
