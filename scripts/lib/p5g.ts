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
 */
export const CHALLENGE_FILES = /^src\/lib\/challenge\/|^src\/app\/challenge\/|^src\/app\/api\/challenge\/|^src\/components\/(challenge-[a-z-]+|posted-on|post-link-field)\.tsx$/;
export const NOT_AN_ORDER = /\b(likes?|like_?count|likeCount|built_?on|builtOn|score|repost|recast|repl(y|ies)|followers?|cost|amount|usd|payment|paid|sponsor|donation)\b/i;
const BASES_FILE = 'src/lib/challenge/entries.ts';
const RULES_FILE = 'src/lib/challenge/rules.ts';

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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
