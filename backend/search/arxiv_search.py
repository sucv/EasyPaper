"""arXiv API search wrapper."""

import arxiv
from backend.config import get_config
from backend.utils.sanitize import sanitize_title


def arxiv_search(query: str) -> list[dict]:
    cfg = get_config()
    max_results = cfg.arxiv_config.default_max_results

    client = arxiv.Client()
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.SubmittedDate,
    )

    results = []
    for r in client.results(search):
        paper_id = sanitize_title(r.title)
        results.append({
            "paper_id": paper_id,
            "title": r.title,
            "authors": [a.name for a in r.authors],
            "year": r.published.year if r.published else None,
            "venue": "arXiv",
            "abstract": r.summary,
            "pdf_url": r.pdf_url,
            "source": "arxiv",
        })
    return results