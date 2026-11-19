import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, Search } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { apiFetch } from '../services/api';
import type { ClaimDetailRecord, EvidenceSourceRecord } from '../types/truthos';

interface FlatEvidence extends EvidenceSourceRecord {
  claim_id: string;
  claim_text: string;
  claim_domain: string;
  claim_status: string;
  claim_confidence_score: number;
  claim_freshness_score: number;
}

interface DirectTavilyResult {
  title: string;
  url: string;
  content: string;
  domain: string;
  published_date: string | null;
  retrieved_at: string;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerFileDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function EvidenceExplorerPage() {
  const [claims, setClaims] = useState<ClaimDetailRecord[]>([]);
  const [stanceFilter, setStanceFilter] = useState<'all' | 'supporting' | 'contradictory' | 'duplicates'>('all');
  const [directQuery, setDirectQuery] = useState('');
  const [directResults, setDirectResults] = useState<DirectTavilyResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ claims: ClaimDetailRecord[] }>('/claims?limit=100')
      .then((res) => setClaims(res.claims))
      .catch(() => {});
  }, []);

  const allEvidence = useMemo<FlatEvidence[]>(() => {
    const items: FlatEvidence[] = [];
    for (const c of claims) {
      for (const e of c.evidence) {
        items.push({
          ...e,
          claim_id: c.id,
          claim_text: c.normalized_claim,
          claim_domain: c.domain,
          claim_status: c.status,
          claim_confidence_score: c.confidence_score,
          claim_freshness_score: c.freshness_score,
        });
      }
    }
    return items.filter((item) => {
      if (stanceFilter === 'supporting') return item.stance === 'supporting';
      if (stanceFilter === 'contradictory') return item.stance === 'contradictory';
      if (stanceFilter === 'duplicates') return item.is_duplicate_url || item.is_near_duplicate_text;
      return true;
    });
  }, [claims, stanceFilter]);

  const exportEvidenceDNA = (format: 'json' | 'csv') => {
    if (allEvidence.length === 0) return;

    const timestamp = new Date().toISOString();
    const dateSlug = timestamp.slice(0, 10);
    const baseFilename = `truthos-evidence-dna-${stanceFilter}-${dateSlug}`;

    if (format === 'json') {
      const distinctClaims = new Set(allEvidence.map((item) => item.claim_id));
      const distinctClusters = new Set(allEvidence.map((item) => item.independence_cluster_id));
      const duplicateCount = allEvidence.filter(
        (item) => item.is_duplicate_url || item.is_near_duplicate_text,
      ).length;

      const payload = {
        export_metadata: {
          platform: 'TRUTHOS Autonomous AI Knowledge Intelligence',
          exported_at: timestamp,
          active_filter: stanceFilter,
          total_evidence_records: allEvidence.length,
          distinct_claims: distinctClaims.size,
          independent_clusters: distinctClusters.size,
          duplicate_or_syndicated_records: duplicateCount,
        },
        evidence_dna: allEvidence.map((ev) => ({
          evidence_id: ev.id,
          claim_id: ev.claim_id,
          claim_text: ev.claim_text,
          claim_domain: ev.claim_domain,
          claim_status: ev.claim_status,
          claim_confidence_score: ev.claim_confidence_score,
          claim_freshness_score: ev.claim_freshness_score,
          title: ev.title,
          url: ev.url,
          canonical_url: ev.canonical_url,
          source_domain: ev.domain,
          source_type: ev.source_type,
          author_or_publisher: ev.author_or_publisher,
          stance: ev.stance,
          is_primary_source: ev.is_primary_source,
          is_official_source: ev.is_official_source,
          credibility_score: ev.credibility_score,
          credibility_is_heuristic: ev.credibility_is_heuristic,
          credibility_explanation: ev.credibility_explanation,
          relevance_score: ev.relevance_score,
          independence_cluster_id: ev.independence_cluster_id,
          is_duplicate_url: ev.is_duplicate_url,
          is_near_duplicate_text: ev.is_near_duplicate_text,
          similarity_score: ev.similarity_score,
          query_used: ev.query_used,
          published_date: ev.published_date,
          retrieved_at: ev.retrieved_at,
          snippet: ev.snippet,
        })),
      };

      triggerFileDownload(
        JSON.stringify(payload, null, 2),
        `${baseFilename}.json`,
        'application/json;charset=utf-8',
      );
      setExportNotice(`Exported ${allEvidence.length} Evidence DNA records to ${baseFilename}.json`);
      return;
    }

    const headers = [
      'evidence_id',
      'claim_id',
      'claim_text',
      'claim_domain',
      'claim_status',
      'claim_confidence_score',
      'claim_freshness_score',
      'title',
      'url',
      'canonical_url',
      'source_domain',
      'source_type',
      'author_or_publisher',
      'stance',
      'is_primary_source',
      'is_official_source',
      'credibility_score',
      'credibility_explanation',
      'relevance_score',
      'independence_cluster_id',
      'is_duplicate_url',
      'is_near_duplicate_text',
      'similarity_score',
      'query_used',
      'published_date',
      'retrieved_at',
      'snippet',
    ];

    const rows = allEvidence.map((ev) =>
      [
        ev.id,
        ev.claim_id,
        ev.claim_text,
        ev.claim_domain,
        ev.claim_status,
        ev.claim_confidence_score,
        ev.claim_freshness_score,
        ev.title,
        ev.url,
        ev.canonical_url,
        ev.domain,
        ev.source_type,
        ev.author_or_publisher ?? '',
        ev.stance,
        ev.is_primary_source,
        ev.is_official_source,
        ev.credibility_score,
        ev.credibility_explanation,
        ev.relevance_score,
        ev.independence_cluster_id,
        ev.is_duplicate_url,
        ev.is_near_duplicate_text,
        ev.similarity_score,
        ev.query_used,
        ev.published_date ?? '',
        ev.retrieved_at,
        ev.snippet,
      ]
        .map(escapeCsvCell)
        .join(','),
    );

    const csvContent = `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
    triggerFileDownload(csvContent, `${baseFilename}.csv`, 'text/csv;charset=utf-8');
    setExportNotice(`Exported ${allEvidence.length} Evidence DNA records to ${baseFilename}.csv`);
  };

  const handleDirectSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    setSearching(true);
    try {
      const res = await apiFetch<{ results: DirectTavilyResult[] }>('/research/search', {
        method: 'POST',
        body: JSON.stringify({ query: directQuery, search_depth: 'basic' }),
      });
      setDirectResults(res.results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Tavily search failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <AppShell
      title="Evidence DNA Explorer"
      subtitle="Trace source provenance, independence clusters, duplicate detection, and live Tavily research queries"
    >
      <div className="space-y-6">
        <form
          onSubmit={handleDirectSearch}
          className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] space-y-3"
        >
          <div className="text-xs font-medium text-zinc-500">Direct Backend Tavily Research Query</div>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={directQuery}
                onChange={(e) => setDirectQuery(e.target.value)}
                placeholder="Query Tavily Search API directly via backend..."
                required
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[#F7F7F5] dark:bg-[#0B0C0E] text-sm focus:outline-none focus:border-teal-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 cursor-pointer"
            >
              {searching ? 'Searching Tavily...' : 'Search Sources'}
            </button>
          </div>
          {searchError && <div className="text-xs text-rose-500">{searchError}</div>}
          {directResults && (
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
              <div className="text-xs text-zinc-500">Returned {directResults.length} live Tavily results</div>
              {directResults.map((r, i) => (
                <div key={i} className="text-xs space-y-1">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>{r.title}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <div className="text-zinc-500">
                    {r.domain} · Published: {r.published_date ? new Date(r.published_date).toLocaleDateString() : 'Unavailable'}
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-300">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#13151A] border border-zinc-200 dark:border-zinc-800">
            {[
              { id: 'all', label: 'All Evidence' },
              { id: 'supporting', label: 'Supporting' },
              { id: 'contradictory', label: 'Contradictory' },
              { id: 'duplicates', label: 'Duplicates & Syndicated' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStanceFilter(f.id as typeof stanceFilter)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                  stanceFilter === f.id ? 'bg-teal-600 text-white' : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-zinc-500 font-mono tabular-nums mr-1">{allEvidence.length} records</span>
            <button
              type="button"
              onClick={() => exportEvidenceDNA('json')}
              disabled={allEvidence.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] text-zinc-700 dark:text-zinc-200 hover:border-teal-500/60 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              onClick={() => exportEvidenceDNA('csv')}
              disabled={allEvidence.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="px-4 py-2.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-xs text-teal-800 dark:text-teal-200 flex items-center justify-between gap-3">
            <span>{exportNotice}</span>
            <button
              type="button"
              onClick={() => setExportNotice(null)}
              className="text-teal-700 dark:text-teal-300 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13151A] divide-y divide-zinc-100 dark:divide-zinc-800">
          {allEvidence.length === 0 ? (
            <div className="p-8 text-sm text-zinc-500">No evidence records match this filter.</div>
          ) : (
            allEvidence.map((ev) => (
              <div key={ev.id} className="p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1.5"
                  >
                    <span>{ev.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                  <span className="text-xs font-mono tabular-nums text-zinc-500">
                    {ev.stance} · Credibility {ev.credibility_score}/100 · Relevance {Math.round(ev.relevance_score * 100)}%
                  </span>
                </div>
                <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                  <span>{ev.domain}</span>
                  <span aria-hidden="true">·</span>
                  <span>{ev.source_type}</span>
                  <span aria-hidden="true">·</span>
                  <span>Cluster: {ev.independence_cluster_id}</span>
                  <span aria-hidden="true">·</span>
                  <Link to={`/claims/${ev.claim_id}`} className="text-teal-700 dark:text-teal-400 hover:underline">
                    Claim: {ev.claim_text.slice(0, 80)}
                  </Link>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{ev.snippet}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
