# """
# Example custom tool for Research Copilot.

# HOW TO CREATE CUSTOM TOOLS:
# 1. Create a new .py file in this directory (custom_tools/)
# 2. Define one or more functions decorated with @tool from langchain_core.tools
# 3. Each tool function MUST have:
#    - A clear docstring (this becomes the tool description the LLM sees)
#    - Type hints for all arguments
#    - A `runtime: ToolRuntime` parameter to access project context
# 4. Register your tool in config.yaml under the agent that should use it:

#    agents:
#      chat:
#        custom_tools:
#          - "example_tool.my_custom_tool"

# AVAILABLE CONTEXT (via runtime parameter):
#    project_path = runtime.config.get("configurable", {}).get("project_path", "")
#    scope = runtime.config.get("configurable", {}).get("scope", "all")

# NOTES:
# - Tools are loaded dynamically at startup
# - Tool names must be unique across all tools
# - Keep tools focused — one tool, one job
# - The runtime parameter is automatically injected and hidden from the LLM
# """

# from langchain_core.tools import tool
# from langchain.tools import ToolRuntime


# @tool
# def my_custom_tool(query: str, runtime: ToolRuntime) -> str:
#     """An example custom tool that echoes the query.

#     This is a placeholder. Replace with your own logic.
#     The docstring becomes the tool description that the LLM sees,
#     so write it clearly to help the LLM understand when to use this tool.

#     Args:
#         query: The input query to process.
#     """
#     project_path = runtime.config.get("configurable", {}).get("project_path", "")
#     return f"[Example tool] Received query: '{query}' for project at: {project_path}"