import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GitBranch, Layers, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LandingPage() {
  const { user } = useAuth();
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-zinc-100">
      {/* Top Bar Contract: 1-line Brand — 4 single-line links — 1 primary CTA */}
      <header className="max-w-[1280px] mx-auto px-6 h-20 flex items-center justify-between gap-8 border-b border-zinc-800/80">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          <img
            src="/assets/aistudio/Neon_Cosmic_Energy_Emblem_e7530b84.png"
            alt="TRUTHOS logo"
            className="w-8 h-8 rounded-lg object-cover bg-black border border-zinc-800 shrink-0"
          />
          <span>TRUTHOS</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400">
          <a href="#capabilities" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Capabilities
          </a>
          <a href="#architecture" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Multi-Agent Engine
          </a>
          <a href="#scoring" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Scoring Logic
          </a>
          <a href="#workflow" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Workflow
          </a>
        </nav>

        <div className="shrink-0">
          <Link
            to={user ? '/dashboard' : '/auth'}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 transition-colors whitespace-nowrap shrink-0"
          >
            {user ? 'Open Workspace' : 'Sign In'}
          </Link>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-6">
        {/* Hero Split */}
        <section className="py-16 lg:py-24 grid lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-medium text-teal-400">
              Autonomous AI Knowledge Intelligence · Powered by Tavily Search Retrieval
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.08] max-w-xl">
              Facts evolve over time. Static verification falls behind.
            </h1>
            <p className="text-base text-zinc-300 leading-relaxed max-w-xl">
              TRUTHOS decomposes documents into atomic claims, dispatches five independent verification modules using live Tavily web evidence, tracks temporal state changes in a versioned knowledge graph, and monitors stored answers for decay.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-5">
              <Link
                to={user ? '/studio' : '/auth'}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 transition-colors whitespace-nowrap"
              >
                <span>{user ? 'Open Verification Studio' : 'Create Analyst Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#architecture"
                className="px-2 py-3 text-sm font-medium text-zinc-300 hover:text-white underline underline-offset-4 decoration-zinc-700 hover:decoration-teal-500 transition-colors whitespace-nowrap"
              >
                Inspect 5-Agent Pipeline
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[290px] rounded-xl border border-zinc-800 bg-[#13151A] overflow-hidden flex items-center justify-center">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/truthos_temporal_graph_hero_1794917269286.jpg"
                  alt="TRUTHOS temporal knowledge graph and verification timeline architecture"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover opacity-95"
                />
              ) : (
                <div className="p-8 text-center space-y-3">
                  <GitBranch className="w-10 h-10 text-teal-400 mx-auto" />
                  <p className="text-sm font-medium text-zinc-200">Temporal Knowledge Graph & Evidence DNA</p>
                  <p className="text-xs text-zinc-400 max-w-sm">
                    Versioned facts, source independence clustering, and background decay monitoring.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Core Capabilities Hairline Architectural Grid */}
        <section id="capabilities" className="py-16 border-t border-zinc-800/80 space-y-10">
          <div className="max-w-2xl space-y-2">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Engineered for temporal accuracy and source provenance
            </h2>
            <p className="text-sm text-zinc-400">
              Every verification decision is backed by traceable URLs, publication dates, heuristic credibility reasoning, and preserved historical versions.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#13151A] grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
            <div className="divide-y divide-zinc-800">
              <div className="p-7 space-y-2.5">
                <div className="text-xs font-mono text-teal-400">01. Multi-Agent Verification</div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Five specialized software modules coordinate every claim check
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Researcher retrieves supporting and official records via Tavily. Skeptic issues distinct counter-queries. Temporal Intelligence compares evidence age against domain volatility. Evidence Analyst clusters syndicated copies, and Judge synthesizes an explainable verdict.
                </p>
              </div>
              <div className="p-7 space-y-2.5">
                <div className="text-xs font-mono text-teal-400">03. Predictive Decay</div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Domain half-lives surface aging facts early
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Finance, AI, Software, and Corporate leadership claims decay faster than historical baselines and generate probabilistic review schedules with explicit uncertainty.
                </p>
              </div>
            </div>

            <div className="divide-y divide-zinc-800">
              <div className="p-7 space-y-2.5">
                <div className="text-xs font-mono text-teal-400">02. Evidence DNA</div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Clickable provenance with duplication clustering
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Inspect canonical URLs, 3-gram text similarity, domain tiers, and exact Tavily search queries behind every decision—so copied wire articles never pass as independent proof.
                </p>
              </div>
              <div className="p-7 space-y-2.5">
                <div className="text-xs font-mono text-teal-400">04. Self-Healing Memory & Temporal Graph</div>
                <h3 className="font-display text-lg font-semibold text-white">
                  Preserve historical truth while flagging dependent answers
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  TRUTHOS never silently overwrites old facts. When a monitored fact shifts status, the previous validity window closes, a new fact version is recorded, and dependent reports are flagged for re-verification.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture & Scoring Transparency */}
        <section id="architecture" className="py-16 border-t border-zinc-800/80 grid lg:grid-cols-2 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-teal-400 text-sm font-medium">
              <Layers className="w-4 h-4" />
              <span>Strict Single-Provider Research Architecture</span>
            </div>
            <h2 className="font-display text-2xl font-semibold text-white">
              Tavily Search API is the sole external research source
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              No third-party LLM wrappers, no fabricated citations, and no opaque black-box scoring. Claim extraction runs deterministically via local NLP, while web retrieval originates strictly from backend-authenticated Tavily requests with caching, rate-limit backoff, and untrusted-content sanitization.
            </p>
          </div>

          <div id="scoring" className="p-6 rounded-xl border border-zinc-800 bg-[#13151A] space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Two Independent Scoring Models (0–100)</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-6 text-sm">
              <div className="space-y-1.5">
                <div className="font-semibold text-white">Confidence Score</div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Relevance (25) + Heuristic Source Quality (25) + Independent Corroboration Clusters (25) + Completeness (25) minus Contradiction Penalty (up to 35).
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="font-semibold text-white">Freshness Score</div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Exponential decay over evidence age and domain half-life, accelerated by historical change frequency. Freshness never equals accuracy.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="py-16 border-t border-zinc-800/80 space-y-8">
          <h2 className="font-display text-2xl font-semibold text-white">End-to-end verification workflow</h2>
          <div className="rounded-xl border border-zinc-800 bg-[#13151A] grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 text-sm">
            {[
              { step: '01', title: 'Submit & Extract', desc: 'Paste articles or AI answers. Local NLP isolates verifiable factual claims from opinions.' },
              { step: '02', title: 'Research & Challenge', desc: 'Researcher and Skeptic query Tavily independently to gather supporting and counter evidence.' },
              { step: '03', title: 'Score & Graph', desc: 'Judge computes Confidence, Freshness, Evidence DNA clusters, and updates the Temporal Graph.' },
              { step: '04', title: 'Monitor & Heal', desc: 'Backend workers recheck saved claims on schedule, record diffs, and emit in-app alerts.' },
            ].map((item) => (
              <div key={item.step} className="p-6 space-y-2">
                <div className="font-mono text-xs text-teal-400 tabular-nums">{item.step}</div>
                <div className="font-display font-semibold text-white">{item.title}</div>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/80 py-8 mt-8">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <span>TRUTHOS · Autonomous AI Knowledge Intelligence</span>
          <span>Tavily-backed verification · Heuristic credibility & predictive decay carry explicit uncertainty</span>
        </div>
      </footer>
    </div>
  );
}
