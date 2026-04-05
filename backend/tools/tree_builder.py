"""Tree builder wrapper using md_to_tree logic adapted from PageIndex reference."""

import asyncio
import json
import re
import os
from backend.config import get_config
from backend.utils.usage import tracked_completion, estimate_tokens


def count_tokens(text, model=None):
    if not text:
        return 0
    return estimate_tokens(text)


async def generate_node_summary(node, model=None, project_id: str = ""):
    prompt = f"""You are given a part of a document. Generate a concise description of its main points.

Partial Document Text: {node['text']}

Directly return the description, no preamble."""
    response = await tracked_completion(
        project_id, "indexing_tree", model,
        [{"role": "user", "content": prompt}], temperature=0,
    )
    return response.content.strip()


def extract_nodes_from_markdown(markdown_content):
    header_pattern = r'^(#{1,6})\s+(.+)$'
    code_block_pattern = r'^```'
    node_list = []
    lines = markdown_content.split('\n')
    in_code_block = False

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.match(code_block_pattern, stripped):
            in_code_block = not in_code_block
            continue
        if not stripped:
            continue
        if not in_code_block:
            match = re.match(header_pattern, stripped)
            if match:
                node_list.append({'node_title': match.group(2).strip(), 'line_num': line_num})
    return node_list, lines


def extract_node_text_content(node_list, lines):
    all_nodes = []
    for node in node_list:
        line_content = lines[node['line_num'] - 1]
        header_match = re.match(r'^(#{1,6})', line_content)
        if not header_match:
            continue
        all_nodes.append({
            'title': node['node_title'],
            'line_num': node['line_num'],
            'level': len(header_match.group(1)),
        })

    for i, node in enumerate(all_nodes):
        start = node['line_num'] - 1
        end = all_nodes[i + 1]['line_num'] - 1 if i + 1 < len(all_nodes) else len(lines)
        node['text'] = '\n'.join(lines[start:end]).strip()
    return all_nodes


def build_tree_from_flat(node_list):
    stack = []
    roots = []
    counter = 1
    for node in node_list:
        tree_node = {
            'title': node['title'],
            'node_id': str(counter).zfill(4),
            'text': node.get('text', ''),
            'line_num': node.get('line_num'),
            'nodes': [],
        }
        counter += 1
        while stack and stack[-1][1] >= node['level']:
            stack.pop()
        if not stack:
            roots.append(tree_node)
        else:
            stack[-1][0]['nodes'].append(tree_node)
        stack.append((tree_node, node['level']))
    return roots


def _add_figure_nodes(tree_nodes, figures_dir):
    """Scan text for image references and add figure-type nodes."""
    fig_counter = 1
    for node in tree_nodes:
        # Find image refs in text
        img_refs = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', node.get('text', ''))
        for caption, path in img_refs:
            fig_node = {
                'node_id': f'fig_{fig_counter}',
                'title': caption or f'Figure {fig_counter}',
                'type': 'figure',
                'figure_path': path,
                'caption': caption,
                'text': caption,
                'nodes': [],
            }
            fig_counter += 1
            node['nodes'].append(fig_node)
        if node.get('nodes'):
            _add_figure_nodes(node['nodes'], figures_dir)


async def build_tree(md_path: str, figures_dir: str | None = None, project_id: str = "") -> dict:
    """Build a tree index from a markdown file. Returns tree structure dict."""
    cfg = get_config()
    model = cfg.llm_config.tree_builder.model

    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    node_list, lines = extract_nodes_from_markdown(content)
    nodes_with_content = extract_node_text_content(node_list, lines)

    # Thinning if configured
    if cfg.tree_config.if_thinning:
        threshold = cfg.tree_config.min_token_threshold
        i = len(nodes_with_content) - 1
        while i > 0:
            tokens = count_tokens(nodes_with_content[i].get('text', ''))
            if tokens < threshold and i > 0:
                prev = nodes_with_content[i - 1]
                prev['text'] = prev.get('text', '') + '\n\n' + nodes_with_content[i].get('text', '')
                nodes_with_content.pop(i)
            i -= 1

    tree = build_tree_from_flat(nodes_with_content)

    # Add figure nodes
    if figures_dir:
        _add_figure_nodes(tree, figures_dir)

    # Generate summaries
    if cfg.tree_config.if_add_node_summary == "yes":
        threshold = cfg.tree_config.summary_token_threshold
        all_nodes = _flatten(tree)
        tasks = []
        for n in all_nodes:
            text = n.get('text', '')
            tokens = count_tokens(text)
            if tokens < threshold:
                tasks.append(_return_text(text))
            else:
                tasks.append(generate_node_summary(n, model=model, project_id=project_id))
        summaries = await asyncio.gather(*tasks)
        for n, s in zip(all_nodes, summaries):
            if n.get('nodes'):
                n['prefix_summary'] = s
            else:
                n['summary'] = s

    return {"structure": tree}


async def _return_text(text):
    return text


def _flatten(tree):
    nodes = []
    for n in tree:
        nodes.append(n)
        if n.get('nodes'):
            nodes.extend(_flatten(n['nodes']))
    return nodes