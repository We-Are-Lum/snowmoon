import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK } from './config';

/**
 * The house narration for a chapter, as the player needs it: the stitched
 * chapter file and when each block starts and ends in it.
 *
 * Reads the published index (content/snowmoon/narration/<voice>/chapter-N.json),
 * which scripts/publish-narration.ts writes from the same recipes that
 * scripts/seed-narration.ts puts in the database. The database holds the
 * per-block records (narration_segments, house_narrations); the index adds the
 * timings inside the stitched file, which the database does not store.
 */
export const HOUSE_VOICE = 'kokoro-af_heart';

export interface Cue {
  idx: number;
  start: number; // seconds into the chapter file (a description's tone included)
  end: number;
  /** Set when the narration speaks a description of a screen, figure or lyric card, not the book's words. */
  description?: string;
}

/** Spoken text without the pronunciation markup: "[Zei](/zˈA/)" -> "Zei". */
const plain = (t: string) => t.replace(/\[([^\]]+)\]\(\/[^)]*\/\)/g, '$1');

export interface ChapterNarration {
  label: string;
  url: string;
  bytes: number;
  duration: number;
  cues: Cue[];
}

export function loadNarration(n: number): ChapterNarration | null {
  const file = path.join(process.cwd(), 'content', WORK.id, 'narration', HOUSE_VOICE, `chapter-${n}.json`);
  if (!existsSync(file)) return null;
  const index = JSON.parse(readFileSync(file, 'utf8'));
  const cues: Cue[] = index.segments.map(
    (s: { idx: number; start_ms: number; duration_ms: number; tone_ms?: number; read_aloud_status?: string; text: string }) => ({
      idx: s.idx,
      start: s.start_ms / 1000,
      end: (s.start_ms + (s.tone_ms ?? 0) + s.duration_ms) / 1000,
      ...(s.read_aloud_status ? { description: plain(s.text) } : {}),
    }),
  );
  return {
    label: index.label,
    url: index.chapter_file.url,
    bytes: index.chapter_file.bytes,
    duration: index.chapter_file.duration_ms / 1000,
    cues,
  };
}
