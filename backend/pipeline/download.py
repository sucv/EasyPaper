"""Download pipeline: acquire PDFs for papers."""

import asyncio
import shutil
from pathlib import Path
import httpx

from backend.config import get_config
from backend.models import Paper
from backend.utils.sanitize import sanitize_title
from backend.utils.streaming import download_progress, download_complete, make_event
from backend.utils.usage import usage_tracker


def _get_page_count(pdf_path: Path) -> int:
    """Read page count from a PDF file."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(pdf_path))
        return len(reader.pages)
    except Exception:
        return 0


async def run_download(
    project_path: str,
    papers: list[Paper],
    send_ws: callable,
):
    """Download PDFs for a list of papers with concurrency control."""
    cfg = get_config()
    max_concurrency = cfg.marker_config.max_concurrency
    project_id = Path(project_path).name
    papers_dir = Path(project_path) / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)

    total = len(papers)
    semaphore = asyncio.Semaphore(max_concurrency)
    completed = {"count": 0}
    lock = asyncio.Lock()

    async def process_paper(paper: Paper):
        async with semaphore:
            pid = paper.paper_id
            paper_dir = papers_dir / pid
            paper_dir.mkdir(parents=True, exist_ok=True)
            pdf_path = paper_dir / "paper.pdf"

            async with lock:
                completed["count"] += 1
                current = completed["count"]

            # Skip if already exists
            if pdf_path.exists():
                pages = _get_page_count(pdf_path)
                await send_ws(download_progress(pid, paper.title, "skipped", current, total))
                return

            try:
                await send_ws(download_progress(pid, paper.title, "running", current, total))

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
                    download_success = False
                    last_err = None
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Connection": "keep-alive",
                        "Upgrade-Insecure-Requests": "1",
                        "Sec-Fetch-Dest": "document",
                        "Sec-Fetch-Mode": "navigate",
                        "Sec-Fetch-Site": "none",
                        "Pragma": "no-cache",
                        "Cache-Control": "no-cache",
                    }
                    for attempt in range(3):
                        try:
                            async with httpx.AsyncClient(
                                timeout=httpx.Timeout(120.0, connect=60.0),
                                follow_redirects=True,
                                verify=True,
                                headers=headers,
                                http2=True,
                            ) as client:
                                resp = await client.get(paper.pdf_url)
                                resp.raise_for_status()
                                content = resp.content
                                if len(content) < 1000:
                                    print(f"[DOWNLOAD] WARNING: Response too small ({len(content)} bytes)")
                                pdf_path.write_bytes(content)
                                download_success = True
                                break
                        except httpx.HTTPStatusError as e:
                            last_err = e
                            if e.response.status_code == 403:
                                # Try with Referer header on retry
                                from urllib.parse import urlparse
                                parsed = urlparse(paper.pdf_url)
                                headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"
                                wait = 5 * (attempt + 1)
                                print(f"[DOWNLOAD] 403 for {paper.pdf_url}, retrying with Referer in {wait}s...")
                                await asyncio.sleep(wait)
                            elif e.response.status_code >= 500:
                                wait = 5 * (attempt + 1)
                                print(f"[DOWNLOAD] {e.response.status_code} server error, retrying in {wait}s...")
                                await asyncio.sleep(wait)
                            else:
                                print(f"[DOWNLOAD] HTTP {e.response.status_code} for {paper.pdf_url}")
                                break
                        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as e:
                            last_err = e
                            wait = 5 * (attempt + 1)
                            print(f"[DOWNLOAD] Attempt {attempt+1}/3 failed: {type(e).__name__}. Retrying in {wait}s...")
                            await asyncio.sleep(wait)
                        except Exception as e:
                            last_err = e
                            print(f"[DOWNLOAD] Unexpected error: {e}")
                            break
                    if not download_success:
                        raise RuntimeError(f"Failed to download PDF after 3 attempts: {last_err}")
                else:
                    raise ValueError(f"No PDF source for {pid}")

                # Record page count
                pages = _get_page_count(pdf_path)
                if pages > 0:
                    await usage_tracker.record_pages(project_id, pages)

                await send_ws(download_progress(pid, paper.title, "complete", current, total))

            except Exception as e:
                print(f"[DOWNLOAD] Error for {pid}: {e}")
                import traceback
                traceback.print_exc()
                await send_ws(download_progress(pid, paper.title, "failed", current, total))
                from backend.utils.streaming import error_event
                await send_ws(error_event(str(e), recoverable=True, paper_id=pid))

    tasks = [process_paper(p) for p in papers]
    await asyncio.gather(*tasks)

    await send_ws(download_complete())
    await usage_tracker.save(project_id, project_path)