import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const a = req("../lib/agents.js"), core = req("../lib/core.js");
const HOME = "/Users/me";

test("names become ids", () => {
  assert.equal(a.slugify("Weekly Reports!"), "weekly-reports");
  assert.equal(a.slugify("Café Bot"), "cafe-bot");
  assert.equal(a.slugify("???"), "");
  assert.ok(a.ID.test(a.slugify("x".repeat(80))));
});
test("folders stay inside home", () => {
  assert.equal(a.cleanFolder("", "scout", HOME), "scout");
  assert.equal(a.cleanFolder("~/work/notes", "x", HOME), "work/notes");
  assert.equal(a.cleanFolder(HOME + "/work", "x", HOME), "work");
  for (const bad of ["/etc", "~", "../x", "a/../b", "a;rm -rf", 'a"b', "a$b", "a`b`", ".ssh", "/Users/other/x", "a/ b ", "a\nb"]) assert.equal(a.cleanFolder(bad, "x", HOME), null, JSON.stringify(bad));
});
test("model and accent", () => {
  assert.equal(a.cleanModel(""), ""); assert.equal(a.cleanModel("anthropic/claude-sonnet-5-5"), "anthropic/claude-sonnet-5-5");
  assert.equal(a.cleanModel("x; rm -rf /"), null); assert.equal(a.cleanModel("--flag"), null);
  assert.equal(a.cleanAccent("#8B7BFF"), "#8b7bff"); assert.equal(a.cleanAccent("red; x"), null);
});
test("the script is valid bash and discovery reads it back", () => {
  const s = a.scriptText({ id: "scout", name: "Scout", tagline: "Research with sources", folder: "my work/scout", model: "anthropic/claude-sonnet-5-5", repo: "/Users/me/Projects/pi-desktop" });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agt-")), f = path.join(dir, "pi-scout");
  try {
    fs.writeFileSync(f, s); execFileSync("bash", ["-n", f]);
    const h = core.parseHarness(s, HOME);
    assert.equal(h.description, "Research with sources. Starts in ~/my work/scout.");
    assert.equal(h.cwd, HOME + "/my work/scout");
    assert.match(s, /exec pi --model 'anthropic\/claude-sonnet-5-5' "\$\{ext\[@\]\}" "\$@"/);
    const r = a.scriptText({ id: "scout", name: "Scout", tagline: "", folder: "scout", model: "" });
    execFileSync("bash", ["-n", "/dev/stdin"], { input: r }); assert.match(r, /exec pi "\$@"\n$/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("a hostile tagline can't add a line to the script", () => {
  const t = a.cleanTagline("nice\nrm -rf ~ #"); const s = a.scriptText({ id: "x", name: "X", tagline: t, folder: "x" });
  assert.equal(s.split("\n").filter((l) => /rm -rf/.test(l) && !l.startsWith("#")).length, 0);
});
test("character file and models", () => {
  const c = a.characterJson({ id: "scout", name: "Scout", tagline: "t", accent: "#8b7bff" });
  assert.deepEqual(c, a.characterJson({ id: "scout", name: "Scout", tagline: "t", accent: "#8b7bff" })); // same id, same face
  assert.equal(c.finish.say, "Scout complete.");
  assert.deepEqual(a.parseModels("provider     model   context\nclaude-code  claude-opus-5  1M  128K\nopencode-go  deepseek-v4.1-flash  1M")[1], { value: "opencode-go/deepseek-v4.1-flash", provider: "opencode-go", model: "deepseek-v4.1-flash" });
});
