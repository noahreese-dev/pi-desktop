---
name: research
description: Investigate a question with web search and local reading, compare options, and report cited findings. Use when the user says research, investigate, compare, explore, look into, or asks a factual question that needs sources.
---

# Research

Investigate, compare, summarize. Sources over memory.

## Workflow

1. **Scope.** Restate the question in one line before searching, so the user can correct course early.
2. **Search.** Use web search / fetch tools for external claims if the harness has them; use `read`, `grep`, `find`
   and `ls` for local files. Prefer primary sources (papers, official docs, repositories, changelogs, data) over
   blog summaries. No web tools: see "Without web tools" in the ai-research skill.
3. **Compare.** When there are options, tabulate them: approach, strengths, weaknesses, cost or complexity, source.
4. **Report.** End every investigation with a one-line verdict, key evidence (3-5 bullets with links), and open
   questions.

## Rules

- Cite a link for every external claim. No invented sources, versions, numbers or prices.
- Read-only by default: write files only in the workspace, and only when the ai-research skill calls for it or the
  user asks.
- No mutating commands: no installs, no deploys, no writes outside the workspace.
- Concise and factual; tables over paragraphs for comparisons.
