// pixel-coach: a Pi extension that gives a harness its Pi Desktop character in the terminal: a pixel-face header,
// a pinned footer (face, model, context bar) and a quote line while working.
// Load it with `pi -e <pi-desktop>/extensions/pixel-coach/index.ts`; the harness script sets PI_HARNESS=<id>.
// Reads <pi-desktop>/characters/<id>/{character.json,face.json,quotes.json}, written by faces/pixel_faces.py.
// No face for that id = the extension does nothing. PI_DESKTOP_CHARACTERS overrides the characters folder.
// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HID = (process.env.PI_HARNESS || "").replace(/^pi-/, ""); // PI_HARNESS=research or pi-research
const CHARS = process.env.PI_DESKTOP_CHARACTERS || path.join(ROOT, "..", "..", "characters");
const HERE = path.join(CHARS, /^[a-z0-9-]+$/.test(HID) ? HID : "_none");
const ACTIVE = fs.existsSync(path.join(HERE, "face.json"));
const HOME = os.homedir();
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(HERE, "character.json"), "utf8")); } catch {}
const USER = CFG.user || process.env.PI_DESKTOP_USER || (os.userInfo().username || "there").replace(/^./, (c) => c.toUpperCase());
const NAME = CFG.name || "Coach";
const TITLE = NAME.toUpperCase().split("").join(" ");
const IDENTITY = (CFG.identity || "").replaceAll("{user}", USER);

