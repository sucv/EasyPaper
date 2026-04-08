"""LangGraph-based research pipeline: discover → delegate → synthesize → save."""

import asyncio
import yaml
from datetime import datetime
from pathlib import Path
from typing import Any, TypedDict

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END

from backend.config import get_config
from backend.utils.usage import usage_tracker, estimate_tokens
from backend.utils.streaming import research_progress


class ResearchState(TypedDict):
    idea_dir: str
    idea_text: str
    project_path: str
    task_config: dict
    model: str
    model_kwargs: dict
    files: list[dict]
    worker_results: list[dict]
    final_report: str
    report_title: str
    report_filename: str


def _parse_frontmatter(md_path: Path) -> tuple[dict, str]:
    """Parse YAML frontmatter and content from a markdown file."""
    text = md_path.read_text(encoding="utf-8")
    metadata = {}
    content = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            try:
                metadata = yaml.safe_load(parts[1]) or {}
            except Exception:
                pass
            content = parts[2].strip()
    return metadata, content


def _format_metadata(meta: dict) -> str:
    """Format metadata dict into readable string."""
    parts = []
    if meta.get("title"):
        parts.append(f"Title: {meta['title']}")
    authors = meta.get("authors", [])
    if authors:
        parts.append(f"Authors: {', '.join(authors) if isinstance(authors, list) else authors}")
    if meta.get("year"):
        parts.append(f"Year: {meta['year']}")
    if meta.get("venue"):
        parts.append(f"Venue: {meta['venue']}")
    if meta.get("citation_count") is not None:
        parts.append(f"Citations: {meta['citation_count']}")
    return "\n".join(parts)


async def discover_node(state: ResearchState, config: RunnableConfig) -> dict:
    """List and read retrieval files (and optionally paper content)."""
    send_ws = config.get("configurable", {}).get("send_ws")
    if send_ws:
        await send_ws(research_progress("running", "Discovering files..."))

    idea_dir = Path(state["idea_dir"])
    project_path = state["project_path"]
    task_config = state["task_config"]
    content_source = task_config.get("content_source", "retrieval")

    files = []
    for md_file in sorted(idea_dir.glob("*.md")):
        if md_file.name == "idea.txt":
            continue

        metadata, content = _parse_frontmatter(md_file)
        paper_id = md_file.stem

        file_entry = {
            "filename": md_file.name,
            "paper_id": paper_id,
            "metadata": metadata,
            "content": content,
        }

        if content_source == "paper":
            paper_md = Path(project_path) / "papers" / paper_id / "paper.md"
            if paper_md.exists():
                file_entry["content"] = paper_md.read_text(encoding="utf-8")

        files.append(file_entry)

    return {"files": files}


async def delegate_node(state: ResearchState, config: RunnableConfig) -> dict:
    """Run worker LLM calls in parallel with concurrency control."""
    send_ws = config.get("configurable", {}).get("send_ws")
    cfg = get_config()
    max_concurrency = cfg.research_task_config.max_worker_concurrency

    files = state["files"]
    task_config = state["task_config"]
    model_str = state["model"]
    model_kwargs = state.get("model_kwargs", {})
    project_id = Path(state["project_path"]).name

    if not files:
        return {"worker_results": []}

    worker_prompt_template = task_config["worker_prompt"]

    model = init_chat_model(model_str, max_retries=3, **model_kwargs)

    semaphore = asyncio.Semaphore(max_concurrency)
    total = len(files)
    completed = {"count": 0}
    lock = asyncio.Lock()

    async def process_one(file_entry: dict) -> dict:
        async with semaphore:
            async with lock:
                completed["count"] += 1
                current = completed["count"]

            paper_title = file_entry["metadata"].get("title", file_entry["filename"])
            if send_ws:
                await send_ws(research_progress("running", f"Analyzing paper {current}/{total}: {paper_title}"))

            meta = file_entry["metadata"]
            authors = meta.get("authors", [])
            authors_str = ", ".join(authors) if isinstance(authors, list) else str(authors)

            prompt = worker_prompt_template.format(
                content=file_entry["content"],
                metadata=_format_metadata(meta),
                title=meta.get("title", "Unknown"),
                authors=authors_str,
                year=meta.get("year", "Unknown"),
                venue=meta.get("venue", "Unknown"),
                citation_count=meta.get("citation_count", "N/A"),
            )

            try:
                result = await model.ainvoke([HumanMessage(content=prompt)])

                input_tokens = 0
                output_tokens = 0
                if hasattr(result, "usage_metadata") and result.usage_metadata:
                    input_tokens = result.usage_metadata.get("input_tokens", 0)
                    output_tokens = result.usage_metadata.get("output_tokens", 0)
                else:
                    input_tokens = estimate_tokens(prompt)
                    output_tokens = estimate_tokens(result.content)
                await usage_tracker.record_tokens(project_id, "research_worker", input_tokens, output_tokens)

                return {
                    "filename": file_entry["filename"],
                    "paper_title": paper_title,
                    "result": result.content,
                    "success": True,
                }
            except Exception as e:
                print(f"[RESEARCH] Worker error for {file_entry['filename']}: {e}")
                return {
                    "filename": file_entry["filename"],
                    "paper_title": paper_title,
                    "result": f"Error analyzing this paper: {str(e)}",
                    "success": False,
                }

    tasks = [process_one(f) for f in files]
    results = await asyncio.gather(*tasks)

    return {"worker_results": list(results)}


