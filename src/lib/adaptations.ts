import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { loadChapter } from './book';
import { linkCites } from './adaptation-cites';

/** Shape of config/adaptations.json (checked by scripts/check-adaptations.ts). */
export interface Seed {
  slug: string;
  title: string;
  line: string;
  spoilers_through: number;
  video_url: string | null;
}

export interface AdaptationsConfig {
  bounty: { url: string; closes: string; label: string };
  open_threads: string;
  seeds: Seed[];
}

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'adaptations');

export function adaptationsConfig(): AdaptationsConfig {
  return JSON.parse(readFileSync(path.join(ROOT, 'config', 'adaptations.json'), 'utf8'));
}

export function findSeed(slug: string): Seed | null {
  return adaptationsConfig().seeds.find((s) => s.slug === slug) ?? null;
}

/** Block indexes per chapter, read once, for checking citations before linking them. */
const known = new Map<number, Set<number>>();
function blockExists(chapter: number, idx: number): boolean {
  if (!known.has(chapter)) known.set(chapter, new Set(loadChapter(chapter)?.blocks.map((b) => b.idx) ?? []));
  return known.get(chapter)!.has(idx);
}

/** Markdown from the repo -> HTML, with block citations linked into the reader. */
export function renderDoc(markdown: string): string {
  return linkCites(marked.parse(markdown, { async: false }) as string, blockExists);
}

function readOptional(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export interface SeedDocs {
  brief: string;
  script: string | null;
  shots: string | null;
}

/** The seed's brief, and its script and shot list when the folder has them, rendered. */
export function seedDocs(slug: string): SeedDocs | null {
  const folder = path.join(DIR, slug);
  const brief = readOptional(path.join(folder, 'brief.md'));
  if (brief === null) return null;
  const script = readOptional(path.join(folder, 'script.md'));
  const shots = readOptional(path.join(folder, 'shots.md'));
  return {
    brief: renderDoc(brief),
    script: script === null ? null : renderDoc(script),
    shots: shots === null ? null : renderDoc(shots),
  };
}

export function openThreadsDoc(): string {
  return renderDoc(readFileSync(path.join(ROOT, adaptationsConfig().open_threads), 'utf8'));
}

/** "October 18, 2026", from a YYYY-MM-DD date. */
export function longDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Open through the end of the closing day, UTC. */
export function bountyOpen(closes: string, now = new Date()): boolean {
  return now.getTime() <= Date.parse(`${closes}T23:59:59Z`);
}

/** A direct video file can play inline; anything else is shown as a link. */
export const isVideoFile = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
