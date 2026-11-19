import type {
  ConfidenceBreakdown,
  DecayState,
  EvidenceSourceRecord,
  FreshnessBreakdown,
  KnowledgeDomain,
} from '../../src/types/truthos';
import { getDomainPolicy } from './claimExtractor';

export function computeConfidenceScore(params: {
  evidence: EvidenceSourceRecord[];
  independentSupportingClusters: number;
  independentContradictingClusters: number;
}): ConfidenceBreakdown {
  const { evidence, independentSupportingClusters, independentContradictingClusters } = params;

  if (evidence.length === 0) {
    return {
      total: 0,
      evidence_relevance: 0,
      source_quality: 0,
      independent_corroboration: 0,
      contradiction_penalty: 0,
      evidence_completeness: 0,
      explanation: 'No usable evidence records were retrieved; confidence remains 0 to preserve uncertainty.',
    };
  }

  const supporting = evidence.filter((e) => e.stance === 'supporting');
  const contradictory = evidence.filter((e) => e.stance === 'contradictory');

  // 1. Evidence relevance (0..25): average Tavily/claim relevance among non-duplicate sources
  const uniqueSources = evidence.filter((e) => !e.is_duplicate_url);
  const avgRelevance =
    uniqueSources.reduce((acc, e) => acc + e.relevance_score, 0) / Math.max(uniqueSources.length, 1);
  const evidenceRelevance = Math.round(Math.min(25, avgRelevance * 25));

  // 2. Source quality (0..25): weighted heuristic credibility of supporting sources (or all if none supporting)
  const qualityPool = supporting.length > 0 ? supporting : uniqueSources;
  const avgCred =
    qualityPool.reduce((acc, e) => acc + e.credibility_score, 0) / Math.max(qualityPool.length, 1);
  const sourceQuality = Math.round(Math.min(25, (avgCred / 100) * 25));

  // 3. Independent corroboration (0..25): strictly counts independent clusters, NOT copied/syndicated duplicates
  const independentCorroboration = Math.round(Math.min(25, independentSupportingClusters * 7.5));

  // 4. Contradiction penalty (0..-35)
  const strongContradictions = contradictory.filter((e) => e.credibility_score >= 60).length;
  const contradictionPenalty = Math.min(
    35,
    independentContradictingClusters * 12 + strongContradictions * 4
  );

  // 5. Evidence completeness (0..25): publication dates, primary/official source presence, multi-query coverage
  const datedCount = uniqueSources.filter((e) => Boolean(e.published_date)).length;
  const hasPrimary = uniqueSources.some((e) => e.is_primary_source || e.is_official_source);
  const completenessRaw =
    (uniqueSources.length >= 3 ? 10 : uniqueSources.length * 3) +
    (datedCount > 0 ? 8 : 0) +
    (hasPrimary ? 7 : 0);
  const evidenceCompleteness = Math.min(25, completenessRaw);

  const rawTotal =
    evidenceRelevance +
    sourceQuality +
    independentCorroboration +
    evidenceCompleteness -
    contradictionPenalty;
  const total = Math.max(5, Math.min(98, Math.round(rawTotal)));

  const explanation =
    `Relevance ${evidenceRelevance}/25 + Source Quality ${sourceQuality}/25 + Independent Corroboration ${independentCorroboration}/25 (${independentSupportingClusters} independent cluster(s)) + Completeness ${evidenceCompleteness}/25 - Contradiction Penalty ${contradictionPenalty} = ${total}/100.`;

  return {
    total,
    evidence_relevance: evidenceRelevance,
    source_quality: sourceQuality,
    independent_corroboration: independentCorroboration,
    contradiction_penalty: contradictionPenalty,
    evidence_completeness: evidenceCompleteness,
    explanation,
  };
}

export function computeFreshnessScore(params: {
  domain: KnowledgeDomain;
  evidence: EvidenceSourceRecord[];
  lastVerifiedAtIso: string;
  historicalChangeCount: number;
  outdatedDetected: boolean;
  now?: Date;
}): FreshnessBreakdown {
  const now = params.now ?? new Date();
  const policy = getDomainPolicy(params.domain);

  const datedMs = params.evidence
    .map((e) => (e.published_date ? Date.parse(e.published_date) : NaN))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => b - a);

  const mostRecentPubMs = datedMs.length > 0 ? datedMs[0] : null;
  const lastVerifiedMs = Date.parse(params.lastVerifiedAtIso) || now.getTime();
  const referenceMs = mostRecentPubMs ?? lastVerifiedMs;
  const ageDays = Math.max(0, (now.getTime() - referenceMs) / (1000 * 60 * 60 * 24));

  // Adjust effective half-life downwards if the fact has historically changed multiple times
  const changeAccelerator = 1 + Math.min(params.historicalChangeCount, 4) * 0.25;
  const effectiveHalfLife = Math.max(3, Math.round(policy.half_life_days / changeAccelerator));

  // Exponential decay curve: 100 * 0.5^(age / half_life)
  let freshness = 100 * Math.pow(0.5, ageDays / effectiveHalfLife);

  // Penalize missing publication dates moderately because age cannot be independently confirmed
  const missingDates = mostRecentPubMs === null;
  if (missingDates) {
    freshness = Math.min(freshness, 72);
  }

  // If temporal agent flagged superseding newer evidence, cap freshness sharply
  if (params.outdatedDetected) {
    freshness = Math.min(freshness, 22);
  }

  const total = Math.max(0, Math.min(100, Math.round(freshness)));

  let decayState: DecayState = 'Fresh';
  let stalenessRisk: FreshnessBreakdown['staleness_risk'] = 'low';
  if (total < 25) {
    decayState = 'Stale';
    stalenessRisk = 'critical';
  } else if (total < 50) {
    decayState = 'At Risk';
    stalenessRisk = 'high';
  } else if (total < 75) {
    decayState = 'Aging';
    stalenessRisk = 'moderate';
  }

  // Estimate next review date (when score is projected to cross ~60 threshold, bounded to [1d, 365d])
  const daysToReview = Math.max(
    1,
    Math.min(365, Math.round(effectiveHalfLife * 0.65))
  );
  const nextReview = new Date(now.getTime() + daysToReview * 24 * 60 * 60 * 1000).toISOString();

  const reasons: string[] = [
    `Domain "${params.domain}" carries ${policy.volatility_level} volatility (baseline half-life ${policy.half_life_days} days).`,
    mostRecentPubMs !== null
      ? `Most recent dated source is ${ageDays.toFixed(1)} days old.`
      : 'No explicit source publication date was returned; freshness is capped conservatively at 72.',
  ];
  if (params.historicalChangeCount > 0) {
    reasons.push(
      `${params.historicalChangeCount} historical fact change(s) compressed effective half-life to ${effectiveHalfLife} days.`
    );
  }
  if (params.outdatedDetected) {
    reasons.push('Temporal Intelligence detected newer evidence superseding the submitted claim.');
  }

  return {
    total,
    decay_state: decayState,
    evidence_age_days: mostRecentPubMs !== null ? Number(ageDays.toFixed(1)) : null,
    domain_half_life_days: effectiveHalfLife,
    volatility_level: policy.volatility_level,
    historical_change_count: params.historicalChangeCount,
    estimated_next_review_date: nextReview,
    staleness_risk: stalenessRisk,
    uncertainty_note:
      'Predictive decay estimates carry statistical uncertainty and measure expected currency—not factual truth.',
    reasons,
  };
}