async def synthesize_node(state: ResearchState, config: RunnableConfig) -> dict:
    """Synthesize all worker results into a final report."""
    send_ws = config.get("configurable", {}).get("send_ws")
    if send_ws:
        await send_ws(research_progress("running", "Synthesizing report..."))

    task_config = state["task_config"]
    model_str = state["model"]
    model_kwargs = state.get("model_kwargs", {})
    worker_results = state["worker_results"]
    idea_text = state["idea_text"]
    project_id = Path(state["project_path"]).name

    results_text = ""
    for wr in worker_results:
        results_text += f"\n\n## Paper: {wr['paper_title']}\n\n{wr['result']}"

    synthesis_prompt = task_config["synthesis_prompt"].format(
        worker_results=results_text,
        idea_text=idea_text,
    )

    model = init_chat_model(model_str, max_retries=3, **model_kwargs)
    result = await model.ainvoke([HumanMessage(content=synthesis_prompt)])

    input_tokens = 0
    output_tokens = 0
    if hasattr(result, "usage_metadata") and result.usage_metadata:
        input_tokens = result.usage_metadata.get("input_tokens", 0)
        output_tokens = result.usage_metadata.get("output_tokens", 0)
    else:
        input_tokens = estimate_tokens(synthesis_prompt)
        output_tokens = estimate_tokens(result.content)
    await usage_tracker.record_tokens(project_id, "research_synthesis", input_tokens, output_tokens)

    report_content = result.content
    report_title = task_config.get("display_name", "Report")
    lines = report_content.split("\n")
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().startswith("REPORT_TITLE:"):
            report_title = lines[i].strip().replace("REPORT_TITLE:", "").strip()
            report_content = "\n".join(lines[:i]).strip()
            break

    return {"final_report": report_content, "report_title": report_title}


async def save_node(state: ResearchState, config: RunnableConfig) -> dict:
    """Save the report with YAML frontmatter."""
    send_ws = config.get("configurable", {}).get("send_ws")
    if send_ws:
        await send_ws(research_progress("running", "Saving report..."))

    idea_dir = Path(state["idea_dir"])
    idea_slug = idea_dir.name
    task_config = state["task_config"]
    report_content = state["final_report"]
    report_title = state["report_title"]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = task_config["filename_template"].format(
        idea_slug=idea_slug,
        timestamp=timestamp,
        task_id=task_config["task_id"],
    )
    if not filename.endswith(".md"):
        filename += ".md"

    frontmatter = {
        "title": report_title,
        "task_id": task_config["task_id"],
        "task_name": task_config["display_name"],
        "model": state["model"],
        "idea": state["idea_text"],
        "created_at": datetime.now().isoformat(),
        "papers_analyzed": len(state["worker_results"]),
    }
    fm_str = yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True).strip()
    full_content = f"---\n{fm_str}\n---\n\n{report_content}"

    reports_dir = idea_dir / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_path = reports_dir / filename
    counter = 1
    while report_path.exists():
        stem = filename.replace(".md", "")
        report_path = reports_dir / f"{stem}_{counter}.md"
        counter += 1
    report_path.write_text(full_content, encoding="utf-8")

    return {"report_filename": report_path.name}


def build_research_graph() -> Any:
    """Build and compile the research LangGraph."""
    builder = StateGraph(ResearchState)
    builder.add_node("discover", discover_node)
    builder.add_node("delegate", delegate_node)
    builder.add_node("synthesize", synthesize_node)
    builder.add_node("save", save_node)
    builder.add_edge(START, "discover")
    builder.add_edge("discover", "delegate")
    builder.add_edge("delegate", "synthesize")
    builder.add_edge("synthesize", "save")
    builder.add_edge("save", END)
    return builder.compile()