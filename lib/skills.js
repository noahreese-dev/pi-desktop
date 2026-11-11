// Skills: pure helpers (no Electron, no fs). Pi's skill folders hold a SKILL.md with name/description frontmatter;
// on/off is a "-<path>" entry in the `skills` array of ~/.pi/agent/settings.json.

// name + description from SKILL.md frontmatter (handles quoted values and folded `>` / literal `|` blocks), and the body.
function parseSkill(src) {
  src = String(src).replace(/\r/g, "");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  const out = { name: "", description: "", body: m ? src.slice(m[0].length) : src };
  if (!m) return out;
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z-]+):\s*(.*)$/);
    if (!kv || (kv[1] !== "name" && kv[1] !== "description")) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?$/.test(v) || v === "") {
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      v = parts.join(" ");
    }
    out[kv[1]] = v.replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return out;
}

const expandHome = (p, home) => String(p).replace(/^~(?=\/|$)/, home);
const isOff = (settings, dir, home) => (Array.isArray(settings?.skills) ? settings.skills : []).some((e) => {
  if (typeof e !== "string" || e[0] !== "-") return false;
  const p = expandHome(e.slice(1), home).replace(/\/$/, "");
  return p === dir || p === dir + "/SKILL.md";
});
// New settings with one skill switched on/off. Other settings and other skill entries are left exactly as they were.
function applyToggle(settings, dir, home, enabled) {
  const s = { ...(settings && typeof settings === "object" ? settings : {}) };
  const rest = (Array.isArray(s.skills) ? s.skills : []).filter((e) => !(typeof e === "string" && e[0] === "-" && [dir, dir + "/SKILL.md"].includes(expandHome(e.slice(1), home).replace(/\/$/, ""))));
  if (!enabled) rest.push("-" + (dir.startsWith(home + "/") ? "~" + dir.slice(home.length) : dir));
  if (rest.length) s.skills = rest; else delete s.skills;
  return s;
}
// Where a skill came from, from its folder path: a package (npm/git) or the user's own folders.
function sourceOf(dir, home) {
  const npm = dir.match(/\/\.pi\/agent\/npm\/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (npm) return { source: "package", pkg: npm[1] };
  const git = dir.match(/\/\.pi\/agent\/git\/(?:[^/]+\/)?([^/]+)\//);
  if (git) return { source: "package", pkg: git[1] };
  return { source: "user", pkg: "" };
}
// A skill an agent carries in its own folder. `vendor/<repo>/…/skills/<name>` is a pinned third-party repo (named by
// the repo); `skills/<name>` is one the agent's author wrote (no repo). Anything not under a skills/ folder isn't loaded.
function agentSkillRepo(dir) {
  const m = String(dir).match(/\/vendor\/([^/]+)\/(?:.*\/)?skills\/[^/]+$/);
  return m ? m[1] : "";
}
const inSkillsFolder = (dir) => /\/skills\/[^/]+$/.test(String(dir));
// Output of the remote listing command → { home, skills:[{dir, mtime, ...parsed}], settings }.
function parseListing(out) {
  const res = { home: "", skills: [], settings: {} };
  const [skillsPart, settingsPart = ""] = String(out).split("@@SETTINGS\n");
  res.home = (skillsPart.match(/^@@HOME (.+)$/m) || [])[1] || "";
  for (const chunk of skillsPart.split("@@SKILL ").slice(1)) {
    const nl = chunk.indexOf("\n"), head = chunk.slice(0, nl).trim().match(/^(\S+) (\d+)$/);
    if (!head || !/^\/[\w./@+-]+\/SKILL\.md$/.test(head[1])) continue;
    res.skills.push({ dir: head[1].replace(/\/SKILL\.md$/, ""), mtime: +head[2] * 1000, ...parseSkill(chunk.slice(nl + 1)) });
  }
  try { res.settings = JSON.parse(settingsPart || "{}"); } catch {}
  return res;
}
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const skillFile = ({ name, description, instructions }) =>
  `---\nname: ${name}\ndescription: ${JSON.stringify(String(description).replace(/\s+/g, " ").trim())}\n---\n\n${String(instructions).trim()}\n`;

module.exports = { agentSkillRepo, inSkillsFolder, parseSkill, isOff, applyToggle, sourceOf, parseListing, SKILL_NAME, skillFile };
