"""Research pipeline entry point."""

from pathlib import Path

from backend.research.graph import build_research_graph
from backend.research.tasks import load_task
from backend.utils.streaming import research_progress, research_complete
from backend.utils.usage import usage_tracker


async def run_report_generation(
    idea_dir: str,
    idea_text: str,
    task_id: str,
    model: str,
    model_kwargs: dict,
    send_ws: callable,
):
    """Run the research pipeline using LangGraph."""
    project_path = str(Path(idea_dir).parent.parent)
    project_id = Path(project_path).name

    try:
        await send_ws(research_progress("running", "Loading task definition..."))

        # Load and validate task
        task_config = load_task(task_id)

        # Build graph
        graph = build_research_graph()

        # Prepare initial state
        initial_state = {
            "idea_dir": idea_dir,
            "idea_text": idea_text,
            "project_path": project_path,
            "task_config": task_config,
            "model": model,
            "model_kwargs": model_kwargs,
            "files": [],
            "worker_results": [],
            "final_report": "",
            "report_title": "",
            "report_filename": "",
        }

        # Run the graph
        result = await graph.ainvoke(
            initial_state,
            config={"configurable": {"send_ws": send_ws}},
        )

        report_filename = result.get("report_filename", "")
        report_title = result.get("report_title", "Untitled Report")

        if not report_filename:
            await send_ws(research_progress("failed", "No report was generated"))
            return

        await usage_tracker.save(project_id, project_path)
        await send_ws(research_complete(report_filename, report_title))

    except Exception as e:
        print(f"[RESEARCH] Error: {e}")
        import traceback
        traceback.print_exc()
        await send_ws(research_progress("failed", f"Report generation failed: {str(e)}"))