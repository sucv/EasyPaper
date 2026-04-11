"""Project-level usage tracking for tokens and PDF indexing."""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Optional

import tiktoken

from langchain.chat_models import init_chat_model
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import HumanMessage, SystemMessage


# ── Tiktoken-based token counter ──

_encoding = None


def _get_encoding():
    global _encoding
    if _encoding is None:
        _encoding = tiktoken.get_encoding("cl100k_base")
    return _encoding


def estimate_tokens(text: str) -> int:
    """Estimate token count using tiktoken cl100k_base encoding."""
    if not text:
        return 0
    try:
        return len(_get_encoding().encode(text))
    except Exception:
        return len(text) // 4


# ── LangChain Usage Callback ──

class UsageTrackingCallback(BaseCallbackHandler):
    """Callback handler that accumulates token usage from all LLM calls."""

    def __init__(self):
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.call_count = 0

    def on_llm_end(self, response, **kwargs):
        """Called when an LLM call completes. Extract usage metadata."""
        self.call_count += 1
        if not response or not response.generations:
            return
        for gen_list in response.generations:
            for gen in gen_list:
                msg = getattr(gen, "message", None)
                if msg and hasattr(msg, "usage_metadata") and msg.usage_metadata:
                    um = msg.usage_metadata
                    self.total_input_tokens += um.get("input_tokens", 0)
                    self.total_output_tokens += um.get("output_tokens", 0)


# ── Model cache ──

_model_cache: dict[tuple, object] = {}


def _get_cached_model(model: str, **kwargs):
    """Get or create a cached LangChain chat model instance."""
    cache_key = (model, tuple(sorted(kwargs.items())))
    if cache_key not in _model_cache:
        _model_cache[cache_key] = init_chat_model(model, max_retries=3, **kwargs)
    return _model_cache[cache_key]


# ── Usage Tracker ──

class UsageTracker:
    """Thread-safe per-project usage tracker with persistence."""

    def __init__(self):
        self._data: dict[str, dict] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, project_id: str) -> asyncio.Lock:
        if project_id not in self._locks:
            self._locks[project_id] = asyncio.Lock()
        return self._locks[project_id]

    def _get_data(self, project_id: str) -> dict:
        if project_id not in self._data:
            self._data[project_id] = {
                "pages_processed": 0,
                "pdfs_processed": 0,
                "total_prompt_tokens": 0,
                "total_completion_tokens": 0,
                "by_operation": {},
                "by_model": {},
            }
        return self._data[project_id]

    async def record_tokens(
        self,
        project_id: str,
        operation: str,
        prompt_tokens: int,
        completion_tokens: int,
        model: str = "",
        input_price_per_1m: float = 0.0,
        output_price_per_1m: float = 0.0,
    ):
        lock = self._get_lock(project_id)
        async with lock:
            data = self._get_data(project_id)
            data["total_prompt_tokens"] += prompt_tokens
            data["total_completion_tokens"] += completion_tokens

            if operation not in data["by_operation"]:
                data["by_operation"][operation] = {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "calls": 0,
                }
            op = data["by_operation"][operation]
            op["prompt_tokens"] += prompt_tokens
            op["completion_tokens"] += completion_tokens
            op["calls"] += 1

            # Track by model
            if model:
                if "by_model" not in data:
                    data["by_model"] = {}
                if model not in data["by_model"]:
                    data["by_model"][model] = {
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "calls": 0,
                        "input_price_per_1m": 0.0,
                        "output_price_per_1m": 0.0,
                    }
                md = data["by_model"][model]
                md["prompt_tokens"] += prompt_tokens
                md["completion_tokens"] += completion_tokens
                md["calls"] += 1
                # Update prices (use latest non-zero value)
                if input_price_per_1m > 0:
                    md["input_price_per_1m"] = input_price_per_1m
                if output_price_per_1m > 0:
                    md["output_price_per_1m"] = output_price_per_1m

    async def record_pages(self, project_id: str, page_count: int):
        lock = self._get_lock(project_id)
        async with lock:
            data = self._get_data(project_id)
            data["pages_processed"] = data.get("pages_processed", 0) + page_count
            data["pdfs_processed"] = data.get("pdfs_processed", 0) + 1

    async def get_usage(self, project_id: str) -> dict:
        lock = self._get_lock(project_id)
        async with lock:
            return dict(self._get_data(project_id))

    async def save(self, project_id: str, project_path: str):
        lock = self._get_lock(project_id)
        async with lock:
            data = self._get_data(project_id)
            path = Path(project_path) / "usage.json"
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    async def load(self, project_id: str, project_path: str):
        lock = self._get_lock(project_id)
        async with lock:
            path = Path(project_path) / "usage.json"
            if path.exists():
                try:
                    self._data[project_id] = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    pass


# Singleton
usage_tracker = UsageTracker()


# ── Tracked completion (LangChain-based) ──

def _convert_messages(messages: list[dict]) -> list:
    """Convert dict messages to LangChain message objects."""
    result = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            result.append(SystemMessage(content=content))
        else:
            result.append(HumanMessage(content=content))
    return result


async def tracked_completion(
    project_id: str,
    operation: str,
    model: str,
    messages: list[dict],
    temperature: float = 0,
    max_tokens: int | None = None,
    **kwargs,
) -> object:
    """Wrapper around LangChain chat model that tracks token usage.

    Returns an AIMessage object. Access content via result.content
    """
    from backend.config import get_model_prices

    # Build model kwargs
    model_kwargs = {}
    if temperature is not None:
        model_kwargs["temperature"] = temperature
    if max_tokens:
        model_kwargs["max_tokens"] = max_tokens

    # Get or create cached model
    chat_model = _get_cached_model(model, **model_kwargs)

    # Convert messages
    lc_messages = _convert_messages(messages)

    # Invoke
    result = await chat_model.ainvoke(lc_messages)

    # Track usage
    input_tokens = 0
    output_tokens = 0
    if hasattr(result, "usage_metadata") and result.usage_metadata:
        input_tokens = result.usage_metadata.get("input_tokens", 0)
        output_tokens = result.usage_metadata.get("output_tokens", 0)
    else:
        # Fallback: heuristic estimate
        input_text = " ".join(m.get("content", "") for m in messages)
        input_tokens = estimate_tokens(input_text)
        output_tokens = estimate_tokens(result.content if result.content else "")

    if project_id:
        input_price, output_price = get_model_prices(model)
        await usage_tracker.record_tokens(
            project_id, operation, input_tokens, output_tokens,
            model=model,
            input_price_per_1m=input_price,
            output_price_per_1m=output_price,
        )

    return result