# Contributing

Thanks for helping. The bar: small, readable, no new build step.

## Ground rules

- **Plain JavaScript, no framework, no bundler.** `app/renderer.js` uses a tiny `h(tag, attrs, ...children)` helper.
  Match the surrounding style: short functions, comments that explain *why*, not *what*.
- **Never edit Pi's session files.** App-side metadata goes in `threads.json`; behaviour changes go through Pi's RPC.
- **The page has no Node access.** New capabilities are an `ipcMain.handle` in `main.js` plus one line in `preload.js`,
  and file access goes through `safePath()`.
- **Harness-agnostic.** Nothing may assume a particular provider, model, extension or folder layout. Personal setups
  belong in your `config.json` and character files, not in code.
- macOS is the only supported platform today. Cross-platform PRs are welcome if they keep macOS behaviour identical.

## Before a PR

```bash
node --check main.js && node --check preload.js && node --check app/renderer.js && node --check voice/asr.js
python3 -I faces/pixel_faces.py          # if you touched faces
PIDESK_PROFILE=/tmp/pidesk-test ./node_modules/.bin/electron . --remote-debugging-port=9333 &
node tests/smoke.mjs <character> <other-character>
```

Include the smoke-test summary line in the PR, plus a screenshot for any UI change. If you add a feature, add a check
for it to `tests/smoke.mjs`.

## Adding a side-panel tab

1. Add it to `panelTabs()` in `app/renderer.js` (gate it on a character field or a config key, so it's opt-in).
2. Add a `render<Tab>(body)` and a branch in `renderPanel()`.
3. Any data it needs: an IPC handler in `main.js` and a `desk.*` entry in `preload.js`.
4. Document the field in `docs/CHARACTERS.md` or the config key in `README.md`.
