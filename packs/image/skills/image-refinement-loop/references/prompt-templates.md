# Refinement prompt templates

Replace bracketed fields with observed facts. Keep source roles and authority
explicit. Do not send a correction prompt until the audit prompt has produced a
flaw ledger.

## 1. Skeptical audit prompt

```text
Act as a skeptical visual QA inspector. Your goal is to disprove that the
candidate is ready, not to praise it.

Inputs and authority:
- Image 1: candidate under review.
- Image 2: [geometry/identity/text authority].
- Image 3: [style reference only].
- Authority order: [highest to lowest].

Intended use: [website hero / walkthrough anchor / product image / etc.].
Hard constraints: [observable source-controlled facts].
Accepted invariants: [facts that must not drift].
Unresolved facts: [facts that must not be invented].

Inspect at original detail in this order:
1. whole frame and camera;
2. foreground, midground, background;
3. left-to-right and floor-to-ceiling;
4. every opening, connection, reflective surface, fixture, repeated object;
5. human route and operation;
6. cross-reference and neighboring-image continuity.

Apply the complete flaw taxonomy and common-sense reality filter. For each issue,
return: zone/element | expected | observed | severity (hard/material/cosmetic/
unresolved) | evidence | smallest safe correction.

Explicitly record passes for geometry, count, circulation, scale, door operation,
stairs, windows, reflections, lighting/shadows, material joins, object physics,
and scene continuity. List the three most likely hidden or easy-to-miss failures.
End with PASS or REJECT. PASS only if no hard or material issue remains.
```

## 2. Coherent multi-defect correction prompt

```text
Use case: precise-object-edit
Asset type: [intended use]
Input images:
- Image 1: EDIT TARGET and strongest accepted candidate.
- Image 2: CONTROLLING [geometry/identity/text] reference.
- Image 3: STYLE REFERENCE ONLY, if applicable.

Correction system: [geometry / materials / optics / continuity / other].
Defects to correct in this pass:
1. [observable defect] -> [literal, testable expected result]
2. [related observable defect] -> [literal, testable expected result]
3. [related observable defect] -> [literal, testable expected result]

These defects may be corrected together because: [shared cause or system].

Preserve unchanged: [camera, crop, geometry, counts, placements, materials,
lighting, identities, accepted reflections, text, and other invariants].

Physical/common-sense requirements: [clearance, gravity, support, connection,
reflection, door swing, destination, human use, or other relevant facts].

Do not add, remove, move, mirror, duplicate, merge, restyle, relight, or crop any
unrelated element. Avoid: [specific known generator failure modes]. No text,
branding, watermark, or invented detail unless explicitly required.
```

Do not combine unrelated geometry, materials, lighting, landscaping, and camera
changes in one pass merely for speed. Verify each listed defect independently.

## 3. Architectural plan-lock prompt module

Append this module when a plan or drawing controls the image:

```text
The drawing controls topology, side, count, adjacency, openings, stairs, fixture
walls, and circulation. The candidate may vary only in finishes, furnishings,
lighting, and camera styling where the drawing is silent. Do not use attractive
staging to hide or reinterpret a controlled fact. Every visible door, stair,
window, mirror, and opening must have a plausible destination or opposing scene.
Where the drawing is ambiguous, omit the uncertain feature and flag it; do not
invent a resolution.
```

## 4. Regression and reality-check prompt

```text
Compare the new candidate against the prior accepted candidate and every
controlling reference from scratch.

1. Did the targeted defect become literally correct?
2. Which pixels or systems changed beyond the target?
3. Did any count, side, placement, identity, topology, crop, lighting, material,
   reflection, or connection regress?
4. Could a person enter, circulate, operate, clean, maintain, and leave?
5. Do all doors, stairs, windows, mirrors, glass, shadows, and openings behave
   according to one coherent physical scene?
6. What are the three strongest reasons to reject this candidate?

Return a flaw ledger and PASS or REJECT. Reject on any hard contradiction,
material defect, or common-sense failure. Do not inherit the previous pass.
```

## 5. Cross-image continuity prompt

```text
Treat these images as consecutive observations of one unchanged place. Build an
invariant ledger for room topology, route direction, openings, stairs, windows,
materials, hardware, furniture identity, lighting/time, and exterior view.
Compare every neighboring pair. Identify spatial jumps, mirrored layouts,
mutated objects, repeated route segments, impossible camera moves, missing rooms,
and endpoint mismatches. Mark the earliest contradiction and the smallest image
or segment that must be rebuilt. Do not average contradictions into a compromise.
```

## 6. Final adversarial stop-gate prompt

```text
Assume this image is about to be shown to someone who knows the source material.
Try to find one reason it would embarrass the presentation. Inspect the least
interesting areas first: corners, edges, reflections, door clearances, hardware,
floor/wall joins, background openings, repeated objects, shadows, and crop.

Answer:
- What would a contractor, homeowner, photographer, and ordinary viewer each
  question first?
- What only looks correct because of framing, blur, darkness, or styling?
- If built or used exactly as shown, what fails?
- If no failure remains, cite concrete evidence for each critical pass.

Return PASS only when every evidence-backed hard constraint, material-quality
check, and common-sense reality check passes.
```

## 7. Architectural geometry-control prompt

```text
Act as an architectural geometry inspector, not an art director.

Inputs:
- Image 1: candidate.
- Image 2: controlling elevation/plan/drawing.
- Image 3: optional style reference; it has no authority over geometry.

Geometry control sheet:
- Required counts: [modules/openings/doors/windows/etc.].
- Required orientation and repeated rhythm: [facts].
- Source ratios and tolerances: [ratio = value, tolerance = value].
- Required aligned datums/landmarks: [roof/floor/opening/projection lines].

Compare silhouette, module divisions, floor datum, roofline, opening rectangles,
projection boundaries, repeated spacing, and width:height relationships. Use the
provided overlay when camera alignment is comparable; otherwise explain why an
overlay would mislead and use perspective landmarks.

Return:
1. ratio/landmark table: expected | observed | tolerance | pass/fail;
2. flaw ledger for every failure;
3. GEOMETRY PASS or GEOMETRY REJECT.

Do not discuss beauty, lighting, landscaping, or marketability until geometry
passes.
```

## 8. Promotion and publication gate

```text
Classify the exact candidate as one of: candidate, rejected, loop-pass,
user-approved.

Confirm:
- geometry control completed;
- regression and reality checks completed;
- independent adversarial result;
- exact user approval exists for this image.

If exact user approval is absent, the highest permissible state is loop-pass.
Do not call it accepted/final/master/approved and do not replace or publish a
production asset.
```
