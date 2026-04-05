---
name: fact-checker
description: Verifies that citations and claims in responses are accurately attributed to source papers. Use this skill after generating any response with paper citations, when the user asks to verify or check citations, or during report generation to validate academic references.
compatibility: Requires indexed papers with tree.json in the project
allowed-tools: view_paper_structure, read_paper_sections, list_papers
---

# fact-checker

## Overview

This skill provides a systematic process for verifying that every citation in a generated response or report accurately reflects what the source paper actually says. It catches hallucinated citations, misattributions, and distorted findings.

## Instructions

### 1. Extract claim-citation pairs

Scan the response or report and identify every statement attributed to a specific paper. Format each as:

- CLAIM: "the stated finding or fact"
- CITED AS: (Author, Year)

### 2. Locate the cited paper

Use `list_papers` to find the paper matching the author and year. If the paper is not in the index, mark it as "UNABLE TO VERIFY — paper not indexed."

### 3. Verify against source content

For each claim-citation pair:

- Use `view_paper_structure` to find sections likely to contain the claimed information (methods, results, conclusions).
- Use `read_paper_sections` to read those sections.
- Compare the claim against the actual paper text.

### 4. Classify each verification

- ✅ **VERIFIED** — The paper supports the claim as stated
- ⚠️ **PARTIALLY VERIFIED** — The paper discusses the topic but the claim overstates, understates, or slightly misrepresents the finding
- ❌ **NOT FOUND** — The claimed information cannot be located in the paper
- 🔄 **MISATTRIBUTED** — The information exists but belongs to a different paper in the index

### 5. Report findings

Present results in this format:

```
## Citation Verification Report

### Verified (N citations)
- ✅ (Smith et al., 2024): Claim about X — confirmed in Section 3.2

### Issues Found (N citations)
- ⚠️ (Jones, 2023): Claimed "95% accuracy" — paper reports 92.3%
- ❌ (Lee et al., 2022): Claimed "novel sampling" — not found; paper focuses on architecture
```

## Important notes

- Verify ALL citations, not just suspicious ones
- Be precise about what the paper actually says versus what was claimed
- Preserve original claim wording when reporting discrepancies
- When a paper is not indexed, state this clearly rather than guessing