export type ClaimStatus =
  | 'VERIFIED'
  | 'OUTDATED'
  | 'UNVERIFIED'
  | 'CONFLICTING'
  | 'INSUFFICIENT EVIDENCE';

export type DecayState = 'Fresh' | 'Aging' | 'At Risk' | 'Stale';

export type KnowledgeDomain =
  | 'Technology'
  | 'Artificial Intelligence'
  | 'Science'
  | 'Healthcare information'
  | 'Finance'
  | 'Business'
  | 'Politics and government'
  | 'Education'
  | 'Law and regulation'
  | 'Environment'
  | 'General knowledge';

export type SourceCategory =
  | 'Government'
  | 'Official Organization'
  | 'Academic Publication'
  | 'Scientific Journal'
  | 'Established News Publisher'
  | 'Industry Publication'
  | 'Personal Blog'
  | 'Forum'
  | 'Unknown';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'analyst' | 'admin';
  theme_preference: 'dark' | 'light';
  default_freshness_threshold: number;
  default_monitoring_frequency_hours: number;
  created_at: string;
}

export interface ConfidenceBreakdown {
  total: number;
  evidence_relevance: number;
  source_quality: number;
  independent_corroboration: number;
  contradiction_penalty: number;
  evidence_completeness: number;
  explanation: string;
}

export interface FreshnessBreakdown {
  total: number;
  decay_state: DecayState;
  evidence_age_days: number | null;
  domain_half_life_days: number;
  volatility_level: 'extreme' | 'high' | 'moderate' | 'low';
  historical_change_count: number;
  estimated_next_review_date: string;
  staleness_risk: 'low' | 'moderate' | 'high' | 'critical';
  uncertainty_note: string;
  reasons: string[];
}

export interface EvidenceSourceRecord {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  domain: string;
  published_date: string | null;
  retrieved_at: string;
  snippet: string;
  stance: 'supporting' | 'contradictory' | 'context';
  source_type: SourceCategory;
  is_primary_source: boolean;
  is_official_source: boolean;
  author_or_publisher: string | null;
  credibility_score: number;
  credibility_is_heuristic: true;
  credibility_explanation: string;
  relevance_score: number;
  independence_cluster_id: string;
  is_duplicate_url: boolean;
  is_near_duplicate_text: boolean;
  similarity_score: number;
  query_used: string;
}

export interface AgentExecutionRecord {
  id: string;
  claim_id: string;
  agent_name:
    | 'Researcher Agent'
    | 'Skeptic Agent'
    | 'Temporal Intelligence Agent'
    | 'Evidence Analyst Agent'
    | 'Judge Agent';
  status: 'completed' | 'warning' | 'error' | 'skipped';
  input_summary: string;
  queries_executed: string[];
  findings: string[];
  evidence_refs: string[];
  output_summary: string;
  warnings: string[];
  executed_at: string;
  duration_ms: number;
}

export interface FactVersionRecord {
  id: string;
  claim_id: string;
  version_number: number;
  claim_text: string;
  subject: string;
  predicate: string;
  object_value: string;
  status: ClaimStatus;
  confidence_score: number;
  freshness_score: number;
  valid_from: string;
  valid_until: string | null;
  change_summary: string | null;
  evidence_urls: string[];
  created_at: string;
}

export interface ClaimDetailRecord {
  id: string;
  job_id: string;
  original_text: string;
  normalized_claim: string;
  subject: string;
  predicate: string;
  object_value: string;
  entities: Array<{ text: string; type: string }>;
  relevant_dates: string[];
  domain: KnowledgeDomain;
  time_sensitivity: 'high' | 'medium' | 'low';
  extraction_confidence: number;
  status: ClaimStatus;
  reasoning: string;
  confidence_score: number;
  freshness_score: number;
  decay_state: DecayState;
  confidence_breakdown: ConfidenceBreakdown;
  freshness_breakdown: FreshnessBreakdown;
  is_sample_data: boolean;
  created_at: string;
  updated_at: string;
  evidence: EvidenceSourceRecord[];
  agents: AgentExecutionRecord[];
  versions: FactVersionRecord[];
  duplication_analysis: {
    duplicate_url_count: number;
    near_duplicate_clusters: number;
    independent_source_count: number;
    total_source_count: number;
    possible_anomaly: boolean;
    anomaly_note: string | null;
  };
}

export interface VerificationJobSummary {
  id: string;
  title: string;
  source_type: string;
  raw_text: string;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  claim_count: number;
  is_sample_data: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  entity_type: string;
  domain: string;
  current_value?: string;
  freshness_score?: number;
  status?: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  predicate: string;
  valid_from: string;
  valid_until: string | null;
  confidence: number;
  freshness: number;
  claim_id: string | null;
  is_historical: boolean;
}

export interface MemoryChangeComparison {
  id: string;
  claim_id: string;
  previous_info: string;
  new_info: string;
  changes_detected: string;
  why_changed: string;
  evidence_urls: string[];
  affected_records: Array<{ id: string; title: string; record_type: string; reverification_status: string }>;
  recommended_action: 'Retain' | 'Update' | 'Flag for human review';
  detected_at: string;
}

export interface MonitoringScheduleRecord {
  id: string;
  claim_id: string;
  claim_text: string;
  claim_status: ClaimStatus;
  freshness_score: number;
  frequency_hours: number;
  freshness_threshold: number;
  alert_on_change: boolean;
  alert_on_stale: boolean;
  status: 'active' | 'paused';
  last_verified_at: string | null;
  next_run_at: string;
  created_at: string;
}

export interface AlertRecord {
  id: string;
  schedule_id: string | null;
  claim_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface DashboardAnalytics {
  total_claims: number;
  verified_claims: number;
  outdated_claims: number;
  conflicting_claims: number;
  unverified_claims: number;
  insufficient_claims: number;
  average_confidence: number;
  average_freshness: number;
  decay_distribution: Array<{ state: DecayState; count: number }>;
  domain_breakdown: Array<{ domain: string; count: number; avg_freshness: number; avg_confidence: number }>;
  recent_jobs: VerificationJobSummary[];
  unread_alerts: AlertRecord[];
  tavily_configured: boolean;
}
