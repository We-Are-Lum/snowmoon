/**
 * P5g, the remix challenge's ordering rule (owner, 2026-10-31: "No ordering by engagement or payment"), as a pure
 * function so scripts/test-challenge.ts can prove its one exception is narrow. check:principles runs it on the files.
 *
 * Entries, sheets to start from and "Posted on" are in time order and nothing else: in the challenge's code, every
 * .sort() is newestFirst, and no SQL order reads likes, built-on counts, scores, costs or payments.
 *
 * One exception (owner, 2026-11-04): "Bases to start from" may be in the bases' fixed style order
 * (CHALLENGE.baseStyles), so each character's bases line up as one cast. That is `.sort(baseStyleOrder)`, allowed only
 * inside startingSheets in src/lib/challenge/entries.ts, and baseStyleOrder (src/lib/challenge/rules.ts) may read
 * only CHALLENGE.baseStyles. Entries and every other list stay newest first.
 *
 * A second narrow exception (owner, 2026-11-04): the random selection on /challenge, a fresh, unweighted shuffle on
 * each visit, drawn from all published remixes of the challenge's characters. No weighting, no counts, no featuring.
 * In the challenge's code, randomness (Math.random, getRandomValues, randomInt) lives only in src/lib/challenge/shuffle.ts,
 * whose shuffleFresh takes a list of an unconstrained type (`<T>(items: readonly T[]`, so it can't read anything about
 * an item) and reads no likes, counts, scores, weights or settings; it is called only in the random selection
 * (src/components/challenge-remix-pick.tsx), on the whole list (`shuffleFresh(all)`), and the page's data
 * (src/lib/challenge/view.ts) hands that component every remix (`remixes(sql)`, with no filter, limit or order).
 * The same shuffle also orders a character's several bases (owner, 2026-11-04: Deluin's and Gladias' three, in a fresh
 * random order on each visit so none reads as the default), in src/components/challenge-bases.tsx only, on the
 * character's whole list of bases (`shuffleFresh(bases)`), and every submission's "Shuffled" order on
 * /challenge/entries, in src/components/challenge-entries-list.tsx only, on every entry shown (`shuffleFresh(all)`).
 *
 * The hub's cards (owner, 2026-11-05, branch challenge-moments): the random block is gone (answer 9); each card shows
 * its bases in a fresh order (`shuffleFresh(c.bases)`) and a random three of its character's remixes per visit
 * (`shuffleFresh(c.remixes)`, answer 8), in src/components/challenge-card.tsx only, on the card's whole lists; the
 * page's data (src/lib/challenge/view.ts) hands every card all of its character's remixes (`remixes(sql)` or, with
 * pictures, `challengePictures(sql)`, with no filter, limit or order).
 *
 * A fourth narrow exception (owner, 2026-11-05, answer 3): the curated moments, "Moments picked by @naaate"
 * (src/lib/challenge/moments.ts), in the book's fixed order (chapter, then block; never sorted), and "Surprise me",
 * which draws from that list only, unweighted: `shuffleFresh(MOMENTS.filter((m) => m.id !== moment))` in the remix
 * screen (src/components/challenge-make.tsx) only, all fifteen but the one already chosen (answer 4).
 */