// ---------- ansi ----------
const hexArr = (h, d) => (h ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : d);
const RGB = { orange: hexArr(CFG.accent, [255, 90, 54]), ice: [236, 236, 240], dim: [120, 120, 132], gold: hexArr(CFG.accent2, [255, 196, 92]) };
const fg = (c, s) => `\x1b[38;2;${RGB[c].join(";")}m${s}\x1b[39m`;
const bold = (s) => `\x1b[1m${s}\x1b[22m`;
const italic = (s) => `\x1b[3m${s}\x1b[23m`;
const ANSI = /\x1b\[[0-9;]*m/g;
const vlen = (s) => s.replace(ANSI, "").length;
function fit(s, w) {
  if (vlen(s) <= w) return s;
  let out = "", vis = 0;
  for (let i = 0; i < s.length && vis < w; ) {
    const m = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
    if (m) { out += m[0]; i += m[0].length; continue; }
    out += s[i++]; vis++;
  }
  return out + "\x1b[0m";
}
const pad = (s, w) => s + " ".repeat(Math.max(0, w - vlen(s)));
function wrap(text, w) {
  const lines = []; let cur = "";
  for (const word of text.split(" ")) {
    if (cur && (cur + " " + word).length > w) { lines.push(cur); cur = word; } else cur = cur ? cur + " " + word : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- portrait: grids of "#rrggbb" | null, two pixel rows per terminal row ----------
let FACE = {};
try { FACE = JSON.parse(fs.readFileSync(path.join(HERE, "face.json"), "utf8")); } catch {}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(";");
function renderGrid(g) {
  if (!g) return [];
  const out = [];
  for (let y = 0; y < g.length; y += 2) {
    let line = "";
    for (let x = 0; x < g[y].length; x++) {
      const top = g[y][x], bot = g[y + 1]?.[x];
      if (top && bot) line += `\x1b[38;2;${hex(top)};48;2;${hex(bot)}m▀\x1b[0m`;
      else if (top) line += `\x1b[38;2;${hex(top)}m▀\x1b[0m`;
      else if (bot) line += `\x1b[38;2;${hex(bot)}m▄\x1b[0m`;
      else line += " ";
    }
    out.push(line);
  }
  return out;
}
const BIG_W = FACE.big?.[0]?.length || 0, MINI_W = FACE.mini?.[0]?.length || 0;
const RENDERED = { big: renderGrid(FACE.big), bigBlink: renderGrid(FACE.bigBlink), mini: renderGrid(FACE.mini), miniBlink: renderGrid(FACE.miniBlink) };

let QUOTES = [];
try { QUOTES = JSON.parse(fs.readFileSync(path.join(HERE, "quotes.json"), "utf8")); } catch {}

function sessionCount() {
  const dir = path.join(HOME, ".pi", "agent", "sessions", "--" + process.cwd().replace(/^\//, "").replace(/\//g, "-") + "--");
  try { return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).length; } catch { return 0; }
}

export default function (pi) {
  if (!ACTIVE) return;
  const quote = QUOTES.length ? QUOTES[Math.floor(Math.random() * QUOTES.length)] : { q: "", src: "" };
  const sessions = sessionCount();
  const bigAt = Date.now();
  let state = "idle", tick = 0, timer = null, tuiRef = null, faceOn = true, ctxRef = null;

  const redraw = () => tuiRef && tuiRef.requestRender();
  const schedule = () => { timer = setTimeout(() => { tick++; redraw(); schedule(); }, Date.now() - bigAt < 4000 ? 90 : 400); };
  const blinking = () => tick % 11 === 0;
  const model = () => (ctxRef?.model && (ctxRef.model.id || ctxRef.model.name)) || "model";
  const thinking = () => { try { return pi.getThinkingLevel(); } catch { return ""; } };

  function header(width) {
    const face = width >= BIG_W + 46 ? (blinking() ? RENDERED.bigBlink : RENDERED.big) : [];
    const colW = Math.max(20, width - BIG_W - 6);
    const full = `“${quote.q}”`;
    const shown = full.slice(0, Math.floor((Date.now() - bigAt) / 16));
    const right = [
      "", "",
      bold(fg("orange", TITLE)) + fg("dim", "  ·  " + (CFG.tagline || "")),
      fg("orange", "━".repeat(Math.min(colW, 44))),
      fg("gold", (CFG.hello || "Hello, {user}").replaceAll("{user}", USER)) + (sessions ? ` ${fg("dim", "·")} ${fg("ice", sessions + " sessions")}` : ""),
      fg("dim", "workspace: ") + fg("ice", path.basename(process.cwd())),
      `${fg("orange", "▣")} ${fg("ice", model())} ${fg("dim", "·")} ${fg("gold", thinking() || "ready")}`,
      "",
      ...wrap(shown, colW).map((l) => fg("ice", italic(l))),
      shown.length >= full.length && quote.src ? fg("dim", "  — " + quote.src) : "",
    ];
    const lines = [""];
    for (let i = 0; i < Math.max(face.length, right.length); i++) {
      const l = face[i] !== undefined ? face[i] : " ".repeat(face.length ? BIG_W : 0);
      lines.push(fit((face.length ? l + "   " : "") + (right[i] || ""), width));
    }
    lines.push("");
    return lines;
  }

  function footer(width) {
    const usage = ctxRef?.getContextUsage ? ctxRef.getContextUsage() : undefined;
    const pct = usage && usage.percent != null ? Math.round(usage.percent) : 0;
    const f = Math.round((pct / 100) * 12);
    const bar = fg("orange", "█".repeat(f)) + fg("dim", "░".repeat(12 - f));
    const status = state === "work" ? fg("gold", `● ${CFG.workingWord || "working"}…`) : state === "done" ? fg("orange", `● ${CFG.doneWord || "done"}`) : fg("gold", "● ready");
    const title = bold(fg("orange", TITLE));
    if (!faceOn || width < 64 || (process.stdout.rows || 24) < 24) {
      return [fit(`${title} ${fg("dim", "·")} ${fg("ice", model())} ${fg("dim", "· ctx")} ${bar} ${fg("ice", pct + "%")} ${status}`, width)];
    }
    const mini = blinking() ? RENDERED.miniBlink : RENDERED.mini;
    const info = ["", `${title} ${fg("dim", "·")} ${fg("ice", model())} ${fg("dim", "·")} ${fg("gold", thinking())}`, `${fg("dim", "ctx")} ${bar} ${fg("ice", pct + "%")}`, fg("ice", path.basename(process.cwd())), status];
    const out = [fg("orange", "─".repeat(width))];
    for (let i = 0; i < Math.max(mini.length, info.length); i++) out.push(fit(" " + pad(mini[i] || "", MINI_W) + "  " + (info[i] || ""), width));
    return out;
  }

  pi.on("session_start", async (_e, ctx) => {
    ctxRef = ctx;
    if (ctx.mode !== "tui") return;
    if (!timer) schedule();
    ctx.ui.setHeader((tui) => { tuiRef = tui; return { render: header, invalidate() {} }; });
    ctx.ui.setFooter((tui) => { tuiRef = tui; return { render: footer, invalidate() {} }; });
    ctx.ui.setTitle(NAME.toLowerCase());
    ctx.ui.setWorkingIndicator({ frames: ["◜", "◠", "◝", "◞", "◡", "◟"].map((f) => fg("orange", f)), intervalMs: 110 });
  });

  // Optional "identity" (character.json): sent once as a hidden first-turn message, so it works even with providers that ignore system-prompt overrides.
  let sent = false;
  pi.on("before_agent_start", async () => {
    if (sent || !IDENTITY) return;
    sent = true;
    return { message: { customType: `${NAME.toLowerCase()}-identity`, content: IDENTITY, display: false } };
  });

  let qi = Math.floor(Math.random() * Math.max(1, QUOTES.length)), qTimer = null;
  const showQuote = () => {
    if (ctxRef?.mode !== "tui" || !QUOTES.length) return;
    const q = QUOTES[qi++ % QUOTES.length];
    ctxRef.ui.setWorkingMessage(fg("gold", `${CFG.workingWord || "working"}… `) + fg("ice", italic(`“${q.q}”`)) + fg("dim", ` — ${CFG.quoteBy || q.src || ""}`));
  };
  const stop = () => { if (qTimer) clearInterval(qTimer); qTimer = null; };
  pi.on("agent_start", async () => { state = "work"; redraw(); stop(); showQuote(); qTimer = setInterval(showQuote, 7000); });
  pi.on("agent_end", async () => { stop(); state = "done"; redraw(); setTimeout(() => { if (state === "done") { state = "idle"; redraw(); } }, 2500); });
  pi.on("session_shutdown", async () => { stop(); if (timer) clearTimeout(timer); timer = null; });

  pi.registerCommand("face", {
    description: `/face on|off: toggle ${NAME}'s pinned face footer`,
    handler: async (args) => { faceOn = !/^off/i.test((args || "").trim()); redraw(); },
  });
}
