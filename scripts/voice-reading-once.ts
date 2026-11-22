/**
 * One ready-made reading, outside the site (Nate, 2026-11-20): c13-b64 in a saved preset voice, so he can hear a whole
 * speech in it. Measured against its estimate (0.46 credits a character, measured 2026-11-20); the history item is
 * deleted after; the audio and its recipe are written to --out. Never prints the key.
 *   node --env-file=<file with ELEVENLABS_API_KEY> --import tsx scripts/voice-reading-once.ts --preset=<id> --out=<dir>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sentencesOf } from '../src/lib/voice/match';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const presetId = arg('preset');
const out = arg('out');
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY || !presetId || !out) throw new Error('needs the key, --preset and --out');
mkdirSync(out, { recursive: true });
const ROOT = path.resolve(import.meta.dirname, '..');
const presets = JSON.parse(readFileSync(path.join(ROOT, 'config/voice-presets.json'), 'utf8')).presets as { id: string; status: string; voiceId: string; name: string; recipe: Record<string, unknown> }[];
const p = presets.find((x) => x.id === presetId && x.status === 'picked');
if (!p?.voiceId) throw new Error('not a picked, saved preset');
// The speech exactly as src/lib/voice/speech.ts gives it (title, letter, sign-off), joined as the reading route joins it.
const ch = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/text/chapter-13.json'), 'utf8')) as { blocks: { idx: number; content: string }[] };
const html = ch.blocks.find((b) => b.idx === 64)!.content;
const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const paragraphs = [strip(html.match(/<b>([\s\S]*?)<\/b>/)![1]), ...[...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1]))];
void sentencesOf;
const text = paragraphs.join('\n\n');
const estimate = Math.ceil(text.length * 0.46);
const H = { 'xi-api-key': KEY };
const settings = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
console.log(`${text.length} characters; estimate ${estimate} credits; stop above ${Math.floor(estimate * 1.2)}`);
const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${p.voiceId}?output_format=mp3_44100_128`, {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/json' },
  body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings }),
});
if (!res.ok) throw new Error(`reading answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
const audio = Buffer.from(await res.arrayBuffer());
const credits = Number(res.headers.get('character-cost'));
const hid = res.headers.get('history-item-id');
let history = 'no history id';
if (hid) {
  const d = await fetch(`https://api.elevenlabs.io/v1/history/${hid}`, { method: 'DELETE', headers: H });
  const g = d.ok ? await fetch(`https://api.elevenlabs.io/v1/history/${hid}`, { headers: H }) : null;
  history = d.ok ? `deleted; read back ${g?.status} (${g?.status === 400 || g?.status === 404 ? 'gone' : 'CHECK'})` : `delete answered ${d.status}`;
}
const file = `reading-${presetId.replace(/^ephelion-/, '')}.mp3`;
writeFileSync(path.join(out, file), audio);
const recipe = { what: 'Ready-made reading (stand-in): c13-b64, word for word', provider: 'ElevenLabs', closedModel: true, model: 'eleven_multilingual_v2', settings, outputFormat: 'mp3_44100_128', preset: { id: p.id, name: p.name, voiceId: p.voiceId, design: p.recipe }, textSha256: createHash('sha256').update(text).digest('hex'), characters: text.length, audioSha256: createHash('sha256').update(audio).digest('hex'), bytes: audio.length, estimate, credits, history, madeOn: new Date().toISOString() };
writeFileSync(path.join(out, file.replace('.mp3', '.recipe.json')), JSON.stringify(recipe, null, 2));
console.log(`${file}: ${audio.length} bytes; ${credits} credits (header); history ${history}${credits > estimate * 1.2 ? '; MORE THAN 20% OVER: stop' : ''}`);
