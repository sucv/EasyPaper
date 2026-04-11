"""Chat agent using DeepAgents SDK with configurable tools and skills."""

import os
from pathlib import Path
import asyncio

from deepagents import create_deep_agent
from deepagents.backends import StateBackend, CompositeBackend
from deepagents.backends.filesystem import FilesystemBackend
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import aiosqlite

from backend.config import get_config
from backend.chat.prompts import CHAT_AGENT_PROMPT, RETRIEVAL_SUBAGENT_PROMPT
from backend.tools.registry import resolve_tools, resolve_skills, BUILTIN_TOOLS
from backend.tools.paper import list_papers, search_papers, view_paper_structure, read_paper_sections
from backend.utils.usage import usage_tracker, UsageTrackingCallback, estimate_tokens


# ── Observability ──

def setup_observability():
    cfg = get_config()
    if cfg.observability.langsmith_enabled:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ.setdefault("LANGSMITH_PROJECT", "easy-paper")
    else:
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")


# ── Skills backend ──

def _get_skills_root() -> Path:
    """Return absolute path to the skills directory at repo root."""
    return Path(__file__).parent.parent.parent / "skills"


def _make_backend(runtime):
    """Create CompositeBackend with skills routed to filesystem."""
    skills_root = _get_skills_root()
    return CompositeBackend(
        default=StateBackend(runtime),
        routes={
            "/skills/": FilesystemBackend(root_dir=str(skills_root), virtual_mode=True),
        },
    )


# ── Checkpointer cache ──

_checkpointer_cache: dict[str, AsyncSqliteSaver] = {}
_db_conn_cache: dict[str, aiosqlite.Connection] = {}
_checkpointer_lock = asyncio.Lock()


async def get_checkpointer(project_path: str) -> AsyncSqliteSaver:
    async with _checkpointer_lock:
        if project_path in _checkpointer_cache:
            return _checkpointer_cache[project_path]
        db_path = str(Path(project_path) / "chat.db")
        conn = await aiosqlite.connect(db_path)
        checkpointer = AsyncSqliteSaver(conn)
        await checkpointer.setup()
        _checkpointer_cache[project_path] = checkpointer
        _db_conn_cache[project_path] = conn
        return checkpointer


async def close_checkpointer(project_path: str):
    """Close SQLite connection for a project to allow deletion."""
    async with _checkpointer_lock:
        if project_path in _db_conn_cache:
            try:
                await _db_conn_cache[project_path].close()
            except Exception:
                pass
            del _db_conn_cache[project_path]
        if project_path in _checkpointer_cache:
            del _checkpointer_cache[project_path]


# ── Default tool sets ──

CHAT_MAIN_DEFAULT_TOOLS = ["list_papers", "search_papers"]
CHAT_READER_DEFAULT_TOOLS = ["view_paper_structure", "read_paper_sections"]


# ── Agent factory ──

async def create_chat_agent_for_project(project_path: str, project_id: str, scope: str = "all"):
    """Create a DeepAgents chat agent with configurable tools and skills."""
    setup_observability()
    cfg = get_config()
    agents_cfg = cfg.agents.chat

    checkpointer = await get_checkpointer(project_path)

    # Resolve model
    chat_model = agents_cfg.model or cfg.llm_config.chat_agent.model

    # Build model kwargs
    model_kwargs = {}
    temp = agents_cfg.temperature if agents_cfg.temperature is not None else cfg.llm_config.chat_agent.temperature
    if temp is not None:
        model_kwargs["temperature"] = temp
    max_tok = agents_cfg.max_tokens or cfg.llm_config.chat_agent.max_tokens
    if max_tok:
        model_kwargs["max_tokens"] = max_tok
    if agents_cfg.top_p is not None:
        model_kwargs["top_p"] = agents_cfg.top_p
    if agents_cfg.top_k is not None:
        model_kwargs["top_k"] = agents_cfg.top_k
    if agents_cfg.reasoning:
        if agents_cfg.reasoning_effort:
            model_kwargs["reasoning_effort"] = agents_cfg.reasoning_effort
        if agents_cfg.thinking_budget:
            model_kwargs["thinking"] = {"type": "enabled", "budget_tokens": agents_cfg.thinking_budget}

    # Create model object
    try:
        model_obj = init_chat_model(chat_model, max_retries=3, **model_kwargs)
    except Exception as e:
        print(f"[CHAT] init_chat_model failed ({e}), using model string")
        model_obj = chat_model

    # Resolve main agent tools: defaults + custom
    main_tool_names = CHAT_MAIN_DEFAULT_TOOLS + agents_cfg.custom_tools
    main_tools = resolve_tools(main_tool_names)

    # Resolve main agent skills
    main_skills = resolve_skills(agents_cfg.skills)

    # Build paper-reader subagent config
    reader_cfg = agents_cfg.subagents.get("paper-reader", None)

    reader_tool_names = CHAT_READER_DEFAULT_TOOLS.copy()
    reader_skills_names: list[str] = []

    if reader_cfg:
        reader_tool_names += reader_cfg.custom_tools
        reader_skills_names = reader_cfg.skills

    reader_tools = resolve_tools(reader_tool_names)
    reader_skills = resolve_skills(reader_skills_names)

    # Reader subagent model
    reader_model = chat_model
    if reader_cfg and reader_cfg.model:
        reader_model = reader_cfg.model

    reader_subagent: dict = {
        "name": "paper-reader",
        "description": (
            "Reads and analyzes a single indexed paper. "
            "Use this to delegate per-paper questions. The reader examines "
            "the paper's structure and reads specific sections to answer questions."
        ),
        "system_prompt": RETRIEVAL_SUBAGENT_PROMPT,
        "tools": reader_tools,
        "model": reader_model,
    }
    if reader_skills:
        reader_subagent["skills"] = reader_skills

    # Build create_deep_agent kwargs
    agent_kwargs: dict = {
        "name": "research-qa",
        "model": model_obj,
        "tools": main_tools,
        "system_prompt": CHAT_AGENT_PROMPT,
        "subagents": [reader_subagent],
        "checkpointer": checkpointer,
        "backend": _make_backend,
    }
    if main_skills:
        agent_kwargs["skills"] = main_skills

    agent = create_deep_agent(**agent_kwargs)
    return agent


