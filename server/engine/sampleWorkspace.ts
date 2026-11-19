import crypto from 'crypto';
import { getDb } from '../db/database';

/**
 * Loads explicitly marked Development Sample Data (`is_sample_data = 1`) for an authenticated user
 * so every architectural subsystem (Verification, 5 Agents, Evidence DNA, Temporal Knowledge Graph,
 * Predictive Decay, Self-Healing Memory, Dependency Mapping, Monitoring & Alerts) can be inspected
 * immediately without fabricating live Tavily outputs.
 */
export function loadDevelopmentSampleWorkspace(userId: string): { created: boolean; message: string } {
  const db = getDb();
  const existing = db
    .prepare(`SELECT COUNT(*) AS cnt FROM extracted_claims WHERE user_id = ? AND is_sample_data = 1`)
    .get(userId) as { cnt: number };

  if (existing.cnt > 0) {
    return { created: false, message: 'Development sample workspace is already loaded for this account.' };
  }

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const daysAhead = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

  const docId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const rawText =
    'OpenAI appointed Bret Taylor as Chair of its Board of Directors in late 2023. ' +
    'NVIDIA is headquartered in Santa Clara, California. ' +
    'Python 3.10 reached end-of-life security support in 2024. ' +
    'Global atmospheric CO2 concentration averaged roughly 422 ppm in 2024.';

  db.prepare(
    `INSERT INTO submitted_documents (id, user_id, title, source_type, raw_text, content_hash, created_at)
     VALUES (?, ?, ?, 'sample_briefing', ?, ?, ?)`
  ).run(docId, userId, '[Sample] Executive Tech & Science Briefing', rawText, 'sample-hash-001', daysAgo(12));

  db.prepare(
    `INSERT INTO verification_jobs (id, user_id, document_id, status, is_sample_data, created_at, completed_at)
     VALUES (?, ?, ?, 'completed', 1, ?, ?)`
  ).run(jobId, userId, docId, daysAgo(12), daysAgo(12));

  const answerId1 = crypto.randomUUID();
  const answerId2 = crypto.randomUUID();
  db.prepare(
    `INSERT INTO updated_answers (id, user_id, title, answer_text, reverification_status, last_checked_at)
     VALUES (?, ?, ?, ?, 'needs_review', ?)`
  ).run(
    answerId1,
    userId,
    '[Sample] Python Runtime Support Matrix',
    'Internal engineering guidelines referencing Python 3.10 EOL timelines.',
    daysAgo(1)
  );
  db.prepare(
    `INSERT INTO updated_answers (id, user_id, title, answer_text, reverification_status, last_checked_at)
     VALUES (?, ?, ?, ?, 'current', ?)`
  ).run(
    answerId2,
    userId,
    '[Sample] Semiconductor Corporate Governance Profile',
    'Overview of NVIDIA headquarters and AI industry leadership.',
    daysAgo(3)
  );

  const sampleClaims = [
    {
      original_text: 'NVIDIA is headquartered in Santa Clara, California.',
      normalized_claim: 'NVIDIA is headquartered in Santa Clara, California',
      subject: 'NVIDIA',
      predicate: 'is headquartered in',
      object_value: 'Santa Clara, California',
      entities: [
        { text: 'NVIDIA', type: 'Organization' },
        { text: 'Santa Clara', type: 'Location' },
      ],
      dates: [],
      domain: 'Business',
      time_sensitivity: 'medium',
      volatility_level: 'moderate',
      half_life_days: 90,
      status: 'VERIFIED',
      reasoning:
        'Sample record: Confirmed by official corporate filings and multiple independent encyclopedic/news records.',
      confidence: { total: 91, rel: 23, qual: 22, corr: 23, pen: 0, comp: 23 },
      freshness: { total: 88, state: 'Fresh', age: 16, risk: 'low' },
      answerId: answerId2,
      sources: [
        {
          url: 'https://www.nvidia.com/en-us/about-nvidia/',
          domain: 'nvidia.com',
          title: 'About NVIDIA — Corporate Headquarters',
          pub: daysAgo(16),
          stance: 'supporting',
          type: 'Official Organization',
          primary: 1,
          official: 1,
          cred: 87,
          snippet: 'NVIDIA Corporation is headquartered in Santa Clara, California.',
        },
        {
          url: 'https://www.sec.gov/edgar/browse/?CIK=0001045810',
          domain: 'sec.gov',
          title: 'SEC EDGAR Form 10-K — NVIDIA Corp',
          pub: daysAgo(45),
          stance: 'supporting',
          type: 'Government',
          primary: 1,
          official: 1,
          cred: 92,
          snippet: 'Address of principal executive offices: 2788 San Tomas Expressway, Santa Clara, California.',
        },
      ],
    },
    {
      original_text: 'Python 3.10 reached end-of-life security support in 2024.',
      normalized_claim: 'Python 3.10 reached end-of-life security support in 2024',
      subject: 'Python 3.10',
      predicate: 'reached end-of-life in',
      object_value: '2024',
      entities: [{ text: 'Python 3.10', type: 'Entity' }],
      dates: ['2024'],
      domain: 'Technology',
      time_sensitivity: 'high',
      volatility_level: 'high',
      half_life_days: 60,
      status: 'OUTDATED',
      reasoning:
        'Sample record: Official Python Software Foundation release schedule (PEP 619) specifies Python 3.10 security support runs until October 2026, contradicting the 2024 claim.',
      confidence: { total: 42, rel: 21, qual: 22, corr: 0, pen: 24, comp: 23 },
      freshness: { total: 21, state: 'Stale', age: 95, risk: 'critical' },
      answerId: answerId1,
      hasHistory: true,
      sources: [
        {
          url: 'https://devguide.python.org/versions/',
          domain: 'devguide.python.org',
          title: 'Status of Python versions — Python Developer Guide',
          pub: daysAgo(5),
          stance: 'contradictory',
          type: 'Official Organization',
          primary: 1,
          official: 1,
          cred: 89,
          snippet: 'Python 3.10 is in security-fix phase with end-of-life scheduled for October 2026 (PEP 619).',
        },
      ],
    },
    {
      original_text: 'Global atmospheric CO2 concentration averaged roughly 422 ppm in 2024.',
      normalized_claim: 'Global atmospheric CO2 concentration averaged roughly 422 ppm in 2024',
      subject: 'Global atmospheric CO2 concentration',
      predicate: 'averaged',
      object_value: '422 ppm in 2024',
      entities: [{ text: 'CO2', type: 'Entity' }],
      dates: ['2024'],
      domain: 'Environment',
      time_sensitivity: 'medium',
      volatility_level: 'moderate',
      half_life_days: 180,
      status: 'CONFLICTING',
      reasoning:
        'Sample record: Mauna Loa station seasonal peaks vs global marine boundary layer annual averages differ slightly between preliminary reports.',
      confidence: { total: 64, rel: 20, qual: 21, corr: 15, pen: 12, comp: 20 },
      freshness: { total: 62, state: 'Aging', age: 110, risk: 'moderate' },
      answerId: answerId2,
      sources: [
        {
          url: 'https://gml.noaa.gov/ccgg/trends/',
          domain: 'gml.noaa.gov',
          title: 'NOAA Global Monitoring Laboratory — Carbon Cycle Trends',
          pub: daysAgo(110),
          stance: 'supporting',
          type: 'Government',
          primary: 1,
          official: 1,
          cred: 91,
          snippet: 'Annual mean global marine surface CO2 concentration reached ~422.8 ppm.',
        },
        {
          url: 'https://climate.nasa.gov/vital-signs/carbon-dioxide/',
          domain: 'climate.nasa.gov',
          title: 'NASA Vital Signs — Carbon Dioxide',
          pub: daysAgo(125),
          stance: 'contradictory',
          type: 'Government',
          primary: 1,
          official: 1,
          cred: 91,
          snippet: 'Seasonal Mauna Loa observatory readings exceeded 426 ppm in May 2024.',
        },
      ],
    },
  ];

  for (const sc of sampleClaims) {
    const claimId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO extracted_claims
        (id, job_id, user_id, original_text, normalized_claim, subject, predicate, object_value, entities_json, relevant_dates_json, extraction_confidence, is_sample_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.91, 1, ?, ?)`
    ).run(
      claimId,
      jobId,
      userId,
      sc.original_text,
      sc.normalized_claim,
      sc.subject,
      sc.predicate,
      sc.object_value,
      JSON.stringify(sc.entities),
      JSON.stringify(sc.dates),
      daysAgo(12),
      daysAgo(1)
    );

    db.prepare(
      `INSERT INTO claim_classifications (id, claim_id, domain, time_sensitivity, volatility_level, half_life_days)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), claimId, sc.domain, sc.time_sensitivity, sc.volatility_level, sc.half_life_days);

    db.prepare(
      `INSERT INTO verification_results (id, claim_id, status, reasoning, duplication_summary_json, verified_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      claimId,
      sc.status,
      sc.reasoning,
      JSON.stringify({
        duplicate_url_count: 0,
        near_duplicate_clusters: 0,
        independent_source_count: sc.sources.length,
        total_source_count: sc.sources.length,
        possible_anomaly: false,
        anomaly_note: null,
      }),
      daysAgo(1)
    );

    db.prepare(
      `INSERT INTO confidence_scores (id, claim_id, total_score, evidence_relevance, source_quality, independent_corroboration, contradiction_penalty, evidence_completeness, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      claimId,
      sc.confidence.total,
      sc.confidence.rel,
      sc.confidence.qual,
      sc.confidence.corr,
      sc.confidence.pen,
      sc.confidence.comp,
      `Sample breakdown: Relevance ${sc.confidence.rel}/25 + Source Quality ${sc.confidence.qual}/25 + Corroboration ${sc.confidence.corr}/25 + Completeness ${sc.confidence.comp}/25 - Penalty ${sc.confidence.pen}.`
    );

    db.prepare(
      `INSERT INTO freshness_scores (id, claim_id, total_score, decay_state, evidence_age_days, domain_half_life_days, volatility_level, historical_change_count, estimated_next_review_date, staleness_risk, uncertainty_note, reasons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      claimId,
      sc.freshness.total,
      sc.freshness.state,
      sc.freshness.age,
      sc.half_life_days,
      sc.volatility_level,
      sc.hasHistory ? 1 : 0,
      daysAhead(sc.status === 'OUTDATED' ? 1 : 21),
      sc.freshness.risk,
      'Sample estimate with uncertainty — run live Tavily verification to replace with real-time web retrieval.',
      JSON.stringify([`Domain ${sc.domain} baseline half-life: ${sc.half_life_days} days.`])
    );

    // Sources & Evidence
    for (let idx = 0; idx < sc.sources.length; idx++) {
      const s = sc.sources[idx];
      const srcId = crypto.randomUUID();
      const evId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO sources (id, url, canonical_url, domain, title, published_date, author_or_publisher, source_type, is_primary_source, is_official_source, credibility_score, credibility_explanation, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        srcId,
        s.url,
        s.url,
        s.domain,
        s.title,
        s.pub,
        s.domain,
        s.type,
        s.primary,
        s.official,
        s.cred,
        `Heuristic assessment (${s.type}): official/primary signals evaluated.`,
        `sample-${claimId.slice(0, 8)}-${idx}`
      );
      db.prepare(
        `INSERT INTO evidence_records (id, claim_id, source_id, stance, snippet, relevance_score, independence_cluster_id, is_duplicate_url, is_near_duplicate_text, similarity_score, query_used, retrieved_at)
         VALUES (?, ?, ?, ?, ?, 0.88, ?, 0, 0, 0, ?, ?)`
      ).run(evId, claimId, srcId, s.stance, s.snippet, `cluster-${idx + 1}`, sc.normalized_claim, daysAgo(1));
      if (s.stance === 'supporting') {
        db.prepare(`INSERT INTO supporting_evidence (id, claim_id, evidence_id) VALUES (?, ?, ?)`).run(
          crypto.randomUUID(),
          claimId,
          evId
        );
      } else {
        db.prepare(`INSERT INTO contradictory_evidence (id, claim_id, evidence_id) VALUES (?, ?, ?)`).run(
          crypto.randomUUID(),
          claimId,
          evId
        );
      }
    }

    // 5 Agent Executions
    const agentNames = [
      'Researcher Agent',
      'Skeptic Agent',
      'Temporal Intelligence Agent',
      'Evidence Analyst Agent',
      'Judge Agent',
    ];
    for (const agName of agentNames) {
      db.prepare(
        `INSERT INTO agent_executions (id, claim_id, agent_name, status, input_summary, queries_json, findings_json, evidence_refs_json, output_summary, warnings_json, duration_ms, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 42, ?)`
      ).run(
        crypto.randomUUID(),
        claimId,
        agName,
        sc.status === 'OUTDATED' && agName === 'Temporal Intelligence Agent' ? 'warning' : 'completed',
        `Sample inspection input for ${sc.subject}`,
        JSON.stringify(agName === 'Researcher Agent' || agName === 'Skeptic Agent' ? [sc.normalized_claim] : []),
        JSON.stringify([`Sample ${agName} trace recorded for demonstration.`]),
        JSON.stringify(sc.sources.map((s) => s.url)),
        `${agName} completed sample inspection (${sc.status}).`,
        daysAgo(1)
      );
    }

    // Fact Versions & Self-Healing History
    if (sc.hasHistory) {
      db.prepare(
        `INSERT INTO fact_versions (id, claim_id, version_number, claim_text, subject, predicate, object_value, status, confidence_score, freshness_score, valid_from, valid_until, change_summary, evidence_urls_json)
         VALUES (?, ?, 1, ?, ?, ?, '2024', 'UNVERIFIED', 55, 70, ?, ?, 'Initial sample baseline', ?)`
      ).run(
        crypto.randomUUID(),
        claimId,
        sc.normalized_claim,
        sc.subject,
        sc.predicate,
        daysAgo(12),
        daysAgo(1),
        JSON.stringify(sc.sources.map((s) => s.url))
      );
      db.prepare(
        `INSERT INTO fact_versions (id, claim_id, version_number, claim_text, subject, predicate, object_value, status, confidence_score, freshness_score, valid_from, valid_until, change_summary, evidence_urls_json)
         VALUES (?, ?, 2, ?, ?, ?, 'October 2026 (PEP 619)', 'OUTDATED', 42, 21, ?, NULL, 'Superseded by official PSF PEP 619 schedule', ?)`
      ).run(
        crypto.randomUUID(),
        claimId,
        sc.normalized_claim,
        sc.subject,
        sc.predicate,
        daysAgo(1),
        JSON.stringify(sc.sources.map((s) => s.url))
      );
      db.prepare(
        `INSERT INTO historical_facts (id, user_id, claim_id, previous_info, new_info, changes_detected, why_changed, evidence_urls_json, recommended_action, detected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Update', ?)`
      ).run(
        crypto.randomUUID(),
        userId,
        claimId,
        'Claimed Python 3.10 reached end-of-life security support in 2024.',
        'Official PSF devguide lists Python 3.10 security EOL as October 2026.',
        'End-of-life year differed by 2 years (2024 vs 2026).',
        'PEP 619 release schedule published on devguide.python.org.',
        JSON.stringify(sc.sources.map((s) => s.url)),
        daysAgo(1)
      );
    } else {
      db.prepare(
        `INSERT INTO fact_versions (id, claim_id, version_number, claim_text, subject, predicate, object_value, status, confidence_score, freshness_score, valid_from, valid_until, change_summary, evidence_urls_json)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Initial sample baseline', ?)`
      ).run(
        crypto.randomUUID(),
        claimId,
        sc.normalized_claim,
        sc.subject,
        sc.predicate,
        sc.object_value,
        sc.status,
        sc.confidence.total,
        sc.freshness.total,
        daysAgo(12),
        JSON.stringify(sc.sources.map((s) => s.url))
      );
    }

    // Dependencies
    db.prepare(
      `INSERT INTO knowledge_dependencies (id, user_id, claim_id, dependent_record_id, dependent_record_type, dependent_title, impact_note, reverification_status)
       VALUES (?, ?, ?, ?, 'Report / Answer', ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      claimId,
      sc.answerId,
      sc.answerId === answerId1 ? '[Sample] Python Runtime Support Matrix' : '[Sample] Semiconductor Corporate Governance Profile',
      'Sample dependency linkage for impact analysis.',
      sc.hasHistory ? 'needs_review' : 'current'
    );

    // Graph entities & relationship
    const subId = crypto.randomUUID();
    const objId = crypto.randomUUID();
    db.prepare(
      `INSERT OR IGNORE INTO entities (id, user_id, name, normalized_name, entity_type, domain)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(subId, userId, sc.subject, sc.subject.toLowerCase(), sc.entities[0]?.type || 'Entity', sc.domain);
    db.prepare(
      `INSERT OR IGNORE INTO entities (id, user_id, name, normalized_name, entity_type, domain)
       VALUES (?, ?, ?, ?, 'AttributeValue', ?)`
    ).run(objId, userId, sc.object_value, sc.object_value.toLowerCase(), sc.domain);

    const realSub = db
      .prepare(`SELECT id FROM entities WHERE user_id = ? AND normalized_name = ?`)
      .get(userId, sc.subject.toLowerCase()) as { id: string };
    const realObj = db
      .prepare(`SELECT id FROM entities WHERE user_id = ? AND normalized_name = ?`)
      .get(userId, sc.object_value.toLowerCase()) as { id: string };

    db.prepare(
      `INSERT INTO knowledge_graph_relationships (id, user_id, source_entity_id, target_entity_id, predicate, claim_id, valid_from, valid_until, confidence, freshness, is_historical)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`
    ).run(
      crypto.randomUUID(),
      userId,
      realSub.id,
      realObj.id,
      sc.predicate,
      claimId,
      daysAgo(12),
      sc.confidence.total,
      sc.freshness.total
    );

    // Monitoring schedule + alert on Python 3.10 sample claim
    if (sc.hasHistory) {
      const schedId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO monitoring_schedules (id, user_id, claim_id, frequency_hours, freshness_threshold, alert_on_change, alert_on_stale, status, last_verified_at, next_run_at)
         VALUES (?, ?, ?, 24, 65, 1, 1, 'active', ?, ?)`
      ).run(schedId, userId, claimId, daysAgo(1), daysAhead(1));

      db.prepare(
        `INSERT INTO alerts (id, user_id, schedule_id, claim_id, severity, title, message)
         VALUES (?, ?, ?, ?, 'critical', '[Sample] Outdated Version Claim Flagged', ?)`
      ).run(
        crypto.randomUUID(),
        userId,
        schedId,
        claimId,
        'Sample alert: Python 3.10 EOL claim was flagged as OUTDATED against PEP 619.'
      );
    }
  }

  return { created: true, message: 'Loaded clearly labeled Development Sample Workspace.' };
}
