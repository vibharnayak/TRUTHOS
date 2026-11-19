import crypto from 'crypto';
import { getDb } from '../db/database';
import { isSafeExternalUrl, sanitizeRetrievedText } from '../core/security';

export interface TavilySearchOptions {
  query: string;
  search_depth?: 'basic' | 'advanced';
  topic?: 'general' | 'news' | 'finance';
  max_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  time_range?: 'day' | 'week' | 'month' | 'year';
  bypassCache?: boolean;
  userId?: string | null;
  claimId?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface TavilyResultItem {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date: string | null;
  domain: string;
  retrieved_at: string;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilyResultItem[];
  cache_hit: boolean;
  retrieved_at: string;
  response_time_ms: number;
}

export class MissingTavilyKeyError extends Error {
  public readonly code = 'MISSING_TAVILY_API_KEY';
  constructor() {
    super(
      'TAVILY_API_KEY is not configured on the backend server. Configure TAVILY_API_KEY in your environment secrets to perform live web evidence retrieval.'
    );
    this.name = 'MissingTavilyKeyError';
  }
}

export class TavilyRateLimitError extends Error {
  public readonly code = 'TAVILY_RATE_LIMIT';
  public readonly statusCode = 429;
  constructor(message = 'Tavily API rate limit reached after retries. Please retry shortly.') {
    super(message);
    this.name = 'TavilyRateLimitError';
  }
}

export class TavilyApiError extends Error {
  public readonly code = 'TAVILY_API_ERROR';
  public readonly statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'TavilyApiError';
    this.statusCode = statusCode;
  }
}

const CACHE_TTL_MINUTES = 60;
const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

type FetchLike = typeof fetch;
let activeFetch: FetchLike = fetch;

export function setTavilyFetchForTests(customFetch: FetchLike | null): void {
  activeFetch = customFetch ?? fetch;
}

export function isTavilyConfigured(): boolean {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  return key.length > 0 && key !== 'your_tavily_api_key';
}

