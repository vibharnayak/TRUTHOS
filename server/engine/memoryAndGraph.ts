import crypto from 'crypto';
import type { ClaimStatus } from '../../src/types/truthos';
import { getDb } from '../db/database';
import type { ExtractedClaimDraft } from './claimExtractor';
import type { MultiAgentVerificationOutput } from './agents';

function normalizeEntityName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function upsertEntityAndGraphForClaim(params: {
  userId: string;
  claimId: string;
  claim: ExtractedClaimDraft;
  result: MultiAgentVerificationOutput;
}): void {
  const db = getDb();
  const nowIso = new Date().toISOString();

  const subjectNorm = normalizeEntityName(params.claim.subject);
  if (!subjectNorm) return;

  const ensureEntity = (name: string, entityType: string): string => {
    const norm = normalizeEntityName(name) || 'entity';
    const existing = db
      .prepare(`SELECT id FROM entities WHERE user_id = ? AND normalized_name = ?`)
      .get(params.userId, norm) as { id: string } | undefined;
    if (existing) return existing.id;

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO entities (id, user_id, name, normalized_name, entity_type, domain)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, params.userId, name.slice(0, 120), norm, entityType, params.claim.domain);
    return id;
  };

  const subjectType = params.claim.entities[0]?.type || 'Entity';
  const subjectId = ensureEntity(params.claim.subject, subjectType);

  // Create target entity from extracted secondary entity or compact object phrase
  const secondaryEntity = params.claim.entities.find(
    (e) => normalizeEntityName(e.text) !== subjectNorm
  );
  const targetLabel = secondaryEntity
    ? secondaryEntity.text
    : params.claim.object_value.split(/[,.;]/)[0].slice(0, 80);
  const targetType = secondaryEntity ? secondaryEntity.type : 'AttributeValue';

  if (normalizeEntityName(targetLabel)) {
    const targetId = ensureEntity(targetLabel, targetType);

    // Check if there was an active non-historical relationship with the same subject + predicate
    const existingRel = db
      .prepare(
        `SELECT id, target_entity_id FROM knowledge_graph_relationships
         WHERE user_id = ? AND source_entity_id = ? AND predicate = ? AND is_historical = 0`
      )
      .get(params.userId, subjectId, params.claim.predicate) as
      | { id: string; target_entity_id: string }
      | undefined;

    if (existingRel && existingRel.target_entity_id !== targetId) {
      // Preserve old relationship as historical! Never overwrite without history.
      db.prepare(
        `UPDATE knowledge_graph_relationships SET valid_until = ?, is_historical = 1 WHERE id = ?`
      ).run(nowIso, existingRel.id);
    }

    if (!existingRel || existingRel.target_entity_id !== targetId) {
      db.prepare(
        `INSERT INTO knowledge_graph_relationships
          (id, user_id, source_entity_id, target_entity_id, predicate, claim_id, valid_from, valid_until, confidence, freshness, is_historical)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`
      ).run(
        crypto.randomUUID(),
        params.userId,
        subjectId,
        targetId,
        params.claim.predicate,
        params.claimId,
        nowIso,
        params.result.confidence.total,
        params.result.freshness.total
      );
    } else {
      db.prepare(
        `UPDATE knowledge_graph_relationships SET confidence = ?, freshness = ?, claim_id = ? WHERE id = ?`
      ).run(params.result.confidence.total, params.result.freshness.total, params.claimId, existingRel.id);
    }
  }
}

