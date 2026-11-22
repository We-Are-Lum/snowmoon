/**
 * P1h, the raw voice takes proof (DRAFT, 2026-11-20; docs/principles.md), for check:principles and test:voice. No
 * ElevenLabs, no spending.
 *
 * Static: src/lib/voice/take-flow.ts has no runtime import and no console, process, fetch, require or dynamic import;
 * the take is passed only to deps.convert and deps.sha256; it is zeroed in a finally; history is deleted; transcription
 * is gated on the conversion's sha256. src/app/api/voice/convert/route.ts reads the take once, straight into
 * convertTake, and logs nothing.
 *
 * Run: the flow (or a planted copy of it, written to a temporary file and imported) is run against stub dependencies
 * that record everything they receive, with console captured and the temp root, the working folder and HOME watched
 * for new files: on success, a failed call, a slow failure and a refused transcription. No dependency other than
 * convert and sha256 may receive the take, its base64 or its hex; nothing may be logged or written holding them; the
 * take must be zeroed; the history item deleted; transcription must refuse the take.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FLOW_FILE = 'src/lib/voice/take-flow.ts';
export const ROUTE_FILE = 'src/app/api/voice/convert/route.ts';

export function voiceStatic(flow: string, route: string): string[] {
  const p: string[] = [];
  const code = flow.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const line of code.split('\n').filter((l) => /^\s*import\b/.test(l))) if (!/^\s*import type\b/.test(line)) p.push(`take-flow: a runtime import: ${line.trim()}`);
  for (const [re, what] of [[/\bconsole\./, 'console'], [/\bprocess\./, 'process'], [/\bfetch\(/, 'fetch'], [/\brequire\(/, 'require'], [/\bimport\(/, 'a dynamic import'], [/\bBuffer\b/, 'Buffer']] as const)
    if (re.test(code)) p.push(`take-flow uses ${what}`);
  const takeCalls = [...code.matchAll(/(\w[\w.]*)\(([^()]*\btake\b[^()]*)\)/g)].map((m) => `${m[1]}(${m[2]})`).filter((c) => !/^take\.fill\(0\)$/.test(c) && !/\btake:\s*Uint8Array/.test(c));
  for (const c of takeCalls) if (!/^deps\.(convert|sha256)\(take\b/.test(c)) p.push(`take-flow passes the take to ${c}`);
  if (!/finally\s*\{\s*take\.fill\(0\);\s*\}/.test(code)) p.push('take-flow does not zero the take in a finally');
  if (!/\(await deps\.deleteHistory\(out\.historyItemId\)\) === 'gone'/.test(code)) p.push('take-flow does not delete the history item');
  if (!/if \(sha !== convert\.convertedSha256 \|\| sha === convert\.takeSha256\) throw/.test(code)) p.push('take-flow transcribes without checking it is converted audio');
  if (!/\(await deps\.deleteTranscript\(transcriptionId\)\) === 'gone'/.test(code)) p.push('take-flow does not delete the stored transcript');
  if ((code.match(/deps\.transcribe\(/g) ?? []).length !== 1 || !/deps\.transcribe\(input\.audio\)/.test(code)) p.push('take-flow calls transcribe with something other than the checked converted audio');
  const r = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/\bconsole\./.test(r)) p.push('convert route uses console');
  if ((r.match(/\.arrayBuffer\(\)/g) ?? []).length !== 1 || !/take: new Uint8Array\(await file\.arrayBuffer\(\)\)/.test(r)) p.push('convert route reads the take other than once, straight into convertTake');
  if (/writeFile|createWriteStream|PutObject|\.put\(|storage|r2\(/.test(r)) p.push('convert route can write a file or to storage');
  // The converted take is kept as the person's draft (Nate, 2026-11-22): only the audio convertTake returned, never the take.
  if (!/const \{ audio, ticket \} = await convertTake\(/.test(r)) p.push('convert route does not take its converted audio from convertTake');
  const keeps = [...r.matchAll(/keepConvertedTake\(([^)]*)\)/g)].map((m) => m[1].trim());
  if (keeps.length !== 1 || keeps[0] !== 'sql, who.fid, { audio, ticket }') p.push(`convert route keeps something other than the converted audio (${keeps.join(' | ') || 'no keep'})`);
  if (/\b(saveDraft|keepPerformance|putAudio)\(/.test(r)) p.push('convert route writes a draft other than through keepConvertedTake');
  if (/\bfile\b[^\n]*\b(sql|db|log|cost|settle)\b|\b(sql|settle|reserve)\b[^\n]*\bfile\b(?!\.size)/.test(r.replace(/form\.get\('take'\)/, ''))) p.push('convert route passes the take near the database or costs');
  return p;
}

type Deps = Record<string, unknown>;
function walkNew(dir: string, since: number, depth: number, out: string[]) {
  if (depth < 0) return;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    if (n === 'node_modules' || n === '.next' || n === '.git' || n === 'Library') continue;
    const f = path.join(dir, n);
    let st;
    try {
      st = statSync(f);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkNew(f, since, depth - 1, out);
    else if (st.mtimeMs >= since && st.size < 50_000_000) out.push(f);
  }
}

/** Run the flow source given (default: the real file) against stubs; return the problems found. */
export async function voiceRun(root: string, flowSrc?: string): Promise<string[]> {
  const problems: string[] = [];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'voice-proof-'));
  const file = path.join(dir, 'take-flow.ts');
  writeFileSync(file, flowSrc ?? readFileSync(path.join(root, FLOW_FILE), 'utf8'));
  const startedAt = Date.now() - 1;
  const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as typeof import('../../src/lib/voice/take-flow');
  rmSync(dir, { recursive: true, force: true });

  const take = randomBytes(6000);
  const original = Buffer.from(take);
  const marks = [original.toString('base64'), original.toString('hex').slice(0, 64), original.subarray(0, 48).toString('base64').slice(0, 40), Array.from(original.subarray(0, 24)).join(',')];
  const holds = (v: unknown): boolean => {
    if (v instanceof Uint8Array) return Buffer.from(v).indexOf(original.subarray(0, 64)) >= 0;
    if (typeof v === 'string') return marks.some((m) => v.includes(m));
    if (Array.isArray(v)) return v.some(holds);
    if (v && typeof v === 'object') return Object.values(v).some(holds);
    return false;
  };
  const seen: { dep: string; args: unknown[] }[] = [];
  const logged: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) console[k] = (...a: unknown[]) => void logged.push(a.map((x) => (x instanceof Uint8Array ? Buffer.from(x).toString('base64') : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
  const signed: unknown[] = [];
  let deletes = 0;
  const converted = randomBytes(3000);
  const make = (convert: Deps['convert']): Deps => {
    const rec = (dep: string, f: (...a: never[]) => unknown) => (...args: never[]) => {
      // Copied when received: the flow zeroes the take afterwards, and a reference would hide what was passed.
      seen.push({ dep, args: structuredClone(args.map((a: unknown) => (a instanceof Uint8Array ? new Uint8Array(a) : a))) });
      return f(...args);
    };
    return {
      sha256: rec('sha256', sha),
      convert: rec('convert', convert as never),
      // Like ElevenLabs on 2026-11-21: the item isn't written yet at the first delete, and is there at the next.
      deleteHistory: rec('deleteHistory', async () => (++deletes === 1 ? 'not-yet' : 'gone')),
      sleep: async () => {},
      transcribe: rec('transcribe', async () => ({ words: [{ text: 'all', start: 0, end: 0.3 }], credits: 1, transcriptionId: 'stt1' })),
      deleteTranscript: rec('deleteTranscript', async () => 'gone'),
      sign: rec('sign', (t: unknown) => (signed.push(structuredClone(t)), `signed.${signed.length}`)),
      verify: rec('verify', (s: string) => (signed[Number(s.split('.')[1]) - 1] ?? null) as never),
      cost: rec('cost', async () => {}),
      now: () => 1_000_000,
      convertModel: 'm',
      transcribeModel: 't',
      settings: {},
      outputFormat: 'mp3',
      ticketMinutes: 60,
      creditsPerMinute: 1000,
    };
  };
  const input = (t: Uint8Array) => ({ take: t, mime: 'audio/webm', seconds: 10, fid: 6786, speechId: 's', presetId: 'p', candidate: 1, voiceId: 'v', scope: { kind: 'whole' as const }, consentSha256: 'c'.repeat(64) });
  const scenarios: [string, Deps['convert']][] = [
    ['success', async () => ({ audio: new Uint8Array(converted), historyItemId: 'hist1', credits: 170 })],
    ['a failed call', async () => Promise.reject(new Error(`provider said: ${original.toString('base64').slice(0, 80)}`))],
    ['a slow failure (timeout)', () => new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 20))],
  ];
  try {
    for (const [name, convert] of scenarios) {
      seen.length = 0;
      deletes = 0;
      const t = new Uint8Array(take);
      let out: { audio: Uint8Array; ticket: string } | null = null;
      try {
        out = await mod.convertTake(make(convert) as never, input(t));
      } catch (e) {
        if (holds((e as Error).message)) problems.push(`${name}: the error passed on holds the take`);
      }
      if (t.some((b) => b !== 0)) problems.push(`${name}: the take was not zeroed`);
      for (const s of seen) if (s.dep !== 'convert' && s.dep !== 'sha256' && holds(s.args)) problems.push(`${name}: ${s.dep} received the take`);
      if (out && holds([out.audio, out.ticket])) problems.push(`${name}: the reply holds the take`);
      if (name === 'success') {
        if (!out) problems.push('success: no conversion came back');
        if (!seen.some((s) => s.dep === 'deleteHistory' && s.args[0] === 'hist1')) problems.push('success: the history item was not deleted');
        if (seen.filter((s) => s.dep === 'deleteHistory').length < 2 || !(signed.at(-1) as { historyDeleted?: boolean } | undefined)?.historyDeleted)
          problems.push('success: the delete was not tried again once the history item was written (ElevenLabs writes it after answering)');
        if (holds(signed)) problems.push('success: the signed record holds the take');
        // Transcription: the converted audio passes; the take is refused and never reaches transcribe.
        if (out) {
          const d = make(convert);
          seen.length = 0;
          await mod.transcribeConverted(d as never, { audio: new Uint8Array(converted), ticket: out.ticket, fid: 6786 }).catch(() => problems.push('transcription refused the converted audio'));
          if (!seen.some((s) => s.dep === 'deleteTranscript' && s.args[0] === 'stt1') || !(signed.at(-1) as { transcriptDeleted?: boolean } | undefined)?.transcriptDeleted) problems.push('success: the stored transcript was not deleted');
          seen.length = 0;
          let refused = false;
          await mod.transcribeConverted(d as never, { audio: new Uint8Array(original), ticket: out.ticket, fid: 6786 }).catch(() => (refused = true));
          if (!refused || seen.some((s) => s.dep === 'transcribe')) problems.push('transcription accepted the raw take');
        }
      }
    }
  } finally {
    Object.assign(console, orig);
  }
  if (logged.some((l) => holds(l))) problems.push('a log line holds the take');
  const fresh: string[] = [];
  for (const d of [os.tmpdir(), process.cwd(), os.homedir()]) walkNew(d, startedAt, d === os.homedir() ? 1 : 3, fresh);
  for (const f of fresh) {
    try {
      if (readFileSync(f).indexOf(original.subarray(0, 64)) >= 0) problems.push(`a file holds the take: ${f}`);
    } catch {
      // unreadable: not ours
    }
  }
  return problems;
}

