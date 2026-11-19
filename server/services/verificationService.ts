import crypto from 'crypto';
import type { ClaimStatus, KnowledgeDomain } from '../../src/types/truthos';
import { getDb } from '../db/database';
import { recordAuditLog } from '../core/security';
import { extractClaimsFromText, getDomainPolicy, type ExtractedClaimDraft } from '../engine/claimExtractor';
import { runMultiAgentVerification } from '../engine/agents';
import { persistVerificationOutputs } from '../engine/memoryAndGraph';
import { MissingTavilyKeyError, TavilyApiError, TavilyRateLimitError } from './tavilyClient';

export async function submitAndVerifyDocument(params: {
  userId: string;
  title: string;
  sourceType: string;
  rawText: string;
  bypassCache?: boolean;
}): Promise<{
  jobId: string;
  status: 'completed' | 'failed';
  claimCount: number;
  error?: string;
  errorCode?: string;
}> {
  const db = getDb();
  const docId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const contentHash = crypto.createHash('sha256').update(params.rawText).digest('hex');

  db.prepare(
    `INSERT INTO submitted_documents (id, user_id, title, source_type, raw_text, content_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(docId, params.userId, params.title.slice(0, 180), params.sourceType, params.rawText, contentHash);

  db.prepare(
    `INSERT INTO verification_jobs (id, user_id, document_id, status, is_sample_data)
     VALUES (?, ?, ?, 'processing', 0)`
  ).run(jobId, params.userId, docId);

  const drafts = extractClaimsFromText(params.rawText);

  if (drafts.length === 0) {
    const errMsg =
      'No verifiable factual claims could be extracted from the submitted text (opinions, questions, and hypotheticals were filtered).';
    db.prepare(
      `UPDATE verification_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(errMsg, jobId);
    return { jobId, status: 'failed', claimCount: 0, error: errMsg, errorCode: 'NO_FACTUAL_CLAIMS' };
  }

  // Create dependent answer record for knowledge dependency mapping
  const answerId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO updated_answers (id, user_id, title, answer_text, reverification_status)
     VALUES (?, ?, ?, ?, 'current')`
  ).run(answerId, params.userId, params.title.slice(0, 180), params.rawText.slice(0, 2000));

  try {
    for (const draft of drafts) {
      const claimId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO extracted_claims
          (id, job_id, user_id, original_text, normalized_claim, subject, predicate, object_value, entities_json, relevant_dates_json, extraction_confidence, is_sample_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).run(
        claimId,
        jobId,
        params.userId,
        draft.original_text,
        draft.normalized_claim,
        draft.subject,
        draft.predicate,
        draft.object_value,
        JSON.stringify(draft.entities),
        JSON.stringify(draft.relevant_dates),
        draft.extraction_confidence
      );

      db.prepare(
        `INSERT INTO claim_classifications (id, claim_id, domain, time_sensitivity, volatility_level, half_life_days)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        claimId,
        draft.domain,
        draft.time_sensitivity,
        draft.volatility_level,
        draft.half_life_days
      );

      // Link claim dependency to submitted answer/report
      db.prepare(
        `INSERT INTO knowledge_dependencies (id, user_id, claim_id, dependent_record_id, dependent_record_type, dependent_title, impact_note, reverification_status)
         VALUES (?, ?, ?, ?, 'Report / Answer', ?, ?, 'current')`
      ).run(
        crypto.randomUUID(),
        params.userId,
        claimId,
        answerId,
        params.title.slice(0, 180),
        `Submitted document "${params.title.slice(0, 80)}" depends on this factual assertion.`
      );

      const verificationOutput = await runMultiAgentVerification({
        claimId,
        claim: draft,
        userId: params.userId,
        historicalChangeCount: 0,
        bypassCache: params.bypassCache,
      });

      persistVerificationOutputs({
        userId: params.userId,
        jobId,
        claimId,
        claim: draft,
        result: verificationOutput,
        isRecheck: false,
      });
    }

    db.prepare(
      `UPDATE verification_jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?`
    ).run(jobId);

    recordAuditLog({
      userId: params.userId,
      action: 'VERIFICATION_JOB_COMPLETED',
      resourceType: 'verification_job',
      resourceId: jobId,
      details: { claim_count: drafts.length },
    });

    return { jobId, status: 'completed', claimCount: drafts.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification pipeline failed.';
    const code =
      err instanceof MissingTavilyKeyError
        ? err.code
        : err instanceof TavilyRateLimitError
          ? err.code
          : err instanceof TavilyApiError
            ? err.code
            : 'VERIFICATION_FAILED';

    db.prepare(
      `UPDATE verification_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(message, jobId);

    return { jobId, status: 'failed', claimCount: 0, error: message, errorCode: code };
  }
}

export async function recheckClaimById(params: {
  claimId: string;
  userId: string;
  bypassCache?: boolean;
}): Promise<{
  claimId: string;
  previousStatus: ClaimStatus;
  newStatus: ClaimStatus;
  changeDetected: boolean;
}> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*, cc.domain, cc.time_sensitivity, cc.volatility_level, cc.half_life_days,
              vr.status AS current_status, cs.total_score AS current_confidence
       FROM extracted_claims c
       JOIN claim_classifications cc ON cc.claim_id = c.id
       LEFT JOIN verification_results vr ON vr.claim_id = c.id
       LEFT JOIN confidence_scores cs ON cs.claim_id = c.id
       WHERE c.id = ? AND c.user_id = ?`
    )
    .get(params.claimId, params.userId) as
    | {
        id: string;
        job_id: string;
        original_text: string;
        normalized_claim: string;
        subject: string;
        predicate: string;
        object_value: string;
        entities_json: string;
        relevant_dates_json: string;
        extraction_confidence: number;
        domain: KnowledgeDomain;
        time_sensitivity: 'high' | 'medium' | 'low';
        volatility_level: 'extreme' | 'high' | 'moderate' | 'low';
        half_life_days: number;
        current_status: ClaimStatus | null;
        current_confidence: number | null;
      }
    | undefined;

  if (!row) {
    throw new Error('Claim not found or access denied.');
  }

  const historyCountRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM historical_facts WHERE claim_id = ?`)
    .get(params.claimId) as { cnt: number };

  const policy = getDomainPolicy(row.domain);
  const draft: ExtractedClaimDraft = {
    original_text: row.original_text,
    normalized_claim: row.normalized_claim,
    subject: row.subject,
    predicate: row.predicate,
    object_value: row.object_value,
    entities: JSON.parse(row.entities_json || '[]'),
    relevant_dates: JSON.parse(row.relevant_dates_json || '[]'),
    domain: row.domain,
    time_sensitivity: row.time_sensitivity || policy.time_sensitivity,
    volatility_level: row.volatility_level || policy.volatility_level,
    half_life_days: row.half_life_days || policy.half_life_days,
    extraction_confidence: row.extraction_confidence,
  };

  const result = await runMultiAgentVerification({
    claimId: row.id,
    claim: draft,
    userId: params.userId,
    historicalChangeCount: historyCountRow.cnt,
    bypassCache: params.bypassCache ?? true,
  });

  const previousStatus: ClaimStatus = row.current_status || 'UNVERIFIED';
  const { changeDetected } = persistVerificationOutputs({
    userId: params.userId,
    jobId: row.job_id,
    claimId: row.id,
    claim: draft,
    result,
    isRecheck: true,
    previousStatus,
    previousConfidence: row.current_confidence ?? undefined,
  });

  recordAuditLog({
    userId: params.userId,
    action: 'CLAIM_RECHECKED',
    resourceType: 'claim',
    resourceId: row.id,
    details: { previous_status: previousStatus, new_status: result.status, change_detected: changeDetected },
  });

  return {
    claimId: row.id,
    previousStatus,
    newStatus: result.status,
    changeDetected,
  };
}
