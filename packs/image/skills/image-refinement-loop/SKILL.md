---
name: image-refinement-loop
description: Iteratively inspect, challenge, regenerate, and verify raster images with the workspace's generation tool until every explicit acceptance criterion and a mandatory common-sense reality check pass. Use when a user asks to refine an image repeatedly, compare a generated image against references or plans, catch physically or semantically implausible details, fix inaccuracies without regressions, run an image-analysis loop, or keep recreating an image until it is correct, coherent, polished, or “perfect.”
---

# Image Refinement Loop

Turn subjective image iteration into a controlled generate → inspect → diagnose →
correct → verify loop. Treat “perfect” as “all current, evidence-backed acceptance
criteria pass with no material regression,” never as an unsupported absolute claim.

## Tool path

1. Generate with the tool named in the workspace `AGENTS.md` ("Generation tools"), as the `image` skill describes.
   Every pass usually costs money: confirm the USD cap before the loop starts, include the worst-case number of
   passes in that estimate (cap the loop, default 5 passes), log each pass to `qa/spend.log`, and stop at the cap
   even if defects remain.
2. If the tool can edit with an instruction, a mask or reference images, a correction pass is an edit of the
   strongest candidate. If it can only generate, a correction pass is a new generation with a revised prompt and the
   same seed first (then a new seed if the defect persists).
3. Keep each correction to one defect system: most generators follow long multi-part prompts unreliably. Exact text
   in images is a weak point: say so up front and expect to add final text in post (HTML/CSS render or an image
   editor) rather than loop.
4. No tool in this workspace: run the loop on images the user generates elsewhere and drops into `inbox/`. You do the
   inspection, flaw ledger and correction prompts; the user runs them.
5. Do not use another provider, service or key unless the user explicitly asks.

## Establish the contract

Before generating, identify:

- the edit target or requested new image;
- every reference image and its role;
- the authority order when references conflict;
- hard constraints that must be literally correct;
- accepted invariants that must never drift;
- cosmetic preferences that may be refined after correctness;
- unresolved facts that must not be invented.

Label inputs explicitly in prompts, for example: `Image 1: edit target`,
`Image 2: controlling geometry reference`, `Image 3: style reference only`.

If a local image is an edit target or must be visually evaluated, inspect it
first by reading the image file (the `read` tool shows images) at full size. Inspect controlling references too.

Before auditing any candidate, read [references/flaw-taxonomy.md](references/flaw-taxonomy.md).
Before writing an analysis, correction, or regression prompt, read
[references/prompt-templates.md](references/prompt-templates.md). Use the
architectural modules when the image depicts a building, interior, exterior,
floor plan, walkthrough anchor, or property visualization.

## Build the acceptance checklist

Translate the request into observable yes/no checks. Classify each check:

- **Hard contradiction:** wrong geometry, count, placement, identity, required
  text, topology, product fact, or other source-controlled detail. Reject.
- **Regression:** a previously accepted invariant changed during an edit. Reject.
- **Material quality defect:** distortion, broken physics, duplicated hardware,
  unreadable focal detail, inconsistent light, or implausible construction.
  Reject or repair.
- **Cosmetic variance:** a non-blocking style, color, crop, or polish issue.
  Refine only after hard constraints pass.
- **Unresolved:** references are missing, contradictory, or ambiguous. Do not
  hallucinate a resolution; exclude the detail or request clarification.

Keep the checklist stable across iterations. Add a criterion only when new visual
evidence exposes a real requirement.

### Add measurable gates for source-controlled imagery

When a drawing, elevation, plan, product diagram, or other measurable reference
controls the result, do not rely only on adjectives such as `wide`, `compact`,
`balanced`, or `human scale`. Before generation:

1. Create a compact geometry control sheet listing every controlled count,
   orientation, adjacency, repeated rhythm, and visible opening.
2. Record useful ratios from the source, such as overall width:height, module
   width:height, opening width:wall width, garage width:entry width, projection
   width:module width, and sill/head alignment. Use pixels when real dimensions
   are unavailable; ratios are still evidence.
3. Set explicit tolerances appropriate to the source and intended camera. Use a
   strict tolerance for a near-orthographic view; use landmark and vanishing-line
   checks rather than false numeric precision for a perspective view.
4. Separate **geometry approval** from finish, atmosphere, landscaping, and
   photographic polish. A styled image cannot pass while the silhouette or
   topology remains wrong.

