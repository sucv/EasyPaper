"""Retrieval pipeline: OCR → metadata → tree build → tree search → save retrieval."""

import asyncio
import json
import re
import yaml
from pathlib import Path

from backend.config import get_config
from backend.tools.tree_search import search_tree, collect_node_content
from backend.tools.metadata_extractor import extract_metadata
from backend.tools.tree_builder import build_tree
from backend.tools.openalex import fetch_citation_count
from backend.tools.marker import ocr_pdf
from backend.models import PaperMetadata
from backend.utils.usage import usage_tracker
from backend.utils.streaming import retrieve_progress, make_event


def rewrite_image_paths(markdown: str, paper_id: str, idea_slug: str) -> str:
    """Rewrite image paths in markdown for cross-folder references."""
    def replace_path(match):
        alt = match.group(1)
        original_path = match.group(2)
        if original_path.startswith("http") or original_path.startswith("/"):
            return match.group(0)
        new_path = f"../../papers/{paper_id}/{original_path}"
        return f"![{alt}]({new_path})"
    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replace_path, markdown)


async def run_retrieval(
    project_path: str,
    idea_slug: str,
    idea_text: str,
    paper_ids: list[str],
    send_ws: callable,
    page_ranges: dict[str, str] | None = None,
):
    """Run full retrieval pipeline: OCR → metadata → tree → search → save."""
    cfg = get_config()
    project_id = Path(project_path).name
    papers_dir = Path(project_path) / "papers"
    idea_dir = Path(project_path) / "ideas" / idea_slug
    idea_dir.mkdir(parents=True, exist_ok=True)

    max_concurrency = cfg.retrieval_config.max_concurrency
    total = len(paper_ids)
    semaphore = asyncio.Semaphore(max_concurrency)
    completed = {"count": 0}
    lock = asyncio.Lock()

    async def process_paper(pid: str):
        async with semaphore:
            paper_dir = papers_dir / pid
            pdf_path = paper_dir / "paper.pdf"
            md_path = paper_dir / "paper.md"
            tree_path = paper_dir / "tree.json"
            retrieval_md = idea_dir / f"{pid}.md"

            async with lock:
                completed["count"] += 1
                current = completed["count"]

            # Skip if already retrieved
            if retrieval_md.exists():
                await send_ws(retrieve_progress(pid, pid, "skipped", current, total))
                return

            if not pdf_path.exists():
                await send_ws(retrieve_progress(pid, pid, "failed", current, total))
                return

            try:
                # Step 1: OCR
                if not md_path.exists():
                    await send_ws(retrieve_progress(pid, pid, "running", current, total))
                    pr = (page_ranges or {}).get(pid)
                    result = await ocr_pdf(str(pdf_path), str(paper_dir), page_range=pr if pr else None)
                    md_path.write_text(result["markdown"], encoding="utf-8")

                # Step 2: Metadata extraction
                title = pid
                if not tree_path.exists():
                    md_text = md_path.read_text(encoding="utf-8")
                    extracted = await extract_metadata(md_text, project_id=project_id)

                    # Load existing paper info from papers.json for fallback
                    papers_json = idea_dir / "papers.json"
                    paper_info = {}
                    if papers_json.exists():
                        pool = json.loads(papers_json.read_text(encoding="utf-8"))
                        for p in pool:
                            if p.get("paper_id") == pid:
                                paper_info = p
                                break

                    cite_title = extracted.get("title") or paper_info.get("title", pid)
                    cite_result = await fetch_citation_count(cite_title)

                    metadata = PaperMetadata(
                        paper_id=pid,
                        title=extracted.get("title") or paper_info.get("title", pid),
                        authors=extracted.get("authors") or paper_info.get("authors", []),
                        year=extracted.get("year") or paper_info.get("year"),
                        venue=extracted.get("venue") or paper_info.get("venue"),
                        abstract=extracted.get("abstract") or paper_info.get("abstract"),
                        citation_count=cite_result.get("citation_count") or paper_info.get("citation_count"),
                        source=paper_info.get("source", "accessible_db"),
                    )
                    title = metadata.title

                    # Step 3: Tree building
                    figures_dir = str(paper_dir / "figures")
                    tree_data = await build_tree(str(md_path), figures_dir=figures_dir, project_id=project_id)

                    tree_json = {
                        "metadata": metadata.model_dump(),
                        "tree": tree_data,
                    }
                    tree_path.write_text(json.dumps(tree_json, indent=2, ensure_ascii=False), encoding="utf-8")
                else:
                    tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
                    title = tree_json.get("metadata", {}).get("title", pid)

                # Step 4: Tree search retrieval
                await send_ws(retrieve_progress(pid, title, "running", current, total))
                tree_json_data = json.loads(tree_path.read_text(encoding="utf-8"))
                metadata_dict = tree_json_data.get("metadata", {})
                tree_data = tree_json_data.get("tree", {})

                relevant_ids = await search_tree(tree_data, idea_text, project_id=project_id)

                if not relevant_ids:
                    retrieval_md.write_text(
                        _format_retrieval(metadata_dict, [], idea_text, pid, idea_slug),
                        encoding="utf-8",
                    )
                else:
                    tree_nodes = tree_data.get("structure", [])
                    collected = collect_node_content(tree_nodes, set(relevant_ids))
                    content = _format_retrieval(metadata_dict, collected, idea_text, pid, idea_slug)
                    retrieval_md.write_text(content, encoding="utf-8")

                await send_ws(retrieve_progress(pid, title, "complete", current, total))

            except Exception as e:
                print(f"[RETRIEVAL] Error for {pid}: {e}")
                import traceback
                traceback.print_exc()
                await send_ws(retrieve_progress(pid, pid, "failed", current, total))
                from backend.utils.streaming import error_event
                await send_ws(error_event(str(e), recoverable=True, paper_id=pid))

    tasks = [process_paper(pid) for pid in paper_ids]
    await asyncio.gather(*tasks)

    await send_ws(make_event("retrieve_complete"))
    await usage_tracker.save(project_id, project_path)


def _format_retrieval(metadata: dict, sections: list[dict], idea_text: str, paper_id: str, idea_slug: str) -> str:
    """Format retrieval output as markdown with YAML frontmatter."""
    frontmatter = {
        "paper_id": metadata.get("paper_id", paper_id),
        "title": metadata.get("title", ""),
        "authors": metadata.get("authors", []),
        "year": metadata.get("year"),
        "venue": metadata.get("venue"),
        "abstract": metadata.get("abstract"),
        "citation_count": metadata.get("citation_count"),
        "source": metadata.get("source", ""),
        "idea": idea_text,
    }

    lines = ["---"]
    lines.append(yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True).strip())
    lines.append("---")
    lines.append("")
    lines.append(f"# Retrieved sections from: {metadata.get('title', paper_id)}")
    lines.append("")

    for section in sections:
        if section.get("type") == "figure":
            fig_path = section.get("figure_path", "")
            caption = section.get("caption", "")
            fig_path = f"../../papers/{paper_id}/{fig_path}"
            lines.append(f"![{caption}]({fig_path})")
            lines.append("")
        else:
            title = section.get("title", "")
            text = section.get("text", "")
            lines.append(f"## {title}")
            text = rewrite_image_paths(text, paper_id, idea_slug)
            lines.append(text)
            lines.append("")

    return "\n".join(lines)