import crypto from 'crypto';
import type {
  AgentExecutionRecord,
  ClaimStatus,
  ConfidenceBreakdown,
  EvidenceSourceRecord,
  FreshnessBreakdown,
} from '../../src/types/truthos';
import { searchTavily, type TavilyResultItem } from '../services/tavilyClient';
import type { ExtractedClaimDraft } from './claimExtractor';
import { assessSourceCredibility } from './credibility';
import { computeConfidenceScore, computeFreshnessScore } from './scoring';
import { analyzeSourceDuplication } from './similarity';

export interface MultiAgentVerificationOutput {
  status: ClaimStatus;
  reasoning: string;
  evidence: EvidenceSourceRecord[];
  agents: AgentExecutionRecord[];
  confidence: ConfidenceBreakdown;
  freshness: FreshnessBreakdown;
  duplication_analysis: {
    duplicate_url_count: number;
    near_duplicate_clusters: number;
    independent_source_count: number;
    total_source_count: number;
    possible_anomaly: boolean;
    anomaly_note: string | null;
  };
  detected_new_value: string | null;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'in', 'on', 'at', 'to', 'for', 'of', 'by',
  'with', 'and', 'or', 'that', 'this', 'as', 'from', 'it', 'its', 'has', 'have', 'had', 'currently', 'today',
]);

function extractKeyTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s%$.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function tokenOverlapScore(claimText: string, snippetText: string): number {
  const claimTerms = new Set(extractKeyTerms(claimText));
  const snippetTerms = new Set(extractKeyTerms(snippetText));
  if (claimTerms.size === 0 || snippetTerms.size === 0) return 0;

  let matches = 0;
  for (const t of claimTerms) {
    if (snippetTerms.has(t)) matches++;
  }
  return Number((matches / claimTerms.size).toFixed(3));
}

function classifyEvidenceStance(params: {
  claim: ExtractedClaimDraft;
  item: TavilyResultItem;
  fromSkeptic: boolean;
}): { stance: 'supporting' | 'contradictory' | 'context'; supersededCue: boolean; mismatchNote: string | null } {
  const combined = `${params.item.title} ${params.item.content}`.toLowerCase();
  const claimLower = params.claim.normalized_claim.toLowerCase();
  const overlap = tokenOverlapScore(params.claim.normalized_claim, `${params.item.title} ${params.item.content}`);

  const negationSignals = [
    /\b(false|incorrect|inaccurate|debunked|myth|misleading|no longer|stepped down|resigned|replaced by|succeeded by|formerly|used to be|moved to|relocated to|disputed|contradicted|refuted|outdated|deprecated)\b/i,
  ];
  const hasNegation = negationSignals.some((re) => re.test(combined));

  // Check if numbers/years in the claim conflict with numbers/years in a relevant snippet
  const claimNumbers = (claimLower.match(/\b\d+(?:\.\d+)?%|\$[\d,.]+|\b(?:19|20)\d{2}\b/g) || []).filter(Boolean);
  const snippetNumbers = (combined.match(/\b\d+(?:\.\d+)?%|\$[\d,.]+|\b(?:19|20)\d{2}\b/g) || []).filter(Boolean);

  const subjectTerms = extractKeyTerms(params.claim.subject);
  const subjectPresent = subjectTerms.length === 0 || subjectTerms.some((t) => combined.includes(t));

  let numericConflict = false;
  if (subjectPresent && claimNumbers.length > 0 && snippetNumbers.length > 0) {
    const missingFromSnippet = claimNumbers.some((num) => !snippetNumbers.includes(num));
    if (missingFromSnippet && overlap >= 0.35) {
      numericConflict = true;
    }
  }

  const supersededCue =
    subjectPresent &&
    /\b(no longer|stepped down|resigned|replaced by|succeeded by|formerly|previous|moved headquarters|deprecated|superseded)\b/i.test(
      combined
    );

  if (subjectPresent && (supersededCue || numericConflict || (hasNegation && overlap >= 0.3))) {
    return {
      stance: 'contradictory',
      supersededCue,
      mismatchNote: supersededCue
        ? 'Contains temporal supersession or role/state change signal'
        : numericConflict
          ? 'Contains divergent numerical/date figures for the same subject'
          : 'Contains explicit dispute or negation language',
    };
  }

  if (subjectPresent && overlap >= 0.42 && !params.fromSkeptic) {
    return { stance: 'supporting', supersededCue: false, mismatchNote: null };
  }

  if (subjectPresent && overlap >= 0.55 && !hasNegation) {
    return { stance: 'supporting', supersededCue: false, mismatchNote: null };
  }

  return { stance: 'context', supersededCue: false, mismatchNote: null };
}

