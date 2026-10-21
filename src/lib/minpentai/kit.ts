/**
 * The Minpentai build-on kit: the book's passages about Minpentai and the checks on the rules table
 * (src/lib/minpentai/kit-rules.ts). Pure: callers pass the book's blocks and the files' text.
 * Used by scripts/build-minpentai-kit.ts (writes public/minpentai/rules.json and docs/minpentai/),
 * check:principles P8g, and the page /minpentai/build.
 *
 * A block is a Minpentai passage if it names Minpentai, is cited in docs/minpentai-rules.md (the reading
 * of the book's rules), or is cited by Learn's words (learn-text.ts); a cited range counts every block in
 * it. That gives 152 blocks (kit part 1, 2026-10-20).
 *
 * The page shows every passage from chapters 2–14 and folds chapters 15 onward under a closed Spoilers
 * section (owner's decision, 2026-10-20, replacing the go's "rule passages from chapters 2–14 shown").
 */
import { KIT_RULES, type KitRule } from './kit-rules';

export interface BookBlock { idx: number; kind: string; content: string }
export type Reason = 'names' | 'rules-doc' | 'learn';
export interface Passage {
  block: string;
  chapter: number;
  idx: number;
  kind: string;
  reasons: Reason[];
  /** Cited by a row of the rules table. */
  rulePassage: boolean;
  /** Shown on the page (chapters 2–14); otherwise inside Spoilers. */
  shown: boolean;
}

/** The expected count (kit part 1). A different count fails the check, with the difference listed. */
export const PASSAGE_COUNT = 152;
/** Passages from these chapters are shown; every later one is behind Spoilers (owner, 2026-10-20). */
export const SHOWN_CHAPTERS: [number, number] = [2, 14];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const unescape = (s: string) => s.replace(/&([a-z]+|#\d+);/gi, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : m));

/**
 * A block's words, paragraph by paragraph, with the markup removed and the words unchanged.
 * `*word*` (the book's emphasis) is kept as written; `plain` drops the asterisks.
 * A figure has no paragraphs; its drawn words (SVG <text>), if any, are in `figureWords`.
 */
export function blockParagraphs(b: BookBlock): string[] {
  if (b.kind === 'figure') return [];
  const parts = b.kind === 'screen' ? [...b.content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]) : [b.content];
  return parts.map((p) => unescape(p.replace(/<[^>]+>/g, '')).replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
export const figureWords = (b: BookBlock): string[] =>
  b.kind === 'figure' ? [...b.content.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => unescape(m[1].replace(/<[^>]+>/g, '')).trim()).filter(Boolean) : [];
export const plain = (s: string) => s.replace(/\*([^*]+)\*/g, '$1');
/** The block's words as one string, for checking quotes. */
export const blockText = (b: BookBlock) => plain(blockParagraphs(b).join(' '));

/** Block ids in a text: "c4-b9", and ranges "c4-b97–c4-b98" or "c4-b136–b138", each block of a range counted. */
export function citedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/c(\d+)-b(\d+)(?:\s*[–-]\s*(?:c\d+-)?b(\d+))?/g)) {
    const a = Number(m[2]), z = m[3] ? Number(m[3]) : a;
    for (let i = a; i <= Math.max(a, z); i++) out.push(`c${m[1]}-b${i}`);
  }
  return out;
}

export const parseId = (id: string) => {
  const m = /^c(\d+)-b(\d+)$/.exec(id);
  return m ? { chapter: Number(m[1]), idx: Number(m[2]) } : null;
};
export const order = (id: string) => { const p = parseId(id)!; return p.chapter * 100000 + p.idx; };

/** Every rule's cited blocks. */
export const ruleBlocks = (rules: KitRule[] = KIT_RULES) => new Set(rules.flatMap((r) => (r.cites ?? []).map((c) => c.block)));

/**
 * The passages: `book` maps chapter → blocks; `rulesDoc` is docs/minpentai-rules.md; `learn` is Learn's words
 * (JSON.stringify(LEARN_TEXT)).
 */
