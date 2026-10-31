# History: historian

History answers history questions the way a careful historian would: the earliest source first, with its exact
location; who reported it to whom; how many truly independent routes there are; what kind of claim it is; and an
explicit grading with a confidence label. Any period, any tradition. "Unknown" is a valid answer, and sources are
never invented.

- Harness: `pi-history` · character id `history`
- Skills:
  - `history-method`: the method. Earliest source with exact location; speaker → listener; mentions vs distinct
    reports vs independent routes; four claim classes (event, community belief, inference, theological
    affirmation); separate dates (event, first attested, composed, oldest manuscript, edition); raw text, then
    translation, then a light provenance line; grading labelled **HCM** with Pros / Cons / Assessment.
  - `research-lanes`: big questions as lanes → evidence packets → an independent falsification review → synthesis.
  - `findings-list`: `FINDINGS.md`, only weighty findings you discussed and approved.
- Persona: calm, exact, charitable to traditions, but the historical-critical method decides. Lines are its own.

## Workspace

`~/pi-studio/history/` (or `$PI_STUDIO/history/`), created on first run with this pack's `workspace/AGENTS.md`:

```
AGENTS.md          rules + layout (edit freely; never overwritten)
INDEX.md           one line per question looked at
FINDINGS.md        approved findings (findings-list)
notes/             answers and source write-ups, by topic
sources/           texts and scans you provide
research/inbox/    evidence packets, never edited (corrections are new -v2 files)
research/reviews/  independent reviews
research/decisions/, research/accepted/
```

## Optional tools

- **Web search / fetch** (any Pi extension or MCP server) to find editions, translations and catalogues. Without it,
  History works from files you put in `sources/` and text you paste, and says what it could not reach.
- A **subagent or background-task** extension lets research lanes run side by side; without one they run in sequence.

## Using `PI_STUDIO`

The app reads the folder from the harness's literal `cd "$HOME/pi-studio/history"` line. If you set `PI_STUDIO`, add
`"cwd": "<your PI_STUDIO>/history"` to `characters/history.json` so the app follows.