export const CHALLENGE_FILES = /^src\/lib\/challenge\/|^src\/app\/challenge\/|^src\/app\/api\/challenge\/|^src\/components\/(challenge-[a-z-]+|posted-on|post-link-field)\.tsx$/;
export const NOT_AN_ORDER = /\b(likes?|like_?count|likeCount|built_?on|builtOn|score|repost|recast|repl(y|ies)|followers?|cost|amount|usd|payment|paid|sponsor|donation)\b/i;
const BASES_FILE = 'src/lib/challenge/entries.ts';
const SHUFFLE_FILE = 'src/lib/challenge/shuffle.ts';
const ENTRIES_PICK_FILE = 'src/components/challenge-entries-list.tsx';
const PAGE_FILE = 'src/lib/challenge/view.ts';
const CARD_FILE = 'src/components/challenge-card.tsx';
const MAKE_FILE = 'src/components/challenge-make.tsx';
const MOMENTS_FILE = 'src/lib/challenge/moments.ts';
const SURPRISE = 'MOMENTS.filter((m) => m.id !== moment)';
const RANDOM = /Math\.random\b|getRandomValues\b|randomInt\b/;
const WEIGHT = /\bweight|\bbias|\bboost|\bfeature[ds]?\b|\bpinned\b|\bcount\b|\bpopular/i;
const RULES_FILE = 'src/lib/challenge/rules.ts';

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Every call of shuffleFresh in the code, with its whole argument text (balanced parentheses). */
function shuffleCalls(code: string): { 1: string; index: number }[] {
  const out: { 1: string; index: number }[] = [];
  for (const m of code.matchAll(/shuffleFresh\(/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    for (; i < code.length && depth > 0; i++) depth += code[i] === '(' ? 1 : code[i] === ')' ? -1 : 0;
    out.push({ 1: code.slice(start, i - 1), index: m.index! });
  }
  return out;
}

/** The text of a top-level function, from its declaration to the next top-level declaration (or the end). */
function functionSpan(code: string, name: string): [number, number] | null {
  const m = new RegExp(`^export (async )?function ${name}\\b`, 'm').exec(code);
  if (!m) return null;
  const rest = code.slice(m.index + m[0].length);
  const next = /^(export |const |function |type |interface |async function )/m.exec(rest);
  return [m.index, next ? m.index + m[0].length + next.index : code.length];
}

export function p5gProblems(files: { file: string; text: string }[]): string[] {
  const problems: string[] = [];
  if (!files.some((f) => f.file === RULES_FILE)) problems.push(`${RULES_FILE}: missing`);
  for (const { file, text } of files) {
    const code = stripComments(text);
    const span = file === BASES_FILE ? functionSpan(code, 'startingSheets') : null;
    for (const m of code.matchAll(/\.sort\(([^)]*)\)/g)) {
      const by = m[1].trim();
      if (by === 'newestFirst') continue;
      if (by === 'baseStyleOrder' && span && m.index! >= span[0] && m.index! < span[1]) continue;
      problems.push(by === 'baseStyleOrder'
        ? `${file}: orders by style outside "Bases to start from" (only startingSheets in ${BASES_FILE} may): ${m[0].slice(0, 80)}`
        : `${file}: sorts by something other than newestFirst: ${m[0].slice(0, 80)}`);
    }
    for (const m of code.matchAll(/order by([^`;]{0,160})/gi)) if (NOT_AN_ORDER.test(m[1])) problems.push(`${file}: orders by "${m[1].trim().slice(0, 60)}"`);
    // The random selection's exception: randomness only in the shuffle, which is unweighted and generic.
    if (RANDOM.test(code) && file !== SHUFFLE_FILE) problems.push(`${file}: uses randomness (${code.match(RANDOM)![0]}) outside ${SHUFFLE_FILE}`);
    if (file === SHUFFLE_FILE) {
      if (!/export function shuffleFresh<T>\(items: readonly T\[\]/.test(code)) problems.push(`${SHUFFLE_FILE}: shuffleFresh must take a list of an unconstrained type, <T>(items: readonly T[], …), so it can read nothing about an item`);
      if (NOT_AN_ORDER.test(code) || WEIGHT.test(code)) problems.push(`${SHUFFLE_FILE}: the shuffle reads "${(code.match(NOT_AN_ORDER) ?? code.match(WEIGHT))![0]}": it must be unweighted`);
      if (/CHALLENGE\.|\.sort\(/.test(code)) problems.push(`${SHUFFLE_FILE}: the shuffle reads a setting or sorts: it must be a plain uniform shuffle`);
    }
    for (const m of shuffleCalls(code)) {
      if (file === SHUFFLE_FILE) continue;
      if (file === ENTRIES_PICK_FILE) {
        if (m[1].trim() !== 'all') problems.push(`${file}: shuffles something other than every entry shown: shuffleFresh(${m[1].slice(0, 40)})`);
        continue;
      }
      if (file === CARD_FILE) {
        if (!['c.bases', 'c.remixes'].includes(m[1].trim())) problems.push(`${file}: shuffles something other than a card's whole list of bases or remixes: shuffleFresh(${m[1].slice(0, 40)})`);
        continue;
      }
      if (file === MAKE_FILE) {
        if (m[1].trim() !== SURPRISE) problems.push(`${file}: "Surprise me" draws from something other than the curated moments (all but the one chosen): shuffleFresh(${m[1].slice(0, 60)})`);
        continue;
      }
      problems.push(`${file}: shuffles outside the cards, the entries' "Shuffled" order and "Surprise me" (only ${CARD_FILE}, ${ENTRIES_PICK_FILE} and ${MAKE_FILE} may)`);
    }
    if (file === MOMENTS_FILE && /\bweight|\bscore|\bpopular|\blikes?\b|\bsort\(/i.test(code)) problems.push(`${MOMENTS_FILE}: the moments read or set an order other than the book's ("${code.match(/\bweight|\bscore|\bpopular|\blikes?\b|\bsort\(/i)![0]}")`);
    if (file === PAGE_FILE && !/await (remixes|challengePictures)\(sql\)/.test(code)) problems.push(`${PAGE_FILE}: the cards' remixes aren't drawn from every remix (remixes(sql) or challengePictures(sql), with no filter, limit or order)`);
    if (file === RULES_FILE) {
      const s = functionSpan(code, 'baseStyleOrder');
      if (s) {
        const body = code.slice(s[0], s[1]);
        if (NOT_AN_ORDER.test(body)) problems.push(`${RULES_FILE}: baseStyleOrder reads something other than CHALLENGE.baseStyles`);
        if (/CHALLENGE\.(?!baseStyles\b)\w+/.test(body)) problems.push(`${RULES_FILE}: baseStyleOrder reads ${body.match(/CHALLENGE\.(?!baseStyles\b)\w+/)![0]}, not only CHALLENGE.baseStyles`);
      }
    }
  }
  return problems;
}

/**
 * P5i (owner, 2026-11-04): while the challenge runs, its remix cards and the feed show no remix, like or built-on
 * count, and the feed has no "most remixed" (or any other) sort: newest first, filterable by character, and nothing
 * else. Reads the card, the random selection, the feed page and the remixes' server code (comments aside). A viewer's
 * "most remixed" sort may come back after entries close, by the owner's decision then.
 */
export const P5I_FILES = ['src/components/challenge-remix-card.tsx', 'src/components/challenge-card.tsx', 'src/app/challenge/remixes/page.tsx', 'src/lib/challenge/remixes.ts', 'src/lib/challenge/remixes-view.ts', 'src/components/challenge-remixes-body.tsx', 'src/app/challenge/entries/page.tsx', 'src/components/challenge-entries-list.tsx', 'src/components/posted-on.tsx'];
const A_COUNT = /\bcount\s*\(|\b(likes?|like_?count|likeCount|built_?on|builtOn|remix_?count|remixCount|remixes_?count|versions|score|popular\w*|most[ _-]?remixed|mostRemixed|trending)\b/i;
export function p5iProblems(files: { file: string; text: string }[]): string[] {
  const problems: string[] = [];
  for (const f of P5I_FILES) if (!files.some((x) => x.file === f)) problems.push(`${f}: missing`);
  for (const { file, text } of files) {
    if (!P5I_FILES.includes(file)) continue;
    const code = stripComments(text);
    const m = code.match(A_COUNT);
    if (m) problems.push(`${file}: reads or shows a count or a popularity order ("${m[0]}")`);
    if (/searchParams[^;]*\b(sort|order)\b|\.(sort|order)\b\s*(===|\?\?|\|\|)|[?&](sort|order)=/.test(code)) problems.push(`${file}: offers a sort other than newest first`);
  }
  return problems;
}
