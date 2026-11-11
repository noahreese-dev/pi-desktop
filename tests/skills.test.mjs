import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const s = createRequire(import.meta.url)("../lib/skills.js");

test("frontmatter: plain, quoted and folded", () => {
  assert.deepEqual(s.parseSkill("---\nname: a\ndescription: Does a thing.\n---\nbody").description, "Does a thing.");
  assert.equal(s.parseSkill('---\nname: "b"\ndescription: "Quoted"\n---\n').name, "b");
  const f = s.parseSkill("---\nname: c\ndescription: >\n  First line\n  second line.\nmetadata:\n  version: 1\n---\nx");
  assert.equal(f.description, "First line second line.");
});
test("toggle keeps other settings and entries", () => {
  const home = "/Users/me", dir = "/Users/me/.agents/skills/x";
  const off = s.applyToggle({ theme: "light", skills: ["~/more"] }, dir, home, false);
  assert.deepEqual(off, { theme: "light", skills: ["~/more", "-~/.agents/skills/x"] });
  assert.equal(s.isOff(off, dir, home), true);
  const on = s.applyToggle(off, dir, home, true);
  assert.deepEqual(on, { theme: "light", skills: ["~/more"] });
  assert.deepEqual(s.applyToggle({ skills: ["-~/.agents/skills/x"] }, dir, home, true), {});
});
test("sources", () => {
  assert.deepEqual(s.sourceOf("/h/.pi/agent/npm/node_modules/@a/pkg/skills/x", "/h"), { source: "package", pkg: "@a/pkg" });
  assert.equal(s.sourceOf("/h/.agents/skills/x", "/h").source, "user");
});
test("remote listing parse", () => {
  const out = "@@HOME /home/u\n@@SKILL /home/u/.agents/skills/x/SKILL.md 1700000000\n---\nname: x\ndescription: d\n---\nhi\n@@SKILL ../evil 1\nnope\n@@SETTINGS\n{\"skills\":[\"-~/.agents/skills/x\"]}";
  const r = s.parseListing(out);
  assert.equal(r.skills.length, 1); assert.equal(r.skills[0].name, "x"); assert.equal(s.isOff(r.settings, r.skills[0].dir, r.home), true);
});
