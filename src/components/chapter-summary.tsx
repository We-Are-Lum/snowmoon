import { loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { REPO_URL } from '~/lib/config';
import summaries from '../../content/snowmoon/chapter-summaries.json';

/**
 * A chapter's summary, collapsed until the reader opens it (owner, 2026-10-10), so nobody
 * sees this chapter's events unless they choose to. It rests only on this chapter and earlier
 * ones (scripts/chapter-summaries.ts check). Written by the coding agent, a closed model,
 * accepted by the owner as labelled and recorded (principle 3, 2026-10-10); declared as AI
 * where it is shown (principle 2). The label is the owner's draft wording.
 */
const RECIPE = 'content/snowmoon/chapter-summaries.json';
type Para = { from_paragraph: number; text: string; sources: string[] };

function passageLinks(n: number, sources: string[]) {
  const facts = new Map<number, Map<number, number | null>>();
  const labelOf = (id: string) => {
    const [c, b] = id.slice(1).split('-b').map(Number);
    if (!facts.has(c)) {
      const ch = loadChapter(c);
      const f = ch ? blockFacts(ch.blocks) : [];
      facts.set(c, new Map((ch?.blocks ?? []).map((blk, i) => [blk.idx, f[i]?.label ?? null])));
    }
    const label = facts.get(c)!.get(b);
    const kind = loadChapter(c)?.blocks.find((x) => x.idx === b)?.kind;
    const text = label === null || label === undefined ? (kind ?? `block ${b}`) : `¶ ${label}`;
    return { href: c === n ? `#${id}` : `/chapter/${c}#${id}`, text: c === n ? text : `ch ${c} ${text}` };
  };
  const order = (id: string) => {
    const [c, b] = id.slice(1).split('-b').map(Number);
    return c * 100000 + b;
  };
  return [...sources].sort((x, y) => order(x) - order(y)).map(labelOf);
}

export function ChapterSummary({ chapter: n }: { chapter: number }) {
  const paras = (summaries.chapters as Record<string, Para[]>)[String(n)];
  if (!paras?.length) return null;
  return (
    <details className="chapter-summary">
      <summary>
        Chapter {n} in brief <span className="chapter-summary-warn">· spoilers for this chapter</span>
      </summary>
      {paras.map((p) => (
        <div key={p.from_paragraph} className="chapter-summary-para">
          <p>{p.text}</p>
          <p className="chapter-summary-sources">
            Rests on{' '}
            {passageLinks(n, p.sources).map((l, i) => (
              <span key={l.href}>
                {i > 0 && ', '}
                <a href={l.href}>{l.text}</a>
              </span>
            ))}
          </p>
        </div>
      ))}
      <p className="chapter-summary-made">
        {/* The owner's draft wording (2026-10-10). */}
        AI summary · written by an AI model, Claude, not by the author, and checked against the book by AI. Nothing from
        later chapters. <a href={`${REPO_URL}/blob/main/${RECIPE}`}>How it was made</a>
      </p>
    </details>
  );
}
