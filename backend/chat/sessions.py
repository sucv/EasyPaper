"""Chat session management."""

import json
import uuid
from datetime import datetime
from pathlib import Path

from backend.config import get_config
from backend.chat.prompts import AUTO_TITLE_PROMPT


def get_conversations_dir(project_path: str) -> Path:
    d = Path(project_path) / "conversations"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_sessions_index(project_path: str) -> list[dict]:
    """Load the sessions index."""
    path = get_conversations_dir(project_path) / "sessions.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def save_sessions_index(project_path: str, sessions: list[dict]):
    path = get_conversations_dir(project_path) / "sessions.json"
    path.write_text(json.dumps(sessions, indent=2, ensure_ascii=False), encoding="utf-8")


def create_session(project_path: str, scope: str = "all") -> dict:
    """Create a new chat session."""
    thread_id = f"session_{uuid.uuid4().hex[:8]}"
    now = datetime.now().isoformat()
    session = {
        "thread_id": thread_id,
        "title": "New Conversation",
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
        "scope": scope,
        "token_usage": {"prompt": 0, "completion": 0},
    }
    sessions = get_sessions_index(project_path)
    sessions.insert(0, session)
    save_sessions_index(project_path, sessions)
    return session


def update_session(project_path: str, thread_id: str, updates: dict):
    """Update session metadata."""
    sessions = get_sessions_index(project_path)
    for s in sessions:
        if s["thread_id"] == thread_id:
            s.update(updates)
            s["updated_at"] = datetime.now().isoformat()
            break
    save_sessions_index(project_path, sessions)


def delete_session(project_path: str, thread_id: str):
    """Delete a session from the index."""
    sessions = get_sessions_index(project_path)
    sessions = [s for s in sessions if s["thread_id"] != thread_id]
    save_sessions_index(project_path, sessions)


def get_session(project_path: str, thread_id: str) -> dict | None:
    sessions = get_sessions_index(project_path)
    for s in sessions:
        if s["thread_id"] == thread_id:
            return s
    return None


async def generate_title(user_message: str, assistant_response: str) -> str:
    """Auto-generate a short title from the first exchange."""
    from backend.utils.usage import tracked_completion

    cfg = get_config()
    model = cfg.chat_config.auto_title_model
    prompt = AUTO_TITLE_PROMPT.format(
        user_message=user_message[:500],
        assistant_response=assistant_response[:500],
    )
    try:
        response = await tracked_completion(
            "", "chat_title", model,
            [{"role": "user", "content": prompt}],
            temperature=0,
        )
        title = response.content.strip().strip('"\'')
        return title[:80]
    except Exception:
        return user_message[:60]