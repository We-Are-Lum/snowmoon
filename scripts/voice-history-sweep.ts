/**
 * Backstop (2026-11-21): ElevenLabs writes a generation's history item after it answers, so a delete right away can
 * miss it (the site retries for about 10 seconds; see take-flow.ts). This lists the account's recent history and deletes
 * every speech-to-speech or text-to-speech item made with the edition's preset voices or the test voice, then reads
 * each back. Costs nothing. Prints counts only, never a transcript.
 *   node --env-file=<key file> --import tsx scripts/voice-history-sweep.ts [--hours=24] [--dry]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('needs ELEVENLABS_API_KEY');
const hours = Number(process.argv.find((a) => a.startsWith('--hours='))?.slice(8) ?? 24);
const dry = process.argv.includes('--dry');
const H = { 'xi-api-key': KEY };
const ROOT = path.resolve(import.meta.dirname, '..');
const presets = JSON.parse(readFileSync(path.join(ROOT, 'config/voice-presets.json'), 'utf8')).presets as { voiceId: string | null }[];
const voices = new Set([...presets.map((p) => p.voiceId).filter(Boolean), 'CwhRBWXzGAHq8TQ4Fs17' /* the test voice, Roger */] as string[]);
const r = await fetch('https://api.elevenlabs.io/v1/history?page_size=100', { headers: H });
if (!r.ok) throw new Error(`history list answered ${r.status}`);
const items = ((await r.json()) as { history: { history_item_id: string; source?: string; voice_id?: string | null; date_unix: number }[] }).history.filter(
  (h) => h.voice_id && voices.has(h.voice_id) && (h.source === 'STS' || h.source === 'TTS') && h.date_unix * 1000 > Date.now() - hours * 3600_000,
);
let gone = 0;
for (const h of items) {
  if (dry) continue;
  const d = await fetch(`https://api.elevenlabs.io/v1/history/${h.history_item_id}`, { method: 'DELETE', headers: H });
  const g = await fetch(`https://api.elevenlabs.io/v1/history/${h.history_item_id}`, { headers: H });
  if (d.ok && g.status === 400) gone++;
}
console.log(`${items.length} item(s) of ours in the last ${hours} h${dry ? ' (dry run)' : `; ${gone} deleted and confirmed gone`}`);
