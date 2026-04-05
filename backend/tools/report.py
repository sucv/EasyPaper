"""Tools for report generation and retrieval: reading/listing retrieval files, reports, and writing reports."""

import json
from pathlib import Path
from langchain_core.tools import tool
from langchain.tools import ToolRuntime


def _get_idea_dir(runtime: ToolRuntime) -> str:
    return runtime.config.get("configurable", {}).get("idea_dir", "")


def _get_project_path(runtime: ToolRuntime) -> str:
    return runtime.config.get("configurable", {}).get("project_path", "")


def _get_scope(runtime: ToolRuntime) -> str:
    return runtime.config.get("configurable", {}).get("scope", "all")


@tool
def read_retrieval_file(filename: str, runtime: ToolRuntime) -> str:
    """Read a retrieval markdown file from the current idea.

    Args:
        filename: Name of the file to read (e.g., 'paper_name.md').
    """
    idea_dir = _get_idea_dir(runtime)
    if not idea_dir:
        return "Error: idea_dir not configured"

    path = Path(idea_dir) / filename
    if not path.exists():
        path = Path(idea_dir) / f"{filename}.md"
    if not path.exists():
        return f"Error: file '{filename}' not found in idea directory"
    return path.read_text(encoding="utf-8")


@tool
def list_retrieval_files(runtime: ToolRuntime) -> str:
    """List all retrieval markdown files in the current idea."""
    idea_dir = _get_idea_dir(runtime)
    if not idea_dir:
        return json.dumps({"files": [], "count": 0, "error": "idea_dir not configured"})

    files = []
    for f in sorted(Path(idea_dir).glob("*.md")):
        if f.name == "idea.txt":
            continue
        files.append(f.name)
    return json.dumps({"files": files, "count": len(files)})


@tool
def write_report(filename: str, content: str, runtime: ToolRuntime) -> str:
    """Write a report to the reports/ directory.

    Args:
        filename: Name for the report file (e.g., 'analysis.md').
        content: The full markdown content of the report.
    """
    idea_dir = _get_idea_dir(runtime)
    if not idea_dir:
        return "Error: idea_dir not configured"

    reports_dir = Path(idea_dir) / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    if not filename.endswith(".md"):
        filename += ".md"
    path = reports_dir / filename
    counter = 1
    while path.exists():
        stem = filename.replace(".md", "")
        path = reports_dir / f"{stem}_{counter}.md"
        counter += 1
    path.write_text(content, encoding="utf-8")
    return f"Report saved: {path.name}"


@tool
def list_reports(runtime: ToolRuntime) -> str:
    """List all generated reports and retrieval files across all ideas in the project.
    Returns reports grouped by idea, including idea text for context.
    Use this when the user references reports, analyses, or previously generated content."""
    project_path = _get_project_path(runtime)
    scope = _get_scope(runtime)

    ideas_dir = Path(project_path) / "ideas"
    if not ideas_dir.exists():
        return json.dumps({"ideas": [], "total_reports": 0})

    results = []
    total = 0

    for idea_dir in sorted(ideas_dir.iterdir()):
        if not idea_dir.is_dir():
            continue

        if scope.startswith("idea:"):
            scoped_slug = scope.split(":", 1)[1]
            if idea_dir.name != scoped_slug:
                continue

        idea_txt_path = idea_dir / "idea.txt"
        idea_text = idea_txt_path.read_text(encoding="utf-8").strip() if idea_txt_path.exists() else idea_dir.name

        reports = []
        reports_dir = idea_dir / "reports"
        if reports_dir.exists():
            for f in sorted(reports_dir.glob("*.md")):
                reports.append({
                    "filename": f.name,
                    "display_name": f.stem.replace("_", " ").title(),
                    "type": "report",
                })
                total += 1

        retrievals = []
        for f in sorted(idea_dir.glob("*.md")):
            if f.name == "idea.txt":
                continue
            retrievals.append({
                "filename": f.name,
                "display_name": f.stem.replace("_", " ").title(),
                "type": "retrieval",
            })

        if reports or retrievals:
            results.append({
                "idea_slug": idea_dir.name,
                "idea_text": idea_text,
                "reports": reports,
                "retrievals": retrievals,
            })

    return json.dumps({
        "ideas": results,
        "total_reports": total,
        "total_ideas": len(results),
    }, ensure_ascii=False)


@tool
def read_report(idea_slug: str, filename: str, runtime: ToolRuntime) -> str:
    """Read the full content of a report or retrieval file from a specific idea.

    Args:
        idea_slug: The idea folder name (from list_reports output).
        filename: The file name (from list_reports output, e.g., 'comparative_analysis.md').
    """
    project_path = _get_project_path(runtime)
    idea_dir = Path(project_path) / "ideas" / idea_slug

    file_path = idea_dir / "reports" / filename
    if not file_path.exists():
        file_path = idea_dir / filename
    if not file_path.exists():
        candidates = []
        if (idea_dir / "reports").exists():
            candidates.extend((idea_dir / "reports").glob("*.md"))
        candidates.extend(f for f in idea_dir.glob("*.md") if f.name != "idea.txt")

        search = filename.lower().replace(".md", "").replace("_", " ")
        best_match = None
        best_score = 0
        for c in candidates:
            candidate_name = c.stem.lower().replace("_", " ")
            if search in candidate_name or candidate_name in search:
                if len(candidate_name) > best_score:
                    best_score = len(candidate_name)
                    best_match = c

        if best_match:
            file_path = best_match
        else:
            return json.dumps({
                "error": f"File '{filename}' not found in idea '{idea_slug}'",
                "available_files": [c.name for c in candidates],
            })

    content = file_path.read_text(encoding="utf-8")

    idea_txt = idea_dir / "idea.txt"
    idea_text = idea_txt.read_text(encoding="utf-8").strip() if idea_txt.exists() else idea_slug

    return json.dumps({
        "idea_slug": idea_slug,
        "idea_text": idea_text,
        "filename": file_path.name,
        "type": "report" if "reports" in str(file_path) else "retrieval",
        "content": content,
    }, ensure_ascii=False)