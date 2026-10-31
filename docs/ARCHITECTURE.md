# Architecture

Deliberately small: no framework, no bundler, no build step. Four files hold the app; `lib/core.js` holds the pure,
unit-tested logic. Working on the code? Read [AGENTS.md](../AGENTS.md) first.

```
main.js            Electron main process: discovery, Pi processes, sessions, tasks, sounds, IPC, menus, tray
preload.js         the `desk` bridge: the only API the page can call (contextIsolation on, no Node in the page)
app/index.html     the shell layout + CSP
app/renderer.js    all UI: sidebar, chat, composer, popovers, side panel, settings (a tiny `h()` DOM helper, no framework)
app/style.css      the design (dark, vibrancy sidebar, per-character accent via CSS variables)
lib/core.js        pure logic, no Electron/fs/clock: harness parsing, turn state, schedules, path + RPC policy
voice/asr.js       voice typing: whisper-server kept warm (idle exit after 20 min), whisper-cli fallback
packs/             the character pack (installed with scripts/install-pack.sh)
characters/        one JSON per harness (+ generated faces in characters/<id>/)
faces/             pixel_faces.py (trait → 20×20 face), build.sh (portrait → app + terminal assets)
extensions/        pixel-coach: the same character in the Pi terminal UI
sounds/            optional offline renderer for finish chimes + voices
scripts/           doctor.mjs, check.mjs, install-pack.sh, new-character.sh, ensure-electron.mjs (postinstall)
tests/             unit.test.mjs (offline, lib/core.js), smoke.mjs (end-to-end over the Chrome DevTools Protocol)
```

## Data flow

```
renderer.js ──desk.cmd(key, {type:"prompt"…})──▶ preload ──ipc──▶ main.js ──stdin JSON line──▶ pi-<id> --mode rpc
renderer.js ◀──"pi:event" {id, ev}──────────────── preload ◀──ipc── main.js ◀──stdout JSON lines── (Pi events)
```

- **One Pi process per open chat**, keyed by a chat id the renderer makes. Chats under different characters (or two chats
  of one character) stream side by side. Processes start lazily (when you click into or type in the composer), and an
  empty chat's process is closed when you leave it.
- Responses are matched to requests by `id`; everything else (`agent_start`, `message_update`, `tool_execution_*`,
  `agent_settled`, `extension_ui_request`, …) is forwarded to the page as an event.
- stdout is split on `\n` only (JSON strings may contain U+2028, which line readers would split on).
- **History** is read straight from Pi's session `.jsonl` (walking the branch from the newest entry to the root,
  skipping system-prompt snapshots), so opening an old chat costs no process and shows instantly.

## State the app owns

All in the app folder (or `$PIDESK_PROFILE` for tests), all gitignored:

| File | What |
|---|---|
| `config.json` | your settings (see `config.example.json`) |
| `threads.json` | per-chat pin / archive / custom title, keyed by session file path |
| `tasks.json` | scheduled routines and their last 20 runs |
| `usage.json` | sends per character, for switcher ordering (recent use weighs more, halving every 2 weeks) |
| `pi-exits.log` | one JSON line per Pi process exit (who closed it, was it working), for "why did my chat stop?" |
| `~/Library/Application Support/Pi Desktop/window-state.json` | window bounds |

## Keeping work alive

- While any chat or task is working, `caffeinate -i` stops idle sleep (on battery too). The display still sleeps and
  closing the lid still sleeps the Mac.
- A chat whose harness reports background jobs (the `background-tasks` status) counts as working for up to 45 minutes
  after its last activity (`PIDESK_BG_GRACE_MS`), so the idle reaper doesn't close it and lose the job's result.
- Quitting while anything is working asks first.
- A chat whose last turn was cut off (mid-tool, unanswered, or a network/process error) shows **Continue**.
- Two chats on one session file share one Pi process, so a file never has two writers.

## Scheduled tasks

