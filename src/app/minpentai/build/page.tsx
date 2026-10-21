import Link from 'next/link';
import { loadChapter } from '~/lib/book';
import { REPO_URL } from '~/lib/config';
import { AREAS, KIT_RULES, type KitRule } from '~/lib/minpentai/kit-rules';
import { SHOWN_CHAPTERS, blockParagraphs, counts, figureWords } from '~/lib/minpentai/kit';
import { MinpentaiTags } from '../mp-tags';
import kit from '../../../../public/minpentai/rules.json';

export const metadata = { title: 'Build on Minpentai' };
export const dynamic = 'force-static';

/**
 * /minpentai/build: the Minpentai build-on kit as one page (kit part 1, section C; owner's go, 2026-10-20):
 * what exists, every rule marked from the book or invented (src/lib/minpentai/kit-rules.ts), and all 152
 * passages. Every passage from chapters 2–14 is shown; chapters 15 onward are inside a closed Spoilers
 * section (owner's decision, 2026-10-20). The passages are the book's words, read from content/snowmoon/text at build;
 * everything else on the page is DRAFT wording, drafted by the coding agent, and labelled so.
 * Checked by npm run test:minpentai-kit, check:principles P8g and check:ui.
 */
type P = (typeof kit.passages)[number];

const REASONS: Record<string, string> = { names: 'names Minpentai', 'rules-doc': 'in the rules reading', learn: 'cited in Learn' };
const SITE: Record<KitRule['site'], string> = { yes: 'SITE FOLLOWS IT', partly: 'SITE FOLLOWS IT IN PART', no: 'NOT ON THE SITE' };

/** The book's emphasis (*word*) as italics; every other character as written. */
function Words({ text }: { text: string }) {
  return <>{text.split(/(\*[^*]+\*)/g).map((t, i) => (/^\*[^*]+\*$/.test(t) ? <em key={i}>{t.slice(1, -1)}</em> : t))}</>;
}

const href = (block: string) => { const [c] = block.slice(1).split('-b'); return `/chapter/${c}#${block}`; };

function Passage({ p }: { p: P }) {
  const b = loadChapter(p.chapter)?.blocks.find((x) => x.idx === Number(p.block.split('-b')[1]));
  if (!b) return null;
  const words = figureWords(b);
  return (
    <li className="mp-kit-passage" id={`p-${p.block}`}>
      <p className="mp-kit-meta"><Link href={p.href}>{p.block}</Link> · {p.reasons.map((r) => REASONS[r]).join(' · ')}{p.kind !== 'paragraph' ? ` · ${p.kind}` : ''}</p>
      {b.kind === 'figure' ? (
        <p className="mp-kit-figure">
          A figure{words.length ? `; its only words are ${words.join(' ')}` : ', with no words'}. <Link href={p.href}>See it in chapter {p.chapter}</Link>.
        </p>
      ) : (
        <blockquote className="mp-kit-quote">{blockParagraphs(b).map((t, i) => <p key={i}><Words text={t} /></p>)}</blockquote>
      )}
    </li>
  );
}

function Chapters({ list }: { list: P[] }) {
  const chapters = [...new Set(list.map((p) => p.chapter))];
  return (
    <>
      {chapters.map((c) => (
        <section key={c} className="mp-kit-chapter">
          <h3>Chapter {c}</h3>
          <ol className="mp-kit-passages">{list.filter((p) => p.chapter === c).map((p) => <Passage key={p.block} p={p} />)}</ol>
        </section>
      ))}
    </>
  );
}

function Rule({ r }: { r: KitRule }) {
  return (
    <li className="mp-kit-rule" id={`rule-${r.id}`}>
      <p className="mp-kit-rule-text">{r.rule}</p>
      <p className="mp-kit-meta">
        <span className={`mp-kit-src ${r.source}`}>{r.source === 'book' ? `FROM THE BOOK · ${r.how?.toUpperCase()}` : 'INVENTED'}</span>{' '}
        <span className={`mp-kit-site ${r.site}`}>{SITE[r.site]}</span>
      </p>
      {r.cites?.length ? (
        <ul className="mp-kit-cites">
          {r.cites.map((c, i) => (
            <li key={i}>{c.quote ? <>&ldquo;<Words text={c.quote} />&rdquo; </> : 'The figure '}<Link href={href(c.block)}>{c.block}</Link></li>
          ))}
        </ul>
      ) : null}
      <p className="mp-kit-note">{r.siteNote}</p>
      {r.code?.length ? <p className="mp-kit-code">{[...new Set(r.code.map((c) => c.file))].join(' · ')}</p> : null}
    </li>
  );
}

