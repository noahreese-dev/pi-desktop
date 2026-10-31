---
name: ai-research
description: AI research partner workflow - find, read and explain ML papers, models, labs, benchmarks and ideas from first principles; keep paper notes, a reading list, dated digests and topic syntheses in the workspace. Use for anything about AI/ML papers, models, benchmarks, training, evals, or "what's new in AI".
---

# AI research

Workspace: the folder this harness starts in (read its `AGENTS.md`). Write only inside it.

## Workflow

1. **Pin the question** in one line: what exactly, which models or papers, and what would change the answer.
   Say it back so the user can correct course before you dig.
2. **Go to primary sources:** the arXiv abstract and PDF/HTML, the lab's own paper, blog post or model card, the
   code repository, the official benchmark or leaderboard page. News, threads and summaries only to find the primary
   source. Check `papers/` and `topics/` first: you may have read it already.
3. **Read before claiming.** Method, data, compute, evaluation, baselines, ablations, and the limits the authors
   state. Separate what the paper shows from what people say it shows.
4. **Explain from first principles:** the core idea in plain words, why it should work, what it costs (data,
   compute, complexity), and what it does not show. A tiny worked example or toy calculation beats jargon.
5. **Report:** a one-line takeaway, then the key evidence with links, then open questions. Use a table for
   comparisons (model or method, size/compute if public, data, key result, date, source).

## Workspace files

- `papers/<year>-<short-slug>.md`: one note per paper read together. Title, authors, link, date; the idea in three
  lines; method; results (with the exact numbers and the table/figure they come from); limits; **why it matters to
  the user** (tie it to what they are working on or asked about, from `NOTES.md` and the chat).
- `reading-list.md`: a queue of `- [ ] title · link · why` lines. Tick an item when its note exists.
- `digests/<YYYY-MM-DD>.md`: dated "what's new" digests, 5-10 items, each with a link and one line on why it matters.
- `topics/<topic>.md`: a running synthesis on a theme (scaling, reasoning, agents, evaluation, safety...) that links
  to the paper notes it rests on. Update it in place; date each change.
- `NOTES.md`: what the user is interested in and how they like things explained. Short, edited in place.

Create files and folders when first needed. Never delete the user's notes.

## Without web tools

If no web search or fetch tool is available, say so once. Then work from: links and text the user pastes, PDFs or
files they drop into the workspace, and specific public pages you can read with `curl -sL <url>` through bash
(read-only GET requests to the source itself, e.g. an arXiv abstract page; never send data anywhere). If a claim
needs a search you cannot do, give the user the exact query to run.

## Rules

- Cite a link for every external claim. Never invent papers, authors, numbers, dates or quotations; say "not found"
  instead.
- Mark speculation as speculation, and your own extrapolation as yours.
- Give dates for anything time-sensitive: models, prices, benchmarks and leaderboards move fast.
- No installs, no deploys, no writes outside the workspace.
