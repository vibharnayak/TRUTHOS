import crypto from 'crypto';

export interface RawCandidateSource {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  published_date: string | null;
}

export interface DuplicationAnnotatedSource {
  canonical_url: string;
  content_hash: string;
  independence_cluster_id: string;
  is_duplicate_url: boolean;
  is_near_duplicate_text: boolean;
  similarity_score: number;
}

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, '').toLowerCase()}${cleanPath}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function computeContentHash(text: string): string {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function buildShingles(text: string, k = 3): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const shingles = new Set<string>();
  if (tokens.length < k) {
    shingles.add(tokens.join(' '));
    return shingles;
  }
  for (let i = 0; i <= tokens.length - k; i++) {
    shingles.add(tokens.slice(i, i + k).join(' '));
  }
  return shingles;
}

export function jaccardSimilarity(textA: string, textB: string): number {
  const a = buildShingles(textA);
  const b = buildShingles(textB);
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : Number((intersection / union).toFixed(3));
}

export function analyzeSourceDuplication(sources: RawCandidateSource[]): {
  annotations: DuplicationAnnotatedSource[];
  duplicate_url_count: number;
  near_duplicate_clusters: number;
  independent_source_count: number;
  total_source_count: number;
  possible_anomaly: boolean;
  anomaly_note: string | null;
} {
  const seenCanonicalUrls = new Map<string, number>();
  const clusterRepresentatives: Array<{ index: number; clusterId: string; text: string; domain: string }> = [];
  const annotations: DuplicationAnnotatedSource[] = [];

  let duplicateUrlCount = 0;
  let nearDuplicateCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const canonical = canonicalizeUrl(src.url);
    const contentHash = computeContentHash(`${src.title} ${src.snippet}`);
    const isDuplicateUrl = seenCanonicalUrls.has(canonical);

    if (isDuplicateUrl) {
      duplicateUrlCount++;
    } else {
      seenCanonicalUrls.set(canonical, i);
    }

    let assignedClusterId = `cluster-${i + 1}`;
    let maxSim = 0;
    let isNearDuplicate = false;

    for (const rep of clusterRepresentatives) {
      const sim = jaccardSimilarity(src.snippet, rep.text);
      if (sim > maxSim) maxSim = sim;

      // Same canonical URL, identical domain, or >= 0.45 3-gram Jaccard overlap indicates non-independent reporting/syndication
      if (isDuplicateUrl && canonicalizeUrl(sources[rep.index].url) === canonical) {
        assignedClusterId = rep.clusterId;
        isNearDuplicate = true;
        break;
      }
      if (sim >= 0.45 || (src.domain === rep.domain && sim >= 0.25)) {
        assignedClusterId = rep.clusterId;
        isNearDuplicate = true;
        break;
      }
    }

    if (!isNearDuplicate) {
      clusterRepresentatives.push({
        index: i,
        clusterId: assignedClusterId,
        text: src.snippet,
        domain: src.domain,
      });
    } else {
      nearDuplicateCount++;
    }

    annotations.push({
      canonical_url: canonical,
      content_hash: contentHash,
      independence_cluster_id: assignedClusterId,
      is_duplicate_url: isDuplicateUrl,
      is_near_duplicate_text: isNearDuplicate,
      similarity_score: maxSim,
    });
  }

  const independentClusters = new Set(annotations.map((a) => a.independence_cluster_id)).size;
  const total = sources.length;
  const highRedundancy = total >= 3 && independentClusters <= Math.ceil(total * 0.45);

  return {
    annotations,
    duplicate_url_count: duplicateUrlCount,
    near_duplicate_clusters: nearDuplicateCount,
    independent_source_count: independentClusters,
    total_source_count: total,
    possible_anomaly: highRedundancy,
    anomaly_note: highRedundancy
      ? `Possible anomaly requiring inspection: ${total} retrieved records collapse into only ${independentClusters} independent reporting cluster(s). Copied or syndicated reports do not constitute independent confirmation.`
      : null,
  };
}
