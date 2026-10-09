/**
 * The glossary, built from committed sources only (no model, no network, no clock):
 *
 *   content/snowmoon/pronunciation.json       the narration's invented words
 *   content/snowmoon/designs/{characters,locations,props}/*.json   entity names
 *   content/snowmoon/glossary-review.json     every judgement call, one line each, with why
 *   content/snowmoon/text/chapter-*.json      the book
 *   content/snowmoon/narration/kokoro-af_heart/chapter-*.json      the house narration's clips
 *
 * The rules (also written into the data file, so a reader of the JSON sees them):
 *
 * INCLUSION. A term is (1) every pronunciation.json entry, except kind "common-word" and except
 * entries of four or more words (phrases: signs, songs, menus); (2) every capitalised run in an
 * entity's name (characters, locations, props; art styles are not story words), after dropping a
 * leading article and a title (Lord, General, Senator, Uncle, Aunt) and a possessive 's, that is
 * not already a term; each of these must be decided in the review file (added, or excluded with
 * a reason), or the build fails; (3) the review file's `add` list (capitalised in-world terms the
 * narration has no entry for, each with its first block). The review file's `merge` list joins
 * spellings of one word (plural, full name, abbreviation). A term the book never mentions is
 * dropped and listed.
 *
 * MENTIONS. A term is mentioned where one of its spellings appears as a whole word in a block's
 * text (tags and Markdown marks removed); longest spellings first, so "Pafogai Du" is not also a
 * mention of "Pafogai". Case follows the pronunciation entry's match_case (default: exact case).
 * Single lowercase Dzegoban words (many are also English: li, be, min) count only inside the
 * book's italics or single quotes, as the narration applies them. Headings and breaks are skipped.
 *
 * EXPLANATIONS. The book's own sentences, quoted exactly, never written by a model: a sentence of
 * a paragraph or quote block (speaker-colour span tags removed, nothing else) that mentions the
 * term in one of these shapes: "T is/was/are/were/means/stands for/refers to a|an|the|one|…|Capital";
 * "called/named/known as/nicknamed/dubbed/word for T"; "T, a|an|the …" (not a vocative after a
 * quote mark); "T - a|an|the|quote"; "T: a|an|the"; "T (" or "(T)"; "… in Dzegoban" or "Dzegoban
 * for" in the same sentence; "T, as … call/called/know/say". The first five in book order are
 * kept. Sentences that still hold markup (<, &) are skipped.
 *
 * CLIP. The house narration has a clip per block and no word timings. The clip is the block
 * whose narration speaks the term (its spoken text, pronunciation marks removed, contains a
 * spelling), in the first chapter where any block does, the shortest of those; spoken
 * descriptions of screens (model-drafted) are never used. The whole block plays.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const GLOSSARY_FILE = 'content/snowmoon/glossary.json';
export const REVIEW_FILE = 'content/snowmoon/glossary-review.json';
const VOICE = 'kokoro-af_heart';
const CHAPTERS = 32;
const MAX_EXPLANATIONS = 5;
const PHRASE_WORDS = 4;
const TITLES = ['Lord', 'General', 'Senator', 'Uncle', 'Aunt'];
const ENTITY_DIRS = ['characters', 'locations', 'props'];

export interface Explanation {
  block: string;
  chapter: number;
  idx: number;
  /** Exactly as in the block (speaker-colour span tags removed). Markdown marks kept. */
  text: string;
}
export interface Clip {
  block: string;
  chapter: number;
  idx: number;
  url: string;
  duration_ms: number;
  /** Where the block starts in the stitched chapter file. */
  start_ms: number;
  chapter_url: string;
}
export interface Term {
  slug: string;
  term: string;
  aliases: string[];
  source: 'pronunciation' | 'entity' | 'review';
  /** The pronunciation file's kind (its own, unreviewed), or the review file's. */
  kind: string;
  /** The pronunciation file's respelling, when the term has an entry (a house choice, unreviewed). */
  respelling: string | null;
  first: string;
  first_chapter: number;
  explanations: Explanation[];
  /** Block idx lists by chapter number. */
  mentions: Record<string, number[]>;
  mention_count: number;
  clip: Clip | null;
}
export interface Glossary {
  work_id: string;
  about: string;
  rules: Record<'inclusion' | 'mentions' | 'explanations' | 'clip', string>;
  sources: Record<string, string>;
  counts: Record<string, number>;
  terms: Term[];
  excluded: { word: string; why: string }[];
}

