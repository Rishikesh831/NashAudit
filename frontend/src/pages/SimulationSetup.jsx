import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSim } from '../store/SimContext';
import { FRAUDSTER_TYPES, computeQStar, computeECheat, computeSafetyMargin, getDeterrenceRegime } from '../engine/simulation';
import { ArrowRight, Upload, Shuffle } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] } }),
};

function formatCurrency(val) {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val}`;
}

export default function SimulationSetup() {
  const { state, setParam, setTypeMix, setDataMode, initSimulation } = useSim();
  const navigate = useNavigate();
  const p = state.params;
  const q = p.k / p.N;

  // Live computations
  const typeKPIs = FRAUDSTER_TYPES.map(type => {
    const qStar = computeQStar(p.G, p.alpha, p.P_caught, p.P_escaped, type.utilityMultiplier);
    const eCheat = computeECheat(q, p.G, p.alpha, p.P_caught, p.P_escaped, type.utilityMultiplier);
    const margin = computeSafetyMargin(eCheat, p.G * type.utilityMultiplier);
    const regime = getDeterrenceRegime(q, qStar);
    return { type, qStar, eCheat, margin, regime };
  });

  const fullDeterred = typeKPIs.filter(k => k.regime === 'full').length;
  const mixSum = p.typeMix.reduce((a, b) => a + b, 0);
  const isValid = mixSum >= 99 && mixSum <= 101 && p.k <= p.N && p.k > 0;

  const handleProceed = () => {
    initSimulation();
    navigate('/visualiser');
  };

  return (
    <div className="page-container">
      <motion.div className="page-header" initial="hidden" animate="visible" custom={0} variants={fadeUp}>
        <span className="section-label">Page 1 of 5</span>
        <h1>Simulation Setup</h1>
        <p>Configure the Bayesian Stackelberg game parameters. The live deterrence preview below updates as you change any slider.</p>
      </motion.div>

      {/* Section A — Transaction Batch */}
      <motion.div initial="hidden" animate="visible" custom={1} variants={fadeUp}>
        <div className="section-label" style={{ marginBottom: 12 }}>Section A — Transaction Batch</div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div className="toggle-group">
              <button
                className={`toggle-option ${p.dataMode === 'synthetic' ? 'active' : ''}`}
                onClick={() => setDataMode('synthetic')}
              >
                <Shuffle size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                Generate Synthetic
              </button>
              <button
                className={`toggle-option ${p.dataMode === 'csv' ? 'active' : ''}`}
                onClick={() => setDataMode('csv')}
              >
                <Upload size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                Upload CSV
              </button>
            </div>
          </div>

          <div className="grid-2">
            <div className="slider-group">
              <label>
                Transactions (N)
                <span>{p.N}</span>
              </label>
              <input type="range" min={50} max={2000} step={10} value={p.N}
                onChange={e => setParam('N', Number(e.target.value))} />
              <div className="plain-english">Total transaction batch size for each simulation round.</div>
            </div>
            <div className="slider-group">
              <label>
                Time Window
                <span>{p.timeWindow}h</span>
              </label>
              <input type="range" min={1} max={168} step={1} value={p.timeWindow}
                onChange={e => setParam('timeWindow', Number(e.target.value))} />
              <div className="plain-english">How far back in time transactions are sampled from.</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Section B — Fraudster Population Mix */}
      <motion.div initial="hidden" animate="visible" custom={2} variants={fadeUp}>
        <div className="section-label" style={{ marginBottom: 12 }}>Section B — Fraudster Population Mix</div>
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {FRAUDSTER_TYPES.map((type, i) => (
            <div className="card card-compact" key={type.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 3,
                    background: type.color,
                  }} />
                  <span className="card-title" style={{ fontSize: 13 }}>{type.name}</span>
                </div>
                <span className="mono" style={{ fontSize: 18, fontWeight: 500, color: type.color }}>
                  {p.typeMix[i]}%
                </span>
              </div>
              <div className="plain-english" style={{ marginTop: 0, marginBottom: 10 }}>{type.description}</div>
              <input type="range" min={0} max={100} step={1} value={p.typeMix[i]}
                onChange={e => setTypeMix(i, Number(e.target.value))}
                style={{ accentColor: type.color }}
              />
              <div className="progress-bar" style={{ marginTop: 6 }}>
                <div className="progress-bar-fill" style={{ width: `${p.typeMix[i]}%`, background: type.color }} />
              </div>
            </div>
          ))}
        </div>
        {mixSum !== 100 && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: Math.abs(mixSum - 100) > 5 ? 'var(--positive-red)' : 'var(--secondary-amber)',
            marginTop: -16,
            marginBottom: 16,
          }}>
            ⚠ Sum = {mixSum}% (should be 100%). Sliders will be normalised.
          </div>
        )}
      </motion.div>

      {/* Section C — Game Parameters */}
      <motion.div initial="hidden" animate="visible" custom={3} variants={fadeUp}>
        <div className="section-label" style={{ marginBottom: 12 }}>Section C — Game Parameters</div>
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {[
            { key: 'G', symbol: 'G', label: 'Fraud Gain', min: 1000, max: 100000, step: 1000 },
            { key: 'P_caught', symbol: 'P_caught', label: 'Penalty if Caught', min: 5000, max: 500000, step: 5000 },
            { key: 'P_escaped', symbol: 'P_escaped', label: 'Penalty if Escaped', min: 500, max: 50000, step: 500 },
            { key: 'alpha', symbol: 'α', label: 'Capture Probability', min: 0, max: 1, step: 0.01 },
          ].map(({ key, symbol, label, min, max, step }) => (
            <div className="card card-compact" key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className="symbol-pill">{symbol}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
              </div>
              <div className="kpi-value" style={{ fontSize: 24, marginBottom: 10 }}>
                {key === 'alpha' ? p[key].toFixed(2) : formatCurrency(p[key])}
              </div>
              <input type="range" min={min} max={max} step={step} value={p[key]}
                onChange={e => setParam(key, Number(e.target.value))} />
            </div>
          ))}
        </div>
      </motion.div>

      {/* Section D — Audit Budget */}
      <motion.div initial="hidden" animate="visible" custom={4} variants={fadeUp}>
        <div className="section-label" style={{ marginBottom: 12 }}>Section D — Audit Budget</div>
        <div className="card" style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
            <div>
              <span className="mono" style={{ fontSize: 36, fontWeight: 500, color: 'var(--accent-teal)' }}>
                {p.k}
              </span>
              <span className="mono" style={{ fontSize: 18, color: 'var(--text-tertiary)', margin: '0 4px' }}>/</span>
              <span className="mono" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>{p.N}</span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--accent-teal)',
              background: 'var(--accent-teal-surface)',
              padding: '2px 12px',
              borderRadius: 100,
            }}>
              {(q * 100).toFixed(1)}% audit rate
            </div>
          </div>
          <input type="range" min={1} max={p.N} step={1} value={p.k}
            onChange={e => setParam('k', Number(e.target.value))} />
          <div className="plain-english">k transactions will be audited out of N in each round.</div>
        </div>
      </motion.div>

      {/* ─── Live Deterrence Preview Panel ─── */}
      <motion.div initial="hidden" animate="visible" custom={5} variants={fadeUp}>
        <div className="card" style={{
          background: 'var(--bg-formula)',
          border: '1px solid var(--border-primary)',
          marginBottom: 32,
        }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Live Deterrence Preview</div>

          {/* KPI 1.1 — q* per type */}
          <div style={{ marginBottom: 24 }}>
            <div className="card-title" style={{ fontSize: 13, marginBottom: 4 }}>q* Threshold Per Type</div>
            <div className="formula-block">q* = G / [α·P_caught + (1−α)·P_escaped]</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {typeKPIs.map(({ type, qStar }) => (
                <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: type.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, minWidth: 110 }}>{type.name}</span>
                  <div className="progress-bar" style={{ flex: 1, position: 'relative' }}>
                    <div className="progress-bar-fill" style={{
                      width: `${qStar * 100}%`,
                      background: type.color,
                      opacity: 0.3,
                    }} />
                    <div style={{
                      position: 'absolute', left: `${q * 100}%`, top: -3, bottom: -3,
                      width: 2, background: 'var(--accent-teal)',
                      borderRadius: 1,
                    }} />
                  </div>
                  <span className="mono" style={{ fontSize: 13, minWidth: 50, textAlign: 'right', color: type.color }}>
                    {(qStar * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="plain-english">
              At these settings, you must audit at least {(Math.max(...typeKPIs.map(k => k.qStar)) * 100).toFixed(1)}% to deter all types.
              The vertical line shows your current audit rate ({(q * 100).toFixed(1)}%).
            </div>
          </div>

          {/* KPI 1.2 — Regime preview */}
          <div style={{ marginBottom: 24 }}>
            <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Deterrence Regime</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {typeKPIs.map(({ type, regime }) => (
                <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{type.name}:</span>
                  <span className={`regime-badge ${regime}`}>
                    {regime === 'full' ? '✓ Full' : regime === 'partial' ? '◐ Partial' : '✗ None'}
                  </span>
                </div>
              ))}
            </div>
            <div className="plain-english">
              With current budget, {fullDeterred} of 4 types are in full deterrence.
            </div>
          </div>

          {/* KPI 1.3 — E[cheat] preview */}
          <div style={{ marginBottom: 24 }}>
            <div className="card-title" style={{ fontSize: 13, marginBottom: 4 }}>E[cheat] Per Type</div>
            <div className="formula-block">E[cheat] = (1−q)·G − q·[α·P_caught + (1−α)·P_escaped]</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {typeKPIs.map(({ type, eCheat }) => (
                <div className="kpi-card" key={type.id} style={{ flex: '1 1 200px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: type.color }} />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{type.name}</span>
                  </div>
                  <div className={`kpi-value ${eCheat > 0 ? 'positive' : 'negative'}`} style={{ fontSize: 20 }}>
                    {eCheat > 0 ? '+' : ''}{formatCurrency(Math.abs(Math.round(eCheat)))}
                  </div>
                </div>
              ))}
            </div>
            <div className="plain-english">
              {typeKPIs.some(k => k.eCheat > 0)
                ? `${typeKPIs.filter(k => k.eCheat > 0).map(k => k.type.name).join(', ')} still find fraud profitable at these settings.`
                : 'All fraudster types find fraud unprofitable — full deterrence achieved.'}
            </div>
          </div>

          {/* KPI 1.4 — Safety margin */}
          <div>
            <div className="card-title" style={{ fontSize: 13, marginBottom: 4 }}>Safety Margin</div>
            <div className="formula-block">margin = E[cheat] / G</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {typeKPIs.map(({ type, margin }) => {
                const pct = ((margin + 1) / 2) * 100; // -1..+1 → 0..100
                return (
                  <div key={type.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{type.name}</span>
                      <span className="mono" style={{
                        color: margin > 0 ? 'var(--positive-red)' : margin > -0.1 ? 'var(--secondary-amber)' : 'var(--negative-green)',
                        fontWeight: 500,
                      }}>
                        {margin > 0 ? '+' : ''}{margin.toFixed(3)}
                      </span>
                    </div>
                    <div style={{
                      position: 'relative',
                      height: 8,
                      background: 'var(--bg-inset)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}>
                      {/* Amber warning zone */}
                      <div style={{
                        position: 'absolute',
                        left: `${(((-0.1) + 1) / 2) * 100}%`,
                        width: `${(0.1 / 2) * 100}%`,
                        top: 0, bottom: 0,
                        background: 'oklch(0.88 0.08 85 / 0.4)',
                      }} />
                      {/* Zero line */}
                      <div style={{
                        position: 'absolute',
                        left: '50%',
                        top: 0, bottom: 0,
                        width: 1,
                        background: 'var(--text-tertiary)',
                        opacity: 0.4,
                      }} />
                      {/* Marker */}
                      <div style={{
                        position: 'absolute',
                        left: `${Math.max(0, Math.min(100, pct))}%`,
                        top: -1, bottom: -1,
                        width: 4,
                        borderRadius: 2,
                        background: type.color,
                        transform: 'translateX(-50%)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="plain-english">
              {typeKPIs.some(k => k.margin > -0.1 && k.margin < 0)
                ? `${typeKPIs.filter(k => k.margin > -0.1 && k.margin < 0).map(k => k.type.name).join(', ')} ${typeKPIs.filter(k => k.margin > -0.1 && k.margin < 0).length === 1 ? 'is' : 'are'} marginal — a small audit drop would reactivate them.`
                : typeKPIs.some(k => k.margin > 0)
                  ? 'Some types are still in positive margin — fraud is rational for them.'
                  : 'All types have comfortable negative margins — deterrence is robust.'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial="hidden" animate="visible" custom={6} variants={fadeUp}
        style={{ display: 'flex', justifyContent: 'flex-end' }}
      >
        <button
          className="btn btn-primary"
          disabled={!isValid}
          onClick={handleProceed}
          style={{ fontSize: 15, padding: '14px 32px' }}
        >
          Proceed to Simulation
          <ArrowRight size={16} />
        </button>
      </motion.div>
    </div>
  );
}
