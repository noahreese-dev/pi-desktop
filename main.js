// Pi Desktop: an Electron shell over Pi's RPC mode. Each ~/bin/pi-<name> harness is a
// "character"; the app spawns `pi-<name> --mode rpc` so the real harness (extensions,
// skills, model, cwd) runs unchanged underneath. No prompt text is added by the app
// unless a character file sets `persona`.
const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, globalShortcut, nativeImage, nativeTheme, Notification, shell, systemPreferences, session, screen } = require("electron");
const { spawn, execFileSync, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const core = require("./lib/core");

const HOME = os.homedir();
const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.json");
// App data (chat metadata, tasks). A test profile (PIDESK_PROFILE) gets its own copy so tests never touch real data.
const DATA_DIR = process.env.PIDESK_PROFILE || ROOT;
fs.mkdirSync(DATA_DIR, { recursive: true });
const SESSIONS_ROOT = path.join(HOME, ".pi/agent/sessions");
const expand = (p) => (p ? p.replace(/^~(?=\/|$)/, HOME).replace(/^\$HOME/, HOME) : p);
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

// config.json is yours (gitignored); config.example.json documents every key.
const config = Object.assign({
  harnessDir: "~/bin",
  hotkey: "Alt+Shift+Space",
  defaultCharacter: "base",
  whisperModel: "models/ggml-small.en-q5_1.bin", // relative paths are inside this repo (models/ is gitignored)
  notifyWhenHidden: true,
  modelProviders: [], // empty = the model picker offers every provider Pi knows
  memory: null,       // { "url": "http://127.0.0.1:8888", "bank": "default", "explorer": "http://127.0.0.1:9999" } turns on the Memory tab (Hindsight)
}, readJSON(CONFIG_PATH, {}), process.env.PIDESK_PROFILE ? readJSON(path.join(DATA_DIR, "config.json"), {}) : {}); // a test profile starts from yours, then keeps its own changes
const userName = () => config.userName || (os.userInfo().username || "there").replace(/^./, (c) => c.toUpperCase());

const saveConfig = () => fs.writeFileSync(process.env.PIDESK_PROFILE ? path.join(DATA_DIR, "config.json") : CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
const statePath = () => path.join(app.getPath("userData"), "window-state.json"); // lazy: userData is set later

// GUI apps launched from Finder get a bare PATH; harness scripts need nvm's pi, ~/bin, brew.
function loginPath() {
  try { return execFileSync("/bin/zsh", ["-lic", 'printf "%s" "$PATH"'], { timeout: 4000, encoding: "utf8" }).trim(); }
  catch { return ""; }
}
const ENV = { ...process.env };
ENV.PATH = [loginPath(), path.dirname(process.env.NVM_BIN || ""), `${HOME}/bin`, "/opt/homebrew/bin", "/usr/local/bin", ENV.PATH]
  .filter(Boolean).join(":");
delete ENV.ELECTRON_RUN_AS_NODE;

// ---------- harnesses + characters ----------
function discoverHarnesses() {
  const bin = expand(config.harnessDir || "~/bin");
  const out = [];
  let files = [];
  try { files = fs.readdirSync(bin).sort(); } catch { return out; }
  for (const f of files) {
    if (!f.startsWith("pi-") || f === "pi-ls") continue;
    const file = path.join(bin, f);
    let src = "";
    try { src = fs.readFileSync(file, "utf8"); } catch { continue; }
    const h = core.parseHarness(src, HOME);
    if (h) out.push({ id: f.slice(3), script: file, ...h }); // null = a one-line alias of another harness, not a character
  }
  return out;
}

function loadSprite(spritePath, palettePath) {
  try {
    const rows = fs.readFileSync(expand(spritePath), "utf8").split("\n").filter((r) => r.length);
    const palette = {};
    for (const line of fs.readFileSync(expand(palettePath), "utf8").split("\n")) {
      const m = line.match(/^(\S)\s+([0-9a-fA-F]{6})/);
      if (m) palette[m[1]] = "#" + m[2];
    }
    return { rows, palette };
  } catch { return null; }
}

// Asset paths in a character file: "~/..." and absolute paths as-is, anything else relative to characters/.
const CHAR_DIR = path.join(ROOT, "characters");
const asset = (p) => (!p ? p : /^(~|\$HOME|\/)/.test(p) ? expand(p) : path.join(CHAR_DIR, p));

let characters = [];
function loadCharacters() {
  const dir = CHAR_DIR;
  characters = discoverHarnesses().map((h) => {
    const c = readJSON(path.join(dir, `${h.id}.json`), null);
    // A character file describes how a character looks; it can't change which script runs or what the character is called internally.
    if (c) for (const k of ["id", "script", "description", "custom"]) delete c[k];
    const custom = !!c;
    const short = h.description.split(/ \(|\. |, /)[0].replace(/\.$/, "").slice(0, 70);
    const ch = Object.assign({ name: h.id[0].toUpperCase() + h.id.slice(1), tagline: short }, h, c || {}, { custom });
    ch.cwd = expand(ch.cwd);
    // A face built by faces/pixel_faces.py lives in characters/<id>/: used unless the file names its own images.
    const built = (f) => (fs.existsSync(path.join(dir, h.id, f)) ? `${h.id}/${f}` : undefined);
    if (!ch.image && built("portrait.png")) Object.assign(ch, { image: built("portrait.png"), imageBlink: built("portrait-blink.png"), icon: ch.icon || built("portrait.png"), pixel: ch.pixel ?? !!ch.face });
    for (const k of ["image", "imageBlink", "icon", "sprite", "palette"]) if (ch[k]) ch[k] = asset(ch[k]);
    if (ch.sprite && ch.palette) ch.spriteData = loadSprite(ch.sprite, ch.palette);
    // quotes: an inline list of strings / {q, src}, or a path to a JSON file of them.
    const qs = Array.isArray(ch.quotes) ? ch.quotes : ch.quotes ? readJSON(asset(ch.quotes), []) : [];
    ch.quoteList = qs.map((q) => (typeof q === "string" ? { q, src: ch.name } : q));
    // Portraits load as file:// URLs (allowed by the page CSP); imageBlink is an optional closed-eyes frame.
    if (ch.image && fs.existsSync(ch.image)) ch.imageUrl = pathToFileURL(ch.image).href;
    if (ch.imageBlink && fs.existsSync(ch.imageBlink)) ch.imageBlinkUrl = pathToFileURL(ch.imageBlink).href;
    return ch;
  });
  characters.sort((a, b) => (b.custom - a.custom) || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.id.localeCompare(b.id));
}
const charById = (id) => characters.find((c) => c.id === id);
const INDEX_URL = pathToFileURL(path.join(ROOT, "app", "index.html")).href;

// ---------- Pi RPC processes (one long-lived child per harness) ----------
const procs = new Map();
const defaults = new Map();
let win = null;
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

// The harness script cd's into its own folder; until that folder exists (first run), start it from home.
const spawnCwd = (ch) => (fs.existsSync(ch.cwd) ? ch.cwd : HOME);

// One Pi child per open chat (key = chat id from the renderer), so chats run side by side like Codex.
// A chat resumed from history starts Pi directly on that session file (--session).
function startPi(key, harness, sessionFile) {
  const ch = charById(harness);
  if (!ch) throw new Error(`Unknown harness ${harness}`);
  const args = ["--mode", "rpc"];
  if (sessionFile && isHarnessSession(sessionFile) && fs.existsSync(sessionFile)) args.push("--session", sessionFile);
  if (ch.persona) args.push("--append-system-prompt", ch.persona);
  const child = spawn(ch.script, args, { cwd: spawnCwd(ch), env: { ...ENV, PI_DESKTOP: "1" }, stdio: ["pipe", "pipe", "pipe"] });
  const p = { child, harness, buf: "", pending: new Map(), seq: 0, busy: false, bg: false, lastActive: Date.now(), stderr: "", startedAt: Date.now() };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    p.buf += chunk;
    let i;
    // Split on LF only: JSON strings may contain U+2028, which readline would split on.
    while ((i = p.buf.indexOf("\n")) >= 0) {
      const line = p.buf.slice(0, i).replace(/\r$/, "");
      p.buf = p.buf.slice(i + 1);
      if (!line) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.type === "response" && rec.id && p.pending.has(rec.id)) {
        const { resolve } = p.pending.get(rec.id);
        p.pending.delete(rec.id);
        resolve(rec);
        continue;
      }
      // The background-tasks extension reports "bg 2 running" here. A chat waiting on a job isn't idle: closing it would lose the job's result.
      if (rec.type === "extension_ui_request" && rec.method === "setStatus" && rec.statusKey === "background-tasks") { p.bg = /\b\d+ running/.test(String(rec.statusText || "").replace(/\x1b\[[0-9;]*m/g, "")); keepAwake(); }
      if (rec.type === "agent_start") { p.busy = true; p.lastActive = Date.now(); keepAwake(); }
      if (rec.type === "agent_settled") { p.busy = false; p.lastActive = Date.now(); keepAwake(); onSettled(key); if (!rec.aborted) announce(harness); trackSession(key); }
      send("pi:event", { id: key, harness, ev: rec });
    }
  });
  child.stderr.on("data", (d) => { p.stderr = (p.stderr + d).slice(-4000); });
  // Spawn failures (script missing or not executable) end like a crash: the banner shows why, instead of an uncaught error.
  child.on("error", (e) => { p.stderr += `\n${e.message}`; if (child.exitCode === null && !child.pid) child.emit("exit", 127, null); });
  child.on("exit", (code, signal) => {
    logExit(p, key, code, signal);
    if (procs.get(key) === p) procs.delete(key);
    keepAwake();
    for (const { resolve } of p.pending.values()) resolve({ success: false, error: `Pi exited (${code})` });
    send("pi:exit", { id: key, harness, code, signal, closed: !!p.closing, stderr: p.stderr.slice(-1200) });
  });
  procs.set(key, p);
  // A fresh (not resumed) chat boots with the harness default model; remember it once per harness.
  p.ready = rpc(key, { type: "get_state" }, 60000).then((r) => {
    const d = r?.data;
    if (d?.model && !sessionFile && !defaults.has(harness)) defaults.set(harness, { provider: d.model.provider, id: d.model.id, thinking: d.thinkingLevel });
    p.sessionFile = d?.sessionFile || sessionFile || null;
    if (p.sessionFile) tagSession(p.sessionFile, harness);
  });
  return p;
}

// A chat counts as working while its agent runs, or for up to 45 minutes after it last did something while it waits on a background job.
// (A dev server is a "background job" that never ends, so waiting on one must not protect a chat or keep the Mac awake forever.)
const BG_GRACE = +process.env.PIDESK_BG_GRACE_MS || 45 * 60e3;
const holding = (p) => p.busy || (p.bg && Date.now() - p.lastActive < BG_GRACE);

// One line per Pi process exit, so "why did my chat stop?" has an answer: who closed it, and was it still working.
function logExit(p, key, code, signal) {
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), harness: p.harness, chat: key, code, signal, why: p.closeReason || (p.closing ? "closed" : app.isQuitting ? "app-quit" : "exited-on-its-own"), working: p.busy, bgJobs: !!p.bg, upSec: Math.round((Date.now() - p.startedAt) / 1000), freeMB: Math.round(os.freemem() / 1048576), stderr: (p.stderr || "").slice(-300) });
    fs.appendFileSync(path.join(DATA_DIR, "pi-exits.log"), line + "\n");
  } catch {}
}

