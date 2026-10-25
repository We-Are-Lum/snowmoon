import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The illustration check's inputs (owner, 2026-10-23: "Does each image show its scene?"; branch
 * illustration-check), read from committed files only, so the check script (scripts/check-illustrations.ts),
 * the owner's review page (/you/illustrations) and the Sunday redo (scripts/illustration-redo.ts) see the
 * same thing:
 * - the jobs: content/snowmoon/illustrations/chapter-N.json, every job with a block (142 on 2026-10-23);
 * - the image each job shows on the site: published.json's url (the clean, unlettered picture for a
 *   lettered one), or nothing for a job published.json excludes;
 * - the passage: the job's block with up to two text blocks before and after it, and the dateline above;
 * - the cast: each character file the job names, its sheet descriptor and its facts;
 * - the prompt the picture model received: the image recipe's composed prompt.
 * No server-only import: the scripts run it under plain tsx. Only server code imports it in the app.
 */

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content', 'snowmoon');

export interface CastMember {
  file: string;
  slug: string;
  name: string;
  descriptor: string;
  facts: { chapter: number; idx: number; quote: string; fact: string }[];
  /** The sheet render the job used as a reference ("cast/zei-sheet"), and its sha256 from the cast recipe. */
  sheet: { ref: string; sha256: string | null } | null;
}

export interface PassageBlock {
  idx: number;
  kind: string;
  content: string;
  /** The block's words without the edition's markup (speaker colour spans, emphasis marks). */
  text: string;
  sha256: string;
  /** The illustrated block. */
  target: boolean;
}

export interface Lettering {
  text: string;
  gloss: string | null;
}

/** An owner's review decision as the redo writes it into the job file (scripts/illustration-redo.ts). */
export interface JobReview {
  decision: 'keep' | 'regenerate' | 'drop';
  note: string | null;
  by_fid: number;
  at: string;
  /** sha256 of the published picture that was reviewed. */
  image_sha256: string | null;
  check: string | null;
}

export interface CheckJob {
  id: string;
  chapter: number;
  idx: number;
  /** content/snowmoon/illustrations/chapter-N.json */
  jobFile: string;
  /** The chapter file's style ("designs/styles/techno-vistas.json"), or null without one. */
  style: string | null;
  /** The scene prompt as the job file has it (the redo appends the owner's note to this). */
  prompt: string;
  /** The prompt the picture model received, from the image recipe. */
  composedPrompt: string;
  recipeFile: string;
  image: { url: string; sha256: string; width: number; height: number; lettered: boolean } | null;
  /** Why the job has no published image (published.json's excluded reason). */
  excluded: string | null;
  cast: CastMember[];
  lettering: Lettering[];
  dateline: string | null;
  passage: PassageBlock[];
  review: JobReview | null;
  redo: { note: string; by_fid: number; at: string; done?: string } | null;
}

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

type RawJob = {
  id: string;
  chapter: number;
  idx: number;
  prompt: string;
  characters?: string[];
  references?: string[];
  lettering?: { text: string; gloss: string | null }[];
  review?: JobReview;
  redo?: CheckJob['redo'];
};

function chapterFiles(): { n: number; file: string }[] {
  const dir = path.join(CONTENT, 'illustrations');
  return readdirSync(dir)
    .map((f) => /^chapter-(\d+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => ({ n: Number(m[1]), file: path.join(dir, m[0]) }))
    .sort((a, b) => a.n - b.n);
}

let castShas: Map<string, string> | null = null;
function castSha(ref: string): string | null {
  if (!castShas) {
    castShas = new Map();
    const f = path.join(CONTENT, 'recipes', 'images', 'cast.json');
    if (existsSync(f)) for (const im of json(f).images as { id: string; sha256: string }[]) castShas.set(im.id, im.sha256);
  }
  return castShas.get(ref.split('/').pop()!) ?? null;
}

/** The book's words as plain text: the edition's spans and emphasis marks removed, nothing else changed. */
export const plainText = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\*\*?/g, '');

