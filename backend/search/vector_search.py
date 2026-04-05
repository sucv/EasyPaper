"""Chroma vector similarity search."""

from backend.search.chroma_wrapper import get_accessible_store, get_inaccessible_store
from backend.config import get_config
import json


def vector_search(
    query: str,
    accessible: bool = True,
    years: list[int] | None = None,
    venues: list[str] | None = None,
) -> list[dict]:
    cfg = get_config()
    store = get_accessible_store() if accessible else get_inaccessible_store()
    max_results = cfg.search_config.max_results_per_search

    # Build Chroma where filter
    where_clauses = []
    if years:
        where_clauses.append({"year": {"$in": [int(y) for y in years]}})
    if venues:
        where_clauses.append({"venue": {"$in": venues}})

    where = None
    if len(where_clauses) == 1:
        where = where_clauses[0]
    elif len(where_clauses) > 1:
        where = {"$and": where_clauses}

    kwargs = {"k": max_results}
    if where:
        kwargs["filter"] = where

    results = store.similarity_search_with_score(query, **kwargs)

    out = []
    for doc, score in results:
        meta = doc.metadata
        authors = meta.get("authors", "[]")
        if isinstance(authors, str):
            try:
                authors = json.loads(authors)
            except Exception:
                authors = [a.strip() for a in authors.split(",")]
        out.append({
            "paper_id": meta.get("paper_id", ""),
            "title": meta.get("title", ""),
            "authors": authors,
            "year": meta.get("year"),
            "venue": meta.get("venue"),
            "abstract": meta.get("abstract"),
            "pdf_url": meta.get("pdf_url"),
            "score": float(score),
        })
    return out