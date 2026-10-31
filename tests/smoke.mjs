// End-to-end smoke test for Pi Desktop over CDP. Run against an isolated copy (its own threads/tasks/config):
//   PIDESK_PROFILE=/tmp/pidesk-test ./node_modules/.bin/electron . --remote-debugging-port=9333 &
//   node tests/smoke.mjs [character=base] [other=research]
// Needs at least two harnesses (e.g. examples/bin); real replies come from your Pi's default model, so it costs a few
// small requests. Uses a throwaway fixture chat in that character's session folder; it is deleted (to Trash) by the test.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const CHAR = process.argv[2] || "base";
const OTHER = process.argv[3] || "research";
const HOME = os.homedir();
const SHOTS = process.env.SHOTS || "/tmp/pidesk-shots";
fs.mkdirSync(SHOTS, { recursive: true });

// ---------- CDP ----------
const pages = await (await fetch(`http://127.0.0.1:${process.env.PIDESK_CDP_PORT || 9333}/json`)).json();
const page = pages.find((p) => p.type === "page" && p.url.includes("index.html"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) pend[d.id](d); };
await new Promise((r) => (ws.onopen = r));
const call = (method, params = {}) => new Promise((res) => { const id = ++seq; pend[id] = res; ws.send(JSON.stringify({ id, method, params })); });
async function ev(expr) {
  const r = await call("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval failed");
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Screenshots never resolve while the window is hidden (nothing is painted), so cap them and move on.
const shot = async (name) => {
  const r = await Promise.race([call("Page.captureScreenshot", { format: "png" }), sleep(5000).then(() => null)]);
  if (r?.result?.data) fs.writeFileSync(path.join(SHOTS, name + ".png"), Buffer.from(r.result.data, "base64"));
  else console.log(`  - screenshot ${name} skipped (window hidden)`);
};
async function until(expr, ms = 90000) { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`return !!(${expr})`)) return true; await sleep(700); } return false; }

// A real press/release at an element's centre (goes through Chromium's input path like a mouse would).
async function mouse(selector, { hold = 40 } = {}) {
  await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center", behavior: "instant" }); return 1`);
  await sleep(250); // let layout and any smooth scrolling settle before measuring
  const rect = await ev(`const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 })`);
  const { x, y } = JSON.parse(rect);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await sleep(hold);
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(150);
}

let pass = 0, fail = 0;
const ok = (cond, name, extra = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); } };

