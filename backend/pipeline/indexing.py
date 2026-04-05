"""Indexing pipeline: download → OCR → metadata → tree build."""

import asyncio
import json
import os
import shutil
from pathlib import Path
import httpx

from backend.config import get_config
from backend.models import PaperEntry, PaperMetadata
from backend.tools.marker import ocr_pdf
from backend.tools.metadata_extractor import extract_metadata
from backend.tools.tree_builder import build_tree
from backend.tools.openalex import fetch_citation_count
from backend.tools.dedup import check_duplicate
from backend.utils.sanitize import sanitize_title
from backend.utils.streaming import index_progress
from backend.utils.usage import usage_tracker


async def run_indexing(
    project_path: str,
    papers: list[PaperEntry],
    send_ws: callable,
):
    """Run indexing for a list of papers with concurrency control."""
    from backend.config import get_config
    cfg = get_config()
    max_concurrency = cfg.marker_config.max_concurrency

    # Set project context for usage tracking in tools
    project_id = Path(project_path).name

    total = len(papers)
    papers_dir = Path(project_path) / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)

    semaphore = asyncio.Semaphore(max_concurrency)
    completed = {"count": 0}  # mutable counter shared across tasks
    lock = asyncio.Lock()

    async def process_paper(idx: int, paper: PaperEntry):
        async with semaphore:
            pid = paper.paper_id
            paper_dir = papers_dir / pid
            paper_dir.mkdir(parents=True, exist_ok=True)
            tree_path = paper_dir / "tree.json"

            # Update current count
            async with lock:
                completed["count"] += 1
                current = completed["count"]

            # Step 0: Already indexed?
            if tree_path.exists():
                await send_ws(index_progress(pid, paper.title, "complete", "skipped", current, total))
                return

            try:
                # Step 1: Acquire PDF
                pdf_path = paper_dir / "paper.pdf"
                if not pdf_path.exists():
                    await send_ws(index_progress(pid, paper.title, "downloading", "running", current, total))
                    if paper.source == "user_provided":
                        user_papers_dir = Path(project_path) / "user_papers"
                        src = None
                        for f in user_papers_dir.glob("*.pdf"):
                            if sanitize_title(f.stem) == pid:
                                src = f
                                break
                        if src:
                            shutil.copy2(src, pdf_path)
                        else:
                            raise FileNotFoundError(f"User PDF not found for {pid}")
                    elif paper.pdf_url:
                        print(f"[INDEX] Downloading: {paper.pdf_url}")
                        download_success = False
                        last_err = None
                        for attempt in range(3):
                            try:
                                async with httpx.AsyncClient(
                                    timeout=httpx.Timeout(120.0, connect=60.0),
                                    follow_redirects=True,
                                    verify=True,
                                    headers={
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                        "Accept": "application/pdf,*/*",
                                    },
                                ) as client:
                                    resp = await client.get(paper.pdf_url)
                                    resp.raise_for_status()
                                    content = resp.content
                                    if len(content) < 1000:
                                        print(f"[INDEX] WARNING: Response too small ({len(content)} bytes)")
                                    pdf_path.write_bytes(content)
                                    print(f"[INDEX] Downloaded {len(content)} bytes -> {pdf_path}")
                                    download_success = True
                                    break
                            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as e:
                                last_err = e
                                wait = 5 * (attempt + 1)
                                print(f"[INDEX] Attempt {attempt+1}/3 failed: {type(e).__name__}. Retrying in {wait}s...")
                                await asyncio.sleep(wait)
                            except Exception as e:
                                last_err = e
                                print(f"[INDEX] Download error: {e}")
                                break
                        if not download_success:
                            raise RuntimeError(f"Failed to download PDF after 3 attempts: {last_err}")
                    else:
                        raise ValueError(f"No PDF source for {pid} (source={paper.source}, pdf_url={paper.pdf_url})")
                    await send_ws(index_progress(pid, paper.title, "downloading", "complete", current, total))

                # Step 2: OCR
                md_path = paper_dir / "paper.md"
                if not md_path.exists():
                    await send_ws(index_progress(pid, paper.title, "ocr", "running", current, total))
                    result = await ocr_pdf(str(pdf_path), str(paper_dir))
                    md_path.write_text(result["markdown"], encoding="utf-8")
                    await usage_tracker.record_pdf(project_id)
                    await send_ws(index_progress(pid, paper.title, "ocr", "complete", current, total))

                # Step 3: Metadata
                await send_ws(index_progress(pid, paper.title, "metadata", "running", current, total))
                md_text = md_path.read_text(encoding="utf-8")
                extracted = await extract_metadata(md_text, project_id=project_id)
                cite_title = extracted.get("title") or paper.title
                cite_result = await fetch_citation_count(cite_title)

                metadata = PaperMetadata(
                    paper_id=pid,
                    title=extracted.get("title") or paper.title,
                    authors=extracted.get("authors") or paper.authors,
                    year=extracted.get("year") or paper.year,
                    venue=extracted.get("venue") or paper.venue,
                    abstract=extracted.get("abstract") or paper.abstract,
                    citation_count=cite_result.get("citation_count") or paper.citation_count,
                    source=paper.source if paper.source != "inaccessible_db" else "accessible_db",
                )
                await send_ws(index_progress(pid, paper.title, "metadata", "complete", current, total))

                # Step 4: Tree building
                await send_ws(index_progress(pid, paper.title, "tree_building", "running", current, total))
                figures_dir = str(paper_dir / "figures")
                tree_data = await build_tree(str(md_path), figures_dir=figures_dir, project_id=project_id)

                tree_json = {
                    "metadata": metadata.model_dump(),
                    "tree": tree_data,
                }
                tree_path.write_text(json.dumps(tree_json, indent=2, ensure_ascii=False), encoding="utf-8")
                await send_ws(index_progress(pid, paper.title, "tree_building", "complete", current, total))

            except Exception as e:
                import traceback
                print(f"[INDEX] ERROR for {pid}: {e}")
                traceback.print_exc()
                await send_ws(index_progress(pid, paper.title, "failed", "failed", current, total))
                from backend.utils.streaming import error_event
                await send_ws(error_event(str(e), recoverable=True, paper_id=pid))

    # Launch all tasks — semaphore limits actual concurrency
    tasks = [process_paper(idx, paper) for idx, paper in enumerate(papers)]
    await asyncio.gather(*tasks)

    from backend.utils.streaming import make_event
    await send_ws(make_event("index_complete"))
    await usage_tracker.save(project_id, project_path)