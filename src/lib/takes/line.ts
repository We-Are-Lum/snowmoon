import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A line as "Record your own takes" needs it, from the version's committed editor data
 * (public/editor/<id>/v<n>/data.json, traced into /api/takes by next.config.ts): who speaks it, its
 * words, and the character's voice to convert into. The target voice is the character's own converted
 * take already published with the version (the longest one in the version), never the private voice
 * sheet recording.
 */
type DataTake = { id: string; voice: string; inVersion: boolean; src: string; sha256: string };
type DataLine = { cue: string; speaker?: string; text?: string; takes?: DataTake[]; voice?: { src: string; name?: string; sha256?: string } | null };
type Data = { adaptation: number; version: number; shots: { lines?: DataLine[] }[] };

const cache = new Map<string, Data | null>();
function data(adaptation: number, version: number): Data | null {
  const key = `${adaptation}/${version}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'editor', String(adaptation), `v${version}`, 'data.json'), 'utf8')));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key)!;
}

export interface TakeLine {
  cue: string;
  speaker: string;
  text: string;
  /** The published voice to convert into: a served file under /editor/, with its sha256. */
  target: { src: string; sha256: string; name: string };
}

const served = (u: string | undefined) => !!u && /^\/editor\/\d+\/v\d+\/[\w./-]+\.(wav|m4a|mp3)$/.test(u) && !u.includes('..');

export function takeLine(adaptation: number, version: number, cue: string): TakeLine | null {
  if (!/^[A-Za-z0-9-]{1,32}$/.test(cue)) return null;
  const d = data(adaptation, version);
  if (!d) return null;
  const lines = d.shots.flatMap((s) => s.lines ?? []);
  const line = lines.find((l) => l.cue === cue);
  if (!line?.speaker || !line.text) return null;
  // The character's voice as published with this version: its voice on this line, else on any line of theirs.
  const own = lines.filter((l) => l.speaker === line.speaker && l.voice && served(l.voice.src) && l.voice.sha256);
  const pick = (line.voice && served(line.voice.src) && line.voice.sha256 ? line : own[0]) ?? null;
  if (!pick?.voice?.sha256) return null;
  return { cue, speaker: line.speaker, text: line.text, target: { src: pick.voice.src, sha256: pick.voice.sha256, name: pick.voice.name ?? line.speaker } };
}
