"""Retrieval pipeline: tree search per paper per idea — concurrent."""

import asyncio
import json
import yaml
from pathlib import Path

from backend.config import get_config
from backend.tools.tree_search import search_tree, collect_node_content
from backend.utils.usage import usage_tracker
from backend.pipeline.image_rewriter import rewrite_image_paths
from backend.utils.streaming import retrieve_progress, make_event
from backend.models import PaperMetadata


async def run_retrieval(
    project_path: str,
    idea_slug: str,
    idea_text: str,
    paper_ids: list[str],
    send_ws: callable,
):
    """Run tree-based retrieval for papers in an idea (concurrent)."""
    cfg = get_config()
    project_id = Path(project_path).name
    papers_dir = Path(project_path) / "papers"
    idea_dir = Path(project_path) / "ideas" / idea_slug
    idea_dir.mkdir(parents=True, exist_ok=True)
    total = len(paper_ids)

    max_concurrency = cfg.retrieval_config.max_concurrency
    semaphore = asyncio.Semaphore(max_concurrency)
    completed = {"count": 0}
    lock = asyncio.Lock()

    async def process_paper(pid: str):
        async with semaphore:
            retrieval_md = idea_dir / f"{pid}.md"

            async with lock:
                completed["count"] += 1
                current = completed["count"]

            # Skip already retrieved
            if retrieval_md.exists():
                await send_ws(retrieve_progress(pid, pid, "skipped", current, total))
                return

            tree_path = papers_dir / pid / "tree.json"
            if not tree_path.exists():
                await send_ws(retrieve_progress(pid, pid, "failed", current, total))
                return

            try:
                await send_ws(retrieve_progress(pid, pid, "running", current, total))

                tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
                metadata = tree_json.get("metadata", {})
                tree_data = tree_json.get("tree", {})

                # LLM tree search
                relevant_ids = await search_tree(tree_data, idea_text, project_id=project_id)

                if not relevant_ids:
                    await send_ws(retrieve_progress(pid, metadata.get("title", pid), "complete", current, total))
                    retrieval_md.write_text(
                        _format_retrieval(metadata, [], idea_text, pid, idea_slug),
                        encoding="utf-8",
                    )
                    return

                # Collect content
                tree_nodes = tree_data.get("structure", [])
                collected = collect_node_content(tree_nodes, set(relevant_ids))

                # Format and save
                content = _format_retrieval(metadata, collected, idea_text, pid, idea_slug)
                retrieval_md.write_text(content, encoding="utf-8")

                await send_ws(retrieve_progress(pid, metadata.get("title", pid), "complete", current, total))

            except Exception as e:
                print(f"[RETRIEVAL] Error for {pid}: {e}")
                import traceback
                traceback.print_exc()
                await send_ws(retrieve_progress(pid, pid, "failed", current, total))
                from backend.utils.streaming import error_event
                await send_ws(error_event(str(e), recoverable=True, paper_id=pid))

    # Launch all tasks — semaphore limits concurrency
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