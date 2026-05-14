import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSim } from '../store/SimContext';
import {
  FRAUDSTER_TYPES, computeBestResponseCurves, computeECheat,
  computeTypeKPIs, computeQStar, runSimulationRound,
} from '../engine/simulation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Area, AreaChart, ScatterChart,
  Scatter, Cell, PieChart, Pie,
} from 'recharts';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }),
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">q = {typeof label === 'number' ? label.toFixed(2) : label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
          <span className="tooltip-value" style={{ color: p.color }}>
            {typeof p.value === 'number' ? p.value.toFixed(0) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GameVisualiser() {
  const { state, dispatch, stopSimulation } = useSim();
  const { params, transactions, roundHistory, agentPriors, isRunning, currentRound, speed } = state;
  const timerRef = useRef(null);
  const [localSpeed, setLocalSpeed] = useState(speed);

  const p = params;
  const q = p.k / p.N;
  const hasData = transactions.length > 0;
  const latestRound = roundHistory.length > 0 ? roundHistory[roundHistory.length - 1] : null;

  // Best response curves
  const brData = hasData ? computeBestResponseCurves(p.G, p.alpha, p.P_caught, p.P_escaped) : [];

  // Current type KPIs
  const typeKPIs = FRAUDSTER_TYPES.map(type =>
    computeTypeKPIs(type, q, p.G, p.alpha, p.P_caught, p.P_escaped)
  );

  // Deterrence distribution for donut
  const regimeCounts = typeKPIs.reduce((acc, kpi) => {
    acc[kpi.regime] = (acc[kpi.regime] || 0) + 1;
    return acc;
  }, {});
  const donutData = [
    { name: 'Full', value: regimeCounts.full || 0, fill: '#1D9E75' },
    { name: 'Partial', value: regimeCounts.partial || 0, fill: '#D4A843' },
    { name: 'None', value: regimeCounts.none || 0, fill: '#D94F3D' },
  ].filter(d => d.value > 0);

  // Belief convergence data
  const beliefData = roundHistory.map(r => ({
    round: r.roundNum,
    committed: q,
    belief: r.fraudsterBelief,
    gap: Math.abs(q - r.fraudsterBelief),
  }));

  // Heatmap data (simplified as scatter)
  const heatmapData = [];
  for (let qi = 0; qi <= 20; qi++) {
    for (let gi = 1; gi <= 20; gi++) {
      const qVal = qi / 20;
      const gVal = gi * 5000;
      const eCheat = computeECheat(qVal, gVal, p.alpha, p.P_caught, p.P_escaped, 1.0);
      heatmapData.push({ q: qVal, G: gVal, eCheat, color: eCheat > 0 ? '#D94F3D' : '#1D9E75' });
    }
  }

  // Run simulation
  const runOneRound = useCallback(() => {
    if (!hasData) return;
    const result = runSimulationRound({
      transactions,
      params: p,
      roundHistory: state.roundHistory,
      agentPriors: state.agentPriors,
    });
    dispatch({ type: 'ADD_ROUND', roundData: result.roundData, newPriors: result.newPriors });
  }, [hasData, transactions, p, state.roundHistory, state.agentPriors, dispatch]);

  // Auto-run
  useEffect(() => {
    if (isRunning && hasData) {
      timerRef.current = setInterval(() => {
        runOneRound();
      }, 1000 / localSpeed);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, localSpeed, runOneRound, hasData]);

  // Stop after 30 rounds
  useEffect(() => {
    if (currentRound >= 30 && isRunning) {
      dispatch({ type: 'SET_RUNNING', value: false });
    }
  }, [currentRound, isRunning, dispatch]);

  if (!hasData) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h2 style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>No Simulation Data</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Go to Setup and configure your parameters first.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
        <span className="section-label">Page 2 of 5</span>
        <h1>Game Visualiser</h1>
        <p>Real-time game theory execution. Best response curves, deterrence regimes, and fraudster belief convergence.</p>
      </motion.div>

      {/* Controls */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'SET_RUNNING', value: !isRunning })}>
          {isRunning ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {currentRound === 0 ? 'Start' : 'Resume'}</>}
        </button>
        <button className="btn btn-secondary" onClick={runOneRound} disabled={isRunning}>
          <SkipForward size={14} /> Step
        </button>
        <button className="btn btn-secondary" onClick={() => dispatch({ type: 'INIT_SIMULATION' })}>
          <RotateCcw size={14} /> Reset
        </button>
        <div className="speed-control" style={{ marginLeft: 'auto' }}>
          <span>Speed</span>
          <input type="range" min={1} max={10} step={1} value={localSpeed}
            onChange={e => setLocalSpeed(Number(e.target.value))} />
          <span style={{ minWidth: 30 }}>{localSpeed}x</span>
        </div>
        <div className="mono" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Round {currentRound}/30
        </div>
      </motion.div>

      {/* Two Column Layout */}
      <div className="two-col-wide">
        {/* Left Column — Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPI 2.1 — Best Response Curves */}
          <motion.div className="card" initial="hidden" animate="visible" custom={2} variants={fadeUp}>
            <div className="card-title" style={{ marginBottom: 4 }}>Best Response Curves</div>
            <div className="formula-block">BR_i(q) = cheat if q &lt; q*_i, not cheat if q ≥ q*_i</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={brData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                <XAxis dataKey="q" tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                  stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
                <YAxis stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono"
                  tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="var(--text-tertiary)" strokeDasharray="6 4" strokeWidth={1.5}
                  label={{ value: "Deterrence threshold", position: "insideTopRight", fontSize: 10, fill: "var(--text-tertiary)", fontFamily: "DM Mono" }} />
                <ReferenceLine x={q} stroke="var(--accent-teal)" strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: `q=${(q*100).toFixed(0)}%`, position: "top", fontSize: 10, fill: "var(--accent-teal)", fontFamily: "DM Mono" }} />
                {FRAUDSTER_TYPES.map(type => (
                  <Line key={type.id} type="monotone" dataKey={type.id} stroke={type.color}
                    strokeWidth={2} dot={false} name={type.name} />
                ))}
                <Legend />
              </LineChart>
            </ResponsiveContainer>
            <div className="plain-english">
              Each line shows when that type of fraudster stops finding crime profitable. Where a line crosses zero is that type's q* threshold.
            </div>
          </motion.div>

          {/* KPI 2.2 & 2.3 side by side */}
          <div className="grid-2">
            {/* Deterrence Donut */}
            <motion.div className="card" initial="hidden" animate="visible" custom={3} variants={fadeUp}>
              <div className="card-title" style={{ marginBottom: 4 }}>Deterrence Distribution</div>
              <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={75}
                      dataKey="value" stroke="none" paddingAngle={2}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)', textAlign: 'center',
                }}>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 500, color: 'var(--accent-teal)' }}>
                    {regimeCounts.full || 0}/{FRAUDSTER_TYPES.length}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>FULL</div>
                </div>
              </div>
              <div className="plain-english">
                {regimeCounts.full || 0} of {FRAUDSTER_TYPES.length} types fully deterred this round.
              </div>
            </motion.div>

            {/* Payoff Heatmap (scatter approximation) */}
            <motion.div className="card" initial="hidden" animate="visible" custom={4} variants={fadeUp}>
              <div className="card-title" style={{ marginBottom: 4 }}>Payoff Heatmap</div>
              <div className="formula-block">E[cheat] = f(q, G)</div>
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                  <XAxis dataKey="q" name="q" type="number" domain={[0, 1]}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    stroke="var(--text-tertiary)" fontSize={10} fontFamily="DM Mono" />
                  <YAxis dataKey="G" name="G" type="number"
                    tickFormatter={v => `${(v/1000).toFixed(0)}K`}
                    stroke="var(--text-tertiary)" fontSize={10} fontFamily="DM Mono" />
                  <Scatter data={heatmapData}>
                    {heatmapData.map((d, i) => (
                      <Cell key={i} fill={d.color} fillOpacity={Math.min(1, Math.abs(d.eCheat) / 50000)} />
                    ))}
                  </Scatter>
                  {/* Operating point */}
                  <Scatter data={[{ q, G: p.G, eCheat: 0 }]} shape="cross" fill="var(--text-primary)" />
                </ScatterChart>
              </ResponsiveContainer>
              <div className="plain-english">Green zone = fraud is irrational. Your operating point is shown as a cross.</div>
            </motion.div>
          </div>

          {/* KPI 2.4 — Belief Convergence */}
          {roundHistory.length > 0 && (
            <motion.div className="card" initial="hidden" animate="visible" custom={5} variants={fadeUp}>
              <div className="card-title" style={{ marginBottom: 4 }}>Fraudster Belief vs Committed q</div>
              <div className="formula-block">q̂_T = (1/T)·Σ(audits_t/N), Gap = q_committed − q̂_T</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={beliefData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                  <XAxis dataKey="round" stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
                  <YAxis domain={[0, 'auto']} tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="gap" fill="oklch(0.88 0.08 85 / 0.3)" stroke="none" />
                  <Line type="monotone" dataKey="committed" stroke="var(--accent-teal)"
                    strokeWidth={2} strokeDasharray="6 4" dot={false} name="Committed q" />
                  <Line type="monotone" dataKey="belief" stroke="var(--secondary-amber)"
                    strokeWidth={2} dot={false} name="Fraudster belief q̂" />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
              <div className="plain-english">
                Fraudsters currently believe you audit {latestRound ? (latestRound.fraudsterBelief * 100).toFixed(1) : '—'}%.
                Credibility gap = {latestRound ? (latestRound.credibilityGap * 100).toFixed(1) : '—'}%.
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column — Live Decision Table */}
        <div>
          <motion.div className="card" initial="hidden" animate="visible" custom={2} variants={fadeUp}
            style={{ position: 'sticky', top: 72 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Rational Decision Table</div>
            <div className="formula-block" style={{ fontSize: 11, marginBottom: 12 }}>
              Status = f(q, q*_i, E[cheat]_i)
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>q*</th>
                  <th>E[cheat]</th>
                  <th>Margin</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {typeKPIs.map((kpi, i) => {
                  const type = FRAUDSTER_TYPES[i];
                  return (
                    <tr key={type.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: type.color }} />
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{type.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {(kpi.qStar * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <span className={`mono ${kpi.eCheat > 0 ? 'positive' : 'negative'}`}
                          style={{ fontSize: 12, fontWeight: 500, color: kpi.eCheat > 0 ? 'var(--positive-red)' : 'var(--negative-green)' }}>
                          {kpi.eCheat > 0 ? '+' : ''}₹{Math.abs(Math.round(kpi.eCheat)).toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span className="mono" style={{
                          fontSize: 12,
                          color: kpi.margin > 0 ? 'var(--positive-red)' : kpi.margin > -0.1 ? 'var(--secondary-amber)' : 'var(--negative-green)',
                        }}>
                          {kpi.margin > 0 ? '+' : ''}{kpi.margin.toFixed(3)}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${kpi.regime === 'full' ? 'deterred' : kpi.regime === 'partial' ? 'marginal' : 'active'}`}>
                          {kpi.regime === 'full' ? '✓ Deterred' : kpi.regime === 'partial' ? '⚠ Marginal' : '✗ Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Round summary */}
            {latestRound && (
              <div style={{ marginTop: 20, padding: '12px 0', borderTop: '1px solid var(--border-secondary)' }}>
                <div className="section-label" style={{ marginBottom: 8 }}>Round {latestRound.roundNum} Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div className="kpi-label">Fraud Attempts</div>
                    <div className="mono" style={{ fontSize: 18, color: latestRound.fraudAttempts > 0 ? 'var(--positive-red)' : 'var(--negative-green)' }}>
                      {latestRound.fraudAttempts}
                    </div>
                  </div>
                  <div>
                    <div className="kpi-label">Caught</div>
                    <div className="mono" style={{ fontSize: 18, color: 'var(--accent-teal)' }}>
                      {latestRound.fraudCaught}
                    </div>
                  </div>
                  <div>
                    <div className="kpi-label">DER</div>
                    <div className="mono" style={{ fontSize: 18, color: latestRound.DER > 0.7 ? 'var(--accent-teal)' : 'var(--secondary-amber)' }}>
                      {(latestRound.DER * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="kpi-label">IC Status</div>
                    <span className={`status-badge ${latestRound.icSatisfied ? 'deterred' : 'active'}`}>
                      {latestRound.icSatisfied ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
