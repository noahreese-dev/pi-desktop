// Instruction files (AGENTS.md): pure helpers. Pi loads, per folder, the FIRST of these that exists (from pi's resource-loader):
const CANDIDATES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];
const MAX = 200000;

// Which file Pi uses in a folder holding `names`, and which others it ignores there.
function pickWinner(names) {
  const have = CANDIDATES.filter((c) => names.includes(c));
  return { winner: have[0] || null, shadowed: have.slice(1) };
}

// Shell text (run on a server) that prints every instruction file Pi would load for a start folder, in a form parseListing reads.
// `folderExpr` is an already-quoted shell word for the folder (remote.js folderArg).
function listScript(folderExpr) {
  return `cd ${folderExpr} 2>/dev/null || cd "$HOME"; D="$(pwd)"; echo "@@PIDESK HOME $HOME"; echo "@@PIDESK DIR $D"; ` +
    `scan(){ s="$1"; d="$2"; w=0; seen=(); for n in ${CANDIDATES.join(" ")}; do f="$d/$n"; if [ -f "$f" ]; then dup=0; for p in "\${seen[@]}"; do [ "$f" -ef "$p" ] && dup=1; done; [ $dup = 1 ] && continue; seen+=("$f"); if [ $w = 0 ]; then w=1; echo "@@PIDESK FILE $s $f"; head -c ${MAX} "$f"; echo; else echo "@@PIDESK SHADOW $f"; fi; fi; done; }; ` +
    `scan global "$HOME/.pi/agent"; scan folder "$D"; d="$(dirname "$D")"; while [ "$d" != "/" ] && [ "$d" != "." ]; do scan parent "$d"; d="$(dirname "$d")"; done; true`;
}

// listScript output → { home, dir, files:[{ scope, path, content, shadowed:[paths] }] }
function parseListing(out) {
  const res = { home: "", dir: "", files: [] };
  const re = /^@@PIDESK (HOME|DIR|FILE|SHADOW) (.*)$/gm, marks = [];
  let m; while ((m = re.exec(out))) marks.push({ kind: m[1], arg: m[2], start: m.index, end: re.lastIndex });
  let cur = null;
  marks.forEach((k, i) => {
    if (k.kind === "HOME") res.home = k.arg.trim();
    else if (k.kind === "DIR") res.dir = k.arg.trim();
    else if (k.kind === "FILE") {
      const mm = k.arg.match(/^(global|folder|parent) (\/.+)$/);
      if (!mm) { cur = null; return; }
      let content = out.slice(k.end + 1, i + 1 < marks.length ? marks[i + 1].start : out.length);
      if (content.endsWith("\n")) content = content.slice(0, -1); // the one newline the script's echo added
      cur = { scope: mm[1], path: mm[2], content, shadowed: [] };
      res.files.push(cur);
    } else if (k.kind === "SHADOW" && cur) cur.shadowed.push(k.arg.trim());
  });
  return res;
}

// Raw listing → what the window gets. `folder` and `global` are the two files you can edit (their path is where a new file would go).
function shape(l) {
  const base = (p) => p.split("/").pop();
  const one = (scope, def) => {
    const f = l.files.find((x) => x.scope === scope);
    return f ? { path: f.path, exists: true, content: f.content, shadowed: f.shadowed.map(base) } : { path: def, exists: false, content: "", shadowed: [] };
  };
  return { home: l.home, dir: l.dir, folder: one("folder", l.dir + "/AGENTS.md"), global: one("global", l.home + "/.pi/agent/AGENTS.md"), parents: l.files.filter((x) => x.scope === "parent").map((x) => ({ path: x.path, content: x.content })) };
}

module.exports = { CANDIDATES, MAX, pickWinner, listScript, parseListing, shape };
