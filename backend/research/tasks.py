"""Task definition loading and validation."""

import yaml
from pathlib import Path

TASKS_ROOT = Path(__file__).parent.parent.parent / "tasks"

REQUIRED_FIELDS = ["task_id", "display_name", "description", "content_source", "filename_template", "worker_prompt", "synthesis_prompt"]
VALID_CONTENT_SOURCES = ["retrieval", "paper"]


def load_task(task_id: str) -> dict:
    """Load and validate a task definition from YAML."""
    task_path = TASKS_ROOT / f"{task_id}.yaml"
    if not task_path.exists():
        raise FileNotFoundError(f"Task '{task_id}' not found at {task_path}")

    with open(task_path, "r", encoding="utf-8") as f:
        task = yaml.safe_load(f)

    if not isinstance(task, dict):
        raise ValueError(f"Task '{task_id}' YAML is not a valid dict")

    # Validate required fields
    missing = [f for f in REQUIRED_FIELDS if f not in task or not task[f]]
    if missing:
        raise ValueError(f"Task '{task_id}' missing required fields: {missing}")

    if task["content_source"] not in VALID_CONTENT_SOURCES:
        raise ValueError(f"Task '{task_id}' has invalid content_source: '{task['content_source']}'. Must be one of {VALID_CONTENT_SOURCES}")

    return task


def list_tasks() -> list[dict]:
    """List all available task definitions."""
    tasks = []
    if not TASKS_ROOT.exists():
        return tasks

    for f in sorted(TASKS_ROOT.glob("*.yaml")):
        try:
            task = load_task(f.stem)
            tasks.append({
                "task_id": task["task_id"],
                "display_name": task["display_name"],
                "description": task["description"],
            })
        except Exception as e:
            print(f"[TASKS] Warning: failed to load {f.name}: {e}")

    return tasks