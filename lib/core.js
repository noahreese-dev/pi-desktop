// Pure logic shared by main.js and the unit tests (tests/unit.test.mjs). No Electron, no file system, no clock:
// everything a function needs comes in as an argument, so each one can be tested in milliseconds.

// A harness script → what the app needs from it. `null` for a one-line alias of another harness (`exec "…/pi-x" "$@"`).
// The description is line 2 (`# pi-<id>: …`); the working folder is the first `cd` to "$HOME/…", "~/…" or an absolute
// path (quoted paths may contain spaces). A harness with no such `cd` runs in the home folder.
function parseHarness(src, home) {
  if (/^exec "[^"]*\/pi-[\w-]+" "\$@"\s*$/m.test(src) && src.length < 400) return null;
  const description = (src.split("\n")[1] || "").replace(/^#\s*pi-[\w-]+:\s*/, "").trim();
  const cd = src.match(/^\s*cd\s+"(\$HOME|~|)(\/[^"$`]*|)"/m) || src.match(/^\s*cd\s+(\$HOME|~|)(\/[^"\s|;&$`]*|)(?=[\s;&|]|$)/m);
  if (!cd || (!cd[1] && !cd[2])) return { description, cwd: home };
  return { description, cwd: ((cd[1] ? home : "") + cd[2]).replace(/\/+$/, "") || "/" };
}

// Pi keeps a folder of session files per working folder: /a/b → ~/.pi/agent/sessions/--a-b--
const sessionDirName = (cwd) => "--" + cwd.replace(/^\//, "").replace(/\//g, "-") + "--";

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  return "";
}

// Did a chat's last turn finish? Read from the end of the session file's lines:
// "cut" = stopped mid-tool, an unanswered message, or an error a retry would fix (process killed, connection dropped);
// "done" = a normal ending, a deliberate Stop, or an error a retry won't fix (billing, quota, context too long);
// "" = no messages at all.
const RETRYABLE = /exited with code|terminated|EPROTO|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|unable to connect|can'?t reach|no response|network|connection|fetch failed|socket/i;
const FINAL = /subscription|quota|billing|session limit|five_hour|ENOSPC|prompt is too long/i;
function lastTurnState(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    if (!ln.includes('"role"')) continue;
    let m; try { m = JSON.parse(ln).message; } catch { continue; }
    if (!m?.role || m.role === "system" || m.role === "custom") continue;
    if (m.role === "toolResult" || m.role === "user") return "cut";
    if (m.role === "assistant" && m.stopReason === "toolUse") return "cut";
    const err = String(m.errorMessage || "");
    if (m.role === "assistant" && m.stopReason === "error" && RETRYABLE.test(err) && !FINAL.test(err)) return "cut";
    return "done";
  }
  return "";
}

