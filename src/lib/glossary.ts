import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK } from './config';
import { loadChapter } from './book';
import { blockFacts } from './reading';
import { loadNarration } from './narration';
import type { GlossaryIndexEntry, GlossaryTermView } from './glossary-view';

/**
 * The glossary as the pages need it, read from the committed data file
 * (content/snowmoon/glossary.json, built by scripts/build-glossary.ts; rules there).
 */
interface Term {
  slug: string;
  term: string;
  aliases: string[];
  respelling: string | null;
  first: string;
  first_chapter: number;
  first_sentence: { block: string; chapter: number; idx: number; text: string };
  explanations: { block: string; chapter: number; idx: number; text: string }[];
  mentions: Record<string, number[]>;
  mention_count: number;
  clip: { block: string; chapter: number; idx: number; url: string; duration_ms: number } | null;
}

let cache: Term[] | null = null;
function terms(): Term[] {
  cache ??= JSON.parse(readFileSync(path.join(process.cwd(), 'content', WORK.id, 'glossary.json'), 'utf8')).terms;
  return cache!;
}

/**
 * The glossary for agents (get_glossary; owner, 2026-10-25: "all chapters, spoiler-aware by chapter, cited"): only
 * what a reader who has read through chapter `through` has met. A term first met later is left out; explanations and
 * mentions from later chapters are dropped. Every text is the book's own words, with its block id (c<ch>-b<block>).
 */
export function glossaryThrough(through: number) {
  return terms()
    .filter((t) => t.first_chapter <= through)
    .map((t) => ({
      slug: t.slug,
      term: t.term,
      aliases: t.aliases,
      first_chapter: t.first_chapter,
      first_seen: { block: t.first_sentence.block, text: t.first_sentence.text },
      explanations: t.explanations.filter((e) => e.chapter <= through).map((e) => ({ block: e.block, text: e.text })),
      mentions: Object.entries(t.mentions)
        .filter(([ch]) => Number(ch) <= through)
        .flatMap(([ch, list]) => list.map((idx) => `c${ch}-b${idx}`)),
    }));
}

export function glossarySlugs(): string[] {
  return terms().map((t) => t.slug);
}

export function glossaryIndex(): GlossaryIndexEntry[] {
  return terms().map((t) => ({ slug: t.slug, term: t.term, chapter: t.first_chapter }));
}

/** "¶ 12" for readable blocks; the block's kind otherwise (a dateline has no ¶ number). */
const labelCache = new Map<number, Map<number, string>>();
function label(chapter: number, idx: number): string {
  if (!labelCache.has(chapter)) {
    const ch = loadChapter(chapter)!;
    const facts = blockFacts(ch.blocks);
    labelCache.set(chapter, new Map(ch.blocks.map((b, i) => [b.idx, facts[i].label !== null ? `¶ ${facts[i].label}` : b.kind])));
  }
  return labelCache.get(chapter)!.get(idx) ?? `block ${idx}`;
}

export function glossaryTerm(slug: string): GlossaryTermView | null {
  const t = terms().find((t) => t.slug === slug);
  if (!t) return null;
  return {
    slug: t.slug,
    term: t.term,
    aliases: t.aliases,
    respelling: t.respelling,
    firstChapter: t.first_chapter,
    firstSentence: { block: t.first_sentence.block, chapter: t.first_sentence.chapter, label: label(t.first_sentence.chapter, t.first_sentence.idx), text: t.first_sentence.text },
    explanations: t.explanations.map((e) => ({ block: e.block, chapter: e.chapter, label: label(e.chapter, e.idx), text: e.text })),
    mentions: Object.entries(t.mentions).map(([ch, list]) => ({
      chapter: Number(ch),
      blocks: list.map((idx) => ({ block: `c${ch}-b${idx}`, label: label(Number(ch), idx) })),
    })),
    clip: t.clip
      ? { block: t.clip.block, chapter: t.clip.chapter, idx: t.clip.idx, label: label(t.clip.chapter, t.clip.idx), url: t.clip.url, seconds: Math.max(1, Math.round(t.clip.duration_ms / 1000)), recipe: loadNarration(t.clip.chapter)!.recipe }
      : null,
  };
}
