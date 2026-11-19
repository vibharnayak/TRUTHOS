import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import type { DashboardAnalytics, DecayState } from '../types/truthos';

const DECAY_BAR_COLORS: Record<DecayState, string> = {
  Fresh: '#10b981',
  Aging: '#14b8a6',
  'At Risk': '#f59e0b',
  Stale: '#f43f5e',
};

export function DashboardPage() {
  const { theme } = useAuth();
  const isDark = theme === 'dark';
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<DashboardAnalytics>('/analytics/dashboard');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const handleLoadSample = async () => {
    setLoadingSample(true);
    try {
      await apiFetch('/sample-workspace', { method: 'POST' });
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sample workspace.');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleMarkAlertRead = async (alertId: string) => {
    try {
      await apiFetch(`/monitoring/alerts/${alertId}/read`, { method: 'PATCH' });
      await loadAnalytics();
    } catch {
      // ignore
    }
  };

  return (
    <AppShell title="Intelligence Overview" subtitle="Real database-derived verification telemetry and knowledge decay state">
      {loading && (
        <div className="h-28 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] animate-pulse" />
      )}

      {error && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {!loading && data && data.total_claims === 0 && (
        <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
          <h2 className="font-display text-xl font-semibold">No verified claims stored yet</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Submit a paragraph, news report, or AI-generated answer in the Verification Studio to extract claims and verify them against live Tavily web evidence—or load the clearly labeled Development Sample Workspace to explore the Temporal Knowledge Graph, Decay Monitor, and Self-Healing Memory immediately.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/studio"
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 transition-colors"
            >
              Verify First Document
            </Link>
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={loadingSample}
              className="px-4 py-2.5 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              {loadingSample ? 'Loading Sample Data...' : 'Load Development Sample Workspace'}
            </button>
          </div>
        </div>
      )}

      {!loading && data && data.total_claims > 0 && (
        <div className="space-y-8">
          {/* Unified Hairline-Divided KPI Ledger */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-zinc-800">
            {[
              {
                label: 'Total Claims Analyzed',
                value: data.total_claims,
                sub: `${data.verified_claims} verified`,
                tone: 'text-zinc-900 dark:text-white',
              },
              {
                label: 'Verified Claims',
                value: data.verified_claims,
                sub: `Avg confidence ${data.average_confidence}/100`,
                tone: 'text-emerald-700 dark:text-emerald-400',
              },
              {
                label: 'Outdated & Conflicting',
                value: data.outdated_claims + data.conflicting_claims,
                sub: `${data.outdated_claims} outdated · ${data.conflicting_claims} conflicting`,
                tone: 'text-amber-700 dark:text-amber-400',
              },
              {
                label: 'Unverified & Insufficient',
                value: data.unverified_claims + data.insufficient_claims,
                sub: `Avg freshness ${data.average_freshness}/100`,
                tone: 'text-zinc-700 dark:text-zinc-300',
              },
            ].map((kpi) => (
              <div key={kpi.label} className="p-6 space-y-1.5">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{kpi.label}</div>
                <div className={`font-mono text-2xl font-semibold tabular-nums ${kpi.tone}`}>{kpi.value}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold">Knowledge Decay Distribution</h2>
                <Link to="/decay" className="text-xs text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap">
                  Inspect Decay Monitor
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                {(['Fresh', 'Aging', 'At Risk', 'Stale'] as DecayState[]).map((state) => (
                  <span key={state} className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ backgroundColor: DECAY_BAR_COLORS[state] }}
                    />
                    <span>{state}</span>
                  </span>
                ))}
              </div>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.decay_distribution} barSize={42}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#27272a' : '#e4e4e7'}
                    />
                    <XAxis
                      dataKey="state"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#a1a1aa' : '#52525b' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#a1a1aa' : '#52525b' }}
                    />
                    <Tooltip
                      cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                      contentStyle={{
                        backgroundColor: isDark ? '#13151A' : '#ffffff',
                        borderColor: isDark ? '#27272a' : '#e4e4e7',
                        borderRadius: '8px',
                        color: isDark ? '#fafafa' : '#18181b',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="count" name="Claims" radius={[6, 6, 0, 0]}>
                      {data.decay_distribution.map((entry) => (
                        <Cell
                          key={entry.state}
                          fill={DECAY_BAR_COLORS[entry.state] ?? '#14b8a6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold">Domain Confidence vs Freshness</h2>
                <Link to="/claims" className="text-xs text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap">
                  Browse All Claims
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  <span>Avg Confidence</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                  <span>Avg Freshness</span>
                </span>
              </div>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.domain_breakdown}>
                    <defs>
                      <linearGradient id="confFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="freshFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#27272a' : '#e4e4e7'}
                    />
                    <XAxis
                      dataKey="domain"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#52525b' }}
                      tickFormatter={(val: string) => (val.length > 11 ? `${val.slice(0, 10)}…` : val)}
                    />
                    <YAxis
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: isDark ? '#a1a1aa' : '#52525b' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#13151A' : '#ffffff',
                        borderColor: isDark ? '#27272a' : '#e4e4e7',
                        borderRadius: '8px',
                        color: isDark ? '#fafafa' : '#18181b',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="avg_confidence"
                      name="Avg Confidence"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#confFill)"
                      dot={{ r: 3, fill: '#10b981' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="avg_freshness"
                      name="Avg Freshness"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#freshFill)"
                      dot={{ r: 3, fill: '#f59e0b' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Activity & Alerts */}
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Recent Verification Sessions</h2>
                <Link to="/history" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
                  Full History
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                      <th className="py-2 pr-3 font-medium">Submission</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium text-right">Claims</th>
                      <th className="py-2 pl-3 font-medium text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                    {data.recent_jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium truncate max-w-xs">{job.title}</div>
                          {job.is_sample_data ? (
                            <div className="text-xs text-amber-600 dark:text-amber-400">Development Sample Data</div>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-3 text-xs capitalize">{job.status}</td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-right">{job.claim_count}</td>
                        <td className="py-2.5 pl-3 font-mono text-xs text-zinc-500 text-right whitespace-nowrap">
                          {new Date(job.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-5 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Unread Monitoring Alerts</h2>
                <Link to="/monitoring" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
                  Monitoring Center
                </Link>
              </div>
              {data.unread_alerts.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 py-4">
                  No unread alerts. Save claims in Claim Intelligence to monitor them continuously.
                </p>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {data.unread_alerts.map((alert) => (
                    <div key={alert.id} className="py-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">{alert.title}</div>
                        <button
                          type="button"
                          onClick={() => handleMarkAlertRead(alert.id)}
                          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white whitespace-nowrap cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{alert.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
