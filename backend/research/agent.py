"""Report generation using DeepAgents with configurable tools and skills."""

import asyncio
from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import StateBackend, CompositeBackend
from deepagents.backends.filesystem import FilesystemBackend
from langchain.chat_models import init_chat_model
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver

from backend.config import get_config
from backend.research.prompts import REPORT_SUPERVISOR_PROMPT, PAPER_ANALYST_PROMPT
from backend.tools.paper import list_papers, view_paper_structure, read_paper_sections
from backend.tools.report import read_retrieval_file, list_retrieval_files, write_report, list_reports, read_report
from backend.tools.registry import resolve_tools, resolve_skills
from backend.utils.sanitize import sanitize_title
from backend.utils.streaming import research_progress, research_complete
from backend.utils.usage import usage_tracker, UsageTrackingCallback, estimate_tokens


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


async def run_report_generation(
    idea_dir: str,
    idea_text: str,
    writing_prompt: str,
    send_ws: callable,
):
    """Generate a report using DeepAgents with configurable skills."""
    cfg = get_config()
    agents_cfg = cfg.agents.research

    await send_ws(research_progress("running", "Setting up report generation..."))

    # Resolve model
    report_model = agents_cfg.model or cfg.llm_config.report_writer.model

    # Build model kwargs
    model_kwargs = {}
    temp = agents_cfg.temperature if agents_cfg.temperature is not None else cfg.llm_config.report_writer.temperature
    if temp is not None:
        model_kwargs["temperature"] = temp
    max_tok = agents_cfg.max_tokens or cfg.llm_config.report_writer.max_tokens
    if max_tok:
        model_kwargs["max_tokens"] = max_tok
    if agents_cfg.reasoning:
        if agents_cfg.reasoning_effort:
            model_kwargs["reasoning_effort"] = agents_cfg.reasoning_effort
        if agents_cfg.thinking_budget:
            model_kwargs["thinking"] = {"type": "enabled", "budget_tokens": agents_cfg.thinking_budget}

    try:
        model_obj = init_chat_model(report_model, max_retries=3, **model_kwargs)
    except Exception:
        model_obj = report_model

    # Create report-specific tools
    report_tools = [
        read_retrieval_file, list_retrieval_files, write_report,
        list_papers, view_paper_structure, read_paper_sections,
        list_reports, read_report,
    ]

    # Add custom tools from config
    custom_tool_names = agents_cfg.custom_tools
    if custom_tool_names:
        report_tools += resolve_tools(custom_tool_names)

    # Resolve skills
    skills = resolve_skills(agents_cfg.skills)

    # Build analyst subagent
    analyst_cfg = agents_cfg.subagents.get("paper-analyst", None)
    analyst_model = report_model
    analyst_skills: list[str] = []

    if analyst_cfg:
        if analyst_cfg.model:
            analyst_model = analyst_cfg.model
        analyst_skills = resolve_skills(analyst_cfg.skills)

    analyst_tools = [read_retrieval_file, list_retrieval_files, view_paper_structure, read_paper_sections]
    if analyst_cfg and analyst_cfg.custom_tools:
        analyst_tools += resolve_tools(analyst_cfg.custom_tools)

    paper_analyst_subagent: dict = {
        "name": "paper-analyst",
        "description": (
            "Reads and analyzes one paper's retrieved sections. "
            "Use this to delegate per-paper analysis. The analyst reads "
            "the retrieval markdown and produces a focused analysis guided by the writing prompt."
        ),
        "system_prompt": PAPER_ANALYST_PROMPT.format(
            writing_prompt=writing_prompt,
            idea_text=idea_text,
        ),
        "tools": analyst_tools,
        "model": analyst_model,
    }
    if analyst_skills:
        paper_analyst_subagent["skills"] = analyst_skills

    # Enriched system prompt with context
    system_prompt = REPORT_SUPERVISOR_PROMPT.format(
        writing_prompt=writing_prompt,
        idea_text=idea_text,
    )

    # Build agent kwargs
    agent_kwargs: dict = {
        "name": "report-writer",
        "model": model_obj,
        "tools": report_tools,
        "system_prompt": system_prompt,
        "subagents": [paper_analyst_subagent],
        "checkpointer": MemorySaver(),
        "backend": _make_backend,
    }
    if skills:
        agent_kwargs["skills"] = skills

    agent = create_deep_agent(**agent_kwargs)

    await send_ws(research_progress("running", "Generating report..."))

    # Derive project_id and project_path for tools and usage tracking
    project_id = Path(idea_dir).parent.parent.name
    project_path = str(Path(idea_dir).parent.parent)
    usage_callback = UsageTrackingCallback()

    try:
        result = await agent.ainvoke(
            {"messages": [{"role": "user", "content": f"Generate a research report.\n\nWriting prompt: {writing_prompt}\n\nIdea context: {idea_text}\n\nFirst, use list_retrieval_files to see what papers are available, then analyze each and write an integrated report."}]},
            config={"configurable": {"thread_id": "report_gen", "project_path": project_path, "idea_dir": idea_dir}, "callbacks": [usage_callback]},
        )

        # Extract the report filename from write_report tool results
        messages = result.get("messages", [])
        report_filename = None
        report_title = "Untitled Report"

        for msg in messages:
            # Find the write_report tool result message
            if hasattr(msg, "content") and isinstance(msg.content, str) and msg.content.startswith("Report saved:"):
                report_filename = msg.content.replace("Report saved:", "").strip()

        # Extract title from REPORT_TITLE line in the final agent message
        for msg in reversed(messages):
            if hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
                lines = msg.content.split("\n")
                for line in reversed(lines):
                    if line.strip().startswith("REPORT_TITLE:"):
                        report_title = line.strip().replace("REPORT_TITLE:", "").strip()
                        break
                break

        if not report_filename:
            # Fallback: check if any report was written to the reports directory
            reports_dir = Path(idea_dir) / "reports"
            if reports_dir.exists():
                report_files = sorted(reports_dir.glob("*.md"), key=lambda f: f.stat().st_mtime, reverse=True)
                if report_files:
                    report_filename = report_files[0].name
                else:
                    await send_ws(research_progress("failed", "No report was generated"))
                    return
            else:
                await send_ws(research_progress("failed", "No report was generated"))
                return

        # Approximate token tracking for local usage summary
        project_id = Path(idea_dir).parent.parent.name

        # Inject YAML frontmatter with metadata into the saved report
        report_path = Path(idea_dir) / "reports" / report_filename
        if report_path.exists():
            import yaml
            from datetime import datetime
            existing_content = report_path.read_text(encoding="utf-8")
            if not existing_content.startswith("---"):
                frontmatter = {
                    "title": report_title,
                    "writing_prompt": writing_prompt,
                    "idea": idea_text,
                    "created_at": datetime.now().isoformat(),
                }
                fm_str = yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True).strip()
                report_path.write_text(f"---\n{fm_str}\n---\n\n{existing_content}", encoding="utf-8")
                
        # Track usage from callback (accurate) or fallback to heuristic
        if usage_callback.total_input_tokens > 0 or usage_callback.total_output_tokens > 0:
            await usage_tracker.record_tokens(
                project_id, "research",
                usage_callback.total_input_tokens,
                usage_callback.total_output_tokens,
            )
        else:
            report_path = Path(idea_dir) / "reports" / report_filename
            report_content = report_path.read_text(encoding="utf-8") if report_path.exists() else ""
            prompt_tokens = estimate_tokens(writing_prompt + idea_text)
            completion_tokens = estimate_tokens(report_content)
            await usage_tracker.record_tokens(project_id, "research", prompt_tokens, completion_tokens)
        await usage_tracker.save(project_id, str(Path(idea_dir).parent.parent))

        await send_ws(research_complete(report_filename, report_title))

    except Exception as e:
        print(f"[RESEARCH] Error: {e}")
        import traceback
        traceback.print_exc()
        await send_ws(research_progress("failed", f"Report generation failed: {str(e)}"))