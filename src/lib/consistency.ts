import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sheetCharacters } from './images/sheets';

/**
 * Same character, same look (owner, 2026-10-23; branch illustration-consistency): how closely each seeded
 * character image matches that character's cast sheet, measured locally by scripts/consistency/measure.py.
 * Owner-only: read through /api/you/consistency, which answers only for the maintainer (FID 6786). The sheet
 * thumbnails are committed beside the scores (owner, 2026-10-23) and travel inside that answer.
 * The automatic scores are a record only: redos are picked from the by-eye list (owner, 2026-10-23).
 */
const DIR = path.join(process.cwd(), 'content', 'snowmoon', 'consistency');

export interface PairScore {
  character: string;
  found: boolean;
  box?: number[];
  face_box?: number[] | null;
  z?: Record<string, number>;
  combined: number | null;
  within?: number | null;
  robe?: 'closed' | 'open' | null;
  double?: boolean;
  outlier?: string[] | null;
}
export interface ImageScore {
  id: string;
  chapter: number;
  idx?: number;
  characters: string[];
  measured: boolean;
  why?: string;
  url?: string | null;
  excluded?: string | null;
  width?: number;
  height?: number;
  people_found?: number;
  faces_found?: number;
  score?: number | null;
  chars?: PairScore[];
}
export interface Review {
  about: string;
  by: string;
  finding: string;
  problems: { id: string; characters: string[]; note: string }[];
  measured_worst10: Record<string, string>;
  by_design: Record<string, string>;
  trial10: string[];
  trial10_why: string;
}
export interface ConsistencyData {
  about: string;
  models: { repo: string; revision: string | null; license: string; use: string }[];
  weights: Record<string, number>;
  detection: { images: number; with_a_person: number; with_a_face: number; sheet_faces: Record<string, number> };
  worst10: string[];
  images: ImageScore[];
  characters: { slug: string; name: string; sheet: string | null }[];
  review: Review | null;
  /** The trial, side by side, no scores: null where its pictures aren't on this machine (a deploy). */
  trial: TrialRow[] | null;
}

/** The trial's pictures (images-out/trial, local only; scripts/consistency/trial.py). */
const TRIAL = path.join(process.cwd(), 'images-out', 'trial');
export const TRIAL_WAYS = ['a', 'b', 'c', 'c2'] as const;
export interface TrialRow {
  id: string;
  chapter: number;
  /** The published original's public URL. */
  original: string | null;
  /** Way → the picture's file name in images-out/trial, or null if it wasn't made. */
  ways: Record<(typeof TRIAL_WAYS)[number], string | null>;
}
function trialRecipe(): { images: { what: string; image?: string; way?: string; file: string }[] } | null {
  const f = path.join(TRIAL, 'recipe.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}
/** A trial picture's path, only if the trial's recipe lists it (no other file can be named). */
export function trialFile(name: string): string | null {
  if (!/^[a-z0-9-]+\.(a|b|c|c2)\.png$/.test(name)) return null;
  const listed = trialRecipe()?.images.some((im) => im.what === 'trial' && path.basename(im.file) === name);
  const f = path.join(TRIAL, name);
  return listed && existsSync(f) ? f : null;
}

export function consistencyData(): ConsistencyData | null {
  const file = path.join(DIR, 'scores.json');
  if (!existsSync(file)) return null;
  const scores = JSON.parse(readFileSync(file, 'utf8')) as Omit<ConsistencyData, 'characters' | 'review' | 'trial'>;
  const slugs = [...new Set(scores.images.flatMap((i) => i.characters))];
  const names = new Map(sheetCharacters().map((c) => [c.slug, c.name]));
  const characters = slugs
    .map((slug) => {
      const thumb = path.join(DIR, `sheet-${slug}.jpg`);
      const sheet = existsSync(thumb) ? `data:image/jpeg;base64,${readFileSync(thumb).toString('base64')}` : null;
      return { slug, name: names.get(slug) ?? slug, sheet };
    })
    .sort((a, b) => scores.images.filter((i) => i.characters.includes(b.slug)).length - scores.images.filter((i) => i.characters.includes(a.slug)).length);
  // Every figure's raw similarities stay in the file (for --rescore); the page needs only the chosen ones.
  const images = scores.images.map(({ figures: _figures, ...im }: ImageScore & { figures?: unknown }) => im);
  const reviewFile = path.join(DIR, 'review.json');
  const review = existsSync(reviewFile) ? (JSON.parse(readFileSync(reviewFile, 'utf8')) as Review) : null;
  const recipe = trialRecipe();
  const trial = recipe
    ? (review?.trial10 ?? []).map((id): TrialRow => {
        const im = images.find((i) => i.id === id);
        const made = (w: string) => recipe.images.find((r) => r.what === 'trial' && r.image === id && r.way === w);
        return {
          id,
          chapter: im?.chapter ?? 0,
          original: im?.url ?? null,
          ways: Object.fromEntries(TRIAL_WAYS.map((w) => [w, made(w) ? `${id}.${w}.png` : null])) as TrialRow['ways'],
        };
      })
    : null;
  return { ...scores, images, characters, review, trial };
}
