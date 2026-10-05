import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { adaptationsConfig, findSeed, isVideoFile, seedDocs } from '~/lib/adaptations';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return adaptationsConfig().seeds.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const seed = findSeed((await params).slug);
  return { title: seed ? `${seed.title} · Adaptations` : 'Adaptations' };
}

export default async function AdaptationSeed({ params }: Props) {
  const slug = (await params).slug;
  const seed = findSeed(slug);
  const docs = seed && seedDocs(slug);
  if (!seed || !docs) notFound();

  return (
    <div className="page prose adaptations">
      <p className="label crumb">
        <Link href="/adaptations">Adaptations</Link>
      </p>
      <h1>{seed.title}</h1>
      <p>{seed.line}</p>

      {seed.video_url && (
        <section aria-label="Video">
          <h2>Video</h2>
          {isVideoFile(seed.video_url) && <video className="seed-video" src={seed.video_url} controls preload="metadata" />}
          <p>
            <a href={seed.video_url}>Watch the adaptation</a>
          </p>
        </section>
      )}

      {/* Spoiler rule: whole-book material is opt-in, behind a clear warning. */}
      <section className="notice" aria-label="Spoiler warning">
        <p>
          <strong>Spoilers through chapter {seed.spoilers_through}.</strong> This brief quotes and discusses events up to
          that chapter. Cited passages link into the reader.
        </p>
      </section>
      <details className="spoiler-gate">
        <summary>Show the brief</summary>
        <div className="doc" dangerouslySetInnerHTML={{ __html: docs.brief }} />
        {docs.script && (
          <section aria-label="Script">
            <h2 className="doc-part">Script</h2>
            <div className="doc" dangerouslySetInnerHTML={{ __html: docs.script }} />
          </section>
        )}
        {docs.shots && (
          <section aria-label="Shot list">
            <h2 className="doc-part">Shot list</h2>
            <div className="doc" dangerouslySetInnerHTML={{ __html: docs.shots }} />
          </section>
        )}
      </details>
    </div>
  );
}
