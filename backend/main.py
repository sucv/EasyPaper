"""FastAPI application — REST endpoints + WebSocket handler."""

from datetime import datetime
import asyncio
import json
from pathlib import Path
from contextlib import asynccontextmanager
from pydantic import BaseModel

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, UploadFile, File as FastAPIFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response

from backend.config import get_config
from backend.models import (
    SearchRequest, DedupCheckRequest, DedupCheckResponse,
    CitationRequest, CitationResponse, CreateIdeaRequest,
    AssignPapersRequest, ResearchRequest, BusyStateResponse,
    Paper, PaperMetadata,
    BatchDedupRequest, BatchCitationRequest,
)
from backend.project.manager import (
    create_project, list_projects, get_project_path,
    delete_project, create_idea, delete_idea, scan_user_papers,
)
from backend.project.scanner import scan_project
from backend.project.manager import create_export_zip
from backend.search.boolean_search import boolean_search_titles
from backend.search.vector_search import vector_search
from backend.search.arxiv_search import arxiv_search
from backend.search.chroma_wrapper import get_all_metadata, get_unique_tags
from backend.tools.openalex import fetch_citation_count, get_budget, batch_fetch_citation_counts
from backend.tools.dedup import check_duplicate, batch_check_duplicates
from backend.utils.busy import busy_manager
from backend.utils.sanitize import sanitize_title
from backend.utils.streaming import busy_state as busy_state_event
from backend.pipeline.download import run_download, _get_page_count
from backend.pipeline.retrieval import run_retrieval
from backend.research.agent import run_report_generation
from backend.research.tasks import list_tasks, load_task
from backend.models import ChatMessageRequest, ChatSessionCreate, ChatSessionUpdate
from backend.models import RetrieveRequest
from backend.chat.agent import invoke_chat, get_chat_history
from backend.chat.sessions import (
    get_sessions_index, create_session, update_session,
    delete_session, get_session, generate_title,
)
from backend.utils.usage import usage_tracker

@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_config()  # load early
    projects_root = Path(cfg.project_config.projects_root)
    projects_root.mkdir(parents=True, exist_ok=True)
    app.mount("/files", StaticFiles(directory=str(projects_root)), name="project_files")
    yield
    # Shutdown: close all cached SQLite connections
    from backend.chat.agent import close_checkpointer, _checkpointer_cache
    for project_path in list(_checkpointer_cache.keys()):
        await close_checkpointer(project_path)