export default function MinpentaiBuildPage() {
  const n = counts();
  const shown = kit.passages.filter((p) => p.shownOnPage), rest = kit.passages.filter((p) => !p.shownOnPage);
  const last = Math.max(...kit.passages.map((p) => p.chapter));
  const docs = `${REPO_URL}/tree/main/docs/minpentai`;
  return (
    <div className="page minpentai mp-rules-page mp-kit">
      <p className="mp-rules-back"><Link href="/minpentai?mode=play">← Minpentai</Link></p>
      {/* DRAFT wording, drafted by the coding agent (2026-10-20); the passages and quotes are the book's. */}
      <div className="mp-rules-note">
        <MinpentaiTags
          tags={['book', 'rules', 'draft']}
          details={{
            book: 'The passages and every quoted line are the book\'s words, unchanged, each with the block it comes from.',
            draft: 'Everything on this page except the book\'s words was drafted by the coding agent (Anthropic\'s Claude, a closed model) from the book and the code, and waits for a person to rewrite it.',
          }}
        />
      </div>
      <p className="mp-kit-label">RULES INVENTED FOR THIS EDITION · NOT AFFILIATED WITH THE AUTHOR · DRAFT</p>
      <h1 className="mp-kit-title">Build on Minpentai</h1>
      <p className="mp-kit-lead">
        What the book says about Minpentai, which rules this edition invented, and where each one lives in the code. Everything here except the
        book&apos;s words was drafted by the coding agent (Anthropic&apos;s Claude, a closed model).
      </p>
      <p className="mp-kit-links">
        <a href="/minpentai/rules.json">The rules as a file (rules.json)</a> · <a href={docs}>The kit on GitHub</a> · <Link href="/minpentai/rules">The rules page</Link> · <Link href="/minpentai/rule">The book&apos;s cell rule</Link>
      </p>

      <section className="mp-kit-section" aria-labelledby="kit-exists">
        <h2 id="kit-exists">What exists</h2>
        <ul className="mp-kit-list">
          <li><b>Play</b>: practice, the computer ladder, free play and one-on-one, on a 15 × 10 board with pieces (towers, gliders, squares, rocks). Its rules are invented. <span className="mp-kit-path">src/lib/minpentai/play-game/</span>; one-on-one runs on the server, <span className="mp-kit-path">play-server/</span>.</li>
          <li><b>Learn</b>: seven lessons, the broadcast and a practice match, on an earlier version of the same invented rules. <span className="mp-kit-path">src/lib/minpentai/learn-game/</span>.</li>
          <li><b>The book&apos;s cell rule</b>: the rule recovered from the animated board in chapter 4, stepping forward and back. <span className="mp-kit-path">src/lib/minpentai/engine.ts</span>, at <Link href="/minpentai/rule">/minpentai/rule</Link>.</li>
        </ul>
      </section>

      <section className="mp-kit-section" aria-labelledby="kit-rules">
        <h2 id="kit-rules">The rules</h2>
        <p>
          {KIT_RULES.length} rules: {n.book} from the book and {n.invented} invented. The site follows {n.site.yes}, follows {n.site.partly} in part, and does
          not follow {n.site.no}. A rule from the book is either said outright (stated) or follows from what the book describes (implied). The quotes come
          from chapters {SHOWN_CHAPTERS[0]} to {SHOWN_CHAPTERS[1]}.
        </p>
        {Object.entries(AREAS).map(([area, title]) => (
          <section key={area} className="mp-kit-area" aria-label={title}>
            <h3>{title}</h3>
            <ol className="mp-kit-rules">{KIT_RULES.filter((r) => r.area === area).map((r) => <Rule key={r.id} r={r} />)}</ol>
          </section>
        ))}
      </section>

      <section className="mp-kit-section" aria-labelledby="kit-passages">
        <h2 id="kit-passages">The book&apos;s passages</h2>
        <p>
          {kit.passages.length} passages name Minpentai or are cited about its rules. Shown here: the {shown.length} from chapters {SHOWN_CHAPTERS[0]} to{' '}
          {SHOWN_CHAPTERS[1]}. The other {rest.length}, from chapter {SHOWN_CHAPTERS[1] + 1} to {last}, are under Spoilers.
        </p>
        <Chapters list={shown} />
        <details className="mp-kit-spoilers">
          <summary>Spoilers · the other {rest.length} passages, chapters {Math.min(...rest.map((p) => p.chapter))} to {last}</summary>
          <Chapters list={rest} />
        </details>
      </section>
    </div>
  );
}
