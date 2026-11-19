import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BellPlus, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ClaimStatusLabel, DecayStateLabel } from '../components/StatusIndicator';
import { apiFetch } from '../services/api';
import type { ClaimDetailRecord, ClaimStatus } from '../types/truthos';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'OUTDATED', label: 'Outdated' },
  { value: 'CONFLICTING', label: 'Conflicting' },
  { value: 'UNVERIFIED', label: 'Unverified' },
  { value: 'INSUFFICIENT EVIDENCE', label: 'Insufficient' },
];

export function ClaimIntelligencePage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [claims, setClaims] = useState<ClaimDetailRecord[]>([]);
  const [selected, setSelected] = useState<ClaimDetailRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [monitoringMsg, setMonitoringMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'ALL') qs.set('status', statusFilter);
      if (searchQuery.trim()) qs.set('q', searchQuery.trim());
      const res = await apiFetch<{ claims: ClaimDetailRecord[] }>(`/claims?${qs.toString()}`);
      setClaims(res.claims);
      if (id) {
        const match = res.claims.find((c) => c.id === id);
        if (match) {
          setSelected(match);
        } else {
          const single = await apiFetch<{ claim: ClaimDetailRecord }>(`/claims/${id}`).catch(() => null);
          setSelected(single?.claim ?? res.claims[0] ?? null);
        }
      } else {
        setSelected(res.claims[0] ?? null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claims.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClaims();
  }, [statusFilter, id]);

  const handleRecheck = async (claimId: string) => {
    setRechecking(true);
    setError(null);
    setMonitoringMsg(null);
    try {
      const res = await apiFetch<{ claim: ClaimDetailRecord }>('/memory/reverify', {
        method: 'POST',
        body: JSON.stringify({ claim_id: claimId }),
      });
      setSelected(res.claim);
      await loadClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recheck failed.');
    } finally {
      setRechecking(false);
    }
  };

  const handleMonitorClaim = async (claimId: string) => {
    setError(null);
    setMonitoringMsg(null);
    try {
      await apiFetch('/monitoring', {
        method: 'POST',
        body: JSON.stringify({
          claim_id: claimId,
          frequency_hours: 24,
          freshness_threshold: 65,
          alert_on_change: true,
          alert_on_stale: true,
        }),
      });
      setMonitoringMsg('Claim added to persistent 24h background monitoring.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule monitoring.');
    }
  };

  const selectClaim = (claim: ClaimDetailRecord) => {
    setSelected(claim);
    setMonitoringMsg(null);
    navigate(`/claims/${claim.id}`);
  };

  return (
    <AppShell title="Claim Intelligence" subtitle="Atomic claim verification breakdowns, Evidence DNA, and version history">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === f.value
                    ? 'bg-teal-600 text-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadClaims();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter claims..."
                className="pl-8 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] text-xs w-56 focus:outline-none focus:border-teal-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] hover:bg-zinc-100 dark:hover:bg-white/[0.04] cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {!loading && claims.length === 0 ? (
          <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3">
            <div className="font-display text-base font-semibold">No matching claims found</div>
            <p className="text-sm text-zinc-500">Submit a document in Verification Studio or adjust your status filter.</p>
            <Link to="/studio" className="inline-block text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
              Open Verification Studio
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[75vh] overflow-y-auto">
              {claims.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectClaim(c)}
                  className={`w-full text-left p-4 space-y-2 transition-colors cursor-pointer ${
                    selected?.id === c.id ? 'bg-teal-600/8 dark:bg-teal-500/12' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500 truncate">{c.domain}</span>
                    <ClaimStatusLabel status={c.status as ClaimStatus} />
                  </div>
                  <div className="text-sm font-medium line-clamp-2">{c.normalized_claim}</div>
                  <div className="text-xs text-zinc-500 font-mono tabular-nums flex items-center gap-2">
                    <span>Conf {c.confidence_score}</span>
                    <span aria-hidden="true">·</span>
                    <span>Fresh {c.freshness_score}</span>
                    {c.is_sample_data && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-sans">Sample</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selected && (
              <div className="lg:col-span-8 space-y-6">
                <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                        <span>{selected.domain}</span>
                        <span aria-hidden="true">·</span>
                        <span>Time Sensitivity: {selected.time_sensitivity}</span>
                        <span aria-hidden="true">·</span>
                        <span>Extraction Confidence: {Math.round(selected.extraction_confidence * 100)}%</span>
                        {selected.is_sample_data && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-600 dark:text-amber-400">Development Sample Data</span>
                          </>
                        )}
                      </div>
                      <h2 className="font-display text-lg font-semibold">{selected.normalized_claim}</h2>
                    </div>
                    <ClaimStatusLabel status={selected.status} />
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4 py-3.5 border-y border-zinc-100 dark:border-zinc-800 text-xs">
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Subject</span>
                      <span className="font-medium">{selected.subject}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Predicate</span>
                      <span className="font-medium">{selected.predicate}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Object / Value</span>
                      <span className="font-medium">{selected.object_value}</span>
                    </div>
                  </div>

                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{selected.reasoning}</p>

                  {monitoringMsg && (
                    <div className="p-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200">
                      {monitoringMsg}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleRecheck(selected.id)}
                      disabled={rechecking}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
                      <span>{rechecking ? 'Rechecking via Tavily...' : 'Recheck Claim'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMonitorClaim(selected.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] cursor-pointer"
                    >
                      <BellPlus className="w-3.5 h-3.5" />
                      <span>Monitor Claim (24h)</span>
                    </button>

                    <Link
                      to={`/agents?claimId=${selected.id}`}
                      className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline ml-auto"
                    >
                      Inspect 5 Agents
                    </Link>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold">Confidence Breakdown</h3>
                      <span className="font-mono text-lg font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                        {selected.confidence_breakdown.total}/100
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Evidence Relevance</span>
                        <span className="font-mono tabular-nums">{selected.confidence_breakdown.evidence_relevance}/25</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Heuristic Source Quality</span>
                        <span className="font-mono tabular-nums">{selected.confidence_breakdown.source_quality}/25</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Independent Corroboration</span>
                        <span className="font-mono tabular-nums">{selected.confidence_breakdown.independent_corroboration}/25</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Evidence Completeness</span>
                        <span className="font-mono tabular-nums">{selected.confidence_breakdown.evidence_completeness}/25</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Contradiction Penalty</span>
                        <span className="font-mono tabular-nums text-rose-500">
                          -{selected.confidence_breakdown.contradiction_penalty}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-semibold">Freshness & Decay Estimate</h3>
                      <div className="flex items-center gap-2">
                        <DecayStateLabel state={selected.freshness_breakdown.decay_state} />
                        <span className="font-mono text-lg font-semibold tabular-nums">
                          {selected.freshness_breakdown.total}/100
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Evidence Age</span>
                        <span className="font-mono tabular-nums">
                          {selected.freshness_breakdown.evidence_age_days !== null
                            ? `${selected.freshness_breakdown.evidence_age_days} days`
                            : 'Undated'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Domain Half-Life</span>
                        <span className="font-mono tabular-nums">{selected.freshness_breakdown.domain_half_life_days} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Volatility Profile</span>
                        <span className="capitalize">{selected.freshness_breakdown.volatility_level}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Estimated Review Date</span>
                        <span className="font-mono tabular-nums">
                          {new Date(selected.freshness_breakdown.estimated_next_review_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">{selected.freshness_breakdown.uncertainty_note}</p>
                  </div>
                </div>

                <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold">
                      Evidence DNA ({selected.evidence.length} source records)
                    </h3>
                    <span className="text-xs text-zinc-500 font-mono tabular-nums">
                      Independent clusters: {selected.duplication_analysis.independent_source_count}/{selected.duplication_analysis.total_source_count}
                    </span>
                  </div>

                  {selected.duplication_analysis.possible_anomaly && selected.duplication_analysis.anomaly_note && (
                    <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                      {selected.duplication_analysis.anomaly_note}
                    </div>
                  )}

                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {selected.evidence.map((ev) => (
                      <div key={ev.id} className="py-3.5 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1.5"
                          >
                            <span>{ev.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                          <span className="text-xs font-medium capitalize text-zinc-600 dark:text-zinc-300">
                            {ev.stance} · Heuristic {ev.credibility_score}/100
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                          <span>{ev.domain}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ev.source_type}</span>
                          <span aria-hidden="true">·</span>
                          <span>Published: {ev.published_date ? new Date(ev.published_date).toLocaleDateString() : 'Unavailable'}</span>
                          <span aria-hidden="true">·</span>
                          <span>Cluster: {ev.independence_cluster_id}</span>
                          {ev.is_near_duplicate_text && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-600 dark:text-amber-400">Near-duplicate text</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{ev.snippet}</p>
                        <p className="text-xs text-zinc-500">{ev.credibility_explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3">
                  <h3 className="font-display text-sm font-semibold">Verification & Fact Version Timeline</h3>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {selected.versions.map((ver) => (
                      <div key={ver.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <div className="font-medium">
                            Version {ver.version_number} · <ClaimStatusLabel status={ver.status} />
                          </div>
                          <div className="text-zinc-500">{ver.change_summary}</div>
                        </div>
                        <div className="text-right font-mono text-zinc-500 tabular-nums">
                          <div>Valid from: {new Date(ver.valid_from).toLocaleString()}</div>
                          <div>{ver.valid_until ? `Valid until: ${new Date(ver.valid_until).toLocaleString()}` : 'Current active version'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
