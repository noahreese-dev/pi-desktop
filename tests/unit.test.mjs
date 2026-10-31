// Offline unit tests for lib/core.js: no Electron, no Pi, no model, no network. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../lib/core.js");
const HOME = "/Users/sam";

test("parseHarness: description from line 2, cwd from the cd line", () => {
  const h = core.parseHarness('#!/usr/bin/env bash\n# pi-research: Research with sources. Starts in ~/research.\ncd "$HOME/research" || exit 1\nexec pi "$@"\n', HOME);
  assert.deepEqual(h, { description: "Research with sources. Starts in ~/research.", cwd: "/Users/sam/research" });
});

test("parseHarness: quoted cd paths may contain spaces; ~ works like $HOME", () => {
  assert.equal(core.parseHarness('#!/bin/bash\n# pi-x: X\ncd "$HOME/My Projects/site"\n', HOME).cwd, "/Users/sam/My Projects/site");
  assert.equal(core.parseHarness("#!/bin/bash\n# pi-x: X\n  cd ~/notes && exec pi\n", HOME).cwd, "/Users/sam/notes");
});

test("parseHarness: absolute paths; variables and relative paths fall back to home", () => {
  assert.equal(core.parseHarness('#!/bin/bash\n# pi-x: X\ncd "/Volumes/Work/my site" || exit 1\n', HOME).cwd, "/Volumes/Work/my site");
  assert.equal(core.parseHarness("#!/bin/bash\n# pi-x: X\ncd /srv/app && exec pi\n", HOME).cwd, "/srv/app");
  assert.equal(core.parseHarness('#!/bin/bash\n# pi-x: X\ncd "$HOME"\n', HOME).cwd, HOME);
  assert.equal(core.parseHarness('#!/bin/bash\n# pi-x: X\ncd "$WORK/site"\n', HOME).cwd, HOME);
  assert.equal(core.parseHarness("#!/bin/bash\n# pi-x: X\ncd projects\n", HOME).cwd, HOME);
});

test("parseHarness: no cd → home folder; aliases are not characters", () => {
  assert.equal(core.parseHarness("#!/bin/bash\n# pi-x: X\nexec pi \"$@\"\n", HOME).cwd, HOME);
  assert.equal(core.parseHarness('#!/bin/bash\nexec "$HOME/bin/pi-research" "$@"\n', HOME), null);
});

test("sessionDirName matches Pi's session folder naming", () => {
  assert.equal(core.sessionDirName("/Users/sam/research"), "--Users-sam-research--");
});

test("textOf joins text blocks and ignores the rest", () => {
  assert.equal(core.textOf("hi"), "hi");
  assert.equal(core.textOf([{ type: "text", text: "a" }, { type: "image", data: "x" }, { type: "text", text: "b" }]), "a b");
  assert.equal(core.textOf(undefined), "");
});

const line = (message) => JSON.stringify({ type: "message", message });
test("lastTurnState: a finished reply is done", () => {
  assert.equal(core.lastTurnState([line({ role: "user", content: "q" }), line({ role: "assistant", stopReason: "stop" })]), "done");
});
test("lastTurnState: an unanswered message or a turn stopped mid-tool is cut", () => {
  assert.equal(core.lastTurnState([line({ role: "user", content: "q" })]), "cut");
  assert.equal(core.lastTurnState([line({ role: "assistant", stopReason: "toolUse" })]), "cut");
  assert.equal(core.lastTurnState([line({ role: "assistant", stopReason: "toolUse" }), line({ role: "toolResult" })]), "cut");
});
test("lastTurnState: retryable errors are cut, billing/quota errors are not", () => {
  assert.equal(core.lastTurnState([line({ role: "assistant", stopReason: "error", errorMessage: "fetch failed: ECONNRESET" })]), "cut");
  assert.equal(core.lastTurnState([line({ role: "assistant", stopReason: "error", errorMessage: "network error: quota exceeded" })]), "done");
  assert.equal(core.lastTurnState([line({ role: "assistant", stopReason: "aborted" })]), "done");
});
test("lastTurnState: skips system/custom entries and junk lines; empty file → ''", () => {
  assert.equal(core.lastTurnState([line({ role: "assistant", stopReason: "stop" }), line({ role: "custom" }), "{not json \"role\"", ""]), "done");
  assert.equal(core.lastTurnState([]), "");
});

const at = (s) => new Date(s).getTime(); // local time
test("nextRun daily: later today, else tomorrow", () => {
  assert.equal(core.nextRun({ kind: "daily", time: "09:00" }, at("2026-11-02T08:00")), at("2026-11-02T09:00"));
  assert.equal(core.nextRun({ kind: "daily", time: "09:00" }, at("2026-11-02T09:00")), at("2026-11-03T09:00"));
});
test("nextRun weekdays skips the weekend", () => {
  assert.equal(core.nextRun({ kind: "weekdays", time: "09:00" }, at("2026-11-06T10:00")), at("2026-11-09T09:00")); // Fri → Mon
});
test("nextRun weekly: Sunday (day 0) runs on Sunday; no day means Monday", () => {
  assert.equal(new Date(core.nextRun({ kind: "weekly", time: "10:00", day: 0 }, at("2026-11-02T08:00"))).getDay(), 0);
  assert.equal(new Date(core.nextRun({ kind: "weekly", time: "10:00" }, at("2026-11-03T08:00"))).getDay(), 1);
});
test("nextRun hourly", () => {
  assert.equal(core.nextRun({ kind: "hourly", every: 3 }, 1000), 1000 + 3 * 3600e3);
  assert.equal(core.nextRun({ kind: "hourly" }, 1000), 1000 + 3600e3);
});

