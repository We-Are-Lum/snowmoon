import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '~/lib/db';
import { publication } from '~/lib/voice/publish';
import { publishOn } from '~/lib/voice/publish-deps';
import { sentencesIn, type Timeline } from '~/lib/voice/board';
import { spokenSentences, takeLabel, type Spoken } from '~/lib/voice/spoken';
import { CLOSING, type CreditLine } from '~/lib/voice/closing';
import { VoiceSpoken, type SpokenFile } from '~/components/voice-spoken';
import { embedMeta, spokenEmbed } from '~/lib/voice/embeds';
import { VoiceHiddenForMaker, VoiceReport } from '~/components/voice-report';
import '~/styles/voice.css';

/**
 * /storyboard/spoken/<id>: a published spoken storyboard (Ephelion slice 4, DRAFT). "Not found" while VOICE.publish is
 * off (the local tests turn it on, stand-ins only) and once its person takes it down. A hidden one shows only the
 * notice (moderation, 2026-11-23); everyone signed in may report one.
 */
export const dynamic = 'force-dynamic';
// Its own miniapp embed for each published storyboard (Nate, 2026-11-22), so a shared one opens on itself; never indexed.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false };
  if (!publishOn()) return { robots };
  const sql = db();
  const pub = sql ? await publication(sql, (await params).id).catch(() => null) : null;
  // A hidden one (moderation) has no embed: a cast of it opens nothing of it.
  return pub && !pub.hidden ? { robots, other: embedMeta(spokenEmbed(pub.id)) } : { robots };
}

export default async function SpokenPage({ params }: { params: Promise<{ id: string }> }) {
  if (!publishOn()) notFound();
  const sql = db();
  const pub = sql ? await publication(sql, (await params).id).catch(() => null) : null;
  if (!pub) notFound();
  // Hidden by a moderator or a stated rule (Nate, 2026-11-23): the notice to everyone, no pictures and no audio; its
  // maker also sees the reason (asked by their own browser, so an unnamed storyboard's maker is never in the page).
  if (pub.hidden)
    return (
      <main className="vr vb">
        <p className="vr-kicker">Storyboard</p>
        <h1>Hidden</h1>
        <p className="vr-note">This storyboard was hidden by a moderator.</p>
        <VoiceHiddenForMaker id={pub.id} />
      </main>
    );
  const r = pub.recipe as {
    speech?: { id?: string; title?: string; label?: { text?: string } };
    voice?: { kind?: 'performance' | 'reading'; preset?: { name?: string } };
    timeline: Timeline;
    shots: { n: number; key: string; start: number; end: number; description: string; picture?: { standIn?: boolean } | null }[];
    closing: { credits: CreditLine[]; seconds?: number; background?: { standIn?: boolean } | null };
    performer: { name?: string | null; named?: boolean };
    publishedAt: string;
  };
  const title = r.speech?.title ?? 'A speech';
  // The spoken words, by sentence (Nate, 2026-11-24): the speech's own (word for word, never the transcription's), or
  // the performer's, as transcribed and as they corrected them (improvised).
  const own = spokenSentences(r as unknown as { spoken?: Spoken; speech?: { id?: string } });
  const sentenceText = (n: number) => own.find((x) => x.n === n)?.text ?? '';
  const standIns = r.shots.some((s) => s.picture?.standIn) || Boolean(r.closing.background?.standIn);
  return (
    <main className="vr vb">
      <p className="vr-kicker">Storyboard · {takeLabel(r as unknown as { spoken?: Spoken }) === 'word for word' ? `${r.speech?.label?.text ?? 'Book'} words` : `Words ${takeLabel(r as unknown as { spoken?: Spoken })}`} · Invented pictures</p>
      <h1>{title}</h1>
      <p className="vr-labels">
        {r.performer.name ? `${r.voice?.kind === 'reading' ? 'Storyboard by' : 'By'} @${r.performer.name}` : 'By a reader'}
        {r.voice?.kind === 'reading' && <> · read by ElevenLabs&rsquo; ready-made reading, no performer</>} · published {new Date(r.publishedAt).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' })}
        {standIns && <> · <span className="vr-tag">Stand-in</span> placeholder cards, not pictures (a test copy)</>}
      </p>
      <VoiceSpoken
        title={title}
        seconds={r.timeline.seconds}
        shots={r.shots.map((s) => ({ n: s.n, key: s.key, start: s.start, end: s.end, words: sentencesIn(r.timeline, s).map((n) => sentenceText(n)).join(' ') }))}
        files={pub.files as SpokenFile[]}
        credits={r.closing.credits}
        recipe={pub.recipe}
        standIns={standIns}
        closingSeconds={r.closing.seconds ?? CLOSING.seconds}
        fileName={`snowmoon-storyboard-${pub.id.slice(0, 8)}`}
      />
      <VoiceReport id={pub.id} />
    </main>
  );
}