app = FastAPI(title="Research Copilot", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket connections per project ──
_ws_connections: dict[str, list[WebSocket]] = {}


async def _broadcast(project_id: str, message: str):
    for ws in _ws_connections.get(project_id, []):
        try:
            await ws.send_text(message)
        except Exception:
            pass


# ── WebSocket endpoint ──
@app.websocket("/ws/{project_id}")
async def websocket_endpoint(ws: WebSocket, project_id: str):
    await ws.accept()
    _ws_connections.setdefault(project_id, []).append(ws)
    try:
        while True:
            data = await ws.receive_text()
            # Handle client messages (e.g., error_response) — currently no-op
    except WebSocketDisconnect:
        _ws_connections.get(project_id, []).remove(ws)


# ── Project management ──
from pydantic import BaseModel as _BM
class _CreateProjectReq(_BM):
    name: str | None = None

@app.post("/projects")
async def api_create_project(req: _CreateProjectReq = _CreateProjectReq()):
    pid = create_project(req.name)
    return {"project_id": pid}


@app.get("/projects")
async def api_list_projects():
    return {"projects": list_projects()}


@app.get("/projects/{project_id}")
async def api_get_project(project_id: str):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")
    await busy_manager.release(project_id)
    await usage_tracker.load(project_id, str(path))
    state = scan_project(str(path))
    return state.model_dump()


# ── Tags ──
@app.get("/projects/{project_id}/tags")
async def api_get_tags(accessible: bool = True):
    return get_unique_tags(accessible)

@app.get("/config/tasks")
async def api_list_tasks():
    return {"tasks": list_tasks()}


@app.get("/config/models")
async def api_list_models():
    cfg = get_config()
    return {"models": [m.model_dump() for m in cfg.available_models]}

# ── Search ──
@app.post("/projects/{project_id}/search")
async def api_search(project_id: str, req: SearchRequest):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")

    cfg = get_config()
    filters = req.filters
    accessible = filters.get("accessible", True)
    years = filters.get("years", [])
    venues = filters.get("venues", [])

    # Check indexed papers for status
    indexed_set = set()
    papers_dir = path / "papers"
    if papers_dir.exists():
        for p in papers_dir.iterdir():
            if (p / "tree.json").exists():
                indexed_set.add(p.name)

    results = []

    if req.method == "boolean":
        all_meta = get_all_metadata(accessible)
        # Apply year/venue filters
        filtered = all_meta
        if years:
            filtered = [m for m in filtered if m.get("year") in years]
        if venues:
            filtered = [m for m in filtered if m.get("venue") in venues]
        matched = boolean_search_titles(filtered, req.query)
        for m in matched[:cfg.search_config.max_results_per_search]:
            pid = sanitize_title(m["title"])
            results.append(Paper(
                paper_id=pid,
                title=m["title"],
                authors=m.get("authors", []),
                year=m.get("year"),
                venue=m.get("venue"),
                abstract=m.get("abstract"),
                pdf_url=m.get("pdf_url"),
                source="accessible_db" if accessible else "inaccessible_db",
                indexed=pid in indexed_set,
            ))

    elif req.method == "vector":
        raw = vector_search(req.query, accessible=accessible, years=years, venues=venues)
        for m in raw:
            pid = sanitize_title(m["title"])
            results.append(Paper(
                paper_id=pid,
                title=m["title"],
                authors=m.get("authors", []),
                year=m.get("year"),
                venue=m.get("venue"),
                abstract=m.get("abstract"),
                pdf_url=m.get("pdf_url"),
                source="accessible_db" if accessible else "inaccessible_db",
                indexed=pid in indexed_set,
            ))

    elif req.method == "arxiv":
        raw = arxiv_search(req.query)
        for m in raw:
            m["indexed"] = m.get("paper_id", "") in indexed_set
            results.append(Paper(**m))

    return {"results": [r.model_dump() for r in results]}


# ── User papers ──
@app.get("/projects/{project_id}/user-papers")
async def api_user_papers(project_id: str):
    return {"files": scan_user_papers(project_id)}

@app.post("/projects/{project_id}/upload-papers")
async def api_upload_papers(project_id: str, files: list[UploadFile] = FastAPIFile(...)):
    """Upload PDF files to the project's user_papers directory."""
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")

    user_papers_dir = path / "user_papers"
    user_papers_dir.mkdir(exist_ok=True)

    max_size = 50 * 1024 * 1024  # 50MB per file
    uploaded = []
    errors = []

    for file in files:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            errors.append({"filename": file.filename or "unknown", "error": "Not a PDF file"})
            continue

        # Read and check size
        content = await file.read()
        if len(content) > max_size:
            errors.append({"filename": file.filename, "error": f"File exceeds 50MB limit ({len(content) / 1024 / 1024:.1f}MB)"})
            continue

        dest = user_papers_dir / file.filename
        # Skip if file already exists (same filename = same paper)
        if dest.exists():
            uploaded.append(dest.name)  # Still return it so frontend can add to cart
            continue

        dest.write_bytes(content)
        uploaded.append(dest.name)

    return {"uploaded": uploaded, "errors": errors, "count": len(uploaded)}

# ── Dedup ──
@app.post("/projects/{project_id}/dedup-check")
async def api_dedup_check(project_id: str, req: DedupCheckRequest):
    path = get_project_path(project_id)
    # Get all indexed titles
    existing = []
    papers_dir = path / "papers"
    if papers_dir.exists():
        for p in papers_dir.iterdir():
            tree_path = p / "tree.json"
            if tree_path.exists():
                try:
                    data = json.loads(tree_path.read_text())
                    existing.append(data.get("metadata", {}).get("title", p.name))
                except Exception:
                    pass
    is_dup, matched, score = check_duplicate(req.title, existing)
    return DedupCheckResponse(duplicate=is_dup, matched_title=matched, similarity=score)

@app.post("/projects/{project_id}/dedup-check-batch")
async def api_dedup_check_batch(project_id: str, req: BatchDedupRequest):
    results = batch_check_duplicates(req.titles, req.existing_titles)
    return {"results": results}

# ── Citation ──
@app.post("/projects/{project_id}/citation")
async def api_citation(project_id: str, req: CitationRequest):
    result = await fetch_citation_count(req.title)
    return CitationResponse(**result)

@app.post("/projects/{project_id}/citation-batch")
async def api_citation_batch(project_id: str, req: BatchCitationRequest):
    cfg = get_config()
    max_concurrency = cfg.citation_config.max_concurrency
    results = await batch_fetch_citation_counts(req.titles, max_concurrency)
    return {"results": results}

@app.get("/projects/{project_id}/citation-budget")
async def api_citation_budget(project_id: str):
    return get_budget()


# ── Idea management ──
@app.post("/projects/{project_id}/ideas")
async def api_create_idea(project_id: str, req: CreateIdeaRequest):
    slug = create_idea(project_id, req.idea_text)
    return {"idea_slug": slug, "idea_text": req.idea_text}

@app.delete("/projects/{project_id}/ideas/{idea_slug}")
async def api_delete_idea_endpoint(project_id: str, idea_slug: str):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")
    delete_idea(project_id, idea_slug)
    return {"ok": True}

@app.post("/projects/{project_id}/ideas/{idea_slug}/papers")
async def api_assign_papers(project_id: str, idea_slug: str, req: AssignPapersRequest):
    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    idea_dir.mkdir(parents=True, exist_ok=True)
    papers_json_path = idea_dir / "papers.json"

    # Load existing pool
    existing: list[dict] = []
    if papers_json_path.exists():
        try:
            existing = json.loads(papers_json_path.read_text(encoding="utf-8"))
        except Exception:
            existing = []

    existing_ids = {p["paper_id"] for p in existing}

    # Determine indexed set for status
    papers_dir = get_project_path(project_id) / "papers"
    indexed_set = set()
    if papers_dir.exists():
        for d in papers_dir.iterdir():
            if (d / "tree.json").exists():
                indexed_set.add(d.name)

    for paper in req.papers:
        if paper.paper_id not in existing_ids:
            # Check if already retrieved (has .md in idea folder)
            has_retrieval = (idea_dir / f"{paper.paper_id}.md").exists()
            if has_retrieval:
                status = "retrieved"
            elif paper.paper_id in indexed_set:
                status = "indexed"
            else:
                status = "pending"

            existing.append({
                "paper_id": paper.paper_id,
                "title": paper.title,
                "authors": paper.authors,
                "year": paper.year,
                "venue": paper.venue,
                "abstract": paper.abstract,
                "citation_count": paper.citation_count,
                "source": paper.source,
                "pdf_url": paper.pdf_url,
                "status": status,
            })
            existing_ids.add(paper.paper_id)

    papers_json_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "count": len(req.papers)}


