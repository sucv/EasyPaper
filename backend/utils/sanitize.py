import re
import unicodedata


def sanitize_title(title: str, max_length: int = 100) -> str:
    """Sanitize a title for use as a folder/file name."""
    s = title.lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s]+", "_", s)
    s = re.sub(r"_+", "_", s)
    s = s.strip("_")
    if len(s) > max_length:
        s = s[:max_length].rstrip("_")
    return s or "untitled"


def desanitize_slug(slug: str) -> str:
    """Best-effort reverse of sanitize: replace underscores with spaces and title-case."""
    return slug.replace("_", " ")