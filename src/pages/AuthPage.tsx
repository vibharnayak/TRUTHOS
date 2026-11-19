import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../services/api';

export function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Authentication request failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-zinc-100 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="inline-flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-white">
            <img
              src="/assets/aistudio/Neon_Cosmic_Energy_Emblem_e7530b84.png"
              alt="TRUTHOS logo"
              className="w-9 h-9 rounded-lg object-cover bg-black border border-zinc-800 shrink-0"
            />
            <span>TRUTHOS</span>
          </Link>
          <p className="text-sm text-zinc-400">
            Sign in or create an analyst workspace to verify and monitor claims.
          </p>
        </div>

        <div className="p-6 sm:p-8 rounded-xl border border-zinc-800 bg-[#13151A] space-y-6">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0C0E] border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-rose-800/80 bg-rose-950/40 text-xs text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="block text-xs font-medium text-zinc-300">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0B0C0E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-medium text-zinc-300">
                Work Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@organization.org"
                className="w-full px-3 py-2.5 rounded-lg bg-[#0B0C0E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2.5 rounded-lg bg-[#0B0C0E] border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Authenticating...' : mode === 'login' ? 'Sign In to TRUTHOS' : 'Create Analyst Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
