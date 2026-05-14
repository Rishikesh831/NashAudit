import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useSim } from './store/SimContext';
import SimulationSetup from './pages/SimulationSetup';
import GameVisualiser from './pages/GameVisualiser';
import CouncilChamber from './pages/CouncilChamber';
import AuditOutput from './pages/AuditOutput';
import StrategyComparison from './pages/StrategyComparison';
import { Settings, Play, Users, FileCheck, BarChart3 } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/setup', label: 'Setup', icon: Settings, step: 1 },
  { path: '/visualiser', label: 'Game', icon: Play, step: 2 },
  { path: '/council', label: 'Council', icon: Users, step: 3 },
  { path: '/audit', label: 'Audit', icon: FileCheck, step: 4 },
  { path: '/compare', label: 'Compare', icon: BarChart3, step: 5 },
];

export default function App() {
  const { state } = useSim();
  const hasSimData = state.transactions.length > 0;

  return (
    <div className="app-layout">
      <nav className="top-nav">
        <div className="nav-brand">
          <div className="nav-brand-icon">N</div>
          <span className="nav-brand-name">NashAudit</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            marginLeft: '4px',
            padding: '1px 6px',
            background: 'var(--bg-inset)',
            borderRadius: '100px',
            letterSpacing: '0.05em',
          }}>
            STACKELBERG ENGINE
          </span>
        </div>

        <div className="nav-links">
          {NAV_ITEMS.map(({ path, label, icon: Icon, step }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-step">{step}</span>
              <Icon size={14} />
              {label}
            </NavLink>
          ))}
        </div>

        {hasSimData && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
          }}>
            <span style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background: state.isRunning ? 'var(--accent-teal)' : 'var(--border-primary)',
              display: 'inline-block',
            }} />
            {state.isRunning ? 'RUNNING' : `R${state.currentRound}`}
          </div>
        )}
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/setup" replace />} />
          <Route path="/setup" element={<SimulationSetup />} />
          <Route path="/visualiser" element={<GameVisualiser />} />
          <Route path="/council" element={<CouncilChamber />} />
          <Route path="/audit" element={<AuditOutput />} />
          <Route path="/compare" element={<StrategyComparison />} />
        </Routes>
      </main>
    </div>
  );
}
