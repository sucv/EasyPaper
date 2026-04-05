"""Tree search: LLM selects relevant nodes given an idea query."""

import json
from backend.config import get_config
from backend.utils.usage import tracked_completion


def _tree_to_outline(tree_nodes, indent=0) -> str:
    """Convert tree to a readable outline with node_ids and summaries."""
    lines = []
    for node in tree_nodes:
        nid = node.get('node_id', '?')
        title = node.get('title', '')
        summary = node.get('summary') or node.get('prefix_summary', '')
        ntype = node.get('type', '')
        prefix = "  " * indent
        type_tag = f" [FIGURE]" if ntype == "figure" else ""
        summary_str = f" — {summary[:120]}" if summary else ""
        lines.append(f"{prefix}[{nid}] {title}{type_tag}{summary_str}")
        if node.get('nodes'):
            lines.append(_tree_to_outline(node['nodes'], indent + 1))
    return "\n".join(lines)


async def search_tree(tree_data: dict, idea_text: str, project_id: str = "") -> list[str]:
    """
    Given a tree structure and an idea text, return list of relevant node_ids.
    """
    cfg = get_config()
    model = cfg.llm_config.tree_search.model

    tree_nodes = tree_data.get("structure", [])
    outline = _tree_to_outline(tree_nodes)

    prompt = f"""You are a research assistant. Given a document's tree structure and a research idea/query,
select which sections (by node_id) are relevant to the idea. Include figure nodes if the figures are relevant.

## Document Tree Structure:
{outline}

## Research Idea/Query:
{idea_text}

Return a JSON array of relevant node_id strings. Example: ["0001", "0003", "fig_1"]
Return ONLY the JSON array, nothing else."""

    response = await tracked_completion(
        project_id, "retrieval", model,
        [{"role": "user", "content": prompt}], temperature=0,
    )
    content = response.content.strip()

    # Parse
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()
    try:
        node_ids = json.loads(content)
        if isinstance(node_ids, list):
            return [str(nid) for nid in node_ids]
    except Exception:
        pass
    return []

def collect_node_content(tree_nodes: list, node_ids: set) -> list[dict]:
    """Collect full content of selected nodes."""
    collected = []
    for node in tree_nodes:
        nid = node.get('node_id', '')
        if nid in node_ids:
            collected.append({
                "node_id": nid,
                "title": node.get('title', ''),
                "text": node.get('text', ''),
                "type": node.get('type', 'section'),
                "figure_path": node.get('figure_path'),
                "caption": node.get('caption'),
            })
        if node.get('nodes'):
            collected.extend(collect_node_content(node['nodes'], node_ids))
    return collected