// ---------- fixture chat ----------
const cwd = await ev(`return S.byId[${JSON.stringify(CHAR)}].cwd`);
const dir = path.join(HOME, ".pi/agent/sessions", "--" + cwd.replace(/^\//, "").replace(/\//g, "-") + "--");
fs.mkdirSync(dir, { recursive: true });
const sid = randomUUID(), now = Date.now(), iso = new Date(now).toISOString();
const fixture = path.join(dir, `${iso.replace(/[:.]/g, "-")}_${sid}.jsonl`);
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
fs.writeFileSync(fixture, [
  { type: "session", version: 3, id: sid, timestamp: iso, cwd },
  { type: "message", id: "f0000001", parentId: null, timestamp: iso, message: { role: "user", content: `What is a transformer? (smoke fixture ${sid.slice(0, 8)})`, timestamp: now } },
  { type: "message", id: "f0000002", parentId: "f0000001", timestamp: iso, message: { role: "assistant", content: [{ type: "text", text: "A transformer maps tokens to tokens with attention.\n\n```python\ndef attend(q, k, v):\n    return softmax(q @ k.T) @ v\n```" }], api: "openai-completions", provider: "example", model: "example-model", usage, stopReason: "stop", timestamp: now } },
].map((x) => JSON.stringify(x)).join("\n") + "\n");
const old = (Date.now() - 3 * 3600e3) / 1000;
fs.utimesSync(fixture, old, old); // not "recently active elsewhere"
const F = JSON.stringify(fixture);
const created = [];

try {
  console.log("Boot");
  ok(await ev(`return S.chars.length >= 2 && !!S.byId[${JSON.stringify(CHAR)}] && !!S.byId[${JSON.stringify(OTHER)}]`), "characters loaded");
  await ev(`await selectCharacter(${JSON.stringify(CHAR)}); await new Promise(r => setTimeout(r, 1500)); await refreshThreads(); return 1`);
  ok(await ev(`return P().started === false`), "selecting a character does not spawn a Pi process");
  await ev(`$("#input").focus(); return 1`);
  await sleep(1500);
  ok(await ev(`return P().started === false`), "…and automatic focus of the message box (as when a window opens) does not either");
  await ev(`$("#composer").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return 1`);
  ok(await until(`P().started && P().model`, 60000), "clicking the message box starts it, with a model");
  ok(await ev(`return TH().some(t => t.file === ${F})`), "fixture chat listed");

  console.log("Open + render");
  await ev(`await openSession(${F}); return 1`);
  ok(await ev(`return P().sessionFile === ${F} && P().msgs.length === 2`), "fixture opened (2 messages)");
  ok(await ev(`return !!document.querySelector("#thread pre code.hljs")`), "code block syntax-highlighted");
  ok(await ev(`return document.querySelectorAll("#thread .msg-acts .act-btn").length >= 3`), "copy/edit/regenerate actions present");
  await shot("01-chat");

  console.log("Pin / rename / search / archive");
  await ev(`const t = TH().find(t => t.file === ${F}); await desk.threadMeta(t.file, { pinned: true }); await refreshThreads(); return 1`);
  ok(await ev(`return [...document.querySelectorAll("#threads .th-group")][0]?.textContent === "Pinned"`), "pinned section at top");
  await ev(`const t = TH().find(t => t.file === ${F}); await renameThread(t, "Transformers 101"); return 1`);
  ok(await ev(`return TH().find(t => t.file === ${F})?.title === "Transformers 101" && $("#crumb").textContent.includes("Transformers 101")`), "rename updates list + header");
  await ev(`const t = TH().find(t => t.file === ${F}); threadMenu(t, document.querySelector("#threads .th.active .th-more")); return 1`);
  ok(await ev(`return [...document.querySelectorAll("#popover .mi .k")].map(x => x.textContent).join(",") === "Unpin,Rename,Archive,Export as HTML,Delete"`), "thread ⋯ menu items");
  await shot("02-thread-menu");
  await ev(`$("#popover").hidden = true; S.search = "smoke fixture ${sid.slice(0, 8)}"; renderThreads(); return 1`);
  ok(await ev(`return document.querySelectorAll("#threads .th").length === 1`), "search matches message text");
  await ev(`S.search = "zzzz-no-match"; renderThreads(); return 1`);
  ok(await ev(`return document.querySelector("#threads .th-empty")?.textContent === "No matching chats"`), "search empty state");
  await ev(`S.search = ""; renderThreads(); const t = TH().find(t => t.file === ${F}); await archiveThread(t, true); return 1`);
  ok(await ev(`return !TH().find(t => t.file === ${F} && !t.archived) && /Archived \\(\\d+\\)/.test($("#threads").textContent) && P().sessionFile !== ${F}`), "archive hides chat, leaves it, shows Archived (n)");
  await ev(`const t = TH().find(t => t.file === ${F}); await archiveThread(t, false); return 1`);
  ok(await ev(`return TH().some(t => t.file === ${F} && !t.archived)`), "unarchive restores");

  console.log("Edit + regenerate (real model call)");
  await ev(`await openSession(${F}); return 1`);
  await ev(`resendFrom(0, "Reply with exactly: EDIT_OK"); return 1`);
  // A cold harness can take a while to start before it forks: wait for the branch itself, then for its reply.
  ok(await until(`P().sessionFile && P().sessionFile !== ${F} && !P().streaming && P().msgs.at(-1)?.role === "assistant" && P().msgs.at(-1)?.stopReason === "stop"`, 150000), "edit forks and gets a new reply");
  const forked = await ev(`return P().sessionFile`);
  ok(forked && forked !== fixture, "edit created a branch (new session file)");
  if (forked) created.push(forked);
  ok(await ev(`return P().msgs.filter(m => m.role === "user").length === 1`), "branch starts from the edited message");
  const before = await ev(`return P().sessionFile`);
  await ev(`regenerate(); return 1`);
  await sleep(1500);
  // The app's job: a new branch from the last message with a completed reply (model wording may vary).
  ok(await until(`P().sessionFile !== ${JSON.stringify(before)} && !P().streaming && P().msgs.at(-1)?.role === "assistant" && P().msgs.at(-1)?.stopReason === "stop"`, 120000), "regenerate branches and gets a fresh reply");
  const regen = await ev(`return P().sessionFile`);
  if (regen && !created.includes(regen)) created.push(regen);
  const exp = await ev(`const r = await desk.cmd(CK(), { type: "export_html", outputPath: "/tmp/pidesk-export-test.html" }); return r.success ? r.data.path : ""`);
  ok(exp && fs.existsSync(exp), "export to HTML writes a file", exp);
  if (exp) fs.rmSync(exp, { force: true });
  await shot("03-after-edit");

  console.log("Real clicks (DOM buttons, not function calls)");
  await ev(`await openSession(${F}); return 1`);
  ok(await ev(`return P().msgs.length > 0`), "a chat with messages is open");
  await ev(`document.querySelector("#newChat").click(); await new Promise(r => setTimeout(r, 1500)); return 1`);
  ok(await ev(`return P().msgs.length === 0 && $("#main").classList.contains("is-empty") && P().sessionFile !== ${F}`), "sidebar New chat button starts a fresh chat");
  await ev(`document.querySelector("#sideToggle").click(); return 1`);
  ok(await ev(`return document.body.classList.contains("side-collapsed")`), "sidebar toggle button collapses");
  await ev(`document.querySelector("#sideToggle").click(); if (S.panelOpen) togglePanel(); document.querySelector("#panelToggle").click(); await new Promise(r => setTimeout(r, 300)); return 1`);
  ok(await ev(`return !$("#panel").hidden`), "panel toggle button opens the side panel");
  await ev(`document.querySelector("#panelToggle").click(); return 1`);
  ok(await ev(`return $("#sendBtn").disabled === true`), "send button disabled with an empty message");
  await ev(`const t = TH().find(t => t.file === ${F}); document.querySelector('#threads .th[title="' + t.title.replace(/"/g, '\\"') + '"]')?.click(); await new Promise(r => setTimeout(r, 1500)); return 1`);
  ok(await ev(`return P().sessionFile === ${F}`), "clicking a chat in the sidebar opens it");

  console.log("Character switcher opens every time (real mouse presses)");
  await ev(`await selectCharacter(${JSON.stringify(OTHER)}); return 1`); await sleep(600);
  let openedCount = 0, switched = 0;
  const popOpen = () => ev(`return !document.querySelector("#popover").hidden`);
  for (let i = 0; i < 8; i++) {
    await mouse("#sideFoot .profile"); await sleep(200);
    if (await popOpen()) { openedCount++; const before = await ev(`return S.active`);
      // pick any character other than the current one (works with as few as 2 characters)
      await ev(`const other = document.querySelector("#popover .char-mi:not(.sel)"); other.setAttribute("data-pick", "1"); return 1`);
      await mouse(`#popover .char-mi[data-pick="1"]`); await sleep(350); if ((await ev(`return S.active`)) !== before) switched++; }
  }
  ok(openedCount === 8, `the switcher opens on every one of 8 presses, even right after picking a character (${openedCount}/8)`);
  ok(switched === 8, `…and each pick switches characters (${switched}/8)`);
  await mouse("#sideFoot .profile"); await sleep(300); await mouse("#sideFoot .profile"); await sleep(300);
  ok(!(await popOpen()), "pressing the card again closes it");
  await mouse("#sideFoot .profile", { hold: 1100 }); await sleep(500);
  ok(await popOpen(), "a slow press (held 1.1 s, as on a busy Mac) opens it exactly once, not open-then-close");
  await mouse("#sideFoot .profile", { hold: 1100 }); await sleep(500);
  ok(!(await popOpen()), "…and a slow press on it closes it");
  await mouse("#sideFoot .profile"); await sleep(300); await mouse("#crumb"); await sleep(300);
  ok(!(await popOpen()), "clicking elsewhere closes it");
  await ev(`await selectCharacter(${JSON.stringify(CHAR)}); return 1`);

  console.log("App chrome");
  await ev(`toggleSidebar(true); return 1`);
  ok(await ev(`return document.body.classList.contains("side-collapsed")`), "sidebar collapses");
  await shot("04-collapsed");
  await ev(`toggleSidebar(false); return 1`);
  await ev(`openSettings(); await new Promise(r => setTimeout(r, 400)); return 1`);
  ok(await ev(`return document.querySelectorAll(".sheet-back .field").length === 4 && document.querySelectorAll(".sheet-back .check").length === 5`), "settings sheet fields");
  await shot("05-settings");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return 1`);
  ok(await ev(`return !document.querySelector(".sheet-back")`), "Esc closes sheet");
  await ev(`openShortcuts(); return 1`);
  ok(await ev(`return document.querySelectorAll(".sheet-back .krow").length >= 10`), "shortcuts sheet");
  await ev(`document.querySelector(".sheet-back .btn.primary").click(); return 1`);
  // Copied to /tmp first: the app only reads files under your home folder or /tmp, and the repo may live anywhere.
  const img = "/tmp/pidesk-smoke-portrait.png";
  fs.copyFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "characters", "base", "portrait.png"), img);
  await ev(`await attachPaths([${JSON.stringify(img)}, "/tmp/some-notes.txt"]); return 1`);
  ok(await ev(`return P().attachments.length === 1 && $("#input").value.includes("/tmp/some-notes.txt")`), "attach: image inline, other file as path");
  await shot("06-attach");
  await ev(`P().attachments = []; $("#input").value = ""; autosize(); return 1`);
  ok(await ev(`return typeof desk.pathForFile === "function"`), "drag-and-drop path bridge available");
  await ev(`$("#modelPill").click(); await new Promise(r => setTimeout(r, 1500)); return 1`);
  const provs = await ev(`return [...document.querySelectorAll("#popover .grp")].map(g => g.textContent)`);
  const allowed = JSON.parse(await ev(`return JSON.stringify((await desk.config()).modelProviders || [])`));
  ok(provs.length > 0 && (!allowed.length || provs.every((g) => allowed.includes(g) || g === "")), "model picker lists providers (limited when config.modelProviders is set)", JSON.stringify(provs));
  await ev(`$("#popover").hidden = true; openPanel("tasks"); return 1`);
  ok(await ev(`return !!document.querySelector("#panelBody .q-hd") && [...document.querySelectorAll("#panelTabs button")].map(b => b.textContent).join(",").startsWith("Tasks")`), "tasks panel opens");
  await shot("07-tasks");

  console.log("Crash + restart");
  await ev(`await live(CK()); return 1`);
  await ev(`await desk.restart(CK()); return 1`);
  ok(await until(`!$("#crash").hidden`, 15000), "crash banner appears when the harness dies");
  await shot("08-crash");
  await ev(`$("#crash .btn.primary").click(); return 1`);
  ok(await until(`P().started && !P().crashed && P().msgs.length > 0`, 60000), "Restart brings the harness and chat back");

  console.log("Parallel chats (like Codex): switch away while one is replying");
  await ev(`await openSession(${F}); return 1`);
  const firstKey = await ev(`return CK()`);
  await ev(`$("#input").value = "Count slowly from 1 to 40, one number per line, with no other text."; autosize(); send(); return 1`);
  ok(await until(`S.per[${JSON.stringify(firstKey)}].streaming`, 60000), "first chat starts replying");
  await ev(`document.querySelector("#newChat").click(); await new Promise(r => setTimeout(r, 2500)); return 1`);
  const secondKey = await ev(`return CK()`);
  ok(secondKey !== firstKey && (await ev(`return P().msgs.length === 0`)), "New chat opens while the first is still replying");
  ok(await ev(`return S.per[${JSON.stringify(firstKey)}].streaming || S.per[${JSON.stringify(firstKey)}].msgs.some(m => m.role === "assistant" && JSON.stringify(m.content).includes("12"))`), "first chat keeps running in the background");
  ok(await until(`!!document.querySelector("#threads .th.live") || !S.per[${JSON.stringify(firstKey)}].streaming`, 10000), "chat list marks the running chat");
  await ev(`$("#input").value = "Reply with exactly: SECOND_OK"; autosize(); send(); return 1`);
  ok(await until(`!P().streaming && P().msgs.some(m => m.role === "assistant")`, 120000), "second chat gets its own reply");
  ok(await ev(`return CK() === ${JSON.stringify(secondKey)} && !S.per[${JSON.stringify(firstKey)}].msgs.some(m => JSON.stringify(m.content).includes("SECOND_OK"))`), "chats don't leak into each other");
  const secondFile = await ev(`return P().sessionFile`);
  if (secondFile) created.push(secondFile);
  await ev(`activateChat(${JSON.stringify(firstKey)}); return 1`);
  ok(await ev(`return CK() === ${JSON.stringify(firstKey)} && P().sessionFile === ${F}`), "switching back shows the first chat");
  ok(await until(`!P().streaming && P().msgs.filter(m => m.role === "assistant").length >= 2`, 180000), "first chat's reply finishes after switching back");
  ok(await ev(`const m = P().msgs.at(-1); return m.role === "assistant" && m.stopReason === "stop" && JSON.stringify(m.content).includes('"text"')`), "first chat's reply completed in full after switching away and back");
  await shot("10-parallel");

  console.log("Speed, activity strip, long chats, permissions");
  const G = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}.jsonl`); // fresh mtime on purpose
  const gid = path.basename(G).split("_")[1].replace(".jsonl", "");
  fs.writeFileSync(G, [
    { type: "session", version: 3, id: gid, timestamp: new Date().toISOString(), cwd },
    { type: "message", id: "g0000001", parentId: null, timestamp: new Date().toISOString(), message: { role: "user", content: "speed fixture: hello", timestamp: Date.now() } },
    { type: "message", id: "g0000002", parentId: "g0000001", timestamp: new Date().toISOString(), message: { role: "assistant", content: [{ type: "text", text: "Hi from history." }], api: "x", provider: "example", model: "example-model", usage, stopReason: "stop", timestamp: Date.now() } },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n");
  created.push(G);
  const Gq = JSON.stringify(G);
  await ev(`await refreshThreads(); return 1`);
  await ev(`window.__nc = 0; const o = window.newChat; window.newChat = function () { window.__nc++; return o.apply(this, arguments); }; return 1`);
  const ms = await ev(`const t = TH().find(t => t.file === ${Gq}); const row = document.querySelector('#threads .th[title="' + t.title.replace(/"/g, '\\"') + '"]'); const t0 = performance.now(); row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true })); while (performance.now() - t0 < 3000 && !(P().sessionFile === ${Gq} && document.querySelectorAll("#thread .turn, #thread .user").length >= 2)) await new Promise(r => setTimeout(r, 2)); return Math.round(performance.now() - t0)`);
  ok(ms < 250, `opening a chat shows its history at once (${ms} ms)`);
  ok(await ev(`return P().started === false && !document.querySelector(".sheet-back")`), "…with no Pi process spawned and no 'active elsewhere' dialog, even for a just-modified chat");
  await ev(`const i = $("#input"); i.value = "x"; i.dispatchEvent(new Event("input")); return 1`);
  ok(await until(`P().started && P().model`, 20000), "typing warms the chat's Pi process");
  await ev(`$("#input").value = ""; autosize(); return 1`);
  await mouse("#newChat");
  ok(await ev(`return window.__nc === 1`), "a real mouse press on New chat fires once (press fires, release is swallowed)", await ev(`return "calls=" + window.__nc`));
  ok(await ev(`return P().msgs.length === 0 && $("#main").classList.contains("is-empty")`), "…and shows a fresh chat");
  // activity strip: another character's chat replying, then finished
  const act = await ev(`const k = newChatState(${JSON.stringify(OTHER)}); Object.assign(S.per[k], { msgs: [{ role: "user", content: "strip test" }], streaming: true, started: false }); renderChars(); return k`);
  ok(await ev(`return [...document.querySelectorAll("#sideFoot .act-row.live")].filter((r) => r.title === "strip test").length === 1`), "activity strip shows a chat replying under another character");
  await ev(`const p = S.per[${JSON.stringify(act)}]; p.streaming = false; p.unread = true; renderChars(); return 1`);
  ok(await ev(`const r = [...document.querySelectorAll("#sideFoot .act-row.done")].filter((r) => r.title === "strip test"); return r.length === 1 && /finished/.test(r[0].textContent)`), "…and flips to 'finished' when the reply completes");
  await mouse('#sideFoot .act-row[title="strip test"]');
  ok(await ev(`return S.active === ${JSON.stringify(OTHER)} && CK() === ${JSON.stringify(act)} && !S.per[CK()].unread`), "clicking it jumps to that character's chat and clears the dot");
  await ev(`delete S.per[${JSON.stringify(act)}]; delete S.activeChat[${JSON.stringify(OTHER)}]; await selectCharacter(${JSON.stringify(CHAR)}); return 1`);
  // long chat windowing
  await ev(`const k = newChatState(${JSON.stringify(CHAR)}); const p = S.per[k]; for (let i = 0; i < 90; i++) { p.msgs.push({ role: "user", content: "q" + i }, { role: "assistant", content: [{ type: "text", text: "a" + i }], stopReason: "stop" }); } S.activeChat[${JSON.stringify(CHAR)}] = k; showChat(); return 1`);
  ok(await ev(`return !!document.querySelector("#thread .show-earlier") && document.querySelectorAll("#thread [data-t]").length === 60`), "a 90-exchange chat renders only the latest 60 turns");
  await mouse("#thread .show-earlier");
  ok(await ev(`return !document.querySelector("#thread .show-earlier") && document.querySelectorAll("#thread [data-t]").length === 180`), "'Show earlier' reveals the rest");
  await ev(`const k = CK(); delete S.per[k]; delete S.activeChat[${JSON.stringify(CHAR)}]; S.showAll.delete(k); showChat(); return 1`);
  // permissions
  const perm = await ev(`return JSON.stringify(await desk.permStatus())`);
  ok(/"files":(true|false)/.test(perm) && /"mic":"/.test(perm), "permission status reports files + microphone", perm);
  await ev(`openSettings(); await new Promise(r => setTimeout(r, 500)); return 1`);
  ok(await ev(`return document.querySelectorAll(".sheet-back .perm-row").length === 3`), "Settings has a Permissions section");
  await ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return 1`);

  console.log("Lightweight: no process pile-up");
  const S_IDS = JSON.parse(await ev(`return JSON.stringify(S.chars.map(c => c.id).filter(id => id !== ${JSON.stringify(CHAR)}).slice(0, 4))`));
  const procsOf = async () => JSON.parse(await ev(`return JSON.stringify((await desk.running()).map(x => x.harness))`));
  await ev(`await selectCharacter(${JSON.stringify(OTHER)}); $("#composer").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return 1`);
  ok(await until(`P().started`, 30000), "clicking in warms the chat of a character you just visited");
  ok((await procsOf()).includes(OTHER), "…which is a running Pi process");
  await ev(`await selectCharacter(${JSON.stringify(CHAR)}); return 1`);
  let left = true; for (let i = 0; i < 30 && left; i++) { await sleep(500); left = (await procsOf()).includes(OTHER); } // a process can take a few seconds to exit
  ok(!left, "leaving that empty chat closes its Pi process");
  for (const h of S_IDS) { await ev(`await selectCharacter(${JSON.stringify(h)}); $("#composer").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return 1`); await sleep(500); }
  await ev(`await selectCharacter(${JSON.stringify(CHAR)}); return 1`);
  let pile = []; for (let i = 0; i < 30; i++) { await sleep(500); pile = (await procsOf()).filter((h) => h !== CHAR); if (!pile.length) break; } // closing a Claude-route process can take a few seconds on a busy Mac
  ok(pile.length === 0, `cycling through ${S_IDS.length} characters leaves none of their empty chats running (${pile.length}: ${pile.join(",")})`);

  console.log("Delete");
  await ev(`await openSession(${F}); return 1`);
  const diag = await ev(`await refreshThreads(); const t = TH().find(t => t.file === ${F}); window.__delErr = null; deleteThread(t).catch(e => window.__delErr = e.message); return JSON.stringify({ listed: !!t, open: P().sessionFile === ${F} })`);
  await sleep(400);
  ok(await ev(`return document.querySelector(".sheet-back .btn.danger")?.textContent === "Move to Trash"`), "delete asks first");
  await shot("09-delete-confirm");
  await ev(`document.querySelector(".sheet-back .btn.danger").click(); return 1`);
  for (let i = 0; i < 30 && fs.existsSync(fixture); i++) await sleep(500); // moving to the Trash can be slow on a busy Mac
  await sleep(500);
  ok(!fs.existsSync(fixture), "chat file moved out of Pi's sessions", `${diag} err=${await ev("return window.__delErr")}`);
  try { ok(fs.readdirSync(path.join(HOME, ".Trash")).some((f) => f.includes(sid)), "…into the macOS Trash"); }
  catch { console.log("  - …into the macOS Trash: can't verify (no permission to list ~/.Trash); shell.trashItem reported success"); }
  ok(await ev(`return !TH().some(t => t.file === ${F}) && P().sessionFile !== ${F}`), "deleted open chat → new chat",
    await ev(`return JSON.stringify({ stillListed: TH().some(t => t.file === ${F}), stillOpen: P().sessionFile === ${F}, msgs: P().msgs.length })`) + " " + diag);
} catch (e) {
  fail++; console.log("  ✗ crashed:", e.message);
} finally {
  // Branches made by the edit test are test debris: move them to the Trash too.
  for (const f of created) if (fs.existsSync(f)) await ev(`return desk.trashThread(${JSON.stringify(f)})`).catch(() => {});
  if (fs.existsSync(fixture)) fs.rmSync(fixture);
  console.log(`\n${pass} passed, ${fail} failed. Screenshots: ${SHOTS}`);
  ws.close();
  process.exit(fail ? 1 : 0);
}
