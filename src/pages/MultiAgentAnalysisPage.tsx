import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ClaimStatusLabel } from '../components/StatusIndicator';
import { apiFetch } from '../services/api';
import type { ClaimDetailRecord } from '../types/truthos';

export function MultiAgentAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('claimId');

  const [claims, setClaims] = useState<ClaimDetailRecord[]>([]);
  const [selected, setSelected] = useState<ClaimDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ claims: ClaimDetailRecord[] }>('/claims?limit=50')
      .then((res) => {
        setClaims(res.claims);
        const target = requestedId ? res.claims.find((c) => c.id === requestedId) : res.claims[0];
        setSelected(target ?? res.claims[0] ?? null);
      })
      .finally(() => setLoading(false));
  }, [requestedId]);

  const handleSelectClaim = (claimId: string) => {
    const found = claims.find((c) => c.id === claimId) || null;
    setSelected(found);
    setSearchParams({ claimId });
  };

  return (
    <AppShell
      title="Multi-Agent Verification Pipeline"
      subtitle="Transparent execution trace across Researcher, Skeptic, Temporal Intelligence, Evidence Analyst, and Judge modules"
    >
      {loading ? (
        <div className="h-48 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] animate-pulse" />
      ) : claims.length === 0 ? (
        <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3">
          <div className="font-display text-base font-semibold">No agent execution logs available</div>
          <p className="text-sm text-zinc-500">Run a verification session in Verification Studio to inspect module traces.</p>
          <Link to="/studio" className="inline-block text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
            Go to Verification Studio
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-[260px]">
              <label htmlFor="agent-claim-select" className="block text-xs font-medium text-zinc-500">
                Select Verified Claim
              </label>
              <select
                id="agent-claim-select"
                value={selected?.id || ''}
                onChange={(e) => handleSelectClaim(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm focus:outline-none focus:border-teal-500"
              >
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.status}] {c.normalized_claim}
                  </option>
                ))}
              </select>
            </div>
            {selected && (
              <div className="flex items-center gap-4">
                <ClaimStatusLabel status={selected.status} />
                <Link to={`/claims/${selected.id}`} className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
                  Full Claim Intelligence
                </Link>
              </div>
            )}
          </div>

          {selected && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] divide-y divide-zinc-200 dark:divide-zinc-800">
              {selected.agents.map((agent, index) => (
                <div key={agent.id} className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-teal-600 dark:text-teal-400 tabular-nums">
                        0{index + 1}.
                      </span>
                      <h3 className="font-display text-base font-semibold">{agent.agent_name}</h3>
                    </div>
                    <div className="text-xs font-mono text-zinc-500 tabular-nums flex items-center gap-3">
                      <span className={agent.status === 'warning' ? 'text-amber-500' : 'text-emerald-500'}>
                        {agent.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{agent.duration_ms} ms</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(agent.executed_at).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Input: </span>
                    {agent.input_summary}
                  </div>

                  {agent.queries_executed.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-zinc-500">Tavily Search Queries Executed</div>
                      <div className="space-y-1">
                        {agent.queries_executed.map((q, qi) => (
                          <div
                            key={qi}
                            className="px-3 py-1.5 rounded bg-[#F7F7F5] dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-700 dark:text-zinc-300"
                          >
                            {q}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-zinc-500">Structured Findings</div>
                    <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300 list-disc pl-4">
                      {agent.findings.map((f, fi) => (
                        <li key={fi}>{f}</li>
                      ))}
                    </ul>
                  </div>

                  {agent.warnings.length > 0 && (
                    <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
                      {agent.warnings.join(' ')}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
                    <span className="font-medium text-zinc-500">Module Output: </span>
                    <span className="text-zinc-800 dark:text-zinc-200">{agent.output_summary}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
