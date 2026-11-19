import nlp from 'compromise';
import type { KnowledgeDomain } from '../../src/types/truthos';

export interface ExtractedClaimDraft {
  original_text: string;
  normalized_claim: string;
  subject: string;
  predicate: string;
  object_value: string;
  entities: Array<{ text: string; type: string }>;
  relevant_dates: string[];
  domain: KnowledgeDomain;
  time_sensitivity: 'high' | 'medium' | 'low';
  volatility_level: 'extreme' | 'high' | 'moderate' | 'low';
  half_life_days: number;
  extraction_confidence: number;
}

const OPINION_OR_NON_FACT_PATTERNS: RegExp[] = [
  /^\s*(i\s+think|i\s+believe|in\s+my\s+opinion|arguably|perhaps|maybe|hopefully|unfortunately|fortunately)/i,
  /\b(should|ought\s+to|must\s+be\s+nice|could\s+potentially|might\s+possibly|seem\s+to\s+be|appears?\s+subjective)\b/i,
  /\b(best|worst|greatest|terrible|amazing|wonderful|horrible|beautiful|ugly)\b/i,
  /^\s*(if\s+.+\s+would|suppose\s+|imagine\s+|what\s+if\b)/i,
  /\b(will\s+likely|will\s+probably|expected\s+to\s+eventually|predicted\s+to\s+someday)\b/i,
];

const FACTUAL_SIGNAL_PATTERNS: RegExp[] = [
  /\b(is|are|was|were|has|have|had|became|serves?\s+as|founded|acquired|headquartered|located|released|announced|reported|reached|generated|published|approved|enacted|measured|equals|contains)\b/i,
  /\b\d{4}\b/,
  /\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:,\d{3})+\b/,
];

const DOMAIN_KEYWORDS: Array<{ domain: KnowledgeDomain; keywords: RegExp[]; volatility: 'extreme' | 'high' | 'moderate' | 'low'; halfLifeDays: number; sensitivity: 'high' | 'medium' | 'low' }> = [
  {
    domain: 'Artificial Intelligence',
    keywords: [/\b(ai|artificial intelligence|llm|large language model|neural network|gpt|claude|gemini|openai|anthropic|machine learning|transformer|model weights|benchmark)\b/i],
    volatility: 'high',
    halfLifeDays: 45,
    sensitivity: 'high',
  },
  {
    domain: 'Finance',
    keywords: [/\b(stock|share price|market cap|revenue|earnings|gdp|inflation|interest rate|fed|federal reserve|crypto|bitcoin|valuation|ipo|sec|billion|trillion|\$)\b/i],
    volatility: 'extreme',
    halfLifeDays: 14,
    sensitivity: 'high',
  },
  {
    domain: 'Technology',
    keywords: [/\b(software|version|release|api|python|react|typescript|linux|kernel|cloud|kubernetes|chip|semiconductor|nvidia|apple|microsoft|google|meta|cybersecurity)\b/i],
    volatility: 'high',
    halfLifeDays: 60,
    sensitivity: 'high',
  },
  {
    domain: 'Business',
    keywords: [/\b(ceo|chief executive|cfo|chairperson|headquarters|acquired|merger|subsidiary|company|corporation|inc\.|employees|board of directors|founded)\b/i],
    volatility: 'moderate',
    halfLifeDays: 90,
    sensitivity: 'medium',
  },
  {
    domain: 'Politics and government',
    keywords: [/\b(president|prime minister|senator|congress|parliament|election|treaty|minister|administration|governor|mayor|white house|eu|united nations|policy)\b/i],
    volatility: 'moderate',
    halfLifeDays: 90,
    sensitivity: 'high',
  },
  {
    domain: 'Law and regulation',
    keywords: [/\b(law|statute|regulation|gdpr|act|supreme court|ruling|compliance|antitrust|tariff|banned|mandated|fda approval|patent)\b/i],
    volatility: 'moderate',
    halfLifeDays: 150,
    sensitivity: 'medium',
  },
  {
    domain: 'Healthcare information',
    keywords: [/\b(clinical trial|vaccine|fda|who|disease|treatment|drug|dosage|mortality|patient|cancer|diabetes|insulin|medical|health)\b/i],
    volatility: 'moderate',
    halfLifeDays: 180,
    sensitivity: 'medium',
  },
  {
    domain: 'Environment',
    keywords: [/\b(climate|emissions|co2|carbon|temperature|renewable|solar|ipcc|sea level|deforestation|biodiversity|paris agreement)\b/i],
    volatility: 'moderate',
    halfLifeDays: 180,
    sensitivity: 'medium',
  },
  {
    domain: 'Science',
    keywords: [/\b(physics|chemistry|biology|nasa|james webb|planet|orbit|speed of light|element|atomic|dna|genome|quantum|university|journal|study)\b/i],
    volatility: 'low',
    halfLifeDays: 365,
    sensitivity: 'low',
  },
  {
    domain: 'Education',
    keywords: [/\b(university|college|tuition|literacy|enrollment|degree|curriculum|school|scholarship|accreditation)\b/i],
    volatility: 'low',
    halfLifeDays: 365,
    sensitivity: 'low',
  },
];

