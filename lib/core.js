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
  "get_fork_messages", "fork", "set_session_name", "export_html"]);
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

module.exports = { promptArg, cleanTask, LAUNCHES, parseHarness, sessionDirName, textOf, chatMarkdown, lastTurnState, nextRun, allowedPath, SECRET, pageRpcAllowed, exportPathAllowed };