A 30-second tick checks `tasks.json`. A due task runs as a separate headless `pi-<id> -p` process (never the open chat),
named `⏰ <task>` so its result appears as a normal chat, with a notification and the finish sound. A run missed while
the app was closed catches up once on launch if it was due in the last 12 hours. Tasks only run while the app is open:
turn on "Open at login".

## Security model

The page shows model output, so main.js treats it as untrusted.

- `contextIsolation` and `sandbox` on, no Node in the page; `preload.js` exposes a fixed list of calls.
- **Pi RPC allow-list:** the page may send only the commands the UI uses (`lib/core.js` `pageRpcAllowed`). Pi's RPC
  also accepts `bash`, which the page can never reach. Chat exports may only be written to `~/Downloads` or `/tmp`. "Copy as Markdown" reads the session file in
  main.js and writes the clipboard there; the page only passes a chat file path, which must belong to a known harness.
- **Settings allow-list:** the page can change only what the Settings sheet edits. `harnessDir` and `memory` (which
  decide what runs and where data goes) are edited in `config.json` by you.
- **Files:** reads, previews, "Open" and "Reveal" go through `safePath()`: your home folder and `/tmp` only, never
  keys, tokens, credential stores, shell history, browser data, Mail or Messages (`lib/core.js` `SECRET`).
  "Open" never launches apps or scripts (`.app`, `.command`, executables…); those are shown in Finder instead.
- **Model markdown:** sanitized with DOMPurify, no `<style>`/forms/`style=`; remote images become links (a rendered
  image URL could carry data out). The CSP allows no network connections from the page and no remote images.
- Lessons and HTML previews run in sandboxed iframes (no same-origin, no popups). PDF previews use Chromium's
  built-in PDF viewer, which needs an unsandboxed frame; it renders the file, it doesn't run it. Permissions (microphone,
  clipboard) are granted to the app's own page only.
- Links open in your browser; the window can't navigate away from `app/index.html`.
- A character file can't change which script runs (`id`/`script` are ignored in character JSON).
- The Memory proxy (only when `config.memory` is set) forwards an allow-list of Hindsight endpoints.
- Pi itself runs with your full user permissions, exactly as in a terminal. The app adds no sandbox around your harness.

## Optional: Memory tab (Hindsight)

Set `"memory": { "url": "http://127.0.0.1:8888", "bank": "default", "explorer": "http://127.0.0.1:9999" }` to get a
Memory tab backed by a [Hindsight](https://github.com/vectorize-io/hindsight) server: browse, search, edit and remove
memories, scoped to the current character (tag `harness:<id>`) or everything, plus "tell it something to remember".
It shows the mental model `profile-user` and the character's `memoryProfile`, if they exist. The app only reads and
writes the bank; getting memories *into* your chats is your harness's job (e.g. a Pi extension).

## Testing

`npm run check` (syntax of every JS, shell and JSON file) and `npm test` (offline unit tests for `lib/core.js`, under a
second) need nothing but Node (no `npm install`), so they suit a CI job. `npm run doctor` checks a machine's setup.

`tests/smoke.mjs` drives a real copy of the app over CDP with real clicks and real model calls:

```bash
PIDESK_PROFILE=/tmp/pidesk-test ./node_modules/.bin/electron . --remote-debugging-port=9333 &
node tests/smoke.mjs research writer        # two of your characters
```

`PIDESK_PROFILE` gives the test its own `threads.json` / `tasks.json` / `usage.json` / window state, starts from your
`config.json` but saves settings changes to its own copy, keeps the window hidden (`PIDESK_SHOW=1` to see it) and sounds off.

For stable results, point the test at harnesses that run a fast model with no global extensions, e.g.
`exec pi --no-extensions --no-skills --model <provider>/<fast-model> --thinking off "$@"`. Heavy global extensions
(personas, memory injection) slow Pi's start and can make the model's replies unpredictable.
The test writes a throwaway fixture chat into the first character's session folder and moves it (and the branches it
creates) to the Trash at the end. It makes a handful of small model requests through your harness's provider, so pick
characters on a cheap model. `PIDESK_CDP_PORT` changes the port; `SHOTS` sets the screenshot folder.
