import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK } from './config';

/**
 * The project's seeded key-moment images for a chapter, from
 * content/snowmoon/illustrations/published.json (scripts/publish-images.ts).
 * A starting point, not canon; Milestone 4 moves images into the database as
 * elements, and this index goes away.
 */
export interface Illustration {
  id: string;
  idx: number; // the block it illustrates
  url: string;
  width: number;
  height: number;
  recipe: string;
  alt: string;
}

/** A short description from the image's scene prompt, without the model-facing reference wording. */
function altFor(chapter: number, id: string): string {
  const file = path.join(process.cwd(), 'content', WORK.id, 'illustrations', `chapter-${chapter}.json`);
  const job = JSON.parse(readFileSync(file, 'utf8')).jobs.find((j: { id: string }) => j.id === id);
  // Words drawn over the image (lettering) belong in its description too.
  const lettering = ((job?.lettering ?? []) as { text: string; gloss: string | null }[])
    .map((l) => {
      const words = l.text.split('\n').filter((x) => x.trim()).join(', ');
      return l.gloss ? `“${words}” (“${l.gloss}”)` : `“${words}”`;
    })
    .filter((v, i, a) => a.indexOf(v) === i);
  const lettered = lettering.length ? ` Lettering: ${lettering.join('; ')}.` : '';
  const first = String(job?.prompt ?? '')
    .split(/(?<=\.)\s/)
    .slice(0, 2)
    .join(' ')
    // Drop camera directions ("Medium shot inside", "Wide establishing view of") meant for the model.
    .replace(/^(?:very |dramatic |slightly )?(?:wide|medium|medium-wide|medium-close|close|tight|low|high|overhead|low-angle|high-angle)?[- ]?(?:angle )?(?:establishing )?(?:shot|view|close-up)(?: of| inside| on| from| at| in)?\s*/i, '')
    .replace(/^./, (c) => c.toUpperCase());
  return first.replace(/\b(the )?(man|woman|boy|girl|young man|young woman|teenage boy|teenage girl|person) from reference image \d/gi, (m) => {
    const who = m.replace(/^the /i, '').replace(/ from reference image \d/i, '');
    return `a ${who}`;
  }).replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, c: string) => lead + c.toUpperCase()) + lettered;
}

type Entry = Illustration & { chapter: number };
let cache: Entry[] | null = null;

function all(): Entry[] {
  if (!cache) {
    const file = path.join(process.cwd(), 'content', WORK.id, 'illustrations', 'published.json');
    cache = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).images as Entry[]) : [];
  }
  return cache;
}

export function loadIllustrations(n: number): Illustration[] {
  return all()
    .filter((i) => i.chapter === n)
    .map(({ id, idx, url, width, height, recipe }) => ({ id, idx, url, width, height, recipe, alt: altFor(n, id) }));
}
