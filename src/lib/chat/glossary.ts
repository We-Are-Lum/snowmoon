import type postgres from 'postgres';
import glossary from '../../../content/snowmoon/glossary.json';
import { WORK, WORK_ID } from '../config';

/**
 * The glossary words a question uses (content/snowmoon/glossary.json), so the reply can point
 * to their entries first (owner, 2026-10-14), and a misspelled one (one letter off, and a word
 * the book never uses: "minpetai") is searched and asked about as the book spells it.
 */
export interface GlossaryLink {
  slug: string;
  term: string;
}

interface Entry {
  slug: string;
  term: string;
  aliases: string[];
  first_chapter: number;
}

/** "Snowmoon" in a question is almost always the book, not the month. */
const ENTRIES = (glossary.terms as Entry[])
  .filter((t) => t.term !== WORK.title)
  .map((t) => ({ slug: t.slug, term: t.term, chapter: t.first_chapter, forms: [t.term, ...t.aliases] }));

/** Terms this long match in any case; shorter ones only as written ("Min", "Fin" and "Den" are English words in lower case). Other forms only as written ("Order" for the Order of Steering). */
const ANY_CASE_FROM = 5;
/** Single lower-case Dzegoban words this short ("ja", "li", "min") are left out: in a question they are mostly English. */
const SHORT_LOWER = 4;
/** A typo is only looked for in words this long, against single-word forms this long. */
const TYPO_FROM = 6;
/** At most this many entries are pointed to. */
const MAX_LINKS = 3;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (form: string, flags: string) => new RegExp(`(^|[^\\p{L}])(${escape(form)})(?=$|[^\\p{L}])`, flags);

/** At most one edit apart: insert, delete, substitute, or swap two neighbours. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export interface GlossaryWords {
  /** The question with each misspelled glossary word as the book spells it. */
  corrected: string;
  /** The same, correcting only to words that appear by the chapter limit: the model sees no later word. */
  correctedWithin: string;
  /** Entries the question names whose word first appears by the chapter limit, in the order asked. */
  links: GlossaryLink[];
}

export async function glossaryWords(sql: postgres.Sql, question: string, limit: number): Promise<GlossaryWords> {
  // Where each entry is named; a form inside a longer one ("Pafogai" in "Pafogai Du") doesn't count.
  const found: { slug: string; start: number; end: number }[] = [];
  for (const e of ENTRIES)
    for (const f of e.forms) {
      if (f.length < SHORT_LOWER && !/\s/.test(f) && f === f.toLowerCase()) continue;
      for (const m of question.matchAll(word(f, f === e.term && f.length >= ANY_CASE_FROM ? 'giu' : 'gu'))) {
        const start = m.index! + m[1].length;
        found.push({ slug: e.slug, start, end: start + m[2].length });
      }
    }
  const named = found.filter((a) => !found.some((b) => b !== a && b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start));

  // A word not named, one letter off a glossary word, and never used in the book: a typo.
  let corrected = question;
  let correctedWithin = question;
  const known = new Set(ENTRIES.flatMap((e) => e.forms.map((f) => f.toLowerCase())));
  for (const m of question.matchAll(/\p{L}+/gu)) {
    const w = m[0];
    if (w.length < TYPO_FROM || known.has(w.toLowerCase())) continue;
    const near = ENTRIES.find((e) => e.forms.some((f) => f.length >= TYPO_FROM && !/\s/.test(f) && withinOneEdit(w.toLowerCase(), f.toLowerCase())));
    if (!near) continue;
    const [{ used }] = (await sql.unsafe(
      `select numnode(q) = 0 or exists (select 1 from studio.text_blocks where work_id = $1 and search @@ q) as used from plainto_tsquery('english', $2) q`,
      [WORK_ID, w],
    )) as unknown as { used: boolean }[];
    if (used) continue;
    const fix = (s: string) => s.replace(word(w, 'u'), `$1${near.term}`);
    corrected = fix(corrected);
    if (near.chapter <= limit) correctedWithin = fix(correctedWithin);
    named.push({ slug: near.slug, start: m.index!, end: m.index! + w.length });
  }

  const slugs = [...new Set(named.sort((a, b) => a.start - b.start).map((n) => n.slug))];
  const links = slugs
    .map((slug) => ENTRIES.find((e) => e.slug === slug)!)
    .filter((e) => e.chapter <= limit)
    .slice(0, MAX_LINKS)
    .map((e) => ({ slug: e.slug, term: e.term }));
  return { corrected, correctedWithin, links };
}
