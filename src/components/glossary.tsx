'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { lastChapter, openedChapters } from '~/lib/chat/device';
import { blockHref, parsePlace, quoteHtml, type GlossaryIndexEntry, type GlossaryTermView } from '~/lib/glossary-view';

/**
 * The glossary's index and term pages (data: content/snowmoon/glossary.json).
 *
 * Spoilers, as the Pictures feed does it: the furthest chapter opened on this device (at least 1)
 * limits what shows; anything later is covered with a count and "Show anyway". Until the device
 * is read (and in the server's HTML) the limit is Chapter 1. The page's data still carries later
 * chapters, as the feed's does.
 *
 * Back: ?from=c3-b42 (set by the menu's Glossary link from the reader) returns to that block;
 * without it, to the chapter opened last on this device. Kept on every link inside the glossary.
 * Wording: drafted by the coding agent, not yet approved (one "Draft wording" line per screen).
 */
function useReader() {
  const [furthest, setFurthest] = useState(1);
  const [from, setFrom] = useState<string | null>(null);
  const [last, setLast] = useState(1);
  useEffect(() => {
    setFurthest(Math.max(1, ...openedChapters()));
    setLast(lastChapter());
    setFrom(parsePlace(new URLSearchParams(window.location.search).get('from'))?.block ?? null);
  }, []);
  return { furthest, from, last };
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

function Cover({ children, action, onShow }: { children: React.ReactNode; action: string; onShow: () => void }) {
  return (
    <div className="gl-cover">
      <p>{children}</p>
      <button type="button" className="pictures-show" onClick={onShow}>
        {action}
      </button>
    </div>
  );
}

const DRAFT = <p className="as-draft gl-draftline">Draft wording</p>;

export function GlossaryIndex({ entries, total, explained, method }: { entries: GlossaryIndexEntry[]; total: number; explained: number; method: string }) {
  const { furthest, from, last } = useReader();
  const [all, setAll] = useState(false);
  const shown = entries.filter((e) => all || e.chapter <= furthest);
  const hidden = entries.length - shown.length;
  return (
    <div className="page prose glossary">
      <BackLink from={from} last={last} />
      <p className="label">Glossary</p>
      <h1>Invented words</h1>
      <p>
        Names, places and Dzegoban words from the book. Each page quotes the sentences where the book itself explains the word, if
        it does, and lists every paragraph that mentions it. Nothing here is a definition written by us or by a model.
      </p>
      <p className="gl-meta">
        {all ? `All ${total} words` : `Words up to Chapter ${furthest}, the furthest you've opened`} · {explained} of {total} have a
        sentence that explains them
      </p>
      <ul className="gl-index">
        {shown.map((e) => (
          <li key={e.slug}>
            <Link href={withFrom(`/glossary/${e.slug}`, from)}>
              <span>{e.term}</span>
              <span className="gl-ch">Ch {e.chapter}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Cover action="Show them anyway" onShow={() => setAll(true)}>
          {hidden} more {hidden === 1 ? 'word first appears' : 'words first appear'} after Chapter {furthest}, past where you&apos;ve read.
        </Cover>
      )}
      <p className="gl-method">
        Words come from the narration&apos;s pronunciation list, the character and place sheets, and a reviewed list; the sentences are
        picked by a fixed rule. <a href={method}>How it is built</a>
      </p>
      {DRAFT}
    </div>
  );
}

export function GlossaryTerm({ t }: { t: GlossaryTermView }) {
  const { furthest, from, last } = useReader();
  const [all, setAll] = useState(false);
  const within = (ch: number) => all || ch <= furthest;

  if (!within(t.firstChapter)) {
    return (
      <div className="page prose glossary">
        <BackLink from={from} last={last} />
        <p className="label">Glossary</p>
        <h1>A word from later in the book</h1>
        <Cover action="Show it anyway" onShow={() => setAll(true)}>
          This word first appears in Chapter {t.firstChapter}, past where you&apos;ve read.
        </Cover>
        <p>
          <Link href={withFrom('/glossary', from)}>All words</Link>
        </p>
        {DRAFT}
      </div>
    );
  }

  const quotes = t.explanations.filter((e) => within(e.chapter));
  const mentions = t.mentions.filter((m) => within(m.chapter));
  const hiddenQuotes = t.explanations.length - quotes.length;
  const hiddenMentions = t.mentions.filter((m) => !within(m.chapter)).reduce((n, m) => n + m.blocks.length, 0);
  const clip = t.clip && within(t.clip.chapter) ? t.clip : null;
  const hiddenParts = [
    hiddenQuotes ? `${hiddenQuotes} ${hiddenQuotes === 1 ? 'sentence' : 'sentences'}` : '',
    hiddenMentions ? `${hiddenMentions} ${hiddenMentions === 1 ? 'mention' : 'mentions'}` : '',
    t.clip && !clip ? 'the clip' : '',
  ].filter(Boolean);

  return (
    <div className="page prose glossary">
      <BackLink from={from} last={last} />
      <p className="label">Glossary · first in Chapter {t.firstChapter}</p>
      <h1>{t.term}</h1>
      {t.aliases.length > 0 && <p className="gl-meta">Also written: {t.aliases.join(', ')}</p>}

      {clip && <Clip clip={clip} respelling={t.respelling} />}

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
        <p className="gl-none">
          {hiddenQuotes ? 'No sentence up to where you’ve read explains this word.' : 'The book has no sentence that explains this word, by the glossary’s rule.'}
        </p>
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
      {hiddenParts.length > 0 && (
        <Cover action="Show them anyway" onShow={() => setAll(true)}>
          Past Chapter {furthest}, where you&apos;ve read to: {hiddenParts.join(', ')}.
        </Cover>
      )}
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
        {clip.voice.split(' · ')[0]}, AI-generated · the whole of{' '}
        <Link href={blockHref(clip.block)}>
          Chapter {clip.chapter}, {clip.label}
        </Link>
        , since the narration has no word timings
        {respelling ? ` · said as ${respelling}, a house choice, unreviewed` : ''}
      </p>
    </div>
  );
}
