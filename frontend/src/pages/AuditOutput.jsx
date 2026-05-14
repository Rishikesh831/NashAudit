import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSim } from '../store/SimContext';
import { FRAUDSTER_TYPES, AGENTS } from '../engine/simulation';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }),
};

function GaugeArc({ value, size = 100, color }) {
  const radius = (size - 10) / 2;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, value)));

  return (
    <div className="gauge-container" style={{ width: size, height: size / 2 + 10 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 5 ${size / 2 + 5} A ${radius} ${radius} 0 0 1 ${size - 5} ${size / 2 + 5}`}
          fill="none" stroke="var(--bg-inset)" strokeWidth={6} strokeLinecap="round"
        />
        <path
          d={`M 5 ${size / 2 + 5} A ${radius} ${radius} 0 0 1 ${size - 5} ${size / 2 + 5}`}
          fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        bottom: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 18,
        fontWeight: 500,
        color,
      }}>
        {(value * 100).toFixed(0)}%
      </div>
    </div>
  );
}

export default function AuditOutput() {
  const { state } = useSim();
  const { roundHistory, params } = state;
  const hasData = roundHistory.length > 0;
  const latestRound = hasData ? roundHistory[roundHistory.length - 1] : null;
  const [expandedRow, setExpandedRow] = useState(null);

  // Coalition graph data from latest round
  const coalitionNodes = useMemo(() => {
    if (!latestRound) return [];
    const colluding = latestRound.auditDecisions
      .filter(d => d.transaction.coalitionId)
      .map(d => d.transaction);
    return colluding;
  }, [latestRound]);

  // Active types
  const activeTypes = useMemo(() => {
    if (!latestRound) return [];
    return latestRound.typeKPIs
      .map((kpi, i) => ({ ...kpi, type: FRAUDSTER_TYPES[i] }))
      .filter(k => k.regime !== 'full');
  }, [latestRound]);

  if (!hasData) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h2 style={{ color: 'var(--text-tertiary)', marginBottom: 8 }}>No Audit Data</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Run the simulation first to see audit outputs.</p>
      </div>
    );
  }

  const auditDecisions = latestRound.auditDecisions;

  return (
    <div className="page-container">
      <motion.div className="page-header" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
        <span className="section-label">Page 4 of 5</span>
        <h1>Audit Output</h1>
        <p>Operational decisions — what gets audited, why, and the game-theoretic rationale. Every decision is explainable.</p>
      </motion.div>

      {/* Top Summary Row — 4 stat cards */}
      <motion.div className="grid-4" initial="hidden" animate="visible" custom={1} variants={fadeUp}
        style={{ marginBottom: 24 }}>

        {/* KPI 4.1 — DER */}
        <div className="kpi-card" style={{ textAlign: 'center' }}>
          <div className="kpi-label">Deterrence Efficiency Ratio</div>
          <div className="formula-block" style={{ fontSize: 10 }}>DER = deterred / k</div>
          <GaugeArc
            value={latestRound.DER}
            color={latestRound.DER > 0.7 ? '#1D9E75' : latestRound.DER > 0.4 ? '#D4A843' : '#D94F3D'}
          />
          <div className="kpi-interpretation">
            {(latestRound.DER * 100).toFixed(0)}% of our audit budget produced full deterrence.
          </div>
        </div>

        {/* KPI 4.2 — IC Constraint */}
        <div className="kpi-card">
          <div className="kpi-label">IC Constraint Satisfaction</div>
          <div className="formula-block" style={{ fontSize: 10 }}>CE incentive compatibility</div>
          <div style={{ margin: '12px 0' }}>
            <span className={`status-badge ${latestRound.icSatisfied ? 'deterred' : 'active'}`}
              style={{ fontSize: 14, padding: '4px 16px' }}>
              {latestRound.icSatisfied ? '✓ PASS' : '✗ FAIL'}
            </span>
          </div>
          <div className="kpi-interpretation">
            The mediator's audit allocation is {latestRound.icSatisfied ? '' : 'NOT '}game-theoretically valid.
          </div>
        </div>

        {/* KPI 4.3 — Budget Utilisation */}
        <div className="kpi-card">
          <div className="kpi-label">Budget Utilisation</div>
          <div style={{ margin: '12px 0', display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="mono" style={{ fontSize: 28, fontWeight: 500, color: 'var(--accent-teal)' }}>
              {auditDecisions.length}
            </span>
            <span className="mono" style={{ fontSize: 16, color: 'var(--text-tertiary)' }}>/ {params.k}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{
              width: `${(auditDecisions.length / params.k) * 100}%`,
              background: 'var(--accent-teal)',
            }} />
          </div>
          <div className="kpi-interpretation">
            {auditDecisions.length} audits used of {params.k} available.
          </div>
        </div>

        {/* KPI 4.4 — Active Types */}
        <div className="kpi-card">
          <div className="kpi-label">Active Fraudster Types</div>
          <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{
              fontSize: 28, fontWeight: 500,
              color: activeTypes.length > 0 ? 'var(--positive-red)' : 'var(--negative-green)',
            }}>
              {activeTypes.length}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {activeTypes.map(t => (
                <span key={t.type.id} className="regime-badge none" style={{ fontSize: 9 }}>
                  {t.type.name}
                </span>
              ))}
            </div>
          </div>
          <div className="kpi-interpretation">
            {activeTypes.length === 0
              ? 'All types are deterred this round.'
              : `${activeTypes.map(t => t.type.name).join(', ')} still not fully deterred.`}
          </div>
        </div>
      </motion.div>

      {/* Middle — Audit Allocation Table */}
      <motion.div className="card" initial="hidden" animate="visible" custom={2} variants={fadeUp}
        style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Selected Transactions</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Txn ID</th>
                <th>Risk (ρ)</th>
                <th>Type Est.</th>
                <th>Regime</th>
                <th>Shapley</th>
                <th>Council Leader</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {auditDecisions.map((d, i) => {
                const t = d.transaction;
                const delib = d.deliberation;
                const isExpanded = expandedRow === i;
                const kpi = latestRound.typeKPIs[FRAUDSTER_TYPES.findIndex(ft => ft.id === t.typeId)];

                return (
                  <>
                    <tr key={t.id} onClick={() => setExpandedRow(isExpanded ? null : i)}
                      style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="mono" style={{ fontSize: 12, fontWeight: 500 }}>{t.id}</span>
                      </td>
                      <td>
                        <span className="mono" style={{
                          fontSize: 13, fontWeight: 500,
                          color: t.riskScore > 0.7 ? 'var(--positive-red)' : t.riskScore > 0.4 ? 'var(--secondary-amber)' : 'var(--negative-green)',
                        }}>
                          {t.riskScore.toFixed(3)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 2, background: t.type.color }} />
                          <span style={{ fontSize: 12 }}>{t.type.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`regime-badge ${kpi.regime}`}>
                          {kpi.regime === 'full' ? 'Full' : kpi.regime === 'partial' ? 'Partial' : 'None'}
                        </span>
                      </td>
                      <td>
                        {t.isKeystone ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--secondary-amber)' }}>
                            <Star size={12} fill="var(--secondary-amber)" />
                            <span className="mono" style={{ fontSize: 11 }}>Keystone</span>
                          </span>
                        ) : t.coalitionId ? (
                          <span className="mono" style={{ fontSize: 11, color: 'var(--coalition-purple)' }}>
                            φ={t.shapleyValue.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 14 }}>{delib.leader.icon}</span>
                          <span style={{ fontSize: 12 }}>{delib.leader.name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 200, display: 'block' }}>
                          {delib.leaderDecision === 'AUDIT'
                            ? `E[cheat]>0, ρ=${t.riskScore.toFixed(2)} — rational fraud detected`
                            : 'Borderline — included by risk ranking'}
                        </span>
                      </td>
                      <td>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>

                    {/* KPI 4.7 — SAR Rationale Block */}
                    {isExpanded && (
                      <tr key={`${t.id}-sar`}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <div className="sar-block" style={{ margin: 8, borderRadius: 'var(--radius-md)' }}>
                            <div className="section-label" style={{ marginBottom: 12 }}>SAR Rationale — {t.id}</div>
                            <div className="sar-row">
                              <div className="sar-label">Deterrence Regime</div>
                              <div className="sar-value">
                                <span className={`regime-badge ${kpi.regime}`}>
                                  {kpi.regime.toUpperCase()}
                                </span>
                                <span className="mono" style={{ marginLeft: 8, fontSize: 12 }}>
                                  q* = {(kpi.qStar * 100).toFixed(1)}% · E[cheat] = ₹{Math.round(kpi.eCheat).toLocaleString()} · margin = {kpi.margin.toFixed(3)}
                                </span>
                              </div>
                            </div>
                            <div className="sar-row">
                              <div className="sar-label">Fraudster Type</div>
                              <div className="sar-value">
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 2, background: t.type.color }} />
                                  {t.type.name} (utility multiplier: {t.type.utilityMultiplier})
                                </span>
                                <div className="plain-english" style={{ marginTop: 2 }}>{t.type.description}</div>
                              </div>
                            </div>
                            <div className="sar-row">
                              <div className="sar-label">Council Leader</div>
                              <div className="sar-value">
                                {delib.leader.icon} {delib.leader.name} — confidence {(delib.leaderScore * 100).toFixed(0)}%
                              </div>
                            </div>
                            {delib.dissenters.length > 0 && (
                              <div className="sar-row">
                                <div className="sar-label">Dissenting Agents</div>
                                <div className="sar-value">
                                  {delib.dissenters.map(d => (
                                    <span key={d.id} style={{ marginRight: 8 }}>
                                      {d.icon} {d.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {t.coalitionId && (
                              <div className="sar-row">
                                <div className="sar-label">Coalition Position</div>
                                <div className="sar-value">
                                  Coalition {t.coalitionId} · φᵢ = {t.shapleyValue.toFixed(2)}
                                  {t.isKeystone && (
                                    <span style={{ color: 'var(--secondary-amber)', marginLeft: 8, fontWeight: 600 }}>
                                      ⭐ KEYSTONE — auditing collapses {(t.shapleyValue * 100).toFixed(0)}% of coalition gain
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="sar-row">
                              <div className="sar-label">IC Constraint</div>
                              <div className="sar-value">
                                <span className={`status-badge ${latestRound.icSatisfied ? 'deterred' : 'active'}`}>
                                  {latestRound.icSatisfied ? '✓ SATISFIED' : '✗ VIOLATED'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Bottom — Coalition Graph */}
      <motion.div className="card" initial="hidden" animate="visible" custom={3} variants={fadeUp}>
        <div className="section-label" style={{ marginBottom: 12 }}>Coalition Network</div>
        <div className="formula-block" style={{ fontSize: 11 }}>
          φᵢ(v) = Σ_S [|S|!(n−|S|−1)!/n!] · [v(S∪&#123;i&#125;) − v(S)]
        </div>

        {/* Simple force-directed visualization using SVG */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <svg width={500} height={300} viewBox="0 0 500 300">
            {/* Background grid */}
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 30} x2={500} y2={i * 30}
                stroke="var(--border-secondary)" strokeWidth={0.5} />
            ))}

            {/* Coalition groups */}
            {(() => {
              const coalitions = {};
              coalitionNodes.forEach(node => {
                if (!coalitions[node.coalitionId]) coalitions[node.coalitionId] = [];
                coalitions[node.coalitionId].push(node);
              });

              const elements = [];
              let cx = 100;

              Object.entries(coalitions).forEach(([cId, members], gi) => {
                const groupCx = 100 + gi * 180;
                const groupCy = 150;

                // Draw edges between members
                for (let i = 0; i < members.length; i++) {
                  for (let j = i + 1; j < members.length; j++) {
                    const angle1 = (2 * Math.PI * i) / members.length - Math.PI / 2;
                    const angle2 = (2 * Math.PI * j) / members.length - Math.PI / 2;
                    const r = 60;
                    elements.push(
                      <line key={`e-${cId}-${i}-${j}`}
                        x1={groupCx + Math.cos(angle1) * r}
                        y1={groupCy + Math.sin(angle1) * r}
                        x2={groupCx + Math.cos(angle2) * r}
                        y2={groupCy + Math.sin(angle2) * r}
                        stroke="var(--coalition-purple)" strokeWidth={1} opacity={0.3}
                      />
                    );
                  }
                }

                // Draw nodes
                members.forEach((node, i) => {
                  const angle = (2 * Math.PI * i) / members.length - Math.PI / 2;
                  const r = 60;
                  const x = groupCx + Math.cos(angle) * r;
                  const y = groupCy + Math.sin(angle) * r;
                  const nodeSize = 8 + node.shapleyValue * 20;

                  elements.push(
                    <g key={`n-${node.id}`} className="coalition-node">
                      {node.isKeystone && (
                        <circle cx={x} cy={y} r={nodeSize + 4}
                          fill="none" stroke="var(--secondary-amber)" strokeWidth={2}
                          strokeDasharray="4 2" />
                      )}
                      <circle cx={x} cy={y} r={nodeSize}
                        fill="var(--coalition-purple)"
                        opacity={0.3 + node.shapleyValue * 0.7}
                      />
                      <text x={x} y={y + nodeSize + 12} textAnchor="middle"
                        fontSize={9} fontFamily="DM Mono" fill="var(--text-tertiary)">
                        φ={node.shapleyValue.toFixed(2)}
                      </text>
                    </g>
                  );
                });

                // Coalition label
                elements.push(
                  <text key={`cl-${cId}`} x={groupCx} y={30} textAnchor="middle"
                    fontSize={11} fontFamily="DM Mono" fill="var(--coalition-purple)" fontWeight={500}>
                    {cId}
                  </text>
                );
              });

              if (Object.keys(coalitions).length === 0) {
                elements.push(
                  <text key="no-coal" x={250} y={150} textAnchor="middle"
                    fontSize={13} fill="var(--text-tertiary)" fontFamily="Instrument Sans">
                    No coalition members in current audit selection
                  </text>
                );
              }

              return elements;
            })()}
          </svg>
        </div>
        <div className="plain-english">
          Node size proportional to Shapley value (φᵢ). Keystone nodes (dashed ring) are coalition ringleaders — auditing them collapses coalition gain.
        </div>
      </motion.div>
    </div>
  );
}
