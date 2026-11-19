import type {
  AgentExecutionRecord,
  ClaimDetailRecord,
  ClaimStatus,
  DecayState,
  EvidenceSourceRecord,
  FactVersionRecord,
  KnowledgeDomain,
  SourceCategory,
} from '../../src/types/truthos';
import { getDb } from '../db/database';

export function hydrateClaimDetail(claimId: string, userId: string): ClaimDetailRecord | null {
  const db = getDb();
  const c = db
    .prepare(
      `SELECT c.*, cc.domain, cc.time_sensitivity, cc.volatility_level, cc.half_life_days,
              vr.status, vr.reasoning, vr.duplication_summary_json,
              cs.total_score AS conf_total, cs.evidence_relevance, cs.source_quality, cs.independent_corroboration,
              cs.contradiction_penalty, cs.evidence_completeness, cs.explanation AS conf_explanation,
              fs.total_score AS fresh_total, fs.decay_state, fs.evidence_age_days, fs.domain_half_life_days,
              fs.volatility_level AS fs_volatility, fs.historical_change_count, fs.estimated_next_review_date,
              fs.staleness_risk, fs.uncertainty_note, fs.reasons_json
       FROM extracted_claims c
       JOIN claim_classifications cc ON cc.claim_id = c.id
       LEFT JOIN verification_results vr ON vr.claim_id = c.id
       LEFT JOIN confidence_scores cs ON cs.claim_id = c.id
       LEFT JOIN freshness_scores fs ON fs.claim_id = c.id
       WHERE c.id = ? AND c.user_id = ?`
    )
    .get(claimId, userId) as Record<string, unknown> | undefined;

  if (!c) return null;

  const evRows = db
    .prepare(
      `SELECT er.*, s.url, s.canonical_url, s.domain, s.title, s.published_date, s.author_or_publisher,
              s.source_type, s.is_primary_source, s.is_official_source, s.credibility_score, s.credibility_explanation
       FROM evidence_records er
       JOIN sources s ON s.id = er.source_id
       WHERE er.claim_id = ?
       ORDER BY er.relevance_score DESC`
    )
    .all(claimId) as Array<Record<string, unknown>>;

  const evidence: EvidenceSourceRecord[] = evRows.map((r) => ({
    id: String(r.id),
    url: String(r.url),
    canonical_url: String(r.canonical_url),
    title: String(r.title),
    domain: String(r.domain),
    published_date: r.published_date ? String(r.published_date) : null,
    retrieved_at: String(r.retrieved_at),
    snippet: String(r.snippet),
    stance: r.stance as EvidenceSourceRecord['stance'],
    source_type: r.source_type as SourceCategory,
    is_primary_source: Boolean(r.is_primary_source),
    is_official_source: Boolean(r.is_official_source),
    author_or_publisher: r.author_or_publisher ? String(r.author_or_publisher) : null,
    credibility_score: Number(r.credibility_score),
    credibility_is_heuristic: true,
    credibility_explanation: String(r.credibility_explanation),
    relevance_score: Number(r.relevance_score),
    independence_cluster_id: String(r.independence_cluster_id),
    is_duplicate_url: Boolean(r.is_duplicate_url),
    is_near_duplicate_text: Boolean(r.is_near_duplicate_text),
    similarity_score: Number(r.similarity_score),
    query_used: String(r.query_used),
  }));

  const agRows = db
    .prepare(`SELECT * FROM agent_executions WHERE claim_id = ? ORDER BY executed_at ASC`)
    .all(claimId) as Array<Record<string, unknown>>;

  const agents: AgentExecutionRecord[] = agRows.map((a) => ({
    id: String(a.id),
    claim_id: String(a.claim_id),
    agent_name: a.agent_name as AgentExecutionRecord['agent_name'],
    status: a.status as AgentExecutionRecord['status'],
    input_summary: String(a.input_summary),
    queries_executed: JSON.parse(String(a.queries_json || '[]')),
    findings: JSON.parse(String(a.findings_json || '[]')),
    evidence_refs: JSON.parse(String(a.evidence_refs_json || '[]')),
    output_summary: String(a.output_summary),
    warnings: JSON.parse(String(a.warnings_json || '[]')),
    executed_at: String(a.executed_at),
    duration_ms: Number(a.duration_ms || 0),
  }));

  const verRows = db
    .prepare(`SELECT * FROM fact_versions WHERE claim_id = ? ORDER BY version_number DESC`)
    .all(claimId) as Array<Record<string, unknown>>;

  const versions: FactVersionRecord[] = verRows.map((v) => ({
    id: String(v.id),
    claim_id: String(v.claim_id),
    version_number: Number(v.version_number),
    claim_text: String(v.claim_text),
    subject: String(v.subject),
    predicate: String(v.predicate),
    object_value: String(v.object_value),
    status: v.status as ClaimStatus,
    confidence_score: Number(v.confidence_score),
    freshness_score: Number(v.freshness_score),
    valid_from: String(v.valid_from),
    valid_until: v.valid_until ? String(v.valid_until) : null,
    change_summary: v.change_summary ? String(v.change_summary) : null,
    evidence_urls: JSON.parse(String(v.evidence_urls_json || '[]')),
    created_at: String(v.created_at),
  }));

  const dupSummary = JSON.parse(String(c.duplication_summary_json || '{}'));

  return {
    id: String(c.id),
    job_id: String(c.job_id),
    original_text: String(c.original_text),
    normalized_claim: String(c.normalized_claim),
    subject: String(c.subject),
    predicate: String(c.predicate),
    object_value: String(c.object_value),
    entities: JSON.parse(String(c.entities_json || '[]')),
    relevant_dates: JSON.parse(String(c.relevant_dates_json || '[]')),
    domain: String(c.domain) as KnowledgeDomain,
    time_sensitivity: (c.time_sensitivity as 'high' | 'medium' | 'low') || 'medium',
    extraction_confidence: Number(c.extraction_confidence || 0.7),
    status: (c.status as ClaimStatus) || 'UNVERIFIED',
    reasoning: String(c.reasoning || 'Verification pending.'),
    confidence_score: Number(c.conf_total ?? 0),
    freshness_score: Number(c.fresh_total ?? 0),
    decay_state: (c.decay_state as DecayState) || 'Aging',
    confidence_breakdown: {
      total: Number(c.conf_total ?? 0),
      evidence_relevance: Number(c.evidence_relevance ?? 0),
      source_quality: Number(c.source_quality ?? 0),
      independent_corroboration: Number(c.independent_corroboration ?? 0),
      contradiction_penalty: Number(c.contradiction_penalty ?? 0),
      evidence_completeness: Number(c.evidence_completeness ?? 0),
      explanation: String(c.conf_explanation ?? ''),
    },
    freshness_breakdown: {
      total: Number(c.fresh_total ?? 0),
      decay_state: (c.decay_state as DecayState) || 'Aging',
      evidence_age_days: c.evidence_age_days !== null && c.evidence_age_days !== undefined ? Number(c.evidence_age_days) : null,
      domain_half_life_days: Number(c.domain_half_life_days ?? c.half_life_days ?? 90),
      volatility_level: (c.fs_volatility || c.volatility_level || 'moderate') as 'extreme' | 'high' | 'moderate' | 'low',
      historical_change_count: Number(c.historical_change_count ?? 0),
      estimated_next_review_date: String(c.estimated_next_review_date || new Date().toISOString()),
      staleness_risk: (c.staleness_risk || 'moderate') as 'low' | 'moderate' | 'high' | 'critical',
      uncertainty_note: String(
        c.uncertainty_note || 'Predictive decay estimates carry uncertainty and do not guarantee accuracy.'
      ),
      reasons: JSON.parse(String(c.reasons_json || '[]')),
    },
    is_sample_data: Boolean(c.is_sample_data),
    created_at: String(c.created_at),
    updated_at: String(c.updated_at),
    evidence,
    agents,
    versions,
    duplication_analysis: {
      duplicate_url_count: Number(dupSummary.duplicate_url_count ?? 0),
      near_duplicate_clusters: Number(dupSummary.near_duplicate_clusters ?? 0),
      independent_source_count: Number(dupSummary.independent_source_count ?? 0),
      total_source_count: Number(dupSummary.total_source_count ?? evidence.length),
      possible_anomaly: Boolean(dupSummary.possible_anomaly),
      anomaly_note: dupSummary.anomaly_note ?? null,
    },
  };
}
