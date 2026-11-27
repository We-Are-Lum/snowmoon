import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '~/lib/db';
import { takePublication } from '~/lib/voice/takes';
import { takesOn } from '~/lib/voice/publish-deps';
import { embedMeta, takeEmbed } from '~/lib/voice/embeds';
import { TAKES_WORDING as W } from '~/lib/voice/takes-wording';
import { spokenSentences, type Spoken } from '~/lib/voice/spoken';
import { VoiceHiddenForMaker, VoiceReport } from '~/components/voice-report';
import { TakeActions, TakePlayer } from '~/components/ephelion-take';
import '~/styles/ephelion.css';

/**
 * A take entered in the Ephelion challenge (Nate, 2026-11-26; PR 6): public, its own page and Share card. The converted
 * speech plays over its picture; the picture's labels and credit; who performed it and what AI did; the words as said;
 * Share, Record your own, Report (#225's), and for its performer Take it down. Hidden: the notice only. Never indexed.
 */
export const dynamic = 'force-dynamic';
const robots = { index: false, follow: false };
type Pic = { title?: string; labels?: string[]; by?: string | null; source?: string; recipe?: unknown };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const sql = db();
  const t = takesOn() && sql ? await takePublication(sql, (await params).id).catch(() => null) : null;
  if (!t || t.hidden) return { robots };
  const title = String((t.recipe.speech as { title?: string } | undefined)?.title ?? 'A take');
  const pic = t.files.find((f) => f.role === 'picture');
  return { robots, title: `${title}: a take · Snowmoon`, openGraph: pic ? { images: [pic.url] } : undefined, other: embedMeta(takeEmbed(t.id, pic?.url ?? null)) };
}

export default async function TakePage({ params }: { params: Promise<{ id: string }> }) {
  if (!takesOn()) notFound();
  const sql = db();
  const t = sql ? await takePublication(sql, (await params).id).catch(() => null) : null;
  if (!t) notFound();
  const r = t.recipe as { speech?: { title?: string }; performer?: { name?: string | null }; voice?: { preset?: { name?: string } }; take?: { label?: string }; spoken?: Spoken; picture?: Pic };
  const title = r.speech?.title ?? 'A take';
  if (t.hidden)
    return (
      <main className="eph-take">
        <p className="eph-meta eph-up">{W.kicker}</p>
        <h1>{title}</h1>
        <p>{W.hidden}</p>
        <VoiceHiddenForMaker id={t.id} />
      </main>
    );
  const who = r.performer?.name ?? null;
  const voice = r.voice?.preset?.name ?? 'his voice';
  const label = r.take?.label ?? 'word for word';
  const date = new Date(t.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const pic = t.files.find((f) => f.role === 'picture');
  const audio = t.files.filter((f) => f.role === 'audio').map((f) => ({ url: f.url, part: f.part ?? 'take', replaces: f.replaces ?? null }));
  const words = spokenSentences({ spoken: r.spoken ?? null, speech: { id: t.speechId } }).map((x) => x.text);
  const p = r.picture ?? {};
  return (
    <main className="eph-take">
      <p className="eph-meta eph-up">{W.kicker}</p>
      <h1>{title}</h1>
      <p className="eph-take-by">{W.performedBy(who, voice, label, date)}</p>
      <TakePlayer picture={pic?.url ?? null} audio={audio} alt={`${p.title ?? 'The picture'}, ${(p.labels ?? []).join(', ')}`} />
      <p className="eph-meta">{W.pictureLine(p.title ?? 'The picture', p.labels ?? [], p.by ?? null)}</p>
      <p className="eph-meta">
        {W.madeLine(who)} <a href={`/api/voice/takes/${t.id}`}>{W.recipe} ›</a>
      </p>
      <div className="eph-take-actions">
        <TakeActions id={t.id} title={title} />
        <Link className="eph-btn" href="/ephelion/record">{W.recordOwn}</Link>
      </div>
      <VoiceReport id={t.id} />
      {words?.length ? (
        <section>
          <p className="eph-meta eph-up">{W.words(label)}</p>
          {words.map((s, i) => <p key={i} className="eph-take-words">{s}</p>)}
        </section>
      ) : null}
    </main>
  );
}
