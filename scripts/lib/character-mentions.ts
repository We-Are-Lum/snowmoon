/**
 * How often the book names each character (owner, 2026-11-04: "list characters by how often they're named in the
 * book, most first, everywhere characters are listed"). An order by the book's own text, never by engagement, picks or
 * payment (principle 5). Deterministic, no model: the book's text and the character files only.
 *
 * Written to content/snowmoon/characters-by-mentions.json by scripts/characters-by-mentions.ts; every character list
 * on the site reads its order from that file (src/lib/character-order.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { namesFor } from '../../src/lib/images/sheets';
import { READABLE_KINDS } from '../../src/lib/reading';

export const MENTION_RULES = [
  'Text: every chapter of content/snowmoon/text, readable blocks only (paragraph, quote, screen, figure); headings, datelines and breaks are skipped.',
  'Each block as plain text: HTML tags (speaker-colour spans, screen tables, figure markup) removed, ** and __ removed, backslash escapes undone.',
  'A character is named by their full name, each word of it but titles (Lord, Lady, General, Senator, Doctor) and one-letter words, and any "aliases" in their file (namesFor in src/lib/images/sheets.ts, the rule "In this passage" and first appearances use).',
  'Phrases in a file\'s "name_exclusions" are removed first and never count ("Hun Min" street is not Min).',
  'Whole words only: a spelling counts when no letter or digit touches it on either side, so "Bai" is not counted inside a longer word and a possessive ("Zei\'s") counts.',
  'Case-sensitive: "Mu", "Bai", "Min" and "Fin" count only capitalised as names; lower-case Dzegoban words and common words ("fin", "den") never count.',
  'Longest spellings first, across all characters, and each matched span is used once: "Zei Leimin" is one mention of Zei (not also "Zei" and "Leimin"), "Lord Ephelion" one of Ephelion.',
  'mentions is every naming; blocks is the number of blocks with at least one.',
];
export const ORDER_RULE = 'mentions, most first; ties by name (A to Z).';

export interface CharacterFile {
  slug: string;
  name: string;
  aliases?: string[];
  name_exclusions?: string[];
}
export interface ChapterText {
  chapter: number;
  blocks: { idx: number; kind: string; content: string }[];
}
export interface MentionRow {
  slug: string;
  name: string;
  mentions: number;
  blocks: number;
  /** Each spelling that named them, with its count. */
  as: Record<string, number>;
}

export const plainText = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\*\*|__/g, '').replace(/\\(.)/g, '$1');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (n: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'gu');

export const byMentionsThenName = (a: { mentions: number; name: string }, b: { mentions: number; name: string }) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'en');

/** Count each character's namings in the chapters, by MENTION_RULES; the rows in ORDER_RULE's order. */
export function countMentions(chapters: ChapterText[], characters: CharacterFile[]): MentionRow[] {
  const spellings = characters
    .flatMap((c) => namesFor(c).map((n) => ({ n, slug: c.slug, re: wholeWord(n) })))
    .sort((a, b) => b.n.length - a.n.length || a.n.localeCompare(b.n));
  const exclusions = characters.flatMap((c) => c.name_exclusions ?? []).sort((a, b) => b.length - a.length);
  const rows = new Map(characters.map((c) => [c.slug, { slug: c.slug, name: c.name, mentions: 0, blocks: 0, as: {} as Record<string, number> }]));
  for (const ch of [...chapters].sort((a, b) => a.chapter - b.chapter))
    for (const b of ch.blocks) {
      if (!READABLE_KINDS.has(b.kind)) continue;
      let t = exclusions.reduce((s, x) => s.split(x).join(' '.repeat(x.length)), plainText(b.content));
      const seen = new Set<string>();
      for (const s of spellings)
        t = t.replace(s.re, (m) => {
          const r = rows.get(s.slug)!;
          r.mentions++;
          r.as[s.n] = (r.as[s.n] ?? 0) + 1;
          seen.add(s.slug);
          return ' '.repeat(m.length);
        });
      for (const slug of seen) rows.get(slug)!.blocks++;
    }
  return [...rows.values()].map((r) => ({ ...r, as: Object.fromEntries(Object.entries(r.as).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) })).sort(byMentionsThenName);
}

export const MENTIONS_FILE = 'content/snowmoon/characters-by-mentions.json';

/** The file's whole content, from the book and the character files as they are now. */
export function mentionsFile(root: string): string {
  const textDir = path.join(root, 'content/snowmoon/text');
  const chapters = readdirSync(textDir)
    .filter((f) => /^chapter-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(textDir, f), 'utf8')) as ChapterText);
  const charDir = path.join(root, 'content/snowmoon/designs/characters');
  const characters = readdirSync(charDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(charDir, f), 'utf8')) as CharacterFile);
  const body = {
    about:
      'How often the book names each character, most first (owner, 2026-11-04: "list characters by how often they\'re named in the book, most first, everywhere characters are listed"). An order by the book\'s text alone, never by engagement, picks or payment (principle 5). Generated by scripts/characters-by-mentions.ts from content/snowmoon/text and content/snowmoon/designs/characters; do not edit by hand (npm run characters:mentions -- --write). Every character list on the site reads its order from here (src/lib/character-order.ts).',
    rules: MENTION_RULES,
    order: ORDER_RULE,
    chapters: chapters.length,
    characters: countMentions(chapters, characters),
  };
  return JSON.stringify(body, null, 2) + '\n';
}
