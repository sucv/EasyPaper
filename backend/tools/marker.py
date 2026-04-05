"""Marker API client for PDF→Markdown OCR."""

import asyncio
import httpx
import os
from pathlib import Path
from backend.config import get_config

_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        cfg = get_config()
        _semaphore = asyncio.Semaphore(cfg.marker_config.max_concurrency)
    return _semaphore


async def ocr_pdf(pdf_path: str, output_dir: str) -> dict:
    """
    Submit PDF to Marker API, poll for completion.
    Returns {"markdown": str, "figures": list[str]} with figure paths.
    """
    cfg = get_config()
    api_url = cfg.marker_config.api_url
    api_key = os.getenv("MARKER_API_KEY", "")

    sem = _get_semaphore()
    async with sem:
        async with httpx.AsyncClient(timeout=300) as client:
            # Submit
            with open(pdf_path, "rb") as f:
                resp = await client.post(
                    api_url,
                    headers={"X-Api-Key": api_key},
                    files={"file": (Path(pdf_path).name, f, "application/pdf")},
                    data={"output_format": "markdown", "extract_images": "true"},
                )
                resp.raise_for_status()
                submit_data = resp.json()

            request_check_url = submit_data.get("request_check_url")
            if not request_check_url:
                raise RuntimeError(f"Marker API did not return request_check_url: {submit_data}")

            # Poll
            while True:
                await asyncio.sleep(5)
                check = await client.get(
                    request_check_url,
                    headers={"X-Api-Key": api_key},
                )
                check.raise_for_status()
                check_data = check.json()
                status = check_data.get("status", "")
                if status == "complete":
                    break
                elif status == "failed":
                    raise RuntimeError(f"Marker OCR failed: {check_data}")

    # Extract results
    markdown = check_data.get("markdown", "")
    figures_dir = Path(output_dir) / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)

    figure_paths = []
    images = check_data.get("images", {})
    for img_name, img_data in images.items():
        import base64
        img_bytes = base64.b64decode(img_data)
        img_path = figures_dir / img_name
        img_path.write_bytes(img_bytes)
        figure_paths.append(str(img_path))

    # Rewrite image paths in markdown to include figures/ prefix
    import re
    for img_name in images.keys():
        # Replace bare filename refs with figures/ prefixed paths
        markdown = markdown.replace(f"]({img_name})", f"](figures/{img_name})")
        markdown = markdown.replace(f"](./{img_name})", f"](figures/{img_name})")

    return {"markdown": markdown, "figures": figure_paths}