/**
 * NashAudit Simulation Engine
 * Bayesian Stackelberg Security Game for Digital Payment Fraud Deterrence
 * 
 * Core formulas:
 *   Risk score:       ρᵢ = σ(w₁·z_amount + w₂·velocity + w₃·device + w₄·geo + w₅·time)
 *   E[cheat]:         (1−q)·G − q·[α·P_caught + (1−α)·P_escaped]
 *   q* threshold:     G / [α·P_caught + (1−α)·P_escaped]
 *   Safety margin:    E[cheat] / G
 *   Shapley:          φᵢ(v) = Σ_{S} [|S|!(n−|S|−1)!/n!] · [v(S∪{i}) − v(S)]
 */

// Sigmoid function
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Random normal (Box-Muller)
const randn = () => {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

// Clamp value between min and max
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ─── Fraudster Type Definitions ───
export const FRAUDSTER_TYPES = [
  {
    id: 'risk-neutral',
    name: 'Risk-Neutral',
    color: '#1D9E75',
    description: 'Maximises expected monetary value. Cheats if E[cheat] > 0.',
    utilityMultiplier: 1.0,
  },
  {
    id: 'risk-averse',
    name: 'Risk-Averse',
    color: '#D4A843',
    description: 'Overweights penalty. Requires higher E[cheat] to act.',
    utilityMultiplier: 0.7,
  },
  {
    id: 'risk-seeking',
    name: 'Risk-Seeking',
    color: '#E06C5A',
    description: 'Underweights penalty. Cheats even when margins are thin.',
    utilityMultiplier: 1.4,
  },
  {
    id: 'colluding',
    name: 'Colluding',
    color: '#8B6CC1',
    description: 'Coordinates with others. Shares risk across coalition members.',
    utilityMultiplier: 1.2,
  },
];

// ─── Core Game Theory Computations ───

/**
 * Compute q* threshold for a fraudster type
 * q* = G / [α·P_caught + (1−α)·P_escaped]
 */
export function computeQStar(G, alpha, P_caught, P_escaped, utilityMultiplier = 1.0) {
  const effectiveGain = G * utilityMultiplier;
  const denominator = alpha * P_caught + (1 - alpha) * P_escaped;
  if (denominator === 0) return 1;
  return clamp(effectiveGain / denominator, 0, 1);
}

/**
 * Compute E[cheat] for given parameters
 * E[cheat] = (1−q)·G − q·[α·P_caught + (1−α)·P_escaped]
 */
export function computeECheat(q, G, alpha, P_caught, P_escaped, utilityMultiplier = 1.0) {
  const effectiveGain = G * utilityMultiplier;
  const effectivePenalty = alpha * P_caught + (1 - alpha) * P_escaped;
  return (1 - q) * effectiveGain - q * effectivePenalty;
}

/**
 * Compute safety margin
 * margin = E[cheat] / G
 */
export function computeSafetyMargin(eCheat, G) {
  if (G === 0) return 0;
  return eCheat / G;
}

/**
 * Determine deterrence regime
 */
export function getDeterrenceRegime(q, qStar) {
  if (q >= qStar) return 'full';
  if (q >= qStar * 0.7) return 'partial';
  return 'none';
}

/**
 * Compute all KPIs for a fraudster type given parameters
 */
export function computeTypeKPIs(type, q, G, alpha, P_caught, P_escaped) {
  const qStar = computeQStar(G, alpha, P_caught, P_escaped, type.utilityMultiplier);
  const eCheat = computeECheat(q, G, alpha, P_caught, P_escaped, type.utilityMultiplier);
  const margin = computeSafetyMargin(eCheat, G * type.utilityMultiplier);
  const regime = getDeterrenceRegime(q, qStar);
  return { qStar, eCheat, margin, regime };
}

// ─── Transaction Generation ───

/**
 * Generate synthetic transactions with risk scores
 */
export function generateTransactions(N, typeMix, timeWindow) {
  const transactions = [];
  const weights = { amount: 0.3, velocity: 0.25, device: 0.15, geo: 0.15, time: 0.15 };

  for (let i = 0; i < N; i++) {
    // Assign type based on mix
    const r = Math.random() * 100;
    let cumulative = 0;
    let typeIdx = 0;
    for (let t = 0; t < typeMix.length; t++) {
      cumulative += typeMix[t];
      if (r <= cumulative) { typeIdx = t; break; }
    }

    const type = FRAUDSTER_TYPES[typeIdx];
    const isFraudulent = Math.random() < (0.15 + typeIdx * 0.05);

    // Generate feature scores
    const features = {
      amount: clamp(randn() * 0.3 + (isFraudulent ? 0.7 : 0.3), 0, 1),
      velocity: clamp(randn() * 0.25 + (isFraudulent ? 0.6 : 0.25), 0, 1),
      device: clamp(randn() * 0.2 + (isFraudulent ? 0.55 : 0.2), 0, 1),
      geo: clamp(randn() * 0.2 + (isFraudulent ? 0.5 : 0.2), 0, 1),
      time: clamp(randn() * 0.15 + (isFraudulent ? 0.45 : 0.15), 0, 1),
    };

    // Risk score: ρᵢ = σ(w₁·z_amount + w₂·velocity + w₃·device + w₄·geo + w₅·time)
    const rawScore = weights.amount * features.amount +
                     weights.velocity * features.velocity +
                     weights.device * features.device +
                     weights.geo * features.geo +
                     weights.time * features.time;
    const riskScore = sigmoid((rawScore - 0.35) * 8);

    transactions.push({
      id: `TXN-${String(i + 1).padStart(4, '0')}`,
      amount: Math.round(1000 + Math.random() * 99000),
      timestamp: Date.now() - Math.random() * timeWindow * 3600 * 1000,
      type,
      typeId: type.id,
      isFraudulent,
      features,
      riskScore: Math.round(riskScore * 1000) / 1000,
      shapleyValue: 0,
      isKeystone: false,
      coalitionId: null,
    });
  }

  // Assign coalitions for colluding types
  const colluding = transactions.filter(t => t.typeId === 'colluding');
  const numCoalitions = Math.max(1, Math.floor(colluding.length / 4));
  colluding.forEach((t, i) => {
    t.coalitionId = `C-${(i % numCoalitions) + 1}`;
  });

  // Compute Shapley values for coalition members
  for (let c = 1; c <= numCoalitions; c++) {
    const members = colluding.filter(t => t.coalitionId === `C-${c}`);
    const n = members.length;
    if (n === 0) continue;
    // Simplified Shapley: contribution proportional to risk score
    const totalRisk = members.reduce((s, m) => s + m.riskScore, 0);
    members.forEach(m => {
      m.shapleyValue = totalRisk > 0 ? Math.round((m.riskScore / totalRisk) * 100) / 100 : 0;
    });
    // Mark keystone (highest Shapley)
    const keystone = members.reduce((a, b) => a.shapleyValue > b.shapleyValue ? a : b);
    keystone.isKeystone = true;
  }

  return transactions;
}

// ─── Council Agents ───

export const AGENTS = [
  { id: 'risk-analyst', name: 'Risk Analyst', icon: '📊', color: '#1D9E75', specialty: 'E[cheat] formula analysis' },
  { id: 'forensics', name: 'Forensics Agent', icon: '🔬', color: '#3B82F6', specialty: 'α estimation and evidence depth' },
  { id: 'coalition-detector', name: 'Coalition Detector', icon: '🕸️', color: '#8B6CC1', specialty: 'Shapley values and graph links' },
  { id: 'behavioural', name: 'Behavioural Agent', icon: '🧠', color: '#D4A843', specialty: 'Variance-adjusted utility' },
  { id: 'adversarial', name: 'Adversarial Agent', icon: '⚔️', color: '#E06C5A', specialty: 'Red-team: argues AGAINST audit' },
];

/**
 * Council deliberation for a transaction
 */
export function runCouncilDeliberation(transaction, params, roundNum) {
  const { G, alpha, P_caught, P_escaped, auditRate } = params;
  const { riskScore, type, features } = transaction;

  // Each agent evaluates
  const agentPositions = AGENTS.map(agent => {
    let position, confidence, reasoning;

    switch (agent.id) {
      case 'risk-analyst': {
        const eCheat = computeECheat(auditRate, G, alpha, P_caught, P_escaped, type.utilityMultiplier);
        confidence = Math.min(0.95, riskScore * 1.2);
        position = eCheat > 0 && riskScore > 0.5 ? 'AUDIT' : 'SKIP';
        reasoning = `E[cheat] = ${eCheat.toFixed(0)}. Risk score ρ = ${riskScore.toFixed(3)}. ${position === 'AUDIT' ? 'Fraud is rational at current audit rate.' : 'Expected gain is negative — deterred.'}`;
        break;
      }
      case 'forensics': {
        const evidenceDepth = (features.device + features.geo + features.amount) / 3;
        confidence = evidenceDepth;
        position = evidenceDepth > 0.45 ? 'AUDIT' : 'SKIP';
        reasoning = `Evidence depth = ${evidenceDepth.toFixed(3)}. ${position === 'AUDIT' ? 'Multiple forensic indicators converge.' : 'Insufficient forensic evidence.'}`;
        break;
      }
      case 'coalition-detector': {
        const shapleyFlag = transaction.shapleyValue > 0.3;
        confidence = transaction.coalitionId ? 0.8 : 0.3;
        position = shapleyFlag || (transaction.isKeystone) ? 'AUDIT' : transaction.coalitionId ? 'UNCERTAIN' : 'SKIP';
        reasoning = transaction.coalitionId
          ? `Coalition ${transaction.coalitionId}, φᵢ = ${transaction.shapleyValue.toFixed(2)}. ${transaction.isKeystone ? 'KEYSTONE — auditing collapses coalition gain.' : 'Non-keystone member.'}`
          : 'No coalition links detected.';
        break;
      }
      case 'behavioural': {
        const varianceAdjusted = riskScore * type.utilityMultiplier * (1 + features.velocity * 0.5);
        confidence = clamp(varianceAdjusted, 0, 0.95);
        position = varianceAdjusted > 0.55 ? 'AUDIT' : 'SKIP';
        reasoning = `Variance-adjusted utility = ${varianceAdjusted.toFixed(3)}. Type: ${type.name} (multiplier ${type.utilityMultiplier}). ${position === 'AUDIT' ? 'Behavioural profile suggests active fraud intent.' : 'Profile within normal parameters.'}`;
        break;
      }
      case 'adversarial': {
        // Always argues against audit (red team)
        confidence = 0.6 + Math.random() * 0.3;
        position = 'SKIP';
        reasoning = `Red-team objection: auditing TXN ${transaction.id} consumes budget. False positive risk = ${((1 - riskScore) * 100).toFixed(0)}%. Recommend skip to preserve audit capacity.`;
        break;
      }
    }

    return { agent, position, confidence, reasoning, round: 1 };
  });

  // Round 2: agents can change position based on others
  const round2Positions = agentPositions.map((pos, i) => {
    const auditVotes = agentPositions.filter(p => p.position === 'AUDIT').length;
    let newPosition = pos.position;
    let changed = false;

    if (pos.agent.id === 'adversarial') {
      // Adversarial only flips if overwhelming consensus
      if (auditVotes >= 4 && riskScore > 0.8) {
        newPosition = 'AUDIT';
        changed = true;
      }
    } else if (pos.position === 'UNCERTAIN') {
      newPosition = auditVotes >= 3 ? 'AUDIT' : 'SKIP';
      changed = true;
    } else if (pos.position === 'SKIP' && auditVotes >= 3 && riskScore > 0.6) {
      newPosition = 'AUDIT';
      changed = true;
    }

    return {
      ...pos,
      position: newPosition,
      changed,
      round: 2,
      reasoning: changed
        ? `Revised after deliberation. ${auditVotes} agents initially favoured AUDIT. ${newPosition === 'AUDIT' ? 'Concurring with majority.' : 'Maintaining dissent.'}`
        : pos.reasoning,
    };
  });

  // Leader selection: argmax_i [spec_i · feat_vec(t)] · accuracy_i
  const featureVec = [features.amount, features.velocity, features.device, features.geo, riskScore];
  const specVecs = [
    [0.3, 0.1, 0.1, 0.1, 0.4],  // Risk Analyst
    [0.2, 0.1, 0.3, 0.3, 0.1],  // Forensics
    [0.1, 0.2, 0.1, 0.1, 0.5],  // Coalition
    [0.1, 0.4, 0.2, 0.1, 0.2],  // Behavioural
    [0.2, 0.2, 0.2, 0.2, 0.2],  // Adversarial
  ];

  const leaderScores = specVecs.map((spec, i) => {
    const dotProduct = spec.reduce((sum, s, j) => sum + s * featureVec[j], 0);
    return dotProduct * (0.5 + Math.random() * 0.3); // proxy for accuracy_i
  });

  const leaderIdx = leaderScores.indexOf(Math.max(...leaderScores));
  const leader = AGENTS[leaderIdx];
  const leaderDecision = round2Positions[leaderIdx].position === 'AUDIT' ? 'AUDIT' : 'SKIP';

  // Consensus
  const finalPositions = round2Positions.map(p => p.position);
  const agreeing = finalPositions.filter(p => p === leaderDecision).length;
  const consensus = agreeing / AGENTS.length;

  return {
    round1: agentPositions,
    round2: round2Positions,
    leader,
    leaderIdx,
    leaderDecision,
    leaderScore: leaderScores[leaderIdx],
    consensus,
    agreeing,
    dissenters: round2Positions.filter(p => p.position !== leaderDecision).map(p => p.agent),
    dominantFeature: ['amount', 'velocity', 'device', 'geo', 'risk_score'][featureVec.indexOf(Math.max(...featureVec))],
  };
}

// ─── Simulation Round ───

/**
 * Run one simulation round
 */
export function runSimulationRound(state) {
  const { transactions, params, roundHistory, agentPriors } = state;
  const { G, alpha, P_caught, P_escaped, k, N } = params;
  const q = k / N;
  const roundNum = roundHistory.length + 1;

  // Compute type KPIs
  const typeKPIs = FRAUDSTER_TYPES.map(type =>
    computeTypeKPIs(type, q, G, alpha, P_caught, P_escaped)
  );

  // Sort transactions by risk score
  const sorted = [...transactions].sort((a, b) => b.riskScore - a.riskScore);

  // Run council on top candidates
  const candidates = sorted.slice(0, Math.min(k * 2, N));
  const deliberations = candidates.map(t => ({
    transaction: t,
    deliberation: runCouncilDeliberation(t, { ...params, auditRate: q }, roundNum),
  }));

  // Select top k for audit (prioritize AUDIT decisions, then by risk score)
  const auditDecisions = deliberations
    .sort((a, b) => {
      if (a.deliberation.leaderDecision !== b.deliberation.leaderDecision) {
        return a.deliberation.leaderDecision === 'AUDIT' ? -1 : 1;
      }
      return b.transaction.riskScore - a.transaction.riskScore;
    })
    .slice(0, k);

  const auditedIds = new Set(auditDecisions.map(d => d.transaction.id));

  // Determine outcomes
  const outcomes = transactions.map(t => {
    const audited = auditedIds.has(t.id);
    const wasFraud = t.isFraudulent;
    const caught = audited && wasFraud && Math.random() < alpha;
    const deterred = typeKPIs[FRAUDSTER_TYPES.findIndex(ft => ft.id === t.typeId)].regime === 'full';
    return { ...t, audited, caught, deterred };
  });

  // Fraud attempts (non-deterred fraudulent transactions)
  const fraudAttempts = outcomes.filter(t => t.isFraudulent && !t.deterred);
  const fraudCaught = outcomes.filter(t => t.caught);

  // Update agent priors (Thompson sampling)
  const newPriors = { ...agentPriors };
  auditDecisions.forEach(d => {
    const agentId = d.deliberation.leader.id;
    if (!newPriors[agentId]) newPriors[agentId] = { alpha: 1, beta: 1, led: 0 };
    newPriors[agentId].led += 1;
    const correct = d.transaction.isFraudulent === (d.deliberation.leaderDecision === 'AUDIT');
    if (correct) newPriors[agentId].alpha += 1;
    else newPriors[agentId].beta += 1;
  });

  // Fraudster belief update (fictitious play): q̂_T = (1/T)·Σ(audits/N)
  const prevBelief = roundHistory.length > 0 ? roundHistory[roundHistory.length - 1].fraudsterBelief : 0;
  const currentAuditRate = auditedIds.size / N;
  const fraudsterBelief = roundHistory.length === 0
    ? currentAuditRate
    : (prevBelief * roundHistory.length + currentAuditRate) / (roundHistory.length + 1);

  // Credibility gap
  const credibilityGap = Math.abs(q - fraudsterBelief);

  // Deterrence stats
  const fullDeterred = typeKPIs.filter(k => k.regime === 'full').length;
  const txnsDeterred = outcomes.filter(t => t.deterred).length;
  const DER = k > 0 ? txnsDeterred / k : 0;

  // IC constraint check (simplified: are all E[cheat] ≤ 0 for deterred types?)
  const icSatisfied = typeKPIs.every((kpi, i) => {
    if (kpi.regime === 'full') return kpi.eCheat <= 0;
    return true;
  });

  // Random baseline fraud count
  const randomAuditFraud = transactions.filter(t => t.isFraudulent).length * (1 - k / N * alpha);
  // Nash optimal (theoretical)
  const nashOptimalFraud = transactions.filter(t => t.isFraudulent).length *
    Math.max(0, 1 - Math.min(1, q / Math.max(...typeKPIs.map(k => k.qStar))));

  // Cumulative regret
  const optimalValue = Math.max(...typeKPIs.map(k => -k.eCheat));
  const actualValue = -typeKPIs.reduce((s, k) => s + k.eCheat, 0) / typeKPIs.length;
  const roundRegret = Math.max(0, optimalValue - actualValue);

  const roundData = {
    roundNum,
    q,
    typeKPIs,
    auditDecisions,
    outcomes,
    fraudAttempts: fraudAttempts.length,
    fraudCaught: fraudCaught.length,
    fraudsterBelief,
    credibilityGap,
    fullDeterred,
    txnsDeterred,
    DER,
    icSatisfied,
    agentPriors: { ...newPriors },
    randomFraud: randomAuditFraud,
    nashOptimalFraud,
    councilFraud: fraudAttempts.length,
    regret: roundRegret,
    cumulativeRegret: (roundHistory.length > 0 ? roundHistory[roundHistory.length - 1].cumulativeRegret : 0) + roundRegret,
    margins: typeKPIs.map(k => k.margin),
  };

  return {
    roundData,
    newPriors,
  };
}

// ─── Best Response Curve Data ───

export function computeBestResponseCurves(G, alpha, P_caught, P_escaped) {
  const points = [];
  for (let qInt = 0; qInt <= 100; qInt++) {
    const q = qInt / 100;
    const row = { q };
    FRAUDSTER_TYPES.forEach(type => {
      row[type.id] = computeECheat(q, G, alpha, P_caught, P_escaped, type.utilityMultiplier);
    });
    points.push(row);
  }
  return points;
}

// ─── Payoff Matrix Heatmap Data ───

export function computePayoffHeatmap(alpha, P_caught, P_escaped) {
  const data = [];
  for (let qInt = 0; qInt <= 20; qInt++) {
    const q = qInt / 20;
    for (let gInt = 1; gInt <= 20; gInt++) {
      const G = gInt * 5000;
      const eCheat = computeECheat(q, G, alpha, P_caught, P_escaped, 1.0);
      data.push({ q, G, eCheat });
    }
  }
  return data;
}

// ─── Initial State Generator ───

export function createInitialState(params) {
  const { N, k, G, alpha, P_caught, P_escaped, typeMix, timeWindow } = params;
  const transactions = generateTransactions(N, typeMix, timeWindow);

  return {
    params: { N, k, G, alpha, P_caught, P_escaped, typeMix, timeWindow },
    transactions,
    roundHistory: [],
    agentPriors: AGENTS.reduce((acc, a) => {
      acc[a.id] = { alpha: 1, beta: 1, led: 0 };
      return acc;
    }, {}),
    isRunning: false,
    currentRound: 0,
    speed: 1,
  };
}
