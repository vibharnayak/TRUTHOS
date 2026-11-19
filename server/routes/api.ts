import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { getDb } from '../db/database';
import {
  getTokenExpiryMinutes,
  hashPassword,
  hashToken,
  recordAuditLog,
  requireAuth,
  signAccessToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../core/security';
import { extractClaimsFromText } from '../engine/claimExtractor';
import { loadDevelopmentSampleWorkspace } from '../engine/sampleWorkspace';
import { hydrateClaimDetail } from '../services/claimQueryService';
import {
  isTavilyConfigured,
  MissingTavilyKeyError,
  searchTavily,
  TavilyApiError,
  TavilyRateLimitError,
} from '../services/tavilyClient';
import { recheckClaimById, submitAndVerifyDocument } from '../services/verificationService';
import { processDueMonitoringSchedules } from '../workers/monitoringWorker';

// Simple in-memory sliding window rate limiter per IP/user
const rateLimitBuckets = new Map<string, number[]>();
function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const history = (rateLimitBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded. Please slow down requests.', code: 'RATE_LIMITED' });
      return;
    }
    history.push(now);
    rateLimitBuckets.set(key, history);
    next();
  };
}

export function createApiRouter(): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  const authLimiter = createRateLimiter(30, 60_000);
  const researchLimiter = createRateLimiter(30, 60_000);

  // Health & OpenAPI Documentation
  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'TRUTHOS Knowledge Intelligence API',
      tavily_configured: isTavilyConfigured(),
      external_provider: 'Tavily Search API only',
    });
  });

  router.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'TRUTHOS Internal REST API',
        version: '1.0.0',
        description:
          'Autonomous AI Knowledge Intelligence API for claim extraction, multi-agent Tavily verification, Evidence DNA, temporal knowledge graphs, predictive decay, self-healing memory, and monitoring.',
      },
      paths: {
        '/api/auth/register': { post: { summary: 'Register user account' } },
        '/api/auth/login': { post: { summary: 'Authenticate and receive JWT + session cookie' } },
        '/api/auth/logout': { post: { summary: 'Revoke session' } },
        '/api/auth/me': { get: { summary: 'Get authenticated user profile' } },
        '/api/verification/submit': { post: { summary: 'Submit document/text for claim extraction & Tavily verification' } },
        '/api/verification/{id}': { get: { summary: 'Get verification job status and metadata' } },
        '/api/verification/{id}/claims': { get: { summary: 'List verified claims for a job' } },
        '/api/verification/{id}/recheck': { post: { summary: 'Recheck all claims in a verification job' } },
        '/api/claims': { get: { summary: 'List user claims with status/domain filtering & pagination' } },
        '/api/claims/{id}': { get: { summary: 'Get full claim intelligence, Evidence DNA, scores, and agents' } },
        '/api/claims/{id}/history': { get: { summary: 'Get historical fact versions for a claim' } },
        '/api/claims/{id}/evidence': { get: { summary: 'Get Evidence DNA source records for a claim' } },
        '/api/research/search': { post: { summary: 'Direct Tavily research search (backend-only key)' } },
        '/api/analysis/{id}/agents': { get: { summary: 'Get multi-agent execution trace for a claim' } },
        '/api/knowledge-graph': { get: { summary: 'Get temporal knowledge graph nodes & edges' } },
        '/api/memory': { get: { summary: 'Get self-healing memory overview, changes, and dependencies' } },
        '/api/memory/reverify': { post: { summary: 'Trigger live reverification of a claim' } },
        '/api/monitoring': { get: { summary: 'List monitoring schedules' }, post: { summary: 'Create monitoring schedule' } },
        '/api/monitoring/alerts': { get: { summary: 'List in-app monitoring alerts' } },
        '/api/analytics/dashboard': { get: { summary: 'Get database-derived dashboard metrics' } },
      },
    });
  });

  // =========================================================================
  // AUTHENTICATION ENDPOINTS
  // =========================================================================
  router.post('/auth/register', authLimiter, (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'A valid email address is required.', code: 'INVALID_EMAIL' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.', code: 'WEAK_PASSWORD' });
      return;
    }
    if (fullName.length < 2) {
      res.status(400).json({ error: 'Full name is required.', code: 'INVALID_NAME' });
      return;
    }

    const db = getDb();
    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.', code: 'EMAIL_EXISTS' });
      return;
    }

    const userId = crypto.randomUUID();
    const userCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM users`).get() as { cnt: number }).cnt;
    const role = userCount === 0 ? 'admin' : 'analyst';

    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`
    ).run(userId, email, hashPassword(password), fullName.slice(0, 100), role);

    const token = signAccessToken({ userId, email, role });
    const expiresAt = new Date(Date.now() + getTokenExpiryMinutes() * 60_000).toISOString();
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      userId,
      hashToken(token),
      expiresAt
    );

    recordAuditLog({ userId, action: 'USER_REGISTERED', resourceType: 'user', resourceId: userId });

    const user = db
      .prepare(
        `SELECT id, email, full_name, role, theme_preference, default_freshness_threshold, default_monitoring_frequency_hours, created_at FROM users WHERE id = ?`
      )
      .get(userId);

    res.cookie('truthos_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getTokenExpiryMinutes() * 60_000,
    });

    res.status(201).json({ access_token: token, token_type: 'bearer', user });
  });

  router.post('/auth/login', authLimiter, (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.', code: 'MISSING_CREDENTIALS' });
      return;
    }

    const db = getDb();
    const userRow = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as
      | (Record<string, unknown> & { id: string; email: string; password_hash: string; role: string })
      | undefined;

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const token = signAccessToken({ userId: userRow.id, email: userRow.email, role: userRow.role });
    const expiresAt = new Date(Date.now() + getTokenExpiryMinutes() * 60_000).toISOString();
    db.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      userRow.id,
      hashToken(token),
      expiresAt
    );

    recordAuditLog({ userId: userRow.id, action: 'USER_LOGIN', resourceType: 'user', resourceId: userRow.id });

    res.cookie('truthos_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: getTokenExpiryMinutes() * 60_000,
    });

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        id: userRow.id,
        email: userRow.email,
        full_name: userRow.full_name,
        role: userRow.role,
        theme_preference: userRow.theme_preference,
        default_freshness_threshold: userRow.default_freshness_threshold,
        default_monitoring_frequency_hours: userRow.default_monitoring_frequency_hours,
        created_at: userRow.created_at,
      },
    });
  });

  router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    if (req.authToken && req.user) {
      db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token_hash = ?`).run(
        req.user.id,
        hashToken(req.authToken)
      );
      recordAuditLog({ userId: req.user.id, action: 'USER_LOGOUT', resourceType: 'user', resourceId: req.user.id });
    }
    res.clearCookie('truthos_token');
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user, tavily_configured: isTavilyConfigured() });
  });

  // =========================================================================
  // SETTINGS & SAMPLE WORKSPACE
  // =========================================================================
  router.patch('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : req.user!.full_name;
    const theme = req.body?.theme_preference === 'light' ? 'light' : 'dark';
    const threshold = Math.max(10, Math.min(95, Number(req.body?.default_freshness_threshold ?? req.user!.default_freshness_threshold)));
    const freq = Math.max(1, Math.min(720, Number(req.body?.default_monitoring_frequency_hours ?? req.user!.default_monitoring_frequency_hours)));

    db.prepare(
      `UPDATE users SET full_name = ?, theme_preference = ?, default_freshness_threshold = ?, default_monitoring_frequency_hours = ? WHERE id = ?`
    ).run(fullName.slice(0, 100), theme, threshold, freq, userId);

    const updated = db
      .prepare(
        `SELECT id, email, full_name, role, theme_preference, default_freshness_threshold, default_monitoring_frequency_hours, created_at FROM users WHERE id = ?`
      )
      .get(userId);
    res.json({ user: updated });
  });

  router.get('/settings/system', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const queryStats = db
      .prepare(
        `SELECT COUNT(*) AS total_queries, SUM(cache_hit) AS cache_hits,
                SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) AS error_count
         FROM tavily_query_logs WHERE user_id = ?`
      )
      .get(req.user!.id) as { total_queries: number; cache_hits: number | null; error_count: number | null };

    res.json({
      tavily_configured: isTavilyConfigured(),
      external_api_policy: 'Tavily Search API Only (No external LLM APIs)',
      user_role: req.user!.role,
      tavily_query_stats: {
        total_queries: queryStats.total_queries || 0,
        cache_hits: queryStats.cache_hits || 0,
        error_count: queryStats.error_count || 0,
      },
    });
  });

  router.post('/sample-workspace', requireAuth, (req: AuthenticatedRequest, res) => {
    const outcome = loadDevelopmentSampleWorkspace(req.user!.id);
    res.json(outcome);
  });

  // =========================================================================
  // VERIFICATION STUDIO & EXTRACTION
  // =========================================================================
  router.post('/verification/preview-extract', requireAuth, (req: AuthenticatedRequest, res) => {
    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (rawText.length < 10) {
      res.status(400).json({ error: 'Please provide at least 10 characters of text to extract claims.' });
      return;
    }
    const claims = extractClaimsFromText(rawText);
    res.json({ claims });
  });

  router.post('/verification/submit', requireAuth, researchLimiter, async (req: AuthenticatedRequest, res) => {
    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : 'Verification Submission';
    const sourceType = typeof req.body?.source_type === 'string' ? req.body.source_type : 'text';

    if (rawText.length < 15 || rawText.length > 25000) {
      res.status(400).json({
        error: 'Submitted text must be between 15 and 25,000 characters.',
        code: 'INVALID_TEXT_LENGTH',
      });
      return;
    }

    const result = await submitAndVerifyDocument({
      userId: req.user!.id,
      title,
      sourceType,
      rawText,
      bypassCache: Boolean(req.body?.bypass_cache),
    });

    if (result.status === 'failed') {
      const httpCode =
        result.errorCode === 'MISSING_TAVILY_API_KEY'
          ? 503
          : result.errorCode === 'TAVILY_RATE_LIMIT'
            ? 429
            : result.errorCode === 'NO_FACTUAL_CLAIMS'
              ? 422
              : 502;
      res.status(httpCode).json(result);
      return;
    }

    res.status(201).json(result);
  });

  router.get('/verification/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const job = db
      .prepare(
        `SELECT vj.*, sd.title, sd.source_type, sd.raw_text,
                (SELECT COUNT(*) FROM extracted_claims ec WHERE ec.job_id = vj.id) AS claim_count
         FROM verification_jobs vj
         JOIN submitted_documents sd ON sd.id = vj.document_id
         WHERE vj.id = ? AND vj.user_id = ?`
      )
      .get(req.params.id, req.user!.id);

    if (!job) {
      res.status(404).json({ error: 'Verification job not found.' });
      return;
    }
    res.json({ job });
  });

  router.get('/verification/:id/claims', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT id FROM extracted_claims WHERE job_id = ? AND user_id = ? ORDER BY created_at ASC`)
      .all(req.params.id, req.user!.id) as Array<{ id: string }>;

    const claims = rows
      .map((r) => hydrateClaimDetail(r.id, req.user!.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    res.json({ claims });
  });

  router.post('/verification/:id/recheck', requireAuth, researchLimiter, async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare(`SELECT id FROM extracted_claims WHERE job_id = ? AND user_id = ?`)
      .all(req.params.id, req.user!.id) as Array<{ id: string }>;

    if (rows.length === 0) {
      res.status(404).json({ error: 'Verification job not found or contains no claims.' });
      return;
    }

    try {
      const outcomes = [];
      for (const r of rows) {
        const outcome = await recheckClaimById({ claimId: r.id, userId: req.user!.id, bypassCache: true });
        outcomes.push(outcome);
      }
      res.json({ ok: true, results: outcomes });
    } catch (err) {
      if (err instanceof MissingTavilyKeyError) {
        res.status(503).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof TavilyRateLimitError) {
        res.status(429).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({ error: err instanceof Error ? err.message : 'Recheck failed.' });
    }
  });

  // =========================================================================
  // CLAIMS, EVIDENCE DNA, AND MULTI-AGENT ANALYSIS
  // =========================================================================
  router.get('/claims', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const domainFilter = typeof req.query.domain === 'string' ? req.query.domain : '';
    const search = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;

    let where = `WHERE c.user_id = ?`;
    const params: unknown[] = [req.user!.id];

    if (statusFilter && statusFilter !== 'ALL') {
      where += ` AND vr.status = ?`;
      params.push(statusFilter);
    }
    if (domainFilter && domainFilter !== 'ALL') {
      where += ` AND cc.domain = ?`;
      params.push(domainFilter);
    }
    if (search) {
      where += ` AND (LOWER(c.normalized_claim) LIKE ? OR LOWER(c.subject) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const totalRow = db
      .prepare(
        `SELECT COUNT(*) AS total FROM extracted_claims c
         JOIN claim_classifications cc ON cc.claim_id = c.id
         LEFT JOIN verification_results vr ON vr.claim_id = c.id
         ${where}`
      )
      .get(...params) as { total: number };

    const rows = db
      .prepare(
        `SELECT c.id FROM extracted_claims c
         JOIN claim_classifications cc ON cc.claim_id = c.id
         LEFT JOIN verification_results vr ON vr.claim_id = c.id
         ${where}
         ORDER BY c.updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Array<{ id: string }>;

    const claims = rows
      .map((r) => hydrateClaimDetail(r.id, req.user!.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    res.json({ claims, total: totalRow.total, page, limit });
  });

  router.get('/claims/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    res.json({ claim });
  });

  router.get('/claims/:id/history', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    const db = getDb();
    const changes = db
      .prepare(`SELECT * FROM historical_facts WHERE claim_id = ? AND user_id = ? ORDER BY detected_at DESC`)
      .all(req.params.id, req.user!.id);
    res.json({ versions: claim.versions, changes });
  });

  router.get('/claims/:id/evidence', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    res.json({ evidence: claim.evidence, duplication_analysis: claim.duplication_analysis });
  });

  router.get('/analysis/:id/agents', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    res.json({ agents: claim.agents });
  });

  router.get('/analysis/:id/results', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    res.json({ status: claim.status, reasoning: claim.reasoning });
  });

  router.get('/analysis/:id/scores', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    res.json({
      confidence: claim.confidence_breakdown,
      freshness: claim.freshness_breakdown,
    });
  });

  // =========================================================================
  // RESEARCH (DIRECT TAVILY SEARCH & SOURCE EXPLORER)
  // =========================================================================
  router.post('/research/search', requireAuth, researchLimiter, async (req: AuthenticatedRequest, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const depth = req.body?.search_depth === 'advanced' ? 'advanced' : 'basic';
    if (!query || query.length > 350) {
      res.status(400).json({ error: 'Query must be between 1 and 350 characters.' });
      return;
    }

    try {
      const response = await searchTavily({
        query,
        search_depth: depth,
        max_results: 6,
        userId: req.user!.id,
      });
      res.json(response);
    } catch (err) {
      if (err instanceof MissingTavilyKeyError) {
        res.status(503).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof TavilyRateLimitError) {
        res.status(429).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof TavilyApiError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(502).json({ error: 'Tavily research call failed.' });
    }
  });

  router.get('/research/:id/sources', requireAuth, (req: AuthenticatedRequest, res) => {
    const claim = hydrateClaimDetail(req.params.id, req.user!.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    res.json({ sources: claim.evidence });
  });

  // =========================================================================
  // TEMPORAL KNOWLEDGE GRAPH
  // =========================================================================
  router.get('/knowledge-graph', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const entities = db
      .prepare(`SELECT id, name AS label, entity_type, domain FROM entities WHERE user_id = ?`)
      .all(req.user!.id) as Array<{ id: string; label: string; entity_type: string; domain: string }>;

    const edges = db
      .prepare(
        `SELECT r.id, r.source_entity_id, r.target_entity_id, r.predicate, r.valid_from, r.valid_until,
                r.confidence, r.freshness, r.claim_id, r.is_historical,
                vr.status AS claim_status, c.normalized_claim
         FROM knowledge_graph_relationships r
         LEFT JOIN extracted_claims c ON c.id = r.claim_id
         LEFT JOIN verification_results vr ON vr.claim_id = r.claim_id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`
      )
      .all(req.user!.id);

    res.json({ nodes: entities, edges });
  });

  router.get('/knowledge-graph/entities/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const entity = db
      .prepare(`SELECT * FROM entities WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user!.id);
    if (!entity) {
      res.status(404).json({ error: 'Entity not found.' });
      return;
    }

    const relationships = db
      .prepare(
        `SELECT r.*, se.name AS source_name, te.name AS target_name, vr.status AS claim_status
         FROM knowledge_graph_relationships r
         JOIN entities se ON se.id = r.source_entity_id
         JOIN entities te ON te.id = r.target_entity_id
         LEFT JOIN verification_results vr ON vr.claim_id = r.claim_id
         WHERE r.user_id = ? AND (r.source_entity_id = ? OR r.target_entity_id = ?)`
      )
      .all(req.user!.id, req.params.id, req.params.id);

    res.json({ entity, relationships });
  });

  router.get('/knowledge-graph/relationships', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const relationships = db
      .prepare(
        `SELECT r.*, se.name AS source_name, te.name AS target_name
         FROM knowledge_graph_relationships r
         JOIN entities se ON se.id = r.source_entity_id
         JOIN entities te ON te.id = r.target_entity_id
         WHERE r.user_id = ?`
      )
      .all(req.user!.id);
    res.json({ relationships });
  });

  // =========================================================================
  // SELF-HEALING MEMORY & DEPENDENCIES
  // =========================================================================
  router.get('/memory', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const claims = db
      .prepare(
        `SELECT c.id, c.normalized_claim, c.subject, c.predicate, c.object_value, c.is_sample_data, c.updated_at,
                vr.status, cs.total_score AS confidence_score, fs.total_score AS freshness_score, fs.decay_state,
                (SELECT COUNT(*) FROM fact_versions fv WHERE fv.claim_id = c.id) AS version_count
         FROM extracted_claims c
         LEFT JOIN verification_results vr ON vr.claim_id = c.id
         LEFT JOIN confidence_scores cs ON cs.claim_id = c.id
         LEFT JOIN freshness_scores fs ON fs.claim_id = c.id
         WHERE c.user_id = ?
         ORDER BY c.updated_at DESC`
      )
      .all(userId);

    const answers = db
      .prepare(`SELECT * FROM updated_answers WHERE user_id = ? ORDER BY last_checked_at DESC`)
      .all(userId);

    res.json({ claims, answers });
  });

  router.get('/memory/changes', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT hf.*, c.normalized_claim
         FROM historical_facts hf
         JOIN extracted_claims c ON c.id = hf.claim_id
         WHERE hf.user_id = ?
         ORDER BY hf.detected_at DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;

    const changes = rows.map((r) => {
      const affected = db
        .prepare(
          `SELECT dependent_record_id AS id, dependent_title AS title, dependent_record_type AS record_type, reverification_status
           FROM knowledge_dependencies WHERE claim_id = ? AND user_id = ?`
        )
        .all(String(r.claim_id), req.user!.id);

      return {
        id: String(r.id),
        claim_id: String(r.claim_id),
        claim_text: String(r.normalized_claim),
        previous_info: String(r.previous_info),
        new_info: String(r.new_info),
        changes_detected: String(r.changes_detected),
        why_changed: String(r.why_changed),
        evidence_urls: JSON.parse(String(r.evidence_urls_json || '[]')),
        affected_records: affected,
        recommended_action: String(r.recommended_action),
        detected_at: String(r.detected_at),
      };
    });

    res.json({ changes });
  });

  router.get('/memory/dependencies', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const dependencies = db
      .prepare(
        `SELECT kd.*, c.normalized_claim, vr.status AS claim_status, fs.freshness_score
         FROM knowledge_dependencies kd
         JOIN extracted_claims c ON c.id = kd.claim_id
         LEFT JOIN verification_results vr ON vr.claim_id = c.id
         LEFT JOIN (SELECT claim_id, total_score AS freshness_score FROM freshness_scores) fs ON fs.claim_id = c.id
         WHERE kd.user_id = ?
         ORDER BY kd.created_at DESC`
      )
      .all(req.user!.id);
    res.json({ dependencies });
  });

  router.post('/memory/reverify', requireAuth, researchLimiter, async (req: AuthenticatedRequest, res) => {
    const claimId = typeof req.body?.claim_id === 'string' ? req.body.claim_id : '';
    if (!claimId) {
      res.status(400).json({ error: 'claim_id is required.' });
      return;
    }

    try {
      const outcome = await recheckClaimById({ claimId, userId: req.user!.id, bypassCache: true });
      const updated = hydrateClaimDetail(claimId, req.user!.id);
      res.json({ outcome, claim: updated });
    } catch (err) {
      if (err instanceof MissingTavilyKeyError) {
        res.status(503).json({ error: err.message, code: err.code });
        return;
      }
      if (err instanceof TavilyRateLimitError) {
        res.status(429).json({ error: err.message, code: err.code });
        return;
      }
      res.status(404).json({ error: err instanceof Error ? err.message : 'Reverification failed.' });
    }
  });

  // =========================================================================
  // MONITORING & SMART ALERTS
  // =========================================================================
  router.post('/monitoring', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const claimId = typeof req.body?.claim_id === 'string' ? req.body.claim_id : '';
    const frequencyHours = Math.max(1, Math.min(720, Number(req.body?.frequency_hours ?? 24)));
    const freshnessThreshold = Math.max(10, Math.min(95, Number(req.body?.freshness_threshold ?? 60)));
    const alertOnChange = req.body?.alert_on_change !== false ? 1 : 0;
    const alertOnStale = req.body?.alert_on_stale !== false ? 1 : 0;

    const claim = db
      .prepare(`SELECT id FROM extracted_claims WHERE id = ? AND user_id = ?`)
      .get(claimId, req.user!.id);

    if (!claim) {
      res.status(404).json({ error: 'Claim not found for monitoring.' });
      return;
    }

    const nextRunAt = new Date(Date.now() + frequencyHours * 3600_000).toISOString();
    const existing = db
      .prepare(`SELECT id FROM monitoring_schedules WHERE user_id = ? AND claim_id = ?`)
      .get(req.user!.id, claimId) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE monitoring_schedules
         SET frequency_hours = ?, freshness_threshold = ?, alert_on_change = ?, alert_on_stale = ?, status = 'active', next_run_at = ?
         WHERE id = ?`
      ).run(frequencyHours, freshnessThreshold, alertOnChange, alertOnStale, nextRunAt, existing.id);
      res.json({ id: existing.id, updated: true });
      return;
    }

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO monitoring_schedules (id, user_id, claim_id, frequency_hours, freshness_threshold, alert_on_change, alert_on_stale, status, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    ).run(id, req.user!.id, claimId, frequencyHours, freshnessThreshold, alertOnChange, alertOnStale, nextRunAt);

    recordAuditLog({
      userId: req.user!.id,
      action: 'MONITORING_CREATED',
      resourceType: 'monitoring_schedule',
      resourceId: id,
      details: { claim_id: claimId, frequency_hours: frequencyHours },
    });

    res.status(201).json({ id, created: true });
  });

  router.get('/monitoring', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const schedules = db
      .prepare(
        `SELECT ms.*, c.normalized_claim AS claim_text, vr.status AS claim_status,
                COALESCE(fs.total_score, 0) AS freshness_score
         FROM monitoring_schedules ms
         JOIN extracted_claims c ON c.id = ms.claim_id
         LEFT JOIN verification_results vr ON vr.claim_id = c.id
         LEFT JOIN freshness_scores fs ON fs.claim_id = c.id
         WHERE ms.user_id = ?
         ORDER BY ms.created_at DESC`
      )
      .all(req.user!.id);

    const executions = db
      .prepare(
        `SELECT me.*, c.normalized_claim AS claim_text
         FROM monitoring_executions me
         JOIN monitoring_schedules ms ON ms.id = me.schedule_id
         JOIN extracted_claims c ON c.id = me.claim_id
         WHERE ms.user_id = ?
         ORDER BY me.executed_at DESC
         LIMIT 50`
      )
      .all(req.user!.id);

    res.json({ schedules, executions });
  });

  router.patch('/monitoring/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM monitoring_schedules WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Monitoring schedule not found.' });
      return;
    }

    const status = req.body?.status === 'paused' ? 'paused' : req.body?.status === 'active' ? 'active' : String(existing.status);
    const freq = Math.max(1, Math.min(720, Number(req.body?.frequency_hours ?? existing.frequency_hours)));
    const thresh = Math.max(10, Math.min(95, Number(req.body?.freshness_threshold ?? existing.freshness_threshold)));

    db.prepare(
      `UPDATE monitoring_schedules SET status = ?, frequency_hours = ?, freshness_threshold = ? WHERE id = ?`
    ).run(status, freq, thresh, req.params.id);

    res.json({ ok: true });
  });

  router.post('/monitoring/:id/run-now', requireAuth, researchLimiter, async (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const sched = db
      .prepare(`SELECT * FROM monitoring_schedules WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user!.id) as { id: string } | undefined;
    if (!sched) {
      res.status(404).json({ error: 'Monitoring schedule not found.' });
      return;
    }
    // Set next_run_at to now so the worker executes it immediately
    db.prepare(`UPDATE monitoring_schedules SET next_run_at = datetime('now'), status = 'active' WHERE id = ?`).run(
      sched.id
    );
    const result = await processDueMonitoringSchedules();
    res.json({ ok: true, ...result });
  });

  router.delete('/monitoring/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM monitoring_schedules WHERE id = ? AND user_id = ?`)
      .run(req.params.id, req.user!.id);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Monitoring schedule not found.' });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/monitoring/alerts', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const alerts = db
      .prepare(`SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .all(req.user!.id);
    res.json({ alerts });
  });

  router.patch('/monitoring/alerts/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    db.prepare(`UPDATE alerts SET is_read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user!.id);
    res.json({ ok: true });
  });

  // =========================================================================
  // HISTORY & DASHBOARD ANALYTICS
  // =========================================================================
  router.get('/history', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const jobs = db
      .prepare(
        `SELECT vj.id, sd.title, sd.source_type, sd.raw_text, vj.status, vj.error_message, vj.is_sample_data, vj.created_at, vj.completed_at,
                (SELECT COUNT(*) FROM extracted_claims ec WHERE ec.job_id = vj.id) AS claim_count
         FROM verification_jobs vj
         JOIN submitted_documents sd ON sd.id = vj.document_id
         WHERE vj.user_id = ?
         ORDER BY vj.created_at DESC
         LIMIT 50`
      )
      .all(userId);

    const searchLogs = db
      .prepare(
        `SELECT id, query, search_depth, status_code, result_count, cache_hit, error_message, duration_ms, created_at
         FROM tavily_query_logs
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`
      )
      .all(userId);

    const changes = db
      .prepare(
        `SELECT hf.*, c.normalized_claim
         FROM historical_facts hf
         JOIN extracted_claims c ON c.id = hf.claim_id
         WHERE hf.user_id = ?
         ORDER BY hf.detected_at DESC
         LIMIT 50`
      )
      .all(userId);

    res.json({ jobs, search_logs: searchLogs, changes });
  });

  router.get('/analytics/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const userId = req.user!.id;

    const totals = db
      .prepare(
        `SELECT
           COUNT(*) AS total_claims,
           SUM(CASE WHEN vr.status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_claims,
           SUM(CASE WHEN vr.status = 'OUTDATED' THEN 1 ELSE 0 END) AS outdated_claims,
           SUM(CASE WHEN vr.status = 'CONFLICTING' THEN 1 ELSE 0 END) AS conflicting_claims,
           SUM(CASE WHEN vr.status = 'UNVERIFIED' THEN 1 ELSE 0 END) AS unverified_claims,
           SUM(CASE WHEN vr.status = 'INSUFFICIENT EVIDENCE' THEN 1 ELSE 0 END) AS insufficient_claims,
           COALESCE(AVG(cs.total_score), 0) AS avg_confidence,
           COALESCE(AVG(fs.total_score), 0) AS avg_freshness
         FROM extracted_claims c
         LEFT JOIN verification_results vr ON vr.claim_id = c.id
         LEFT JOIN confidence_scores cs ON cs.claim_id = c.id
         LEFT JOIN freshness_scores fs ON fs.claim_id = c.id
         WHERE c.user_id = ?`
      )
      .get(userId) as Record<string, number | null>;

    const decayRaw = db
      .prepare(
        `SELECT fs.decay_state AS state, COUNT(*) AS count
         FROM extracted_claims c
         JOIN freshness_scores fs ON fs.claim_id = c.id
         WHERE c.user_id = ?
         GROUP BY fs.decay_state`
      )
      .all(userId) as Array<{ state: string; count: number }>;

    const decayMap = new Map(decayRaw.map((d) => [d.state, d.count]));
    const decayDistribution = (['Fresh', 'Aging', 'At Risk', 'Stale'] as const).map((state) => ({
      state,
      count: decayMap.get(state) || 0,
    }));

    const domainBreakdown = db
      .prepare(
        `SELECT cc.domain, COUNT(*) AS count,
                ROUND(AVG(COALESCE(fs.total_score, 0)), 1) AS avg_freshness,
                ROUND(AVG(COALESCE(cs.total_score, 0)), 1) AS avg_confidence
         FROM extracted_claims c
         JOIN claim_classifications cc ON cc.claim_id = c.id
         LEFT JOIN freshness_scores fs ON fs.claim_id = c.id
         LEFT JOIN confidence_scores cs ON cs.claim_id = c.id
         WHERE c.user_id = ?
         GROUP BY cc.domain
         ORDER BY count DESC`
      )
      .all(userId);

    const recentJobs = db
      .prepare(
        `SELECT vj.id, sd.title, sd.source_type, sd.raw_text, vj.status, vj.error_message, vj.is_sample_data, vj.created_at, vj.completed_at,
                (SELECT COUNT(*) FROM extracted_claims ec WHERE ec.job_id = vj.id) AS claim_count
         FROM verification_jobs vj
         JOIN submitted_documents sd ON sd.id = vj.document_id
         WHERE vj.user_id = ?
         ORDER BY vj.created_at DESC
         LIMIT 6`
      )
      .all(userId);

    const unreadAlerts = db
      .prepare(`SELECT * FROM alerts WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 10`)
      .all(userId);

    res.json({
      total_claims: Number(totals.total_claims || 0),
      verified_claims: Number(totals.verified_claims || 0),
      outdated_claims: Number(totals.outdated_claims || 0),
      conflicting_claims: Number(totals.conflicting_claims || 0),
      unverified_claims: Number(totals.unverified_claims || 0),
      insufficient_claims: Number(totals.insufficient_claims || 0),
      average_confidence: Math.round(Number(totals.avg_confidence || 0)),
      average_freshness: Math.round(Number(totals.avg_freshness || 0)),
      decay_distribution: decayDistribution,
      domain_breakdown: domainBreakdown,
      recent_jobs: recentJobs,
      unread_alerts: unreadAlerts,
      tavily_configured: isTavilyConfigured(),
    });
  });

  return router;
}
