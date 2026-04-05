import asyncio
from dataclasses import dataclass, field


@dataclass
class BusyInfo:
    busy: bool = False
    operation: str | None = None
    idea_slug: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class BusyManager:
    def __init__(self):
        self._projects: dict[str, BusyInfo] = {}

    def _get(self, project_id: str) -> BusyInfo:
        if project_id not in self._projects:
            self._projects[project_id] = BusyInfo()
        return self._projects[project_id]

    async def acquire(self, project_id: str, operation: str, idea_slug: str) -> bool:
        info = self._get(project_id)
        async with info.lock:
            if info.busy:
                return False
            info.busy = True
            info.operation = operation
            info.idea_slug = idea_slug
            return True

    async def release(self, project_id: str):
        info = self._get(project_id)
        async with info.lock:
            info.busy = False
            info.operation = None
            info.idea_slug = None

    def is_busy(self, project_id: str) -> dict:
        info = self._get(project_id)
        return {"busy": info.busy, "operation": info.operation, "idea_slug": info.idea_slug}


busy_manager = BusyManager()