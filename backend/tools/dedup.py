"""Deduplication helpers using fuzzywuzzy."""

import re
from fuzzywuzzy import fuzz

DEDUP_THRESHOLD = 85


def normalize_title(title: str) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def check_duplicate(title: str, existing_titles: list[str], threshold: int = DEDUP_THRESHOLD) -> tuple[bool, str | None, float]:
    """Check if title is a duplicate of any existing title.
    Returns (is_dup, matched_title, score).
    """
    norm = normalize_title(title)
    best_score = 0.0
    best_match = None
    for existing in existing_titles:
        score = fuzz.token_sort_ratio(norm, normalize_title(existing))
        if score > best_score:
            best_score = score
            best_match = existing
    if best_score >= threshold:
        return True, best_match, best_score
    return False, None, best_score

def batch_check_duplicates(
    titles: list[str],
    existing_titles: list[str],
    threshold: int = DEDUP_THRESHOLD,
) -> list[dict]:
    """Check multiple titles against a list of existing titles.
    Returns list of dicts with keys: title, duplicate, matched_title, similarity.
    """
    results = []
    for title in titles:
        is_dup, matched, score = check_duplicate(title, existing_titles, threshold)
        results.append({
            "title": title,
            "duplicate": is_dup,
            "matched_title": matched,
            "similarity": score,
        })
    return results