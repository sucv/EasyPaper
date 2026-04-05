"""Dynamic tool and skill registry. Loads tools from built-in sources and custom_tools/."""

import importlib
import sys
from pathlib import Path
from typing import Any

from langchain_core.tools import BaseTool

from backend.tools.paper import (
    list_papers,
    view_paper_structure,
    read_paper_sections,
    search_papers,
    list_reports,
    read_report,
)


# ── Built-in tools by name ──

BUILTIN_TOOLS: dict[str, BaseTool] = {
    "list_papers": list_papers,
    "view_paper_structure": view_paper_structure,
    "read_paper_sections": read_paper_sections,
    "search_papers": search_papers,
    "list_reports": list_reports,
    "read_report": read_report,
}


def _load_custom_tool(tool_ref: str) -> BaseTool | None:
    """Load a custom tool by reference string: 'module_name.function_name'."""
    custom_tools_dir = Path(__file__).parent.parent.parent / "custom_tools"
    if not custom_tools_dir.exists():
        print(f"[TOOLS] custom_tools/ directory not found: {custom_tools_dir}")
        return None

    # Add custom_tools parent to sys.path if not present
    parent = str(custom_tools_dir.parent)
    if parent not in sys.path:
        sys.path.insert(0, parent)

    try:
        parts = tool_ref.rsplit(".", 1)
        if len(parts) != 2:
            print(f"[TOOLS] Invalid tool reference '{tool_ref}'. Use 'module_name.function_name'")
            return None

        module_name, func_name = parts
        module = importlib.import_module(f"custom_tools.{module_name}")
        tool_func = getattr(module, func_name, None)

        if tool_func is None:
            print(f"[TOOLS] Function '{func_name}' not found in custom_tools.{module_name}")
            return None

        print(f"[TOOLS] Loaded custom tool: {tool_ref}")
        return tool_func

    except Exception as e:
        print(f"[TOOLS] Failed to load custom tool '{tool_ref}': {e}")
        return None


def resolve_tools(tool_names: list[str]) -> list[BaseTool]:
    """Resolve a list of tool names to tool objects.

    Supports:
    - Built-in tool names: "list_papers", "search_papers", etc.
    - Custom tool references: "example_tool.my_custom_tool"
    """
    tools = []
    seen = set()

    for name in tool_names:
        if name in seen:
            continue
        seen.add(name)

        # Try built-in first
        if name in BUILTIN_TOOLS:
            tools.append(BUILTIN_TOOLS[name])
        else:
            # Try custom tool
            custom = _load_custom_tool(name)
            if custom:
                tools.append(custom)
            else:
                print(f"[TOOLS] Warning: tool '{name}' not found in built-in or custom_tools/")

    return tools


def resolve_skills(skill_names: list[str]) -> list[str]:
    """Resolve skill names to virtual filesystem paths.

    Skill names are short names (e.g., "fact-checker") that map to
    skills/{name}/ directories. Returns virtual paths for DeepAgents filesystem.
    """
    skills_root = Path(__file__).parent.parent.parent / "skills"
    paths = []

    for name in skill_names:
        skill_dir = skills_root / name
        if skill_dir.exists() and (skill_dir / "SKILL.md").exists():
            # Return virtual path for DeepAgents filesystem backend
            paths.append(f"/skills/{name}/")
            print(f"[SKILLS] Loaded skill: {name} from {skill_dir}")
        else:
            print(f"[SKILLS] Warning: skill '{name}' not found at {skill_dir}/SKILL.md")

    return paths