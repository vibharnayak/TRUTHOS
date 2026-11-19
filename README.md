# TRUTHOS — Autonomous AI Knowledge Intelligence

TRUTHOS is a full-stack knowledge verification, temporal tracking, and decay-monitoring platform designed to keep evolving factual claims accurate over time.

## External Research Provider Policy

- **Tavily Search API (`https://api.tavily.com/search`) is the ONLY external API integration.**
- No external LLM APIs (OpenAI, Gemini, Claude, Groq, Perplexity, Hugging Face, SerpAPI, Google/Bing Search) are used.
- Claim extraction, entity recognition, source duplication detection, credibility heuristics, confidence/freshness scoring, and multi-agent adjudication run deterministically on the backend using local NLP (`compromise`), 3-gram Jaccard clustering, and transparent scoring rules.

## Architecture

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, React Router, Recharts, React Flow (`@xyflow/react`), Lucide Icons.
- **Live Server Runtime (`server.ts`)**: Express API server on port `3000` with persistent SQLite (`better-sqlite3` WAL mode), JWT + HttpOnly cookie auth, rate limiting, SSRF-safe URL validation, untrusted-text sanitization, and a persistent backend monitoring worker.
- **Enterprise Python/PostgreSQL/Celery Companion (`backend/`)**: FastAPI, SQLAlchemy ORM models, async `httpx` Tavily client, Redis + Celery Beat periodic monitoring worker, and Docker Compose orchestration (`docker-compose.yml`).

## Quick Start (Local Development)

1. Configure environment variables:
   ```bash
   cp .env.example .env
   # Set TAVILY_API_KEY=your_actual_tavily_key
   ```
2. Install dependencies and start the full-stack server on port `3000`:
   ```bash
   npm install
   npm run dev
   ```
3. Run automated verification & integration tests:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

## Docker Compose Deployment (PostgreSQL + Redis + FastAPI + Celery + App)

```bash
TAVILY_API_KEY=your_key SECRET_KEY=your_secret docker compose up --build
```

## Documentation

See `docs/SCORING_AND_ARCHITECTURE.md` for full Confidence and Freshness/Decay mathematical formulas and domain half-life tables.
