import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .tavily_client import MissingTavilyKeyError, TavilyRateLimitError, search_tavily

app = FastAPI(
    title="TRUTHOS Autonomous AI Knowledge Intelligence API",
    version="1.0.0",
    description="FastAPI + PostgreSQL + Celery reference backend using exclusively Tavily Search API.",
)


class ResearchQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=350)
    search_depth: str = Field(default="basic")


@app.get("/api/health")
def health() -> dict:
    key = os.getenv("TAVILY_API_KEY", "").strip()
    return {
        "status": "ok",
        "service": "TRUTHOS FastAPI Backend",
        "tavily_configured": bool(key and key != "your_tavily_api_key"),
        "external_provider": "Tavily Search API only",
    }


@app.post("/api/research/search")
async def research_search(payload: ResearchQueryRequest) -> dict:
    try:
        return await search_tavily(payload.query, search_depth=payload.search_depth)
    except MissingTavilyKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TavilyRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