@app.delete("/projects/{project_id}/ideas/{idea_slug}/papers/{paper_id}")
async def api_remove_paper_from_idea(project_id: str, idea_slug: str, paper_id: str):
    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    # Remove retrieval markdown if exists
    md_path = idea_dir / f"{paper_id}.md"
    if md_path.exists():
        md_path.unlink()
    # Remove from papers.json
    papers_json_path = idea_dir / "papers.json"
    if papers_json_path.exists():
        try:
            pool = json.loads(papers_json_path.read_text(encoding="utf-8"))
            pool = [p for p in pool if p["paper_id"] != paper_id]
            papers_json_path.write_text(json.dumps(pool, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass
    return {"ok": True}


@app.delete("/projects/{project_id}")
async def api_delete_project(project_id: str):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")

    # Close any open SQLite connections for this project
    from backend.chat.agent import close_checkpointer
    await close_checkpointer(str(path))

    try:
        delete_project(project_id)
    except Exception as e:
        raise HTTPException(500, f"Failed to delete project: {str(e)}")

    # Clean up WebSocket connections
    if project_id in _ws_connections:
        for ws in _ws_connections[project_id]:
            try:
                await ws.close()
            except Exception:
                pass
        del _ws_connections[project_id]

    return {"ok": True}


@app.get("/projects/{project_id}/ideas/{idea_slug}/files")
async def api_idea_files(project_id: str, idea_slug: str):
    import yaml

    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    if not idea_dir.exists():
        raise HTTPException(404, "Idea not found")

    def read_frontmatter(md_path) -> dict | None:
        try:
            text = md_path.read_text(encoding="utf-8")
            if text.startswith("---"):
                parts = text.split("---", 2)
                if len(parts) >= 3:
                    return yaml.safe_load(parts[1])
        except Exception:
            pass
        return None

    # Collect reports with metadata
    reports = []
    reports_dir = idea_dir / "reports"
    if reports_dir.exists():
        for f in sorted(reports_dir.glob("*.md")):
            fm = read_frontmatter(f)
            stat = f.stat()
            reports.append({
                "filename": f.name,
                "title": (fm or {}).get("title") or f.stem.replace("_", " ").title(),
                "task_name": (fm or {}).get("task_name") or (fm or {}).get("writing_prompt") or None,
                "model": (fm or {}).get("model") or None,
                "created_at": (fm or {}).get("created_at") or datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })

    # Collect retrieval files with paper metadata
    retrievals = []
    for f in sorted(idea_dir.glob("*.md")):
        if f.name == "idea.txt":
            continue
        fm = read_frontmatter(f)
        if fm:
            authors = fm.get("authors", [])
            if isinstance(authors, str):
                authors = [a.strip() for a in authors.split(",")]
            retrievals.append({
                "filename": f.name,
                "paper_title": fm.get("title") or f.stem.replace("_", " ").title(),
                "authors": authors,
                "year": fm.get("year"),
                "venue": fm.get("venue"),
            })
        else:
            retrievals.append({
                "filename": f.name,
                "paper_title": f.stem.replace("_", " ").title(),
                "authors": [],
                "year": None,
                "venue": None,
            })

    return {"reports": reports, "retrievals": retrievals}


@app.get("/projects/{project_id}/ideas/{idea_slug}/preflight")
async def api_preflight(project_id: str, idea_slug: str):
    """Get status of all papers for confirmation dialogs."""
    path = get_project_path(project_id)
    idea_dir = path / "ideas" / idea_slug
    papers_dir = path / "papers"

    papers_json = idea_dir / "papers.json"
    if not papers_json.exists():
        return {"papers": []}

    pool = json.loads(papers_json.read_text(encoding="utf-8"))
    result = []

    for p in pool:
        pid = p.get("paper_id", "")
        pdf_path = papers_dir / pid / "paper.pdf"
        pdf_exists = pdf_path.exists()
        tree_exists = (papers_dir / pid / "tree.json").exists()
        retrieval_exists = (idea_dir / f"{pid}.md").exists()

        pages = None
        if pdf_exists:
            pages = _get_page_count(pdf_path)

        word_count = None
        if retrieval_exists:
            try:
                content = (idea_dir / f"{pid}.md").read_text(encoding="utf-8")
                word_count = len(content.split())
            except Exception:
                pass

        result.append({
            "paper_id": pid,
            "title": p.get("title", pid),
            "source": p.get("source", ""),
            "pdf_url": p.get("pdf_url"),
            "pdf_exists": pdf_exists,
            "tree_exists": tree_exists,
            "retrieval_exists": retrieval_exists,
            "pages": pages,
            "word_count": word_count,
        })

    return {"papers": result}


# ── Operations ──
@app.post("/projects/{project_id}/ideas/{idea_slug}/download")
async def api_download(project_id: str, idea_slug: str):
    if not await busy_manager.acquire(project_id, "download", idea_slug):
        raise HTTPException(409, "Another operation is in progress")

    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    papers_json = idea_dir / "papers.json"
    if not papers_json.exists():
        await busy_manager.release(project_id)
        raise HTTPException(400, "No papers in this idea")

    pool = json.loads(papers_json.read_text(encoding="utf-8"))
    papers = [Paper(**p) for p in pool]

    async def send_ws(msg):
        await _broadcast(project_id, msg)

    await _broadcast(project_id, busy_state_event(True, "download", idea_slug))

    async def _run():
        try:
            project_path = str(get_project_path(project_id))
            await run_download(project_path, papers, send_ws)
        finally:
            await busy_manager.release(project_id)
            await _broadcast(project_id, busy_state_event(False))

    asyncio.create_task(_run())
    return {"ok": True, "message": "Download started"}


@app.post("/projects/{project_id}/ideas/{idea_slug}/retrieve")
async def api_retrieve(project_id: str, idea_slug: str, req: RetrieveRequest = RetrieveRequest()):
    if not await busy_manager.acquire(project_id, "retrieve", idea_slug):
        raise HTTPException(409, "Another operation is in progress")

    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    idea_txt = idea_dir / "idea.txt"
    idea_text = idea_txt.read_text(encoding="utf-8").strip() if idea_txt.exists() else idea_slug

    papers_json = idea_dir / "papers.json"
    if not papers_json.exists():
        await busy_manager.release(project_id)
        raise HTTPException(400, "No papers in this idea")

    pool = json.loads(papers_json.read_text(encoding="utf-8"))
    paper_ids = [p["paper_id"] for p in pool]

    async def send_ws(msg):
        await _broadcast(project_id, msg)

    await _broadcast(project_id, busy_state_event(True, "retrieve", idea_slug))

    async def _run():
        try:
            project_path = str(get_project_path(project_id))
            await run_retrieval(project_path, idea_slug, idea_text, paper_ids, send_ws, page_ranges=req.page_ranges)
        finally:
            await busy_manager.release(project_id)
            await _broadcast(project_id, busy_state_event(False))

    asyncio.create_task(_run())
    return {"ok": True, "message": "Retrieval started"}


@app.post("/projects/{project_id}/ideas/{idea_slug}/research")
async def api_research(project_id: str, idea_slug: str, req: ResearchRequest):
    if not await busy_manager.acquire(project_id, "research", idea_slug):
        raise HTTPException(409, "Another operation is in progress")

    # Validate task exists
    try:
        load_task(req.task_id)
    except (FileNotFoundError, ValueError) as e:
        await busy_manager.release(project_id)
        raise HTTPException(400, str(e))

    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    idea_txt = idea_dir / "idea.txt"
    idea_text = idea_txt.read_text(encoding="utf-8").strip() if idea_txt.exists() else idea_slug

    async def send_ws(msg):
        await _broadcast(project_id, msg)

    await _broadcast(project_id, busy_state_event(True, "research", idea_slug))

    async def _run():
        try:
            await run_report_generation(
                str(idea_dir), idea_text,
                req.task_id, req.model, req.model_kwargs,
                send_ws,
            )
        finally:
            await busy_manager.release(project_id)
            await _broadcast(project_id, busy_state_event(False))

    asyncio.create_task(_run())
    return {"ok": True, "message": "Report generation started"}


# ── Busy state ──
@app.get("/projects/{project_id}/busy")
async def api_busy(project_id: str):
    return busy_manager.is_busy(project_id)

@app.post("/projects/{project_id}/busy/reset")
async def api_busy_reset(project_id: str):
    """Force-reset the busy flag (recover from stuck state)."""
    await busy_manager.release(project_id)
    await _broadcast(project_id, busy_state_event(False))
    print(f"[BUSY] Force-reset busy state for project {project_id}")
    return {"ok": True}


# ── File access ──
@app.get("/projects/{project_id}/papers/{paper_id}/view")
async def api_view_paper(project_id: str, paper_id: str):
    """View the full OCR markdown of a paper with metadata."""
    path = get_project_path(project_id)
    paper_dir = path / "papers" / paper_id

    md_path = paper_dir / "paper.md"
    if not md_path.exists():
        raise HTTPException(404, "Paper markdown not found")

    content = md_path.read_text(encoding="utf-8")

    # Load metadata from tree.json if available
    metadata = {}
    tree_path = paper_dir / "tree.json"
    if tree_path.exists():
        try:
            tree_json = json.loads(tree_path.read_text(encoding="utf-8"))
            metadata = tree_json.get("metadata", {})
        except Exception:
            pass

    return {"content": content, "metadata": metadata, "filename": "paper.md", "paper_id": paper_id}


@app.get("/projects/{project_id}/papers/{paper_id}/export")
async def api_export_paper(project_id: str, paper_id: str):
    """Export paper markdown with figures as a zip file."""
    path = get_project_path(project_id)
    paper_dir = path / "papers" / paper_id

    md_path = paper_dir / "paper.md"
    if not md_path.exists():
        raise HTTPException(404, "Paper markdown not found")

    zip_bytes = create_export_zip(str(md_path), str(paper_dir))
    zip_name = f"{paper_id}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )

@app.delete("/projects/{project_id}/ideas/{idea_slug}/reports/{filename}")
async def api_delete_report(project_id: str, idea_slug: str, filename: str):
    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    report_path = idea_dir / "reports" / filename
    if not report_path.exists():
        raise HTTPException(404, "Report not found")
    report_path.unlink()
    return {"ok": True}

@app.get("/projects/{project_id}/ideas/{idea_slug}/view/{filename}")
async def api_view_file(project_id: str, idea_slug: str, filename: str):
    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    # Check in idea dir first, then reports
    file_path = idea_dir / filename
    if not file_path.exists():
        file_path = idea_dir / "reports" / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    return {"content": file_path.read_text(encoding="utf-8"), "filename": filename}


@app.get("/projects/{project_id}/ideas/{idea_slug}/export/{filename}")
async def api_export(project_id: str, idea_slug: str, filename: str):
    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    file_path = idea_dir / filename
    if not file_path.exists():
        file_path = idea_dir / "reports" / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")

    zip_bytes = create_export_zip(str(file_path), str(idea_dir))
    zip_name = file_path.stem + ".zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


# ── Indexed papers ──
@app.get("/projects/{project_id}/indexed-papers")
async def api_indexed_papers(project_id: str):
    path = get_project_path(project_id)
    papers_dir = path / "papers"
    result = {}
    if papers_dir.exists():
        for p in papers_dir.iterdir():
            tree_path = p / "tree.json"
            if tree_path.exists():
                try:
                    data = json.loads(tree_path.read_text())
                    result[p.name] = data.get("metadata", {})
                except Exception:
                    pass
    return {"indexed_papers": result}


# ── Usage ──
@app.get("/projects/{project_id}/usage")
async def api_usage(project_id: str):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")
    await usage_tracker.load(project_id, str(path))
    return await usage_tracker.get_usage(project_id)


# ── Chat Sessions ──
@app.get("/projects/{project_id}/chat/sessions")
async def api_list_sessions(project_id: str):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")
    return {"sessions": get_sessions_index(str(path))}


@app.post("/projects/{project_id}/chat/sessions")
async def api_create_session(project_id: str, req: ChatSessionCreate = ChatSessionCreate()):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")
    session = create_session(str(path), req.scope)
    return session


@app.delete("/projects/{project_id}/chat/sessions/{thread_id}")
async def api_delete_session(project_id: str, thread_id: str):
    path = get_project_path(project_id)
    delete_session(str(path), thread_id)
    return {"ok": True}


@app.patch("/projects/{project_id}/chat/sessions/{thread_id}")
async def api_update_session(project_id: str, thread_id: str, req: ChatSessionUpdate):
    path = get_project_path(project_id)
    updates = {}
    if req.title is not None:
        updates["title"] = req.title
    if req.scope is not None:
        updates["scope"] = req.scope
    update_session(str(path), thread_id, updates)
    return {"ok": True}


@app.get("/projects/{project_id}/chat/sessions/{thread_id}/messages")
async def api_get_messages(project_id: str, thread_id: str):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")
    messages = await get_chat_history(str(path), thread_id)
    return {"messages": messages}


@app.post("/projects/{project_id}/chat/sessions/{thread_id}/message")
async def api_send_message(project_id: str, thread_id: str, req: ChatMessageRequest):
    path = get_project_path(project_id)
    if not path.exists():
        raise HTTPException(404, "Project not found")

    session = get_session(str(path), thread_id)
    if not session:
        raise HTTPException(404, "Session not found")

    scope = req.scope or session.get("scope", "all")

    async def send_ws(msg):
        await _broadcast(project_id, msg)

    # Invoke agent
    response = await invoke_chat(str(path), project_id, thread_id, req.message, scope, send_ws)

    # Update session metadata
    msg_count = session.get("message_count", 0) + 2
    updates: dict = {"message_count": msg_count}

    # Auto-generate title on first exchange
    if msg_count <= 2 and session.get("title") == "New Conversation":
        try:
            title = await generate_title(req.message, response)
            updates["title"] = title
        except Exception:
            pass

    update_session(str(path), thread_id, updates)

    # Save usage
    await usage_tracker.save(project_id, str(path))

    # Send response via WebSocket too
    from backend.utils.streaming import make_event
    await _broadcast(project_id, make_event(
        "chat_response",
        thread_id=thread_id,
        content=response,
        title=updates.get("title", session.get("title", "")),
    ))

    return {"response": response, "thread_id": thread_id, "title": updates.get("title", session.get("title", ""))}