import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadIllustrations } from './illustrations';

/** The first-visit intro (config/intro.json), with each card's image resolved. */
export interface IntroCard {
  id: string;
  title: string;
  sentence: string;
  status: 'live' | 'coming';
  href: string | null;
  image: { url: string; alt: string; width: number; height: number } | null;
}

export interface Intro {
  version: string;
  modelDrafted: boolean;
  cards: IntroCard[];
}

interface RawIntro {
  version: string;
  model_drafted: boolean;
  cards: { id: string; title: string; sentence: string; image: string; status: 'live' | 'coming'; href: string | null }[];
}

export function rawIntro(): RawIntro {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'config', 'intro.json'), 'utf8'));
}

/** "published:<id>" -> that seeded image (content/snowmoon/illustrations/published.json). */
export function resolveIntroImage(ref: string): IntroCard['image'] {
  const m = ref.match(/^published:(c(\d+)-b\d+-[a-z0-9-]+)$/);
  if (!m) return null;
  const im = loadIllustrations(Number(m[2])).find((i) => i.id === m[1]);
  return im ? { url: im.url, alt: im.alt, width: im.width, height: im.height } : null;
}

export function loadIntro(): Intro {
  const raw = rawIntro();
  return {
    version: raw.version,
    modelDrafted: raw.model_drafted,
    cards: raw.cards.map((c) => ({ id: c.id, title: c.title, sentence: c.sentence, status: c.status, href: c.href, image: resolveIntroImage(c.image) })),
  };
}
