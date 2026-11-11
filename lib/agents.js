// Creating an agent from the app: pure helpers (no Electron, no fs). Everything the window types is validated here
// before it can reach a script, a path or a file.
const q = (s) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
const ID = /^[a-z0-9][a-z0-9-]{0,29}$/;
const slugify = (n) => String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
const oneLine = (s) => String(s || "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
const cleanName = (n) => { n = oneLine(n); return n.length >= 1 && n.length <= 30 ? n : null; };
const cleanTagline = (t) => oneLine(t).slice(0, 80);
const cleanAccent = (a) => (/^#[0-9a-fA-F]{6}$/.test(String(a)) ? String(a).toLowerCase() : null);
const cleanModel = (m) => (m == null || m === "" ? "" : /^[\w.-]+\/[\w.:@+-]{1,80}$/.test(String(m)) && String(m).length <= 100 ? String(m) : null); // provider/model-id, or "" for the default

// A start folder, always inside the home folder: "research", "~/work/research", "$HOME/x" or "<home>/x" → "work/research".
// Empty means the agent's own folder (named after it). Returns null for anything unsafe or for the home folder itself.
function cleanFolder(f, id, home) {
  f = String(f ?? "").trim();
  if (!f) return id;
  if (home && f.startsWith(home + "/")) f = f.slice(home.length + 1);
  f = f.replace(/^(~|\$HOME)\//, "");
  if (/^[/~$]/.test(f) || f.length > 120) return null;
  const parts = f.replace(/\/+$/, "").split("/");
  if (!parts.length || parts.length > 6) return null;
  for (const p of parts) if (!/^[A-Za-z0-9_][\w .@+-]*$/.test(p) || p.endsWith(" ")) return null;
  return parts.join("/");
}

// The harness script. Same shape as examples/bin/pi-base, so discovery reads its description and start folder.
function scriptText({ id, tagline, name, folder, model, repo }) {
  const where = `$HOME/${folder}`;
  const modelArg = model ? `--model ${q(model)} ` : "";
  const lines = [
    "#!/usr/bin/env bash",
    `# pi-${id}: ${tagline || name}. Starts in ~/${folder}.`,
    `# A Pi Desktop harness: Pi Desktop runs "pi-${id} --mode rpc"; in a terminal, "pi-${id}" is the normal Pi TUI.`,
    `# Starts in ${where} so that folder's AGENTS.md and chats belong to this agent.`,
    `export PI_HARNESS=${id}`,
    `mkdir -p "${where}"`,
    `cd "${where}" || exit 1`,
  ];
  if (repo) {
    lines.push("# The terminal face (header + footer) from the pixel-coach extension, if Pi Desktop is where we expect it.",
      `face="\${PI_DESKTOP_DIR:-${repo.replace(/["$`\\]/g, "\\$&")}}/extensions/pixel-coach/index.ts"`,
      'ext=(); [[ -f "$face" ]] && ext=(-e "$face")',
      `exec pi ${modelArg}"\${ext[@]}" "$@"`);
  } else lines.push(`exec pi ${modelArg}"$@"`);
  return lines.join("\n") + "\n";
}

// A small seeded generator so the same id always gets the same face.
function rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
function characterJson({ id, name, tagline, accent }) {
  const r = rng(id), pick = (a) => a[Math.floor(r() * a.length)];
  return {
    name, tagline, accent,
    face: { skin: pick(["#f3d0b0", "#e6bb94", "#d7a27a", "#c68a62", "#9a6a48", "#6e4a33"]), hair: pick(["#1a1a1a", "#3b2a20", "#5b4636", "#9a9aa0", "#d9a441", "#7a2f5a"]),
      style: pick(["short", "buzz", "bald", "long", "cap", "beanie", "hood"]), beard: pick(["none", "none", "stubble", "full"]), glasses: pick(["none", "none", "round"]), gear: pick(["none", "none", "headphones"]) },
    quotes: [], greeting: "Hi {user}. What are we working on?", workingWord: "Working",
    finish: { sound: "Tink", voice: "Samantha", say: `${name} complete.` },
  };
}
const ACCENTS = ["#8b7bff", "#7fd3ff", "#7ee2b8", "#f2b86b", "#ff8fa3", "#c792ea", "#a3e635", "#f97316"];

// `pi --list-models` output → [{ value: "provider/model", provider, model }]
function parseModels(out) {
  return String(out).split("\n").slice(1).map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 2 && /^[\w.-]+$/.test(c[0]) && /^[\w.:@+-]+$/.test(c[1]))
    .map((c) => ({ value: `${c[0]}/${c[1]}`, provider: c[0], model: c[1] }));
}
module.exports = { ID, slugify, cleanName, cleanTagline, cleanAccent, cleanModel, cleanFolder, scriptText, characterJson, parseModels, ACCENTS, q };
