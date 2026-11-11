// Remote servers: pure helpers (no Electron, no fs). Everything the page can type goes through validation here
// before it ever reaches an ssh command line.

const TARGET = /^(?!-)[A-Za-z0-9._-]+@?[A-Za-z0-9._:-]*$/;   // "myserver", "me@10.0.0.5", "me@host.example.com"
const FOLDER = /^[\w~./ @+-]{0,200}$/;

const cleanTarget = (t) => {
  t = String(t ?? "").trim().replace(/^ssh\s+/, "").replace(/^ssh:\/\//, "").replace(/\/$/, "");
  return t.length <= 255 && TARGET.test(t) && !t.includes("..") ? t : null;
};
const cleanFolder = (f) => {
  f = String(f ?? "").trim();
  return FOLDER.test(f) && !f.includes("..") ? f : null;
};
// POSIX single-quote a value for the remote shell.
const q = (s) => "'" + String(s).replace(/'/g, `'\\''`) + "'";
// "~" and "~/x" must stay unquoted at the start so the remote shell expands them.
const folderArg = (f) => (!f || f === "~" ? '"$HOME"' : f.startsWith("~/") ? `"$HOME"/${q(f.slice(2))}` : q(f));

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "server";
const idFor = (target) => "srv-" + slug(target.split("@").pop());

// Common ssh options. BatchMode: never wait for a password prompt that nobody can see.
function sshOptions(controlDir) {
  if (!controlDir) throw new Error("sshOptions needs a private control folder");
  return ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3",
    "-o", "ControlMaster=auto", "-o", `ControlPath=${controlDir}/pidesk-%C`, "-o", "ControlPersist=10m"];
}
// A login shell with the usual places `pi` gets installed, then the command.
const wrap = (inner) => `bash -lc ${q('export PATH="$PATH:$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin"; ' + inner)}`;

// ssh argv that runs Pi in RPC mode (or any pi args) on the server, in the chosen folder.
// Where Pi keeps chats for the folder it starts in: ~/.pi/agent/sessions/--<path-with-dashes>--
const SESS = `SD="$HOME/.pi/agent/sessions/--$(pwd | sed 's#^/##; s#/#-#g')--"`;
function piCommand(remote, piArgs, controlDir, sessionName) {
  const args = piArgs.map(q).join(" ");
  const resume = sessionName && /^[\w.-]+\.jsonl$/.test(sessionName) ? ` --session "$SD"/${q(sessionName)}` : "";
  const inner = `cd ${folderArg(remote.folder)} 2>/dev/null || cd "$HOME"; ${SESS}; exec ${remote.script ? q(remote.script) : "pi"} ${args}${resume}`;
  return ["ssh", [...sshOptions(controlDir), "--", remote.target, wrap(inner)]];
}

// Connection test: one round-trip that proves the address, sign-in and Pi all work.
function testCommand(remote, controlDir) {
  const inner = `echo PIDESK_OK; if command -v pi >/dev/null 2>&1; then echo "PIDESK_PI=$(pi --version 2>&1 | tail -1)"; else echo PIDESK_NOPI; fi; if command -v npm >/dev/null 2>&1; then echo PIDESK_NPM; fi; cd ${folderArg(remote.folder)} 2>/dev/null && echo PIDESK_DIR_OK || echo PIDESK_NODIR`;
  return ["ssh", [...sshOptions(controlDir), "--", remote.target, wrap(inner)]];
}
// Streams this folder's chat files (newer than `sinceSec`) as a tar archive on stdout.
function pullCommand(remote, sinceSec, controlDir) {
  const inner = `cd ${folderArg(remote.folder)} 2>/dev/null || cd "$HOME"; ${SESS}; [ -d "$SD" ] || exit 0; cd "$SD" && find . -maxdepth 1 -name '*.jsonl' -newermt @${Math.max(0, Math.floor(+sinceSec || 0))} -print0 | tar --null -T - -cf -`;
  return ["ssh", [...sshOptions(controlDir), "--", remote.target, wrap(inner)]];
}
// Lists pi-* harness scripts on the server (~/bin, ~/.local/bin): path + first lines of each.
function discoverCommand(remote, controlDir) {
  const inner = `for f in "$HOME"/bin/pi-* "$HOME"/.local/bin/pi-*; do [ -f "$f" ] && [ -x "$f" ] && { echo "@@FILE $f"; head -c 3000 "$f"; echo; }; done; true`;
  return ["ssh", [...sshOptions(controlDir), "--", remote.target, wrap(inner)]];
}
// Output of discoverCommand → [{ name, script, description, folder }]. `parse` is core.parseHarness.
function parseDiscovered(out, parse) {
  const found = [], seen = new Set();
  for (const chunk of String(out).split("@@FILE ").slice(1)) {
    const nl = chunk.indexOf("\n"), file = chunk.slice(0, nl).trim(), src = chunk.slice(nl + 1);
    const base = file.split("/").pop(), name = base.slice(3);
    if (!/^pi-[\w-]+$/.test(base) || base === "pi-ls" || seen.has(name) || !/^[\w./-]+$/.test(file)) continue;
    const h = parse(src, "~");
    if (!h) continue; // one-line alias
    seen.add(name);
    found.push({ name, script: file, description: h.description.slice(0, 120), folder: h.cwd });
  }
  return found.slice(0, 40);
}
// Any command on the server, in the same login shell setup as everything else (caller supplies fixed text only).
function shellCommand(remote, inner, controlDir) {
  return ["ssh", [...sshOptions(controlDir), "--", remote.target, wrap(inner)]];
}
function installCommand(remote, controlDir) {
  return ["ssh", [...sshOptions(controlDir), "--", remote.target, wrap("npm install -g @earendil-works/pi-coding-agent 2>&1 | tail -5")]];
}

// Turns ssh's result into one plain sentence and what to do about it. `stage` says how far we got.
function explain({ code, stdout = "", stderr = "" }, target) {
  const out = String(stdout), err = String(stderr);
  if (/PIDESK_OK/.test(out)) {
    const ver = (out.match(/PIDESK_PI=(.*)/) || [])[1]?.trim();
    const hasPi = /PIDESK_PI=/.test(out);
    return {
      reached: true, signedIn: true, pi: hasPi, version: hasPi ? ver : null, canInstall: !hasPi && /PIDESK_NPM/.test(out), folderOk: /PIDESK_DIR_OK/.test(out),
      ok: hasPi,
      problem: hasPi ? null : "Pi isn't installed on this server yet.",
      fix: hasPi ? null : /PIDESK_NPM/.test(out) ? "install" : "Install Node.js on the server, then try again.",
    };
  }
  const r = { reached: false, signedIn: false, pi: false, ok: false };
  if (/Could not resolve|Name or service not known|nodename nor servname/i.test(err)) return { ...r, problem: "We couldn't find that server. Check the address for typos.", fix: null };
  if (/timed out|No route to host|Network is unreachable|Connection refused|Connection closed|Connection reset/i.test(err)) return { ...r, problem: "The server didn't answer. It may be off, offline, or blocking connections.", fix: null };
  if (/Permission denied|publickey|Too many authentication/i.test(err)) return { ...r, reached: true, problem: "The server was reached, but it didn't accept this Mac yet.", fix: "key", keyCommand: `ssh-copy-id ${target}` };
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(err)) return { ...r, reached: true, problem: "This server's identity changed since last time. That can be harmless (reinstalled server) or a warning sign.", fix: "hostkey" };
  return { ...r, problem: "Something went wrong while connecting.", detail: err.trim().split("\n").slice(-2).join(" ").slice(0, 200) };
}

// Host names from ~/.ssh/config (so people can click instead of type). No wildcards.
function sshConfigHosts(text) {
  const out = new Set();
  for (const line of String(text).split("\n")) {
    const m = line.match(/^\s*Host\s+(.+?)\s*$/i);
    if (m) for (const h of m[1].split(/\s+/)) if (!/[*?!]/.test(h) && cleanTarget(h)) out.add(h);
  }
  return [...out].slice(0, 20);
}

module.exports = { folderArg, cleanTarget, cleanFolder, q, idFor, slug, sshOptions, piCommand, shellCommand, pullCommand, discoverCommand, parseDiscovered, testCommand, installCommand, explain, sshConfigHosts };
