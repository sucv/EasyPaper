"""Rewrite image paths in markdown for cross-folder references."""

import re


def rewrite_image_paths(markdown: str, paper_id: str, idea_slug: str) -> str:
    """Rewrite image paths to be relative from idea folder to shared papers folder."""

    def replace_path(match):
        alt = match.group(1)
        original_path = match.group(2)
        # If already absolute or URL, skip
        if original_path.startswith("http") or original_path.startswith("/"):
            return match.group(0)
        # Rewrite to relative path from ideas/{slug}/ to papers/{paper_id}/
        new_path = f"../../papers/{paper_id}/{original_path}"
        return f"![{alt}]({new_path})"

    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replace_path, markdown)