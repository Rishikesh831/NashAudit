import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSim } from '../store/SimContext';
import { AGENTS } from '../engine/simulation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }),
};

export default function CouncilChamber() {
  const { state } = useSim();
  const { roundHistory, agentPriors } = state;
  const hasData = roundHistory.length > 0;
  const latestRound = hasData ? roundHistory[roundHistory.length - 1] : null;
  const latestDeliberations = latestRound ? latestRound.auditDecisions : [];

  // Agent accuracy data
  const agentAccuracyData = useMemo(() =>
    AGENTS.map(agent => {
      const prior = agentPriors[agent.id] || { alpha: 1, beta: 1, led: 0 };
      const accuracy = prior.alpha / (prior.alpha + prior.beta);
      return {
        ...agent,
        accuracy: Math.round(accuracy * 100),
        alpha: prior.alpha,
        beta: prior.beta,
        led: prior.led,
      };
    }).sort((a, b) => b.accuracy - a.accuracy),
    [agentPriors]
  );

  // Leadership frequency
  const leadershipData = useMemo(() => {
    const counts = {};
    AGENTS.forEach(a => { counts[a.id] = 0; });
    roundHistory.forEach(r => {
      r.auditDecisions.forEach(d => {
        counts[d.deliberation.leader.id] = (counts[d.deliberation.leader.id] || 0) + 1;
      });
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return AGENTS.map(a => ({
      name: a.name,
      value: counts[a.id],
      pct: Math.round((counts[a.id] / total) * 100),
      fill: a.color,
    }));
  }, [roundHistory]);

  // Pick one deliberation to showcase
  const showcaseDelib = latestDeliberations.length > 0 ? latestDeliberations[0] : null;

  if (!hasData) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h2 style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>Council Not Convened</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Run at least one simulation round to see council deliberations.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
        <span className="section-label">Page 3 of 5</span>
        <h1>Council Chamber</h1>
        <p>The deliberative multi-agent council in action. Five specialised agents debate each audit decision.</p>
      </motion.div>

      {/* Top Bar — Leader + Consensus */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
        className="grid-2" style={{ marginBottom: 24 }}>

        {/* KPI 3.1 — Elected Leader */}
        <div className="card">
          <div className="kpi-label">Elected Leader</div>
          <div className="formula-block" style={{ fontSize: 11, marginBottom: 8 }}>
            Leader = argmax_i [spec_i · feat_vec(t)] · accuracy_i
          </div>
          {showcaseDelib && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: showcaseDelib.deliberation.leader.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {showcaseDelib.deliberation.leader.icon}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
                    {showcaseDelib.deliberation.leader.name}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--accent-teal)' }}>
                    Confidence: {(showcaseDelib.deliberation.leaderScore * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)',
                padding: '6px 10px', background: 'var(--bg-inset)',
                borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
              }}>
                Dominant feature: {showcaseDelib.deliberation.dominantFeature}
              </div>
              <div className="plain-english">
                {showcaseDelib.deliberation.leader.name} is leading this round — {showcaseDelib.deliberation.dominantFeature} dominated the transaction features.
              </div>
            </>
          )}
        </div>

        {/* KPI 3.2 — Consensus */}
        <div className="card">
          <div className="kpi-label">Consensus Score</div>
          <div className="formula-block" style={{ fontSize: 11, marginBottom: 8 }}>
            consensus = agents agreeing with leader / 5
          </div>
          {showcaseDelib && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {AGENTS.map((agent, i) => {
                  const agreed = !showcaseDelib.deliberation.dissenters.find(d => d.id === agent.id);
                  return (
                    <div key={agent.id} title={agent.name} style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: agreed ? agent.color : 'transparent',
                      border: `2px solid ${agent.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12,
                      opacity: agreed ? 1 : 0.4,
                    }}>
                      {agent.icon}
                    </div>
                  );
                })}
                <span className="mono" style={{ fontSize: 18, fontWeight: 500, marginLeft: 8 }}>
                  {showcaseDelib.deliberation.agreeing}/5
                </span>
                <span className={`regime-badge ${showcaseDelib.deliberation.consensus >= 0.6 ? 'full' : 'partial'}`}>
                  {showcaseDelib.deliberation.consensus >= 0.8 ? 'Strong' : showcaseDelib.deliberation.consensus >= 0.6 ? 'Moderate' : 'Low'}
                </span>
              </div>
              <div className="plain-english">
                {showcaseDelib.deliberation.agreeing} of 5 agents agreed.
                {showcaseDelib.deliberation.dissenters.length > 0
                  ? ` ${showcaseDelib.deliberation.dissenters.length} dissented — treat this as a ${showcaseDelib.deliberation.consensus < 0.6 ? 'contested' : 'confident'} decision.`
                  : ' Unanimous consensus.'}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Middle — Debate Log */}
      <motion.div className="card" initial="hidden" animate="visible" custom={2} variants={fadeUp}
        style={{ marginBottom: 24, maxHeight: 500, overflow: 'auto' }}>
        <div className="section-label" style={{ marginBottom: 16 }}>Debate Log — Latest Round</div>

        {latestDeliberations.slice(0, 5).map((delib, dIdx) => (
          <div key={dIdx} style={{
            marginBottom: 24,
            paddingBottom: 24,
            borderBottom: dIdx < 4 ? '1px solid var(--border-secondary)' : 'none',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              Transaction {delib.transaction.id}
              <span className="symbol-pill" style={{ fontSize: 10 }}>
                ρ = {delib.transaction.riskScore.toFixed(3)}
              </span>
              <span className={`chat-tag ${delib.deliberation.leaderDecision.toLowerCase()}`}>
                {delib.deliberation.leaderDecision}
              </span>
            </div>

            {/* Round 1 positions */}
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Round 1 — Initial Positions
            </div>
            {delib.deliberation.round1.map((pos, i) => (
              <div className="chat-message" key={`r1-${i}`}>
                <div className="chat-avatar" style={{ background: `${pos.agent.color}18` }}>
                  {pos.agent.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: pos.agent.color }}>{pos.agent.name}</span>
                    <span className={`chat-tag ${pos.position.toLowerCase()}`}>{pos.position}</span>
                  </div>
                  <div className="chat-bubble">{pos.reasoning}</div>
                </div>
              </div>
            ))}

            {/* Round 2 — changes */}
            {delib.deliberation.round2.some(p => p.changed) && (
              <>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 12, marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Round 2 — Deliberation
                </div>
                {delib.deliberation.round2.filter(p => p.changed).map((pos, i) => (
                  <div className="chat-message" key={`r2-${i}`}>
                    <div className="chat-avatar" style={{ background: `${pos.agent.color}18` }}>
                      {pos.agent.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: pos.agent.color }}>{pos.agent.name}</span>
                        <span className={`chat-tag ${pos.position.toLowerCase()}`}>{pos.position}</span>
                        <span style={{ fontSize: 10, color: 'var(--secondary-amber)' }}>↻ Changed position</span>
                      </div>
                      <div className="chat-bubble">{pos.reasoning}</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Final decision */}
            <div style={{
              marginTop: 12, padding: '8px 12px',
              background: delib.deliberation.leaderDecision === 'AUDIT' ? 'oklch(0.96 0.03 165)' : 'var(--bg-inset)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${delib.deliberation.leaderDecision === 'AUDIT' ? 'oklch(0.88 0.08 165)' : 'var(--border-secondary)'}`,
              fontSize: 12,
            }}>
              <strong>{delib.deliberation.leader.icon} {delib.deliberation.leader.name} (Leader):</strong>{' '}
              Decision = <strong>{delib.deliberation.leaderDecision}</strong>.{' '}
              {delib.deliberation.dissenters.length > 0 && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  Dissenters: {delib.deliberation.dissenters.map(d => d.name).join(', ')}
                </span>
              )}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Bottom — Agent Leaderboard */}
      <div className="grid-2">
        {/* KPI 3.4 — Agent Accuracy */}
        <motion.div className="card" initial="hidden" animate="visible" custom={3} variants={fadeUp}>
          <div className="card-title" style={{ marginBottom: 4 }}>Agent Accuracy Over Rounds</div>
          <div className="formula-block" style={{ fontSize: 11 }}>
            accuracy_i = α_i / (α_i + β_i) from Thompson Sampling Beta posterior
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={agentAccuracyData} layout="vertical" margin={{ top: 10, right: 20, bottom: 0, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
                stroke="var(--text-tertiary)" fontSize={11} fontFamily="DM Mono" />
              <YAxis dataKey="name" type="category"
                stroke="var(--text-tertiary)" fontSize={11} fontFamily="Instrument Sans" width={80} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                {agentAccuracyData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8 }}>
            {agentAccuracyData.map(a => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', padding: '3px 0',
                fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
              }}>
                <span>{a.name}</span>
                <span>Beta({a.alpha}, {a.beta}) · Led {a.led}x</span>
              </div>
            ))}
          </div>
          <div className="plain-english">
            {agentAccuracyData[0]?.name} has been right {agentAccuracyData[0]?.accuracy}% of the time across all rounds.
          </div>
        </motion.div>

        {/* KPI 3.5 — Leadership Frequency */}
        <motion.div className="card" initial="hidden" animate="visible" custom={4} variants={fadeUp}>
          <div className="card-title" style={{ marginBottom: 8 }}>Leadership Frequency</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={leadershipData} cx="50%" cy="50%" outerRadius={80}
                dataKey="value" stroke="var(--bg-card)" strokeWidth={2} paddingAngle={1}>
                {leadershipData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v, name, props) => [`${props.payload.pct}%`, name]} />
              <Legend formatter={(value) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
          <div className="plain-english">
            Leadership distribution should roughly match the fraud type mix in the batch.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
