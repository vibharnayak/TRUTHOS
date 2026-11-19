import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ClaimStatusLabel, DecayStateLabel } from '../components/StatusIndicator';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import type { ClaimDetailRecord, DashboardAnalytics, DecayState } from '../types/truthos';

const DECAY_STATE_COLORS: Record<DecayState, string> = {
  Fresh: '#10b981',
  Aging: '#14b8a6',
  'At Risk': '#f59e0b',
  Stale: '#f43f5e',
};

function getFreshnessBarColor(score: number): string {
  if (score >= 75) return '#10b981';
  if (score >= 55) return '#14b8a6';
  if (score >= 35) return '#f59e0b';
  return '#f43f5e';
}

export function DecayMonitorPage() {
  const { theme } = useAuth();
  const isDark = theme === 'dark';

  const [claims, setClaims] = useState<ClaimDetailRecord[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, aRes] = await Promise.all([
        apiFetch<{ claims: ClaimDetailRecord[] }>('/claims?limit=100'),
        apiFetch<DashboardAnalytics>('/analytics/dashboard'),
      ]);
      const sorted = [...cRes.claims].sort((a, b) => a.freshness_score - b.freshness_score);
      setClaims(sorted);
      setAnalytics(aRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load decay telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleReverify = async (claimId: string) => {
    setBusyId(claimId);
    setError(null);
    try {
      await apiFetch('/memory/reverify', {
        method: 'POST',
        body: JSON.stringify({ claim_id: claimId }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-verification failed.');
    } finally {
      setBusyId(null);
    }
  };

  const sortedDomains = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.domain_breakdown].sort((a, b) => a.avg_freshness - b.avg_freshness);
  }, [analytics]);

  const totalLifecycleCount = useMemo(() => {
    if (!analytics) return 0;
    return analytics.decay_distribution.reduce((sum, item) => sum + item.count, 0);
  }, [analytics]);

  return (
    <AppShell
      title="Predictive Knowledge Decay Monitor"
      subtitle="Category half-lives, staleness risk projections, and review schedules with explicit uncertainty"
    >
      <div className="space-y-6">
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] text-xs text-zinc-600 dark:text-zinc-300">
          Freshness scores are probabilistic estimates derived from source publication age, domain volatility half-lives, and historical change frequency. Predictive estimates indicate when information should be reviewed—not guaranteed inaccuracy.
        </div>

        {error && (
          <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {!loading && analytics && (
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Donut Lifecycle Ring */}
            <div className="lg:col-span-5 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold">Freshness Lifecycle Ring</h2>
                <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                  {totalLifecycleCount} tracked
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <div className="relative h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.decay_distribution.filter((d) => d.count > 0)}
                        dataKey="count"
                        nameKey="state"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={82}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {analytics.decay_distribution
                          .filter((d) => d.count > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.state}
                              fill={DECAY_STATE_COLORS[entry.state] ?? '#14b8a6'}
                            />
                          ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#13151A' : '#ffffff',
                          borderColor: isDark ? '#27272a' : '#e4e4e7',
                          borderRadius: '8px',
                          color: isDark ? '#fafafa' : '#18181b',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-white">
                      {analytics.average_freshness}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      Avg Freshness
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {analytics.decay_distribution.map((item) => {
                    const pct = totalLifecycleCount
                      ? Math.round((item.count / totalLifecycleCount) * 100)
                      : 0;
                    return (
                      <div
                        key={item.state}
                        className="flex items-center justify-between gap-3 text-xs py-1 border-b border-zinc-100 dark:border-zinc-800/70 last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: DECAY_STATE_COLORS[item.state] }}
                          />
                          <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                            {item.state}
                          </span>
                        </div>
                        <div className="font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          <span className="text-zinc-900 dark:text-zinc-100 font-medium">{item.count}</span>{' '}
                          <span className="text-[11px]">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Domain Volatility Horizontal Bar Chart */}
            <div className="lg:col-span-7 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold">Domain Freshness & Review Threshold</h2>
                <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  60/100 review threshold
                </span>
              </div>

              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sortedDomains}
                    layout="vertical"
                    margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
                    barSize={16}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke={isDark ? '#27272a' : '#e4e4e7'}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: isDark ? '#a1a1aa' : '#52525b' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="domain"
                      width={136}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: isDark ? '#d4d4d8' : '#27272a' }}
                      tickFormatter={(val: string) => (val.length > 18 ? `${val.slice(0, 17)}…` : val)}
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
                    <ReferenceLine
                      x={60}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    <Bar dataKey="avg_freshness" name="Avg Freshness" radius={[0, 6, 6, 0]}>
                      {sortedDomains.map((entry) => (
                        <Cell
                          key={entry.domain}
                          fill={getFreshnessBarColor(entry.avg_freshness)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Claims Ordered by Staleness Risk</h2>
            <span className="text-xs text-zinc-500 font-mono tabular-nums">{claims.length} tracked</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                  <th className="py-3 px-4 font-medium">Claim</th>
                  <th className="py-3 px-4 font-medium">Domain / Half-Life</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Freshness</th>
                  <th className="py-3 px-4 font-medium">Next Review</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {claims.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02]">
                    <td className="py-3 px-4 max-w-md">
                      <Link to={`/claims/${c.id}`} className="font-medium hover:text-teal-500 block truncate">
                        {c.normalized_claim}
                      </Link>
                      <div className="text-xs text-zinc-500 truncate">{c.freshness_breakdown.reasons[0]}</div>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <div>{c.domain}</div>
                      <div className="text-zinc-500 font-mono tabular-nums">
                        {c.freshness_breakdown.domain_half_life_days}d half-life
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <ClaimStatusLabel status={c.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-mono tabular-nums">
                      <div>{c.freshness_score}/100</div>
                      <DecayStateLabel state={c.decay_state} />
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums whitespace-nowrap text-zinc-500">
                      {new Date(c.freshness_breakdown.estimated_next_review_date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleReverify(c.id)}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${busyId === c.id ? 'animate-spin' : ''}`} />
                        <span>{busyId === c.id ? 'Checking...' : 'Re-verify'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
