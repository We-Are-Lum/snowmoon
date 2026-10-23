/**
 * The proof that our Modal conversion (modal/chatterbox_vc.py) deletes each recording: nothing kept on the
 * container, a volume or any Modal storage, and no audio in the logs (owner, 2026-10-23). Two halves, both run by
 * `npm run check:modal-vc` and by P1h in check:principles:
 *
 *  - modalVcStatic(src): reads the Python source (comments and docstrings removed) for what must never be there.
 *  - modalVcRun(src): runs scripts/modal_vc_proof.py on that source with a stub `modal` and a stub model, without
 *    Modal and without spending, and returns what it found (files left, audio in logs or replies, storage used,
 *    the input still held after the calls).
 *
 * Both take the source text, so a copy with a planted violation can be checked the same way (MODAL_VC_PLANTS).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const MODAL_VC_FILE = 'modal/chatterbox_vc.py';
const ROOT = path.resolve(import.meta.dirname, '../..');

/** Variables that hold audio, its base64, the request body or an exception (whose message could quote either). */
const AUDIO = ['source', 'target', 'out', 'raw', 'req', 'wav', 'buf', 'data', 'seen', 'body', 'e', 'exc', 'err', 'request'];

/** Blank out comments and string-literal docstrings, keeping line numbers. */
export function stripPython(src: string): string {
  let s = src.replace(/("""|''')[\s\S]*?\1/g, (m) => m.replace(/[^\n]/g, ' '));
  s = s
    .split('\n')
    .map((line) => {
      let q: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (ch === '\\') i++;
          else if (ch === q) q = null;
        } else if (ch === '"' || ch === "'") q = ch;
        else if (ch === '#') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
  return s;
}

const indentOf = (l: string) => l.length - l.trimStart().length;

/** The text of a call starting at `open` (the index of its "("), up to the matching ")". */
function callText(s: string, open: number): string {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return s.slice(open + 1, i);
  }
  return s.slice(open + 1);
}

/** Lines [from, to) of the block opened by the line at `at` (everything indented deeper than it). */
function blockAfter(lines: string[], at: number): [number, number] {
  const ind = indentOf(lines[at]);
  let j = at + 1;
  while (j < lines.length && (!lines[j].trim() || indentOf(lines[j]) > ind)) j++;
  return [at + 1, j];
}

export function modalVcStatic(src: string): string[] {
  const problems: string[] = [];
  const s = stripPython(src);
  const lines = s.split('\n');
  const at = (re: RegExp, why: string) => {
    lines.forEach((l, i) => {
      if (re.test(l)) problems.push(`line ${i + 1}: ${why}`);
    });
  };

  // Storage: nothing kept anywhere Modal stores things.
  at(/\.commit\(/, 'commits a volume');
  at(/\bmodal\.(Dict|Queue|NetworkFileSystem|CloudBucketMount)\b/, 'uses Modal storage (Dict, Queue, network file system or bucket)');
  lines.forEach((l, i) => {
    if (/\bVolume\b/.test(l) && !/\.read_only\(\)/.test(l)) problems.push(`line ${i + 1}: uses a Modal Volume that is not read-only`);
  });
  at(/\b(network_file_systems)\s*=/, 'mounts a network file system');
  // Modal keeps the inputs and outputs of Functions, Web Functions included, up to 7 days (modal.com/docs/guide/security).
  at(/\b(fastapi_endpoint|web_endpoint|asgi_app|wsgi_app|web_server)\b/, 'a Web Function: Modal keeps its inputs and outputs up to 7 days');
  at(/@app\.(function|cls)\b/, 'a Modal Function: Modal keeps its inputs and outputs up to 7 days');
  at(/\.(spawn|spawn_map|remote|map)\(/, 'calls a Modal Function, whose inputs Modal keeps');
  at(/enable_memory_snapshot\s*=\s*True/, 'memory snapshots (kept 7 days) could hold a recording');
  at(/unauthenticated\s*=\s*True/, 'accepts unauthenticated requests');
  at(/\b(allow_concurrent_inputs|target_concurrency)\b|@modal\.concurrent/, 'allows concurrent calls in one container');
  const server = s.match(/@app\.server\(/);
  if (!server) problems.push('no @app.server(...): the endpoint must be a Modal Server, whose payloads Modal does not store');
  else {
    const args = callText(s, server.index! + '@app.server'.length);
    if (!/\bmax_concurrency\s*=\s*1\b/.test(args)) problems.push('@app.server without max_concurrency=1');
    if (/\bvolumes\s*=/.test(args) && !/read_only\(\)/.test(args)) problems.push('@app.server mounts a volume that is not read-only');
  }

  // Sending anywhere else.
  at(/^\s*(import|from)\s+(requests|httpx|aiohttp|boto3|botocore|urllib|http\.client|socket|smtplib|ftplib)\b/, 'imports a network client: the recording must not be sent anywhere');

  // Logs: one helper, _log, prints; nothing else writes to the logs.
  at(/\b(logging|logger|traceback|pprint|warnings|faulthandler)\b/, 'logging, tracebacks or warnings: only _log may write to the logs');
  at(/\bsys\.(stdout|stderr)\b|\.exception\(|\bsend_error\(/, 'writes to stdout or stderr, or an error page, outside _log');
  const logDef = lines.findIndex((l) => /^def _log\(/.test(l));
  const [logFrom, logTo] = logDef >= 0 ? blockAfter(lines, logDef) : [0, 0];
  if (logDef < 0) problems.push('no _log helper');
  lines.forEach((l, i) => {
    if (/\bprint\(/.test(l) && !(i >= logFrom && i < logTo)) problems.push(`line ${i + 1}: print() outside _log`);
  });
  if (logDef >= 0 && !/raise ValueError/.test(lines.slice(logFrom, logTo).join('\n'))) problems.push('_log does not refuse fields outside LOG_FIELDS');
  for (const m of s.matchAll(/\b_log\(/g)) {
    const args = callText(s, m.index! + 4)
      .replace(/\blen\(\w+\)/g, '')
      .replace(/\btype\(\w+\)\.__name__/g, '')
      .replace(/\b_wav_seconds\(\w+\)/g, '')
      .replace(/\bstr\(e\.status\)/g, '')
      .replace(/\b\w+\s*=/g, '');
    const line = s.slice(0, m.index).split('\n').length;
    for (const v of AUDIO) if (new RegExp(`\\b${v}\\b`).test(args)) problems.push(`line ${line}: _log is given ${v} (only its len, sha256 or type name may be logged)`);
  }
  const lf = s.match(/LOG_FIELDS\s*=\s*\(([^)]*)\)/);
  if (!lf) problems.push('no LOG_FIELDS');
  else for (const f of lf[1].match(/"(\w+)"/g) ?? []) {
    const name = f.slice(1, -1);
    if (!/(_bytes|_seconds|_sha256|_s|^status|^error)$/.test(name)) problems.push(`LOG_FIELDS allows "${name}", which is not a size, duration, sha256, timing, status or error type`);
  }
  if (/BaseHTTPRequestHandler/.test(s)) {
    const lm = lines.findIndex((l) => /def log_message\(/.test(l));
    if (lm < 0) problems.push("the HTTP handler keeps the standard request log (no log_message override)");
    else {
      const [a, b] = blockAfter(lines, lm);
      if (lines.slice(a, b).some((l) => l.trim() && l.trim() !== 'pass')) problems.push('log_message writes something');
    }
    if (!/def handle_error\(/.test(s)) problems.push('the HTTP server prints tracebacks (no handle_error override)');
  }

  // Temporary files: only in per-call folders, each removed in a `finally`.
  at(/\b(mkstemp|NamedTemporaryFile|TemporaryDirectory|SpooledTemporaryFile|gettempdir\(\)\s*\+)\b/, 'a temporary file outside a per-call folder removed in finally');
  at(/["']\/(tmp|var|root|data|cache|mnt)\b/, 'a fixed path for files');
  const guarded: [number, number][] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)(\w+)\s*=\s*tempfile\.mkdtemp\(/);
    if (!m) return;
    const v = m[2];
    const ind = m[1].length;
    let t = i + 1;
    while (t < lines.length && !(indentOf(lines[t]) === ind && /^\s*try:/.test(lines[t]))) {
      if (lines[t].trim() && indentOf(lines[t]) < ind) break;
      t++;
    }
    const [tryFrom, tryTo] = t < lines.length && /^\s*try:/.test(lines[t]) ? blockAfter(lines, t) : [0, 0];
    let fin = -1;
    for (let k = tryTo; k < lines.length && lines[k] !== undefined; ) {
      if (!lines[k].trim()) { k++; continue; }
      if (indentOf(lines[k]) !== ind || !/^\s*(except\b|else:|finally:)/.test(lines[k])) break;
      if (/^\s*finally:/.test(lines[k])) { fin = k; break; }
      k = blockAfter(lines, k)[1];
    }
    if (!tryTo || fin < 0) {
      problems.push(`line ${i + 1}: the folder ${v} is not followed by try/finally`);
      return;
    }
    const finBody = lines.slice(...blockAfter(lines, fin)).join('\n');
    if (!new RegExp(`shutil\\.rmtree\\(${v}\\b`).test(finBody)) problems.push(`line ${i + 1}: the finally does not remove ${v} (shutil.rmtree)`);
    if (!new RegExp(`os\\.path\\.exists\\(${v}\\)`).test(finBody)) problems.push(`line ${i + 1}: the finally does not confirm ${v} is gone`);
    if (/^\s*(return|yield)\b/m.test(lines.slice(i, tryFrom).join('\n'))) problems.push(`line ${i + 1}: returns between making ${v} and its try`);
    guarded.push([i, tryTo]);
  });
  if (!guarded.length) problems.push('no per-call folder (tempfile.mkdtemp) to hold the files the model reads');
  const writes = /\bopen\([^)]*["'](w|a|x)b?\+?["']|\.write_(bytes|text)\(|\bshutil\.(copy\w*|move)\(|\bos\.(rename|replace|link|symlink)\(|\btorchaudio\.save\((?!buf\b)|\bnp\.save\w*\(|\btorch\.save\(/;
  lines.forEach((l, i) => {
    if (writes.test(l) && !guarded.some(([a, b]) => i > a && i < b)) problems.push(`line ${i + 1}: writes a file outside a per-call folder's try`);
  });

  // Keeping the input after returning.
  at(/^\s*global\b/, 'a global statement: state that outlives a call');
  lines.forEach((l, i) => {
    const m = l.match(/\bself\.(\w+)\s*=(?!=)/);
    if (m && !['_model', 'status'].includes(m[1])) problems.push(`line ${i + 1}: keeps self.${m[1]} between calls (only the model may be kept)`);
    const c = l.match(/\.(append|extend|add|insert|update|setdefault|put)\((.*)$/);
    if (c && AUDIO.some((v) => new RegExp(`\\b${v}\\b`).test(c[2]))) problems.push(`line ${i + 1}: stores ${c[2].trim().slice(0, 30)} in a collection`);
  });
  return problems;
}

/** The run half: scripts/modal_vc_proof.py on this source. "skipped: …" when python3 is missing. */
export function modalVcRun(src: string): { problems: string[]; scenarios: { label: string }[] } {
  const dir = mkdtempSync(path.join(tmpdir(), 'modal-vc-src-'));
  const file = path.join(dir, 'chatterbox_vc.py');
  try {
    writeFileSync(file, src);
    let out: string;
    try {
      out = execFileSync('python3', ['-I', path.join(ROOT, 'scripts/modal_vc_proof.py'), file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
    } catch (e) {
      const err = e as { code?: string; stdout?: string; stderr?: string };
      if (err.code === 'ENOENT') return { problems: ['skipped: python3 not found'], scenarios: [] };
      out = err.stdout ?? '';
      if (!out.trim()) return { problems: [`the run did not finish: ${(err.stderr ?? '').trim().split('\n').slice(-2).join(' ').slice(0, 300)}`], scenarios: [] };
    }
    const last = out.trim().split('\n').pop() ?? '';
    try {
      return JSON.parse(last);
    } catch {
      return { problems: ['the run printed no result'], scenarios: [] };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Violations the proof must catch, each planted into a copy of the source. */
export const MODAL_VC_PLANTS: { name: string; plant: (src: string) => string }[] = [
  { name: 'the per-call folder is not removed', plant: (s) => s.replace(/shutil\.rmtree\(work, ignore_errors=True\)/, 'pass') },
  { name: 'the recording is printed as base64', plant: (s) => s.replace(/(\n(\s*)out = engine\.convert\(source_path, target_path\)\n)/, '$1$2print(base64.b64encode(source).decode())\n') },
  { name: "an error's message is logged", plant: (s) => s.replace('error=type(e).__name__, total_s', 'error=str(e)[:64], total_s') },
  { name: 'a traceback is printed', plant: (s) => s.replace('            _log("error", error=type(e).__name__)\n', '            import traceback\n            traceback.print_exc()\n') },
  { name: 'a volume is written and committed', plant: (s) => s.replace('app = modal.App("snowmoon-chatterbox-vc")\n', 'app = modal.App("snowmoon-chatterbox-vc")\ntakes = modal.Volume.from_name("takes", create_if_missing=True)\n').replace('        out = engine.convert(source_path, target_path)\n', '        out = engine.convert(source_path, target_path)\n        takes.commit()\n') },
  { name: 'the recording is kept in a Dict', plant: (s) => s.replace('app = modal.App("snowmoon-chatterbox-vc")\n', 'app = modal.App("snowmoon-chatterbox-vc")\nseen = modal.Dict.from_name("seen", create_if_missing=True)\n').replace('    source_sha = hashlib.sha256(source).hexdigest()\n', '    source_sha = hashlib.sha256(source).hexdigest()\n    seen[source_sha] = source\n') },
  { name: 'the recording is kept in memory after returning', plant: (s) => s.replace('LOG_FIELDS = (', '_RECENT = []\nLOG_FIELDS = (').replace('    t0 = time.monotonic()\n    source_sha', '    _RECENT.append(source)\n    t0 = time.monotonic()\n    source_sha') },
  { name: 'a temp file outside the per-call folder', plant: (s) => s.replace('    _sweep()\n    work = tempfile.mkdtemp', '    _sweep()\n    keep = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)\n    keep.write(source)\n    keep.close()\n    work = tempfile.mkdtemp') },
  { name: 'a Web Function instead of a Server', plant: (s) => s.replace(/@app\.server\(image=image, gpu="T4", port=PORT, max_concurrency=1, /, '@app.cls(image=image, gpu="T4", ') },
  { name: 'the request log is left on', plant: (s) => s.replace(/    def log_message\(self, format, \*args\):\n        """[^"]*"""\n/, '') },
];
