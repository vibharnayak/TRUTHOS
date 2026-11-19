import type { SourceCategory } from '../../src/types/truthos';

export interface SourceCredibilityAssessment {
  source_type: SourceCategory;
  is_primary_source: boolean;
  is_official_source: boolean;
  credibility_score: number;
  is_heuristic: true;
  explanation: string;
}

const GOV_PATTERNS = [/\.gov($|\.)/i, /\.mil($|\.)/i, /europa\.eu$/i, /who\.int$/i, /un\.org$/i, /imf\.org$/i, /worldbank\.org$/i, /oecd\.org$/i];
const ACADEMIC_PATTERNS = [/\.edu($|\.)/i, /arxiv\.org$/i, /nature\.com$/i, /science\.org$/i, /thelancet\.com$/i, /nejm\.org$/i, /ieee\.org$/i, /acm\.org$/i, /springer\.com$/i, /pubmed\.ncbi/i, /nih\.gov$/i, /sciencedirect\.com$/i];
const NEWS_PATTERNS = [/reuters\.com$/i, /apnews\.com$/i, /bbc\.com$/i, /bbc\.co\.uk$/i, /ft\.com$/i, /wsj\.com$/i, /nytimes\.com$/i, /bloomberg\.com$/i, /economist\.com$/i, /theguardian\.com$/i, /washingtonpost\.com$/i, /cnbc\.com$/i];
const INDUSTRY_PATTERNS = [/techcrunch\.com$/i, /arstechnica\.com$/i, /wired\.com$/i, /theverge\.com$/i, /zdnet\.com$/i, /forbes\.com$/i, /hbr\.org$/i, /developer\./i, /docs\./i];
const FORUM_PATTERNS = [/reddit\.com$/i, /quora\.com$/i, /stackoverflow\.com$/i, /news\.ycombinator\.com$/i, /discourse\./i];
const BLOG_PATTERNS = [/medium\.com$/i, /substack\.com$/i, /wordpress\.com$/i, /blogspot\.com$/i, /ghost\.io$/i];

export function assessSourceCredibility(params: {
  domain: string;
  url: string;
  title: string;
  snippet: string;
  published_date: string | null;
  subjectHint?: string;
}): SourceCredibilityAssessment {
  const domain = params.domain.toLowerCase();
  const subjectToken = (params.subjectHint || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  let sourceType: SourceCategory = 'Unknown';
  let baseScore = 48;
  let isPrimary = false;
  let isOfficial = false;

  if (GOV_PATTERNS.some((p) => p.test(domain))) {
    sourceType = 'Government';
    baseScore = 88;
    isPrimary = true;
    isOfficial = true;
  } else if (ACADEMIC_PATTERNS.some((p) => p.test(domain))) {
    sourceType = domain.includes('nature') || domain.includes('science') || domain.includes('nejm') || domain.includes('lancet') || domain.includes('ieee')
      ? 'Scientific Journal'
      : 'Academic Publication';
    baseScore = 86;
    isPrimary = true;
  } else if (subjectToken.length >= 3 && domain.replace(/[^a-z0-9]/g, '').includes(subjectToken)) {
    sourceType = 'Official Organization';
    baseScore = 82;
    isPrimary = true;
    isOfficial = true;
  } else if (NEWS_PATTERNS.some((p) => p.test(domain))) {
    sourceType = 'Established News Publisher';
    baseScore = 76;
  } else if (INDUSTRY_PATTERNS.some((p) => p.test(domain))) {
    sourceType = 'Industry Publication';
    baseScore = 68;
    if (domain.startsWith('docs.') || domain.startsWith('developer.')) {
      sourceType = 'Official Organization';
      baseScore = 82;
      isPrimary = true;
      isOfficial = true;
    }
  } else if (FORUM_PATTERNS.some((p) => p.test(domain))) {
    sourceType = 'Forum';
    baseScore = 32;
  } else if (BLOG_PATTERNS.some((p) => p.test(domain))) {
    sourceType = 'Personal Blog';
    baseScore = 40;
  } else if (domain.includes('wikipedia.org')) {
    sourceType = 'Academic Publication';
    baseScore = 64;
  }

  let adjustments = 0;
  const reasons: string[] = [`Heuristic tier: ${sourceType} (base ${baseScore})`];

  if (params.published_date) {
    adjustments += 4;
    reasons.push('publication date metadata present (+4)');
  } else {
    adjustments -= 4;
    reasons.push('missing publication date (-4)');
  }

  if (params.snippet.length >= 160) {
    adjustments += 3;
    reasons.push('substantive excerpt available (+3)');
  }

  if (params.url.startsWith('https://')) {
    adjustments += 1;
  }

  const finalScore = Math.max(10, Math.min(96, baseScore + adjustments));
  const explanation = `Heuristic assessment (not an absolute truth score): ${reasons.join('; ')}. Familiar domains still require corroboration.`;

  return {
    source_type: sourceType,
    is_primary_source: isPrimary,
    is_official_source: isOfficial,
    credibility_score: finalScore,
    is_heuristic: true,
    explanation,
  };
}
