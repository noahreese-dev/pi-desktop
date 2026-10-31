---
name: learn
description: Teach the user a topic over many sessions in a persistent workspace - find out what they already know, ground every lesson in vetted sources, teach one new idea per short HTML lesson with a check, and run spaced retrieval practice. Use when the user says learn, teach me, lesson, study, explain step by step, quiz me, review, or practice.
---

# Learn

The user is learning over **many** sessions. What they know, what they want and what has been taught lives in files,
not in this conversation. Read the files first; write to them as you go.

## Workspace

The workspace is the folder this harness starts in (read its `AGENTS.md`). Only ever write inside it.

```
<workspace>/
  PROFILE.md                  the learner: goals, preferences, strengths, recurring gaps. Short, edited in place.
  <topic-slug>/               one folder per topic (a "course")
    MISSION.md                why they are learning this                   MISSION-FORMAT.md
    RESOURCES.md              vetted sources; all teaching draws on these   RESOURCES-FORMAT.md
    GLOSSARY.md               the topic's terms, once understood            GLOSSARY-FORMAT.md
    NOTES.md                  how this learner likes this topic taught      free-form
    learning-records/         NNNN-slug.md, evidence of what is now held    LEARNING-RECORD-FORMAT.md
    lessons/                  NNNN-slug.html, one short lesson each         below
    reference/                cheat sheets (*.html) and saved source text   below
    assets/                   lesson.css and reusable widgets               below
```

Pi Desktop's Learning panel reads exactly this layout: every folder at the workspace root is a course (its
`MISSION.md` one-liner, `lessons/*.html`, `reference/*.html`, `learning-records/`), and `PROFILE.md` is the Profile
tab. So keep the root to `PROFILE.md`, `AGENTS.md` and topic folders, and give topics descriptive slugs
(`spanish-a2`, `linear-algebra`, `roman-republic`; avoid a bare `history`, which the panel treats specially).

## Session start (always)

1. Read `PROFILE.md` (create a short one if missing). Greet the learner as someone you know; do not recite it.
2. Pick the topic folder (create it for a new topic). Read `MISSION.md`, `learning-records/`, `GLOSSARY.md` and
   `NOTES.md`; list `RESOURCES.md`, `lessons/` and `assets/`.
3. No `MISSION.md`: interview the learner, one question at a time, until the goal is concrete, then write it.
   Ask before changing an existing mission.
4. Choose the phase and say it in one line, with the reason:
   - **Probe:** you don't yet know what they hold for the next goal. Read [PROBE.md](./PROBE.md).
   - **Source:** `RESOURCES.md` is too thin for the next lesson. Gather sources before teaching.
   - **Teach:** otherwise. Read [TEACH.md](./TEACH.md).
   - **Practice:** they ask for it, or the records show material that hasn't been recalled for a while.
     Read [PRACTICE.md](./PRACTICE.md).

## Ground everything in sources

Your own memory is a draft, not a source. Before teaching a claim, find it in a trustworthy source, add the source
to `RESOURCES.md`, and cite it in the lesson.

- With web search / fetch tools: use them, prefer primary and expert sources.
- Without them, sources come from: files in the workspace, text or links the user pastes, and output from a research
  character (for example `pi-ai` or `pi-history` from this pack) that the user runs and pastes or saves into the
  topic's `reference/` folder. When you need a source you cannot reach, give the user the exact question to research.
- Anything you still teach from memory is marked in the lesson as "unsourced, from model memory".

## Knowledge and wisdom

Knowledge comes from sources: books, papers, documentation, courses. Wisdom (judgement, taste, what actually matters
in practice) comes from people. When a question needs lived judgement, answer what you can, then point to a
well-moderated community or a practitioner and record it under Wisdom in `RESOURCES.md`. If the learner opts out of
communities, note it there and stop suggesting them.

## Lessons

- **One new idea per lesson**, small enough to finish in a few minutes, tied to the mission, and just beyond what the
  learning records show they hold. See TEACH.md for the sequence inside a lesson.
- **Self-contained HTML** in `lessons/NNNN-slug.html` (number from `0001`, next after the highest existing). Give it a
  real `<title>` (the panel shows it). Clean, readable typography; link `../assets/lesson.css` (create it with the
  first lesson, and put anything a second lesson would repeat into `assets/`, not inline).
- Cite sources inline, recommend one primary source to read or watch next, and link earlier lessons and reference
  sheets where they help. End by reminding the learner they can ask you follow-up questions.
- **Checks that grade themselves:** a few questions or small tasks in the page with immediate feedback that explains
  why. For multiple choice, make every option plausible and about the same length, vary where the right answer sits,
  and give no formatting hints.
- **Showing it:** in Pi Desktop (environment variable `PI_DESKTOP=1`) the Learning panel opens a new lesson by itself;
  in a terminal, run `open <path>`.
- Keep `reference/` cheat sheets (`*.html`) current: the compressed essence of what has been taught, printable.
  Maintain `GLOSSARY.md` as terms are understood.

## Learning records

Write one only on evidence: they showed they understand something non-trivial, they told you what they already know
(record the depth), a misconception was corrected, or the mission shifted. Probe results are records. Coverage is not
learning, and records are not an activity log.

## Profile

Update `PROFILE.md` when you learn something durable about the learner: a goal, a preference, a schedule, a recurring
misconception across topics. Edit in place; keep it under about 40 lines.

## Rules

- Write only inside the workspace. Never delete the learner's files.
- One question at a time when interviewing, probing or checking.
- Ask before changing `MISSION.md`.
- Don't teach what they already hold, or what is off the path to the mission, however interesting.
- Be honest in feedback: say clearly when an answer is wrong and why, and when it is right.