// Which session file each process writes, so two chats never run two Pi processes on one session file.
function trackSession(key) {
  const p = procs.get(key); if (!p) return;
  rpc(key, { type: "get_state" }, 10000).then((r) => {
    const f = r?.data?.sessionFile;
    if (f && f !== p.sessionFile) { p.sessionFile = f; tagSession(f, p.harness); }
  });
}
const procForFile = (file, exceptKey) => { for (const [k, p] of procs) if (k !== exceptKey && file && p.sessionFile === file) return k; return null; };

function rpc(id, cmd, timeoutMs = 120000) {
  const p = procs.get(id);
  if (!p) return Promise.resolve({ success: false, error: "This chat isn't running" });
  const reqId = `d${++p.seq}`;
  return new Promise((resolve) => {
    const t = setTimeout(() => { p.pending.delete(reqId); resolve({ success: false, error: "timeout" }); }, timeoutMs);
    p.pending.set(reqId, { resolve: (r) => { clearTimeout(t); resolve(r); } });
    try { p.child.stdin.write(JSON.stringify({ ...cmd, id: reqId }) + "\n"); }
    catch (e) { clearTimeout(t); p.pending.delete(reqId); resolve({ success: false, error: `Pi isn't running: ${e.message}` }); }
  });
}

function onSettled(key) {
  if (!config.notifyWhenHidden || (win && win.isFocused())) return;
  const harness = procs.get(key)?.harness, ch = charById(harness);
  rpc(key, { type: "get_last_assistant_text" }, 5000).then((r) => {
    const body = (r?.data?.text || "Done.").replace(/\s+/g, " ").slice(0, 140);
    const n = new Notification({ title: `${ch?.name || harness} finished`, body, silent: false });
    n.on("click", () => { showWindow(); send("app:focus-chat", { harness, key }); });
    n.show();
  });
}


