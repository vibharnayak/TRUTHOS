import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ClaimStatusLabel } from '../components/StatusIndicator';
import { apiFetch } from '../services/api';
import type { AlertRecord, ClaimDetailRecord, MonitoringScheduleRecord } from '../types/truthos';

interface MonitoringExecution {
  id: string;
  claim_id: string;
  claim_text: string;
  status: string;
  previous_status: string | null;
  new_status: string | null;
  change_detected: number;
  notes: string | null;
  executed_at: string;
}

export function MonitoringCenterPage() {
  const [schedules, setSchedules] = useState<MonitoringScheduleRecord[]>([]);
  const [executions, setExecutions] = useState<MonitoringExecution[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [claims, setClaims] = useState<ClaimDetailRecord[]>([]);

  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [frequencyHours, setFrequencyHours] = useState(24);
  const [freshnessThreshold, setFreshnessThreshold] = useState(60);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [monRes, alertRes, claimRes] = await Promise.all([
        apiFetch<{ schedules: MonitoringScheduleRecord[]; executions: MonitoringExecution[] }>('/monitoring'),
        apiFetch<{ alerts: AlertRecord[] }>('/monitoring/alerts'),
        apiFetch<{ claims: ClaimDetailRecord[] }>('/claims?limit=100'),
      ]);
      setSchedules(monRes.schedules);
      setExecutions(monRes.executions);
      setAlerts(alertRes.alerts);
      setClaims(claimRes.claims);
      if (!selectedClaimId && claimRes.claims[0]) {
        setSelectedClaimId(claimRes.claims[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring data.');
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimId) return;
    setError(null);
    try {
      await apiFetch('/monitoring', {
        method: 'POST',
        body: JSON.stringify({
          claim_id: selectedClaimId,
          frequency_hours: frequencyHours,
          freshness_threshold: freshnessThreshold,
          alert_on_change: true,
          alert_on_stale: true,
        }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create schedule.');
    }
  };

  const handleToggleStatus = async (s: MonitoringScheduleRecord) => {
    const nextStatus = s.status === 'active' ? 'paused' : 'active';
    await apiFetch(`/monitoring/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadAll();
  };

  const handleRunNow = async (scheduleId: string) => {
    setBusyId(scheduleId);
    setError(null);
    try {
      await apiFetch(`/monitoring/${scheduleId}/run-now`, { method: 'POST' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual monitoring run failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    await apiFetch(`/monitoring/${scheduleId}`, { method: 'DELETE' });
    await loadAll();
  };

  const handleMarkRead = async (alertId: string) => {
    await apiFetch(`/monitoring/alerts/${alertId}/read`, { method: 'PATCH' });
    await loadAll();
  };

  return (
    <AppShell
      title="Autonomous Monitoring Center"
      subtitle="Persistent backend scheduled reverification jobs and in-app change alerts"
    >
      <div className="space-y-8">
        {error && (
          <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        <form
          onSubmit={handleCreateSchedule}
          className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] grid md:grid-cols-12 gap-4 items-end"
        >
          <div className="md:col-span-6 space-y-1">
            <label htmlFor="mon-claim" className="block text-xs font-medium text-zinc-500">
              Claim to Monitor
            </label>
            <select
              id="mon-claim"
              value={selectedClaimId}
              onChange={(e) => setSelectedClaimId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-xs focus:outline-none focus:border-teal-500"
            >
              {claims.length === 0 && <option value="">No claims available</option>}
              {claims.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.status}] {c.normalized_claim}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label htmlFor="mon-freq" className="block text-xs font-medium text-zinc-500">
              Frequency (Hours)
            </label>
            <input
              id="mon-freq"
              type="number"
              min={1}
              max={720}
              value={frequencyHours}
              onChange={(e) => setFrequencyHours(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-xs font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label htmlFor="mon-thresh" className="block text-xs font-medium text-zinc-500">
              Freshness Alert &lt;
            </label>
            <input
              id="mon-thresh"
              type="number"
              min={10}
              max={95}
              value={freshnessThreshold}
              onChange={(e) => setFreshnessThreshold(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-xs font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!selectedClaimId}
              className="w-full py-2 px-4 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 cursor-pointer"
            >
              Save Schedule
            </button>
          </div>
        </form>

        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Monitored Claims ({schedules.length})</h2>
            <span className="text-xs text-zinc-500">Runs persistently via backend worker</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 text-left">
                  <th className="py-3 px-4 font-medium">Claim</th>
                  <th className="py-3 px-4 font-medium">Current Status</th>
                  <th className="py-3 px-4 font-medium">Cadence</th>
                  <th className="py-3 px-4 font-medium">Next Run</th>
                  <th className="py-3 px-4 font-medium text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 px-4 text-xs max-w-md">
                      <Link to={`/claims/${s.claim_id}`} className="font-medium hover:text-teal-500">
                        {s.claim_text}
                      </Link>
                      <div className="text-zinc-500 font-mono">
                        State: {s.status} · Threshold &lt; {s.freshness_threshold}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <ClaimStatusLabel status={s.claim_status} />
                    </td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums">Every {s.frequency_hours}h</td>
                    <td className="py-3 px-4 text-xs font-mono text-zinc-500 whitespace-nowrap">
                      {new Date(s.next_run_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRunNow(s.id)}
                          disabled={busyId === s.id}
                          className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] cursor-pointer"
                          title="Run reverification now"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${busyId === s.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(s)}
                          className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] cursor-pointer"
                          title={s.status === 'active' ? 'Pause' : 'Resume'}
                        >
                          {s.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          title="Delete schedule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid lg:grid-cols-2 gap-6">
          <section className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
            <h2 className="font-display text-sm font-semibold">In-App Monitoring Alerts ({alerts.length})</h2>
            {alerts.length === 0 ? (
              <p className="text-xs text-zinc-500">No monitoring alerts generated yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`py-3.5 text-xs space-y-1 ${a.is_read ? 'opacity-65' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">{a.title}</span>
                      {!a.is_read && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(a.id)}
                          className="text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-300">{a.message}</p>
                    <div className="font-mono text-zinc-500">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
            <h2 className="font-display text-sm font-semibold">Background Execution Log</h2>
            {executions.length === 0 ? (
              <p className="text-xs text-zinc-500">No scheduled executions recorded yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {executions.map((ex) => (
                  <div key={ex.id} className="py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate max-w-xs">{ex.claim_text}</span>
                      <span className="font-mono text-zinc-500">{ex.status}</span>
                    </div>
                    <div className="text-zinc-500">{ex.notes}</div>
                    <div className="font-mono text-zinc-500">{new Date(ex.executed_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
