---
name: debate
description: Structures analysis as a balanced multi-perspective debate between competing approaches, methods, or viewpoints. Use when the user asks to compare competing approaches, evaluate trade-offs, or when a research question has multiple valid perspectives supported by different papers.
compatibility: Requires at least two indexed papers with different approaches or viewpoints
allowed-tools: list_papers, search_papers, view_paper_structure, read_paper_sections
---

# debate

## Overview

This skill provides a structured framework for presenting balanced analysis of competing research approaches. It forces consideration of evidence from multiple angles before synthesizing a conclusion, preventing bias toward any single method or viewpoint.

## Instructions

### Step 1: Identify the positions

From the user's question, identify 2-3 distinct positions or approaches. Each must be a defensible viewpoint supported by at least one indexed paper. Use `list_papers` and `search_papers` to find papers supporting each position.

### Step 2: Advocate for Position A

Present the strongest possible case for Position A:

- Which papers support this approach?
- What are the demonstrated strengths and results?
- Under what conditions does it excel?
- Use specific evidence: numbers, benchmarks, examples from papers
- Use `read_paper_sections` for detailed evidence
- Acknowledge limitations but frame them as addressable

### Step 3: Advocate for Position B

Present the strongest possible case for Position B with equal rigor:

- Same depth of evidence as Position A
- Do not let your assessment of A influence how you present B
- Each position deserves its best representation

### Step 4: Cross-examination

For each position, address:

- How does it respond to the other position's strongest points?
- What evidence would change the conclusion?
- Are there conditions where this position clearly loses?

### Step 5: Moderator synthesis

As a neutral moderator:

- Where does the evidence clearly favor one position?
- Where does it remain genuinely ambiguous?
- What factors should guide the choice between them?
- Are there hybrid approaches that combine strengths?

### Output format

```
## Debate: [Topic]

### Position A: [Name]
**Advocate's case:** ...
**Key evidence:** ...

### Position B: [Name]
**Advocate's case:** ...
**Key evidence:** ...

### Cross-Examination
...

### Moderator's Synthesis
**Clear conclusions:** ...
**Open questions:** ...
**Recommendation:** ...
```

## Important notes

- Each position must be argued in good faith with real evidence from papers
- Do not create a strawman for either side
- The moderator should be genuinely balanced — if one side has stronger evidence, say so
- Quantitative comparisons should use the same metrics when possible
- If the papers do not support a meaningful debate (clear consensus), say so rather than forcing artificial disagreement