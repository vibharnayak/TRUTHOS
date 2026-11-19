# TRUTHOS Scoring Formulas & Multi-Agent Architecture

## 1. Strict External API Policy

TRUTHOS uses **only the Tavily Search API** (`POST https://api.tavily.com/search`) as its external research provider.
- Tavily is never treated as an LLM or reasoning engine.
- `include_answer` is explicitly set to `false` so all reasoning derives deterministically from retrieved evidence records, metadata, and local NLP modules.
- All Tavily calls originate strictly from backend services. Keys are never exposed to the browser.

## 2. Independent Confidence Score (0–100)

Confidence measures the strength and independence of retrieved evidence supporting or refuting a claim:

| Component | Weight | Calculation |
|---|---:|---|
| Evidence Relevance | 0–25 | Average blended token-overlap + Tavily relevance score across unique canonical URLs |
| Heuristic Source Quality | 0–25 | Average heuristic credibility tier of supporting/available sources (`Government`, `Scientific Journal`, `Official Organization`, `News`, etc.) |
| Independent Corroboration | 0–25 | `min(25, independentSupportingClusters * 7.5)` — syndicated/near-duplicate articles collapse into a single cluster |
| Evidence Completeness | 0–25 | Presence of >= 3 unique sources (10), explicit publication dates (8), primary/official sources (7) |
| Contradiction Penalty | 0 to -35 | `independentContradictingClusters * 12 + highCredibilityContradictions * 4` |

Clamped to `[5, 98]` when evidence exists, or `0` when zero usable evidence is retrieved.

## 3. Independent Freshness & Predictive Decay Score (0–100)

Freshness measures expected temporal currency—never factual accuracy:

```
effective_half_life = max(3, domain_half_life_days / (1 + min(historical_changes, 4) * 0.25))
freshness = 100 * 0.5 ^ (evidence_age_days / effective_half_life)
```

Domain baseline half-lives:
- **Finance**: 14 days (`extreme` volatility)
- **Artificial Intelligence**: 45 days (`high` volatility)
- **Technology**: 60 days (`high` volatility)
- **Business / Politics & Government**: 90 days (`moderate` volatility)
- **Law & Regulation**: 150 days (`moderate` volatility)
- **Healthcare / Environment**: 180 days (`moderate` volatility)
- **Science / Education**: 365 days (`low` volatility)
- **General Knowledge**: 730 days (`low` volatility)

Decay States:
- `Fresh`: 75–100
- `Aging`: 50–74
- `At Risk`: 25–49
- `Stale`: 0–24

If publication dates are absent, freshness is conservatively capped at `72`. If Temporal Intelligence detects newer superseding state-change evidence, freshness is capped at `22`.