const TEXT_KINDS = new Set(['paragraph', 'quote', 'screen', 'figure']);

function passageFor(chapter: number, idx: number, around = 2): { dateline: string | null; passage: PassageBlock[] } {
  const blocks = json(path.join(CONTENT, 'text', `chapter-${chapter}.json`)).blocks as { idx: number; kind: string; content: string; sha256: string }[];
  const at = blocks.findIndex((b) => b.idx === idx);
  if (at < 0) return { dateline: null, passage: [] };
  const before: PassageBlock[] = [];
  for (let i = at - 1; i >= 0 && before.length < around; i--) if (TEXT_KINDS.has(blocks[i].kind)) before.unshift({ ...blocks[i], text: plainText(blocks[i].content), target: false });
  const after: PassageBlock[] = [];
  for (let i = at + 1; i < blocks.length && after.length < around; i++) {
    if (blocks[i].kind === 'dateline' || blocks[i].kind === 'heading') break; // a new scene starts
    if (TEXT_KINDS.has(blocks[i].kind)) after.push({ ...blocks[i], text: plainText(blocks[i].content), target: false });
  }
  const found = [...blocks.slice(0, at + 1)].reverse().find((b) => b.kind === 'dateline')?.content;
  const dateline = found ? plainText(found) : null;
  return { dateline, passage: [...before, { ...blocks[at], text: plainText(blocks[at].content), target: true }, ...after] };
}

let cache: CheckJob[] | null = null;

/** Every illustration job with a block, in chapter order. */
export function checkJobs(): CheckJob[] {
  if (cache) return cache;
  const published = json(path.join(CONTENT, 'illustrations', 'published.json')) as {
    excluded: Record<string, string>;
    images: { id: string; url: string; sha256: string; width: number; height: number; recipe: string; clean?: { url: string; sha256: string } }[];
  };
  const pub = new Map(published.images.map((i) => [i.id, i]));
  const out: CheckJob[] = [];
  for (const { n, file } of chapterFiles()) {
    const recipeFile = path.join('content', 'snowmoon', 'recipes', 'images', `chapter-${n}.json`);
    const recipes = existsSync(path.join(ROOT, recipeFile)) ? (json(path.join(ROOT, recipeFile)).images as { id: string; prompt: string }[]) : [];
    const doc = json(file) as { style?: string; jobs: RawJob[] };
    for (const j of doc.jobs) {
      if (typeof j.idx !== 'number') continue;
      const p = pub.get(j.id);
      const lettered = Boolean(j.lettering?.length);
      const shown = p ? (lettered && p.clean ? { url: p.clean.url, sha256: p.clean.sha256 } : { url: p.url, sha256: p.sha256 }) : null;
      const refs = j.references ?? [];
      const cast = (j.characters ?? []).map((c, i): CastMember => {
        const profile = json(path.join(CONTENT, c));
        const ref = refs[i] ?? null;
        return {
          file: c,
          slug: profile.slug,
          name: profile.name,
          descriptor: profile.descriptor,
          facts: profile.facts ?? [],
          sheet: ref ? { ref, sha256: castSha(ref) } : null,
        };
      });
      out.push({
        id: j.id,
        chapter: n,
        idx: j.idx,
        jobFile: path.relative(ROOT, file),
        style: doc.style ?? null,
        prompt: j.prompt,
        composedPrompt: recipes.find((r) => r.id === j.id)?.prompt ?? j.prompt,
        recipeFile,
        image: shown && p ? { ...shown, width: p.width, height: p.height, lettered } : null,
        excluded: published.excluded[j.id] ?? null,
        cast,
        lettering: (j.lettering ?? []).map((l) => ({ text: l.text, gloss: l.gloss })),
        ...passageFor(n, j.idx),
        review: j.review ?? null,
        redo: j.redo ?? null,
      });
    }
  }
  cache = out;
  return out;
}

export function checkJob(id: string): CheckJob | null {
  return checkJobs().find((j) => j.id === id) ?? null;
}
