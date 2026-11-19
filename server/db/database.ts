import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getDbPath(): string {
  const configured = process.env.DATABASE_PATH || './data/truthos.db';
  return path.resolve(process.cwd(), configured);
}

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const targetPath = customPath || getDbPath();
  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function resetDbForTests(customPath = ':memory:'): Database.Database {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }
  dbInstance = getDb(customPath);
  return dbInstance;
}

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'analyst',
      theme_preference TEXT NOT NULL DEFAULT 'dark',
      default_freshness_threshold INTEGER NOT NULL DEFAULT 60,
      default_monitoring_frequency_hours INTEGER NOT NULL DEFAULT 24,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS submitted_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'text',
      raw_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS verification_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES submitted_documents(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'processing',
      error_message TEXT,
      is_sample_data INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS extracted_claims (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES verification_jobs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_text TEXT NOT NULL,
      normalized_claim TEXT NOT NULL,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_value TEXT NOT NULL,
      entities_json TEXT NOT NULL DEFAULT '[]',
      relevant_dates_json TEXT NOT NULL DEFAULT '[]',
      extraction_confidence REAL NOT NULL DEFAULT 0.8,
      is_sample_data INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS claim_classifications (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL UNIQUE REFERENCES extracted_claims(id) ON DELETE CASCADE,
      domain TEXT NOT NULL,
      time_sensitivity TEXT NOT NULL,
      volatility_level TEXT NOT NULL,
      half_life_days INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      domain TEXT NOT NULL,
      title TEXT NOT NULL,
      published_date TEXT,
      author_or_publisher TEXT,
      source_type TEXT NOT NULL,
      is_primary_source INTEGER NOT NULL DEFAULT 0,
      is_official_source INTEGER NOT NULL DEFAULT 0,
      credibility_score REAL NOT NULL,
      credibility_explanation TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence_records (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      stance TEXT NOT NULL,
      snippet TEXT NOT NULL,
      relevance_score REAL NOT NULL,
      independence_cluster_id TEXT NOT NULL,
      is_duplicate_url INTEGER NOT NULL DEFAULT 0,
      is_near_duplicate_text INTEGER NOT NULL DEFAULT 0,
      similarity_score REAL NOT NULL DEFAULT 0,
      query_used TEXT NOT NULL,
      retrieved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supporting_evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contradictory_evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      evidence_id TEXT NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_executions (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL,
      input_summary TEXT NOT NULL,
      queries_json TEXT NOT NULL DEFAULT '[]',
      findings_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      output_summary TEXT NOT NULL,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS verification_results (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL UNIQUE REFERENCES extracted_claims(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      duplication_summary_json TEXT NOT NULL DEFAULT '{}',
      verified_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS confidence_scores (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL UNIQUE REFERENCES extracted_claims(id) ON DELETE CASCADE,
      total_score REAL NOT NULL,
      evidence_relevance REAL NOT NULL,
      source_quality REAL NOT NULL,
      independent_corroboration REAL NOT NULL,
      contradiction_penalty REAL NOT NULL,
      evidence_completeness REAL NOT NULL,
      explanation TEXT NOT NULL,
      calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS freshness_scores (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL UNIQUE REFERENCES extracted_claims(id) ON DELETE CASCADE,
      total_score REAL NOT NULL,
      decay_state TEXT NOT NULL,
      evidence_age_days REAL,
      domain_half_life_days INTEGER NOT NULL,
      volatility_level TEXT NOT NULL,
      historical_change_count INTEGER NOT NULL DEFAULT 0,
      estimated_next_review_date TEXT NOT NULL,
      staleness_risk TEXT NOT NULL,
      uncertainty_note TEXT NOT NULL,
      reasons_json TEXT NOT NULL DEFAULT '[]',
      calculated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      domain TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, normalized_name)
    );

    CREATE TABLE IF NOT EXISTS historical_facts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      previous_info TEXT NOT NULL,
      new_info TEXT NOT NULL,
      changes_detected TEXT NOT NULL,
      why_changed TEXT NOT NULL,
      evidence_urls_json TEXT NOT NULL DEFAULT '[]',
      recommended_action TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fact_versions (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      claim_text TEXT NOT NULL,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_value TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      freshness_score REAL NOT NULL,
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      change_summary TEXT,
      evidence_urls_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_graph_relationships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      target_entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      predicate TEXT NOT NULL,
      claim_id TEXT REFERENCES extracted_claims(id) ON DELETE SET NULL,
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      confidence REAL NOT NULL DEFAULT 50,
      freshness REAL NOT NULL DEFAULT 50,
      is_historical INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS updated_answers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      reverification_status TEXT NOT NULL DEFAULT 'current',
      last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_dependencies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      dependent_record_id TEXT NOT NULL,
      dependent_record_type TEXT NOT NULL,
      dependent_title TEXT NOT NULL,
      impact_note TEXT NOT NULL,
      reverification_status TEXT NOT NULL DEFAULT 'current',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitoring_schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      frequency_hours INTEGER NOT NULL DEFAULT 24,
      freshness_threshold INTEGER NOT NULL DEFAULT 60,
      alert_on_change INTEGER NOT NULL DEFAULT 1,
      alert_on_stale INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      last_verified_at TEXT,
      next_run_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, claim_id)
    );

    CREATE TABLE IF NOT EXISTS monitoring_executions (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES monitoring_schedules(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES extracted_claims(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      change_detected INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      schedule_id TEXT REFERENCES monitoring_schedules(id) ON DELETE SET NULL,
      claim_id TEXT REFERENCES extracted_claims(id) ON DELETE SET NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tavily_search_cache (
      query_hash TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      search_depth TEXT NOT NULL,
      response_json TEXT NOT NULL,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tavily_query_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      claim_id TEXT REFERENCES extracted_claims(id) ON DELETE SET NULL,
      query TEXT NOT NULL,
      search_depth TEXT NOT NULL,
      status_code INTEGER,
      result_count INTEGER NOT NULL DEFAULT 0,
      cache_hit INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_claims_user ON extracted_claims(user_id);
    CREATE INDEX IF NOT EXISTS idx_claims_job ON extracted_claims(job_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_claim ON evidence_records(claim_id);
    CREATE INDEX IF NOT EXISTS idx_versions_claim ON fact_versions(claim_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON monitoring_schedules(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, is_read);
  `);
}