For a near-front architectural view, make a transparent reference/candidate
overlay using `scripts/architectural_overlay.sh` after aligning the building
extents. Inspect roofline, party walls, module divisions, opening edges, floor
datum, and projection boundaries. An overlay is evidence, not an automatic pass:
if perspective differs materially, use a landmark ledger instead and state why.

## Apply the common-sense reality filter

Run this mandatory filter after source-controlled geometry checks and before any
candidate can pass. Ask: **If this were real, could a person understand and use
it without something feeling impossible, blocked, misleading, or uncanny?**

Check all relevant categories:

- **Use and circulation:** doors can swing, drawers can open, chairs can pull
  out, people can walk through, and vehicles do not block required access.
- **Scale and ergonomics:** rooms, steps, openings, fixtures, furniture,
  vehicles, handles, clearances, and camera height make ordinary human sense.
- **Connections and destinations:** stairs land somewhere; doors and openings
  lead to plausible spaces; hallways, windows, plumbing, and vents agree with
  the surrounding structure.
- **Physical behavior:** gravity, support, joins, hinges, shadows, lighting,
  water flow, material thickness, and object contact are credible.
- **Optical behavior:** mirrors reflect the actual opposing scene; glass,
  polished surfaces, shadows, highlights, and perspective respond to the same
  camera and light. A blank mirror is not acceptable merely because it is neat.
- **Scene continuity:** indoor and outdoor conditions agree; repeated objects do
  not mutate; adjacent views describe the same home, time, materials, and route.
- **Everyday semantics:** object count, orientation, placement, and purpose make
  sense. Question anything a non-expert viewer would immediately ask “why is
  that there?” or “how would that work?”
- **Generator tells:** reject quiet uncanny errors such as extra handles,
  impossible reflections, fused hardware, doors without destinations, fake
  openings, duplicated fixtures, inaccessible storage, or decorative elements
  masquerading as architecture.

Do a brief counterfactual walkthrough: imagine entering, turning, opening,
sitting, washing, parking, climbing, and leaving. Then inspect what each mirror,
window, doorway, and adjacent view should reveal. Do not excuse a failure because
the image is attractive or because the floor-plan outline technically matches.

Treat a common-sense failure as a **hard contradiction** when it conflicts with
controlling evidence; otherwise treat it as a **material quality defect**. Never
downgrade it to cosmetic variance.

## Run the loop

### 1. Inspect

Inspect the current candidate at full resolution (read the image file). Question it actively:

- Does it literally match the controlling reference?
- Are counts, sides, proportions, openings, connections, and directions correct?
- Does perspective make a dimension look materially false?
- Did the generator invent, omit, duplicate, merge, or relocate anything?
- Are physics, lighting, reflections, hands, text, hardware, and joins plausible?
- Could a person actually enter, circulate, operate, clean, maintain, and leave?
- What should every visible door, stair, window, mirror, and opening connect to
  or reveal, and does the image show that honestly?
- Is any element technically drawable but obviously nonsensical in daily use?
- Is the image merely attractive, or actually correct for its intended use?

Record concrete failures rather than vague reactions.

Inspect in a fixed order so attractive focal areas do not hide errors:

1. whole-frame composition and camera;
2. foreground, midground, and background;
3. left edge to right edge and floor to ceiling;
4. every opening, connection, reflective surface, fixture, and repeated object;
5. intended human route and use sequence;
6. cross-reference and cross-image continuity.

Write a flaw ledger before editing: `zone/element`, `expected`, `observed`,
`severity`, `evidence`, and `smallest safe correction`. Explicitly record a pass
for critical systems rather than assuming silence means success.

### 2. Choose a coherent correction pass

Fix the highest-priority failing system first. A single iteration may correct
multiple defects when they are causally related or belong to one coherent system,
for example: overall massing + module widths + opening proportions, or material
scale + coursing + corner termination. Do not bundle unrelated geometry, material,
lighting, landscaping, and camera changes merely to save an iteration.

Write every defect being corrected as a separate observable acceptance check.
Repeat every accepted invariant in the edit prompt using language such as
`change X1, X2, and X3; preserve Y, Z, and W unchanged`. After generation, verify
each listed correction independently and rerun the complete regression audit.

When a single edit repeatedly causes drift, change strategy instead of repeating
the same prompt:

- restart from the strongest earlier candidate;
- simplify or crop the controlling reference for clarity;
- separate geometry correction from styling;
- regenerate a clean base before performing smaller edits.

Do not stop merely because one prompt failed. Within the agreed pass cap and budget,
continue while a safe, evidence-backed correction remains.