// ---------- finish sounds: a chime plus a spoken line per character ("Scout has findings.") ----------
// Per character in characters/<id>.json: "finish": { "sound": "Hero", "voice": "Daniel", "say": "Scout has findings." }.
// Sounds are macOS system sounds; voices are `say` voices. Queued so simultaneous finishes don't talk over each other.
const SOUNDS_DIR = "/System/Library/Sounds";
const CLIPS_DIR = path.join(ROOT, "sounds", "clips"); // rendered by sounds/render.py: <id>.chime.m4a + <id>.voice.m4a
const announceQueue = [];
let announcing = false;
const finishCfg = (ch) => ({ sound: "Tink", voice: "Samantha", say: `${ch.name} complete.`, ...(ch.finish || {}) });
function announce(harness, { preview = false } = {}) {
  // Tests (PIDESK_PROFILE) stay silent unless PIDESK_SOUND=1. The chime and the spoken line are separate toggles.
  if (!preview && ((config.finishSound === false && config.finishVoice === false) || (process.env.PIDESK_PROFILE && !process.env.PIDESK_SOUND))) return;
  const ch = charById(harness);
  if (!ch) return;
  const base = harness.replace(/-fast$/, ""); // fast variants share their base character's sound
  const clip = (kind) => { const f = path.join(CLIPS_DIR, `${base}.${kind}.m4a`); return fs.existsSync(f) ? f : null; };
  const c = { ...finishCfg(ch), chimeFile: clip("chime"), voiceFile: clip("voice") };
  if (!preview && announceQueue.some((q) => q.say === c.say)) return; // same character finishing twice in a row: say it once
  announceQueue.push(c);
  while (announceQueue.length > 4) announceQueue.shift();
  pumpAnnounce();
}
function pumpAnnounce() {
  if (announcing) return;
  const c = announceQueue.shift();
  if (!c) return;
  announcing = true;
  const done = () => { announcing = false; pumpAnnounce(); };
  const vol = String(config.finishVolume ?? 0.8), chimeOn = config.finishSound !== false, voiceOn = config.finishVoice !== false;
  const play = (file, next) => execFile("afplay", ["-v", vol, file], { timeout: 12000 }, () => next());
  // 1) rendered clips (natural neural voice + the character's own motif)
  if (c.chimeFile || c.voiceFile) {
    const speak = () => (voiceOn && c.voiceFile ? play(c.voiceFile, done) : done());
    return chimeOn && c.chimeFile ? play(c.chimeFile, speak) : speak();
  }
  // 2) fallback: macOS system sound + `say`
  const file = chimeOn && /^[A-Za-z]+$/.test(c.sound || "") && fs.existsSync(`${SOUNDS_DIR}/${c.sound}.aiff`) ? `${SOUNDS_DIR}/${c.sound}.aiff` : null;
  const speak = () => {
    if (!voiceOn || !c.say) return done();
    const args = [];
    if (/^[A-Za-z0-9 ()._-]+$/.test(c.voice || "")) args.push("-v", c.voice);
    args.push("--", String(c.say).slice(0, 120));
    execFile("say", args, { timeout: 15000 }, done);
  };
  if (file) execFile("afplay", ["-v", vol, file], { timeout: 10000 }, speak);
  else speak();
}

// ---------- usage: which characters you use most (orders the switcher) ----------
// usage.json: { <harness>: { n: sends, last: ms } }. First run is seeded from the last 60 days of chats in each harness's
// own folder (harnesses that share one folder can't be told apart from files, so they start at 0 and learn from use).
const USAGE_PATH = path.join(DATA_DIR, "usage.json");
let usage = readJSON(USAGE_PATH, null);
function seedUsage() {
  usage = {};
  const byCwd = {};
  for (const c of characters) (byCwd[c.cwd] ||= []).push(c);
  for (const [cwd, group] of Object.entries(byCwd)) {
    const owner = group.find((c) => !/-fast$/.test(c.id));
    if (cwd === HOME || !owner) continue;
    let n = 0, last = 0;
    try { for (const f of fs.readdirSync(sessionDirFor(cwd))) { if (!f.endsWith(".jsonl")) continue; const t = fs.statSync(path.join(sessionDirFor(cwd), f)).mtimeMs; if (Date.now() - t < 60 * 864e5) { n++; last = Math.max(last, t); } } } catch {}
    if (n) usage[owner.id] = { n, last };
  }
  try { fs.writeFileSync(USAGE_PATH, JSON.stringify(usage)); } catch {}
}

// ---------- chat history (Pi's own session files) ----------
const sessionDirFor = (cwd) => path.join(SESSIONS_ROOT, core.sessionDirName(cwd));
const titleCache = new Map();

const { textOf } = core;

function sessionMeta(file) {
  const st = fs.statSync(file);
  const hit = titleCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.meta;
  let title = "", name = "", count = 0, snippet = "";
  // Title/snippet come from the start; a rename may be near the end. Big files: read head + tail only.
  let data;
  if (st.size <= 1.5e6) data = fs.readFileSync(file, "utf8");
  else {
    const fd = fs.openSync(file, "r"), head = Buffer.alloc(512e3), tail = Buffer.alloc(256e3);
    fs.readSync(fd, head, 0, head.length, 0); fs.readSync(fd, tail, 0, tail.length, st.size - tail.length); fs.closeSync(fd);
    data = head.toString("utf8") + "\n" + tail.toString("utf8");
  }
  for (const line of data.split("\n")) {
    if (line.includes('"session_info"')) { try { name = JSON.parse(line).name || name; } catch {} }
    if (!/"role"\s*:\s*"user"/.test(line)) continue;
    count++;
    let t = "";
    try { t = textOf(JSON.parse(line).message.content); } catch {}
    if (!title) title = t;
    if (snippet.length < 3000) snippet += " " + t.slice(0, 600);
  }
  // Did the last turn finish? ("cut" = stopped part-way: the chat list offers Continue.)
  const end = core.lastTurnState(data.split("\n"));
  const identity = (data.match(/"customType"\s*:\s*"([a-z0-9]+)-identity"/) || [])[1] || ""; // set by a character's extension on its first turn
  const meta = { file, identity, cut: end === "cut", title: (name || title || "Untitled").replace(/\s+/g, " ").trim().slice(0, 90), mtime: st.mtimeMs, userMessages: count, snippet: snippet.replace(/\s+/g, " ").toLowerCase() };
  titleCache.set(file, { mtime: st.mtimeMs, meta });
  return meta;
}

// Characters that start in the home folder share one Pi session folder, so every chat there has exactly one owner:
// the character app-side tagged when it opened the chat (threads.json), else the one its identity marker names,
// else plain Pi (`base`), which owned that folder before the other characters existed. A chat shows under its owner only.
const sharesCwd = (ch) => ch.cwd === HOME;
const flat = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function tagSession(file, harness) {
  const ch = charById(harness);
  if (!ch || !sharesCwd(ch) || !isHarnessSession(file) || threadMeta[file]?.harness === harness) return;
  setThreadMeta(file, { harness });
}
function ownerOf(meta, tag) {
  if (tag && charById(tag)) return tag.replace(/-fast$/, "");
  const byMarker = meta.identity && characters.find((c) => (sharesCwd(c) || c.alsoHome) && flat(c.name) === meta.identity);
  return byMarker ? byMarker.id : "base";
}

function listSessions(id) {
  const ch = charById(id);
  if (!ch) return [];
  const shared = sharesCwd(ch);
  const dir = sessionDirFor(ch.cwd);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f)); } catch {}
  // A character that moved out of the home folder keeps its earlier home-folder chats (matched by owner, as for any home-folder chat).
  const old = [];
  if (ch.alsoHome && !shared) { const hd = sessionDirFor(HOME); try { for (const f of fs.readdirSync(hd)) if (f.endsWith(".jsonl")) old.push(path.join(hd, f)); } catch {} files = files.concat(old); }
  const oldSet = new Set(old);
  const me = id.replace(/-fast$/, "");
  return files.map((f) => { try { const m = sessionMeta(f), x = threadMeta[f] || {}; if ((shared || oldSet.has(f)) && ownerOf(m, x.harness) !== me) return null; return { ...m, title: x.title || m.title, pinned: !!x.pinned, archived: !!x.archived, interrupted: m.cut && !x.archived && Date.now() - m.mtime > 90e3 && Date.now() - m.mtime < 7 * 864e5 }; } catch { return null; } })
    .filter((m) => m && m.userMessages > 0)
    .sort((a, b) => b.mtime - a.mtime);
}


