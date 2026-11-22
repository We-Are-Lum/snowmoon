/**
 * Names in transcription (Nate, 2026-11-21: "Lord Ephelion" came back "Mortifelian"). A synthetic clip (macOS `say`,
 * the book's words, no one's voice), converted once into a picked preset (the real path), then transcribed four ways:
 * scribe_v1, scribe_v2, and scribe_v2 / scribe_v3 with the speech's names as `keyterms`. Measured: credits (header) for
 * the conversion, against its estimate (stops above 20% over); the dollar header for each transcription. History deleted.
 *   node --env-file=<key file> --import tsx scripts/voice-names-test.ts --out=<dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY || !out) throw new Error('needs the key and --out');
mkdirSync(out, { recursive: true });
const H = { 'xi-api-key': KEY };
const API = 'https://api.elevenlabs.io';
// c13-b64's own words: the sign-off and a sentence with two names.
const TEXT = "Maybe not Dreadknot - but that's exactly why Dreadknot's taxes were bumped up to tier 4 in the audit last year. With regards, Lord Ephelion, Arctic Empire consul to Veridia.";
const KEYTERMS = ['Lord Ephelion', 'Ephelion', 'Dreadknot', 'Veridia', 'Arctic Empire'];
const VOICE = 'GJNXe6evoJS9rblaWDwx'; // Warm lecturer (picked, saved)
const report: Record<string, unknown>[] = [];
const save = () => writeFileSync(path.join(out, 'names-test.json'), JSON.stringify(report, null, 2));

execFileSync('say', ['-o', path.join(out, 'names.aiff'), TEXT]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(out, 'names.aiff'), '-c:a', 'libopus', '-b:a', '48k', path.join(out, 'names.webm')]);
const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(out, 'names.webm')]).toString());
const estimate = Math.ceil(seconds * 11.1);
console.log(`clip ${seconds.toFixed(2)} s; convert estimate ${estimate} credits; stop above ${Math.floor(estimate * 1.2)}`);

const f = new FormData();
f.set('audio', new Blob([readFileSync(path.join(out, 'names.webm'))], { type: 'audio/webm' }), 'take.webm');
f.set('model_id', 'eleven_multilingual_sts_v2');
f.set('voice_settings', JSON.stringify({ stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }));
const c = await fetch(`${API}/v1/speech-to-speech/${VOICE}?output_format=mp3_44100_128`, { method: 'POST', headers: H, body: f });
if (!c.ok) throw new Error(`convert ${c.status}: ${(await c.text()).slice(0, 200)}`);
const converted = new Uint8Array(await c.arrayBuffer());
const credits = Number(c.headers.get('character-cost'));
const hid = c.headers.get('history-item-id');
let history = 'none';
if (hid) {
  const d = await fetch(`${API}/v1/history/${hid}`, { method: 'DELETE', headers: H });
  const g = await fetch(`${API}/v1/history/${hid}`, { headers: H });
  history = d.ok && g.status === 400 ? 'deleted, confirmed gone' : `delete ${d.status}, read back ${g.status}`;
}
writeFileSync(path.join(out, 'names-converted.mp3'), converted);
report.push({ call: 'convert', seconds, estimate, credits, history });
save();
console.log(`convert: ${credits} credits (estimate ${estimate}); history ${history}`);
if (credits > estimate * 1.2) {
  console.log('STOPPED: more than 20% over the estimate');
  process.exit(2);
}

for (const [model, terms] of [['scribe_v1', null], ['scribe_v2', null], ['scribe_v2', KEYTERMS], ['scribe_v3', KEYTERMS]] as const) {
  const t = new FormData();
  t.set('file', new Blob([converted], { type: 'audio/mpeg' }), 'converted.mp3');
  t.set('model_id', model);
  t.set('timestamps_granularity', 'word');
  t.set('tag_audio_events', 'false');
  if (terms) for (const k of terms) t.append('keyterms', k);
  const r = await fetch(`${API}/v1/speech-to-text`, { method: 'POST', headers: H, body: t });
  const body = r.ok ? ((await r.json()) as { text: string; words?: { text: string; type: string }[] }) : null;
  const row = { call: `transcribe ${model}${terms ? ' + keyterms' : ''}`, status: r.status, credits: r.headers.get('character-cost'), fiat: r.headers.get('fiat-cost-before-overages'), text: body?.text ?? (await r.text().catch(() => '')).slice(0, 200) };
  report.push(row);
  save();
  console.log(`${row.call}: HTTP ${row.status}; credits ${row.credits}; fiat ${row.fiat}; heard: ${row.text}`);
}
