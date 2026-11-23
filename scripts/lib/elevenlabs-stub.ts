/**
 * A stand-in for ElevenLabs' API (the voice slice's tests and screenshots; no network, no spending). The same paths
 * the site calls (src/lib/voice/elevenlabs.ts), and a record of everything each one received, so a test can see where
 * each recording went.
 * - POST /v1/speech-to-speech/:voice (optionally after a delay, --convert-delay-ms): answers a WAV tone (not the input), as long as the input "sounds" (bytes / 4000
 *   seconds by default, 1 to 300; 8 kHz, so a long take stays under the 4.5 MB request limit), with a history-item-id and a character-cost (1,000 a minute).
 * - DELETE /v1/history/:id
 * - DELETE /v1/speech-to-text/transcripts/:id (each transcription's stored transcript, as ElevenLabs keeps one)
 * - POST /v1/speech-to-text: reads its WAV's length. 30 s or more: the whole speech's words with even timings, with one
 *   sentence (mismatch, default 3) said wrong; shorter: that sentence, right. (The stub's own convention: the real
 *   service hears the audio.)
 * - POST /v1/text-to-speech/:voice: a tone as long as the text would take to read (about 14 characters a second, 5 to
 *   180 s, so a whole speech's reading can be timed), character-cost = the text's length.
 * - GET /v1/user/subscription: { character_count }.
 *
 *   tsx scripts/lib/elevenlabs-stub.ts --port=54390   (the screenshot run)
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sentencesOf } from '../../src/lib/voice/match';

export interface StubCall { method: string; path: string; fields: Record<string, string>; files: { name: string; type: string; bytes: Buffer; sha256: string }[]; json?: unknown }

const ROOT = path.resolve(import.meta.dirname, '../..');

function speechSentences() {
  const ch = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/text/chapter-13.json'), 'utf8')) as { blocks: { idx: number; content: string }[] };
  const html = ch.blocks.find((b) => b.idx === 64)!.content;
  const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const title = strip(html.match(/<b>([\s\S]*?)<\/b>/)![1]);
  return sentencesOf([title, ...[...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1]))]);
}

export function tone(seconds: number, hz = 220, rate = 8000): Buffer {
  const n = Math.max(1, Math.round(seconds * rate));
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 6000 * (0.6 + 0.4 * Math.sin(i / 4000))), 44 + i * 2);
  return b;
}
const wavSeconds = (b: Buffer) => (b.length > 44 && b.toString('ascii', 0, 4) === 'RIFF' ? b.readUInt32LE(40) / 2 / b.readUInt32LE(24) : 0);

function multipart(body: Buffer, type: string) {
  const boundary = type.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
  const fields: Record<string, string> = {};
  const files: StubCall['files'] = [];
  if (!boundary) return { fields, files };
  const sep = Buffer.from(`--${boundary}`);
  let i = body.indexOf(sep);
  while (i >= 0) {
    const next = body.indexOf(sep, i + sep.length);
    if (next < 0) break;
    const part = body.subarray(i + sep.length + 2, next - 2);
    const h = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, h).toString();
    const data = part.subarray(h + 4);
    const name = head.match(/name="([^"]+)"/)?.[1] ?? '';
    if (/filename="/.test(head)) files.push({ name, type: head.match(/Content-Type:\s*(\S+)/i)?.[1] ?? '', bytes: Buffer.from(data), sha256: createHash('sha256').update(data).digest('hex') });
    else fields[name] = data.toString();
    i = next;
  }
  return { fields, files };
}

export async function startStub(port: number, opts: { mismatch?: number | null; failConvert?: boolean; failTranscribe?: boolean; bytesPerSecond?: number; convertDelayMs?: number } = {}) {
  const calls: StubCall[] = [];
  const deleted: string[] = [];
  const tried = new Set<string>();
  const transcripts = new Set<string>();
  const deletedTranscripts: string[] = [];
  let used = 25_897;
  let seq = 0;
  const sentences = speechSentences();
  const mismatch = opts.mismatch === undefined ? 3 : opts.mismatch;
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? '/', 'http://stub');
    const call: StubCall = { method: req.method ?? '', path: url.pathname, fields: {}, files: [] };
    if (/multipart/.test(req.headers['content-type'] ?? '')) Object.assign(call, multipart(body, req.headers['content-type']!));
    else if (body.length) call.json = JSON.parse(body.toString());
    calls.push(call);
    const send = (status: number, b: Buffer | string, headers: Record<string, string> = {}) => {
      res.writeHead(status, headers);
      res.end(b);
    };
    if (req.headers['xi-api-key'] === undefined) return send(401, 'no key');
    if (req.method === 'GET' && url.pathname === '/v1/user/subscription') return send(200, JSON.stringify({ character_count: used }), { 'content-type': 'application/json' });
    if (req.method === 'DELETE' && url.pathname.startsWith('/v1/history/')) {
      // Like ElevenLabs (2026-11-21): the item is written a moment after the answer, so the first delete finds nothing.
      const id = decodeURIComponent(url.pathname.split('/').pop()!);
      if (!tried.has(id)) {
        tried.add(id);
        return send(404, '{"detail":"not found"}', { 'content-type': 'application/json' });
      }
      deleted.push(id);
      return send(200, '{}', { 'content-type': 'application/json' });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/v1/speech-to-text/transcripts/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop()!);
      if (!transcripts.has(id)) return send(404, '{"detail":{"code":"transcript_not_found"}}', { 'content-type': 'application/json' });
      transcripts.delete(id);
      deletedTranscripts.push(id);
      return send(200, '{}', { 'content-type': 'application/json' });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/v1/speech-to-speech/')) {
      if (opts.failConvert) return send(500, 'stub: failed, and this text quotes the input');
      // A slow conversion, so a test can leave mid-flight (Nate, 2026-11-22).
      if (opts.convertDelayMs) await new Promise((r) => setTimeout(r, opts.convertDelayMs));
      const input = call.files[0]?.bytes ?? Buffer.alloc(0);
      const seconds = Math.min(300, Math.max(1, input.length / (opts.bytesPerSecond ?? 4000)));
      // As measured on the first real calls (2026-11-20): about 665 credits a minute.
      const cost = Math.ceil((seconds / 60) * 665);
      used += cost;
      return send(200, tone(seconds, 180), { 'content-type': 'audio/mpeg', 'history-item-id': `stubhist${++seq}`, 'character-cost': String(cost) });
    }
    if (req.method === 'POST' && url.pathname === '/v1/speech-to-text') {
      if (opts.failTranscribe) return send(500, 'stub: transcription failed');
      const seconds = wavSeconds(call.files[0]?.bytes ?? Buffer.alloc(0));
      const pick = seconds >= 30 ? sentences : sentences.filter((s) => s.n === (mismatch ?? 3));
      const all = pick.flatMap((s) => s.words.map((w, k) => (seconds >= 30 && s.n === mismatch && k === 1 ? 'weakness' : w)));
      const step = (seconds || 1) / Math.max(1, all.length);
      const words = all.flatMap((w, k) => [{ text: w, start: k * step, end: k * step + step * 0.8, type: 'word' }, { text: ' ', start: k * step + step * 0.8, end: (k + 1) * step, type: 'spacing' }]);
      // As measured 2026-11-21: about 0.4 credits a second with keyterms.
      const transcriptionId = `stubstt${++seq}`;
      transcripts.add(transcriptionId);
      return send(200, JSON.stringify({ text: all.join(' '), words, transcription_id: transcriptionId }), { 'content-type': 'application/json', 'character-cost': String(Math.ceil(seconds * 0.4)) });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/v1/text-to-speech/')) {
      const text = String((call.json as { text?: string })?.text ?? '');
      // As measured: 0.46 credits a character.
      const cost = Math.ceil(text.length * 0.46);
      used += cost;
      return send(200, tone(Math.min(180, Math.max(5, text.length / 14)), 140), { 'content-type': 'audio/mpeg', 'history-item-id': `stubtts${++seq}`, 'character-cost': String(cost) });
    }
    send(404, 'stub: no such path');
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  return { calls, deleted, deletedTranscripts, kept: () => [...transcripts], close: () => new Promise<void>((r) => server.close(() => r())), setFail: (v: boolean) => (opts.failConvert = v), setFailTranscribe: (v: boolean) => (opts.failTranscribe = v), setConvertDelay: (ms: number) => (opts.convertDelayMs = ms) };
}

if (process.argv[1] && /elevenlabs-stub\.ts$/.test(process.argv[1])) {
  const port = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 54390);
  // Chromium's fake microphone, as WebM/Opus, makes about 12 kB a second.
  await startStub(port, { bytesPerSecond: Number(process.argv.find((a) => a.startsWith('--bytes-per-second='))?.split('=')[1] ?? 12000), convertDelayMs: Number(process.argv.find((a) => a.startsWith('--convert-delay-ms='))?.split('=')[1] ?? 0) });
  console.log(`ElevenLabs stub on http://127.0.0.1:${port}`);
}