/** Planted violations: each must be caught (statically, by the run, or both). */
export const VOICE_PLANTS: { name: string; plant: (s: string) => string }[] = [
  { name: 'a log of the take', plant: (s) => s.replace('const takeSha256 = deps.sha256(take);', "const takeSha256 = deps.sha256(take);\n    console.log('take', Buffer.from(take).toString('base64'));") },
  { name: 'a storage put of the take', plant: (s) => s.replace('const takeSha256 = deps.sha256(take);', "const takeSha256 = deps.sha256(take);\n    (await import('node:fs')).writeFileSync((await import('node:os')).tmpdir() + '/voice-planted-take.bin', take);") },
  { name: 'a transcription of the take', plant: (s) => s.replace('let historyDeleted = false;', 'await deps.transcribe(take);\n    let historyDeleted = false;') },
  { name: 'a skipped transcript delete', plant: (s) => s.replace("(await deps.deleteTranscript(transcriptionId)) === 'gone'", 'true') },
  { name: 'a skipped history delete', plant: (s) => s.replace("(await deps.deleteHistory(out.historyItemId)) === 'gone'", 'true') },
  { name: 'no retry while the history item is not written yet', plant: (s) => s.replace('for (const wait of [0, 1000, 3000, 6000])', 'for (const wait of [0])') },
  { name: 'the take not zeroed', plant: (s) => s.replace('take.fill(0);', '') },
  { name: 'transcription without the converted-audio check', plant: (s) => s.replace('if (sha !== convert.convertedSha256 || sha === convert.takeSha256) throw', 'if (false) throw') },
  { name: 'the take in the signed record', plant: (s) => s.replace('takeSha256,\n      convertedSha256,', "takeSha256,\n      takeCopy: Array.from(take).join(','),\n      convertedSha256,") },
  { name: 'the take in a cost entry', plant: (s) => s.replace("await deps.cost({ kind: 'convert', ok: true,", "await deps.cost({ take, kind: 'convert', ok: true,") },
];

