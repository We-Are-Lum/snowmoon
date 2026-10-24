import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sheetCharacters } from './images/sheets';

/**
 * Same character, same look (owner, 2026-10-23; branch illustration-consistency): how closely each seeded
 * character image matches that character's cast sheet, measured locally by scripts/consistency/measure.py.
 * Owner-only: read through /api/you/consistency, which answers only for the maintainer (FID 6786). The cast sheets
 * have never been published, so their thumbnails are not in the repository: on the owner's Mac (npm run dev, after
 * measure.py) they travel inside that answer; on a deploy the page says the sheet is local only.
 */
const DIR = path.join(process.cwd(), 'content', 'snowmoon', 'consistency');
/** Sheet thumbnails: local only (images-out is not in the repository), because the cast sheets have never been published. */
const SHEETS = path.join(process.cwd(), 'images-out', 'consistency', 'sheets');

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
}

export function consistencyData(): ConsistencyData | null {
  const file = path.join(DIR, 'scores.json');
  if (!existsSync(file)) return null;
  const scores = JSON.parse(readFileSync(file, 'utf8')) as Omit<ConsistencyData, 'characters' | 'review'>;
  const slugs = [...new Set(scores.images.flatMap((i) => i.characters))];
  const names = new Map(sheetCharacters().map((c) => [c.slug, c.name]));
  const characters = slugs
    .map((slug) => {
      const thumb = path.join(SHEETS, `sheet-${slug}.jpg`);
      const sheet = existsSync(thumb) ? `data:image/jpeg;base64,${readFileSync(thumb).toString('base64')}` : null;
      return { slug, name: names.get(slug) ?? slug, sheet };
    })
    .sort((a, b) => scores.images.filter((i) => i.characters.includes(b.slug)).length - scores.images.filter((i) => i.characters.includes(a.slug)).length);
  // Every figure's raw similarities stay in the file (for --rescore); the page needs only the chosen ones.
  const images = scores.images.map(({ figures: _figures, ...im }: ImageScore & { figures?: unknown }) => im);
  const reviewFile = path.join(DIR, 'review.json');
  const review = existsSync(reviewFile) ? (JSON.parse(readFileSync(reviewFile, 'utf8')) as Review) : null;
  return { ...scores, images, characters, review };
}
