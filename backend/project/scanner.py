"""Reconstruct project state from filesystem."""

import json
import yaml
from pathlib import Path
from backend.models import (
    ProjectState, PaperMetadata, IdeaState, Paper, ReportInfo,
)
from backend.utils.sanitize import desanitize_slug


def scan_project(project_path: str) -> ProjectState:
    """Reconstruct full project state from the filesystem."""
    pp = Path(project_path)
    project_id = pp.name

    # Scan indexed papers
    indexed_papers: dict[str, PaperMetadata] = {}
    papers_dir = pp / "papers"
    if papers_dir.exists():
        for paper_dir in papers_dir.iterdir():
            if not paper_dir.is_dir():
                continue
            tree_path = paper_dir / "tree.json"
            if tree_path.exists():
                try:
                    tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
                    meta = tree_json.get("metadata", {})
                    pm = PaperMetadata(**meta)
                    indexed_papers[pm.paper_id] = pm
                except Exception:
                    pass

    # Scan ideas
    ideas: list[IdeaState] = []
    ideas_dir = pp / "ideas"
    if ideas_dir.exists():
        for idea_dir in ideas_dir.iterdir():
            if not idea_dir.is_dir():
                continue

            slug = idea_dir.name
            idea_txt_path = idea_dir / "idea.txt"
            if idea_txt_path.exists():
                idea_text = idea_txt_path.read_text(encoding="utf-8").strip()
            else:
                idea_text = desanitize_slug(slug)

            # Load paper pool
            idea_papers: list[Paper] = []
            papers_json_path = idea_dir / "papers.json"
            if papers_json_path.exists():
                try:
                    pool = json.loads(papers_json_path.read_text(encoding="utf-8"))
                    for p in pool:
                        pid = p.get("paper_id", "")
                        has_retrieval = (idea_dir / f"{pid}.md").exists()
                        has_pdf = (pp / "papers" / pid / "paper.pdf").exists()
                        has_tree = pid in indexed_papers
                        if has_retrieval:
                            status = "retrieved"
                        elif has_pdf:
                            status = "downloaded"
                        else:
                            status = "pending"

                        paper = Paper(
                            paper_id=pid,
                            title=p.get("title", pid),
                            authors=p.get("authors", []),
                            year=p.get("year"),
                            venue=p.get("venue"),
                            abstract=p.get("abstract"),
                            citation_count=p.get("citation_count"),
                            source=p.get("source", "accessible_db"),
                            pdf_url=p.get("pdf_url"),
                            status=status,
                            indexed=has_tree,
                        )

                        # Merge richer metadata from indexed papers
                        if pid in indexed_papers:
                            idx = indexed_papers[pid]
                            if idx.title:
                                paper.title = idx.title
                            if idx.authors:
                                paper.authors = idx.authors
                            if idx.year is not None:
                                paper.year = idx.year
                            if idx.venue:
                                paper.venue = idx.venue
                            if idx.citation_count is not None:
                                paper.citation_count = idx.citation_count
                            if idx.abstract:
                                paper.abstract = idx.abstract

                        idea_papers.append(paper)
                except Exception:
                    pass
            else:
                # Fallback: reconstruct from retrieval markdowns
                for md_file in idea_dir.glob("*.md"):
                    if md_file.name == "idea.txt":
                        continue
                    paper_id = md_file.stem
                    meta = _read_frontmatter(md_file)
                    if meta:
                        idea_papers.append(Paper(
                            paper_id=meta.get("paper_id", paper_id),
                            title=meta.get("title", paper_id),
                            authors=meta.get("authors", []),
                            year=meta.get("year"),
                            venue=meta.get("venue"),
                            abstract=meta.get("abstract"),
                            citation_count=meta.get("citation_count"),
                            status="retrieved",
                            indexed=paper_id in indexed_papers,
                        ))

            # Scan reports
            reports: list[ReportInfo] = []
            reports_dir = idea_dir / "reports"
            if reports_dir.exists():
                for rpt in reports_dir.glob("*.md"):
                    reports.append(ReportInfo(
                        filename=rpt.name,
                        display_name=rpt.stem.replace("_", " ").title(),
                        path=str(rpt),
                    ))

            ideas.append(IdeaState(
                idea_text=idea_text,
                idea_slug=slug,
                papers=idea_papers,
                reports=reports,
            ))

    return ProjectState(
        project_id=project_id,
        indexed_papers=indexed_papers,
        ideas=ideas,
    )


def _read_frontmatter(md_path: Path) -> dict | None:
    try:
        text = md_path.read_text(encoding="utf-8")
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                return yaml.safe_load(parts[1])
    except Exception:
        pass
    return None