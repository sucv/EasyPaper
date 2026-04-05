"""OpenAlex citation count lookup."""

import httpx
from fuzzywuzzy import fuzz
from backend.config import get_config
from datetime import date

_daily_count = 0
_daily_date = date.today()
_DAILY_LIMIT = 1000  # OpenAlex polite pool


def _reset_if_new_day():
    global _daily_count, _daily_date
    today = date.today()
    if today != _daily_date:
        _daily_count = 0
        _daily_date = today


async def fetch_citation_count(title: str) -> dict:
    """Returns {citation_count: int|None, openalex_id: str|None}."""
    global _daily_count
    _reset_if_new_day()
    _daily_count += 1

    cfg = get_config()
    url = f"{cfg.openalex_config.base_url}/works"
    params = {"search": title, "per_page": 3}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        best_score = 0
        best_match = None
        for work in data.get("results", []):
            work_title = work.get("title", "")
            score = fuzz.token_sort_ratio(title.lower(), work_title.lower())
            if score > best_score:
                best_score = score
                best_match = work

        if best_match and best_score > 80:
            return {
                "citation_count": best_match.get("cited_by_count"),
                "openalex_id": best_match.get("id"),
            }
    except Exception:
        pass

    return {"citation_count": None, "openalex_id": None}


def get_budget() -> dict:
    _reset_if_new_day()
    return {"used": _daily_count, "limit": _DAILY_LIMIT, "remaining": _DAILY_LIMIT - _daily_count}

async def batch_fetch_citation_counts(
    titles: list[str],
    max_concurrency: int = 5,
) -> list[dict]:
    """Fetch citation counts for multiple titles concurrently.
    Returns list of dicts with keys: title, citation_count, openalex_id.
    """
    import asyncio

    semaphore = asyncio.Semaphore(max_concurrency)

    async def fetch_one(title: str) -> dict:
        async with semaphore:
            result = await fetch_citation_count(title)
            return {
                "title": title,
                "citation_count": result.get("citation_count"),
                "openalex_id": result.get("openalex_id"),
            }

    tasks = [fetch_one(t) for t in titles]
    return await asyncio.gather(*tasks)