export function getDomainPolicy(domain: KnowledgeDomain): {
  volatility_level: 'extreme' | 'high' | 'moderate' | 'low';
  half_life_days: number;
  time_sensitivity: 'high' | 'medium' | 'low';
} {
  const match = DOMAIN_KEYWORDS.find((d) => d.domain === domain);
  if (match) {
    return {
      volatility_level: match.volatility,
      half_life_days: match.halfLifeDays,
      time_sensitivity: match.sensitivity,
    };
  }
  return {
    volatility_level: 'low',
    half_life_days: 730,
    time_sensitivity: 'low',
  };
}

export function classifyDomain(text: string): {
  domain: KnowledgeDomain;
  volatility_level: 'extreme' | 'high' | 'moderate' | 'low';
  half_life_days: number;
  time_sensitivity: 'high' | 'medium' | 'low';
} {
  for (const entry of DOMAIN_KEYWORDS) {
    if (entry.keywords.some((re) => re.test(text))) {
      return {
        domain: entry.domain,
        volatility_level: entry.volatility,
        half_life_days: entry.halfLifeDays,
        time_sensitivity: entry.sensitivity,
      };
    }
  }
  return {
    domain: 'General knowledge',
    volatility_level: 'low',
    half_life_days: 730,
    time_sensitivity: 'low',
  };
}