// ---------- chat metadata (app-side only; Pi session files are never edited) ----------
const THREADS_PATH = path.join(DATA_DIR, "threads.json");
let threadMeta = readJSON(THREADS_PATH, {});
function setThreadMeta(file, patch) {
  if (!isHarnessSession(file)) return {};
  const next = { ...(threadMeta[file] || {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] === false || next[k] === "" || next[k] == null) delete next[k];
  if (Object.keys(next).length) threadMeta[file] = next; else delete threadMeta[file];
  fs.writeFileSync(THREADS_PATH, JSON.stringify(threadMeta, null, 2));
  return threadMeta[file] || {};
}
// A chat file is valid only if it sits directly in a known harness's session folder.
function isHarnessSession(file) {
  if (typeof file !== "string" || !file.endsWith(".jsonl")) return false;
  const dir = path.dirname(path.resolve(file));
  return characters.some((c) => sessionDirFor(c.cwd) === dir);
}
async function trashThread(file) {
  if (!isHarnessSession(file) || !fs.existsSync(file)) throw new Error("Not a chat from one of your harnesses");
  await shell.trashItem(file);
  titleCache.delete(file);
  setThreadMeta(file, { title: null, pinned: null, archived: null });
  return true;
}

// A chat's history read straight from Pi's session file (no Pi process needed), so opening a chat is instant.
// Follows the branch from the newest entry back to the root. Very large files fall back to asking Pi.
const historyCache = new Map(); // file -> { sig, messages }, newest last
const LINK = /^\{"type":"([a-z_]+)","id":"([^"]+)","parentId":(null|"[^"]*")/;
async function chatHistory(file) {
  if (!isHarnessSession(file) || !fs.existsSync(file)) return { messages: null };
  const st = fs.statSync(file);
  if (st.size > 200e6) return { messages: null };
  const sig = st.size + ":" + st.mtimeMs, hit = historyCache.get(file);
  if (hit && hit.sig === sig) return { messages: hit.messages };
  const text = await fs.promises.readFile(file, "utf8");
  const byId = new Map(); let last = null;
  for (const line of text.split("\n")) {
    if (!line) continue;
    const head = LINK.exec(line.length > 300 ? line.slice(0, 300) : line);
    // System prompts (often megabytes per snapshot) are never shown: record the link and skip parsing.
    if (head && head[1] === "message" && line.slice(0, 400).includes('"role":"system"')) { const e = { id: head[2], parentId: head[3] === "null" ? null : head[3].slice(1, -1) }; byId.set(e.id, e); last = e; continue; }
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (!e.id) continue;
    byId.set(e.id, e); last = e;
  }
  const chain = [];
  for (let e = last, n = 0; e && n < 1e6; e = byId.get(e.parentId), n++) chain.push(e);
  const messages = [];
  for (const e of chain.reverse()) {
    if (e.type === "message" && e.message && e.message.role !== "system") messages.push(e.message);
    else if (e.type === "custom_message") messages.push({ role: "custom", customType: e.customType, content: e.content, display: e.display, timestamp: Date.parse(e.timestamp) });
    else if (e.type === "compaction") messages.push({ role: "compactionSummary", summary: e.summary, timestamp: Date.parse(e.timestamp) });
    else if (e.type === "branch_summary") messages.push({ role: "branchSummary", summary: e.summary, timestamp: Date.parse(e.timestamp) });
  }
  historyCache.set(file, { sig, messages });
  while (historyCache.size > 3) historyCache.delete(historyCache.keys().next().value);
  return { messages };
}

// Renderer file access is limited to your home folder (and /tmp), never secrets/credential stores (core.allowedPath).
function safePath(p) {
  if (typeof p !== "string" || !p) return null;
  let real = path.resolve(expand(p));
  try { real = fs.realpathSync(real); } catch {}
  return core.allowedPath(real, HOME) ? real : null;
}

// ---------- learning workspace (for the learning panel) ----------
function learningTopics(root) {
  root = expand(root || "~/learning");
  const topics = [];
  // Every folder in the root is a topic. One with a mission, lessons or learning records is a course; anything else is
  // notes the coach can turn into a course ("legacy" in the panel).
  const scan = (dir) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      const ls = (sub) => { try { return fs.readdirSync(path.join(p, sub)).filter((f) => !f.startsWith(".")).sort(); } catch { return []; } };
      let mission = "";
      try { mission = fs.readFileSync(path.join(p, "MISSION.md"), "utf8").split("\n").find((l) => l.trim() && !l.startsWith("#")) || ""; } catch {}
      const lessons = ls("lessons").filter((f) => f.endsWith(".html")).map((f) => ({ name: f, path: path.join(p, "lessons", f) }));
      const reference = ls("reference").filter((f) => f.endsWith(".html")).map((f) => ({ name: f, path: path.join(p, "reference", f) }));
      const records = ls("learning-records").length, hasMission = fs.existsSync(path.join(p, "MISSION.md"));
      topics.push({ name: e.name, path: p, legacy: !hasMission && !lessons.length && !records, mission: mission.trim(), lessons, reference, records });
    }
  };
  scan(root);
  let profile = "";
  try { profile = fs.readFileSync(path.join(root, "PROFILE.md"), "utf8"); } catch {}
  return { root, topics, profile };
}


// Full view of one teach-skill workspace (MISSION, lessons, learning records, resources, glossary).
function topicDetail(dir) {
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), "utf8"); } catch { return ""; } };
  const ls = (sub, ext) => { try { return fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith(ext)).sort(); } catch { return []; } };
  const titleOf = (txt, file) => (txt.match(/^#\s+(.+)$/m)?.[1] || file.replace(/^\d+-/, "").replace(/\.\w+$/, "").replace(/-/g, " ")).trim();
  const records = ls("learning-records", ".md").map((f) => {
    const p = path.join(dir, "learning-records", f), txt = read(path.join("learning-records", f));
    return { name: f, path: p, title: titleOf(txt, f), mtime: fs.statSync(p).mtimeMs };
  });
  const lessons = ls("lessons", ".html").map((f) => {
    const p = path.join(dir, "lessons", f), html = read(path.join("lessons", f));
    return { name: f, path: p, title: (html.match(/<title>([^<]+)<\/title>/i)?.[1] || titleOf("", f)).trim(), mtime: fs.statSync(p).mtimeMs };
  });
  const reference = ls("reference", ".html").map((f) => ({ name: f, path: path.join(dir, "reference", f), title: titleOf("", f) }));
  const count = (txt, re) => (txt.match(re) || []).length;
  return {
    name: path.basename(dir), path: dir, mission: read("MISSION.md"), lessons, reference, records,
    resources: count(read("RESOURCES.md"), /^\s*[-*]\s+/gm), glossary: count(read("GLOSSARY.md"), /^\s*[-*]\s+\*\*|^##\s+/gm),
    hasNotes: !!read("NOTES.md"),
  };
}

const lessonWatchers = new Map(); // one per learning root (two learning characters may use different folders)
function watchLessons(root) {
  if (lessonWatchers.has(root)) return;
  try {
    lessonWatchers.set(root, null);
    lessonWatchers.set(root, fs.watch(root, { recursive: true }, (_e, rel) => {
      if (!rel || !/(^|\/)(lessons|reference)\/[^/]+\.html$/.test(rel)) return;
      const full = path.join(root, rel);
      if (fs.existsSync(full)) send("learn:lesson", { path: full });
    }));
  } catch {}
}

// ---------- voice typing: local whisper.cpp ----------
// Voice typing (voice/asr.js): a whisper.cpp server keeps the model loaded, with the characters' names as vocabulary
// and the text before the cursor as context.
let ownAsr = null;
function asr() {
  if (!ownAsr) {
    const { createAsr } = require("./voice/asr");
    const vocabulary = () => `${userName()} talking to the AI characters ${characters.map((c) => c.name.replace(/[^\p{L}\p{N} ]/gu, "").trim()).filter(Boolean).join(", ")} in Pi Desktop.`;
    ownAsr = createAsr({ env: ENV, fallbackModel: whisperModelPath(), vocabulary, log: (m) => console.log(m) });
  }
  return ownAsr;
}
async function transcribe(bytes, before = "") {
  try { return await asr().transcribe(Buffer.from(bytes), { before: String(before || "").replace(/[\u0000-\u001f]/g, " ").slice(-240) }); }
  catch (e) { return { error: String(e.message || e).slice(0, 400) }; }
}

// ---------- scheduled tasks ("crons") ----------
// Each run is a separate headless `pi-<harness> -p` process, so it never touches the live chat.
// Pi saves it as a normal session named "⏰ <task>", which then shows up in the chat list.
const TASKS_PATH = path.join(DATA_DIR, "tasks.json");
let tasks = readJSON(TASKS_PATH, []);
const runningTasks = new Map();
const saveTasks = () => { fs.writeFileSync(TASKS_PATH, JSON.stringify(tasks, null, 2)); send("tasks:update", publicTasks()); };
const publicTasks = () => tasks.map((t) => ({ ...t, running: runningTasks.has(t.id) }));

const nextRun = (t, from = Date.now()) => core.nextRun(t.schedule, from);

function findTaskSession(ch, name, since) {
  const dir = sessionDirFor(ch.cwd);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f))
      .filter((f) => fs.statSync(f).mtimeMs >= since && fs.readFileSync(f, "utf8").includes(JSON.stringify(name)))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  } catch { return null; }
}

