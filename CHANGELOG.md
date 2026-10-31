# Changelog

## 0.2.0 (2026-10-31)

- **Character pack** (`packs/`, `scripts/install-pack.sh all`): Andrej (engineer: grill, spec, tickets, worktrees,
  receipts), Ilya (AI research), History (historian, historical-critical method), Ali (learning coach with the
  Learning panel) and Narges (artist, image refinement loop). Each has its own skills and workspace and works with
  any Pi provider.
- **First run:** a welcome screen instead of a blank window when no characters exist, with one-click example
  characters; plain-English errors when Pi is missing; `npm run doctor`.
- **Security:** the page may only send allow-listed Pi RPC commands and settings; strict CSP (no remote images or
  network from the page); sanitized model markdown; renderer sandbox; wider secret-file blocklist; "Open" never
  launches apps or scripts. See docs/ARCHITECTURE.md#security-model.
- **Fixes:** weekly tasks on Sunday ran on Monday; a harness `cd` to an absolute path was ignored; "Open at login"
  from source launched bare Electron (now a LaunchAgent); voice typing could kill an unrelated process on its port.
- **For contributors:** AGENTS.md, offline unit tests (`npm test`), `npm run check`, code of conduct.

## 0.1.0 (2026-10-30)

First public release.

- Characters from `~/bin/pi-*` harnesses, pixel faces or portraits, finish sounds, ⌘K switcher.
- Real Pi chats over RPC: streaming, thinking and tool calls, images and files, steer, stop, edit and regenerate as branches.
- Chat management: pin, rename, archive, search, export to HTML, delete to Trash.
- Scheduled tasks per character, menu-bar icon, global hotkey, Dock badge, crash banner with Restart.
- Voice typing with local whisper.cpp (warm whisper-server, vocabulary from character names), microphone picker.
- Work you walked away from finishes: keep-awake while agents work, background-job-aware idle reaper,
  quit confirmation, "Continue" on chats that stopped part-way.
- Optional side-panel tabs: Learning and Memory (Hindsight).
