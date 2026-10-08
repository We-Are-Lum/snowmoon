import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_URL } from './config';

/**
 * What the recipe sheet shows (src/components/recipe-sheet.tsx), read from a committed
 * recipe file and set into one fixed template. Nothing here is written or summarised by a
 * model: every value is copied from the files, and the sentences around them are fixed
 * (model-drafted wording, labelled draft for the owner to rewrite).
 *
 * Recipe families: images (content/snowmoon/recipes/images: chapters, cast, locations, style
 * tests, and lettering done in code), narration (recipes/narration/chapter-N), and the podcast
 * (recipes/podcast: chapter-N, opener, cover).
 */
const ROOT = process.cwd();
const RECIPES = 'content/snowmoon/recipes/';

export interface RecipeView {
  file: string;
  github: string;
  what: string;
  model: { name: string; licence: string; where: string } | null;
  /** The exact prompt or spoken text, in full; null when no model was prompted. */
  prompt: { label: string; text: string } | null;
  /** Other exact inputs worth showing (reference images, an encoder command). */
  inputs: { label: string; value: string }[];
  published: { by: string; when: string } | null;
  cost: string;
  resultLicence: string;
}

type J = Record<string, unknown>;
const read = (p: string): J | null => (existsSync(path.join(ROOT, p)) ? (JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')) as J) : null);
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Only committed recipe files, by repo path. */
export function safeRecipePath(file: string): string | null {
  const norm = path.posix.normalize(file);
  return norm.startsWith(RECIPES) && norm.endsWith('.json') && !norm.includes('..') ? norm : null;
}

function where(host: unknown, hostName?: string): string {
  if (host && typeof host === 'object' && 'platform' in (host as J)) return `on the project's own computer (${str((host as J).machine)}), not a hosted service`;
  if (typeof host === 'string' && host) return `on ${host}, a hosted service`;
  if (hostName) return `on ${hostName}, a hosted service`;
  return 'not recorded';
}

function publishedBy(p: unknown): { by: string; when: string } | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as J;
  return { by: `FID ${str(o.fid)}${o.role ? ` (${str(o.role)})` : ''}`, when: str(o.date) };
}

function cost(usd: unknown, what: string): string {
  const n = Number(usd);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(4)} ${what}` : 'Nothing: it ran on the project\'s own computer';
}

export function recipeView(file: string, item?: string): RecipeView | null {
  const r = read(file);
  if (!r) return null;
  const github = `${REPO_URL}/blob/main/${file}`;
  const base = { file, github };

  // Images (generated): one entry per image in `images`.
  if (file.startsWith(`${RECIPES}images/`) && r.model) {
    const images = (r.images as J[]) ?? [];
    const img = images.find((i) => str(i.id) === item) ?? images[0];
    const model = r.model as J;
    const published = (read('content/snowmoon/illustrations/published.json') ?? {}) as J;
    const isPublished = ((published.images as J[]) ?? []).some((p) => str(p.id) === str(img?.id));
    const refs = ((img?.references as J[]) ?? []).map((x) => str(x.file)).filter(Boolean);
    return {
      ...base,
      what: img?.chapter ? `An image for Chapter ${str(img.chapter)}, made for one passage as a starting point, not canon.` : `An image made as a reference (${path.basename(file, '.json')}).`,
      model: { name: str(model.repo ?? model.name), licence: str(model.license), where: where(r.host) },
      prompt: img ? { label: 'The exact prompt', text: str(img.prompt) } : null,
      inputs: [
        ...(refs.length ? [{ label: 'Reference images', value: refs.join(', ') }] : []),
        ...(img?.seed !== undefined ? [{ label: 'Seed', value: str(img.seed) }] : []),
        { label: 'Settings', value: Object.entries((r.settings as J) ?? {}).map(([k, v]) => `${k} ${str(v)}`).join(', ') },
      ],
      published: isPublished ? publishedBy(published.published_by) : null,
      cost: cost(r.cost_usd, 'for this run'),
      resultLicence: isPublished ? str(published.license || 'GPL-3.0') : 'GPL-3.0 (not published in the reader)',
    };
  }

  // Lettering drawn in code over an image: no model.
  if (file === `${RECIPES}images/lettering.json`) {
    const img = ((r.images as J[]) ?? []).find((i) => str(i.id) === item);
    return {
      ...base,
      what: 'Words drawn over an image in code, so the lettering matches the book exactly.',
      model: null,
      prompt: img ? { label: 'The words drawn', text: ((img.lettering as J[]) ?? []).map((l) => str(l.text)).join('\n\n') } : null,
      inputs: [{ label: 'Drawn by', value: `${str(r.script)} (commit ${str(r.script_commit).slice(0, 7)})` }],
      published: null,
      cost: 'Nothing: drawn in code',
      resultLicence: 'GPL-3.0',
    };
  }

  // Narration: one recipe per chapter; the prompt is the exact text spoken for one paragraph.
  if (file.startsWith(`${RECIPES}narration/`)) {
    const blocks = ((r.blocks as J[]) ?? []).filter((b) => b.file);
    const block = blocks.find((b) => str(b.idx) === item) ?? blocks[0];
    const model = r.model as J;
    const voice = r.voice as J;
    const index = read(`content/snowmoon/narration/kokoro-af_heart/chapter-${str(r.chapter)}.json`) ?? {};
    return {
      ...base,
      what: `The synthetic narration of Chapter ${str(r.chapter)}: a speech model reading the book's text aloud, one paragraph at a time.`,
      model: { name: `${str(model.name)}, stock voice ${str(voice?.name)}`, licence: str(model.license), where: where(r.host) },
      prompt: block
        ? { label: `The exact text spoken for this paragraph (block c${str(r.chapter)}-b${str(block.idx)})`, text: str(block.text) }
        : null,
      inputs: [
        { label: 'Model revision', value: str(model.revision) },
        ...(block?.read_aloud_status ? [{ label: 'Note', value: 'This paragraph is a model-drafted description of a screen or figure, not the author\'s words; a short tone plays before it.' }] : []),
        ...(block?.respoken_because ? [{ label: 'Re-spoken', value: `${str(block.respoken_because)} (${str(block.respoken_at).slice(0, 10)})` }] : []),
      ],
      published: publishedBy(index.published_by),
      cost: cost(0, ''),
      resultLicence: str(index.license || 'GPL-3.0'),
    };
  }

  // The podcast: episodes (made by code from the narration), the spoken opener, the cover.
  if (file.startsWith(`${RECIPES}podcast/`)) {
    const name = path.basename(file, '.json');
    if (name === 'opener') {
      const model = r.model as J;
      return {
        ...base,
        what: 'The spoken opener at the start of every podcast episode. The words are the owner\'s; the voice is synthetic.',
        model: { name: `${str(model.name)}, stock voice ${str((r.voice as J)?.name)}`, licence: str(model.license), where: 'on the project\'s own computer, not a hosted service' },
        prompt: { label: 'The exact text spoken', text: str(r.spoken_text) },
        inputs: [{ label: 'Words by', value: str(r.text_by) }],
        published: null,
        cost: cost(0, ''),
        resultLicence: 'GPL-3.0',
      };
    }
    if (name === 'cover') {
      const made = r.made_by as J;
      return {
        ...base,
        what: 'The podcast cover, drawn in code. No image model was used.',
        model: null,
        prompt: null,
        inputs: [{ label: 'Drawn by', value: `${str(made.script)} (${str(made.supplied_by)})` }],
        published: publishedBy(r.published_by),
        cost: 'Nothing: drawn in code',
        resultLicence: 'GPL-3.0',
      };
    }
    const enc = r.encoder as J;
    return {
      ...base,
      what: `Podcast episode ${str(r.chapter)}: the spoken opener, then the chapter's narration, joined and encoded by code. No model was prompted for this file.`,
      model: null,
      prompt: null,
      inputs: [
        { label: 'Made from', value: `${str((r.inputs as J)?.chapter && ((r.inputs as J).chapter as J).recipe)} and the opener` },
        { label: 'Encoder', value: str(enc?.command) },
      ],
      published: publishedBy(r.published_by),
      cost: 'Nothing: made in code',
      resultLicence: 'GPL-3.0',
    };
  }
  return null;
}
