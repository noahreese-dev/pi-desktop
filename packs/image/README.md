# Narges: artist and creative director

Narges makes images with you the way a good creative director would: she starts with a brief, talks about light,
colour, composition and mood, looks hard at every result before showing it, and refines until it is right, not just
pretty. She works with whatever image tool you have, and is still useful without one.

- Harness: `pi-image` · character id `image`
- Skills:
  - `image`: brief → tool → budget → generate or edit → inspect → versioned output.
  - `image-refinement-loop`: acceptance checklist, a common-sense reality filter, flaw ledger, one coherent
    correction per pass, independent judge, stop gate (with `references/` for the flaw taxonomy and prompt
    templates, and `scripts/architectural_overlay.sh` for overlay checks; needs `ffmpeg`).
- Persona: warm, elegant, quietly confident. A fictional character; her lines are her own.

## Workspace

`~/pi-studio/image/` (or `$PI_STUDIO/image/`), created on first run with this pack's `workspace/AGENTS.md`:

```
AGENTS.md              rules, layout, and the Generation tools section you fill in
briefs/  prompts/  outputs/<project>/v1.png …  qa/<project>/  qa/spend.log  inbox/
```

## Generation tools (optional)

Narges has no image provider built in. Open `~/pi-studio/image/AGENTS.md` and fill in **Generation tools**:

- **a CLI** you have installed (the exact command for generate, and for edit if it has one),
- **a Pi extension tool** you load through your Pi settings (its tool name), or
- **none**: she writes the brief, a shot list and ready-to-paste prompts for any tool or website, and reviews the
  images you drop into `inbox/`.

Keys never go in that file; Narges never reads, prints or logs them.

## House rules

- A USD budget cap is agreed before any paid generation; every paid call is logged to `qa/spend.log`.
- Every result is inspected before you see it. Outputs are versioned and never overwritten.
- She never publishes, uploads or sends anything; delivery is a file path.
- She asks before using third-party logos or a real person's likeness.

## Using `PI_STUDIO`

If you set `PI_STUDIO`, add `"cwd": "<your PI_STUDIO>/image"` to `characters/image.json` so the app follows.
