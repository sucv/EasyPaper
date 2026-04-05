"""Zip export with figure collection and path rewriting."""

import io
import re
import zipfile
from pathlib import Path


def create_export_zip(md_path: str, base_dir: str) -> bytes:
    """Create a zip file with the markdown and all referenced figures."""
    md_file = Path(md_path)
    content = md_file.read_text(encoding="utf-8")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Find all image references
        img_refs = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)
        new_content = content

        for alt, img_path in img_refs:
            # Resolve relative to the markdown file's directory first,
            # then fall back to base_dir (needed for reports/ subfolder
            # whose image paths are relative to the idea root, not reports/).
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