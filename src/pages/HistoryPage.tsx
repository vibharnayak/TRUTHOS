import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { apiFetch } from '../services/api';
import type { VerificationJobSummary } from '../types/truthos';

interface SearchLogRow {
  id: string;
  query: string;
  search_depth: string;
  status_code: number | null;
  result_count: number;
  cache_hit: number;
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

interface ChangeRow {
  id: string;
  normalized_claim: string;
  changes_detected: string;
  recommended_action: string;
  detected_at: string;
}

export function HistoryPage() {
  const [tab, setTab] = useState<'sessions' | 'queries' | 'changes'>('sessions');
  const [jobs, setJobs] = useState<VerificationJobSummary[]>([]);
  const [logs, setLogs] = useState<SearchLogRow[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    apiFetch<{ jobs: VerificationJobSummary[]; search_logs: SearchLogRow[]; changes: ChangeRow[] }>('/history')
      .then((res) => {
        setJobs(res.jobs);
        setLogs(res.search_logs);
        setChanges(res.changes);
      })
      .catch(() => {});
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredJobs = useMemo(() => {
    if (!normalizedQuery) return jobs;
    return jobs.filter((j) =>
      [j.title, j.source_type, j.status, j.error_message, j.raw_text].some(
        (field) => field && field.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [jobs, normalizedQuery]);

  const filteredLogs = useMemo(() => {
    if (!normalizedQuery) return logs;
    return logs.filter((l) =>
      [
        l.query,
        l.search_depth,
        l.error_message,
        l.status_code !== null ? String(l.status_code) : '',
        l.cache_hit ? 'hit' : 'live',
      ].some((field) => field && field.toLowerCase().includes(normalizedQuery)),
    );
  }, [logs, normalizedQuery]);

  const filteredChanges = useMemo(() => {
    if (!normalizedQuery) return changes;
    return changes.filter((c) =>
      [c.normalized_claim, c.changes_detected, c.recommended_action].some(
        (field) => field && field.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [changes, normalizedQuery]);

  return (
    <AppShell title="Audit & Verification History" subtitle="Past verification sessions, Tavily search query logs, and historical fact transitions">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800 w-fit">
            {[
              { id: 'sessions', label: `Sessions (${filteredJobs.length})` },
              { id: 'queries', label: `Tavily Query Logs (${filteredLogs.length})` },
              { id: 'changes', label: `Fact Changes (${filteredChanges.length})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  tab === t.id
                    ? 'bg-teal-600 text-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions, queries, or claims..."
              aria-label="Search verification history"
              className="w-full pl-9 pr-9 py-2 rounded-lg text-xs bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {tab === 'sessions' && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] overflow-x-auto">
            {filteredJobs.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 flex items-center justify-between gap-4">
                <span>
                  {normalizedQuery
                    ? `No verification sessions match "${searchQuery.trim()}".`
                    : 'No verification sessions recorded yet.'}
                </span>
                {normalizedQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                    <th className="py-3 px-4 font-medium">Submission Title</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Claims</th>
                    <th className="py-3 px-4 font-medium text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredJobs.map((j) => (
                    <tr key={j.id}>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-medium">{j.title}</div>
                        {j.error_message && <div className="text-rose-500">{j.error_message}</div>}
                      </td>
                      <td className="py-3 px-4 text-xs">{j.source_type}</td>
                      <td className="py-3 px-4 text-xs capitalize">{j.status}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{j.claim_count}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(j.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'queries' && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 flex items-center justify-between gap-4">
                <span>
                  {normalizedQuery
                    ? `No Tavily query logs match "${searchQuery.trim()}".`
                    : 'No Tavily search query logs recorded yet.'}
                </span>
                {normalizedQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                    <th className="py-3 px-4 font-medium">Query</th>
                    <th className="py-3 px-4 font-medium">Depth</th>
                    <th className="py-3 px-4 font-medium text-right">HTTP</th>
                    <th className="py-3 px-4 font-medium text-right">Results</th>
                    <th className="py-3 px-4 font-medium text-right">Cache</th>
                    <th className="py-3 px-4 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-3 px-4 text-xs font-mono max-w-md truncate">
                        {l.query}
                        {l.error_message && <div className="text-rose-500 font-sans">{l.error_message}</div>}
                      </td>
                      <td className="py-3 px-4 text-xs">{l.search_depth}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">{l.status_code ?? '-'}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{l.result_count}</td>
                      <td className="py-3 px-4 text-right text-xs">{l.cache_hit ? 'Hit' : 'Live'}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{l.duration_ms} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'changes' && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredChanges.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500 flex items-center justify-between gap-4">
                <span>
                  {normalizedQuery
                    ? `No historical fact transitions match "${searchQuery.trim()}".`
                    : 'No historical fact transitions recorded yet.'}
                </span>
                {normalizedQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              filteredChanges.map((c) => (
                <div key={c.id} className="p-4 text-xs flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">{c.normalized_claim}</div>
                    <div className="text-zinc-500">{c.changes_detected}</div>
                  </div>
                  <div className="text-right font-mono text-zinc-500">
                    <div>{c.recommended_action}</div>
                    <div>{new Date(c.detected_at).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
