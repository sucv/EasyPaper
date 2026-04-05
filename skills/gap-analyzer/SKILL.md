---
name: gap-analyzer
description: Systematically identifies research gaps, underexplored areas, and missing connections across indexed papers and generated reports. Use when the user asks about research gaps, what is missing, future directions, unexplored areas, or when identifying opportunities for novel contributions.
compatibility: Most effective with 5 or more indexed papers across related topics
allowed-tools: list_papers, list_reports, search_papers, view_paper_structure, read_paper_sections, read_report
---

# gap-analyzer

## Overview

This skill provides a systematic framework for identifying research gaps by analyzing what is covered and what is missing across the indexed paper collection and generated reports.

## Instructions

### Step 1: Map the landscape

Use `list_papers` and `list_reports` to understand the full scope of coverage:

- What topics, methods, and datasets are represented?
- Which research ideas have been explored?
- What reports have already been generated?

### Step 2: Analyze coverage by dimension

**Methodological gaps:**
- What approaches are used across papers? What approaches are notably absent?
- Are there methods from adjacent fields that could apply?
- Are all compared methods evaluated fairly (same baselines, same metrics)?
- Use `search_papers` to verify specific methodological coverage.

**Dataset and domain gaps:**
- What datasets are used across papers?
- Are there domains where the methods have not been tested?
- Are there scale gaps (only tested on small or only on large data)?

**Comparison gaps:**
- Which pairs of methods have never been directly compared?
- Are there missing ablation studies?
- Are there obvious baselines that no paper includes?

**Temporal gaps:**
- Are there older techniques that have not been revisited with modern approaches?
- Are there recent developments not yet incorporated?

**Theoretical gaps:**
- Are there empirical results without theoretical explanation?
- Are there theoretical predictions not yet tested empirically?

### Step 3: Identify cross-paper connections

- Look for ideas from one paper that could enhance methods from another
- Identify complementary approaches that have not been combined
- Find connections that span multiple research themes
- Use `view_paper_structure` and `read_paper_sections` to explore specific papers for connection points

### Step 4: Prioritize gaps

Rate each identified gap by:

- **Impact**: How significant would filling this gap be?
- **Feasibility**: How practical is it with available methods and data?
- **Novelty**: How unexplored is this direction?

### Output format

```
## Research Gap Analysis

### High-Priority Gaps
1. **[Gap description]**
   - Evidence: Papers X, Y discuss A but none address B
   - Potential approach: ...
   - Impact: High / Feasibility: Medium

### Methodological Gaps
...

### Missing Connections
- Paper A's method + Paper B's framework could yield ...

### Suggested Research Questions
1. ...
2. ...
```

## Important notes

- Ground every gap in specific evidence from the indexed papers
- Distinguish between "not covered in our indexed papers" and "not covered in the literature generally"
- Be specific — "more research needed" is not a useful gap identification
- Consider that some gaps exist for good reasons (impractical, already tried and failed)