import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadIllustrations } from './illustrations';
import { blockId, loadChapter } from './book';
import { blockFacts } from './reading';
import { REPO_URL, WORK } from './config';

/**
 * The first-visit intro (config/intro.json, built from
 * docs/design/first-visit-intro.dc.html). Everything a card shows is real: the
 * cover uses the work's own title, author and licence; the recipe and record
 * cards use a published image with its committed recipe; the live and planned
 * lists come from the features list. Nothing is sample data.
 */
export type Visual = 'cover' | 'recipe' | 'record' | 'live' | 'planned';

export interface IntroImage {
  url: string;
  alt: string;
  width: number;
  height: number;
  /** The block the image illustrates, with its ¶ label and a short excerpt. */
  block: { id: string; label: number | null; chapter: number; excerpt: string };
  /** From the committed recipe. */
  recipe: { url: string; model: string; prompt: string; costUsd: number; runsOn: string; publishedBy: number | null };
}

export interface IntroCard {
  id: string;
  eyebrow: string;
  line: string;
  visual: Visual;
  status: 'live' | 'coming';
  href: string | null;
  image: IntroImage | null;
}

export interface Feature {
  label: string;
  status: 'live' | 'planned';
  href: string | null;
}

export interface Intro {
  version: string;
  modelDrafted: boolean;
  disclaimer: string;
  cover: { title: string; author: string; licence: string };
  cards: IntroCard[];
  features: Feature[];
}

interface RawCard {
  id: string;
  eyebrow: string;
  line: string;
  visual: Visual;
  image: string | null;
  status: 'live' | 'coming';
  href: string | null;
}

export interface RawIntro {
  version: string;
  model_drafted: boolean;
  disclaimer: string;
  cards: RawCard[];
  features: Feature[];
}

const read = (rel: string) => JSON.parse(readFileSync(path.join(process.cwd(), rel), 'utf8'));

export function rawIntro(): RawIntro {
  return read('config/intro.json');
}

/** The first words of a text, cut at a word boundary. */
function excerpt(text: string, max: number): string {
  const plain = text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/** "published:<id>" -> that seeded image, its block and its recipe. */
export function resolveIntroImage(ref: string | null): IntroImage | null {
  const m = ref?.match(/^published:(c(\d+)-b\d+-[a-z0-9-]+)$/);
  if (!m) return null;
  const chapter = Number(m[2]);
  const im = loadIllustrations(chapter).find((i) => i.id === m[1]);
  if (!im) return null;
  const ch = loadChapter(chapter);
  const at = ch?.blocks.findIndex((b) => b.idx === im.idx) ?? -1;
  const facts = ch ? blockFacts(ch.blocks) : [];
  const recipeFile = read(im.recipe) as {
    model: { repo: string };
    cost_usd: number;
    images: { id: string; prompt: string }[];
  };
  const published = read(path.join('content', WORK.id, 'illustrations', 'published.json')) as { published_by?: { fid?: number } };
  const models = read('config/models.json').models as { repo?: string; runs_on?: string }[];
  const model = models.find((x) => x.repo === recipeFile.model.repo);
  return {
    url: im.url,
    alt: im.alt,
    width: im.width,
    height: im.height,
    block: {
      id: blockId(chapter, im.idx),
      label: at >= 0 ? facts[at].label : null,
      chapter,
      excerpt: at >= 0 ? excerpt(ch!.blocks[at].content, 110) : '',
    },
    recipe: {
      url: `${REPO_URL}/blob/main/${im.recipe}`,
      model: recipeFile.model.repo.split('/').pop() ?? recipeFile.model.repo,
      prompt: excerpt(recipeFile.images.find((x) => x.id === im.id)?.prompt ?? '', 90),
      costUsd: recipeFile.cost_usd,
      runsOn: model?.runs_on === 'hosted' ? 'hosted' : 'run locally',
      publishedBy: published.published_by?.fid ?? null,
    },
  };
}

export function loadIntro(): Intro {
  const raw = rawIntro();
  return {
    version: raw.version,
    modelDrafted: raw.model_drafted,
    disclaimer: raw.disclaimer,
    cover: { title: WORK.title, author: WORK.author, licence: WORK.license },
    cards: raw.cards.map((c) => ({
      id: c.id,
      eyebrow: c.eyebrow,
      line: c.line,
      visual: c.visual,
      status: c.status,
      href: c.href,
      image: resolveIntroImage(c.image),
    })),
    features: raw.features,
  };
}