export function findPassages(book: Record<number, BookBlock[]>, rulesDoc: string, learn: string, rules: KitRule[] = KIT_RULES): Passage[] {
  const reasons = new Map<string, Set<Reason>>();
  const add = (id: string, r: Reason) => { if (!reasons.has(id)) reasons.set(id, new Set()); reasons.get(id)!.add(r); };
  for (const [ch, blocks] of Object.entries(book)) for (const b of blocks) if (/minpentai/i.test(b.content)) add(`c${ch}-b${b.idx}`, 'names');
  for (const id of citedIds(rulesDoc)) add(id, 'rules-doc');
  for (const id of citedIds(learn)) add(id, 'learn');
  const cited = ruleBlocks(rules);
  const ORDER: Reason[] = ['names', 'rules-doc', 'learn'];
  return [...reasons.keys()].sort((a, b) => order(a) - order(b)).map((id) => {
    const { chapter, idx } = parseId(id)!;
    const blk = book[chapter]?.find((x) => x.idx === idx);
    const rulePassage = cited.has(id);
    return {
      block: id, chapter, idx, kind: blk?.kind ?? 'missing',
      reasons: ORDER.filter((r) => reasons.get(id)!.has(r)),
      rulePassage,
      shown: chapter >= SHOWN_CHAPTERS[0] && chapter <= SHOWN_CHAPTERS[1],
    };
  });
}

/** Paraphrasing c4-b84 as a rule for each match (P8d, P8f), outside quotation marks. */
export const CHANGES_EACH_MATCH = /\b(?:the\s+)?rules?\s+(?:change|changes|changed|changing)\s+(?:(?:with|for|in)\s+)?(?:every|each)\s+(?:match|game)\b|\b(?:a\s+)?(?:new|different)\s+rules?\s+(?:every|each)\s+(?:match|game)\b/i;

/**
 * Problems with the rules table: a cited block that does not exist or is not a passage, a quote not
 * word for word in its block (a figure takes no quote), a book row without citations, an invented row
 * without code, a code place missing from its file, duplicate ids, a paraphrase of c4-b84.
 * `files` maps a repo path to its text (undefined: the file does not exist).
 */
export function tableProblems(rules: KitRule[], book: Record<number, BookBlock[]>, passages: Passage[], files: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const inSet = new Set(passages.map((p) => p.block));
  for (const r of rules) {
    if (ids.has(r.id)) problems.push(`${r.id}: duplicate id`);
    ids.add(r.id);
    if (r.source === 'book' && !r.cites?.length) problems.push(`${r.id}: from the book but cites no block`);
    if (r.source === 'book' && !r.how) problems.push(`${r.id}: from the book but not marked stated or implied`);
    if (r.source === 'invented' && !r.code?.length) problems.push(`${r.id}: invented but names no place in the code`);
    for (const c of r.cites ?? []) {
      const p = parseId(c.block);
      const blk = p ? book[p.chapter]?.find((x) => x.idx === p.idx) : undefined;
      if (!blk) { problems.push(`${r.id}: ${c.block} does not exist`); continue; }
      if (!inSet.has(c.block)) problems.push(`${r.id}: ${c.block} is not one of the Minpentai passages`);
      if (c.quote === undefined) { if (blk.kind !== 'figure') problems.push(`${r.id}: ${c.block} is ${blk.kind}, so it needs a quote`); continue; }
      if (!blockText(blk).includes(c.quote)) problems.push(`${r.id}: "${c.quote}" is not word for word in ${c.block}`);
    }
    for (const c of r.code ?? []) {
      const text = files[c.file];
      if (text === undefined) problems.push(`${r.id}: ${c.file} does not exist`);
      else if (!text.includes(c.find)) problems.push(`${r.id}: "${c.find}" is not in ${c.file}`);
    }
    for (const [what, s] of [['rule', r.rule], ['note', r.siteNote]] as const) {
      const hit = s.replace(/"[^"]*"/g, ' ').match(CHANGES_EACH_MATCH);
      if (hit) problems.push(`${r.id}: its ${what} says "${hit[0]}"; quote c4-b84 instead`);
    }
  }
  return problems;
}

/** Problems with the passage list: the count, and blocks that do not exist. */
export function passageProblems(passages: Passage[]): string[] {
  const problems = passages.filter((p) => p.kind === 'missing').map((p) => `${p.block} is cited but does not exist`);
  if (passages.length !== PASSAGE_COUNT) problems.push(`${passages.length} passages, not ${PASSAGE_COUNT}`);
  return problems;
}

export const counts = (rules: KitRule[] = KIT_RULES) => ({
  book: rules.filter((r) => r.source === 'book').length,
  invented: rules.filter((r) => r.source === 'invented').length,
  site: {
    yes: rules.filter((r) => r.site === 'yes').length,
    partly: rules.filter((r) => r.site === 'partly').length,
    no: rules.filter((r) => r.site === 'no').length,
  },
});
