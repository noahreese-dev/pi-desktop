import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const ins = createRequire(import.meta.url)("../lib/instructions.js");

test("winner order matches Pi", () => {
  assert.deepEqual(ins.pickWinner(["CLAUDE.md", "AGENTS.md", "x"]), { winner: "AGENTS.md", shadowed: ["CLAUDE.md"] });
  assert.deepEqual(ins.pickWinner(["CLAUDE.md"]), { winner: "CLAUDE.md", shadowed: [] });
  assert.equal(ins.pickWinner(["AGENTS.md", "AGENTS.override.md"]).winner, "AGENTS.override.md");
  assert.equal(ins.pickWinner([]).winner, null);
});
test("the server listing script round-trips through the parser", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "instr-"));
  try {
    const home = path.join(root, "home"), proj = path.join(home, "TV OS", "tv home");
    fs.mkdirSync(path.join(home, ".pi/agent"), { recursive: true }); fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(home, ".pi/agent/AGENTS.md"), "global rules\n");
    fs.writeFileSync(path.join(proj, "AGENTS.md"), "folder rules\n\nno trailing newline");
    fs.writeFileSync(path.join(proj, "CLAUDE.md"), "ignored");
    fs.writeFileSync(path.join(home, "CLAUDE.md"), "parent rules\n");
    const out = execFileSync("bash", ["-c", ins.listScript(`"$HOME"/'TV OS'/'tv home'`)], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    const s = ins.shape(ins.parseListing(out));
    assert.equal(s.folder.content, "folder rules\n\nno trailing newline");
    assert.deepEqual(s.folder.shadowed, ["CLAUDE.md"]);
    assert.equal(s.global.content, "global rules\n");
    assert.equal(s.parents.length, 1); assert.equal(s.parents[0].content, "parent rules\n");
    // folder that doesn't exist falls back to home, like the harness does
    const s2 = ins.shape(ins.parseListing(execFileSync("bash", ["-c", ins.listScript(`'/nope/missing'`)], { env: { ...process.env, HOME: home }, encoding: "utf8" })));
    assert.equal(s2.dir, home); assert.equal(s2.folder.exists, true); // home has CLAUDE.md
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("empty folder offers AGENTS.md as the place for a new file", () => {
  const s = ins.shape({ home: "/h", dir: "/h/w", files: [] });
  assert.equal(s.folder.exists, false); assert.equal(s.folder.path, "/h/w/AGENTS.md"); assert.equal(s.global.path, "/h/.pi/agent/AGENTS.md");
});
