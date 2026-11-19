import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ClaimStatusLabel, DecayStateLabel } from '../components/StatusIndicator';
import { apiFetch, ApiRequestError } from '../services/api';
import type { ClaimDetailRecord } from '../types/truthos';

interface PreviewClaim {
  original_text: string;
  normalized_claim: string;
  subject: string;
  predicate: string;
  object_value: string;
  domain: string;
  time_sensitivity: string;
  extraction_confidence: number;
}

export function VerificationStudioPage() {
  const [title, setTitle] = useState('Executive Fact Check Briefing');
  const [sourceType, setSourceType] = useState('article');
  const [text, setText] = useState('');
  const [previewClaims, setPreviewClaims] = useState<PreviewClaim[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifiedClaims, setVerifiedClaims] = useState<ClaimDetailRecord[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  const handlePreviewExtract = async () => {
    setError(null);
    setExtracting(true);
    try {
      const res = await apiFetch<{ claims: PreviewClaim[] }>('/verification/preview-extract', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setPreviewClaims(res.claims);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifiedClaims([]);
    setVerifying(true);
    setStageMessage('Extracting claims and running Researcher, Skeptic, Temporal, Analyst, and Judge modules via Tavily...');

    try {
      const res = await apiFetch<{ jobId: string; status: string; claimCount: number }>('/verification/submit', {
        method: 'POST',
        body: JSON.stringify({ title, source_type: sourceType, text }),
      });
      setJobId(res.jobId);
      setStageMessage('Loading persisted Evidence DNA and verification results...');
      const claimsRes = await apiFetch<{ claims: ClaimDetailRecord[] }>(`/verification/${res.jobId}/claims`);
      setVerifiedClaims(claimsRes.claims);
      setStageMessage(null);
    } catch (err) {
      setStageMessage(null);
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Verification failed.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const insertExampleParagraph = () => {
    setTitle('AI & Semiconductor Fact Check');
    setText(
      'NVIDIA is headquartered in Santa Clara, California. ' +
        'Satya Nadella became CEO of Microsoft in 2014. ' +
        'Python 3.10 reached end-of-life security support in 2024. ' +
        'I think open-source models are the most exciting trend in technology.'
    );
    setPreviewClaims(null);
  };

  return (
    <AppShell
      title="Verification Studio"
      subtitle="Submit articles, AI-generated answers, or statements for claim-level Tavily verification"
    >
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Submission Form */}
        <form
          onSubmit={handleSubmitVerification}
          className="lg:col-span-5 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Input Document</h2>
            <button
              type="button"
              onClick={insertExampleParagraph}
              className="text-xs text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Insert Multi-Claim Sample Text
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="doc-title" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Session Title
              </label>
              <input
                id="doc-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="source-type" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Input Type
              </label>
              <select
                id="source-type"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm focus:outline-none focus:border-teal-500"
              >
                <option value="article">Article / News Report</option>
                <option value="ai_answer">AI-Generated Answer</option>
                <option value="research_summary">Research Summary</option>
                <option value="statement">Direct Statement</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="claim-text" className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Text to Analyze
            </label>
            <textarea
              id="claim-text"
              rows={9}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a paragraph, article excerpt, or AI answer containing factual statements..."
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm leading-relaxed focus:outline-none focus:border-teal-500"
            />
          </div>

          {error && (
            <div className="p-3.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
              {error}
            </div>
          )}

          {stageMessage && (
            <div className="p-3.5 rounded-lg border border-teal-300 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30 text-xs text-teal-800 dark:text-teal-200 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{stageMessage}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handlePreviewExtract}
              disabled={extracting || verifying || text.trim().length < 10}
              className="px-4 py-2.5 rounded-lg text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/[0.04] disabled:opacity-50 cursor-pointer"
            >
              {extracting ? 'Extracting...' : 'Preview Extracted Claims'}
            </button>
            <button
              type="submit"
              disabled={verifying || text.trim().length < 15}
              className="px-5 py-2.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 cursor-pointer"
            >
              {verifying ? 'Verifying via Tavily...' : 'Run Multi-Agent Verification'}
            </button>
          </div>
        </form>

        {/* Results / Extraction Preview */}
        <div className="lg:col-span-7 space-y-6">
          {previewClaims && verifiedClaims.length === 0 && (
            <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">
                  NLP Claim Extraction Preview ({previewClaims.length})
                </h2>
                <span className="text-xs text-zinc-500">Opinions & questions excluded</span>
              </div>
              {previewClaims.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No verifiable factual claims detected in the input.
                </p>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {previewClaims.map((c, idx) => (
                    <div key={idx} className="py-3 space-y-1">
                      <div className="text-sm font-medium">{c.normalized_claim}</div>
                      <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                        <span>{c.domain}</span>
                        <span aria-hidden="true">·</span>
                        <span>Sensitivity: {c.time_sensitivity}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Extraction confidence {Math.round(c.extraction_confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {verifiedClaims.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">
                  Verified Claims ({verifiedClaims.length})
                </h2>
                {jobId && (
                  <span className="text-xs font-mono text-zinc-500">Job {jobId.slice(0, 8)}</span>
                )}
              </div>

              {verifiedClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-500 flex items-center gap-2">
                        <span>{claim.domain}</span>
                        <span aria-hidden="true">·</span>
                        <span>Sensitivity: {claim.time_sensitivity}</span>
                      </div>
                      <h3 className="font-display text-base font-semibold">{claim.normalized_claim}</h3>
                    </div>
                    <ClaimStatusLabel status={claim.status} />
                  </div>

                  <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{claim.reasoning}</p>

                  <div className="grid grid-cols-3 gap-4 py-3 border-y border-zinc-100 dark:border-zinc-800 text-xs">
                    <div>
                      <div className="text-zinc-500">Confidence Score</div>
                      <div className="font-mono text-base font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                        {claim.confidence_score}/100
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Freshness Score</div>
                      <div className="font-mono text-base font-semibold tabular-nums">
                        {claim.freshness_score}/100 · <DecayStateLabel state={claim.decay_state} />
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">Independent Clusters</div>
                      <div className="font-mono text-base font-semibold tabular-nums">
                        {claim.duplication_analysis.independent_source_count}/{claim.duplication_analysis.total_source_count}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-zinc-500">Top Evidence Citations</div>
                    <div className="space-y-1.5">
                      {claim.evidence.slice(0, 4).map((ev) => (
                        <div key={ev.id} className="flex items-center justify-between gap-3 text-xs">
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1.5 truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ev.title}</span>
                          </a>
                          <span className="text-zinc-500 whitespace-nowrap shrink-0">
                            {ev.domain} · {ev.stance}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-medium">
                    <Link to={`/claims/${claim.id}`} className="text-teal-700 dark:text-teal-400 hover:underline">
                      Open Claim Intelligence
                    </Link>
                    <Link to={`/agents?claimId=${claim.id}`} className="text-zinc-600 dark:text-zinc-300 hover:underline">
                      Inspect 5 Agent Logs
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!previewClaims && verifiedClaims.length === 0 && (
            <div className="p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
              <div className="font-medium text-zinc-800 dark:text-zinc-200">Ready for claim-level inspection</div>
              <p>
                Preview extracted factual claims locally before running live Tavily searches, or submit directly to run all five verification agents and persist full Evidence DNA.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
