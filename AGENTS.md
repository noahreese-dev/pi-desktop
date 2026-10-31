# AGENTS.md

Instructions for anyone changing this repo: AI coding agents first, humans welcome. Read this before editing.
User-facing docs live in README.md and docs/; this file is about working on the code.

## What this is

Pi Desktop is a macOS Electron app that puts a chat window on top of [Pi](https://github.com/earendil-works/pi)
harnesses. Each `~/bin/pi-<id>` script is a **character**. The app runs `pi-<id> --mode rpc` per open chat and talks
JSON lines over stdin/stdout. It never adds prompt text of its own (a character's optional `persona` is the only
exception, and it is opt-in). Pi's own session files are the chat history.

## Commands

```bash
npm install            # also unpacks Electron (scripts/ensure-electron.mjs works around a flaky unzip)
npm run doctor         # environment check: Node, Electron, pi, harnesses, optional voice/faces. Run this first.
npm start              # run the app from the repo
npm run check          # syntax: every .js/.mjs, shell script and JSON file. Must pass.
npm test               # offline unit tests (lib/core.js), < 1 s, no Electron/Pi/model. Must pass.
npm run smoke          # end-to-end UI test against a running isolated app (see "Testing"). Costs a few model calls.
npm run faces          # redraw pixel faces from characters/<id>.json "face" blocks (Python 3 + Pillow)
```

## Layout

```
main.js             Electron main process: harness discovery, one Pi process per chat, sessions, tasks, tray, IPC
preload.js          the `desk` bridge: the ONLY API the page can call
app/renderer.js     all UI, plain DOM via a tiny h(tag, attrs, ...children) helper
app/index.html      shell + Content-Security-Policy
app/style.css       the design (per-character accent via CSS variables)
lib/core.js         pure logic (no Electron/fs/clock): harness parsing, turn state, schedules, path policy. Unit-tested.
voice/asr.js        voice typing: warm whisper-server, whisper-cli fallback
characters/         example character files (+ generated faces in characters/<id>/)
packs/              installable character pack (scripts/install-pack.sh)
examples/bin/       example harness scripts
extensions/         pixel-coach: the character's face and identity inside Pi's terminal UI
faces/              pixel_faces.py (traits → 20×20 face), build.sh (portrait → app + terminal assets)
scripts/            doctor, check, install-pack, new-character, ensure-electron
tests/              unit.test.mjs (offline), smoke.mjs (end-to-end over CDP)
docs/               ARCHITECTURE, CHARACTERS, HARNESSES
```

## Rules (invariants; a change that breaks one gets rejected)

1. **No framework, no bundler, no build step, no TypeScript in the app.** Plain JavaScript that runs as written.
   New runtime dependencies need a strong reason; dev tooling must not become required to run the app.
2. **The page has no Node.** `contextIsolation` and `sandbox` stay on, `nodeIntegration` off; preload.js may only use `contextBridge`, `ipcRenderer` and `webUtils`. A new capability is exactly:
   an `ipcMain.handle("area:verb", …)` in main.js + one line in preload.js + a call in renderer.js.
   Validate every argument in main.js; the page is untrusted (it renders model output).
3. **The page may only send allow-listed Pi RPC commands** (`lib/core.js` `pageRpcAllowed`; Pi's RPC includes `bash`)
   and may only change the settings listed in `SETTINGS` (main.js). Extend those lists deliberately, never bypass them.
   **Files the page asks for go through `safePath()`** (home folder or /tmp, never credential stores; policy in
   `lib/core.js` `allowedPath`). Never pass a renderer string to a shell. Use `execFile`/`spawn` with an argument
   array, never `exec` with string interpolation.
4. **Never write Pi's session files.** Chat metadata the app owns (title, pin, archive, owner) goes in `threads.json`.
   Behaviour changes go through Pi's RPC commands. Deleting a chat moves the file to the Trash, never `rm`.
5. **One Pi process per session file.** Two chats on the same file share one process (`procForFile`). Never start a
   second writer.
6. **Harness-agnostic.** No code may assume a provider, model, extension, skill, folder layout or user name.
   Personal setup belongs in the user's `config.json`, harness scripts and character files, never in code.
7. **User data is never committed:** `config.json`, `threads.json`, `tasks.json`, `usage.json`, `pi-exits.log`,
   `models/`, `sounds/clips/`. No telemetry, no network calls except to the user's own configured services.
8. **Pure logic goes in `lib/core.js` with a unit test.** If you add a parser, a rule or a date calculation to
   main.js, put it in lib/core.js instead and test it in tests/unit.test.mjs.
9. **macOS only** today. Cross-platform changes are welcome only if macOS behaviour stays identical.
10. **Docs move with code.** New config key → README "Config" table + config.example.json. New character field →
    docs/CHARACTERS.md. New file or state → docs/ARCHITECTURE.md. New user-visible behaviour → CHANGELOG.md.

## Style

- Match the surrounding code: short functions, early returns, dense but readable lines, `const` arrow helpers.
- Comments say **why**, not what. One line above the thing, in plain English.
- UI text is plain English, no jargon or internal names. Errors say what happened and what to do next.
- Keep diffs small and focused. No drive-by reformatting. No new files when an existing one is the natural home.

## How to…

- **Add a setting:** default in the `config` object at the top of main.js, the key in config.example.json and the
  README table; if it belongs in Settings (⌘,), add the field in `openSettings()` in renderer.js.
- **Add a character field:** read it in `loadCharacters()` (main.js) or where it's used in renderer.js, document it
  in docs/CHARACTERS.md, and show it in characters/_template.json if it's common.
- **Add a side-panel tab:** `panelTabs()` + a `render<Tab>(body)` + a branch in `renderPanel()` (renderer.js);
  gate it on a character field or config key so it's opt-in.
- **Add a character:** `scripts/new-character.sh <id> "Name" "tagline"`, or a pack (below).
- **Add to the character pack:** `packs/<id>/` with `pi-<id>`, `character.json`, `skills/`, `workspace/AGENTS.md`,
  `README.md`; add it to the table in packs/README.md (`scripts/install-pack.sh` finds packs by itself). A persona may share a first name or a
  working style with someone, but never names, imitates, quotes or implies the endorsement of a real person, and faces
  are generated pixel art, never likenesses. No provider/model pinned; never `--no-extensions` in a harness (it
  removes the user's provider extensions).

## Testing

Always: `npm run check && npm test`.

UI or main-process changes: run the smoke test against an isolated copy of the app (its own profile, never your
real chats), with at least two harnesses:

```bash
PIDESK_PROFILE=/tmp/pidesk-test ./node_modules/.bin/electron . --remote-debugging-port=9333 &
node tests/smoke.mjs research writer          # two harness ids; prints "N passed, 0 failed"
```

**The smoke test uses real harnesses:** it makes model calls through them, writes a fixture chat into the first
character's real Pi session folder (moved to the Trash at the end), and reads/writes the clipboard. Point it at test
harnesses (a `harnessDir` in the profile's config.json, e.g. copies of examples/bin), never your everyday characters.

Expected: every check passes (71 at v0.2.1). For stable results use test harnesses on a fast model with no global
extensions, e.g. `exec pi --no-extensions --no-skills --model <provider>/<fast-model> --thinking off "$@"`.
New feature → add a check to tests/smoke.mjs (UI) or tests/unit.test.mjs (logic).

## Gotchas (each one cost someone an afternoon)

- **Finder-launched apps get a bare PATH.** main.js builds `ENV.PATH` from the login shell; spawn harnesses with `ENV`.
- **Split Pi's stdout on `\n` only.** JSON strings may contain U+2028, which readline-style splitters break on.
- **`/tmp` is `/private/tmp`.** Pi names session folders from the real cwd, so a test HOME under /tmp must be the
  `/private/tmp/...` form or the app looks in the wrong session folder.
- **Global Pi extensions leak into tests.** Persona/memory extensions inject hidden messages and slow startup;
  use `--no-extensions` in test harnesses (only there).
- **Don't await a Pi process boot on a UI path.** Starting Pi can take seconds (10+ with heavy extensions).
  Example: deleting the open chat used to wait for the replacement chat's process before trashing the file.
- **Weekly tasks: day 0 is Sunday.** `+day || 1` silently turned Sunday into Monday; use `day ?? 1`.
- **Hidden windows can't be screenshotted.** A test profile hides the window unless `PIDESK_SHOW=1`.
- **Electron's postinstall can leave the zip unpacked** on some Node versions; scripts/ensure-electron.mjs fixes it.

## Before you finish

- `npm run check` and `npm test` pass; smoke passes for UI/main changes (paste the summary line).
- Docs and CHANGELOG updated per rule 10. Screenshot for UI changes.
- No personal paths, names, keys or providers anywhere in the diff (`git diff | grep -iE "/Users/|api[_-]?key"`).
- Report what you ran and what it printed. Partial work is reported as partial.
