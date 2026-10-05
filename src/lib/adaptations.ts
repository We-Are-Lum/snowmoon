import 'server-only';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { loadChapter } from './book';
import { citeHref, findCites, linkCites } from './adaptation-cites';
import { BOOK_TAG, PERSON_TAG, parseBeats } from './script-beats';

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

export interface Approval {
  fid: number;
  on: string; // YYYY-MM-DD
}

export interface SeedDocs {
  brief: string;
  /** Rendered only once approved (docs/adaptation-format.md). */
  script: string | null;
  approval: Approval | null;
  /** Shown only alongside an approved script. */
  shots: string | null;
  /** The piece itself, once approved: images and the lines people chose or wrote. */
  piece: PiecePanel[] | null;
}

/** A line of the piece: the book's words (with a link to the block) or a signed-in person's. */
export type PieceLine =
  | { text: string; from: 'book'; id: string; href: string }
  | { text: string; from: 'person'; fid: number; on: string };

export interface PiecePanel {
  n: number;
  /** From adaptations/<seed>/panels.json; alt text is model-drafted and says so. */
  image: { url: string; width: number; height: number; alt: string; recipe: string } | null;
  narration: PieceLine[];
  dialogue: PieceLine[];
}

/**
 * Only lines with a human author tag reach the piece (principle 2). Beat titles,
 * candidates and the rest of the structure are working notes, shown elsewhere.
 */
function pieceLine(tag: string | null, text: string): PieceLine | null {
  const book = tag?.match(BOOK_TAG);
  if (book) {
    const [, ch, idx] = book[1].match(/^c(\d+)-b(\d+)$/)!;
    return { text, from: 'book', id: book[1], href: citeHref({ id: book[1], chapter: Number(ch), idx: Number(idx) }) };
  }
  const person = tag?.match(PERSON_TAG);
  return person ? { text, from: 'person', fid: Number(person[1]), on: person[2] } : null;
}

function buildPiece(script: string, folder: string): PiecePanel[] {
  const panels = JSON.parse(readOptional(path.join(folder, 'panels.json')) ?? '{"panels":[]}').panels as ({ beat: number } & NonNullable<PiecePanel['image']>)[];
  return parseBeats(script).map((beat) => {
    const p = panels.find((x) => x.beat === beat.n);
    return {
      n: beat.n,
      image: p ? { url: p.url, width: p.width, height: p.height, alt: p.alt, recipe: p.recipe } : null,
      narration: beat.narration.map((l) => pieceLine(l.tag, l.text)).filter((l): l is PieceLine => !!l),
      dialogue: beat.dialogue.map((l) => pieceLine(l.tag, l.text)).filter((l): l is PieceLine => !!l),
    };
  });
}

/**
 * A script is approved when its header carries the line
 *   > **Approved** by FID <n> on <YYYY-MM-DD>.
 * An AI-drafted or unapproved script is never shown, and its citations do not
 * mark the reader (principle 4; owner decision, Oct 5, 2026).
 */
export function scriptApproval(markdown: string): Approval | null {
  const m = markdown.match(/^>\s*\*\*Approved\*\*\s+by FID (\d+) on (\d{4}-\d{2}-\d{2})\b/m);
  return m ? { fid: Number(m[1]), on: m[2] } : null;
}

/** The seed's brief, and its script and shot list when the folder has them, rendered. */
export function seedDocs(slug: string, dir = DIR): SeedDocs | null {
  const folder = path.join(dir, slug);
  const brief = readOptional(path.join(folder, 'brief.md'));
  if (brief === null) return null;
  const script = readOptional(path.join(folder, 'script.md'));
  const approval = script === null ? null : scriptApproval(script);
  const shots = approval ? readOptional(path.join(folder, 'shots.md')) : null;
  return {
    brief: renderDoc(brief),
    script: approval && script !== null ? renderDoc(script) : null,
    approval,
    shots: shots === null ? null : renderDoc(shots),
    piece: approval && script !== null ? buildPiece(script, folder) : null,
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

/**
 * Which adaptations cite which blocks of a chapter, from every .md file in each
 * seed's folder (brief, script, shot list). The reader marks those blocks with a
 * link to the adaptation. Titles are spoiler-free by rule (config about), and the
 * adaptation pages keep their own spoiler warning.
 */
let citeIndex: Map<string, Seed[]> | null = null;
export function adaptationsCiting(chapter: number, idx: number): Seed[] {
  if (!citeIndex) {
    citeIndex = new Map();
    for (const seed of adaptationsConfig().seeds) {
      const folder = path.join(DIR, seed.slug);
      if (!existsSync(folder)) continue;
      const ids = new Set<string>();
      for (const f of readdirSync(folder).filter((f) => f.endsWith('.md'))) {
        const text = readFileSync(path.join(folder, f), 'utf8');
        // Unapproved scripts (and their shot lists) do not mark the reader.
        if ((f === 'script.md' || f === 'shots.md') && !scriptApproval(readOptional(path.join(folder, 'script.md')) ?? '')) continue;
        for (const c of findCites(text)) ids.add(c.id);
      }
      for (const id of ids) citeIndex.set(id, [...(citeIndex.get(id) ?? []), seed]);
    }
  }
  return citeIndex.get(`c${chapter}-b${idx}`) ?? [];
}
