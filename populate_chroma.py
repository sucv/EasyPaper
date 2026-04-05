"""Standalone script to populate ChromaDB from CSV."""

import csv
import json
import os
import re
import sys
from pathlib import Path
from dotenv import load_dotenv
import yaml

# Ensure project root is on sys.path so `backend.*` imports work
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)  # so relative paths in config.yaml resolve to project root

load_dotenv(PROJECT_ROOT / ".env")

from langchain_chroma import Chroma
from backend.utils.sanitize import sanitize_title
from backend.search.chroma_wrapper import get_embeddings


def load_config():
    config_path = PROJECT_ROOT / "config.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


def parse_conf(conf_str: str) -> tuple[str, int | None]:
    """Parse venue+year from conf column, e.g. 'NIPS2021' -> ('NIPS', 2021)."""
    if not conf_str:
        return ("", None)
    match = re.match(r'^([A-Za-z_/]+)\s*(\d{4})$', conf_str.strip())
    if match:
        return (match.group(1), int(match.group(2)))
    return (conf_str.strip(), None)


def clean_authors(authors_str: str) -> list[str]:
    if not authors_str:
        return []
    s = authors_str.replace("\n", " ").replace("\t", " ")
    return [a.strip() for a in s.split(",") if a.strip()]


def main():
    if len(sys.argv) < 2:
        print("Usage: python populate_chroma.py <csv_file>")
        sys.exit(1)

    csv_path = sys.argv[1]
    config = load_config()

    persist_dir = config["chroma_config"]["persist_directory"]
    accessible_name = config["chroma_config"]["accessible_collection"]
    inaccessible_name = config["chroma_config"]["inaccessible_collection"]
    embeddings = get_embeddings()
    batch_size = config["chroma_config"]["batch_size"]


    accessible_docs = []
    accessible_metas = []
    accessible_ids = []
    inaccessible_docs = []
    inaccessible_metas = []
    inaccessible_ids = []

    header = None
    seen_titles = set()
    seen_ids = set()

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            # Detect header rows
            if "title" in [c.strip().lower() for c in row]:
                header = [c.strip().lower() for c in row]
                continue
            if header is None:
                continue

            record = {header[i]: row[i] if i < len(row) else "" for i in range(len(header))}
            title = record.get("title", "").strip()
            if not title or title.lower() in seen_titles:
                continue
            seen_titles.add(title.lower())

            venue, year = parse_conf(record.get("conf", ""))
            authors = clean_authors(record.get("authors", ""))
            abstract = record.get("abstract", "").strip()
            pdf_url = record.get("pdf_url", "").strip()

            from backend.utils.sanitize import sanitize_title
            paper_id = sanitize_title(title)
            if paper_id in seen_ids:
                continue
            seen_ids.add(paper_id)

            meta = {
                "paper_id": paper_id,
                "title": title,
                "authors": json.dumps(authors),
                "venue": venue,
                "year": year,
            }

            if abstract and pdf_url:
                meta["abstract"] = abstract
                meta["pdf_url"] = pdf_url
                accessible_docs.append(title)
                accessible_metas.append(meta)
                accessible_ids.append(paper_id)
            else:
                inaccessible_docs.append(title)
                inaccessible_metas.append(meta)
                inaccessible_ids.append(paper_id)

    print(f"Accessible papers: {len(accessible_docs)}")
    print(f"Inaccessible papers: {len(inaccessible_docs)}")


    def add_in_batches(collection, docs, metas, ids):
        total = len(docs)
        for i in range(0, total, batch_size):
            batch_docs = docs[i:i + batch_size]
            batch_metas = metas[i:i + batch_size]
            batch_ids = ids[i:i + batch_size]
            collection.add_texts(texts=batch_docs, metadatas=batch_metas, ids=batch_ids)
            done = min(i + batch_size, total)
            print(f"\r  {done}/{total}", end="", flush=True)
        print()

    if accessible_docs:
        print("Populating accessible collection...")
        db = Chroma(
            collection_name=accessible_name,
            embedding_function=embeddings,
            persist_directory=persist_dir,
        )
        add_in_batches(db, accessible_docs, accessible_metas, accessible_ids)
        print("Done.")

    if inaccessible_docs:
        print("Populating inaccessible collection...")
        db = Chroma(
            collection_name=inaccessible_name,
            embedding_function=embeddings,
            persist_directory=persist_dir,
        )
        add_in_batches(db, inaccessible_docs, inaccessible_metas, inaccessible_ids)
        print("Done.")

    print("ChromaDB population complete!")


if __name__ == "__main__":
    main()