function buildCacheKey(opts: TavilySearchOptions): string {
  const normalized = JSON.stringify({
    q: opts.query.trim().toLowerCase(),
    d: opts.search_depth || 'basic',
    t: opts.topic || 'general',
    m: opts.max_results || 6,
    id: opts.include_domains || [],
    ed: opts.exclude_domains || [],
    tr: opts.time_range || null,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown';
  }
}

function logTavilyQuery(params: {
  userId?: string | null;
  claimId?: string | null;
  query: string;
  searchDepth: string;
  statusCode: number | null;
  resultCount: number;
  cacheHit: boolean;
  errorMessage?: string | null;
  durationMs: number;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO tavily_query_logs
        (id, user_id, claim_id, query, search_depth, status_code, result_count, cache_hit, error_message, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.userId ?? null,
      params.claimId ?? null,
      params.query.slice(0, 400),
      params.searchDepth,
      params.statusCode,
      params.resultCount,
      params.cacheHit ? 1 : 0,
      params.errorMessage ? params.errorMessage.slice(0, 400) : null,
      params.durationMs
    );
  } catch {
    // Non-fatal logging error
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchTavily(opts: TavilySearchOptions): Promise<TavilySearchResponse> {
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  const query = opts.query.trim();
  const searchDepth = opts.search_depth || 'basic';
  const maxResults = Math.min(Math.max(opts.max_results ?? 6, 1), 15);
  const timeoutMs = opts.timeoutMs ?? 15000;
  const maxRetries = opts.maxRetries ?? 2;

  if (!query) {
    throw new TavilyApiError('Search query cannot be empty.', 400);
  }

  if (!isTavilyConfigured()) {
    logTavilyQuery({
      userId: opts.userId,
      claimId: opts.claimId,
      query,
      searchDepth,
      statusCode: 401,
      resultCount: 0,
      cacheHit: false,
      errorMessage: 'MISSING_TAVILY_API_KEY',
      durationMs: 0,
    });
    throw new MissingTavilyKeyError();
  }

  const db = getDb();
  const cacheKey = buildCacheKey(opts);
  const nowIso = new Date().toISOString();

  if (!opts.bypassCache) {
    const cached = db
      .prepare(
        `SELECT response_json, cached_at FROM tavily_search_cache
         WHERE query_hash = ? AND datetime(cached_at, '+${CACHE_TTL_MINUTES} minutes') > datetime('now')`
      )
      .get(cacheKey) as { response_json: string; cached_at: string } | undefined;

    if (cached) {
      try {
        const parsed = JSON.parse(cached.response_json) as TavilySearchResponse;
        logTavilyQuery({
          userId: opts.userId,
          claimId: opts.claimId,
          query,
          searchDepth,
          statusCode: 200,
          resultCount: parsed.results.length,
          cacheHit: true,
          durationMs: 1,
        });
        return { ...parsed, cache_hit: true };
      } catch {
        // Ignore corrupt cache row
      }
    }
  }

  const payload: Record<string, unknown> = {
    query,
    search_depth: searchDepth,
    topic: opts.topic || 'general',
    max_results: maxResults,
    include_answer: false,
    include_raw_content: false,
  };
  if (opts.include_domains && opts.include_domains.length > 0) {
    payload.include_domains = opts.include_domains;
  }
  if (opts.exclude_domains && opts.exclude_domains.length > 0) {
    payload.exclude_domains = opts.exclude_domains;
  }
  if (opts.time_range) {
    payload.time_range = opts.time_range;
  }

  const startMs = Date.now();
  let lastError: Error | null = null;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await activeFetch(TAVILY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
      lastStatus = response.status;

      if (response.status === 429) {
        if (attempt < maxRetries) {
          const backoffMs = 400 * Math.pow(2, attempt);
          await sleep(backoffMs);
          continue;
        }
        throw new TavilyRateLimitError();
      }

      if (response.status === 401 || response.status === 403) {
        throw new TavilyApiError('Tavily API rejected authentication credentials.', response.status);
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        if (response.status >= 500 && attempt < maxRetries) {
          await sleep(300 * Math.pow(2, attempt));
          continue;
        }
        throw new TavilyApiError(
          `Tavily API request failed (${response.status}): ${sanitizeRetrievedText(bodyText, 200)}`,
          response.status
        );
      }

      const rawJson = (await response.json()) as {
        query?: string;
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          score?: number;
          published_date?: string | null;
        }>;
      };

      const retrievedAt = new Date().toISOString();
      const rawResults = Array.isArray(rawJson.results) ? rawJson.results : [];
      const sanitizedResults: TavilyResultItem[] = [];

      for (const item of rawResults) {
        if (!item.url || !isSafeExternalUrl(item.url)) {
          continue;
        }
        const cleanTitle = sanitizeRetrievedText(item.title || item.url, 240);
        const cleanContent = sanitizeRetrievedText(item.content || '', 1200);
        const pubDate =
          item.published_date && typeof item.published_date === 'string' && !Number.isNaN(Date.parse(item.published_date))
            ? new Date(item.published_date).toISOString()
            : null;

        sanitizedResults.push({
          title: cleanTitle || item.url,
          url: item.url,
          content: cleanContent,
          score: typeof item.score === 'number' ? Math.max(0, Math.min(1, item.score)) : 0.5,
          published_date: pubDate,
          domain: extractDomain(item.url),
          retrieved_at: retrievedAt,
        });
      }

      const durationMs = Date.now() - startMs;
      const resultObj: TavilySearchResponse = {
        query: rawJson.query || query,
        results: sanitizedResults,
        cache_hit: false,
        retrieved_at: nowIso,
        response_time_ms: durationMs,
      };

      db.prepare(
        `INSERT OR REPLACE INTO tavily_search_cache (query_hash, query, search_depth, response_json, cached_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(cacheKey, query, searchDepth, JSON.stringify(resultObj));

      logTavilyQuery({
        userId: opts.userId,
        claimId: opts.claimId,
        query,
        searchDepth,
        statusCode: 200,
        resultCount: sanitizedResults.length,
        cacheHit: false,
        durationMs,
      });

      return resultObj;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof TavilyRateLimitError) {
        lastError = err;
        break;
      }
      if (err instanceof TavilyApiError) {
        lastError = err;
        if (err.statusCode < 500) break;
      } else if (err instanceof Error && err.name === 'AbortError') {
        lastError = new TavilyApiError('Tavily API request timed out.', 504);
        if (attempt < maxRetries) {
          await sleep(250 * Math.pow(2, attempt));
          continue;
        }
      } else {
        lastError = err instanceof Error ? err : new TavilyApiError('Unknown Tavily network failure', 502);
        if (attempt < maxRetries) {
          await sleep(250 * Math.pow(2, attempt));
          continue;
        }
      }
    }
  }

  const durationMs = Date.now() - startMs;
  logTavilyQuery({
    userId: opts.userId,
    claimId: opts.claimId,
    query,
    searchDepth,
    statusCode: lastStatus,
    resultCount: 0,
    cacheHit: false,
    errorMessage: lastError?.message || 'Unknown error',
    durationMs,
  });

  throw lastError || new TavilyApiError('Tavily search failed.', 502);
}
