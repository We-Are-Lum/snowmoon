'use client';

import { InfoLabel } from './info-label';
import { MakeImageLink } from './make-image-link';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { lastChapter } from '~/lib/chat/device';
import { AiLabel } from '~/components/recipe-sheet';
import { AI_LABEL } from '~/lib/ai-declared';
import { blockHref, parsePlace, quoteHtml, type GlossaryIndexEntry, type GlossaryTermView } from '~/lib/glossary-view';

/**
 * The glossary's index and term pages (data: content/snowmoon/glossary.json).
 *
 * Every word, sentence and mention is shown, from the whole book: spoilers no longer matter anywhere on the site
 * (owner, 2026-11-17; principle 9 retired). Until then the furthest chapter opened on this device covered later ones.
 *
 * Back: ?from=c3-b42 (set by the menu's Glossary link from the reader) returns to that block;
 * without it, to the chapter opened last on this device. Kept on every link inside the glossary.
 * Wording: drafted by the coding agent, not yet approved (one "Draft wording" line per screen).
 */
function useReader() {
  const [from, setFrom] = useState<string | null>(null);
  const [last, setLast] = useState(1);
  useEffect(() => {
    setLast(lastChapter());
    setFrom(parsePlace(new URLSearchParams(window.location.search).get('from'))?.block ?? null);
  }, []);
  return { from, last };
}

const withFrom = (href: string, from: string | null) => (from ? `${href}?from=${from}` : href);

function BackLink({ from, last }: { from: string | null; last: number }) {
  const place = parsePlace(from);
  const chapter = place?.chapter ?? last;
  return (
    <Link className="gl-back" href={place ? blockHref(place.block) : `/chapter/${chapter}`}>
      ← Back to Chapter {chapter}
    </Link>
  );
}

const DRAFT = <p className="as-draft gl-draftline">Draft wording</p>;

export function GlossaryIndex({ entries, total, explained, method }: { entries: GlossaryIndexEntry[]; total: number; explained: number; method: string }) {
  const { from, last } = useReader();
  return (
    <div className="page prose glossary">
      <BackLink from={from} last={last} />
      <p className="label">Glossary</p>
      <h1>Invented words</h1>
      {/* Less text, details behind ⓘ (owner, 2026-10-29). */}
      <p>
        Names, places and Dzegoban words from the book.{' '}
        <InfoLabel
          word="About"
          kind="about"
          declaration="About the glossary"
          title="The glossary"
          body={[
            'Each page quotes the sentences where the book itself explains the word, if it does, and lists every paragraph that mentions it. Nothing here is a definition written by us or by a model.',
            `${explained} of ${total} words have a sentence that explains them.`,
            "Words come from the narration's pronunciation list, the character and place sheets, and a reviewed list; the sentences are picked by a fixed rule.",
          ]}
          links={[{ href: method, label: 'How it is built' }]}
        />
      </p>
      <p className="gl-meta">All {total} words</p>
      <ul className="gl-index">
        {entries.map((e) => (
          <li key={e.slug}>
            <Link href={withFrom(`/glossary/${e.slug}`, from)}>
              <span>{e.term}</span>
              <span className="gl-ch">Ch {e.chapter}</span>
            </Link>
          </li>
        ))}
      </ul>
      {DRAFT}
    </div>
  );
}

export function GlossaryTerm({ t }: { t: GlossaryTermView }) {
  const { from, last } = useReader();
  const quotes = t.explanations;
  const mentions = t.mentions;
  const clip = t.clip;
  const first = t.firstSentence;

  return (
    <div className="page prose glossary">
      <BackLink from={from} last={last} />
      <p className="label">Glossary · first in Chapter {t.firstChapter}</p>
      <h1>{t.term}</h1>
      {t.aliases.length > 0 && <p className="gl-meta">Also written: {t.aliases.join(', ')}</p>}

      {clip && <Clip clip={clip} respelling={t.respelling} />}

      {/* Always shown, even when the same sentence is also under "In the book's words". */}
      {first && (
        <>
          <h2>First appears</h2>
          <blockquote className="gl-quote gl-first">
            <p dangerouslySetInnerHTML={{ __html: quoteHtml(first.text) }} />
            <Link className="gl-cite" href={blockHref(first.block)}>
              Chapter {first.chapter}, {first.label}
            </Link>
          </blockquote>
          {/* "Add a reference" sits here (owner, 2026-10-29): a picture of this word, made from the passage it first appears in. */}
          {(() => {
            const idx = Number(/-b(\d+)$/.exec(first.block)?.[1]);
            return Number.isInteger(idx) ? (
              <MakeImageLink className="ic-secondary gl-add-ref" passage={{ chapter: first.chapter, start: idx, end: idx }}>
                Add a reference
              </MakeImageLink>
            ) : null;
          })()}
        </>
      )}

      <h2>In the book&apos;s words</h2>
      {quotes.length ? (
        quotes.map((q) => (
          <blockquote key={q.block + q.text} className="gl-quote">
            <p dangerouslySetInnerHTML={{ __html: quoteHtml(q.text) }} />
            <Link className="gl-cite" href={blockHref(q.block)}>
              Chapter {q.chapter}, {q.label}
            </Link>
          </blockquote>
        ))
      ) : (
        <p className="gl-none">The book has no sentence that explains this word, by the glossary’s rule.</p>
      )}

      <h2>Every mention</h2>
      <ul className="gl-mentions">
        {mentions.map((m) => (
          <li key={m.chapter}>
            <span className="gl-ch">Chapter {m.chapter}</span>{' '}
            {m.blocks.map((b, i) => (
              <span key={b.block}>
                {i > 0 && ', '}
                <Link href={blockHref(b.block)}>{b.label}</Link>
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p>
        <Link href={withFrom('/glossary', from)}>All words</Link>
      </p>
      {DRAFT}
    </div>
  );
}

function Clip({ clip, respelling }: { clip: NonNullable<GlossaryTermView['clip']>; respelling: string | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    if (!audio.current) {
      audio.current = new Audio(clip.url);
      audio.current.addEventListener('ended', () => setPlaying(false));
      audio.current.addEventListener('pause', () => setPlaying(false));
      audio.current.addEventListener('play', () => setPlaying(true));
    }
    if (audio.current.paused) {
      audio.current.currentTime = 0;
      void audio.current.play().catch(() => setPlaying(false));
    } else audio.current.pause();
  };
  return (
    <div className="gl-clip">
      <button type="button" className="gl-play" aria-pressed={playing} onClick={toggle}>
        {playing ? 'Stop' : `Hear it · ${clip.seconds} s`}
      </button>
      <p className="gl-clip-note">
        <AiLabel kind="voice" text={AI_LABEL.voice} file={clip.recipe} item={String(clip.idx)} /> · the whole of{' '}
        <Link href={blockHref(clip.block)}>
          Chapter {clip.chapter}, {clip.label}
        </Link>
        , since the narration has no word timings
        {respelling ? ` · said as ${respelling}, a house choice, unreviewed` : ''}
      </p>
    </div>
  );
}
