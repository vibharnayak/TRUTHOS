import asyncio
import os
from typing import Any
from urllib.parse import urlparse
import httpx

TAVILY_SEARCH_URL = "https://api.tavily.com/search"


class MissingTavilyKeyError(RuntimeError):
    pass


class TavilyRateLimitError(RuntimeError):
    pass


def is_safe_external_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"} or host.endswith((".local", ".internal")):
        return False
    return True


async def search_tavily(
    query: str,
    *,
    search_depth: str = "basic",
    topic: str = "general",
    max_results: int = 6,
    max_retries: int = 2,
) -> dict[str, Any]:
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key or api_key == "your_tavily_api_key":
        raise MissingTavilyKeyError("TAVILY_API_KEY is not configured on the backend.")

    payload = {
        "query": query.strip(),
        "search_depth": search_depth,
        "topic": topic,
        "max_results": max_results,
        "include_answer": False,
        "include_raw_content": False,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        for attempt in range(max_retries + 1):
            resp = await client.post(TAVILY_SEARCH_URL, json=payload, headers=headers)
            if resp.status_code == 429:
                if attempt < max_retries:
                    await asyncio.sleep(0.4 * (2**attempt))
                    continue
                raise TavilyRateLimitError("Tavily API rate limit exceeded.")
            resp.raise_for_status()
            data = resp.json()
            data["results"] = [r for r in data.get("results", []) if is_safe_external_url(r.get("url", ""))]
            return data

    raise RuntimeError("Tavily search failed after retries.")
