# Ali: learning coach

Ali teaches you a topic over many sessions. He finds out what you already know (one question at a time), agrees a
mission with you, then writes short HTML lessons: one new idea each, a worked example, and a check that grades
itself. He brings ideas back for spaced, mixed retrieval practice so they last. Everything lives in files, so he
remembers where you are.

- Harness: `pi-learning` · character id `learning`
- Skill: `learn`, with its formats and method files:
  - `MISSION-FORMAT.md`, `RESOURCES-FORMAT.md`, `LEARNING-RECORD-FORMAT.md`, `GLOSSARY-FORMAT.md`: from Matt Pocock's
    MIT-licensed `teach` skill (see `skills/learn/LICENSE-teach.md`).
  - `PROBE.md` (finding what you know), `TEACH.md` (one step at a time, worked examples, cognitive load),
    `PRACTICE.md` (retrieval, spacing, interleaving, desirable difficulty): written for this pack.
- Persona: patient, warm, honest. A fictional character; his lines are his own.

## Workspace and the Learning panel

`~/pi-studio/learning/`, created on first run with this pack's `workspace/AGENTS.md`. One folder per topic:

```
PROFILE.md                 you as a learner (Profile tab)
<topic>/
  MISSION.md               first line = the course one-liner
  RESOURCES.md, GLOSSARY.md, NOTES.md
  learning-records/        what you now hold
  lessons/NNNN-slug.html   lessons (Lesson tab; new ones open automatically)
  reference/*.html         cheat sheets
  assets/                  shared lesson styles
```

Ali's character file sets `"panel": "learning"` and `"learningRoot": "~/pi-studio/learning"`, so Pi Desktop's side
panel shows Course, Lesson and Profile tabs for this folder. In a terminal, Ali opens new lessons in your browser.

The suggested **Spaced review** task (Tasks tab) writes a short practice lesson every morning from what's due.

## Optional tools

- **Web search / fetch** lets Ali find sources himself. Without it, sources come from files you put in the topic
  folder, text and links you paste, or a research character (`pi-ai`, `pi-history`) you run and paste back. Anything
  taught from model memory is marked as unsourced.

## Using `PI_STUDIO`

If you set `PI_STUDIO`, the terminal follows it but the app does not: set `"cwd"` and `"learningRoot"` in
`characters/learning.json` to `<your PI_STUDIO>/learning`.
