import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const r = createRequire(import.meta.url)("../lib/remote.js");

test("addresses are validated", () => {
  assert.equal(r.cleanTarget("  ssh me@host.com "), "me@host.com");
  assert.equal(r.cleanTarget("myserver"), "myserver");
  for (const bad of ["-oProxyCommand=evil", "a b", "me@host;rm -rf", "$(x)", "", "a`b`", "../x"]) assert.equal(r.cleanTarget(bad), null, bad);
});
test("folders are validated and quoted", () => {
  assert.equal(r.cleanFolder("~/proj"), "~/proj");
  assert.equal(r.cleanFolder("a;b"), null);
  assert.equal(r.cleanFolder("../x"), null);
});
test("persona with quotes survives quoting", () => {
  const [, args] = r.piCommand({ target: "h", folder: "~/p" }, ["--mode", "rpc", "--append-system-prompt", `it's "fine" $(x)`], "/tmp");
  assert.equal(args.at(-2), "h"); assert.equal(args.at(-3), "--");
  assert.ok(args.at(-1).includes(`'\\''`));
});
test("errors become plain sentences", () => {
  assert.match(r.explain({ code: 255, stderr: "ssh: Could not resolve hostname x" }, "x").problem, /find that server/);
  const d = r.explain({ code: 255, stderr: "Permission denied (publickey)" }, "me@x");
  assert.equal(d.fix, "key"); assert.equal(d.reached, true);
  assert.equal(r.explain({ code: 0, stdout: "PIDESK_OK\nPIDESK_PI=1.2.0\nPIDESK_DIR_OK" }, "x").ok, true);
  assert.equal(r.explain({ code: 0, stdout: "PIDESK_OK\nPIDESK_NOPI\nPIDESK_NPM" }, "x").fix, "install");
});
test("ssh config hosts", () => assert.deepEqual(r.sshConfigHosts("Host a b\nHost *\nHost c?\n"), ["a", "b"]));

test("sshOptions: control sockets need a private folder (no shared /tmp default)", () => {
  assert.throws(() => r.sshOptions());
  assert.ok(r.sshOptions("/x/.ssh/pidesk").includes("ControlPath=/x/.ssh/pidesk/pidesk-%C"));
});
