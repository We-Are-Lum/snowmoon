'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { LearnMoreParts } from '~/components/challenge-learn-more';
import type { LearnMoreView } from '~/lib/challenge/learn-more-view';
import { EphelionIntroLead } from '~/components/ephelion-intro';
import { EPHELION_LANDING as W } from '~/lib/voice/ephelion-landing-wording';
import '../styles/ephelion.css';

/**
 * The /ephelion landing (Nate, 2026-11-25: the challenge is recording only; his Main and PhoneLanding files, plan v3).
 * Who may see it is the server's to say, as before: GET /api/voice/status answers 404 to anyone the voice switch doesn't
 * let in (admins and the invited testers, src/lib/voice/flag.ts), and the page then shows the site's not-found; signed
 * out, the sign-in line. Nothing here is published or collected: the cards play the shared ready-made AI readings;
 * people's takes show once publishing for takes exists ("No takes yet" until then).
 * - Desktop (840 px and wider): the 2:3 image beside the intro, Learn more and two equal buttons lined up with the image's
 *   bottom; the speeches (or Learn more, with "Back to the speeches") in the right column.
 * - Phone: the small image beside the title, the intro, Learn more opening in place, two equal buttons, the cards. No
 *   fixed bar.
 */
interface Speech { id: string; title: string; maxSeconds: number; characters: number; label: { kind: 'book' | 'invented' }; sentences: { n: number; text: string }[] }
interface Choice { presetId: string; candidate: number; name: string; saved: boolean }
interface Reading { speechId: string; presetId: string; id: string }
interface Status { speeches: Speech[]; choices: Choice[]; readings: Reading[]; canMakeReadings?: boolean; limits: { readingCreditsPerChar: number } }

/** Garance's remix entry 70762e34 (Nate, 2026-11-25), shown alone; it switches to the profile's master front once approved. */
export const EPHELION_IMAGE = {
  src: 'https://pictures.snowmoon.party/images/readers/13c311ffca167d12a348cf4bc4ee7516.jpg',
  entry: '/challenge/p/70762e34-5d10-4c73-96cd-dba19ef956c6',
} as const;

