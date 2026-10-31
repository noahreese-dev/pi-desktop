# Harnesses: the contract

Pi Desktop doesn't run its own agent. It runs **your harness scripts** and talks to them over
[Pi](https://github.com/earendil-works/pi)'s RPC mode (`@earendil-works/pi-coding-agent`, tested with 1.1.0). Whatever the script sets up (model, provider, extensions, skills,
working folder, `AGENTS.md`) is exactly what you get in the app.

## Discovery

On launch the app lists `<harnessDir>/pi-*` (default `~/bin`, set `harnessDir` in `config.json`).

- `pi-research` → character id `research`.
- Line 2 of the script (`# pi-research: Research with sources. ...`) becomes the default tagline.
- The first `cd` line to `"$HOME/..."`, `~/...` or an absolute path (`cd "/Volumes/Work/site"`) sets the character's
  working folder. A `cd` to a variable or a relative path isn't followed: set `"cwd"` in the character file instead. That folder decides which Pi session folder
  holds its chats (`~/.pi/agent/sessions/--<folder>--/`), so **give each harness its own folder** if you want separate chat lists.
- A script that is only a one-line alias (`exec ".../pi-other" "$@"`) is skipped, so aliases don't show up twice.
- `pi-ls` is ignored.

## What the app runs

| When | Command | Environment |
|---|---|---|
| A chat (one process per open chat) | `pi-<id> --mode rpc [--session <file>] [--append-system-prompt <persona>]` | `PI_DESKTOP=1` |
| A scheduled task | `pi-<id> -p "<prompt>" --name "⏰ <task>"` | `PI_DESKTOP_TASK=<task id>` |

So a harness script must:

1. **Pass its arguments through to `pi`.** End with `exec pi ... "$@"`.
2. **Not print to stdout before Pi starts.** stdout is the RPC channel; send logs to stderr.
3. **Not require a TTY.** In RPC mode there is none.

Anything else is up to you: `--provider`, `--model`, `-e` extensions, `--no-skills`, environment variables.
The same script still works in a terminal as the normal Pi TUI.

## Minimal harness

```bash
#!/usr/bin/env bash
# pi-research: Research with sources. Starts in ~/research.
export PI_HARNESS=research          # lets the terminal pixel-coach extension find this character's face
mkdir -p "$HOME/research"
cd "$HOME/research" || exit 1
exec pi --provider anthropic --model claude-sonnet-5-5 "$@"
```

`examples/bin/` has three, and `scripts/new-character.sh <id>` writes one for you.

## How the app uses Pi's RPC

- Startup: `get_state` (model, thinking level, session file), `get_commands` (the `/` menu).
- Chat: `prompt` (with images); Enter while a reply streams sends `prompt` with `streamingBehavior: "steer"`; `abort`.
- Model + thinking pickers: `get_available_models`, `set_model`, `get_available_thinking_levels`, `set_thinking_level`.
- Edit and Regenerate: `get_fork_messages` + `fork`. The original chat is never changed; the edit becomes a new branch file.
- Rename: `set_session_name`. Context meter: `get_session_stats`. Export: `export_html`. Notifications: `get_last_assistant_text`.
- Extension UI requests (`select`, `confirm`, `input`, `editor` as dialogs; `notify` as toasts; `setStatus`, `setTitle`, `setWidget`) are handled,
  so extensions that ask questions work in the app.
- History opens instantly by reading Pi's session `.jsonl` files directly (no process is started until you type).

Pi's session files are never edited. Pins, archive and custom titles live in the app's `threads.json`; Delete moves the
file to the macOS Trash.

## Tips

- Heavy harnesses (big extension sets, bridge providers) can use hundreds of MB per chat. The app closes the process of
  an empty chat when you leave it, and keeps running chats alive in the background.
- `PI_DESKTOP=1` lets an extension behave differently in the app, e.g. skip drawing a terminal header.
- The app starts GUI-launched processes with your login shell's `PATH` (plus `~/bin`, Homebrew), so `pi` installed via
  nvm or Homebrew is found.
