import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '../server/db/database';
import { extractClaimsFromText } from '../server/engine/claimExtractor';
import { analyzeSourceDuplication } from '../server/engine/similarity';
import { computeConfidenceScore, computeFreshnessScore } from '../server/engine/scoring';
import {
  MissingTavilyKeyError,
  searchTavily,
  setTavilyFetchForTests,
  TavilyRateLimitError,
} from '../server/services/tavilyClient';
import { recheckClaimById, submitAndVerifyDocument } from '../server/services/verificationService';
import { processDueMonitoringSchedules } from '../server/workers/monitoringWorker';
import { createTruthOsApp } from '../server';
import type { EvidenceSourceRecord } from '../src/types/truthos';

function makeMockTavilyFetch(
  handler: (url: string, init: RequestInit) => Promise<{ status: number; body: unknown }>
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await handler(String(input), init || {});
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('TRUTHOS Core Engine & API Suite', () => {
  let tempDbPath = '';

  beforeEach(() => {
    process.env.VITEST = 'true';
    process.env.SECRET_KEY = 'test-secret-key-for-vitest-only';
    process.env.TAVILY_API_KEY = 'tvly-test-key-000000';
    tempDbPath = path.join(os.tmpdir(), `truthos-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
    resetDbForTests(tempDbPath);
  });

  afterEach(() => {
    setTavilyFetchForTests(null);
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch {
        // ignore cleanup race
      }
    }
  });

  it('1-2. Registers users, logs in, enforces authorization, and isolates user data', async () => {
    const app = await createTruthOsApp();
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    try {
      // Unauthorized check
      const unauthRes = await fetch(`${baseUrl}/claims`);
      expect(unauthRes.status).toBe(401);

      // Invalid input handling
      const badReg = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: '123', full_name: '' }),
      });
      expect(badReg.status).toBe(400);

      // Register User A & User B
      const regA = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@truthos.test', password: 'Password123!', full_name: 'Alice Analyst' }),
      });
      expect(regA.status).toBe(201);
      const dataA = (await regA.json()) as { access_token: string };

      const regB = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@truthos.test', password: 'Password123!', full_name: 'Bob Reviewer' }),
      });
      expect(regB.status).toBe(201);
      const dataB = (await regB.json()) as { access_token: string };

      // Login check
      const loginA = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@truthos.test', password: 'Password123!' }),
      });
      expect(loginA.status).toBe(200);

      // Load sample workspace for User A only
      await fetch(`${baseUrl}/sample-workspace`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${dataA.access_token}` },
      });

      const claimsA = (await (
        await fetch(`${baseUrl}/claims`, { headers: { Authorization: `Bearer ${dataA.access_token}` } })
      ).json()) as { claims: Array<{ id: string }> };
      expect(claimsA.claims.length).toBeGreaterThan(0);

      const claimsB = (await (
        await fetch(`${baseUrl}/claims`, { headers: { Authorization: `Bearer ${dataB.access_token}` } })
      ).json()) as { claims: Array<{ id: string }> };
      expect(claimsB.claims.length).toBe(0);

      // User B cannot access User A's claim by ID
      const forbiddenDetail = await fetch(`${baseUrl}/claims/${claimsA.claims[0].id}`, {
        headers: { Authorization: `Bearer ${dataB.access_token}` },
      });
      expect(forbiddenDetail.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('3-4. Extracts multiple factual claims while filtering opinions and questions', () => {
    const input =
      'NVIDIA is headquartered in Santa Clara, California. ' +
      'Satya Nadella became CEO of Microsoft in 2014. ' +
      'I think this is the greatest decade for software engineering. ' +
      'What will happen to stock prices tomorrow?';

    const extracted = extractClaimsFromText(input);
    expect(extracted.length).toBe(2);
    expect(extracted[0].normalized_claim).toContain('NVIDIA');
    expect(extracted[1].normalized_claim).toContain('Satya Nadella');
    expect(extracted[1].relevant_dates).toContain('2014');
  });

  it('5-7. Integrates Tavily Search API, handles missing API key, and handles 429 rate limits with retries', async () => {
    // Missing key
    delete process.env.TAVILY_API_KEY;
    await expect(searchTavily({ query: 'NVIDIA headquarters', maxRetries: 0 })).rejects.toBeInstanceOf(
      MissingTavilyKeyError
    );

    // Rate limit (429)
    process.env.TAVILY_API_KEY = 'tvly-test-key';
    let calls = 0;
    setTavilyFetchForTests(
      makeMockTavilyFetch(async () => {
        calls++;
        return { status: 429, body: { error: 'rate limit' } };
      })
    );
    await expect(searchTavily({ query: 'rate limited test', maxRetries: 1, bypassCache: true })).rejects.toBeInstanceOf(
      TavilyRateLimitError
    );
    expect(calls).toBe(2);

    // Success + official endpoint check
    let capturedUrl = '';
    setTavilyFetchForTests(
      makeMockTavilyFetch(async (url) => {
        capturedUrl = url;
        return {
          status: 200,
          body: {
            query: 'NVIDIA headquarters',
            results: [
              {
                title: 'About NVIDIA',
                url: 'https://www.nvidia.com/en-us/about-nvidia/',
                content: 'NVIDIA Corporation is headquartered in Santa Clara, California.',
                score: 0.95,
                published_date: '2026-01-10',
              },
            ],
          },
        };
      })
    );
    const ok = await searchTavily({ query: 'NVIDIA headquarters', bypassCache: true });
    expect(capturedUrl).toBe('https://api.tavily.com/search');
    expect(ok.results.length).toBe(1);
    expect(ok.results[0].domain).toBe('nvidia.com');
  });

  it('10 & 14-15. Detects duplicate URLs / syndicated copies and prevents duplicate inflation of confidence & computes decay', () => {
    const dupCheck = analyzeSourceDuplication([
      {
        url: 'https://reuters.com/tech/nvidia-hq?utm_source=feed',
        title: 'NVIDIA expands headquarters in Santa Clara California',
        domain: 'reuters.com',
        snippet: 'NVIDIA Corporation confirmed its corporate headquarters remains located in Santa Clara California for engineering operations.',
        published_date: '2026-02-01',
      },
      {
        url: 'https://reuters.com/tech/nvidia-hq',
        title: 'NVIDIA expands headquarters in Santa Clara California',
        domain: 'reuters.com',
        snippet: 'NVIDIA Corporation confirmed its corporate headquarters remains located in Santa Clara California for engineering operations.',
        published_date: '2026-02-01',
      },
      {
        url: 'https://syndicated-mirror.example.com/nvidia',
        title: 'Mirror: NVIDIA expands headquarters',
        domain: 'syndicated-mirror.example.com',
        snippet: 'NVIDIA Corporation confirmed its corporate headquarters remains located in Santa Clara California for engineering operations.',
        published_date: '2026-02-01',
      },
    ]);

    expect(dupCheck.duplicate_url_count).toBe(1);
    expect(dupCheck.independent_source_count).toBe(1);
    expect(dupCheck.possible_anomaly).toBe(true);

    const mockEvidence: EvidenceSourceRecord[] = [
      {
        id: '1',
        url: 'https://nvidia.com/about',
        canonical_url: 'https://nvidia.com/about',
        title: 'About NVIDIA',
        domain: 'nvidia.com',
        published_date: new Date(Date.now() - 5 * 86400000).toISOString(),
        retrieved_at: new Date().toISOString(),
        snippet: 'NVIDIA is headquartered in Santa Clara, California.',
        stance: 'supporting',
        source_type: 'Official Organization',
        is_primary_source: true,
        is_official_source: true,
        author_or_publisher: 'nvidia.com',
        credibility_score: 88,
        credibility_is_heuristic: true,
        credibility_explanation: 'Heuristic official org',
        relevance_score: 0.9,
        independence_cluster_id: 'cluster-1',
        is_duplicate_url: false,
        is_near_duplicate_text: false,
        similarity_score: 0,
        query_used: 'NVIDIA headquarters',
      },
    ];

    const conf1 = computeConfidenceScore({
      evidence: mockEvidence,
      independentSupportingClusters: 1,
      independentContradictingClusters: 0,
    });
    const conf3 = computeConfidenceScore({
      evidence: mockEvidence,
      independentSupportingClusters: 3,
      independentContradictingClusters: 0,
    });
    expect(conf3.total).toBeGreaterThan(conf1.total);

    const freshFinance = computeFreshnessScore({
      domain: 'Finance',
      evidence: mockEvidence,
      lastVerifiedAtIso: new Date().toISOString(),
      historicalChangeCount: 0,
      outdatedDetected: false,
    });
    const freshScience = computeFreshnessScore({
      domain: 'Science',
      evidence: mockEvidence,
      lastVerifiedAtIso: new Date().toISOString(),
      historicalChangeCount: 0,
      outdatedDetected: false,
    });
    expect(freshScience.total).toBeGreaterThanOrEqual(freshFinance.total);
  });

  it('8-9, 11-13, 16-24. End-to-end verification, statuses, fact versioning, dependency flagging, monitoring, alerts, and persistence across restart', async () => {
    const db = getDb();
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name) VALUES ('u1', 'e2e@truthos.test', 'hash', 'E2E User')`).run();

    // Phase A: Initial submission -> VERIFIED + INSUFFICIENT EVIDENCE
    setTavilyFetchForTests(
      makeMockTavilyFetch(async (_url, init) => {
        const body = JSON.parse(String(init.body || '{}')) as { query: string };
        const q = body.query.toLowerCase();

        if (q.includes('jupiter') && !q.includes('disputed')) {
          return {
            status: 200,
            body: {
              results: [
                {
                  title: 'NASA Jupiter Fact Sheet',
                  url: 'https://science.nasa.gov/jupiter/',
                  content: 'Jupiter is the largest planet in our solar system by mass and volume.',
                  score: 0.94,
                  published_date: '2026-01-15',
                },
                {
                  title: 'ESA Overview of Jupiter',
                  url: 'https://www.esa.int/Science_Exploration/Space_Science/Jupiter',
                  content: 'Jupiter is the largest planet orbiting the Sun in the solar system.',
                  score: 0.91,
                  published_date: '2026-02-01',
                },
              ],
            },
          };
        }

        if (q.includes('jupiter') && q.includes('disputed')) {
          return { status: 200, body: { results: [] } };
        }

        if (q.includes('acme') && q.includes('disputed')) {
          return { status: 200, body: { results: [] } };
        }

        if (q.includes('acme') && !q.includes('disputed')) {
          return {
            status: 200,
            body: {
              results: [
                {
                  title: 'Acme Corp Leadership',
                  url: 'https://www.reuters.com/business/acme-ceo',
                  content: 'Acme Corp appointed Jane Doe as CEO in 2023.',
                  score: 0.9,
                  published_date: '2023-05-01',
                },
                {
                  title: 'Acme Corp Official Newsroom',
                  url: 'https://www.sec.gov/acme-filing',
                  content: 'Acme Corp CEO Jane Doe signed the 2023 annual filing.',
                  score: 0.89,
                  published_date: '2023-06-01',
                },
              ],
            },
          };
        }

        return { status: 200, body: { results: [] } };
      })
    );

    const submitRes = await submitAndVerifyDocument({
      userId: 'u1',
      title: 'Solar System & Corporate Brief',
      sourceType: 'article',
      rawText:
        'Jupiter is the largest planet in the solar system. ' +
        'Acme Corp CEO is Jane Doe as of 2023. ' +
        'Zorgon-999 holds 42% of moon mining rights.',
      bypassCache: true,
    });
    expect(submitRes.status).toBe('completed');
    expect(submitRes.claimCount).toBe(3);

    const claims = db
      .prepare(`SELECT id, normalized_claim FROM extracted_claims WHERE job_id = ?`)
      .all(submitRes.jobId) as Array<{ id: string; normalized_claim: string }>;

    const jupiterClaim = claims.find((c) => c.normalized_claim.includes('Jupiter'))!;
    const acmeClaim = claims.find((c) => c.normalized_claim.includes('Acme'))!;
    const zorgonClaim = claims.find((c) => c.normalized_claim.includes('Zorgon'))!;

    const statusOf = (cid: string) =>
      (db.prepare(`SELECT status FROM verification_results WHERE claim_id = ?`).get(cid) as { status: string }).status;

    expect(statusOf(jupiterClaim.id)).toBe('VERIFIED');
    expect(statusOf(acmeClaim.id)).toBe('VERIFIED');
    expect(statusOf(zorgonClaim.id)).toBe('INSUFFICIENT EVIDENCE');

    // Schedule monitoring due immediately for Acme claim
    db.prepare(
      `INSERT INTO monitoring_schedules (id, user_id, claim_id, frequency_hours, freshness_threshold, alert_on_change, alert_on_stale, status, next_run_at)
       VALUES ('sched-1', 'u1', ?, 24, 65, 1, 1, 'active', datetime('now', '-5 minutes'))`
    ).run(acmeClaim.id);

    // Phase B: Newer superseding evidence arrives -> OUTDATED + Self-healing memory + Dependency flagged + Alert
    setTavilyFetchForTests(
      makeMockTavilyFetch(async () => ({
        status: 200,
        body: {
          results: [
            {
              title: 'Acme Corp Announces New CEO John Smith',
              url: 'https://www.reuters.com/business/acme-new-ceo-2026',
              content: 'Jane Doe stepped down and was replaced by John Smith as CEO of Acme Corp in 2026.',
              score: 0.96,
              published_date: '2026-10-15',
            },
          ],
        },
      }))
    );

    const workerOutcome = await processDueMonitoringSchedules();
    expect(workerOutcome.processed).toBe(1);
    expect(workerOutcome.alertsCreated).toBe(1);
    expect(statusOf(acmeClaim.id)).toBe('OUTDATED');

    // Verify historical versions preserved (v1 valid_until closed, v2 active)
    const versions = db
      .prepare(`SELECT version_number, status, valid_until FROM fact_versions WHERE claim_id = ? ORDER BY version_number ASC`)
      .all(acmeClaim.id) as Array<{ version_number: number; status: string; valid_until: string | null }>;
    expect(versions.length).toBe(2);
    expect(versions[0].status).toBe('VERIFIED');
    expect(versions[0].valid_until).not.toBeNull();
    expect(versions[1].status).toBe('OUTDATED');
    expect(versions[1].valid_until).toBeNull();

    // Verify dependent answer flagged for re-verification
    const deps = db
      .prepare(`SELECT reverification_status FROM knowledge_dependencies WHERE claim_id = ?`)
      .all(acmeClaim.id) as Array<{ reverification_status: string }>;
    expect(deps[0].reverification_status).toBe('needs_review');

    // Verify Before-and-After historical fact change recorded
    const changes = db.prepare(`SELECT * FROM historical_facts WHERE claim_id = ?`).all(acmeClaim.id);
    expect(changes.length).toBe(1);

    // Verify conflicting classification directly via recheck
    setTavilyFetchForTests(
      makeMockTavilyFetch(async (_url, init) => {
        const body = JSON.parse(String(init.body || '{}')) as { query: string };
        if (body.query.includes('disputed')) {
          return {
            status: 200,
            body: {
              results: [
                {
                  title: 'Disputed report on Acme Corp',
                  url: 'https://www.bloomberg.com/acme-dispute',
                  content: 'Analysts disputed the Acme Corp leadership figure, citing 2025 filings.',
                  score: 0.88,
                  published_date: '2025-02-01',
                },
              ],
            },
          };
        }
        return {
          status: 200,
          body: {
            results: [
              {
                title: 'Acme Corp CEO Jane Doe profile',
                url: 'https://www.wsj.com/acme-ceo-jane-doe',
                content: 'Acme Corp CEO Jane Doe led 2023 operations.',
                score: 0.9,
                published_date: '2026-01-01',
              },
            ],
          },
        };
      })
    );
    const conflictOutcome = await recheckClaimById({ claimId: acmeClaim.id, userId: 'u1', bypassCache: true });
    expect(conflictOutcome.newStatus).toBe('CONFLICTING');

    // Simulate backend restart by reopening SQLite file
    const reopened = resetDbForTests(tempDbPath);
    const persistedClaim = reopened
      .prepare(`SELECT normalized_claim FROM extracted_claims WHERE id = ?`)
      .get(acmeClaim.id) as { normalized_claim: string } | undefined;
    expect(persistedClaim?.normalized_claim).toContain('Acme');
  });
});
