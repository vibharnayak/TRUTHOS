import crypto from 'crypto';
import { getDb } from '../db/database';
import { recheckClaimById } from '../services/verificationService';
import { isTavilyConfigured } from '../services/tavilyClient';

let workerTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

export async function processDueMonitoringSchedules(): Promise<{ processed: number; alertsCreated: number }> {
  if (isProcessing) return { processed: 0, alertsCreated: 0 };
  isProcessing = true;
  let processed = 0;
  let alertsCreated = 0;

  try {
    const db = getDb();
    const dueSchedules = db
      .prepare(
        `SELECT ms.*, c.normalized_claim, fs.total_score AS current_freshness, vr.status AS current_status
         FROM monitoring_schedules ms
         JOIN extracted_claims c ON c.id = ms.claim_id
         LEFT JOIN freshness_scores fs ON fs.claim_id = ms.claim_id
         LEFT JOIN verification_results vr ON vr.claim_id = ms.claim_id
         WHERE ms.status = 'active' AND datetime(ms.next_run_at) <= datetime('now')
         LIMIT 5`
      )
      .all() as Array<{
      id: string;
      user_id: string;
      claim_id: string;
      frequency_hours: number;
      freshness_threshold: number;
      alert_on_change: number;
      alert_on_stale: number;
      normalized_claim: string;
      current_freshness: number | null;
      current_status: string | null;
    }>;

    for (const sched of dueSchedules) {
      const nextRunIso = new Date(Date.now() + sched.frequency_hours * 60 * 60 * 1000).toISOString();

      if (!isTavilyConfigured()) {
        db.prepare(
          `INSERT INTO monitoring_executions (id, schedule_id, claim_id, status, previous_status, new_status, change_detected, notes)
           VALUES (?, ?, ?, 'failed', ?, ?, 0, ?)`
        ).run(
          crypto.randomUUID(),
          sched.id,
          sched.claim_id,
          sched.current_status,
          sched.current_status,
          'Skipped live Tavily reverification because TAVILY_API_KEY is not configured.'
        );
        db.prepare(`UPDATE monitoring_schedules SET next_run_at = ? WHERE id = ?`).run(nextRunIso, sched.id);
        processed++;
        continue;
      }

      try {
        const outcome = await recheckClaimById({
          claimId: sched.claim_id,
          userId: sched.user_id,
          bypassCache: true,
        });

        const updatedFreshness = db
          .prepare(`SELECT total_score FROM freshness_scores WHERE claim_id = ?`)
          .get(sched.claim_id) as { total_score: number } | undefined;

        const nowIso = new Date().toISOString();
        db.prepare(
          `UPDATE monitoring_schedules SET last_verified_at = ?, next_run_at = ? WHERE id = ?`
        ).run(nowIso, nextRunIso, sched.id);

        db.prepare(
          `INSERT INTO monitoring_executions (id, schedule_id, claim_id, status, previous_status, new_status, change_detected, notes)
           VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          sched.id,
          sched.claim_id,
          outcome.previousStatus,
          outcome.newStatus,
          outcome.changeDetected ? 1 : 0,
          outcome.changeDetected
            ? `Status shifted from ${outcome.previousStatus} to ${outcome.newStatus}.`
            : `Verified steady at ${outcome.newStatus}.`
        );

        if (outcome.changeDetected && sched.alert_on_change) {
          db.prepare(
            `INSERT INTO alerts (id, user_id, schedule_id, claim_id, severity, title, message)
             VALUES (?, ?, ?, ?, 'critical', ?, ?)`
          ).run(
            crypto.randomUUID(),
            sched.user_id,
            sched.id,
            sched.claim_id,
            `Fact Status Changed: ${outcome.previousStatus} → ${outcome.newStatus}`,
            `Scheduled reverification detected a state change for "${sched.normalized_claim}". Dependent knowledge records have been flagged for review.`
          );
          alertsCreated++;
        } else if (
          sched.alert_on_stale &&
          updatedFreshness &&
          updatedFreshness.total_score < sched.freshness_threshold
        ) {
          db.prepare(
            `INSERT INTO alerts (id, user_id, schedule_id, claim_id, severity, title, message)
             VALUES (?, ?, ?, ?, 'warning', ?, ?)`
          ).run(
            crypto.randomUUID(),
            sched.user_id,
            sched.id,
            sched.claim_id,
            `Freshness Below Threshold (${Math.round(updatedFreshness.total_score)}/100)`,
            `Claim "${sched.normalized_claim}" fell below your configured freshness threshold of ${sched.freshness_threshold}.`
          );
          alertsCreated++;
        }

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Monitoring worker failure';
        db.prepare(
          `INSERT INTO monitoring_executions (id, schedule_id, claim_id, status, previous_status, new_status, change_detected, notes)
           VALUES (?, ?, ?, 'failed', ?, ?, 0, ?)`
        ).run(crypto.randomUUID(), sched.id, sched.claim_id, sched.current_status, sched.current_status, msg.slice(0, 300));
        db.prepare(`UPDATE monitoring_schedules SET next_run_at = ? WHERE id = ?`).run(nextRunIso, sched.id);
        processed++;
      }
    }
  } finally {
    isProcessing = false;
  }

  return { processed, alertsCreated };
}

export function startMonitoringWorker(intervalMs = 60000): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processDueMonitoringSchedules();
  }, intervalMs);
}

export function stopMonitoringWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