function ReadingPlay({ id, voice }: { id: string; voice: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return (
    <div className="eph-row">
      <button
        type="button"
        className="eph-play"
        aria-label={`${W.play}: ${W.aiReading}, ${voice}`}
        onClick={async () => {
          if (url) return void audio.current?.play();
          const r = await authFetch(`/api/voice/drafts/${id}/0`).catch(() => null);
          if (r?.ok) setUrl(URL.createObjectURL(await r.blob()));
          else setFailed(true);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
      </button>
      <div className="eph-row-text">
        <div className="eph-row-title">{W.aiReading}</div>
        <div className="eph-meta">{failed ? W.notAvailable : W.noPerson(voice)}</div>
        {url && <audio ref={audio} controls autoPlay src={url} className="eph-audio" />}
      </div>
    </div>
  );
}

/** An admin's "Make the AI reading" for a speech with none (Nate, 2026-11-26), in the first saved voice. */
function MakeReading({ s, choice, credits, onMade }: { s: Speech; choice: Choice; credits: number; onMade: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="eph-row">
      <span className="eph-play eph-play-empty" aria-hidden="true" />
      <div className="eph-row-text">
        <button
          type="button"
          className="eph-btn eph-btn-quiet eph-btn-small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await authFetch('/api/voice/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speechId: s.id, presetId: choice.presetId, candidate: choice.candidate }) }).catch(() => null);
            setBusy(false);
            if (r?.ok) onMade();
            else setError(((await r?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? W.readingFailed);
          }}
        >
          {busy ? W.makingReading : W.makeReading(choice.name, credits)}
        </button>
        <div className="eph-meta">{error ?? W.adminOnly}</div>
      </div>
    </div>
  );
}

function SpeechCard({ s, reading, voice, make }: { s: Speech; reading: Reading | null; voice: string | null; make: React.ReactNode }) {
  return (
    <article className="eph-card" data-speech={s.id}>
      <header className="eph-card-head">
        <h3>{s.title}</h3>
        <span className="eph-meta eph-up">{s.label.kind === 'book' ? W.book : W.invented}</span>
      </header>
      {reading && voice ? (
        <ReadingPlay id={reading.id} voice={voice} />
      ) : make ? (
        make
      ) : (
        <div className="eph-row">
          <span className="eph-play eph-play-empty" aria-hidden="true" />
          <div className="eph-row-text eph-meta">{W.readingSoon}</div>
        </div>
      )}
      <div className="eph-row eph-row-empty">
        <span className="eph-play eph-play-empty" aria-hidden="true" />
        <div className="eph-row-text eph-muted">{W.noTakes}</div>
      </div>
      <footer className="eph-card-foot">
        <Link className="eph-btn eph-btn-small" href={`/ephelion/record?speech=${encodeURIComponent(s.id)}`}>
          {W.record}
        </Link>
      </footer>
    </article>
  );
}

export function EphelionLanding({ fallback, signedOut, learn }: { fallback: React.ReactNode; signedOut: React.ReactNode; learn: LearnMoreView | null }) {
  const auth = useAuth();
  const [status, setStatus] = useState<Status | 'none' | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const speechesRef = useRef<HTMLElement>(null);
  const load = async () => {
    const r = await authFetch('/api/voice/status', { cache: 'no-store' }).catch(() => null);
    setStatus(r?.ok ? ((await r.json()) as Status) : 'none');
  };
  useEffect(() => {
    if (auth.kind !== 'signed-in') return;
    void load();
  }, [auth.kind]);
  if (auth.kind === 'signed-out') return <>{signedOut}</>;
  if (status === 'none') return <>{fallback}</>;
  if (auth.kind !== 'signed-in' || !status) return <div className="eph-wait" aria-busy="true" />;

  // One AI reading per card: the first voice (in the voices' order) that has one for this speech.
  const order = status.choices.map((c) => c.presetId);
  const nameOf = (p: string) => status.choices.find((c) => c.presetId === p)?.name ?? null;
  const readingFor = (sid: string) =>
    status.readings.filter((r) => r.speechId === sid).sort((a, b) => order.indexOf(a.presetId) - order.indexOf(b.presetId))[0] ?? null;
  const bookMinutes = Math.round((status.speeches.find((s) => s.label.kind === 'book')?.maxSeconds ?? 180) / 60);
  const toSpeeches = () => {
    setLearnOpen(false);
    requestAnimationFrame(() => speechesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const learnBody = learn && (
    <div className="eph-learn">
      <div className="eph-learn-head">
        <h2>{W.learnTitle}</h2>
        <button type="button" className="eph-btn eph-btn-quiet eph-btn-small" onClick={toSpeeches}>
          {W.back}
        </button>
      </div>
      <LearnMoreParts learn={learn} />
    </div>
  );

  return (
    <div className="eph-wrap">
    <main className="eph">
      <section className="eph-left">
        <div className="eph-hero">
          <a className="eph-image" href={EPHELION_IMAGE.entry} title={W.imageCredit}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EPHELION_IMAGE.src} alt={W.imageAlt} />
          </a>
          <div className="eph-hero-text">
            <p className="eph-meta eph-up">{W.kicker}</p>
            <h1>{W.title}</h1>
            <div className="eph-intro">
              <EphelionIntroLead />
            </div>
            {learn && (
              <button type="button" className="eph-link" aria-expanded={learnOpen} onClick={() => setLearnOpen((o) => !o)}>
                {W.learn} <span aria-hidden="true">{learnOpen ? '⌃' : '›'}</span>
              </button>
            )}
            {learnOpen && <div className="eph-learn-inline">{learnBody}</div>}
            <div className="eph-two">
              <Link className="eph-btn" href="/ephelion/record">
                {W.record}
              </Link>
              <button type="button" className="eph-btn eph-btn-quiet" onClick={toSpeeches}>
                <span className="eph-wide">{W.listen}</span>
                <span className="eph-narrow">{W.listenShort}</span>
              </button>
            </div>
          </div>
        </div>
        <p className="eph-under">{W.under(bookMinutes)}</p>
        <p className="eph-credit">
          <a href={EPHELION_IMAGE.entry}>{W.imageCredit}</a>
        </p>
      </section>
      <aside className="eph-right" ref={speechesRef}>
        {/* Desktop: Learn more takes the right column's place; a phone keeps the cards below and opens it in place. */}
        {learnOpen && learnBody && <div className="eph-learn-side">{learnBody}</div>}
        <div className={learnOpen ? 'eph-speeches eph-hide-wide' : 'eph-speeches'}>
          <h2>{W.speechesTitle}</h2>
          <p className="eph-muted eph-note">{W.speechesNote}</p>
          {status.speeches.map((s) => {
            const r = readingFor(s.id);
            const first = status.choices.find((c) => c.saved);
            const make = !r && status.canMakeReadings && first ? <MakeReading s={s} choice={first} credits={Math.ceil(s.characters * status.limits.readingCreditsPerChar)} onMade={() => void load()} /> : null;
            return <SpeechCard key={s.id} s={s} reading={r} voice={r ? nameOf(r.presetId) : null} make={make} />;
          })}
        </div>
      </aside>
    </main>
    </div>
  );
}
