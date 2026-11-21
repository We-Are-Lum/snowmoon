import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '~/lib/db';
import { publication } from '~/lib/voice/publish';
import { publishOn } from '~/lib/voice/publish-deps';
import { wordsIn, type Timeline } from '~/lib/voice/board';
import { CLOSING, type CreditLine } from '~/lib/voice/closing';
import { VoiceSpoken, type SpokenFile } from '~/components/voice-spoken';
import '~/styles/voice.css';

/**
 * /storyboard/spoken/<id>: a published spoken storyboard (Ephelion slice 4, DRAFT). "Not found" while VOICE.publish is
 * off (the local tests turn it on, stand-ins only) and once its person takes it down.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SpokenPage({ params }: { params: Promise<{ id: string }> }) {
  if (!publishOn()) notFound();
  const sql = db();
  const pub = sql ? await publication(sql, (await params).id).catch(() => null) : null;
  if (!pub) notFound();
  const r = pub.recipe as {
    speech?: { title?: string; label?: { text?: string } };
    timeline: Timeline;
    shots: { n: number; key: string; start: number; end: number; description: string; picture?: { standIn?: boolean } | null }[];
    closing: { credits: CreditLine[]; seconds?: number; background?: { standIn?: boolean } | null };
    performer: { name?: string | null; named?: boolean };
    publishedAt: string;
  };
  const title = r.speech?.title ?? 'A speech';
  const standIns = r.shots.some((s) => s.picture?.standIn) || Boolean(r.closing.background?.standIn);
  return (
    <main className="vr vb">
      <p className="vr-kicker">Storyboard · {r.speech?.label?.text ?? 'Book'} words · Invented pictures</p>
      <h1>{title}</h1>
      <p className="vr-labels">
        {r.performer.name ? `By @${r.performer.name}` : 'By a reader'} · published {new Date(r.publishedAt).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' })}
        {standIns && <> · <span className="vr-tag">Stand-in</span> placeholder cards, not pictures (a test copy)</>}
      </p>
      <VoiceSpoken
        title={title}
        seconds={r.timeline.seconds}
        shots={r.shots.map((s) => ({ n: s.n, key: s.key, start: s.start, end: s.end, words: wordsIn(r.timeline, s) }))}
        files={pub.files as SpokenFile[]}
        credits={r.closing.credits}
        recipe={pub.recipe}
        standIns={standIns}
        closingSeconds={r.closing.seconds ?? CLOSING.seconds}
        fileName={`snowmoon-storyboard-${pub.id.slice(0, 8)}`}
      />
    </main>
  );
}
