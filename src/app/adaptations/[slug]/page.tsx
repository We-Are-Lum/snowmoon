import Link from 'next/link';
import { Fragment } from 'react';
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
      {docs.piece && docs.approval && (
        <details className="spoiler-gate">
          <summary>Show the adaptation</summary>
          {/* The piece: book lines, people's lines and images only (principle 2). */}
          <section className="piece" aria-label="The adaptation">
            {docs.piece.map((panel) => (
              <figure key={panel.n} className="piece-panel">
                {panel.images.map((image, i) => (
                  <Fragment key={image.url}>
                    <img src={image.url} alt={image.alt} width={image.width} height={image.height} loading="lazy" />
                    <figcaption className="block-caption">
                      Panel {panel.n}
                      {panel.images.length > 1 ? ` (${i + 1} of ${panel.images.length})` : ''} · {image.alt.startsWith('AI-generated') ? 'AI-generated image' : 'drawn in code'} ·{' '}
                      <a href={image.recipe}>recipe</a>
                    </figcaption>
                  </Fragment>
                ))}
                {[...panel.narration, ...panel.dialogue].map((l, i) => (
                  <p key={i} className="piece-line">
                    {l.text}{' '}
                    <span className="label">
                      {l.from === 'book' ? <a href={l.href}>{l.id}</a> : `by FID ${l.fid}`}
                    </span>
                  </p>
                ))}
                {!panel.narration.length && !panel.dialogue.length && <p className="label">Lines not yet written.</p>}
              </figure>
            ))}
          </section>
          <details className="how-built">
            <summary>How this was built</summary>
            <p className="label">
              Model-drafted working notes, not part of the adaptation: the structure, candidate lines and image
              descriptions were drafted by the coding agent (a closed model). Approved by FID {docs.approval.fid} on{' '}
              {docs.approval.on}.
            </p>
            {docs.script && <div className="doc" dangerouslySetInnerHTML={{ __html: docs.script }} />}
            {docs.shots && (
              <section aria-label="Shot list">
                <h2 className="doc-part">Shot list</h2>
                <div className="doc" dangerouslySetInnerHTML={{ __html: docs.shots }} />
              </section>
            )}
          </details>
        </details>
      )}
      <details className="spoiler-gate">
        <summary>Show the brief</summary>
        <div className="doc" dangerouslySetInnerHTML={{ __html: docs.brief }} />
      </details>
    </div>
  );
}
