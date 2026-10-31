// Speech to text for voice typing. A whisper.cpp server keeps the model loaded, so each clip is transcribed in about
// a second instead of reloading the model every time. It starts on first use and exits after 20 idle minutes.
// Model: models/ggml-large-v3-turbo-q5_0.bin if present (gitignored), else config.whisperModel.
// A vocabulary prompt (your name, the characters' names) is what gets unusual names spelled right.
// Falls back to a one-off whisper-cli run if the server can't start.
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TURBO = path.join(__dirname, "..", "models", "ggml-large-v3-turbo-q5_0.bin");
const IDLE_MS = 20 * 60e3;
// Whisper's usual inventions on silence or noise; dropped when they are the whole result.
const NOISE = /^(\s*[([][^)\]]*[)\]]\s*)*$|^\s*(thank you\.?|thanks for watching[.!]?|you\.?|bye\.?|\.+)\s*$/i;

function createAsr({ env = process.env, fallbackModel, vocabulary = () => "", log = () => {}, port = 8178 }) {
  const model = fs.existsSync(TURBO) ? TURBO : fallbackModel;
  let proc = null, ready = null, idle = null;
  const run = (cmd, args, opts = {}) => new Promise((res, rej) => execFile(cmd, args, { env, timeout: 120000, maxBuffer: 8 << 20, ...opts }, (e, out, err) => (e ? rej(new Error(String(err || e.message).slice(0, 300))) : res(out))));

  function start() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      // A server left behind by a Pi Desktop that was force-quit holds the port (and ~1 GB): clear it first.
      // Only if it really is whisper-server: never kill something else that happens to use the port.
      const { execFileSync } = require("child_process");
      try {
        for (const pid of execFileSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split(/\s+/).filter(Boolean)) {
          const cmd = execFileSync("ps", ["-o", "comm=", "-p", pid], { encoding: "utf8" }).trim();
          if (path.basename(cmd) === "whisper-server") process.kill(+pid);
        }
      } catch {}
      // Runs under a tiny watcher that ends it if Pi Desktop goes away without a clean quit.
      const args = ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-sns", "-t", String(Math.max(4, Math.min(8, os.cpus().length - 2)))];
      proc = spawn("/bin/sh", ["-c", 'whisper-server "$@" & w=$!; trap "kill $w 2>/dev/null" EXIT TERM; while kill -0 ' + process.pid + ' 2>/dev/null && kill -0 $w 2>/dev/null; do sleep 3; done', "sh", ...args],
        { env, stdio: ["ignore", "ignore", "pipe"] });
      let errText = "";
      proc.stderr.on("data", (d) => { errText = (errText + d).slice(-2000); });
      proc.on("exit", (code) => { log(`voice: whisper-server exited (${code})`); proc = null; ready = null; reject(new Error("whisper-server exited: " + errText.slice(-200))); });
      const t0 = Date.now();
      const poll = async () => {
        try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }); log(`voice: whisper-server ready in ${Date.now() - t0} ms`); return resolve(); } catch {}
        if (!proc) return;
        if (Date.now() - t0 > 60000) { proc.kill(); return reject(new Error("whisper-server didn't start")); }
        setTimeout(poll, 300);
      };
      poll();
    });
    ready.catch(() => {});
    return ready;
  }
  function touch() { clearTimeout(idle); idle = setTimeout(stop, IDLE_MS); }
  function stop() { clearTimeout(idle); try { proc?.kill(); } catch {} proc = null; ready = null; }
  const warm = () => { touch(); return start().then(() => true, () => false); };

  async function transcribe(bytes, { before = "" } = {}) {
    touch();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pidesk-voice-"));
    const src = path.join(tmp, "in"), wav = path.join(tmp, "in.wav");
    try {
      fs.writeFileSync(src, Buffer.from(bytes));
      // Audio containers only, local file only: a "recording" can't be a playlist that pulls in other files.
      // highpass removes rumble/handling noise; whisper handles quiet (far-away) speech itself.
      await run("ffmpeg", ["-loglevel", "error", "-y", "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,ogg,wav,aac,mp3,flac,caf",
        "-protocol_whitelist", "file", "-i", src, "-af", "highpass=f=70", "-ar", "16000", "-ac", "1", wav], { timeout: 30000 });
      const prompt = (vocabulary() + (before ? " " + before : "")).trim();
      let text;
      try {
        await start();
        const form = new FormData();
        form.append("file", new Blob([fs.readFileSync(wav)], { type: "audio/wav" }), "in.wav");
        form.append("response_format", "text"); form.append("temperature", "0");
        if (prompt) form.append("prompt", prompt);
        const r = await fetch(`http://127.0.0.1:${port}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error(`whisper-server HTTP ${r.status}`);
        text = await r.text();
      } catch (e) {
        log(`voice: ${e.message}; using whisper-cli`);
        text = await run("whisper-cli", ["-m", fallbackModel, "-f", wav, "-nt", "-np", "-sns", ...(prompt ? ["--prompt", prompt] : [])]);
      }
      text = text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
      return { text: NOISE.test(text) ? "" : text };
    } catch (e) {
      return { error: String(e.message || e).slice(0, 300) };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  return { transcribe, warm, stop, model: () => path.basename(model) };
}

module.exports = { createAsr };
