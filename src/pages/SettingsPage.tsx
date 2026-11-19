import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';

interface SystemStatus {
  tavily_configured: boolean;
  external_api_policy: string;
  user_role: string;
  tavily_query_stats: {
    total_queries: number;
    cache_hits: number;
    error_count: number;
  };
}

export function SettingsPage() {
  const { user, theme, setTheme, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light'>(theme);
  const [threshold, setThreshold] = useState(user?.default_freshness_threshold || 60);
  const [freqHours, setFreqHours] = useState(user?.default_monitoring_frequency_hours || 24);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedTheme(theme);
  }, [theme]);

  useEffect(() => {
    apiFetch<SystemStatus>('/settings/system')
      .then(setSystemStatus)
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await apiFetch('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: fullName,
          theme_preference: selectedTheme,
          default_freshness_threshold: threshold,
          default_monitoring_frequency_hours: freqHours,
        }),
      });
      setTheme(selectedTheme);
      await refreshUser();
      setSavedMsg('Preferences saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Settings & API Status" subtitle="Analyst profile, theme preference, monitoring thresholds, and backend Tavily status">
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-5"
        >
          <h2 className="font-display text-base font-semibold">Profile & Monitoring Preferences</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="set-name" className="block text-xs font-medium text-zinc-500">
                Full Name
              </label>
              <input
                id="set-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="set-theme" className="block text-xs font-medium text-zinc-500">
                Interface Theme
              </label>
              <select
                id="set-theme"
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value === 'light' ? 'light' : 'dark')}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm focus:outline-none focus:border-teal-500"
              >
                <option value="dark">Carbon Obsidian (Dark Default)</option>
                <option value="light">Alabaster Editorial (Light)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="set-thresh" className="block text-xs font-medium text-zinc-500">
                Default Freshness Alert Threshold (0–100)
              </label>
              <input
                id="set-thresh"
                type="number"
                min={10}
                max={95}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="set-freq" className="block text-xs font-medium text-zinc-500">
                Default Monitoring Cadence (Hours)
              </label>
              <input
                id="set-freq"
                type="number"
                min={1}
                max={720}
                value={freqHours}
                onChange={(e) => setFreqHours(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {savedMsg && (
            <div className="p-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-200">
              {savedMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </form>

        <div className="lg:col-span-5 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
          <h2 className="font-display text-base font-semibold">API Configuration Status</h2>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Tavily API Key (`TAVILY_API_KEY`)</span>
              <span className={systemStatus?.tavily_configured ? 'text-emerald-500 font-medium' : 'text-amber-500 font-medium'}>
                {systemStatus?.tavily_configured ? 'Configured on Server' : 'Not Configured'}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">External Provider Policy</span>
              <span>{systemStatus?.external_api_policy || 'Tavily Search API Only'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Account Role</span>
              <span className="capitalize font-mono">{systemStatus?.user_role || user?.role}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500">Total Tavily Queries</span>
              <span className="font-mono tabular-nums">{systemStatus?.tavily_query_stats.total_queries ?? 0}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-zinc-500">Cache Hits / Errors</span>
              <span className="font-mono tabular-nums">
                {systemStatus?.tavily_query_stats.cache_hits ?? 0} / {systemStatus?.tavily_query_stats.error_count ?? 0}
              </span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            API keys are stored exclusively on the backend server via environment variables and never transmitted to browser clients.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