export async function runMultiAgentVerification(params: {
  claimId: string;
  claim: ExtractedClaimDraft;
  userId: string;
  historicalChangeCount?: number;
  bypassCache?: boolean;
}): Promise<MultiAgentVerificationOutput> {
  const nowIso = new Date().toISOString();
  const agents: AgentExecutionRecord[] = [];
  const warnings: string[] = [];

  // =========================================================================
  // AGENT 1: RESEARCHER AGENT
  // =========================================================================
  const resStart = Date.now();
  const primaryQuery = params.claim.normalized_claim;
  const officialQuery = `${params.claim.subject} ${params.claim.object_value.split(/\s+/).slice(0, 6).join(' ')} official`;
  const researchQueries = [primaryQuery];
  if (officialQuery.toLowerCase() !== primaryQuery.toLowerCase()) {
    researchQueries.push(officialQuery);
  }

  const researcherResults: Array<{ item: TavilyResultItem; query: string }> = [];
  const researcherWarnings: string[] = [];

  for (const q of researchQueries) {
    const resp = await searchTavily({
      query: q,
      search_depth: params.claim.time_sensitivity === 'high' ? 'advanced' : 'basic',
      topic: params.claim.domain === 'Finance' ? 'finance' : 'general',
      max_results: 5,
      userId: params.userId,
      claimId: params.claimId,
      bypassCache: params.bypassCache,
    });
    for (const r of resp.results) {
      researcherResults.push({ item: r, query: q });
    }
  }

  agents.push({
    id: crypto.randomUUID(),
    claim_id: params.claimId,
    agent_name: 'Researcher Agent',
    status: researcherResults.length > 0 ? 'completed' : 'warning',
    input_summary: `Subject="${params.claim.subject}" · Domain=${params.claim.domain}`,
    queries_executed: researchQueries,
    findings: [
      `Retrieved ${researcherResults.length} candidate web records via Tavily Search API.`,
      `Domains covered: ${Array.from(new Set(researcherResults.map((r) => r.item.domain))).slice(0, 6).join(', ') || 'none'}.`,
    ],
    evidence_refs: researcherResults.slice(0, 6).map((r) => r.item.url),
    output_summary: `Collected ${researcherResults.length} initial research sources.`,
    warnings: researcherWarnings,
    executed_at: new Date().toISOString(),
    duration_ms: Date.now() - resStart,
  });

  // =========================================================================
  // AGENT 2: SKEPTIC AGENT (Must NOT repeat Researcher's exact query)
  // =========================================================================
  const skepStart = Date.now();
  const skepticQuery = `"${params.claim.subject}" ${params.claim.predicate} changed OR updated OR disputed OR replaced OR false`;
  const skepticCurrentQuery = `${params.claim.subject} current status latest ${new Date().getFullYear()}`;
  const skepticQueries = [skepticQuery, skepticCurrentQuery];
  const skepticResults: Array<{ item: TavilyResultItem; query: string }> = [];

  for (const q of skepticQueries) {
    const resp = await searchTavily({
      query: q,
      search_depth: 'basic',
      topic: params.claim.time_sensitivity === 'high' ? 'news' : 'general',
      max_results: 4,
      userId: params.userId,
      claimId: params.claimId,
      bypassCache: params.bypassCache,
    });
    for (const r of resp.results) {
      skepticResults.push({ item: r, query: q });
    }
  }

  agents.push({
    id: crypto.randomUUID(),
    claim_id: params.claimId,
    agent_name: 'Skeptic Agent',
    status: 'completed',
    input_summary: `Adversarial challenge for claim: "${params.claim.normalized_claim}"`,
    queries_executed: skepticQueries,
    findings: [
      `Executed ${skepticQueries.length} distinct counter-evidence and current-state queries (no duplicate Researcher queries).`,
      `Retrieved ${skepticResults.length} counter-check records for conflict and update detection.`,
    ],
    evidence_refs: skepticResults.slice(0, 6).map((r) => r.item.url),
    output_summary: `Evaluated counter-evidence and current-state records across ${skepticResults.length} sources.`,
    warnings: [],
    executed_at: new Date().toISOString(),
    duration_ms: Date.now() - skepStart,
  });

  // =========================================================================
  // COMBINE CANDIDATES & RUN AGENT 4 (EVIDENCE ANALYST) + CREDIBILITY
  // =========================================================================
  const analystStart = Date.now();
  const combinedRaw = [
    ...researcherResults.map((r) => ({ ...r, fromSkeptic: false })),
    ...skepticResults.map((r) => ({ ...r, fromSkeptic: true })),
  ];

  const duplication = analyzeSourceDuplication(
    combinedRaw.map((c) => ({
      url: c.item.url,
      title: c.item.title,
      domain: c.item.domain,
      snippet: c.item.content,
      published_date: c.item.published_date,
    }))
  );

  const evidenceRecords: EvidenceSourceRecord[] = [];
  const mismatchNotes: string[] = [];
  let supersededSignals = 0;

  for (let i = 0; i < combinedRaw.length; i++) {
    const entry = combinedRaw[i];
    const dup = duplication.annotations[i];
    const cred = assessSourceCredibility({
      domain: entry.item.domain,
      url: entry.item.url,
      title: entry.item.title,
      snippet: entry.item.content,
      published_date: entry.item.published_date,
      subjectHint: params.claim.subject,
    });
    const stanceInfo = classifyEvidenceStance({
      claim: params.claim,
      item: entry.item,
      fromSkeptic: entry.fromSkeptic,
    });
    if (stanceInfo.supersededCue) supersededSignals++;
    if (stanceInfo.mismatchNote) mismatchNotes.push(`${entry.item.domain}: ${stanceInfo.mismatchNote}`);

    const overlap = tokenOverlapScore(params.claim.normalized_claim, `${entry.item.title} ${entry.item.content}`);
    const blendedRelevance = Number(Math.min(1, Math.max(overlap, entry.item.score * 0.7)).toFixed(3));

    evidenceRecords.push({
      id: crypto.randomUUID(),
      url: entry.item.url,
      canonical_url: dup.canonical_url,
      title: entry.item.title,
      domain: entry.item.domain,
      published_date: entry.item.published_date,
      retrieved_at: entry.item.retrieved_at,
      snippet: entry.item.content,
      stance: stanceInfo.stance,
      source_type: cred.source_type,
      is_primary_source: cred.is_primary_source,
      is_official_source: cred.is_official_source,
      author_or_publisher: entry.item.domain,
      credibility_score: cred.credibility_score,
      credibility_is_heuristic: true,
      credibility_explanation: cred.explanation,
      relevance_score: blendedRelevance,
      independence_cluster_id: dup.independence_cluster_id,
      is_duplicate_url: dup.is_duplicate_url,
      is_near_duplicate_text: dup.is_near_duplicate_text,
      similarity_score: dup.similarity_score,
      query_used: entry.query,
    });
  }

  agents.push({
    id: crypto.randomUUID(),
    claim_id: params.claimId,
    agent_name: 'Evidence Analyst Agent',
    status: duplication.possible_anomaly ? 'warning' : 'completed',
    input_summary: `Analyzing ${evidenceRecords.length} total source records for duplication, provenance, and independence.`,
    queries_executed: [],
    findings: [
      `Duplicate URLs detected: ${duplication.duplicate_url_count}.`,
      `Near-identical/syndicated clusters collapsed: ${duplication.near_duplicate_clusters}.`,
      `Independent reporting clusters: ${duplication.independent_source_count} out of ${duplication.total_source_count} records.`,
      ...(duplication.anomaly_note ? [duplication.anomaly_note] : []),
    ],
    evidence_refs: evidenceRecords.slice(0, 6).map((e) => e.url),
    output_summary: `${duplication.independent_source_count} independent source cluster(s) identified.`,
    warnings: duplication.anomaly_note ? [duplication.anomaly_note] : [],
    executed_at: new Date().toISOString(),
    duration_ms: Date.now() - analystStart,
  });

  // =========================================================================
  // AGENT 3: TEMPORAL INTELLIGENCE AGENT
  // =========================================================================
  const tempStart = Date.now();
  const nonDupEvidence = evidenceRecords.filter((e) => !e.is_duplicate_url);
  const datedEvidence = nonDupEvidence.filter((e) => Boolean(e.published_date));

  const latestSupportingMs = nonDupEvidence
    .filter((e) => e.stance === 'supporting' && e.published_date)
    .map((e) => Date.parse(e.published_date!))
    .sort((a, b) => b - a)[0];

  const latestContradictingMs = nonDupEvidence
    .filter((e) => e.stance === 'contradictory' && e.published_date)
    .map((e) => Date.parse(e.published_date!))
    .sort((a, b) => b - a)[0];

  const newerContradictionThanSupport =
    typeof latestContradictingMs === 'number' &&
    (typeof latestSupportingMs !== 'number' || latestContradictingMs > latestSupportingMs);

  const outdatedDetected = supersededSignals > 0 && (newerContradictionThanSupport || params.claim.relevant_dates.length > 0);

  const freshness = computeFreshnessScore({
    domain: params.claim.domain,
    evidence: nonDupEvidence,
    lastVerifiedAtIso: nowIso,
    historicalChangeCount: params.historicalChangeCount ?? 0,
    outdatedDetected,
  });

  agents.push({
    id: crypto.randomUUID(),
    claim_id: params.claimId,
    agent_name: 'Temporal Intelligence Agent',
    status: outdatedDetected ? 'warning' : 'completed',
    input_summary: `Domain=${params.claim.domain} · Time sensitivity=${params.claim.time_sensitivity} · Claim dates=${params.claim.relevant_dates.join(', ') || 'none'}`,
    queries_executed: [],
    findings: [
      `Sources with explicit publication dates: ${datedEvidence.length}/${nonDupEvidence.length}.`,
      ...freshness.reasons,
      ...(outdatedDetected ? ['Detected newer or superseding state-change evidence indicating prior fact may be outdated.'] : []),
    ],
    evidence_refs: datedEvidence.slice(0, 4).map((e) => e.url),
    output_summary: `Freshness ${freshness.total}/100 (${freshness.decay_state}) · Next review ${freshness.estimated_next_review_date.slice(0, 10)}.`,
    warnings: outdatedDetected ? ['Potential temporal supersession detected.'] : [],
    executed_at: new Date().toISOString(),
    duration_ms: Date.now() - tempStart,
  });

  // =========================================================================
  // AGENT 5: JUDGE AGENT (Transparent Rules, Zero Fabricated Certainty)
  // =========================================================================
  const judgeStart = Date.now();
  const supportingClusters = new Set(
    nonDupEvidence.filter((e) => e.stance === 'supporting' && e.relevance_score >= 0.35).map((e) => e.independence_cluster_id)
  ).size;
  const contradictingClusters = new Set(
    nonDupEvidence.filter((e) => e.stance === 'contradictory' && e.credibility_score >= 55).map((e) => e.independence_cluster_id)
  ).size;

  const confidence = computeConfidenceScore({
    evidence: nonDupEvidence,
    independentSupportingClusters: supportingClusters,
    independentContradictingClusters: contradictingClusters,
  });

  let status: ClaimStatus = 'INSUFFICIENT EVIDENCE';
  let reasoning = '';

  const usableCount = nonDupEvidence.filter((e) => e.relevance_score >= 0.3).length;

  if (usableCount === 0 || (supportingClusters === 0 && contradictingClusters === 0)) {
    status = 'INSUFFICIENT EVIDENCE';
    reasoning =
      'Available Tavily search results did not yield enough relevant, attributable evidence to establish or refute this claim. TRUTHOS refuses to fabricate certainty.';
  } else if (outdatedDetected && contradictingClusters >= 1) {
    status = 'OUTDATED';
    reasoning =
      `Temporal Intelligence and Skeptic checks identified newer or superseding evidence (${mismatchNotes.slice(0, 2).join('; ')}) showing that the stated fact no longer reflects the current state.`;
  } else if (supportingClusters >= 1 && contradictingClusters >= 1) {
    status = 'CONFLICTING';
    reasoning =
      `Independent sources disagree: ${supportingClusters} independent cluster(s) align with the claim while ${contradictingClusters} independent credible cluster(s) report conflicting figures or state (${mismatchNotes.slice(0, 2).join('; ')}).`;
  } else if (contradictingClusters >= 1 && supportingClusters === 0) {
    status = 'UNVERIFIED';
    reasoning =
      `No independent supporting corroboration was established, and ${contradictingClusters} cluster(s) reported conflicting or negating information.`;
  } else if (supportingClusters >= 2 || (supportingClusters === 1 && nonDupEvidence.some((e) => e.stance === 'supporting' && e.credibility_score >= 78))) {
    status = 'VERIFIED';
    reasoning =
      `Supported by ${supportingClusters} independent reporting cluster(s) with heuristic credibility alignment and no credible superseding contradictions retrieved.`;
  } else {
    status = 'UNVERIFIED';
    reasoning =
      `Only limited single-cluster support (${supportingClusters}) was retrieved without sufficient independent or authoritative corroboration to classify as verified.`;
  }

  const firstContradiction = nonDupEvidence.find((e) => e.stance === 'contradictory');
  const detectedNewValue = firstContradiction ? firstContradiction.snippet.slice(0, 240) : null;

  agents.push({
    id: crypto.randomUUID(),
    claim_id: params.claimId,
    agent_name: 'Judge Agent',
    status: warnings.length > 0 ? 'warning' : 'completed',
    input_summary: `Aggregated ${supportingClusters} supporting cluster(s), ${contradictingClusters} contradicting cluster(s), outdated=${outdatedDetected}.`,
    queries_executed: [],
    findings: [
      `Final verdict: ${status}.`,
      `Confidence Score: ${confidence.total}/100 (${confidence.explanation})`,
      `Freshness Score: ${freshness.total}/100 (${freshness.decay_state})`,
    ],
    evidence_refs: nonDupEvidence.slice(0, 5).map((e) => e.url),
    output_summary: `${status}: ${reasoning}`,
    warnings: [],
    executed_at: new Date().toISOString(),
    duration_ms: Date.now() - judgeStart,
  });

  return {
    status,
    reasoning,
    evidence: evidenceRecords,
    agents,
    confidence,
    freshness,
    duplication_analysis: {
      duplicate_url_count: duplication.duplicate_url_count,
      near_duplicate_clusters: duplication.near_duplicate_clusters,
      independent_source_count: duplication.independent_source_count,
      total_source_count: duplication.total_source_count,
      possible_anomaly: duplication.possible_anomaly,
      anomaly_note: duplication.anomaly_note,
    },
    detected_new_value: detectedNewValue,
  };
}
