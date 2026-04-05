"""LLM-based metadata extraction from paper markdown."""

import json
from backend.config import get_config
from backend.utils.usage import tracked_completion


async def extract_metadata(markdown_text: str, project_id: str = "") -> dict:
    """Extract title, authors, venue, year, abstract from first ~1000 words."""
    cfg = get_config()
    model = cfg.llm_config.metadata_extractor.model

    words = markdown_text.split()
    snippet = " ".join(words[:1000])

    prompt = f"""You are a metadata extraction assistant. Given the beginning of an academic paper,
extract the following fields and return them as a JSON object with keys:
"title", "authors" (list of strings), "venue" (string or null), "year" (integer or null), "abstract" (string or null).

If you cannot determine a field, use null.

Paper text:
{snippet}

Return ONLY a JSON object, no markdown fences or extra text."""

    response = await tracked_completion(
        project_id, "indexing_metadata", model,
        [{"role": "user", "content": prompt}], temperature=0,
    )
    content = response.content.strip()

    # Parse JSON
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"title": None, "authors": [], "venue": None, "year": None, "abstract": None}