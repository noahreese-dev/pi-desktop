// postinstall: make sure Electron's binary is really there.
// On some Node versions (seen on Node 24) electron's own install step downloads the zip but exits before
// unzipping it, and `npm start` then fails with "Electron failed to install correctly". This finishes the job
// from the zip electron already cached, using macOS's ditto. It does nothing when Electron is fine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dir = path.dirname(require.resolve("electron/package.json"));
const { version } = require("electron/package.json");
const exe = "Electron.app/Contents/MacOS/Electron";
// Same test electron uses: path.txt and dist/version are only written after a complete unzip.
const ok = () => { try { return fs.readFileSync(path.join(dir, "path.txt"), "utf8") === exe && fs.readFileSync(path.join(dir, "dist", "version"), "utf8").replace(/^v/, "") === version; } catch { return false; } };
if (process.platform !== "darwin" || ok()) process.exit(0);

const cache = process.env.electron_config_cache || path.join(os.homedir(), "Library/Caches/electron");
const name = `electron-v${version}-darwin-${process.arch}.zip`;
const find = (d) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isFile() && e.name === name) return p; if (e.isDirectory()) { const f = find(p); if (f) return f; } } } catch {} return null; };
let zip = find(cache);
if (!zip) { // let electron download it (its download step works; only the unzip is flaky)
  try { execFileSync(process.execPath, [path.join(dir, "install.js")], { stdio: "inherit" }); } catch {}
  if (ok()) process.exit(0);
  zip = find(cache);
}
if (!zip) { console.error(`ensure-electron: ${name} not found in ${cache}; run: rm -rf node_modules/electron && npm install`); process.exit(1); }
fs.rmSync(path.join(dir, "dist"), { recursive: true, force: true });
fs.mkdirSync(path.join(dir, "dist"));
execFileSync("ditto", ["-x", "-k", zip, path.join(dir, "dist")]);
fs.writeFileSync(path.join(dir, "path.txt"), exe);
console.log(`ensure-electron: unpacked Electron ${version} from ${zip}`);
