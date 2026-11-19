import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ClaimStatusLabel } from '../components/StatusIndicator';
import { apiFetch } from '../services/api';
import type { ClaimStatus, MemoryChangeComparison } from '../types/truthos';

interface MemoryClaimRow {
  id: string;
  normalized_claim: string;
  subject: string;
  predicate: string;
  object_value: string;
  status: ClaimStatus;
  confidence_score: number;
  freshness_score: number;
  version_count: number;
  is_sample_data: number;
  updated_at: string;
}

interface DependencyRow {
  id: string;
  claim_id: string;
  dependent_record_id: string;
  dependent_record_type: string;
  dependent_title: string;
  impact_note: string;
  reverification_status: string;
  normalized_claim: string;
  claim_status: ClaimStatus;
}

export function SelfHealingMemoryPage() {
  const [claims, setClaims] = useState<MemoryClaimRow[]>([]);
  const [changes, setChanges] = useState<(MemoryChangeComparison & { claim_text?: string })[]>([]);
  const [dependencies, setDependencies] = useState<DependencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMemory = async () => {
    setLoading(true);
    try {
      const [memRes, chgRes, depRes] = await Promise.all([
        apiFetch<{ claims: MemoryClaimRow[] }>('/memory'),
        apiFetch<{ changes: (MemoryChangeComparison & { claim_text?: string })[] }>('/memory/changes'),
        apiFetch<{ dependencies: DependencyRow[] }>('/memory/dependencies'),
      ]);
      setClaims(memRes.claims);
      setChanges(chgRes.changes);
      setDependencies(depRes.dependencies);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge memory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMemory();
  }, []);

  const handleReverify = async (claimId: string) => {
    setBusyId(claimId);
    setError(null);
    try {
      await apiFetch('/memory/reverify', {
        method: 'POST',
        body: JSON.stringify({ claim_id: claimId }),
      });
      await loadMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-verification failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell
      title="Self-Healing Knowledge Memory"
      subtitle="Before-and-After fact change intelligence, preserved historical versions, and dependent answer impact mapping"
    >
      <div className="space-y-8">
        {error && (
          <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Before-and-After Change Intelligence</h2>
            <span className="text-xs text-zinc-500 font-mono tabular-nums">{changes.length} change events</span>
          </div>

          {!loading && changes.length === 0 ? (
            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] text-sm text-zinc-500">
              No fact changes recorded yet. When re-verifying a claim detects a status or factual transition, TRUTHOS preserves the previous version and generates a Before-and-After report here without silently overwriting stored answers.
            </div>
          ) : (
            <div className="grid gap-4">
              {changes.map((chg) => (
                <div
                  key={chg.id}
                  className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/claims/${chg.claim_id}`} className="font-display text-sm font-semibold hover:text-teal-500">
                      {chg.claim_text || chg.changes_detected}
                    </Link>
                    <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                      Action: {chg.recommended_action} · {new Date(chg.detected_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 py-3.5 border-y border-zinc-100 dark:border-zinc-800 text-xs">
                    <div className="space-y-1">
                      <div className="font-semibold text-zinc-500">Previous Information</div>
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{chg.previous_info}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-amber-600 dark:text-amber-400">New Information</div>
                      <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{chg.new_info}</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-zinc-500 block">Changes Detected</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{chg.changes_detected}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-500 block">Why It Changed</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{chg.why_changed}</span>
                    </div>
                  </div>

                  {chg.affected_records.length > 0 && (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs space-y-1">
                      <div className="font-semibold text-zinc-500">Impacted Dependent Knowledge Records</div>
                      {chg.affected_records.map((rec) => (
                        <div key={rec.id} className="flex items-center justify-between">
                          <span>
                            {rec.title} ({rec.record_type})
                          </span>
                          <span className="font-mono text-amber-600 dark:text-amber-400">{rec.reverification_status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {chg.evidence_urls.length > 0 && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      {chg.evidence_urls.map((u, idx) => (
                        <a
                          key={idx}
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Source {idx + 1}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Knowledge Dependency Map</h2>
            <span className="text-xs text-zinc-500 font-mono tabular-nums">{dependencies.length} linkages</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                  <th className="py-3 px-4 font-medium">Dependent Answer / Report</th>
                  <th className="py-3 px-4 font-medium">Underlying Claim</th>
                  <th className="py-3 px-4 font-medium">Claim Status</th>
                  <th className="py-3 px-4 font-medium">Review State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {dependencies.map((d) => (
                  <tr key={d.id}>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-medium">{d.dependent_title}</div>
                      <div className="text-zinc-500">{d.dependent_record_type}</div>
                    </td>
                    <td className="py-3 px-4 text-xs max-w-md">
                      <Link to={`/claims/${d.claim_id}`} className="hover:text-teal-500">
                        {d.normalized_claim}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <ClaimStatusLabel status={d.claim_status} />
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">
                      <span
                        className={
                          d.reverification_status === 'needs_review'
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {d.reverification_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Stored Fact Memory & Version Counts</h2>
            <span className="text-xs text-zinc-500 font-mono tabular-nums">{claims.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                  <th className="py-3 px-4 font-medium">Claim</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Versions</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 px-4 max-w-lg text-xs">
                      <Link to={`/claims/${c.id}`} className="font-medium hover:text-teal-500">
                        {c.normalized_claim}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <ClaimStatusLabel status={c.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">v{c.version_count}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleReverify(c.id)}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${busyId === c.id ? 'animate-spin' : ''}`} />
                        <span>{busyId === c.id ? 'Updating...' : 'Reverify Now'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
