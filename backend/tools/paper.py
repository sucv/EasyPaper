"""Tools for accessing indexed papers: listing, viewing structure, reading sections, searching."""

import json
from pathlib import Path
from langchain_core.tools import tool
from langchain.tools import ToolRuntime
from backend.config import get_config
from backend.tools.tree_search import search_tree, collect_node_content


def _get_project_path(runtime: ToolRuntime) -> str:
    return runtime.config.get("configurable", {}).get("project_path", "")


def _get_scope(runtime: ToolRuntime) -> str:
    return runtime.config.get("configurable", {}).get("scope", "all")


def _get_scoped_paper_ids(project_path: str, scope: str) -> set[str] | None:
    """Return set of paper_ids in scope, or None for 'all'."""
    if scope == "all" or not scope:
        return None
    if scope.startswith("idea:"):
        idea_slug = scope.split(":", 1)[1]
        papers_json = Path(project_path) / "ideas" / idea_slug / "papers.json"
        if papers_json.exists():
            pool = json.loads(papers_json.read_text(encoding="utf-8"))
            return {p["paper_id"] for p in pool}
        return set()
    return None


@tool
def list_papers(runtime: ToolRuntime) -> str:
    """List all indexed papers in the project with their metadata (title, authors, year, venue, abstract).
    Use this to understand what papers are available before searching."""
    project_path = _get_project_path(runtime)
    scope = _get_scope(runtime)
    scoped_ids = _get_scoped_paper_ids(project_path, scope)

    papers_dir = Path(project_path) / "papers"
    if not papers_dir.exists():
        return json.dumps({"papers": [], "count": 0})

    results = []
    for paper_dir in papers_dir.iterdir():
        if not paper_dir.is_dir():
            continue
        tree_path = paper_dir / "tree.json"
        if not tree_path.exists():
            continue
        if scoped_ids is not None and paper_dir.name not in scoped_ids:
            continue
        try:
            tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
            meta = tree_json.get("metadata", {})
            results.append({
                "paper_id": meta.get("paper_id", paper_dir.name),
                "title": meta.get("title", ""),
                "authors": meta.get("authors", []),
                "year": meta.get("year"),
                "venue": meta.get("venue"),
                "abstract": meta.get("abstract", ""),
                "citation_count": meta.get("citation_count"),
            })
        except Exception:
            pass

    return json.dumps({"papers": results, "count": len(results)}, ensure_ascii=False)


@tool
def view_paper_structure(paper_id: str, runtime: ToolRuntime) -> str:
    """View the hierarchical tree structure of a specific paper.
    Shows section titles and summaries without full text. Use this to decide which sections to read.

    Args:
        paper_id: The paper identifier to examine.
    """
    project_path = _get_project_path(runtime)
    tree_path = Path(project_path) / "papers" / paper_id / "tree.json"
    if not tree_path.exists():
        return json.dumps({"error": f"Paper '{paper_id}' not found"})

    tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
    meta = tree_json.get("metadata", {})
    structure = tree_json.get("tree", {}).get("structure", [])

    def strip_text(nodes):
        result = []
        for node in nodes:
            clean = {
                "node_id": node.get("node_id", ""),
                "title": node.get("title", ""),
            }
            if node.get("summary"):
                clean["summary"] = node["summary"]
            if node.get("prefix_summary"):
                clean["prefix_summary"] = node["prefix_summary"]
            if node.get("type") == "figure":
                clean["type"] = "figure"
                clean["caption"] = node.get("caption", "")
            if node.get("nodes"):
                clean["nodes"] = strip_text(node["nodes"])
            result.append(clean)
        return result

    return json.dumps({
        "paper_id": paper_id,
        "title": meta.get("title", ""),
        "authors": meta.get("authors", []),
        "year": meta.get("year"),
        "venue": meta.get("venue"),
        "structure": strip_text(structure),
    }, ensure_ascii=False)


@tool
def read_paper_sections(paper_id: str, node_ids: str, runtime: ToolRuntime) -> str:
    """Read the full text of specific sections from a paper.

    Args:
        paper_id: The paper identifier.
        node_ids: Comma-separated list of node IDs to read (e.g., '0001,0003,fig_1').
    """
    project_path = _get_project_path(runtime)
    tree_path = Path(project_path) / "papers" / paper_id / "tree.json"
    if not tree_path.exists():
        return json.dumps({"error": f"Paper '{paper_id}' not found"})

    tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
    meta = tree_json.get("metadata", {})
    structure = tree_json.get("tree", {}).get("structure", [])

    ids = [nid.strip() for nid in node_ids.split(",")]
    collected = collect_node_content(structure, set(ids))

    return json.dumps({
        "paper_id": paper_id,
        "title": meta.get("title", ""),
        "authors": meta.get("authors", []),
        "year": meta.get("year"),
        "venue": meta.get("venue"),
        "sections": collected,
    }, ensure_ascii=False)


@tool
async def search_papers(query: str, runtime: ToolRuntime) -> str:
    """Search across all indexed papers for content relevant to a query.
    Performs tree-based retrieval: examines paper structures and extracts relevant sections.
    Returns excerpts with full citation metadata.

    Args:
        query: The research question or topic to search for.
    """
    project_path = _get_project_path(runtime)
    scope = _get_scope(runtime)
    cfg = get_config()
    scoped_ids = _get_scoped_paper_ids(project_path, scope)

    project_id = Path(project_path).name

    papers_dir = Path(project_path) / "papers"
    if not papers_dir.exists():
        return json.dumps({"results": [], "message": "No papers directory found"})

    papers = []
    for paper_dir in papers_dir.iterdir():
        if not paper_dir.is_dir():
            continue
        tree_path = paper_dir / "tree.json"
        if not tree_path.exists():
            continue
        if scoped_ids is not None and paper_dir.name not in scoped_ids:
            continue
        try:
            tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
            meta = tree_json.get("metadata", {})
            papers.append({
                "paper_id": meta.get("paper_id", paper_dir.name),
                "title": meta.get("title", ""),
                "authors": meta.get("authors", []),
                "year": meta.get("year"),
                "venue": meta.get("venue"),
                "tree_path": str(tree_path),
            })
        except Exception:
            pass

    if not papers:
        return json.dumps({"results": [], "message": "No indexed papers found in scope"})

    max_papers = cfg.chat_config.max_papers_per_search
    results = []

    for paper in papers[:max_papers]:
        pid = paper["paper_id"]
        try:
            tree_json = json.loads(Path(paper["tree_path"]).read_text(encoding="utf-8"))
            tree_data = tree_json.get("tree", {})

            relevant_ids = await search_tree(tree_data, query, project_id=project_id)
            if relevant_ids:
                structure = tree_data.get("structure", [])
                collected = collect_node_content(structure, set(relevant_ids))
                if collected:
                    results.append({
                        "paper_id": pid,
                        "title": paper.get("title", ""),
                        "authors": paper.get("authors", []),
                        "year": paper.get("year"),
                        "venue": paper.get("venue"),
                        "sections": collected,
                    })
        except Exception as e:
            print(f"[TOOLS] Tree search failed for {pid}: {e}")

    return json.dumps({
        "results": results,
        "papers_searched": len(papers),
    }, ensure_ascii=False)