# ── Invoke ──

async def invoke_chat(
    project_path: str,
    project_id: str,
    thread_id: str,
    user_message: str,
    scope: str = "all",
    send_ws: callable = None,
) -> str:
    from backend.utils.streaming import make_event

    cfg = get_config()
    agents_cfg = cfg.agents.chat
    agent = await create_chat_agent_for_project(project_path, project_id, scope)

    usage_callback = UsageTrackingCallback()

    config = {
        "configurable": {
            "thread_id": thread_id,
            "project_path": project_path,
            "scope": scope,
        },
        "callbacks": [usage_callback],
    }

    if send_ws:
        await send_ws(make_event("chat_status", thread_id=thread_id, message="Thinking..."))

    input_data = {"messages": [{"role": "user", "content": user_message}]}

    response_content = ""
    try:
        async for event in agent.astream_events(input_data, config=config, version="v2"):
            kind = event.get("event", "")
            metadata = event.get("metadata", {})
            agent_name = metadata.get("lc_agent_name", "")

            if kind == "on_tool_start" and send_ws:
                tool_name = event.get("name", "")
                is_subagent = agent_name == "paper-reader"
                prefix = "Retriever: " if is_subagent else ""
                status_map = {
                    "list_papers": f"{prefix}Listing indexed papers...",
                    "view_paper_structure": f"{prefix}Examining paper structure...",
                    "read_paper_sections": f"{prefix}Reading paper sections...",
                    "search_papers": f"{prefix}Searching across papers...",
                    "task": "Delegating to paper reader...",
                    "write_todos": "Planning approach...",
                }
                msg = status_map.get(tool_name, f"{prefix}Using {tool_name}...")
                await send_ws(make_event("chat_status", thread_id=thread_id, message=msg))

            if kind == "on_tool_end" and send_ws:
                tool_name = event.get("name", "")
                if tool_name == "task":
                    await send_ws(make_event("chat_status", thread_id=thread_id, message="Synthesizing answer..."))

            if kind == "on_chat_model_end" and agent_name != "paper-reader":
                output = event.get("data", {}).get("output", None)
                if output and hasattr(output, "content") and output.content:
                    if not (hasattr(output, "tool_calls") and output.tool_calls and not output.content):
                        response_content = output.content

        # Track token usage from callback (accurate) or fallback to heuristic
        if response_content:
            from backend.config import get_model_prices
            chat_model_str = agents_cfg.model or cfg.llm_config.chat_agent.model
            input_price, output_price = get_model_prices(chat_model_str)

            if usage_callback.total_input_tokens > 0 or usage_callback.total_output_tokens > 0:
                await usage_tracker.record_tokens(
                    project_id, "chat",
                    usage_callback.total_input_tokens,
                    usage_callback.total_output_tokens,
                    model=chat_model_str,
                    input_price_per_1m=input_price,
                    output_price_per_1m=output_price,
                )
            else:
                # Fallback heuristic
                prompt_tokens = estimate_tokens(user_message)
                completion_tokens = estimate_tokens(response_content)
                await usage_tracker.record_tokens(
                    project_id, "chat", prompt_tokens, completion_tokens,
                    model=chat_model_str,
                    input_price_per_1m=input_price,
                    output_price_per_1m=output_price,
                )

    except Exception as e:
        print(f"[CHAT] Agent error: {e}")
        import traceback
        traceback.print_exc()
        response_content = f"I encountered an error while processing your question: {str(e)}"

    return response_content


# ── History retrieval ──

async def get_chat_history(project_path: str, thread_id: str) -> list[dict]:
    try:
        checkpointer = await get_checkpointer(project_path)
        config = {"configurable": {"thread_id": thread_id}}
        state = await checkpointer.aget(config)

        if not state or "channel_values" not in state:
            return []

        messages = state["channel_values"].get("messages", [])
        result = []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                result.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                if msg.content and not getattr(msg, "tool_calls", None):
                    result.append({"role": "assistant", "content": msg.content})
        return result
    except Exception as e:
        print(f"[CHAT] Error loading history: {e}")
        return []