// A conversation as Markdown: user and assistant text in order, nothing else (no thinking, tool calls, results or images).
// Text goes through untouched so code fences stay intact; a tool-using turn is many assistant messages but one speaker.
function chatMarkdown(messages) {
  const out = []; let who = "";
  for (const m of messages || []) {
    if (m?.role !== "user" && m?.role !== "assistant") continue;
    const text = (typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n") : "").trim();
    if (!text) continue;
    if (m.role !== who) { who = m.role; out.push(m.role === "user" ? "## User" : "## Assistant"); }
    out.push(text);
  }
  return out.length ? out.join("\n\n") + "\n" : "";
}

// A task's prompt as the argument after `pi -p`. Pi reads an argument starting with "-" as an option and one starting
// with "@" as a file to attach, so those get a leading space (the model doesn't care; the meaning is kept).
const promptArg = (p) => (/^[-@]/.test(p) ? " " + p : p);

// A task saved from the page, type-checked (bad input would otherwise break the scheduler every 30 s).
// Returns the clean fields, or null if it isn't a usable task.
const KINDS = new Set(["daily", "weekdays", "weekly", "hourly"]);
function cleanTask(t) {
  if (!t || typeof t !== "object") return null;
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const name = str(t.name, 120).trim(), prompt = str(t.prompt, 20000).trim(), character = str(t.character, 60);
  if (!name || !prompt || !/^[\w-]+$/.test(character)) return null;
  const sc = t.schedule && typeof t.schedule === "object" ? t.schedule : {};
  const kind = KINDS.has(sc.kind) ? sc.kind : "daily";
  const schedule = kind === "hourly" ? { kind, every: Math.min(168, Math.max(1, Math.round(+sc.every) || 1)) }
    : { kind, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(sc.time) ? sc.time : "09:00", ...(kind === "weekly" ? { day: Math.min(6, Math.max(0, Math.round(+(sc.day ?? 1)) || 0)) } : {}) };
  const out = { name, prompt, character, schedule, enabled: t.enabled !== false };
  if (typeof t.id === "string" && /^[\w-]{1,40}$/.test(t.id)) out.id = t.id;
  if (Number.isFinite(+t.timeoutMin) && +t.timeoutMin > 0) out.timeoutMin = Math.min(240, Math.round(+t.timeoutMin));
  return out;
}

// tasks.json as edited outside the app → the new task list, or null to keep the current one (the app's own write,
// broken JSON mid-save, or not a list). Entries without a usable id are dropped: every task action finds tasks by id.
function tasksFromDisk(text, current) {
  if (text === current) return null;
  let next;
  try { next = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(next)) return null;
  return next.filter((t) => t && typeof t === "object" && typeof t.id === "string" && t.id);
}

// When a scheduled task runs next, strictly after `from` (ms). Local time.
// schedule: { kind: "daily" | "weekdays" | "weekly" | "hourly", time: "HH:MM", day: 0-6 (weekly, 0 = Sunday, default Monday), every: N (hourly) }
function nextRun(schedule, from) {
  const sc = schedule || {};
  if (sc.kind === "hourly") return from + Math.max(1, +sc.every || 1) * 3600e3;
  const [hh, mm] = String(sc.time || "09:00").split(":").map(Number);
  const d = new Date(from); d.setSeconds(0, 0); d.setHours(hh, mm);
  for (let i = 0; i < 8; i++) {
    const day = d.getDay();
    const okDay = sc.kind === "weekdays" ? day >= 1 && day <= 5 : sc.kind === "weekly" ? day === +(sc.day ?? 1) : true;
    if (okDay && d.getTime() > from) return d.getTime();
    d.setDate(d.getDate() + 1); d.setHours(hh, mm);
  }
  return from + 864e5;
}

// The page renders model output, so it is untrusted. It may send only the Pi RPC commands the UI uses:
// Pi's RPC also accepts `bash` (and more), which would turn any script in the page into a shell.
const PAGE_RPC = new Set(["prompt", "abort", "get_state", "get_messages", "get_commands", "get_session_stats",
  "get_available_models", "set_model", "get_available_thinking_levels", "set_thinking_level",
  "get_fork_messages", "fork", "set_session_name", "export_html", "compact"]);
const pageRpcAllowed = (cmd) => !!cmd && typeof cmd === "object" && PAGE_RPC.has(cmd.type);

// Where the page may ask Pi to export a chat: an .html file in ~/Downloads or /tmp. `p` must be absolute and resolved.
const exportPathAllowed = (p, home) => typeof p === "string" && p.endsWith(".html") && (p.startsWith(home + "/Downloads/") || /^\/(private\/)?tmp\//.test(p));

// The page may only touch files under your home folder or /tmp, and never credential stores, tokens, keys,
// shell history, browser data or mail. `real` must already be absolute with symlinks resolved (main.js does
// fs.realpathSync first).
const SECRET = new RegExp("(^|/)(" + [
  "\\.ssh", "\\.gnupg", "\\.aws", "\\.azure", "\\.kube", "\\.docker", "\\.netrc", "\\.git-credentials", "\\.npmrc", "\\.pypirc",
  "\\.config/(gh|gcloud|op|hub|doctl)", "\\.terraform\\.d", "\\.vault-token", "\\.pi/agent/(auth|models)\\.json", "auth\\.json",
  "\\.?credentials(\\.json)?", "\\.envrc$", "\\.(zshrc|zprofile|zshenv|bashrc|bash_profile|profile)$", "\\.claude\\.json$",
  "Library/Application Support/Claude", "\\.env(\\.|$)", "[^/]*\\.(pem|key|p12|pfx|keychain-db)$", "id_(rsa|dsa|ecdsa|ed25519)[^/]*$",
  "\\.[a-z]*_history$", "Library/(Keychains|Cookies|Mail|Messages|Safari|Application Support/(Google|BraveSoftware|Firefox|Microsoft Edge|com\\.apple\\.TCC))",
].join("|") + ")");
function allowedPath(real, home) {
  const inHome = real === home || real.startsWith(home + "/");
  const inTmp = /^\/(private\/)?tmp\//.test(real);
  return (inHome || inTmp) && !SECRET.test(real);
}

// Files macOS would run (not just show) when opened.
const LAUNCHES = /\.(app|command|terminal|tool|workflow|action|pkg|mpkg|dmg|scpt|scptd|applescript|osascript|jar|py|pyw|shortcut|webloc|inetloc|fileloc|afploc|ftploc|mailloc|atloc|prefpane|saver|qlgenerator|mdimporter|service|kext|mobileconfig)\/?$/i;

// A launch prefix (e.g. a sandbox or key-proxy wrapper from config.json) goes in front of the harness script.
// Anything that isn't a list of non-empty strings is ignored, so a bad config can't break every chat.
const launchCommand = (prefix, script, args) => {
  const ok = Array.isArray(prefix) && prefix.length > 0 && prefix.every((x) => typeof x === "string" && x);
  return ok ? [prefix[0], [...prefix.slice(1), script, ...args]] : [script, args];
};

// A character's `cli` list: command-line tools the agent relies on, as names or { name, use }. Only plain binary names
// survive (they end up in a shell lookup), duplicates are dropped, and the list is capped.
const cliList = (raw) => {
  const seen = new Set(), out = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    const name = typeof e === "string" ? e : e && e.name, use = typeof e === "object" && e ? e.use : "";
    if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(name) || seen.has(name)) continue;
    seen.add(name); out.push({ name, use: typeof use === "string" ? use.slice(0, 120) : "" });
  }
  return out.slice(0, 40);
};