### 3. Generate

Run the generation tool with the correction prompt, writing to a new versioned file. Preserve source roles and authority in every prompt.
Never silently relax a hard criterion to obtain a prettier image.

### 4. Reinspect from scratch

Inspect the new output at original detail. Re-run the full checklist, not only the
criterion just edited. Compare against the controlling references and the prior
accepted candidate. Reject any new material regression even if the targeted fix
succeeded. Re-run the common-sense reality filter from scratch; do not inherit a
previous pass after any regeneration.

For source-controlled architecture, complete both checks before selection:

- **Measured geometry check:** compare the candidate with the geometry control
  sheet and overlay or perspective-landmark ledger.
- **Independent adversarial check:** obtain a fresh skeptical judgment that did
  not write the generation prompt. Use a subagent if the harness has one; otherwise run the judge as a separate
  process, e.g. `pi -p --no-session "<judge prompt>" @candidate.png @reference.png` (with a model that can see
  images), giving it only the raw
  candidate, controlling references, checklist, and authority order. Do not provide the
  intended conclusion. The judge must try to reject the candidate and return a
  flaw ledger plus `PASS` or `REJECT`.

### 5. Select or iterate

- Promote the new candidate only if it fixes the target without a harder
  regression.
- Otherwise return to the strongest prior candidate and try a narrower edit or a
  new strategy.
- Continue until every hard and material-quality criterion passes.

Use precise state labels:

- `candidate`: generated but not fully audited;
- `rejected`: any hard, regression, material, or common-sense failure remains;
- `loop-pass`: all internal gates passed, but the user has not approved it;
- `user-approved`: the user explicitly selected or approved that exact image.

Never call a `candidate` or `loop-pass` image `accepted`, `final`, `master`,
`approved`, or an equivalent term. For commissioned or reference-controlled work,
only `user-approved` may be promoted to a final set, storyboard or deliverable.

## Stop gate

Stop only when all of the following are true:

1. Every evidence-backed hard constraint passes.
2. No accepted invariant materially regressed.
3. No obvious invented, duplicated, missing, distorted, or physically implausible
   element remains at original-detail inspection.
4. The candidate passes the complete common-sense reality filter, including
   circulation, operation, scale, physical behavior, optical behavior, and scene
   continuity.
5. Composition, lighting, crop, and finish are fit for the stated use.
6. Any unresolved detail is deliberately omitted or clearly documented.

For source-controlled architectural imagery, also require:

7. The geometry control sheet passes within its stated tolerances.
8. The overlay or perspective-landmark comparison exposes no material silhouette,
   datum, opening, module, or projection mismatch.
9. A fresh adversarial judge returns `PASS` with no hard or material issue.

Internal completion produces `loop-pass`, not user approval.

## Publication and replacement gate

The refinement loop does not itself authorize publishing, deployment, replacing
an existing production image, or presenting a candidate as approved.

- Do not overwrite the current production asset during iteration.
- Do not wire a `candidate`, `rejected`, or merely `loop-pass` image into a live
  page, storyboard, hero, shared folder, or approved collection.
- Show the `loop-pass` image and its concise QA evidence to the user first.
- Replace a local asset only after the user explicitly approves that exact image or
  explicitly waives the review gate for a clearly defined batch. Publishing, uploading
  or sending is never part of this loop: the user does that (see the `image` skill).
- Keep rejected iterations out of the primary presentation. If retained for
  process evidence, label them visibly as rejected or provisional.

If reference ambiguity makes correctness unknowable, stop the generation loop
only at that boundary, preserve the best honest candidate, and state exactly what
evidence is needed. Do not label an ambiguous detail as perfect.

## Save and hand off

For project-bound work:

1. Write every candidate to `outputs/<project>/` in the workspace with a new versioned filename. Never overwrite.
2. Save the final effective prompt when future consistency matters.
3. Save a short QA record in `qa/<project>/` containing the acceptance checklist, common-sense
   reality-filter results, measured geometry/overlay results, independent judge
   result, rejected issues, exact state (`rejected`, `loop-pass`, or
   `user-approved`), deliberately
   omitted details, generator used (tool, model, seed, cost), and output dimensions.
4. Keep the final prompt, model, and seed next to the image.
5. Report the final absolute path, the tool used, resolution, and the total spent from `qa/spend.log`.

Show the loop-pass or user-approved image inline when useful. Do not clutter the handoff with every
discarded iteration unless the user asks to compare them.