interface Review {
  merge: { term: string; aliases: string[]; why: string }[];
  add: { term: string; aliases?: string[]; kind: string; why: string; match_case?: boolean }[];
  exclude: { word: string; why: string }[];
  entity_covered: { name: string; by: string }[];
  /** Sentences the rule picks that do not explain the term (e.g. "against Gun - the last day"). */
  not_explanations: { term: string; block: string; why: string }[];
}

interface PronEntry {
  word: string;
  kind: string;
  respelling?: string;
  match_case?: boolean;
  rule?: string;
  note?: string;
}

type Mode = 'case' | 'nocase' | 'italic';
interface Spelling {
  text: string;
  mode: Mode;
}
interface Draft {
  term: string;
  aliases: Spelling[];
  primary: Spelling;
  source: Term['source'];
  kind: string;
  respelling: string | null;
}

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B1 = '(?<![A-Za-z0-9])';
const B2 = '(?![A-Za-z0-9])';
/** A spelling as a regex source; nocase spellings get a [aA] class per letter (no inline flags). */
function src(s: Spelling): string {
  const body = esc(s.text);
  return s.mode === 'nocase' ? body.replace(/[A-Za-z]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`) : body;
}

/** A block's words for matching: tags, entities, escapes and emphasis marks removed. */
export function plainText(content: string): string {
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/\*/g, '');
}
/** The text explanations are quoted from: the block with only its speaker-colour span tags removed. */
export function quoteSource(content: string): string {
  return content.replace(/<\/?span[^>]*>/g, '');
}
/** Sentences, split after . ! ? or … (with a closing quote or bracket) before a capital, quote or digit. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(*]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function slugify(term: string): string {
  return term
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function explainPatterns(v: string): RegExp[] {
  const V = `${B1}${v}${B2}`;
  // An appositive is a noun phrase: up to its end (, . ; ! ? -) or a relative word, it holds no verb.
  const NOUN_PHRASE = `(?!(?:(?!\\b(?:that|which|who|whom|when|where)\\b)[^,.;!?-])*\\b(?:is|was|were|are|could|would|will|can|may|might|must|should|had|has|have|did|do|got|get|gets|went|made|make)\\b)`;
  return [
    // T is / was / means … a, an, the, one, … or a capitalised word ("Heralds are Order members").
    new RegExp(`${V}(?:'s)?(?: (?:street|district|city|language|game|role|system|group|team))? (?:is|was|are|were|means|meant|stands for|refers to) (?:(?:also|still|now|basically|essentially|just|simply|actually|really|always) )?(?:(?:a|an|the|one|short|what|where|when|how|someone|something) |[A-Z][a-z]+\\b)`),
    // a … called / named T; known as / nicknamed / dubbed / the word for T.
    new RegExp(`\\b(?:a|an|the|some|this|that)\\b(?: [a-z-]+){1,5},? (?:called|named) (?:the )?["“'‘]?${V}|\\b(?:known as|nicknamed|dubbed|word for|term for) (?:the |a |an )?["“'‘]?${V}`),
    // T, a|an|the + a lowercase noun phrase (not a vocative after a quote mark, not inside a list).
    new RegExp(`(?<!(?:["“]|, ))${V}, (?:a|an|the) (?![A-Z])${NOUN_PHRASE}`),
    // T - a|an|the noun phrase, or a quoted name.
    new RegExp(`${V} - (?:(?:a|an|the) ${NOUN_PHRASE}|["“])`),
    // T: a|an|the.
    new RegExp(`${V}: (?:a|an|the) `),
    // T (…) or (T).
    new RegExp(`${V} \\(|\\(${V}\\)`),
    // T in Dzegoban; Dzegoban for T.
    new RegExp(`${V}["”'’]? in Dzegoban\\b|\\bDzegoban (?:for|word for) ["“'‘]?${V}`),
    // T, as … call / know / say.
    new RegExp(`${V}["”'’]?,? as (?:[A-Za-z]+ ){0,4}(?:call|calls|called|know|knew|say|said)\\b`),
  ];
}

export function buildGlossary(root: string): Glossary {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
  const pronText = read('content/snowmoon/pronunciation.json');
  const reviewText = read(REVIEW_FILE);
  const pron = JSON.parse(pronText).entries as PronEntry[];
  const review = JSON.parse(reviewText) as Review;
  const excluded: Glossary['excluded'] = [];

  // ---- Inclusion ----
  const spellingOf = (e: PronEntry): Spelling => {
    const single = !e.word.includes(' ');
    if (e.rule === 'dzegoban' && single && e.word === e.word.toLowerCase()) return { text: e.word, mode: 'italic' };
    return { text: e.word, mode: e.match_case === false ? 'nocase' : 'case' };
  };
  const byWord = new Map(pron.map((e) => [e.word, e]));
  const aliasOf = new Map<string, string>(); // alias word -> group term
  for (const m of review.merge) for (const a of m.aliases) aliasOf.set(a, m.term);
  const drafts: Draft[] = [];
  const draftBy = new Map<string, Draft>();
  const plainSpelling = (t: string): Spelling => byWord.has(t) ? spellingOf(byWord.get(t)!) : { text: t, mode: 'case' };

  for (const e of pron) {
    if (aliasOf.has(e.word)) continue; // joined to its group below
    if (e.kind === 'common-word') {
      excluded.push({ word: e.word, why: 'pronunciation entry of kind common-word (ordinary English)' });
      continue;
    }
    if (e.word.split(/\s+/).length >= PHRASE_WORDS && !review.merge.some((m) => m.term === e.word)) {
      excluded.push({ word: e.word, why: `a phrase of ${e.word.split(/\s+/).length} words, not a word` });
      continue;
    }
    const d: Draft = { term: e.word, primary: spellingOf(e), aliases: [], source: 'pronunciation', kind: e.kind, respelling: e.respelling ?? null };
    drafts.push(d);
    draftBy.set(e.word, d);
  }
  for (const a of review.add) {
    if (draftBy.has(a.term) || byWord.has(a.term)) throw new Error(`review add: "${a.term}" is already a term`);
    const mode: Mode = a.match_case === false ? 'nocase' : 'case';
    const d: Draft = { term: a.term, primary: { text: a.term, mode }, aliases: [], source: 'review', kind: a.kind, respelling: null };
    for (const al of a.aliases ?? []) d.aliases.push(byWord.has(al) ? spellingOf(byWord.get(al)!) : { text: al, mode });
    drafts.push(d);
    draftBy.set(a.term, d);
  }
  for (const m of review.merge) {
    let d = draftBy.get(m.term);
    if (!d) {
      // The group's display term may itself be an alias-only word (e.g. an entity's full name).
      d = { term: m.term, primary: plainSpelling(m.term), aliases: [], source: 'review', kind: byWord.get(m.term)?.kind ?? m.aliases.map((a) => byWord.get(a)?.kind).find(Boolean) ?? 'name', respelling: byWord.get(m.term)?.respelling ?? null };
      drafts.push(d);
      draftBy.set(m.term, d);
    }
    for (const a of m.aliases) {
      d.aliases.push(plainSpelling(a));
      if (!d.respelling && byWord.get(a)?.respelling) d.respelling = byWord.get(a)!.respelling!;
    }
  }
  for (const x of review.exclude) {
    const i = drafts.findIndex((d) => d.term === x.word);
    if (i >= 0) drafts.splice(i, 1);
    excluded.push({ word: x.word, why: `review: ${x.why}` });
  }

  // Entity names: every capitalised run must be a term or alias, or decided in the review file.
  const known = new Set<string>();
  for (const d of drafts) [d.term, ...d.aliases.map((a) => a.text)].forEach((t) => known.add(t));
  const decided = new Set([...review.exclude.map((x) => x.word), ...review.entity_covered.map((x) => x.name), ...pron.map((e) => e.word)]);
  const entityFiles: string[] = [];
  const undecided: string[] = [];
  const entityNames = new Set<string>();
  for (const dir of ENTITY_DIRS) {
    const abs = path.join(root, 'content/snowmoon/designs', dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((f) => f.endsWith('.json')).sort()) {
      const rel = `content/snowmoon/designs/${dir}/${f}`;
      entityFiles.push(rel);
      const name = String(JSON.parse(read(rel)).name ?? '');
      for (const run of entityRuns(name)) {
        entityNames.add(run);
        if (!known.has(run) && !decided.has(run)) undecided.push(`${rel}: "${run}"`);
      }
    }
  }
  if (undecided.length) throw new Error(`entity names not decided in ${REVIEW_FILE}:\n  ${undecided.join('\n  ')}`);
  // Source: the pronunciation file if any spelling has an entry there, else an entity name, else the review file.
  for (const d of drafts) {
    const all = [d.term, ...d.aliases.map((a) => a.text)];
    d.source = all.some((t) => byWord.has(t)) ? 'pronunciation' : all.some((t) => entityNames.has(t)) ? 'entity' : 'review';
  }

  // ---- The book ----
  const chapters = Array.from({ length: CHAPTERS }, (_, i) => JSON.parse(read(`content/snowmoon/text/chapter-${i + 1}.json`)) as { chapter: number; blocks: { idx: number; kind: string; content: string; sha256: string }[] });

  // Spellings, longest first.
  const spellings: { s: Spelling; d: Draft; re: RegExp }[] = [];
  for (const d of drafts) for (const s of [d.primary, ...d.aliases]) spellings.push({ s, d, re: new RegExp(`${B1}${src(s)}${B2}`, 'g') });
  spellings.sort((a, b) => b.s.text.length - a.s.text.length || a.s.text.localeCompare(b.s.text));
  const italicSpans = (content: string) => [
    ...[...content.matchAll(/(?<!\*)\*([^*]+)\*(?!\*)/g)].map((m) => m[1]),
    ...[...content.matchAll(/(?<![\w])'([a-z][a-z ]*)'(?![\w])/g)].map((m) => m[1]),
  ];

  const mentions = new Map<Draft, Map<number, number[]>>();
  const add = (d: Draft, ch: number, idx: number) => {
    if (!mentions.has(d)) mentions.set(d, new Map());
    const m = mentions.get(d)!;
    if (!m.has(ch)) m.set(ch, []);
    if (!m.get(ch)!.includes(idx)) m.get(ch)!.push(idx);
  };
  for (const c of chapters) {
    for (const b of c.blocks) {
      if (b.kind === 'heading' || b.kind === 'break') continue;
      let text = plainText(b.content);
      const italics = italicSpans(b.content).join(' | ');
      for (const { s, d, re } of spellings) {
        const hay = s.mode === 'italic' ? italics : text;
        re.lastIndex = 0;
        let hit = false;
        if (s.mode === 'italic') hit = re.test(hay);
        else {
          // Mask matched spans so shorter spellings do not match inside them.
          text = text.replace(re, (m) => ((hit = true), '\u0000'.repeat(m.length)));
        }
        if (hit) add(d, c.chapter, b.idx);
      }
    }
  }

  // ---- Explanations ----
  const patterns = new Map<Draft, RegExp[]>();
  for (const d of drafts) {
    const alt = [d.primary, ...d.aliases].map(src).join('|');
    patterns.set(d, explainPatterns(`(?:${alt})`));
  }
  const explanations = new Map<Draft, Explanation[]>();
  const rejectedUsed = new Set<Review['not_explanations'][number]>();
  for (const c of chapters) {
    for (const b of c.blocks) {
      if (b.kind !== 'paragraph' && b.kind !== 'quote') continue;
      const inBlock = drafts.filter((d) => mentions.get(d)?.get(c.chapter)?.includes(b.idx));
      if (!inBlock.length) continue;
      for (const sentence of sentences(quoteSource(b.content))) {
        if (/[<&]/.test(sentence)) continue;
        const flat = sentence.replace(/\\(.)/g, '$1').replace(/\*/g, '');
        for (const d of inBlock) {
          const list = explanations.get(d) ?? [];
          if (list.length >= MAX_EXPLANATIONS) continue;
          if (patterns.get(d)!.some((p) => p.test(flat))) {
            const id = `c${c.chapter}-b${b.idx}`;
            const no = review.not_explanations.find((x) => x.term === d.term && x.block === id);
            if (no) {
              rejectedUsed.add(no);
              continue;
            }
            list.push({ block: `c${c.chapter}-b${b.idx}`, chapter: c.chapter, idx: b.idx, text: sentence });
            explanations.set(d, list);
          }
        }
      }
    }
  }

  const stale = review.not_explanations.filter((x) => !rejectedUsed.has(x));
  if (stale.length) throw new Error(`${REVIEW_FILE} not_explanations that no longer match a picked sentence: ${stale.map((x) => `${x.term} ${x.block}`).join(', ')}`);

  // ---- Clips ----
  const narration = new Map<number, { idx: number; url: string; duration_ms: number; start_ms: number; text: string; read_aloud_status?: string }[]>();
  const chapterUrl = new Map<number, string>();
  let narrationHash = '';
  for (let n = 1; n <= CHAPTERS; n++) {
    const rel = `content/snowmoon/narration/${VOICE}/chapter-${n}.json`;
    if (!existsSync(path.join(root, rel))) continue;
    const raw = read(rel);
    narrationHash += sha(raw);
    const j = JSON.parse(raw);
    narration.set(n, j.segments);
    chapterUrl.set(n, j.chapter_file.url);
  }
  const spoken = (t: string) => t.replace(/\[([^\]]+)\]\(\/[^)]*\/\)/g, '$1');
  const clipFor = (d: Draft): Clip | null => {
    const m = mentions.get(d);
    if (!m) return null;
    const any = new RegExp(`${B1}(?:${[d.primary, ...d.aliases].map((s) => esc(s.text)).join('|')})${B2}`, 'i');
    for (const ch of [...m.keys()].sort((a, b) => a - b)) {
      const segs = narration.get(ch) ?? [];
      const hits = m
        .get(ch)!
        .map((idx) => segs.find((s) => s.idx === idx))
        .filter((s): s is NonNullable<typeof s> => !!s && !s.read_aloud_status && any.test(spoken(s.text)));
      if (!hits.length) continue;
      const best = hits.reduce((a, b) => (b.duration_ms < a.duration_ms || (b.duration_ms === a.duration_ms && b.idx < a.idx) ? b : a));
      return { block: `c${ch}-b${best.idx}`, chapter: ch, idx: best.idx, url: best.url, duration_ms: best.duration_ms, start_ms: best.start_ms, chapter_url: chapterUrl.get(ch)! };
    }
    return null;
  };

  // ---- Assemble ----
  const terms: Term[] = [];
  for (const d of drafts) {
    const m = mentions.get(d);
    if (!m) {
      excluded.push({ word: d.term, why: 'no mention in the book text (after longer terms take their words)' });
      continue;
    }
    const chs = [...m.keys()].sort((a, b) => a - b);
    const byCh: Record<string, number[]> = {};
    for (const ch of chs) byCh[String(ch)] = [...m.get(ch)!].sort((a, b) => a - b);
    const firstCh = chs[0];
    terms.push({
      slug: '',
      term: d.term,
      aliases: d.aliases.map((a) => a.text),
      source: d.source,
      kind: d.kind,
      respelling: d.respelling,
      first: `c${firstCh}-b${byCh[String(firstCh)][0]}`,
      first_chapter: firstCh,
      explanations: explanations.get(d) ?? [],
      mentions: byCh,
      mention_count: chs.reduce((n, ch) => n + byCh[String(ch)].length, 0),
      clip: clipFor(d),
    });
  }
  // Book order for slugs (a clash gets -2 in the order of first appearance), then A–Z for the file.
  const order = (t: Term) => t.first_chapter * 100000 + Number(t.first.split('-b')[1]);
  terms.sort((a, b) => order(a) - order(b) || a.term.localeCompare(b.term));
  const used = new Set<string>();
  for (const t of terms) {
    let s = slugify(t.term) || 'term';
    for (let k = 2; used.has(s); k++) s = `${slugify(t.term)}-${k}`;
    used.add(s);
    t.slug = s;
  }
  terms.sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }) || a.slug.localeCompare(b.slug));
  excluded.sort((a, b) => a.word.localeCompare(b.word));

  const textHash = sha(chapters.map((c) => c.blocks.map((b) => b.sha256).join('')).join(''));
  const entityHash = sha(entityFiles.map((f) => sha(read(f))).join(''));
  return {
    work_id: 'snowmoon',
    about:
      'Glossary of the invented words in Snowmoon. Built by scripts/build-glossary.ts from the files in `sources`; do not edit by hand (npm run build:glossary). Every explanation is a sentence of the book, quoted exactly with its block id; no definition is written by a model or a person. Judgement calls are in content/snowmoon/glossary-review.json.',
    rules: {
      inclusion:
        'Every pronunciation.json entry except kind common-word and phrases of four or more words; every capitalised run in a character, location or prop name (article, title and possessive dropped), decided in the review file; the review file\'s added terms; spellings joined by the review file\'s merges. Terms the book never mentions are dropped.',
      mentions:
        'A spelling as a whole word in a block\'s text (tags and Markdown marks removed), longest spellings first; case as the pronunciation entry says; single lowercase Dzegoban words only inside italics or single quotes; headings and breaks skipped.',
      explanations:
        'A sentence of a paragraph or quote block, exactly as written (speaker-colour span tags removed), that mentions the term as: T is/was/are/were/means/stands for/refers to + a|an|the|one|…|a capitalised word; called/named/known as/nicknamed/dubbed/word for T; T, a|an|the (not after a quote mark); T - a|an|the|quote; T: a|an|the; T ( or (T); in Dzegoban / Dzegoban for in the sentence; T, as … call/know/say. First five in book order. Sentences with markup are skipped.',
      clip:
        'The block clip of the house narration (no word timings exist) in which the term is spoken, in the first chapter where it is, the shortest; never a model-drafted spoken description. The whole block plays.',
    },
    sources: {
      pronunciation_sha256: sha(pronText),
      review_sha256: sha(reviewText),
      text_blocks_sha256: textHash,
      entities_sha256: entityHash,
      narration_sha256: sha(narrationHash),
      narration_voice: VOICE,
    },
    counts: {
      terms: terms.length,
      with_explanation: terms.filter((t) => t.explanations.length).length,
      with_clip: terms.filter((t) => t.clip).length,
      from_pronunciation: terms.filter((t) => t.source === 'pronunciation').length,
      from_entity: terms.filter((t) => t.source === 'entity').length,
      from_review: terms.filter((t) => t.source === 'review').length,
      excluded: excluded.length,
    },
    terms,
    excluded,
  };
}

