# Changelog

## Unreleased

- **Confirmed in a native dialog:** saving an AGENTS.md (folder or global), adding a skill, and installing Pi on a server,
  same as adding a connector or creating an agent. The page shows model output, so it can't approve these on its own.
- **ssh sockets in a private folder:** connection sharing uses `~/.ssh/pidesk` (only you can open it) instead of `/tmp`.
- **Connector logos are bundled only:** no lookups on the internet; unknown connectors get the generic icon.
- **No more pop-ups:** forms (Settings, New agent, Connect a server, Add connector, Add skill and the rest) open as a page
  in the main area with a Back arrow, and confirmations ("Delete chat?") are an inline card above the message box.
  Kept as system dialogs on purpose: confirmations that guard something an agent could trigger (adding a connector,
  creating an agent, removing a skill, quitting while work is running) and the macOS file pickers.
- **Agent questions are always inline:** every question an agent asks (choices, pick-all-that-apply, yes/no, a line of text,
  an editor) now shows as a card above the message box on the chat that asked. Before, only single-choice questions did;
  the others opened a pop-up over the whole window.
- **Add command-line tools from the app:** the Connectors tab has an Add button for command-line tools. It searches the
  programs installed on this Mac and saves the pick to the agent's character file; × removes one. Before, the list could
  only be edited by hand in the file.
- **Agents can be isolated:** a character file with `isolated: true` shows only the agent's own skills and the connectors
  it names in `mcp`, not everything installed on this Mac. Before, every agent's panels listed
  all global skills and MCP servers, whether or not it loaded them. Existing characters are unchanged.
- **Command-line tools in Connectors:** a character file can list the CLIs its agent relies on (`cli`). The Connectors tab
  shows them above the MCP connectors, each marked installed or missing on this Mac or on the agent's server.
- **Skills an agent carries show up:** the Skills tab now lists skills kept in an agent's own folder (`skills/` and
  pinned `vendor/<repo>/…/skills`), for the open agent only, next to the global and package skills every agent loads. Before, a
  harness's own skills were invisible.
- **Quieter chats:** everything an agent does before its final reply (thoughts, commands, file lookups, edits and
  interim notes) folds into one line ("Worked · 8 thoughts, 9 commands, 2 edits"; "Working · Running …" while live).
  Click it to see every step. Only the final reply stays in view; edits, failed commands and questions that come
  after it stay visible too. Settings → "Show every step" (`showWork`) turns the old full list back on.
- **Questions show inline:** when an agent offers choices, they appear as a card above the composer instead of a
  pop-up. Descriptions are cut to one short line (hover for the full text), the option marked "(Recommended)" is
  highlighted, and number keys still pick.
- **`launchPrefix` setting:** start every agent through a command of your choice (for example a key proxy or sandbox),
  so the app can run Pi the same way your terminal does. Leave it empty to change nothing.

## 0.3.0 (2026-11-09)

- **Compact button:** the context meter shows tokens in use, turns amber as a chat grows (400k, or 60 % of a smaller
  window) and red near Pi's auto-compact point. Click it for plain advice, an optional "keep focus on…" and
  **Compact now**. While it runs the meter says "Compacting…"; afterwards a divider shows the size before and after
  (older compactions show the size before), and failures say why. Compactions can take 1–2 minutes, so the window
  now waits up to 15 minutes for one instead of giving up at 2.
- **Custom notification per character:** `finish.notify` in a character file replaces the "<Name> finished" title.
- **Routines edited outside the app show up live:** when an agent or script changes `tasks.json`, the Tasks panel
  reloads within about 5 seconds (no restart).

## 0.2.1 (2026-10-31)

Fixes from the post-release review:
- Reload on the welcome screen now re-reads config.json (a new `harnessDir` used to need a restart).
- Scheduled tasks whose prompt starts with `-` or `@` no longer break (or attach a file); tasks saved from the
  window are type-checked.
- More files the window may never read (`.envrc`, shell rc files, Claude and Pi credential/model files) or "Open"
  (`.py`, Shortcuts, server-location files, screen savers and other plug-ins).
- `npm run doctor` no longer fails a fresh clone that has no characters yet.
- Crash banner recognises zsh's "command not found: pi"; the welcome screen's install command survives spaces in the path.
- Docs: `doneWord`, PDF previews, how packs are found.

## 0.2.0 (2026-10-31)

- **Character pack** (`packs/`, `scripts/install-pack.sh all`): Andrej (engineer: grill, spec, tickets, worktrees,
  receipts), Ilya (AI research), History (historian, historical-critical method), Ali (learning coach with the
  Learning panel) and Narges (artist, image refinement loop). Each has its own skills and workspace and works with
  any Pi provider.
- **Copy as Markdown** in a chat's ⋯ menu: the whole conversation (your messages and the replies, code blocks
  intact; thinking, tool calls and images left out) on the clipboard.
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
