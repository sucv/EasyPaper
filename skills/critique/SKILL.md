---
name: critique
description: Provides structured self-critique of generated analyses and reports. Identifies weaknesses, gaps, unsupported claims, and areas for improvement, then produces a revised version. Use when generating reports, when the user asks to review or improve content, or when producing high-quality academic analyses.
compatibility: Works with any generated content; benefits from indexed papers for retrieving additional evidence
allowed-tools: search_papers, read_paper_sections, view_paper_structure, list_papers, read_report, list_reports
---

# critique

## Overview

This skill implements a structured review-and-revise loop for generated content. It evaluates output against academic quality criteria and produces an improved version with specific revision notes.

## Instructions

### Phase 1: Generate initial analysis

Produce the analysis or report as you normally would.

### Phase 2: Evaluate against quality criteria

Adopt the perspective of a rigorous academic reviewer. Assess the output on these dimensions:

**Evidence quality:**
- Is every claim supported by evidence from the papers?
- Are there unsupported generalizations?
- Are quantitative claims precise (exact numbers, not approximations)?

**Coverage:**
- Are all relevant indexed papers considered? Use `list_papers` to check.
- Are there perspectives or methods mentioned in some papers but ignored?
- Use `search_papers` to find additional relevant content if gaps are identified.

**Balance:**
- Does the analysis fairly represent conflicting findings?
- Are limitations of each approach discussed?
- Is there bias toward certain papers or methods?

**Logical coherence:**
- Do conclusions follow from the evidence presented?
- Are comparisons fair (same metrics, same conditions)?
- Are causal claims distinguished from correlational observations?

**Structure and clarity:**
- Is the organization logical?
- Are transitions between sections smooth?
- Is the level of detail consistent?

### Phase 3: Revise

Address each identified weakness. Use `search_papers` or `read_paper_sections` to retrieve additional content as needed.

### Phase 4: Present the output

Present the revised version first, then append revision notes:

```
[Revised analysis]

---
### Revision Notes
- Added discussion of X from (Author, Year) — initially overlooked
- Corrected claim about Y — paper reports Z instead
- Added limitations section for Method A
- Balanced coverage by including counter-evidence from (Author2, Year)
```

## Important notes

- Be genuinely critical — "this could be more detailed" is not actionable feedback
- Each critique point must identify a specific problem and a specific fix
- The revised version should be noticeably better, not just slightly reworded
- If the original is already strong, say so — do not manufacture weaknesses