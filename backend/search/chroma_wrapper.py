"""Thin wrapper around ChromaDB collections with pluggable embeddings."""

import json
import os
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from backend.config import get_config

_accessible_store: Chroma | None = None
_inaccessible_store: Chroma | None = None
_embeddings_instance: Embeddings | None = None


def get_embeddings() -> Embeddings:
    """Create embeddings instance based on config. Cached after first call."""
    global _embeddings_instance
    if _embeddings_instance is not None:
        return _embeddings_instance

    cfg = get_config()
    provider = cfg.embedding_config.provider.lower()
    model = cfg.embedding_config.model

    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://10.96.46.116:11434")
        _embeddings_instance = OllamaEmbeddings(model=model, base_url=ollama_url)

    elif provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        _embeddings_instance = OpenAIEmbeddings(model=model)

    elif provider == "google":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        _embeddings_instance = GoogleGenerativeAIEmbeddings(model=model)

    elif provider == "cohere":
        from langchain_cohere import CohereEmbeddings
        _embeddings_instance = CohereEmbeddings(model=model)

    elif provider == "voyageai":
        from langchain_voyageai import VoyageAIEmbeddings
        _embeddings_instance = VoyageAIEmbeddings(model=model)

    elif provider == "huggingface":
        from langchain_huggingface import HuggingFaceEmbeddings
        _embeddings_instance = HuggingFaceEmbeddings(model_name=model)

    else:
        raise ValueError(
            f"Unknown embedding provider: '{provider}'. "
            f"Supported: ollama, openai, google, cohere, voyageai, huggingface"
        )

    print(f"[EMBEDDINGS] Using {provider}:{model}")
    return _embeddings_instance


def get_accessible_store() -> Chroma:
    global _accessible_store
    if _accessible_store is None:
        cfg = get_config()
        _accessible_store = Chroma(
            collection_name=cfg.chroma_config.accessible_collection,
            persist_directory=cfg.chroma_config.persist_directory,
            embedding_function=get_embeddings(),
        )
    return _accessible_store


def get_inaccessible_store() -> Chroma:
    global _inaccessible_store
    if _inaccessible_store is None:
        cfg = get_config()
        _inaccessible_store = Chroma(
            collection_name=cfg.chroma_config.inaccessible_collection,
            persist_directory=cfg.chroma_config.persist_directory,
            embedding_function=get_embeddings(),
        )
    return _inaccessible_store


def get_all_metadata(accessible: bool = True) -> list[dict]:
    """Load all metadata from a collection (for boolean search / tag enumeration)."""
    store = get_accessible_store() if accessible else get_inaccessible_store()
    collection = store._collection
    page_size = 5000
    offset = 0
    metas = []
    while True:
        result = collection.get(include=["metadatas"], limit=page_size, offset=offset)
        batch = result.get("metadatas", [])
        if not batch:
            break
        metas.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    out = []
    for m in metas:
        authors = m.get("authors", "[]")
        if isinstance(authors, str):
            try:
                authors = json.loads(authors)
            except Exception:
                authors = [a.strip() for a in authors.split(",")]
        out.append({
            "paper_id": m.get("paper_id", ""),
            "title": m.get("title", ""),
            "authors": authors,
            "year": m.get("year"),
            "venue": m.get("venue"),
            "abstract": m.get("abstract"),
            "pdf_url": m.get("pdf_url"),
        })
    return out


def get_unique_tags(accessible: bool = True) -> dict:
    """Return unique years and venues with counts."""
    all_meta = get_all_metadata(accessible)
    years: dict[int, int] = {}
    venues: dict[str, int] = {}
    for m in all_meta:
        y = m.get("year")
        if y:
            y = int(y)
            years[y] = years.get(y, 0) + 1
        v = m.get("venue")
        if v:
            venues[v] = venues.get(v, 0) + 1
    return {
        "years": dict(sorted(years.items())),
        "venues": dict(sorted(venues.items())),
    }