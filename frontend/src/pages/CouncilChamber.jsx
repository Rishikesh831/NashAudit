import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSim, AGENTS } from '../store/SimContext';
import { useSSE } from '../hooks/useSSE';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Radio, Loader2 } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }),
};

export default function CouncilChamber() {
  const { state } = useSim();
  const { roundHistory, agentPriors, simulationId, currentRound } = state;
  const hasData = roundHistory.length > 0;
  const latestRound = hasData ? roundHistory[roundHistory.length - 1] : null;
  const latestDecisions = latestRound?.audit_decisions || latestRound?.auditDecisions || [];
  const [showStream, setShowStream] = useState(false);

  // SSE streaming hook
  const sse = useSSE();

  const handleStream = () => {
    if (!simulationId || !currentRound) return;
    setShowStream(true);
    sse.startStream(simulationId, currentRound);
  };

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
        led: prior.led || prior.rounds_led || 0,
      };
    }).sort((a, b) => b.accuracy - a.accuracy),
    [agentPriors]
  );

  // Leadership frequency — handle both backend and frontend data shapes
  const leadershipData = useMemo(() => {
    const counts = {};
    AGENTS.forEach(a => { counts[a.id] = 0; });
    roundHistory.forEach(r => {
      const decisions = r.audit_decisions || r.auditDecisions || [];
      decisions.forEach(d => {
        const leaderId = d.leader_id || d.leaderId || d.deliberation?.leader?.id || d.deliberation?.leader_id || '';
        if (leaderId) counts[leaderId] = (counts[leaderId] || 0) + 1;
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
  const showcaseDecision = latestDecisions.length > 0 ? latestDecisions[0] : null;
  const showcaseLeader = showcaseDecision
    ? AGENTS.find(a => a.id === showcaseDecision.leader_id || a.id === showcaseDecision.leaderId) || AGENTS[0]
    : null;
  const agreeing = showcaseDecision?.agreeing ?? 0;
  const dissentersCount = Math.max(0, AGENTS.length - agreeing);

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
        {simulationId && currentRound > 0 && (
          <button className="btn btn-primary" onClick={handleStream} disabled={sse.isStreaming}
            style={{ marginTop: 12 }}>
            {sse.isStreaming ? <><Loader2 size={14} className="animate-spin" /> Streaming...</> : <><Radio size={14} /> Stream Live Council</>}
          </button>
        )}
      </motion.div>

      {/* SSE Live Stream Panel */}
      {showStream && (
        <motion.div className="card" initial="hidden" animate="visible" custom={0.5} variants={fadeUp}
          style={{ marginBottom: 24, background: 'var(--bg-formula)', border: '1px solid var(--accent-teal)', borderColor: 'oklch(0.78 0.12 165 / 0.3)' }}>
          <div className="section-label" style={{ marginBottom: 12, color: 'var(--accent-teal)' }}>
            {sse.isStreaming ? '● Live Council Stream' : '◉ Stream Complete'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {AGENTS.map(agent => {
              const agentTokens = sse.tokens[agent.id] || '';
              const agentResult = sse.agentResults.find(r => r.agent_id === agent.id);
              return (
                <div key={agent.id} style={{
                  padding: '10px 14px', background: 'var(--bg-inset)',
                  borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${agent.color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16 }}>{agent.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: agent.color }}>{agent.name}</span>
                    {agentResult && (
                      <span className={`chat-tag ${agentResult.position?.toLowerCase()}`}>
                        {agentResult.position}
                      </span>
                    )}
                    {agentResult && (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                        {agentResult.stub_used ? '⚡ stub' : '🤖 NIM'}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
                    lineHeight: 1.6, minHeight: 20,
                  }}>
                    {agentTokens || (sse.isStreaming ? <span style={{ opacity: 0.4 }}>Waiting...</span> : '')}
                    {sse.isStreaming && !agentResult && agentTokens && (
                      <span className="cursor-blink" style={{ borderRight: '2px solid var(--accent-teal)', paddingRight: 1 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {sse.leader && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'oklch(0.96 0.03 165)', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
              <strong>Leader:</strong> {sse.leader.leader_name} · <strong>Decision:</strong> {sse.finalDecision?.decision || 'pending'} · Consensus: {(sse.finalDecision?.consensus_score * 100 || 0).toFixed(0)}%
            </div>
          )}
        </motion.div>
      )}

      {/* Top Bar — Leader + Consensus */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}
        className="grid-2" style={{ marginBottom: 24 }}>

        {/* KPI 3.1 — Elected Leader */}
        <div className="card">
          <div className="kpi-label">Elected Leader</div>
          <div className="formula-block" style={{ fontSize: 11, marginBottom: 8 }}>
            Leader = argmax_i [spec_i · feat_vec(t)] · accuracy_i
          </div>
          {showcaseDecision && showcaseLeader && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: showcaseLeader.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {showcaseLeader.icon}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
                    {showcaseLeader.name}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--accent-teal)' }}>
                    Confidence: {((showcaseDecision.leader_score ?? showcaseDecision.leaderScore ?? 0) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-secondary)',
                padding: '6px 10px', background: 'var(--bg-inset)',
                borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)',
              }}>
                Dominant feature: {showcaseDecision.dominant_feature || showcaseDecision.dominantFeature || 'unknown'}
              </div>
              <div className="plain-english">
                {showcaseLeader.name} is leading this round — {showcaseDecision.dominant_feature || showcaseDecision.dominantFeature || 'the transaction features'} dominated the transaction features.
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
          {showcaseDecision && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {AGENTS.map((agent, i) => {
                  const agreed = i < agreeing;
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
                  {agreeing}/5
                </span>
                <span className={`regime-badge ${(showcaseDecision.consensus ?? 0) >= 0.6 ? 'full' : 'partial'}`}>
                  {(showcaseDecision.consensus ?? 0) >= 0.8 ? 'Strong' : (showcaseDecision.consensus ?? 0) >= 0.6 ? 'Moderate' : 'Low'}
                </span>
              </div>
              <div className="plain-english">
                {agreeing} of 5 agents agreed.
                {dissentersCount > 0
                  ? ` ${dissentersCount} dissented — treat this as a ${(showcaseDecision.consensus ?? 0) < 0.6 ? 'contested' : 'confident'} decision.`
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

        {latestDecisions.slice(0, 5).map((decision, dIdx) => (
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
              flexWrap: 'wrap',
            }}>
              Transaction {decision.transaction_id || decision.id}
              <span className="symbol-pill" style={{ fontSize: 10 }}>
                ρ = {(decision.risk_score ?? decision.riskScore ?? 0).toFixed(3)}
              </span>
              <span className={`chat-tag ${(decision.leader_decision || decision.leaderDecision || 'SKIP').toLowerCase()}`}>
                {decision.leader_decision || decision.leaderDecision || 'SKIP'}
              </span>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Council Summary
            </div>
            <div style={{
              marginTop: 12, padding: '8px 12px',
              background: (decision.leader_decision || decision.leaderDecision) === 'AUDIT' ? 'oklch(0.96 0.03 165)' : 'var(--bg-inset)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${(decision.leader_decision || decision.leaderDecision) === 'AUDIT' ? 'oklch(0.88 0.08 165)' : 'var(--border-secondary)'}`,
              fontSize: 12,
            }}>
              <strong>{showcaseLeader?.icon} {showcaseLeader?.name} (Leader):</strong>{' '}
              Decision = <strong>{decision.leader_decision || decision.leaderDecision}</strong>.{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                Consensus: {decision.agreeing ?? agreeing}/5 · Dissenters: {dissentersCount}
              </span>
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
