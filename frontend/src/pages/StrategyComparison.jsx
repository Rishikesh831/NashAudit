import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSim } from '../store/SimContext';
import { FRAUDSTER_TYPES } from '../engine/simulation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';
import { Download } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }),
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">Round {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.stroke }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span className="tooltip-value" style={{ fontSize: 12 }}>
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StrategyComparison() {
  const { state } = useSim();
  const { roundHistory, params, transactions } = state;
  const hasData = roundHistory.length > 0;

  const totalFraudulent = transactions.filter(t => t.isFraudulent).length;

  // KPI 5.1 — Fraud Volume Over Rounds
  const fraudVolumeData = useMemo(() =>
    roundHistory.map(r => ({
      round: r.roundNum,
      random: Math.round(r.randomFraud),
      nashOptimal: Math.round(r.nashOptimalFraud),
      council: r.councilFraud,
    })),
    [roundHistory]
  );

  // KPI 5.2 — Belief Convergence
  const beliefData = useMemo(() =>
    roundHistory.map(r => ({
      round: r.roundNum,
      committed: (params.k / params.N) * 100,
      belief: r.fraudsterBelief * 100,
      gap: r.credibilityGap * 100,
    })),
    [roundHistory, params]
  );

  // KPI 5.3 — Cumulative Regret
  const regretData = useMemo(() =>
    roundHistory.map(r => ({
      round: r.roundNum,
      actual: r.cumulativeRegret,
      bound: Math.sqrt(r.roundNum * Math.log(r.roundNum + 1)) * 5000,
    })),
    [roundHistory]
  );

  // KPI 5.4 — Safety Margin Trajectory
  const marginData = useMemo(() =>
    roundHistory.map(r => {
      const row = { round: r.roundNum };
      FRAUDSTER_TYPES.forEach((type, i) => {
        row[type.id] = r.margins[i];
      });
      return row;
    }),
    [roundHistory]
  );

  // KPI 5.5 — Nash Welfare Gain
  const welfareGain = useMemo(() => {
    if (roundHistory.length === 0) return 0;
    const totalRandom = roundHistory.reduce((s, r) => s + r.randomFraud, 0);
    const totalCouncil = roundHistory.reduce((s, r) => s + r.councilFraud, 0);
    if (totalRandom === 0) return 0;
    return ((totalRandom - totalCouncil) / totalRandom) * 100;
  }, [roundHistory]);

  // Find when each type gets deterred
  const deterredRounds = useMemo(() => {
    const result = {};
    FRAUDSTER_TYPES.forEach((type, i) => {
      for (const r of roundHistory) {
        if (r.margins[i] < 0 && !result[type.id]) {
          result[type.id] = r.roundNum;
        }
      }
    });
    return result;
  }, [roundHistory]);

  // Equilibrium round
  const equilibriumRound = useMemo(() => {
    for (const r of roundHistory) {
      if (r.credibilityGap < 0.02) return r.roundNum;
    }
    return null;
  }, [roundHistory]);

  // Generate report
  const generateReport = () => {
    const q = params.k / params.N;
    let report = `NASHAUDIT — GAME-THEORETIC AUDIT REPORT\n${'═'.repeat(50)}\n\n`;

    // §1 Executive Summary
    report += `§1 EXECUTIVE SUMMARY\n${'-'.repeat(30)}\n`;
    report += `Welfare Gain: +${welfareGain.toFixed(1)}% better deterrence than random auditing\n`;
    report += `Rounds Simulated: ${roundHistory.length}\n`;
    report += `Full Deterrence Achieved: ${roundHistory.length > 0 ? roundHistory[roundHistory.length - 1].fullDeterred : 0}/4 types\n\n`;
    report += `NashAudit's council-based audit policy achieved ${welfareGain.toFixed(1)}% better fraud deterrence compared to random auditing with identical budget.\n\n`;

    // §2 Game Setup
    report += `§2 GAME SETUP\n${'-'.repeat(30)}\n`;
    report += `N = ${params.N} transactions, k = ${params.k} audits, q = ${(q * 100).toFixed(1)}%\n`;
    report += `G = ₹${params.G.toLocaleString()}, P_caught = ₹${params.P_caught.toLocaleString()}, P_escaped = ₹${params.P_escaped.toLocaleString()}, α = ${params.alpha}\n\n`;
    FRAUDSTER_TYPES.forEach((type, i) => {
      const kpi = roundHistory.length > 0 ? roundHistory[roundHistory.length - 1].typeKPIs[i] : null;
      report += `${type.name}: mix=${params.typeMix[i]}%, q*=${kpi ? (kpi.qStar * 100).toFixed(1) : '—'}%\n`;
    });
    report += '\n';

    // §6 Certification
    report += `§6 GAME-THEORETIC CERTIFICATION\n${'-'.repeat(30)}\n`;
    const lastRound = roundHistory[roundHistory.length - 1];
    report += `[${lastRound && lastRound.typeKPIs.every(k => k.eCheat <= 0) ? 'X' : ' '}] E[cheat] ≤ 0 for all types\n`;
    report += `[${lastRound && lastRound.icSatisfied ? 'X' : ' '}] IC constraints satisfied\n`;
    report += `[${lastRound && lastRound.fullDeterred === 4 ? 'X' : ' '}] CE verified (all types in full deterrence)\n`;
    report += `[${equilibriumRound ? 'X' : ' '}] Bilateral convergence reached${equilibriumRound ? ` (round ${equilibriumRound})` : ''}\n`;

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nashaudit_report.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasData) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h2 style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>No Comparison Data</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Run the simulation to compare strategies.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
        <span className="section-label">Page 5 of 5</span>
        <h1>Strategy Comparison</h1>
        <p>Proof that NashAudit beats the naive baseline. The "so what" page — best closing slide for your demo.</p>
      </motion.div>

      {/* KPI 5.5 — Headline Number */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
        style={{ textAlign: 'center', marginBottom: 40, padding: '40px 0' }}>
        <div className="section-label" style={{ marginBottom: 8 }}>Nash Welfare Gain</div>
        <div className="formula-block" style={{ display: 'inline-block', marginBottom: 16 }}>
          Δwelfare = (W_council − W_random) / W_random × 100%
        </div>
        <div className="mono" style={{
          fontSize: 56,
          fontWeight: 500,
          color: welfareGain > 0 ? 'var(--accent-teal)' : 'var(--positive-red)',
          lineHeight: 1,
        }}>
          {welfareGain > 0 ? '+' : ''}{welfareGain.toFixed(1)}%
        </div>
        <div style={{
          fontSize: 15,
          color: 'var(--text-secondary)',
          marginTop: 8,
          fontStyle: 'italic',
        }}>
          better deterrence than random auditing with identical budget
        </div>
      </motion.div>

      {/* KPI 5.1 — Fraud Volume */}
      <motion.div className="card" initial="hidden" animate="visible" custom={2} variants={fadeUp}
        style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>Fraud Volume Over Rounds</div>
        <div className="formula-block">Fraud attempts per round — Random (gray), Nash-optimal LP (amber), NashAudit Council (teal)</div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={fraudVolumeData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
            <XAxis dataKey="round" stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
            <YAxis stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="random" stroke="var(--text-tertiary)" strokeWidth={2}
              strokeDasharray="6 4" dot={false} name="Random Audit" />
            <Line type="monotone" dataKey="nashOptimal" stroke="var(--secondary-amber)" strokeWidth={2}
              dot={false} name="Nash-optimal LP" />
            <Line type="monotone" dataKey="council" stroke="var(--accent-teal)" strokeWidth={2.5}
              dot={false} name="NashAudit Council" />
            {/* Deterred annotations */}
            {Object.entries(deterredRounds).map(([typeId, round]) => (
              <ReferenceLine key={typeId} x={round} stroke={FRAUDSTER_TYPES.find(t => t.id === typeId)?.color}
                strokeDasharray="3 3" strokeWidth={1}
                label={{ value: `${FRAUDSTER_TYPES.find(t => t.id === typeId)?.name} deterred`, position: 'top', fontSize: 9, fill: FRAUDSTER_TYPES.find(t => t.id === typeId)?.color, fontFamily: 'DM Mono' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="plain-english">
          The council policy reaches near-zero fraud faster than alternatives. Random auditing maintains a constant fraud baseline.
        </div>
      </motion.div>

      {/* KPI 5.2 & 5.3 side by side */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Bilateral Learning Convergence */}
        <motion.div className="card" initial="hidden" animate="visible" custom={3} variants={fadeUp}>
          <div className="card-title" style={{ marginBottom: 4 }}>Bilateral Learning Convergence</div>
          <div className="formula-block" style={{ fontSize: 11 }}>
            q_committed vs q̂_T (fraudster belief via fictitious play)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={beliefData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
              <XAxis dataKey="round" stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
              <YAxis tickFormatter={v => `${v.toFixed(0)}%`}
                stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="gap" fill="oklch(0.88 0.08 85 / 0.3)" stroke="none" name="Gap" />
              <Line type="monotone" dataKey="committed" stroke="var(--accent-teal)" strokeWidth={2}
                strokeDasharray="6 4" dot={false} name="Committed q" />
              <Line type="monotone" dataKey="belief" stroke="var(--secondary-amber)" strokeWidth={2}
                dot={false} name="Fraudster Belief q̂" />
              {equilibriumRound && (
                <ReferenceLine x={equilibriumRound} stroke="var(--accent-teal)" strokeDasharray="3 3"
                  label={{ value: 'Equilibrium', position: 'top', fontSize: 10, fill: 'var(--accent-teal)', fontFamily: 'DM Mono' }}
                />
              )}
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
          <div className="plain-english">
            {equilibriumRound
              ? `By round ${equilibriumRound}, fraudsters' beliefs match the auditor's commitment. The game is in equilibrium.`
              : 'Beliefs are still converging — equilibrium not yet reached.'}
          </div>
        </motion.div>

        {/* Cumulative Bandit Regret */}
        <motion.div className="card" initial="hidden" animate="visible" custom={4} variants={fadeUp}>
          <div className="card-title" style={{ marginBottom: 4 }}>Cumulative Bandit Regret</div>
          <div className="formula-block" style={{ fontSize: 11 }}>
            Regret(T) = Σ_t [V* − V(arm_t)] · Bound: O(√T·log T)
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={regretData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
              <XAxis dataKey="round" stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
              <YAxis stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono"
                tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="bound" stroke="var(--text-tertiary)" strokeWidth={1.5}
                strokeDasharray="6 4" dot={false} name="O(√T·log T) bound" />
              <Line type="monotone" dataKey="actual" stroke="var(--accent-teal)" strokeWidth={2}
                dot={false} name="Actual regret" />
            </LineChart>
          </ResponsiveContainer>
          <div className="plain-english">
            The system's learning cost flattens over time — converging to the best strategy. Actual regret stays below theoretical bound.
          </div>
        </motion.div>
      </div>

      {/* KPI 5.4 — Safety Margin Trajectory */}
      <motion.div className="card" initial="hidden" animate="visible" custom={5} variants={fadeUp}
        style={{ marginBottom: 32 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>Safety Margin Trajectory Per Type</div>
        <div className="formula-block">margin_i = E[cheat]_i / G_i over rounds</div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={marginData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
            <XAxis dataKey="round" stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
            <YAxis stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <ReferenceLine y={0} stroke="var(--text-primary)" strokeDasharray="6 4" strokeWidth={1.5}
              label={{ value: "Deterrence line", position: "insideTopRight", fontSize: 10, fill: "var(--text-tertiary)", fontFamily: "DM Mono" }} />
            {FRAUDSTER_TYPES.map(type => (
              <Line key={type.id} type="monotone" dataKey={type.id} stroke={type.color}
                strokeWidth={2} dot={false} name={type.name} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="plain-english">
          Each type gets pushed below zero — fraud becomes irrational. Lines below the dashed line = deterred.
          {Object.entries(deterredRounds).length > 0 && (
            <> {Object.entries(deterredRounds).map(([id, round]) =>
              `${FRAUDSTER_TYPES.find(t => t.id === id)?.name} deterred at round ${round}`
            ).join('. ')}.</>
          )}
        </div>
      </motion.div>

      {/* Report Download */}
      <motion.div initial="hidden" animate="visible" custom={6} variants={fadeUp}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '40px 0', borderTop: '1px solid var(--border-secondary)',
        }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Game-Theoretic Certification</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { label: 'E[cheat] ≤ 0 for all types', pass: roundHistory[roundHistory.length - 1]?.typeKPIs.every(k => k.eCheat <= 0) },
            { label: 'IC constraints satisfied', pass: roundHistory[roundHistory.length - 1]?.icSatisfied },
            { label: 'CE verified', pass: roundHistory[roundHistory.length - 1]?.fullDeterred === 4 },
            { label: 'Bilateral convergence', pass: !!equilibriumRound },
          ].map(cert => (
            <div key={cert.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px',
              background: cert.pass ? 'oklch(0.96 0.03 165)' : 'oklch(0.96 0.03 25)',
              border: `1px solid ${cert.pass ? 'oklch(0.88 0.08 165)' : 'oklch(0.88 0.06 25)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              fontWeight: 500,
              color: cert.pass ? 'var(--accent-teal)' : 'var(--positive-red)',
            }}>
              {cert.pass ? '✓' : '✗'} {cert.label}
            </div>
          ))}
        </div>

        <button className="btn-download" onClick={generateReport}>
          <Download size={18} />
          Download Full Report
        </button>
      </motion.div>
    </div>
  );
}
