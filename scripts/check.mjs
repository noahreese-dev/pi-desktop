// npm run check: syntax-checks every JS file and shell script in the repo (with the unit tests, everything a CI job needs: no npm install).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skip = new Set(["node_modules", ".git", "sounds"]);
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(ROOT);
const rel = (p) => path.relative(ROOT, p);
let bad = 0;
const run = (cmd, args, f) => { try { execFileSync(cmd, args, { stdio: "pipe" }); } catch (e) { bad++; console.log(`✗ ${rel(f)}\n${String(e.stderr || e.message).trim()}\n`); } };
const js = files.filter((f) => /\.(m?js)$/.test(f));
const sh = files.filter((f) => /\.sh$/.test(f) || (/\/(bin|packs\/[^/]+)\/pi-[\w-]+$/.test(f) && fs.readFileSync(f, "utf8").startsWith("#!/usr/bin/env bash")));
const json = files.filter((f) => f.endsWith(".json") && !f.endsWith("package-lock.json"));
for (const f of js) run(process.execPath, ["--check", f], f);
for (const f of sh) run(/^#!.*\bzsh\b/.test(fs.readFileSync(f, "utf8")) ? "zsh" : "bash", ["-n", f], f);
for (const f of json) { try { JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { bad++; console.log(`✗ ${rel(f)}: ${e.message}`); } }
console.log(`${bad ? "✗" : "✓"} ${js.length} JS, ${sh.length} shell, ${json.length} JSON files checked${bad ? `, ${bad} failed` : ""}`);
process.exit(bad ? 1 : 0);
