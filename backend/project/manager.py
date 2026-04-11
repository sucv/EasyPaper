"""Project CRUD operations."""

import os
import shutil
import uuid
import io
import re
import zipfile
from pathlib import Path
from backend.config import get_config
from backend.utils.sanitize import sanitize_title


def get_projects_root() -> Path:
    cfg = get_config()
    root = Path(cfg.project_config.projects_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_project(name: str | None = None) -> str:
    """Create a new project directory. Returns project_id."""
    project_id = name or str(uuid.uuid4())[:8]
    project_id = sanitize_title(project_id)
    project_dir = get_projects_root() / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "papers").mkdir(exist_ok=True)
    (project_dir / "ideas").mkdir(exist_ok=True)
    (project_dir / "user_papers").mkdir(exist_ok=True)
    return project_id


def list_projects() -> list[str]:
    root = get_projects_root()
    return sorted([d.name for d in root.iterdir() if d.is_dir()])


def get_project_path(project_id: str) -> Path:
    return get_projects_root() / project_id


def delete_project(project_id: str):
    import stat
    import time

    path = get_project_path(project_id)
    if not path.exists():
        return

    def force_remove(func, fpath, exc_info):
        """Handle Windows file locking — chmod then retry."""
        try:
            os.chmod(fpath, stat.S_IWRITE)
            func(fpath)
        except Exception:
            pass

    # Try up to 3 times with a short delay for file handle release
    for attempt in range(3):
        try:
            shutil.rmtree(path, onerror=force_remove)
            if not path.exists():
                print(f"[DELETE] Successfully deleted project: {project_id}")
                return
        except Exception as e:
            print(f"[DELETE] Attempt {attempt + 1}/3 failed for {project_id}: {e}")
            time.sleep(0.5)

    # Final attempt — if directory still exists, try one more time
    if path.exists():
        try:
            shutil.rmtree(path, onerror=force_remove)
        except Exception as e:
            print(f"[DELETE] Final attempt failed for {project_id}: {e}")
            raise


def create_idea(project_id: str, idea_text: str) -> str:
    """Create idea folder. Returns idea_slug."""
    slug = sanitize_title(idea_text)
    idea_dir = get_project_path(project_id) / "ideas" / slug
    idea_dir.mkdir(parents=True, exist_ok=True)
    (idea_dir / "idea.txt").write_text(idea_text, encoding="utf-8")
    papers_json = idea_dir / "papers.json"
    if not papers_json.exists():
        papers_json.write_text("[]", encoding="utf-8")
    (idea_dir / "reports").mkdir(exist_ok=True)
    return slug


def delete_idea(project_id: str, idea_slug: str):
    idea_dir = get_project_path(project_id) / "ideas" / idea_slug
    print(f"[DELETE] Attempting to delete idea: {idea_dir} (exists={idea_dir.exists()})")
    if idea_dir.exists():
        try:
            shutil.rmtree(idea_dir)
            print(f"[DELETE] Successfully deleted: {idea_dir}")
        except PermissionError:
            # Windows file locking — retry with on_error handler
            import stat
            def force_remove(func, path, exc_info):
                os.chmod(path, stat.S_IWRITE)
                func(path)
            shutil.rmtree(idea_dir, onerror=force_remove)
            print(f"[DELETE] Force-deleted: {idea_dir}")
    else:
        print(f"[DELETE] Path not found: {idea_dir}")


def scan_user_papers(project_id: str) -> list[str]:
    """List PDF filenames in user_papers/ folder."""
    user_dir = get_project_path(project_id) / "user_papers"
    user_dir.mkdir(exist_ok=True)
    return [f.name for f in user_dir.glob("*.pdf")]


def create_export_zip(md_path: str, base_dir: str) -> bytes:
    """Create a zip file with the markdown and all referenced figures."""
    md_file = Path(md_path)
    content = md_file.read_text(encoding="utf-8")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        img_refs = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)
        new_content = content

        for alt, img_path in img_refs:
            resolved = (md_file.parent / img_path).resolve()
            if not resolved.exists():
                resolved = (Path(base_dir) / img_path).resolve()
            if resolved.exists():
                fig_name = resolved.name
                zf.write(str(resolved), f"figures/{fig_name}")
                new_content = new_content.replace(
                    f"![{alt}]({img_path})",
                    f"![{alt}](figures/{fig_name})"
                )

        zf.writestr(md_file.name, new_content)

    buf.seek(0)
    return buf.read()