function runTask(id) {
  const t = tasks.find((x) => x.id === id);
  const ch = t && charById(t.character);
  if (!t || !ch || runningTasks.has(id)) return false;
  const started = Date.now(), title = `⏰ ${t.name}`;
  const child = spawn(ch.script, ["-p", t.prompt, "--name", title], { cwd: spawnCwd(ch), env: { ...ENV, PI_DESKTOP_TASK: t.id }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (d) => { out = (out + d).slice(-20000); });
  child.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
  child.on("error", (e) => { err += `\n${e.message}`; if (!child.pid) child.emit("exit", 127); });
  const killer = setTimeout(() => child.kill("SIGTERM"), (t.timeoutMin || 30) * 60e3);
  runningTasks.set(id, child); keepAwake();
  send("tasks:update", publicTasks());
  child.on("exit", (code) => {
    clearTimeout(killer);
    runningTasks.delete(id); keepAwake();
    const ok = code === 0;
    if (ok) announce(t.character);
    const summary = (ok ? out : err || out).replace(/\x1b\[[0-9;]*m/g, "").trim().slice(-1500);
    const run = { at: started, ms: Date.now() - started, ok, summary, session: findTaskSession(ch, title, started) };
    t.runs = [run, ...(t.runs || [])].slice(0, 20);
    t.lastRunAt = started;
    saveTasks();
    const n = new Notification({ title: `${ch.name} · ${t.name} ${ok ? "done" : "failed"}`, body: summary.replace(/\s+/g, " ").slice(0, 140) || (ok ? "Done." : `Exit ${code}`) });
    n.on("click", () => { showWindow(); send("app:open-task", { character: t.character, id: t.id }); });
    n.show();
  });
  return true;
}

function tick() {
  const now = Date.now();
  let changed = false;
  for (const t of tasks) {
    if (!t.enabled) continue;
    if (!t.nextRunAt) { t.nextRunAt = nextRun(t); changed = true; continue; }
    if (t.nextRunAt <= now) {
      // Catch up a run missed while the app was closed only if it was due in the last 12h.
      if (now - t.nextRunAt < 12 * 3600e3) runTask(t.id);
      t.nextRunAt = nextRun(t, now);
      changed = true;
    }
  }
  if (changed) saveTasks();
}

// ---------- icons drawn from the character's pixel sprite ----------
function spriteImage(sprite, size, { rounded = true, bg = [24, 24, 24] } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const rows = sprite.rows, h = rows.length, w = Math.max(1, ...rows.map((r) => r.length));
  const pad = rounded ? Math.round(size * 0.12) : 0;
  const scale = Math.max(1, Math.floor((size - pad * 2) / Math.max(w, h, 1)));
  const ox = Math.floor((size - w * scale) / 2), oy = Math.floor((size - h * scale) / 2);
  const rad = size * 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (rounded) {
      const dx = Math.max(rad - x, x - (size - 1 - rad), 0), dy = Math.max(rad - y, y - (size - 1 - rad), 0);
      if (dx * dx + dy * dy <= rad * rad) { buf[i] = bg[2]; buf[i + 1] = bg[1]; buf[i + 2] = bg[0]; buf[i + 3] = 255; }
    }
    const sx = Math.floor((x - ox) / scale), sy = Math.floor((y - oy) / scale);
    const key = rows[sy] && x >= ox && y >= oy ? rows[sy][sx] : undefined;
    const hex = key && sprite.palette[key];
    if (hex) {
      const n = parseInt(hex.slice(1), 16);
      buf[i] = n & 255; buf[i + 1] = (n >> 8) & 255; buf[i + 2] = (n >> 16) & 255; buf[i + 3] = 255; // BGRA
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// Dock tile from a character PNG: the portrait fills a macOS-style rounded square (Big Sur grid: 824/1024).
function imageTile(file, size) {
  const src = nativeImage.createFromPath(expand(file));
  if (src.isEmpty()) return null;
  const inner = Math.round(size * 0.805), off = Math.round((size - inner) / 2), r = inner * 0.225;
  const fg = src.resize({ width: inner, height: inner, quality: "best" }).toBitmap();
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < inner; y++) for (let x = 0; x < inner; x++) {
    const dx = Math.max(r - x, x - (inner - 1 - r), 0), dy = Math.max(r - y, y - (inner - 1 - r), 0);
    if (dx * dx + dy * dy > r * r) continue;
    const s = (y * inner + x) * 4, d = ((y + off) * size + (x + off)) * 4;
    out[d] = fg[s]; out[d + 1] = fg[s + 1]; out[d + 2] = fg[s + 2]; out[d + 3] = 255;
  }
  return nativeImage.createFromBuffer(out, { width: size, height: size });
}

let tray = null;
function applyCharacterChrome(id) {
  const ch = charById(id);
  if (!ch) return;
  if (win) win.setTitle(`${ch.name} · Pi Desktop`);
  if (ch.icon) {
    const tile = imageTile(ch.icon, 512);
    if (tile && process.platform === "darwin" && app.dock) app.dock.setIcon(tile);
    if (tray) tray.setImage(nativeImage.createFromPath(expand(ch.icon)).resize({ width: 18, height: 18, quality: "best" }));
  } else if (ch.spriteData) {
    if (process.platform === "darwin" && app.dock) app.dock.setIcon(spriteImage(ch.spriteData, 512));
    if (tray) tray.setImage(spriteImage(ch.spriteData, 18, { rounded: false }));
  }
}

// "Open at login". A packaged app uses macOS login items. Run from source (npm start), a login item would launch bare
// Electron without this app, so a LaunchAgent that runs this checkout is installed instead (a test profile keeps its own).
const AGENT = process.env.PIDESK_PROFILE ? path.join(DATA_DIR, "launch-agent.plist") : path.join(HOME, "Library/LaunchAgents/dev.pi-desktop.app.plist");
const loginOn = () => (app.isPackaged ? app.getLoginItemSettings().openAtLogin : fs.existsSync(AGENT));
function setLogin(on) {
  if (app.isPackaged) return app.setLoginItemSettings({ openAtLogin: !!on });
  if (!on) return fs.rmSync(AGENT, { force: true });
  const x = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  fs.mkdirSync(path.dirname(AGENT), { recursive: true });
  fs.writeFileSync(AGENT, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.pi-desktop.app</string>
  <key>ProgramArguments</key><array><string>${x(process.execPath)}</string><string>${x(ROOT)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
`);
}

function buildTray() {
  const def = charById(config.defaultCharacter) || characters[0];
  // No characters yet (first run): the app icon, so the menu-bar item is still there to click.
  const img = def?.spriteData ? spriteImage(def.spriteData, 18, { rounded: false }) : nativeImage.createFromPath(path.join(ROOT, "build", "icon.png")).resize({ width: 18, height: 18, quality: "best" });
  tray = new Tray(img);
  tray.setToolTip("Pi Desktop");
  const login = loginOn();
  const menu = Menu.buildFromTemplate([
    { label: "Show", accelerator: config.hotkey, click: showWindow },
    { type: "separator" },
    ...characters.filter((c) => c.custom).map((c) => ({ label: c.name, click: () => { showWindow(); send("app:focus-character", c.id); } })),
    { type: "separator" },
    { label: "Open at login", type: "checkbox", checked: login, click: (m) => setLogin(m.checked) },
    { label: "Quit", accelerator: "Cmd+Q", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", showWindow);
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function savedBounds() {
  const b = readJSON(statePath(), null);
  if (!b) return { width: 1320, height: 860 };
  // Only reuse a position that is still on a connected display.
  const onScreen = screen.getAllDisplays().some((d) => b.x >= d.bounds.x - 50 && b.y >= d.bounds.y - 50 && b.x < d.bounds.x + d.bounds.width && b.y < d.bounds.y + d.bounds.height);
  return onScreen ? b : { width: b.width, height: b.height };
}
function createWindow() {
  win = new BrowserWindow({
    ...savedBounds(), minWidth: 760, minHeight: 520,
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 18 },
    vibrancy: "sidebar", visualEffectState: "active", backgroundColor: "#00000000",
    show: false,
    webPreferences: { preload: path.join(ROOT, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(ROOT, "app/index.html"));
  // A test profile (PIDESK_PROFILE) never shows its window, so automated runs can't be disturbed by stray clicks.
  win.once("ready-to-show", () => { if (!process.env.PIDESK_PROFILE || process.env.PIDESK_SHOW) win.show(); });
  let saveT;
  const saveState = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (!win.isDestroyed() && !win.isMinimized()) fs.writeFileSync(statePath(), JSON.stringify(win.getBounds())); }, 400); };
  win.on("resize", saveState); win.on("move", saveState);
  win.on("close", (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (url.split(/[?#]/)[0] !== INDEX_URL) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
}



// ---------- memory (Hindsight) proxy for the Memory tab, only when config.memory is set ----------
// The page can't reach the local server (CSP), so the main process forwards a whitelist of bank calls.
const memCfg = () => (config.memory && config.memory.url ? { bank: "default", ...config.memory } : null);
const HINDSIGHT = () => memCfg().url.replace(/\/$/, "") + "/v1/default/banks/" + encodeURIComponent(memCfg().bank);
const MEM_ALLOWED = [
  ["GET", /^\/stats$/], ["GET", /^\/memories\/list(\?[\w%=&.:+-]*)?$/], ["PATCH", /^\/memories\/[\w-]+$/],
  ["POST", /^\/memories$/], ["POST", /^\/memories\/recall$/],
  ["GET", /^\/mental-models\/profile-[\w-]+$/], ["POST", /^\/mental-models\/profile-[\w-]+\/refresh$/],
];
async function memRequest(method, sub, body) {
  if (!memCfg()) return { error: "Memory is off (set memory.url in config.json)" };
  if (!MEM_ALLOWED.some(([m, re]) => m === method && re.test(sub))) return { error: "not allowed" };
  try {
    const r = await fetch(HINDSIGHT() + sub, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(method === "POST" && sub.endsWith("/memories") ? 60000 : 15000) });
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { error: data?.detail ? JSON.stringify(data.detail).slice(0, 300) : `HTTP ${r.status}` };
  } catch (e) { return { error: "Memory server not reachable (" + (e.cause?.code || e.name) + ")" }; }
}


// ---------- native menu ----------
function buildMenu() {
  const toRenderer = (ch) => () => { showWindow(); send("app:menu", ch); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { role: "about" }, { type: "separator" },
      { label: "Settings…", accelerator: "Cmd+,", click: toRenderer("settings") },
      { label: "Keyboard Shortcuts", accelerator: "Cmd+/", click: toRenderer("shortcuts") },
      { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" },
      { label: "Quit Pi Desktop", accelerator: "Cmd+Q", click: () => app.quit() },
    ] },
    { label: "File", submenu: [
      { label: "New Chat", accelerator: "Cmd+N", click: toRenderer("new-chat") },
      { label: "Switch Character…", accelerator: "Cmd+K", click: toRenderer("switcher") },
      { label: "Export Chat as HTML", accelerator: "Cmd+Shift+E", click: toRenderer("export") },
      { type: "separator" }, { role: "close" },
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Toggle Sidebar", accelerator: "Cmd+B", click: toRenderer("toggle-sidebar") },
      { label: "Toggle Side Panel", accelerator: "Cmd+\\", click: toRenderer("toggle-panel") },
      { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "togglefullscreen" }, { role: "reload" }, { role: "toggleDevTools" },
    ] },
    { role: "windowMenu" },
  ]));
}

const whisperModelPath = () => { const p = expand(config.whisperModel); return path.isAbsolute(p) ? p : path.join(ROOT, p); };

// ---------- first run: no harnesses yet ----------
// Where `pi` resolves on the PATH harness scripts get (null = not installed, or not on that PATH).
function findPi() {
  try { return execFileSync("/bin/sh", ["-c", "command -v pi"], { env: ENV, encoding: "utf8", timeout: 5000 }).trim() || null; }
  catch { return null; }
}
function setupStatus() {
  const bin = expand(config.harnessDir || "~/bin");
  return { harnessDir: bin.replace(HOME, "~"), harnessDirExists: fs.existsSync(bin), pi: findPi(), characters: characters.length, repo: ROOT.replace(HOME, "~") };
}
// Copies examples/bin/pi-* into the harness folder (never overwrites), pointing their terminal face at this checkout.
function addExamples() {
  const bin = expand(config.harnessDir || "~/bin"), src = path.join(ROOT, "examples", "bin");
  fs.mkdirSync(bin, { recursive: true });
  const here = ROOT.replace(/["$`\\]/g, "\\$&");
  return fs.readdirSync(src).filter((f) => f.startsWith("pi-")).map((f) => {
    const dest = path.join(bin, f);
    if (fs.existsSync(dest)) return { file: dest, kept: true };
    const body = fs.readFileSync(path.join(src, f), "utf8").replace("${PI_DESKTOP_DIR:-$HOME/pi-desktop}", `\${PI_DESKTOP_DIR:-${here}}`);
    fs.writeFileSync(dest, body, { mode: 0o755 });
    return { file: dest, kept: false };
  });
}
// Re-reads the harness folder and character files, then restarts the page (and the menu-bar list).
function reloadCharacters() {
  loadCharacters();
  if (tray) { tray.destroy(); tray = null; buildTray(); }
  applyCharacterChrome(config.defaultCharacter);
  win?.reload();
}

// ---------- IPC ----------
ipcMain.handle("setup:status", () => setupStatus());
ipcMain.handle("setup:add-examples", () => { try { return { added: addExamples() }; } catch (e) { return { error: String(e.message || e) }; } });
ipcMain.handle("setup:reload", () => { reloadCharacters(); return true; });
ipcMain.handle("app:init", () => ({
  characters: characters.map(({ quoteList, ...c }) => ({ ...c, quoteList })),
  defaultCharacter: config.defaultCharacter,
  startCharacter,
  user: userName(),
  modelProviders: config.modelProviders,
  memory: memCfg() ? { bank: memCfg().bank, explorer: memCfg().explorer || null } : null,
  charDir: CHAR_DIR.replace(HOME, "~") + "/",
  home: HOME,
}));
ipcMain.handle("pi:cmd", (_e, id, cmd) => {
  if (!core.pageRpcAllowed(cmd)) return { success: false, error: `Not allowed from the window: ${String(cmd?.type).slice(0, 40)}` };
  if (cmd.type === "export_html") {
    const out = path.resolve(expand(String(cmd.outputPath || "")));
    if (!core.exportPathAllowed(out, HOME)) return { success: false, error: "Export goes to an .html file in Downloads." };
    cmd = { ...cmd, outputPath: out };
  }
  return rpc(id, cmd);
});
ipcMain.handle("pi:ensure", async (_e, key, harness, sessionFile) => {
  // Another chat already has this file running: share its process instead of starting a second writer.
  const other = !procs.has(key) && procForFile(sessionFile, key);
  if (other) { await procs.get(other).ready; return { alias: other, busy: procs.get(other).busy, defaultModel: defaults.get(harness) }; }
  if (!procs.has(key)) startPi(key, harness, sessionFile);
  await procs.get(key)?.ready;
  return { busy: procs.get(key)?.busy, defaultModel: defaults.get(harness) };
});
ipcMain.handle("pi:close", (_e, key, opts) => { const p = procs.get(key); if (p && opts?.reap && holding(p)) return { kept: true }; /* the idle reaper never closes a chat that is working or waiting on a background job */ if (p) { p.closing = true; p.closeReason = opts?.reap ? "idle-reaper" : "closed-by-you"; try { p.child.stdin.end(); } catch {} setTimeout(() => { if (!p.child.killed && procs.get(key) === p) p.child.kill(); }, 5000); } return true; });
ipcMain.handle("pi:running", () => [...procs.entries()].map(([id, p]) => ({ id, harness: p.harness, busy: p.busy })));
ipcMain.handle("pi:restart", (_e, id) => { procs.get(id)?.child.kill(); return true; });
ipcMain.on("pi:ui-response", (_e, id, resp) => { if (resp?.type !== "extension_ui_response" || typeof resp.id !== "string") return; try { procs.get(id)?.child.stdin.write(JSON.stringify(resp) + "\n"); } catch {} });
ipcMain.handle("tasks:list", () => publicTasks());
ipcMain.handle("tasks:save", (_e, t) => {
  const i = tasks.findIndex((x) => x.id === t.id);
  const prev = i >= 0 ? tasks[i] : null;
  const keep = prev && prev.nextRunAt > Date.now() && JSON.stringify(prev.schedule) === JSON.stringify(t.schedule);
  const clean = { runs: [], ...(prev || {}), ...t, nextRunAt: keep ? prev.nextRunAt : nextRun(t) };
  delete clean.running;
  if (!clean.id) clean.id = "t" + Date.now().toString(36);
  if (i >= 0) tasks[i] = clean; else tasks.push(clean);
  saveTasks();
  return clean;
});
ipcMain.handle("tasks:delete", (_e, id) => { tasks = tasks.filter((t) => t.id !== id); runningTasks.get(id)?.kill("SIGTERM"); saveTasks(); return true; });
ipcMain.handle("tasks:run", (_e, id) => runTask(id));
ipcMain.handle("tasks:stop", (_e, id) => { runningTasks.get(id)?.kill("SIGTERM"); return true; });
ipcMain.handle("mem:req", (_e, method, sub, body) => memRequest(method, sub, body));
ipcMain.handle("chat:history", async (_e, file) => { try { return await chatHistory(file); } catch { return { messages: null }; } });
// What this app is allowed to touch on macOS. Full Disk Access is tested by listing a protected folder.
ipcMain.handle("perm:status", () => {
  let files = false;
  try { fs.readdirSync(path.join(HOME, ".Trash")); files = true; } catch {}
  let mic = "unknown";
  try { mic = systemPreferences.getMediaAccessStatus("microphone"); } catch {}
  return { files, mic, notifications: Notification.isSupported() };
});
const PRIVACY = { files: "Privacy_AllFiles", mic: "Privacy_Microphone", notifications: "" };
ipcMain.handle("perm:open", (_e, kind) => {
  if (kind === "notifications") return shell.openExternal("x-apple.systempreferences:com.apple.Notifications-Settings.extension");
  if (!PRIVACY[kind]) return false;
  return shell.openExternal("x-apple.systempreferences:com.apple.preference.security?" + PRIVACY[kind]);
});
ipcMain.handle("usage:get", () => { if (!usage) seedUsage(); return usage; });
ipcMain.handle("usage:bump", (_e, id) => {
  if (!usage) seedUsage();
  if (!charById(id)) return usage;
  const base = id.replace(/-fast$/, ""); // fast variants count toward their base character
  const u = (usage[charById(base) ? base : id] ||= { n: 0, last: 0 });
  u.n++; u.last = Date.now();
  try { fs.writeFileSync(USAGE_PATH, JSON.stringify(usage)); } catch {}
  return usage;
});
ipcMain.handle("sound:preview", (_e, harness) => { announce(harness, { preview: true }); return true; });
ipcMain.handle("threads:meta", (_e, file, patch) => setThreadMeta(file, patch));
ipcMain.handle("threads:trash", async (_e, file) => { try { return await trashThread(file); } catch (e) { return { error: String(e.message || e) }; } });
ipcMain.handle("app:config", () => ({ ...config, userName: userName(), openAtLogin: loginOn() }));
// Only what the Settings sheet edits, type-checked. (harnessDir decides which scripts run, and memory.url where data
// goes: those stay in config.json, edited by you, never by the page.)
const SETTINGS = { userName: "string", hotkey: "string", notifyWhenHidden: "boolean", showThinking: "boolean", finishSound: "boolean", finishVoice: "boolean" };
ipcMain.handle("app:save-config", (_e, patch) => {
  const { openAtLogin, modelProviders, ...given } = patch && typeof patch === "object" ? patch : {};
  const rest = {};
  for (const [k, v] of Object.entries(given)) if (typeof v === SETTINGS[k]) rest[k] = k === "userName" ? v.slice(0, 60) : v;
  if (Array.isArray(modelProviders)) rest.modelProviders = modelProviders.filter((x) => typeof x === "string" && /^[\w.-]{1,60}$/.test(x)).slice(0, 30);
  if (openAtLogin != null) setLogin(!!openAtLogin);
  if (rest.hotkey && rest.hotkey !== config.hotkey) {
    globalShortcut.unregister(config.hotkey);
    const ok = globalShortcut.register(rest.hotkey, () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
    if (!ok) { globalShortcut.register(config.hotkey, () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow())); return { error: `Couldn't register ${rest.hotkey}` }; }
  }
  Object.assign(config, rest);
  saveConfig();
  return { ok: true };
});
ipcMain.handle("app:badge", (_e, n) => { if (app.dock) app.dock.setBadge(n ? String(n) : ""); });
ipcMain.handle("app:open-paths", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openFile", "multiSelections"] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("fs:read-image", (_e, p) => {
  p = safePath(p); if (!p) return null;
  const ext = path.extname(p).slice(1).toLowerCase(), mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext];
  if (!mime) return null;
  return { type: "image", mimeType: mime, data: fs.readFileSync(p).toString("base64") };
});
ipcMain.handle("app:open-export", (_e, p) => {
  const f = safePath(p);
  if (!f || !core.exportPathAllowed(f, HOME)) return "Not allowed";
  return shell.openPath(f);
});
ipcMain.handle("sessions:list", (_e, id) => listSessions(id));
ipcMain.handle("learn:topics", (_e, root) => { const r = safePath(root || "~/learning"); if (!r) return []; watchLessons(r); return learningTopics(r); });
ipcMain.handle("learn:topic", (_e, dir) => { const d = safePath(dir); return d ? topicDetail(d) : null; });
ipcMain.handle("fs:read", (_e, p) => { const f = safePath(p); if (!f) return null; try { return fs.readFileSync(f, "utf8"); } catch { return null; } });
ipcMain.handle("fs:list", (_e, dir) => {
  const d = safePath(dir); if (!d) return [];
  try {
    return fs.readdirSync(d, { withFileTypes: true }).filter((e) => !e.name.startsWith("."))
      .map((e) => ({ name: e.name, dir: e.isDirectory(), path: path.join(d, e.name) }))
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  } catch { return []; }
});
ipcMain.handle("fs:reveal", (_e, p) => { const f = safePath(p); if (f) shell.showItemInFolder(f); });
// "Open" hands a file to macOS, which runs some kinds (an .app, a .command script, an executable). A link in a model's
// reply could point at one, so those are shown in Finder instead: running it stays a deliberate double-click.
ipcMain.handle("fs:open", (_e, p) => {
  const f = safePath(p);
  if (!f) return "Not allowed";
  let exec = false; try { const st = fs.statSync(f); exec = st.isFile() && !!(st.mode & 0o111); } catch {}
  if (core.LAUNCHES.test(f) || exec) { shell.showItemInFolder(f); return "That file can run code, so it's shown in Finder instead."; }
  return shell.openPath(f);
});
ipcMain.handle("fs:allowed", (_e, p) => !!safePath(p));
ipcMain.handle("voice:transcribe", (_e, bytes, before) => transcribe(bytes, before));
ipcMain.handle("voice:warm", () => asr().warm());
ipcMain.handle("voice:permission", async () => (process.platform === "darwin" ? systemPreferences.askForMediaAccess("microphone") : true));
ipcMain.on("app:character", (_e, id) => applyCharacterChrome(id));

// ---------- lifecycle ----------
app.setName("Pi Desktop");
// PIDESK_PROFILE=<dir> runs an isolated copy (own lock/storage), e.g. to test while the main app is open.
if (process.env.PIDESK_PROFILE) app.setPath("userData", process.env.PIDESK_PROFILE);
const iconArg = process.argv.find((a) => a.startsWith("--write-icon="));
if (iconArg) {
  app.whenReady().then(() => {
    loadCharacters();
    const ch = charById(config.defaultCharacter) || characters[0];
    if (!ch) { console.error("--write-icon: no characters found"); return app.exit(1); }
    const img = (ch.icon && imageTile(ch.icon, 1024)) || spriteImage(ch.spriteData, 1024);
    fs.writeFileSync(iconArg.split("=")[1], img.toPNG());
    app.exit(0);
  });
}
if (!iconArg && !app.requestSingleInstanceLock()) app.quit();
// `--character=<harness>` (first launch or a second `open`) jumps straight to that character.
const charArg = (argv) => argv.find((a) => a.startsWith("--character="))?.split("=")[1];
let startCharacter = charArg(process.argv);
app.on("second-instance", (_e, argv) => { showWindow(); const id = charArg(argv); if (id) send("app:focus-character", id); });
if (!iconArg) app.whenReady().then(() => {
  nativeTheme.themeSource = "dark";
  buildMenu();
  // Microphone (voice typing) and copy only, and only for the app's own page: never for a lesson or preview frame.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, details) =>
    cb((perm === "media" || perm === "clipboard-sanitized-write") && details?.isMainFrame !== false && String(details?.requestingUrl || INDEX_URL).split(/[?#]/)[0] === INDEX_URL));
  loadCharacters();
  createWindow();
  buildTray();
  applyCharacterChrome(config.defaultCharacter);
  tick(); setInterval(tick, 30e3);
  if (config.showThinking === undefined) config.showThinking = true;
  globalShortcut.register(config.hotkey, () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
});

// ---------- keep the Mac awake while your agents work ----------
// While any agent (or scheduled task) is working: no idle sleep, on battery too, so work you walked away from finishes.
// The display still turns off and closing the lid still sleeps the Mac. Ends when Pi Desktop quits.
let busyHold = null;
const hold = (args) => { const c = spawn("caffeinate", [...args, "-w", String(process.pid)], { stdio: "ignore" }); c.on("error", () => {}); return c; };
function keepAwake() {
  const busy = [...procs.values()].some(holding) || runningTasks.size > 0;
  if (busy && !busyHold) busyHold = hold(["-i"]);
  else if (!busy && busyHold) { busyHold.kill(); busyHold = null; }
}
app.on("activate", showWindow);
// Quitting ends every chat. If any are still working (or waiting on a background job), ask first.
let quitAsked = false, quitOk = false;
const workingNow = () => [...procs.values()].filter(holding).length + runningTasks.size;
app.on("before-quit", (e) => {
  const n = process.env.PIDESK_PROFILE || quitOk ? 0 : workingNow();
  if (!n) { app.isQuitting = true; return; }
  e.preventDefault();
  if (quitAsked) return; // the question is already on screen
  quitAsked = true;
  dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: "warning", buttons: ["Keep working", "Quit anyway"], defaultId: 0, cancelId: 0, message: `${n} ${n === 1 ? "chat is" : "chats are"} still working`, detail: "Quitting now stops the work part-way. Wait for it to finish, or quit anyway." })
    .then((r) => { quitAsked = false; if (r.response === 1) { quitOk = true; app.quit(); } });
});
app.on("before-quit", () => {
  if (!app.isQuitting) return;
  app.isQuitting = true; for (const p of procs.values()) p.child.stdin.end(); for (const c of runningTasks.values()) c.kill("SIGTERM"); });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {});
