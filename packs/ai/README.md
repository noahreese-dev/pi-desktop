# Ilya: AI research partner

Ilya reads AI papers with you and explains them from first principles: the core idea in plain words, why it should
work, what it costs, and what the evidence does and does not show. He keeps paper notes, a reading list, dated
digests and topic syntheses in his workspace, so the next conversation starts where the last one ended.

- Harness: `pi-ai` · character id `ai`
- Skills: `ai-research` (papers, models, benchmarks, the workspace files) and `research` (any sourced question:
  scope, search, compare, cited report)
- Persona: calm, precise, first-principles. A fictional character; his lines are his own.

## Workspace

`~/pi-studio/ai/` (or `$PI_STUDIO/ai/`), created on first run with this pack's `workspace/AGENTS.md`:

```
AGENTS.md            rules + layout (edit freely; never overwritten)
NOTES.md             your interests, how you like things explained
reading-list.md      - [ ] title · link · why
papers/              <year>-<slug>.md   one note per paper, incl. "why it matters to you"
digests/             <YYYY-MM-DD>.md    what's new, with links
topics/              <topic>.md         running syntheses linking to paper notes
```

Pi Desktop's Files tab shows this folder. The suggested **Weekly AI digest** task (Tasks tab) writes a digest every
Monday.

## Optional tools

- **Web search / fetch** (any Pi extension or MCP server that provides it) makes him much more useful. Without one he
  says so and works from links and text you paste, files you drop in the workspace, and single public pages he can
  read with `curl` (read-only).

## Using `PI_STUDIO`

The app reads the folder from the harness's literal `cd "$HOME/pi-studio/ai"` line. If you set `PI_STUDIO`, the
terminal follows it, but tell the app too: add `"cwd": "<your PI_STUDIO>/ai"` to `characters/ai.json`.