/** Planted violations in the conversion route (2026-11-22): each must be caught statically. */
export const VOICE_ROUTE_PLANTS: { name: string; plant: (s: string) => string }[] = [
  { name: 'the take kept as the draft', plant: (s) => s.replace('keepConvertedTake(sql, who.fid, { audio, ticket })', 'keepConvertedTake(sql, who.fid, { audio: new Uint8Array(await file.arrayBuffer()), ticket })') },
  { name: 'the take saved straight to a draft', plant: (s) => s.replace('const kept = await keepConvertedTake(sql, who.fid, { audio, ticket });', "const kept = await keepConvertedTake(sql, who.fid, { audio, ticket });\n    await saveDraft(sql, { fid: who.fid, kind: 'performance', speechId: speech.id, presetId, recipe: {}, audio: [] });") },
];

/** Every check at once: the real files pass, and each plant is caught. */
export async function voiceProof(root: string): Promise<{ real: string[]; missed: string[] }> {
  const flow = readFileSync(path.join(root, FLOW_FILE), 'utf8');
  const route = readFileSync(path.join(root, ROUTE_FILE), 'utf8');
  const real = [...voiceStatic(flow, route), ...(await voiceRun(root))];
  const missed: string[] = [];
  for (const p of VOICE_PLANTS) {
    const planted = p.plant(flow);
    if (planted === flow) {
      missed.push(`${p.name}: the plant no longer applies to the file (update VOICE_PLANTS)`);
      continue;
    }
    const caught = [...voiceStatic(planted, route), ...(await voiceRun(root, planted).catch((e) => [`run failed: ${String(e)}`]))];
    if (!caught.length) missed.push(p.name);
  }
  for (const p of VOICE_ROUTE_PLANTS) {
    const planted = p.plant(route);
    if (planted === route) {
      missed.push(`${p.name}: the plant no longer applies to the route (update VOICE_ROUTE_PLANTS)`);
      continue;
    }
    if (!voiceStatic(flow, planted).length) missed.push(p.name);
  }
  rmSync(path.join(os.tmpdir(), 'voice-planted-take.bin'), { force: true });
  return { real, missed };
}