export function persistVerificationOutputs(params: {
  userId: string;
  jobId: string;
  claimId: string;
  claim: ExtractedClaimDraft;
  result: MultiAgentVerificationOutput;
  isRecheck?: boolean;
  previousStatus?: ClaimStatus;
  previousConfidence?: number;
}): { changeDetected: boolean } {
  const db = getDb();
  const nowIso = new Date().toISOString();

  // Persist sources & evidence records (on recheck, replace current evidence snapshot while preserving version history)
  if (params.isRecheck) {
    db.prepare(`DELETE FROM supporting_evidence WHERE claim_id = ?`).run(params.claimId);
    db.prepare(`DELETE FROM contradictory_evidence WHERE claim_id = ?`).run(params.claimId);
    db.prepare(`DELETE FROM evidence_records WHERE claim_id = ?`).run(params.claimId);
    db.prepare(`DELETE FROM agent_executions WHERE claim_id = ?`).run(params.claimId);
  }

  const insertSource = db.prepare(
    `INSERT INTO sources (id, url, canonical_url, domain, title, published_date, author_or_publisher, source_type, is_primary_source, is_official_source, credibility_score, credibility_explanation, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEvidence = db.prepare(
    `INSERT INTO evidence_records (id, claim_id, source_id, stance, snippet, relevance_score, independence_cluster_id, is_duplicate_url, is_near_duplicate_text, similarity_score, query_used, retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSupport = db.prepare(
    `INSERT INTO supporting_evidence (id, claim_id, evidence_id) VALUES (?, ?, ?)`
  );
  const insertContra = db.prepare(
    `INSERT INTO contradictory_evidence (id, claim_id, evidence_id) VALUES (?, ?, ?)`
  );

  for (const ev of params.result.evidence) {
    const sourceId = crypto.randomUUID();
    const contentHash = crypto.createHash('sha256').update(`${ev.title} ${ev.snippet}`).digest('hex').slice(0, 16);
    insertSource.run(
      sourceId,
      ev.url,
      ev.canonical_url,
      ev.domain,
      ev.title,
      ev.published_date,
      ev.author_or_publisher,
      ev.source_type,
      ev.is_primary_source ? 1 : 0,
      ev.is_official_source ? 1 : 0,
      ev.credibility_score,
      ev.credibility_explanation,
      contentHash
    );
    insertEvidence.run(
      ev.id,
      params.claimId,
      sourceId,
      ev.stance,
      ev.snippet,
      ev.relevance_score,
      ev.independence_cluster_id,
      ev.is_duplicate_url ? 1 : 0,
      ev.is_near_duplicate_text ? 1 : 0,
      ev.similarity_score,
      ev.query_used,
      ev.retrieved_at
    );
    if (ev.stance === 'supporting') {
      insertSupport.run(crypto.randomUUID(), params.claimId, ev.id);
    } else if (ev.stance === 'contradictory') {
      insertContra.run(crypto.randomUUID(), params.claimId, ev.id);
    }
  }

  const insertAgent = db.prepare(
    `INSERT INTO agent_executions (id, claim_id, agent_name, status, input_summary, queries_json, findings_json, evidence_refs_json, output_summary, warnings_json, duration_ms, executed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const ag of params.result.agents) {
    insertAgent.run(
      ag.id,
      params.claimId,
      ag.agent_name,
      ag.status,
      ag.input_summary,
      JSON.stringify(ag.queries_executed),
      JSON.stringify(ag.findings),
      JSON.stringify(ag.evidence_refs),
      ag.output_summary,
      JSON.stringify(ag.warnings),
      ag.duration_ms,
      ag.executed_at
    );
  }

  db.prepare(
    `INSERT OR REPLACE INTO verification_results (id, claim_id, status, reasoning, duplication_summary_json, verified_at)
     VALUES (COALESCE((SELECT id FROM verification_results WHERE claim_id = ?), ?), ?, ?, ?, ?, ?)`
  ).run(
    params.claimId,
    crypto.randomUUID(),
    params.claimId,
    params.result.status,
    params.result.reasoning,
    JSON.stringify(params.result.duplication_analysis),
    nowIso
  );

  db.prepare(
    `INSERT OR REPLACE INTO confidence_scores (id, claim_id, total_score, evidence_relevance, source_quality, independent_corroboration, contradiction_penalty, evidence_completeness, explanation, calculated_at)
     VALUES (COALESCE((SELECT id FROM confidence_scores WHERE claim_id = ?), ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.claimId,
    crypto.randomUUID(),
    params.claimId,
    params.result.confidence.total,
    params.result.confidence.evidence_relevance,
    params.result.confidence.source_quality,
    params.result.confidence.independent_corroboration,
    params.result.confidence.contradiction_penalty,
    params.result.confidence.evidence_completeness,
    params.result.confidence.explanation,
    nowIso
  );

  db.prepare(
    `INSERT OR REPLACE INTO freshness_scores (id, claim_id, total_score, decay_state, evidence_age_days, domain_half_life_days, volatility_level, historical_change_count, estimated_next_review_date, staleness_risk, uncertainty_note, reasons_json, calculated_at)
     VALUES (COALESCE((SELECT id FROM freshness_scores WHERE claim_id = ?), ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.claimId,
    crypto.randomUUID(),
    params.claimId,
    params.result.freshness.total,
    params.result.freshness.decay_state,
    params.result.freshness.evidence_age_days,
    params.result.freshness.domain_half_life_days,
    params.result.freshness.volatility_level,
    params.result.freshness.historical_change_count,
    params.result.freshness.estimated_next_review_date,
    params.result.freshness.staleness_risk,
    params.result.freshness.uncertainty_note,
    JSON.stringify(params.result.freshness.reasons),
    nowIso
  );

  // Version & Self-Healing History
  const latestVersion = db
    .prepare(`SELECT id, version_number, status FROM fact_versions WHERE claim_id = ? ORDER BY version_number DESC LIMIT 1`)
    .get(params.claimId) as { id: string; version_number: number; status: ClaimStatus } | undefined;

  const evidenceUrls = Array.from(new Set(params.result.evidence.slice(0, 6).map((e) => e.url)));
  const statusChanged = Boolean(latestVersion && latestVersion.status !== params.result.status);
  const changeDetected = statusChanged || (params.result.status === 'OUTDATED' && Boolean(params.isRecheck));

  if (!latestVersion) {
    db.prepare(
      `INSERT INTO fact_versions (id, claim_id, version_number, claim_text, subject, predicate, object_value, status, confidence_score, freshness_score, valid_from, valid_until, change_summary, evidence_urls_json)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.claimId,
      params.claim.normalized_claim,
      params.claim.subject,
      params.claim.predicate,
      params.claim.object_value,
      params.result.status,
      params.result.confidence.total,
      params.result.freshness.total,
      nowIso,
      'Initial verification baseline recorded',
      JSON.stringify(evidenceUrls)
    );
  } else if (changeDetected || params.isRecheck) {
    // Close previous version validity window without overwriting history
    db.prepare(`UPDATE fact_versions SET valid_until = ? WHERE id = ? AND valid_until IS NULL`).run(
      nowIso,
      latestVersion.id
    );
    const nextVer = latestVersion.version_number + 1;
    const changeSummary = statusChanged
      ? `Status transitioned from ${latestVersion.status} to ${params.result.status}`
      : `Re-verified at confidence ${params.result.confidence.total}/100`;

    db.prepare(
      `INSERT INTO fact_versions (id, claim_id, version_number, claim_text, subject, predicate, object_value, status, confidence_score, freshness_score, valid_from, valid_until, change_summary, evidence_urls_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.claimId,
      nextVer,
      params.claim.normalized_claim,
      params.claim.subject,
      params.claim.predicate,
      params.claim.object_value,
      params.result.status,
      params.result.confidence.total,
      params.result.freshness.total,
      nowIso,
      changeSummary,
      JSON.stringify(evidenceUrls)
    );

    if (changeDetected) {
      const prevInfo = `Previously recorded as ${latestVersion.status}: "${params.claim.normalized_claim}"`;
      const newInfo = params.result.detected_new_value
        ? `Updated evidence (${params.result.status}): ${params.result.detected_new_value}`
        : `Reverification status changed to ${params.result.status}: ${params.result.reasoning}`;

      db.prepare(
        `INSERT INTO historical_facts (id, user_id, claim_id, previous_info, new_info, changes_detected, why_changed, evidence_urls_json, recommended_action)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        params.userId,
        params.claimId,
        prevInfo,
        newInfo,
        `Verification state shifted from ${latestVersion.status} to ${params.result.status}`,
        params.result.reasoning,
        JSON.stringify(evidenceUrls),
        params.result.status === 'OUTDATED' ? 'Update' : 'Flag for human review'
      );

      // Flag all dependent records for re-verification (never silently rewrite stored answers!)
      db.prepare(
        `UPDATE knowledge_dependencies SET reverification_status = 'needs_review' WHERE claim_id = ? AND user_id = ?`
      ).run(params.claimId, params.userId);
      db.prepare(
        `UPDATE updated_answers SET reverification_status = 'needs_review', last_checked_at = ?
         WHERE id IN (SELECT dependent_record_id FROM knowledge_dependencies WHERE claim_id = ? AND user_id = ?)`
      ).run(nowIso, params.claimId, params.userId);
    }
  }

  db.prepare(`UPDATE extracted_claims SET updated_at = ? WHERE id = ?`).run(nowIso, params.claimId);
  upsertEntityAndGraphForClaim({
    userId: params.userId,
    claimId: params.claimId,
    claim: params.claim,
    result: params.result,
  });

  return { changeDetected };
}