test("allowedPath: home and /tmp yes; elsewhere and credential stores no", () => {
  assert.ok(core.allowedPath("/Users/sam/notes/a.md", HOME));
  assert.ok(core.allowedPath("/private/tmp/x.png", HOME));
  assert.ok(!core.allowedPath("/etc/passwd", HOME));
  assert.ok(!core.allowedPath("/Users/samuel/secret.txt", HOME), "a sibling folder that merely starts with the home path");
  for (const p of [".ssh/id_ed25519", ".aws/credentials", "project/.env", "project/.env.local", ".pi/agent/auth.json", "Library/Keychains/login.keychain-db"])
    assert.ok(!core.allowedPath(`${HOME}/${p}`, HOME), p);
});

test("pageRpcAllowed: the UI's commands yes; bash and unknown types no", () => {
  for (const type of ["prompt", "abort", "get_state", "fork", "export_html", "set_model"]) assert.ok(core.pageRpcAllowed({ type }), type);
  for (const cmd of [{ type: "bash", command: "id" }, { type: "new_session" }, null, "prompt", {}]) assert.ok(!core.pageRpcAllowed(cmd), JSON.stringify(cmd));
});

test("exportPathAllowed: .html in Downloads or /tmp only", () => {
  assert.ok(core.exportPathAllowed(`${HOME}/Downloads/Scout - chat.html`, HOME));
  assert.ok(core.exportPathAllowed("/tmp/x.html", HOME));
  assert.ok(!core.exportPathAllowed(`${HOME}/Downloads/x.sh`, HOME));
  assert.ok(!core.exportPathAllowed(`${HOME}/.zshrc.html`, HOME));
  assert.ok(!core.exportPathAllowed(`${HOME}/Library/LaunchAgents/x.html`, HOME));
});

test("LAUNCHES: things macOS would run are recognised; documents are not", () => {
  for (const f of ["/a/Tool.app", "/a/Tool.app/", "/a/run.command", "/a/x.pkg", "/a/x.workflow", "/a/x.scpt"]) assert.ok(core.LAUNCHES.test(f), f);
  for (const f of ["/a/notes.md", "/a/report.pdf", "/a/site.html", "/a/app.js"]) assert.ok(!core.LAUNCHES.test(f), f);
});

test("allowedPath blocks tokens, keys, history and browser data anywhere under home", () => {
  for (const p of [".config/gh/hosts.yml", ".git-credentials", ".npmrc", ".zsh_history", "work/server.pem", "keys/id_ed25519", "Library/Cookies/x", "Library/Application Support/Google/Chrome/Default/Login Data"])
    assert.ok(!core.allowedPath(`${HOME}/${p}`, HOME), p);
  for (const p of ["keynote.md", "notes/.envrc-ideas.md", "Pictures/me.png"]) assert.ok(core.allowedPath(`${HOME}/${p}`, HOME), p);
});

test("chatMarkdown: user and assistant text in order, code fences intact", () => {
  const fence = "```js\nconst a = 1;\n\n## not a heading\n```";
  const md = core.chatMarkdown([
    { role: "user", content: "Show me code" },
    { role: "assistant", content: [{ type: "text", text: "Here:\n\n" + fence }] },
    { role: "user", content: [{ type: "text", text: "Thanks" }] },
  ]);
  assert.equal(md, "## User\n\nShow me code\n\n## Assistant\n\nHere:\n\n" + fence + "\n\n## User\n\nThanks\n");
});

test("chatMarkdown: thinking, tool calls, tool results, images and other roles are left out", () => {
  const md = core.chatMarkdown([
    { role: "user", content: [{ type: "image", data: "x", mimeType: "image/png" }, { type: "text", text: "Look" }] },
    { role: "assistant", content: [{ type: "thinking", thinking: "secret plan" }, { type: "text", text: "Checking." }, { type: "toolCall", id: "1", name: "bash", arguments: { command: "ls" } }] },
    { role: "toolResult", toolCallId: "1", content: [{ type: "text", text: "file.txt" }] },
    { role: "assistant", content: [{ type: "thinking", thinking: "more" }, { type: "toolCall", id: "2", name: "read", arguments: {} }] },
    { role: "assistant", content: [{ type: "text", text: "Done." }] },
    { role: "custom", content: "hidden" }, { role: "compactionSummary", summary: "old" },
  ]);
  assert.equal(md, "## User\n\nLook\n\n## Assistant\n\nChecking.\n\nDone.\n");
  assert.ok(!/secret|bash|file\.txt|hidden|old/.test(md));
});

test("chatMarkdown: nothing to say gives an empty string", () => {
  assert.equal(core.chatMarkdown([]), "");
  assert.equal(core.chatMarkdown(null), "");
  assert.equal(core.chatMarkdown([{ role: "assistant", content: [{ type: "toolCall", id: "1", name: "x", arguments: {} }] }]), "");
});
