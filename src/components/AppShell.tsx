import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Bell,
  Clock,
  Cpu,
  Database,
  FileSearch,
  GitBranch,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import type { AlertRecord, UserProfile } from '../types/truthos';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const AVATAR_PALETTE = [
  'bg-teal-600',
  'bg-emerald-600',
  'bg-sky-600',
  'bg-indigo-600',
  'bg-amber-600',
  'bg-rose-600',
];

function getUserInitials(user: UserProfile | null): string {
  const name = user?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user?.email?.trim();
  if (email) {
    return email[0].toUpperCase();
  }
  return 'U';
}

function getAvatarBg(user: UserProfile | null): string {
  const seed = user?.email || user?.full_name || 'truthos';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function UserProfileAvatarMenu({
  user,
  onLogout,
}: {
  user: UserProfile | null;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const initials = getUserInitials(user);
  const avatarBg = getAvatarBg(user);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Account menu for ${user?.full_name || user?.email || 'signed-in user'}`}
        aria-expanded={open}
        title={`${user?.full_name || 'Signed-in User'}${user?.email ? ` (${user.email})` : ''}`}
        className={`w-9 h-9 rounded-full ${avatarBg} text-white text-xs font-semibold tracking-wide flex items-center justify-center ring-2 ring-teal-500/35 hover:ring-teal-500 transition-all cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500`}
      >
        {initials}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Account details"
          className="absolute right-0 top-11 w-72 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] shadow-xl z-50 p-4 space-y-4"
        >
          <div className="text-center space-y-2">
            <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
              {user?.email || 'analyst@truthos.local'}
            </div>
            <div
              className={`w-14 h-14 mx-auto rounded-full ${avatarBg} text-white text-lg font-semibold flex items-center justify-center ring-2 ring-teal-500/30`}
            >
              {initials}
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                {user?.full_name || 'Analyst'}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize">
                {user?.role || 'analyst'} workspace
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 flex items-center gap-2">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void onLogout();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Verification',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/studio', label: 'Verification Studio', icon: ShieldCheck },
      { to: '/claims', label: 'Claim Intelligence', icon: FileSearch },
      { to: '/agents', label: 'Multi-Agent Analysis', icon: Cpu },
    ],
  },
  {
    label: 'Temporal Knowledge',
    items: [
      { to: '/graph', label: 'Knowledge Graph', icon: GitBranch },
      { to: '/decay', label: 'Knowledge Decay', icon: Clock },
      { to: '/memory', label: 'Self-Healing Memory', icon: Database },
      { to: '/evidence', label: 'Evidence Explorer', icon: Activity },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/monitoring', label: 'Monitoring Center', icon: Bell },
      { to: '/history', label: 'History', icon: History },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { user, tavilyConfigured, theme, setTheme, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    apiFetch<{ alerts: AlertRecord[] }>('/monitoring/alerts')
      .then((res) => {
        setUnreadAlerts(res.alerts.filter((a) => !a.is_read).length);
      })
      .catch(() => {});
  }, [location.pathname]);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    apiFetch('/settings', {
      method: 'PATCH',
      body: JSON.stringify({ theme_preference: next }),
    }).catch(() => {});
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex bg-[#F7F7F5] text-zinc-900 dark:bg-[#0B0C0E] dark:text-zinc-100">
      {/* Desktop Rail */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col border-r border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#101216] shrink-0">
        <div className="h-16 px-5 flex items-center border-b border-zinc-200 dark:border-zinc-800/90">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
          >
            <img
              src="/assets/aistudio/Neon_Cosmic_Energy_Emblem_e7530b84.png"
              alt="TRUTHOS logo"
              className="w-8 h-8 rounded-lg object-cover bg-black border border-zinc-800 shrink-0"
            />
            <span>TRUTHOS</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto" aria-label="Primary Workspace Navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                        isActive
                          ? 'bg-teal-600/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0 opacity-85" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.to === '/monitoring' && unreadAlerts > 0 && (
                      <span className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {unreadAlerts}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/90 space-y-3">
          <div className="px-1 text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
            <div className="font-medium text-zinc-900 dark:text-zinc-200 truncate">{user?.full_name}</div>
            <div className="truncate text-[11px] text-zinc-500">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/65"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-[#101216] border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
              <Link to="/dashboard" className="flex items-center gap-2.5 font-display text-lg font-bold">
                <img
                  src="/assets/aistudio/Neon_Cosmic_Energy_Emblem_e7530b84.png"
                  alt="TRUTHOS logo"
                  className="w-7 h-7 rounded-lg object-cover bg-black border border-zinc-800 shrink-0"
                />
                <span>TRUTHOS</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-3 pb-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                            isActive
                              ? 'bg-teal-600/10 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-8 border-b border-zinc-200 dark:border-zinc-800/90 bg-white/80 dark:bg-[#101216]/85 backdrop-blur flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" className="lg:hidden shrink-0" aria-label="TRUTHOS Home">
              <img
                src="/assets/aistudio/Neon_Cosmic_Energy_Emblem_e7530b84.png"
                alt="TRUTHOS logo"
                className="w-8 h-8 rounded-lg object-cover bg-black border border-zinc-800"
              />
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-semibold text-zinc-900 dark:text-white truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="hidden sm:block text-xs text-zinc-500 dark:text-zinc-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link
              to="/studio"
              className="px-4 py-2 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              Verify Claims
            </Link>

            <UserProfileAvatarMenu user={user} onLogout={handleLogout} />
          </div>
        </header>

        {!tavilyConfigured && !bannerDismissed && (
          <div className="px-4 sm:px-8 py-2 bg-amber-50/90 dark:bg-amber-950/25 border-b border-amber-200/80 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-4">
            <span className="truncate">
              Server `TAVILY_API_KEY` is not configured. Live web verification requires a Tavily key in backend secrets.
            </span>
            <div className="flex items-center gap-4 shrink-0">
              <Link to="/settings" className="font-medium underline underline-offset-2 whitespace-nowrap">
                API Status
              </Link>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="text-amber-700 dark:text-amber-300 hover:opacity-80 cursor-pointer"
                aria-label="Dismiss API configuration notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-5 sm:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
