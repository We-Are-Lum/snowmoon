import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Moment pages (owner, 2026-10-19; docs: "Snowmoon: moment pages for Fifteen Days", v3). A moment is one
 * shot of an adaptation; its page lays every version of that shot side by side. Read only: everything
 * here comes from each version's committed editor data (public/editor/<id>/v<n>/data.json, made at build
 * time by scripts/editor-data.mjs and traced into these routes by next.config.ts). Nothing is stored.
 */
export interface MomentLine {
  speaker: string;
  text: string;
  /** Whose words: the book's, or a person's (their handle and date). */
  by: { kind: string; handle?: string; on?: string; cite?: string } | null;
}
export interface MomentShot {
  id: string;
  n: number;
  from: number;
  to: number;
  frame: string | null;
  thumb: string | null;
  picture: string | null;
  lines: MomentLine[];
  prev: string | null;
  next: string | null;
  total: number;
  /** The open-weight version this one's pictures were redrawn from (version 2 from version 1), if any. */
  openFrom: number | null;
}

type DataShot = { id: string; n: number; from: number; to: number; frame?: string | null; thumb?: string | null; picture?: string | null; lines?: { speaker?: string; text?: string; by?: MomentLine['by'] }[] };
type Data = { shots: DataShot[]; openFrom?: number | null };
const cache = new Map<string, Data | null>();

function editorData(adaptation: number, version: number): Data | null {
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

/** Only the editor's own files, never anything else a data file might name. */
const ownFile = (u: string | null | undefined) => (u && /^\/editor\/\d+\/v\d+\/[\w./-]+\.(jpg|png)$/.test(u) && !u.includes('..') ? u : null);

export const isShotId = (s: string) => /^[\w-]{1,40}$/.test(s);

/** One version's shot, or null if that version's data doesn't have it. */
export function momentShot(adaptation: number, version: number, shotId: string): MomentShot | null {
  if (!isShotId(shotId)) return null;
  const d = editorData(adaptation, version);
  if (!d) return null;
  const i = d.shots.findIndex((s) => s.id === shotId);
  if (i < 0) return null;
  const s = d.shots[i];
  return {
    id: s.id,
    n: s.n,
    from: s.from,
    to: s.to,
    frame: ownFile(s.frame),
    thumb: ownFile(s.thumb),
    picture: s.picture ?? null,
    lines: (s.lines ?? []).filter((l) => l.text).map((l) => ({ speaker: l.speaker ?? '', text: l.text!, by: l.by ?? null })),
    prev: d.shots[i - 1]?.id ?? null,
    next: d.shots[i + 1]?.id ?? null,
    total: d.shots.length,
    openFrom: d.openFrom ?? null,
  };
}
