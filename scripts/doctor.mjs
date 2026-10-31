// npm run doctor: checks everything Pi Desktop needs, and says how to fix what's missing.
// ✓ ok · ! optional, a feature is off without it · ✗ required (exit code 1)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = createRequire(import.meta.url)("../lib/core.js");
const HOME = os.homedir();
const expand = (p) => (p ? p.replace(/^~(?=\/|$)/, HOME).replace(/^\$HOME/, HOME) : p);
const tilde = (p) => p.replace(HOME, "~");
let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m, fix) => console.log(`  ! ${m}${fix ? `\n      ${fix}` : ""}`);
const bad = (m, fix) => { failed++; console.log(`  ✗ ${m}${fix ? `\n      ${fix}` : ""}`); };
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
// Same PATH the app gives harness scripts (a Finder-launched app gets your login shell's PATH).
let PATH = process.env.PATH;
try { PATH = execFileSync("/bin/zsh", ["-lic", 'printf "%s" "$PATH"'], { timeout: 5000, encoding: "utf8" }).trim() + ":" + PATH; } catch {}
const which = (cmd) => { try { return execFileSync("/bin/sh", ["-c", `command -v ${cmd}`], { env: { ...process.env, PATH }, encoding: "utf8" }).trim(); } catch { return null; } };
const run = (cmd, args) => { try { return execFileSync(cmd, args, { env: { ...process.env, PATH }, encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return null; } };

console.log("System");
if (process.platform === "darwin") ok(`macOS ${run("sw_vers", ["-productVersion"]) || ""}`.trim());
else bad(`${process.platform}: Pi Desktop supports macOS only`);
const major = +process.versions.node.split(".")[0];
major >= 20 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} is too old`, "Install Node 20 or newer (https://nodejs.org or nvm).");

console.log("App");
const nm = path.join(ROOT, "node_modules");
if (!fs.existsSync(nm)) bad("Dependencies aren't installed", "Run: npm install");
else {
  for (const dep of ["marked", "dompurify", "@highlightjs/cdn-assets"]) fs.existsSync(path.join(nm, dep)) ? null : bad(`Missing dependency ${dep}`, "Run: npm install");
  const el = path.join(nm, "electron");
  let elOk = false;
  try { elOk = fs.readFileSync(path.join(el, "path.txt"), "utf8").length > 0 && fs.existsSync(path.join(el, "dist")); } catch {}
  elOk ? ok(`Electron ${readJSON(path.join(el, "package.json")).version}`) : bad("Electron's binary isn't unpacked", "Run: node scripts/ensure-electron.mjs (or rm -rf node_modules/electron && npm install)");
}
let config = {};
const cfgPath = path.join(ROOT, "config.json");
if (fs.existsSync(cfgPath)) {
  try { config = readJSON(cfgPath); ok("config.json is valid"); } catch (e) { bad(`config.json isn't valid JSON (${e.message})`, "Fix it, or delete it to use the defaults (see config.example.json)."); }
} else ok("No config.json: using defaults (optional; see config.example.json)");

console.log("Pi");
const pi = which("pi");
if (!pi) bad("pi isn't on your PATH", "Run: npm install -g @earendil-works/pi-coding-agent, then run `pi` once and log in to a provider.");
else {
  const v = run(pi, ["--version"]);
  ok(`pi ${v || "(version unknown)"} at ${tilde(pi)}`);
  fs.existsSync(path.join(HOME, ".pi/agent")) ? ok("Pi has been run before (~/.pi/agent exists)") : warn("Pi hasn't been run yet", "Run `pi` once in a terminal and log in to a model provider.");
}

console.log("Characters");
const bin = expand(config.harnessDir || "~/bin");
let harnesses = [];
try { harnesses = fs.readdirSync(bin).filter((f) => f.startsWith("pi-") && f !== "pi-ls").sort(); } catch {}
if (!harnesses.length) warn(`No pi-* harness scripts in ${tilde(bin)} yet`, `Start the app and click "Add the example characters", or run: scripts/install-pack.sh all`);
for (const f of harnesses) {
  const file = path.join(bin, f), id = f.slice(3);
  let mode = 0; try { mode = fs.statSync(file).mode; } catch {}
  if (!(mode & 0o111)) { bad(`${f} isn't executable`, `Run: chmod +x ${tilde(file)}`); continue; }
  const src = fs.readFileSync(file, "utf8");
  if (!core.parseHarness(src, HOME)) continue; // an alias of another harness
  const charFile = path.join(ROOT, "characters", `${id}.json`);
  let note = "no character file (default face and name)";
  if (fs.existsSync(charFile)) { try { readJSON(charFile); note = "character file ok"; } catch (e) { warn(`characters/${id}.json isn't valid JSON (${e.message}); the app uses a default face and name`); continue; } }
  ok(`${f}: ${note}`);
}

console.log("Optional");
const py = which("python3");
py && run(py, ["-I", "-c", "import PIL"]) !== null ? ok("Python 3 + Pillow (pixel faces)") : warn("Python 3 + Pillow not found: new pixel faces can't be drawn (shipped faces still work)", "Run: python3 -m pip install --user pillow");
const ffmpeg = which("ffmpeg"), whisper = which("whisper-cli") || which("whisper-server");
ffmpeg && whisper ? ok("whisper.cpp + ffmpeg (voice typing)") : warn("Voice typing is off: whisper.cpp or ffmpeg missing", "Run: brew install whisper-cpp ffmpeg");
let model = expand(config.whisperModel || "models/ggml-small.en-q5_1.bin");
if (!path.isAbsolute(model)) model = path.join(ROOT, model);
const turbo = path.join(ROOT, "models", "ggml-large-v3-turbo-q5_0.bin");
fs.existsSync(turbo) || fs.existsSync(model) ? ok(`Whisper model ${tilde(fs.existsSync(turbo) ? turbo : model)}`)
  : warn(`No whisper model at ${tilde(model)}`, `Download ggml-small.en-q5_1.bin from https://huggingface.co/ggerganov/whisper.cpp into ${tilde(path.join(ROOT, "models"))}/ (or set whisperModel).`);
if (config.memory?.url) {
  try { await fetch(config.memory.url, { signal: AbortSignal.timeout(3000) }); ok(`Memory server reachable at ${config.memory.url}`); }
  catch { warn(`Memory server not reachable at ${config.memory.url}`, "Start your Hindsight server, or remove `memory` from config.json."); }
}

console.log(failed ? `\n${failed} problem${failed > 1 ? "s" : ""} to fix (✗). Optional items (!) only turn features off.` : "\nReady. Start with: npm start");
process.exit(failed ? 1 : 0);