/** Capitalised runs of an entity name, article, title and possessive dropped: "Senator Verdow's office" -> ["Verdow"]. */
export function entityRuns(name: string): string[] {
  const runs = name.match(/[A-Z][A-Za-z-]*(?:'s)?(?: (?:of )?[A-Z][A-Za-z-]*(?:'s)?)*/g) ?? [];
  return runs
    .map((r) => r.replace(/'s\b/g, '').split(' '))
    .map((w) => (TITLES.includes(w[0]) && w.length > 1 ? w.slice(1) : w))
    .map((w) => w.join(' '))
    .filter((r) => r !== 'The');
}

export const serialize = (g: Glossary) => JSON.stringify(g, null, 1) + '\n';

/** Problems with a glossary against the book: quotes exact, block ids real, nothing but book quotes. */
export function verifyGlossary(g: Glossary, blocks: Map<string, { kind: string; content: string }>): string[] {
  const problems: string[] = [];
  const TERM_KEYS = ['slug', 'term', 'aliases', 'source', 'kind', 'respelling', 'first', 'first_chapter', 'explanations', 'mentions', 'mention_count', 'clip'];
  for (const t of g.terms) {
    const extra = Object.keys(t).filter((k) => !TERM_KEYS.includes(k));
    if (extra.length) problems.push(`${t.slug}: fields that are not the book's (${extra.join(', ')})`);
    if (!blocks.has(t.first)) problems.push(`${t.slug}: first block ${t.first} does not exist`);
    for (const e of t.explanations) {
      const ek = Object.keys(e).filter((k) => !['block', 'chapter', 'idx', 'text'].includes(k));
      if (ek.length) problems.push(`${t.slug}: an explanation carries ${ek.join(', ')}`);
      const b = blocks.get(e.block);
      if (!b) problems.push(`${t.slug}: explanation block ${e.block} does not exist`);
      else if (e.block !== `c${e.chapter}-b${e.idx}`) problems.push(`${t.slug}: explanation ${e.block} has chapter/idx ${e.chapter}/${e.idx}`);
      else if (!quoteSource(b.content).includes(e.text)) problems.push(`${t.slug}: "${e.text.slice(0, 50)}…" is not verbatim in ${e.block}`);
    }
    for (const [ch, list] of Object.entries(t.mentions)) for (const idx of list) if (!blocks.has(`c${ch}-b${idx}`)) problems.push(`${t.slug}: mention c${ch}-b${idx} does not exist`);
    if (t.clip && !blocks.has(t.clip.block)) problems.push(`${t.slug}: clip block ${t.clip.block} does not exist`);
  }
  return problems;
}

export function loadBlocks(root: string): Map<string, { kind: string; content: string }> {
  const m = new Map<string, { kind: string; content: string }>();
  for (let n = 1; n <= CHAPTERS; n++) {
    for (const b of JSON.parse(readFileSync(path.join(root, `content/snowmoon/text/chapter-${n}.json`), 'utf8')).blocks) m.set(`c${n}-b${b.idx}`, b);
  }
  return m;
}