function splitSentences(text: string): string[] {
  const doc = nlp(text);
  const raw = doc.sentences().out('array') as string[];
  if (raw.length > 0) {
    return raw.map((s) => s.trim()).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractEntitiesAndDates(sentence: string): {
  entities: Array<{ text: string; type: string }>;
  dates: string[];
} {
  const doc = nlp(sentence);
  const seen = new Set<string>();
  const entities: Array<{ text: string; type: string }> = [];

  const addEntities = (list: string[], type: string) => {
    for (const item of list) {
      const clean = item.replace(/[,.;:!?]+$/, '').trim();
      if (clean.length < 2) continue;
      const key = `${type}:${clean.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        entities.push({ text: clean, type });
      }
    }
  };

  addEntities(doc.people().out('array') as string[], 'Person');
  addEntities(doc.organizations().out('array') as string[], 'Organization');
  addEntities(doc.places().out('array') as string[], 'Location');

  const moneyMatches = sentence.match(/\$[\d,.]+(?:\s*(?:million|billion|trillion))?/gi) || [];
  addEntities(moneyMatches, 'Financial');

  const pctMatches = sentence.match(/\b\d+(?:\.\d+)?%/g) || [];
  addEntities(pctMatches, 'Percentage');

  const yearMatches = sentence.match(/\b(?:19|20)\d{2}\b/g) || [];
  const monthDateMatches =
    sentence.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?\b/gi
    ) || [];
  const isoDateMatches = sentence.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const dates = Array.from(new Set([...isoDateMatches, ...monthDateMatches, ...yearMatches]));

  // Fallback capitalized multi-word or notable proper noun extraction
  if (entities.length === 0) {
    const properNouns = sentence.match(/\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*\b/g) || [];
    const filtered = properNouns.filter(
      (p) => !['The', 'This', 'That', 'These', 'Those', 'In', 'On', 'At', 'As', 'By', 'For', 'It'].includes(p)
    );
    addEntities(filtered.slice(0, 4), 'Entity');
  }

  return { entities, dates };
}

function extractTriple(sentence: string, entities: Array<{ text: string; type: string }>): {
  subject: string;
  predicate: string;
  objectValue: string;
} {
  const clean = sentence.replace(/[.!?]+$/, '').trim();
  const doc = nlp(clean);
  const verbs = doc.verbs().out('array') as string[];
  const firstVerb = verbs[0]?.trim();

  if (firstVerb) {
    const idx = clean.toLowerCase().indexOf(firstVerb.toLowerCase());
    if (idx > 0) {
      const subject = clean.slice(0, idx).trim();
      const rest = clean.slice(idx + firstVerb.length).trim();
      if (subject.length >= 2 && rest.length >= 2) {
        return {
          subject: subject.slice(0, 120),
          predicate: firstVerb.slice(0, 60),
          objectValue: rest.slice(0, 200),
        };
      }
    }
  }

  const fallbackSubject = entities[0]?.text || clean.split(/\s+/).slice(0, 3).join(' ');
  return {
    subject: fallbackSubject.slice(0, 120),
    predicate: 'states',
    objectValue: clean.slice(0, 200),
  };
}

export function isFactualCandidate(sentence: string): { isFactual: boolean; confidence: number } {
  const trimmed = sentence.trim();
  if (trimmed.length < 18) return { isFactual: false, confidence: 0.1 };
  if (trimmed.endsWith('?')) return { isFactual: false, confidence: 0.05 };

  for (const pattern of OPINION_OR_NON_FACT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isFactual: false, confidence: 0.2 };
    }
  }

  let signals = 0;
  for (const pattern of FACTUAL_SIGNAL_PATTERNS) {
    if (pattern.test(trimmed)) signals++;
  }

  if (signals === 0) {
    return { isFactual: false, confidence: 0.35 };
  }

  const confidence = Math.min(0.96, 0.62 + signals * 0.11);
  return { isFactual: true, confidence: Number(confidence.toFixed(2)) };
}

export function extractClaimsFromText(inputText: string): ExtractedClaimDraft[] {
  const trimmed = inputText.trim();
  if (!trimmed) return [];

  const sentences = splitSentences(trimmed);
  const drafts: ExtractedClaimDraft[] = [];
  const seenNormalized = new Set<string>();

  for (const sentence of sentences) {
    const { isFactual, confidence } = isFactualCandidate(sentence);
    if (!isFactual) continue;

    const normalized = sentence.replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
    const key = normalized.toLowerCase();
    if (seenNormalized.has(key)) continue;
    seenNormalized.add(key);

    const { entities, dates } = extractEntitiesAndDates(normalized);
    const { subject, predicate, objectValue } = extractTriple(normalized, entities);
    const domainInfo = classifyDomain(normalized);

    const hasCurrentMarker = /\b(currently|today|now|as of 202\d|latest|current)\b/i.test(normalized);
    const timeSensitivity =
      hasCurrentMarker && domainInfo.time_sensitivity === 'low' ? 'medium' : domainInfo.time_sensitivity;

    drafts.push({
      original_text: sentence,
      normalized_claim: normalized,
      subject,
      predicate,
      object_value: objectValue,
      entities,
      relevant_dates: dates,
      domain: domainInfo.domain,
      time_sensitivity: timeSensitivity,
      volatility_level: domainInfo.volatility_level,
      half_life_days: domainInfo.half_life_days,
      extraction_confidence: confidence,
    });
  }

  // If user submitted a single short factual-looking assertion that didn't trigger strict filter (and isn't a question), keep it if it has >=4 words
  if (drafts.length === 0 && sentences.length === 1 && !sentences[0].endsWith('?') && sentences[0].split(/\s+/).length >= 4) {
    const s = sentences[0].replace(/[.!?]+$/, '').trim();
    const { entities, dates } = extractEntitiesAndDates(s);
    const { subject, predicate, objectValue } = extractTriple(s, entities);
    const domainInfo = classifyDomain(s);
    drafts.push({
      original_text: sentences[0],
      normalized_claim: s,
      subject,
      predicate,
      object_value: objectValue,
      entities,
      relevant_dates: dates,
      domain: domainInfo.domain,
      time_sensitivity: domainInfo.time_sensitivity,
      volatility_level: domainInfo.volatility_level,
      half_life_days: domainInfo.half_life_days,
      extraction_confidence: 0.58,
    });
  }

  return drafts;
}
