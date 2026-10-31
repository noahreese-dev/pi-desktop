# Characters

A **character** is how Pi Desktop shows one harness: a name, a face, an accent colour, a greeting and a finish line.
Harness `pi-research` → character id `research` → optional file `characters/research.json`.

A harness with no character file still shows up. It gets a generated pixel face in a colour derived from its id,
its name is the id capitalized, and its tagline is the second line of the harness script (`# pi-research: ...`).

## Fastest way

```bash
scripts/new-character.sh research "Scout" "Research with sources"
```

This writes `<harnessDir>/pi-research` (a harness script), `characters/research.json` (with a random but stable
pixel face) and `characters/research/` (the drawn face). It never overwrites existing files. Restart the app.

## The file

Every field is optional. Restart the app after editing. `characters/_template.json` has all of them.

| Field | What it does |
|---|---|
| `name` | Display name. Default: the id, capitalized. |
| `tagline` | Short line under the name. Default: from the harness script's description comment. |
| `accent`, `accent2`, `accent3` | Theme colours while this character is active (hex). |
| `face` | Pixel-face traits, drawn by `npm run faces` (see below). |
| `image`, `imageBlink`, `icon` | Your own portrait PNGs instead of a pixel face. `imageBlink` is an optional closed-eyes frame; `icon` is used for the Dock and menu bar. |
| `pixel` | `true` renders `image` with hard pixel edges. Set automatically for `face` characters. |
| `sprite`, `palette` | The old text-sprite format (rows of palette keys + a `key rrggbb` palette file). |
| `quotes` | A list of strings (or `{ "q": "...", "src": "..." }`), or a path to a JSON file of them. One is shown under the greeting. |
| `greeting` | Big line on an empty chat. `{user}` becomes your name. |
| `placeholder` | Message box placeholder. |
| `workingWord` | "Scout is *researching*…" while a reply streams. |
| `suggestions` | `[{ "label", "prompt" }]` chips on an empty chat. |
| `persona` | One or two sentences passed to Pi as `--append-system-prompt`. Leave it out to add nothing to the context. |
| `panel` | `"files"` (default) or `"learning"` (adds Course, Lesson and Profile tabs; see below). |
| `panelOpen` | Open the side panel the first time this character is picked. |
| `taskTemplates` | `[{ "name", "schedule", "prompt" }]` routines offered as one-click ideas in the Tasks tab. |
| `finish` | `{ "sound", "voice", "say", "render" }`: what plays when a reply finishes (below). |
| `pinned` | Sorts the character earlier in the menu-bar menu (which lists every character that has a file). |
| `pinTop` | Always first in the switcher (⌘1), above "in use" and "most used". |
| `memoryProfile` | Hindsight mental-model id shown in the Memory tab, e.g. `"profile-research"` (only with `config.memory`). |
| `learningRoot` | Folder for the learning panel. Default `~/learning`. |
| `cwd` | Override the working folder. Normally read from the harness script's `cd` line. |
| `alsoHome` | For a character that used to start in your home folder: also list its older home-folder chats (matched by its identity marker). |

Paths in `image`, `imageBlink`, `icon`, `quotes`, `sprite` and `palette` can be absolute, `~/...`, or relative to `characters/`.

## Pixel faces

```json
"face": { "skin": "#e6bb94", "hair": "#5b4636", "style": "short", "beard": "none", "glasses": "round", "gear": "none", "outfit": "#2b3a55" }
```

- `style`: `short`, `buzz`, `bald`, `long`, `cap`, `beanie`, `hood`
- `beard`: `none`, `stubble`, `full`
- `glasses`: `none`, `round`
- `gear`: `none`, `headphones`
- `outfit`: shirt colour. Defaults to `accent`.

`npm run faces` (or `python3 -I faces/pixel_faces.py research`) draws a 20×20 face, an open-eye and a blink frame, and writes
`characters/research/{portrait.png, portrait-blink.png, face.json, character.json, quotes.json}`. The app picks up
`portrait.png` automatically. `face.json`, `character.json` and `quotes.json` are for the terminal extension (below).
Needs Pillow (`pip install pillow`).

## Your own portrait

Generate a head-and-shoulders portrait and a closed-eyes version with any image tool, then:

```bash
faces/build.sh portrait.png blink.png characters/research
```

It crops and scales them to 512×512 and writes the terminal `face.json` too (needs ffmpeg). Then, in the character file,
remove `face` and set `"image": "research/portrait.png", "imageBlink": "research/portrait-blink.png", "icon": "research/portrait.png"`.
Only use likenesses you have the right to use.

## Finish sounds

When a reply finishes (and the app setting is on), Pi Desktop plays a chime and says a line:

```json
"finish": { "sound": "Pop", "voice": "Karen", "say": "Scout has findings." }
```

- `sound` is a macOS system sound (`ls /System/Library/Sounds`), `voice` is a `say` voice (`say -v '?'`).
- Default: `Tink`, `Samantha`, "<Name> complete."
- Optional, better-sounding: `sounds/render.py` pre-renders an original synthesized motif and a neural Kokoro voice into
  `sounds/clips/<id>.{chime,voice}.m4a`, which the app plays instead. Tune it with `finish.render` (voice, speed, motif,
  notes, reverb); the header of `sounds/render.py` documents every key.
- Settings (⌘,) has toggles for the chime and the voice, plus a Preview button.

## Terminal face (optional)

`extensions/pixel-coach` is a Pi extension that gives the same character a header, a pinned footer (face, model,
context bar) and a quote line in the terminal TUI. The example harness scripts load it automatically when Pi Desktop is
at `~/pi-desktop` (or `$PI_DESKTOP_DIR`). It reads `characters/<PI_HARNESS>/` and does nothing when there's no face there.
Optional `identity` in `character.json` is sent once as a hidden first message.

## Learning panel

With `"panel": "learning"`, the side panel reads a folder of courses (`learningRoot`, default `~/learning`):

```
~/learning/
  PROFILE.md                      shown in the Profile tab
  <topic>/
    MISSION.md                    first non-heading line = the course's one-liner
    lessons/*.html                shown in the Lesson tab (new ones open automatically)
    reference/*.html              cheat sheets
    learning-records/*.md         "what you hold"
    RESOURCES.md, GLOSSARY.md, NOTES.md
```

The character writes these files and the app only reads them. Pair it with a teaching skill in your harness.
