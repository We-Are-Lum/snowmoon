/**
 * The first real ElevenLabs calls (Nate, 2026-11-20 morning): one of each kind the voice slice makes (convert,
 * transcribe, reading) with the shortest clip, each measured in credits against its estimate before the next. If one
 * costs more than 20% over its estimate, it stops before the next and says so (owner's standing rule, 2026-11-20).
 * Never prints the key. The clip is a synthetic voice (macOS `say`) reading the book's words, never a person's voice.
 * Each generation is deleted from the account's history after. Nothing is stored by the site.
 *
 *   node --env-file=<file with ELEVENLABS_API_KEY> --import tsx scripts/voice-first-calls.ts --voice=<voice id> --out=<dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const voice = arg('voice');
const out = arg('out');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY || !voice || !out) throw new Error('needs ELEVENLABS_API_KEY in the environment, --voice and --out');
mkdirSync(out, { recursive: true });
const API = 'https://api.elevenlabs.io';
const H = { 'xi-api-key': KEY };
const RULE = 1.2;
const report: Record<string, unknown>[] = [];
const save = () => writeFileSync(path.join(out, 'first-calls.json'), JSON.stringify(report, null, 2));

async function used(): Promise<number> {
  const r = await fetch(`${API}/v1/user/subscription`, { headers: H });
  if (!r.ok) throw new Error(`subscription: ${r.status}`);
  return ((await r.json()) as { character_count: number }).character_count;
}
async function measure(name: string, estimate: number, run: () => Promise<Response>) {
  const before = await used();
  const res = await run();
  const header = res.headers.get('character-cost') ?? res.headers.get('x-character-cost');
  const body = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  const status = res.status;
  const errorText = res.ok ? null : new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()).slice(0, 300));
  // The account's count can lag behind a call: with no header, wait up to 90 s for it to move.
  let after = await used();
  for (let i = 0; header === null && after === before && i < 9; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    after = await used();
  }
  const credits = header !== null ? Number(header) : after - before;
  const row = { call: name, status, estimate, credits, fromHeader: header !== null, accountDelta: after - before, historyItemId: res.headers.get('history-item-id'), requestId: res.headers.get('request-id'), headers: [...res.headers.keys()].filter((k) => !/cookie|key/i.test(k)), errorText, overEstimate: credits > RULE * estimate };
  report.push(row);
  save();
  console.log(`${name}: HTTP ${status}, ${credits} credits (estimate ${estimate}${header !== null ? ', from the header' : ', from the account before/after'})`);
  return { row, body };
}
async function deleteHistory(id: string | null) {
  if (!id) return 'no history id';
  const r = await fetch(`${API}/v1/history/${id}`, { method: 'DELETE', headers: H });
  if (!r.ok) return `delete answered ${r.status}: ${(await r.text()).slice(0, 200)}`;
  // Confirm: the item reads as missing now (needs history read; a 401/403 says the key lacks it).
  const g = await fetch(`${API}/v1/history/${id}`, { headers: H });
  return `deleted; reading it back answered ${g.status}${g.status === 404 ? ' (gone)' : g.ok ? ' (STILL THERE)' : ''}`;
}
const stop = (why: string) => {
  report.push({ stopped: why });
  save();
  console.log(`STOPPED: ${why}`);
  process.exit(2);
};

// The clip: "With regards, Lord Ephelion." (c13-b64), a synthetic voice, as Chrome records it (WebM/Opus).
const aiff = path.join(out, 'clip.aiff');
const webm = path.join(out, 'clip.webm');
execFileSync('say', ['-o', aiff, 'With regards, Lord Ephelion.']);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-c:a', 'libopus', '-b:a', '48k', webm]);
const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString().trim());
const clip = readFileSync(webm);
console.log(`clip: ${seconds.toFixed(2)} s, ${clip.length} bytes, WebM/Opus`);

// 1. Convert.
const convertEstimate = Math.ceil((seconds / 60) * 1000);
const c = await measure('convert (eleven_multilingual_sts_v2)', convertEstimate, () => {
  const f = new FormData();
  f.set('audio', new Blob([clip], { type: 'audio/webm' }), 'take.webm');
  f.set('model_id', 'eleven_multilingual_sts_v2');
  f.set('voice_settings', JSON.stringify({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }));
  f.set('remove_background_noise', 'false');
  return fetch(`${API}/v1/speech-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: H, body: f });
});
(c.row as Record<string, unknown>).history = await deleteHistory(c.row.historyItemId);
save();
if (!c.body) stop(`convert failed: HTTP ${c.row.status}`);
writeFileSync(path.join(out, 'converted.mp3'), c.body!);
if (c.row.overEstimate) stop(`convert cost ${c.row.credits} credits, more than 20% over its estimate of ${convertEstimate}`);

// 2. Transcribe (the converted audio only).
const t = await measure('transcribe (scribe_v1)', 1, () => {
  const f = new FormData();
  f.set('file', new Blob([c.body!], { type: 'audio/mpeg' }), 'converted.mp3');
  f.set('model_id', 'scribe_v1');
  f.set('timestamps_granularity', 'word');
  f.set('tag_audio_events', 'false');
  return fetch(`${API}/v1/speech-to-text`, { method: 'POST', headers: H, body: f });
});
if (t.body) (t.row as Record<string, unknown>).words = (JSON.parse(new TextDecoder().decode(t.body)) as { words?: { text: string; start: number; end: number; type: string }[] }).words?.filter((w) => w.type === 'word');
save();
if (!t.body) stop(`transcribe failed: HTTP ${t.row.status}`);
if (t.row.overEstimate) stop(`transcribe cost ${t.row.credits} credits, more than 20% over its estimate of 1`);

// 3. Reading: the shortest sentence of c13-b64.
const text = 'With regards,';
const r = await measure('reading (eleven_multilingual_v2)', text.length, () =>
  fetch(`${API}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true } }) }),
);
(r.row as Record<string, unknown>).history = await deleteHistory(r.row.historyItemId);
save();
if (r.body) writeFileSync(path.join(out, 'reading.mp3'), r.body);
if (r.row.overEstimate) stop(`reading cost ${r.row.credits} credits, more than 20% over its estimate of ${text.length}`);
console.log('all three done; report in first-calls.json');
