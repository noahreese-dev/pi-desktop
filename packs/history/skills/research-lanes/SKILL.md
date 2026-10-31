---
name: research-lanes
description: Run a large history question as bounded research lanes that each return an evidence packet, then an independent falsification review, then a synthesis. Use when the user says deep dive, find everything on X, investigate thoroughly, or the question spans many sources, languages or centuries.
---

# Research lanes

Small question → answer directly with the history-method skill. Big question → lanes.

## 1. Plan

Split the question into 2-6 lanes with no overlap, for example: *earliest sources*, *transmission and dependence*,
*rival accounts and counterevidence*, *material evidence (inscriptions, coins, archaeology)*, *modern scholarship*.
For each lane write: the questions, the corpus (works, languages, date range), what is excluded, and when to stop.
Show the plan to the user in a few lines before starting if it will take more than a few minutes.

## 2. Run the lanes

- **If the harness has a subagent or background-task tool,** give each lane to its own worker with the lane brief and
  the packet format below, told to write nothing and return the packet as text. Keep at most three running at once.
- **Otherwise run the lanes one after another yourself,** finishing and saving each packet before starting the next,
  and say that you are doing so.
- Web search or fetch tools, if present, are for finding and reading editions, translations and catalogues. Without
  them, work from local files and texts the user provides, and list what you could not reach.

## 3. Packet format (every lane returns this)

- Lane, question, corpus searched, searches tried, what was not reachable.
- Evidence items: exact source + location + link, original text when available, translation and whose, verification
  state (`checked` / `unverified`).
- Reports grouped into independent routes, with the reason for each grouping.
- Counterevidence, rival accounts, the strongest alternative explanation.
- Claims, each with one of the four claim classes and a confidence label with reasons.
- What would change the result.

Save each packet as a new file in the workspace: `research/inbox/PKT-<TOPIC>-<NNN>-v1.md` (TOPIC in capitals,
NNN numbered from 001). **Packets are never edited after saving.** A correction is a new file, `-v2`, that says what
changed.

## 4. Independent review (try to falsify)

Before anything is accepted, review each packet as an adversary whose job is to break it: source traceability (does
each location exist and say that?), double-counted routes, blurred claim classes, mixed-up dates, missing
counterevidence, overconfidence.

- Best: a separate reviewer that did not write the packet (a subagent or background worker if the harness has one,
  or a separate `pi -p --no-session` run given only the packet and this checklist).
- Otherwise do it yourself in a fresh pass, re-reading the packet as written, and say the review was not independent.

Save the review as `research/reviews/REVIEW-<TOPIC>-<NNN>.md`. Every material point gets one verdict: `accepted`,
`accepted_with_revision`, `disputed_with_rationale` or `deferred_insufficient_evidence`.

## 5. Synthesis

Only reviewed points feed the synthesis. Write the decision to `research/decisions/<TOPIC>-<NNN>.md`, copy the packet
to `research/accepted/`, add a line to `INDEX.md`, and present the result to the user with the history-method format
(raw text, translation, provenance, HCM). A weighty result you then discuss can be **proposed** for `FINDINGS.md`
(findings-list skill).

## Publishing

Build pages or documents locally. Never publish, upload or send anything without the user's explicit approval for
that exact action.
