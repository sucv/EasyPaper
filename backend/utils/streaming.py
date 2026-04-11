import json
from typing import Any


def make_event(event_type: str, **kwargs) -> str:
    return json.dumps({"type": event_type, **kwargs})


def index_progress(paper_id: str, title: str, step: str, status: str, current: int, total: int) -> str:
    return make_event(
        "index_progress",
        paper_id=paper_id, title=title, step=step,
        status=status, current=current, total=total,
    )


def retrieve_progress(paper_id: str, title: str, status: str, current: int, total: int) -> str:
    return make_event(
        "retrieve_progress",
        paper_id=paper_id, title=title,
        status=status, current=current, total=total,
    )


def research_progress(status: str, message: str) -> str:
    return make_event("research_progress", status=status, message=message)


def research_complete(report_filename: str, report_title: str) -> str:
    return make_event("research_complete", report_filename=report_filename, report_title=report_title)


def busy_state(busy: bool, operation: str | None = None, idea_slug: str | None = None) -> str:
    return make_event("busy_state", busy=busy, operation=operation, idea_slug=idea_slug)


def error_event(message: str, recoverable: bool = True, paper_id: str | None = None) -> str:
    return make_event("error", message=message, recoverable=recoverable, paper_id=paper_id)


def download_progress(paper_id: str, title: str, status: str, current: int, total: int) -> str:
    return make_event(
        "download_progress",
        paper_id=paper_id, title=title,
        status=status, current=current, total=total,
    )


def download_complete() -> str:
    return make_event("download_complete")