---
name: related-work-finder
description: Identifies connections and related work across indexed papers by analyzing their references sections, related work sections, and thematic overlaps. Works entirely from indexed content with no external API calls. Use when the user asks about related papers, connections between papers, citation networks within the collection, or when building a related work section.
compatibility: Requires indexed papers with OCR-processed content containing references and related work sections
allowed-tools: list_papers, view_paper_structure, read_paper_sections
---

# related-work-finder

## Overview

This skill maps relationships and connections across the indexed paper collection by analyzing references, related work sections, and thematic overlaps. It works entirely from indexed content — no external APIs are called.

## Instructions

### Step 1: Identify the anchor paper

Determine which paper(s) the user is interested in finding related work for. Use `list_papers` to match the user's description to actual indexed papers.

### Step 2: Read reference-heavy sections

For each anchor paper, use `view_paper_structure` to locate:

- "Related Work" or "Related Studies" sections
- "References" or "Bibliography" sections
- "Introduction" paragraphs that cite prior work
- "Discussion" sections that compare with other methods

Use `read_paper_sections` to get the full text of these sections.

### Step 3: Cross-reference with index

From the text of reference-heavy sections, identify paper titles and authors that are mentioned. Cross-reference against `list_papers` to find which referenced papers are also in the indexed collection.

### Step 4: Analyze thematic connections

For papers that are in the index:

- What specific aspects does the anchor paper cite them for?
- Is the citation positive (builds on), negative (improves upon), or neutral (acknowledges)?
- What is the thematic relationship: same method, same problem, same dataset, or something else?

### Step 5: Find reverse connections

Check other indexed papers to see if they reference the anchor paper:

- Read their related work and introduction sections
- This reveals papers that build on or respond to the anchor

### Step 6: Map transitive connections

If Paper A cites Paper B, and Paper B cites Paper C, and all are indexed:

- Note this citation chain
- The user might want to read them in sequence

### Output format

```
## Related Work Map for: [Paper Title]

### Directly Related (cited by or cites this paper)
- **[Paper Title]** (Author, Year)
  - Relationship: builds on / improves upon / alternative approach
  - Connection: "Paper X extends this work by..."

### Thematically Related (shared topics or methods)
- **[Paper Title]** — shares [method / dataset / problem domain]

### Citation Chains
- A → B → C: [describe the progression]

### Referenced but Not Indexed
- "[Title]" by [Authors] — mentioned in [anchor paper]'s related work as [context]
  (Not in index — cannot provide details)
```

## Important notes

- Only use indexed papers and their content — do NOT call any external APIs
- When a referenced paper is not in the index, note it but do not speculate about its content
- Citation relationships have directionality — "A cites B" differs from "B cites A"
- Be explicit about the strength of connections — a single citation is weaker than extensive discussion
- Thematic connections without direct citation are valuable but should be labeled as inferred