import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK } from './config';

export type BlockKind = 'heading' | 'dateline' | 'paragraph' | 'quote' | 'screen' | 'figure' | 'break';

export interface Block {
  idx: number;
  kind: BlockKind;
  content: string;
  sha256: string;
  /** screen and figure only; shape in scripts/lib/screen-data.ts */
  data?: Record<string, unknown>;
}

export interface Chapter {
  work_id: string;
  chapter: number;
  source_url: string;
  source_sha256: string;
  fetched_at: string;
  license: string;
  blocks: Block[];
}

const TEXT_DIR = path.join(process.cwd(), 'content', WORK.id, 'text');

/** Reads the committed snapshot. The app never reads the live source site. */
export function loadChapter(n: number): Chapter | null {
  if (!Number.isInteger(n) || n < 1 || n > WORK.chapters) return null;
  return JSON.parse(readFileSync(path.join(TEXT_DIR, `chapter-${n}.json`), 'utf8'));
}

export function chapterNumbers(): number[] {
  return Array.from({ length: WORK.chapters }, (_, i) => i + 1);
}

export const blockId = (chapter: number, idx: number) => `c${chapter}-b${idx}`;

/** Plain-text dateline (place · date) for chapter lists. */
export function chapterDateline(ch: Chapter): string {
  const d = ch.blocks.find((b) => b.kind === 'dateline');
  return d ? d.content.replace(/\*\*/g, '').replace(/\\(.)/g, '$1') : '';
}