// One-line description of a script from its first comment (after the #! line); "" when it has none or isn't text.
const cliDescFromScript = (text) => {
  const t = String(text || ""); if (t.includes("\0") || !t.startsWith("#!")) return "";
  for (const l of t.split("\n").slice(1, 12)) {
    const m = l.match(/^\s*(?:#|\/\/)\s?(.*\S)\s*$/); if (m && !/^(shellcheck|eslint|-\*-|vim?:|set |!\/)/i.test(m[1])) return m[1].slice(0, 120);
    if (l.trim() && !/^\s*(#|\/\/)/.test(l)) break;
  }
  return "";
};
// The Homebrew package a program belongs to, from the path its symlink points at.
const cliFormula = (realPath) => (String(realPath || "").match(/\/Cellar\/([^/]+)\//) || [])[1] || "";
// The "add a command-line tool" picker: programs { name, desc, source, path } matched by name or by what they do (every
// word must appear), minus what the agent already lists. With no query it browses the tools you installed yourself;
// system programs only show up when the name matches. Your own tools first, then Homebrew, then the rest.
const CLI_SOURCES = ["Yours", "Homebrew", "Other", "System"];
const cliName = (n) => typeof n === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/.test(n);
const cliRank = (entries, q, have = [], limit = 80) => {
  const skip = new Set(cliList(have).map((x) => x.name)), words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const seen = new Set(), out = [];
  for (const e of entries || []) {
    if (!e || !cliName(e.name) || skip.has(e.name) || seen.has(e.name)) continue;
    const hay = `${e.name} ${e.desc || ""}`.toLowerCase(), nm = e.name.toLowerCase();
    if (e.source === "System" ? !(words.length && words.every((w) => nm.includes(w))) : !words.every((w) => hay.includes(w))) continue;
    if (!words.length && !e.desc) continue; // browsing: only tools that can say what they do
    seen.add(e.name); out.push(e);
  }
  const rank = (e) => (words.length ? (e.name.toLowerCase().startsWith(words[0]) ? 0 : e.name.toLowerCase().includes(words[0]) ? 1 : 2) : 0);
  // Browsing shows a Homebrew package once (java, javac, jar… are one entry), the program named like the package or else the shortest name.
  const list = words.length ? out : out.filter((e) => !e.pkg || out.filter((o) => o.pkg === e.pkg).sort((a, b) => (b.name === e.pkg) - (a.name === e.pkg) || a.name.length - b.name.length)[0] === e);
  return list.sort((a, b) => CLI_SOURCES.indexOf(a.source) - CLI_SOURCES.indexOf(b.source) || rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, limit);
};
// Add or drop one tool on an agent's `cli` list; the result is the cleaned list to write back, or { error }.
const cliAdd = (raw, name, use) => {
  const cur = cliList(raw), one = cliList([{ name, use }])[0];
  if (!one) return { error: "That isn't a valid command name." };
  if (cur.some((x) => x.name === one.name)) return { error: `${one.name} is already on this agent's list.` };
  if (cur.length >= 40) return { error: "An agent can list up to 40 tools." };
  return { list: [...cur, one] };
};
const cliRemove = (raw, name) => cliList(raw).filter((x) => x.name !== name);

// The ask-user-question extension sends a "pick all that apply" question as a plain text prompt: the question, numbered
// options, then "Enter the numbers of all that apply…". Pull the question and options back out so the app can show them
// as inline toggles; null for anything else.
const parseMultiAsk = (title) => {
  const lines = String(title || "").split("\n"), stop = lines.findIndex((l) => /^\s*Enter the numbers of all that apply/i.test(l));
  if (stop < 0) return null;
  const head = [], options = [];
  for (const l of lines.slice(0, stop)) {
    const m = l.match(/^\s*(\d+)\.\s+(.*\S)\s*$/);
    if (m) options.push(`${m[1]}. ${m[2]}`);
    else if (l.trim() && options.length) options[options.length - 1] += " " + l.trim();
    else if (l.trim() && !options.length) head.push(l.trim());
  }
  return options.length >= 2 ? { question: head.join(" "), options } : null;
};
// The text that answers it: the chosen numbers, then anything typed in your own words.
const multiAskAnswer = (chosen, custom) => {
  const nums = [...new Set(chosen)].sort((a, b) => a - b).join(","), own = String(custom || "").trim();
  return nums && own ? `${nums}; ${own}` : nums || own;
};

module.exports = { parseMultiAsk, multiAskAnswer, cliRank, cliDescFromScript, cliFormula, cliAdd, cliRemove, cliList, launchCommand, promptArg, cleanTask, tasksFromDisk, LAUNCHES, parseHarness, sessionDirName, textOf, chatMarkdown, lastTurnState, nextRun, allowedPath, SECRET, pageRpcAllowed, exportPathAllowed };
