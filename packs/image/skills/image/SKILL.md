---
name: image
description: Make and edit images (photographs, posters, logos, product shots, interiors, thumbnails, mockups, storyboards) with whatever generation tool the workspace has, or write ready-to-paste prompts when it has none. Brief first, budget cap before spending, every result inspected, versioned outputs. Use when the user asks for an image, picture, graphic, illustration, visual idea, or an edit to an existing image.
---

# Image

Workspace: the folder this harness starts in. Read its `AGENTS.md` first, especially **Generation tools**: it says
which tool (if any) makes images here, how to call it, what it costs, and whether it can edit, mask or take
reference images.

```
briefs/<project>.md        what was asked
prompts/<project>.md       final prompts, model, seed, settings (for consistency and re-runs)
outputs/<project>/         v1.png, v2.png, ... never overwritten
qa/<project>/              check records (image-refinement-loop)
qa/spend.log               one line per paid generation
inbox/                     images the user drops in to review, edit or use as references
```

## 1. Brief first

Ask for: purpose, where it will be used, size or aspect ratio, reference images and the role of each, text that
must appear exactly, and anything that must not appear. Save it to `briefs/<project>.md`. Never invent facts, names,
products or logos.

## 2. Which tool

- **A CLI or a Pi tool is listed:** use exactly what `AGENTS.md` describes. If a tool is listed but fails (missing
  key, not installed), show the user its own one-line setup message and stop. Never look for keys yourself.
- **No tool:** say so plainly, then deliver the work that doesn't need one: the brief, a short shot list (subject,
  framing, light, palette, mood per shot) and ready-to-paste prompts in `prompts/<project>.md`, one per shot, plus a
  negative list where the user's tool supports it. When the user generates elsewhere and drops results into `inbox/`,
  review them with the same checks as below.
- Never switch to another provider, service or account on your own; suggest it and wait for the user's go.

## 3. Budget before any paid generation

Generation usually costs money. Once per session, before the first paid call: say what one image costs with this
tool (from `AGENTS.md` or the tool itself; if unknown, say so) and ask for a **USD cap** for the session. Then:

- Append one line per paid generation to `qa/spend.log`:
  `<date time> | <project> | <output file> | <tool/model> | <cost USD or "unknown"> | <session total USD>`
- Check the total before every call. Stop before a call would pass the cap, and ask.
- Report the session total at the end.

Local, free operations (crop, resize, convert, composite with `sips` or `ffmpeg`) need no budget.

## 4. Generate or edit

- **Write prompts like a creative director:** subject, composition and camera, light, palette, materials, mood,
  intended use. Short and concrete beats long and vague.
- **Editing an existing image:** if the tool can edit (instruction, mask or reference image), edit; don't regenerate
  from a prompt and lose what was right. Describe only the change, and list what must stay identical.
- **Exact text and real logos are weak points** for most generators: plan to add final text and logos afterwards
  (an HTML/CSS render, an image editor, an `ffmpeg` overlay) rather than looping.
- Write every result straight to `outputs/<project>/` with a new version number (`v1.png`, `v2.png`, ...). **Never
  overwrite.** Save the final prompt, model, seed and settings to `prompts/<project>.md`.

## 5. Look at it before showing it

Open every result (read the image file) and check it against the brief: subject, count, text, hands, edges,
reflections, anything uncanny. Say what you checked and what is off. Don't show a result you haven't looked at.

## 6. Refine

When the user wants it "perfect", it must match references or plans, or something looks wrong, use the
`image-refinement-loop` skill. A one-off casual image doesn't need the full loop.

## Rules

- **Never publish, upload, post or send** an image anywhere. Delivery means a file in `outputs/` and its path.
- **Ask first** before using third-party logos, trademarks, or a real person's likeness, and before imitating a
  living artist's distinctive style by name.
- **Never read, print or log API keys** or other credentials, including in `spend.log`, prompts or error output.
- Write only inside the workspace. Never delete the user's files.
