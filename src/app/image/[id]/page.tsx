import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { APP_NAME, IMAGES, appUrl } from '~/lib/config';
import { db } from '~/lib/db';
import { imageByVersion } from '~/lib/images/data';
import { passageLabel, passageText } from '~/lib/images/passage';
import { IMAGE_WORDING as W } from '~/lib/images/wording';
import { byline } from '~/lib/images/byline';
import { PAPER } from '~/lib/tokens';
import { ImageActions } from '~/components/image-actions';
import { MakeImageLink } from '~/components/make-image-link';
import { AiLabel } from '~/components/recipe-sheet';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';
import { inThisImage } from '~/lib/images/sheet-images';
import { sheetCharacters } from '~/lib/images/sheets';

/**
 * A reader's image (section 5): the image, what it is, and its whole recipe, readable signed
 * out (P1d): the exact prompt as plain text, the model, the host, the endpoint, the request id,
 * the seed, the settings, the cost, the date, who made it, the passage, and anything a model
 * drafted. Likes, "Cast this" with its share card, the author's "Hide this", and "Report".
 */
export const revalidate = 300;
type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const sql = db();
  return sql ? imageByVersion(sql, id).catch(() => null) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const im = await load(id);
  if (!im) return { title: 'Image not found' };
  const card = `${appUrl()}/api/image-card/${id}`;
  const embed = JSON.stringify({
    version: '1',
    imageUrl: card,
    button: { title: 'See it in Snowmoon', action: { type: 'launch_frame', name: APP_NAME, url: `${appUrl()}/image/${id}`, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER } },
  });
  const title = `An image for Snowmoon, Chapter ${im.chapter}`;
  const description = `AI-generated image by ${byline(im.byName, im.byFid)}, not by the author.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: card, width: 1200, height: 800 }] },
    twitter: { card: 'summary_large_image', title, description, images: [card] },
    other: { 'fc:miniapp': embed, 'fc:frame': embed },
  };
}

export default async function ImagePage({ params }: Props) {
  const { id } = await params;
  const im = await load(id);
  if (!im) notFound();
  const where = passageLabel(im.chapter, im.start, im.end);
  const date = im.createdAt.slice(0, 10);
  const by = byline(im.byName, im.byFid);
  const reader = `/chapter/${im.chapter}#c${im.chapter}-b${im.start}`;
  // The passage's own words (book text, never sent to a model): what the image is of, shown first (owner, 2026-10-10).
  const passage = passageText(im.chapter, im.start, im.end);
  // "In this image" (2026-10-10): the characters and place its recipe records (older images: the picked sheets' characters).
  const inImage = inThisImage(
    im.sheets?.characters ?? im.designs.filter((d) => d.kind === 'character').map((d) => sheetCharacters().find((c) => c.name === d.entity)?.slug).filter((x): x is string => Boolean(x)),
    im.sheets?.place ?? null,
  );
  return (
    <div className="page prose image-page">
      <p className="label ip-crumb">
        <Link href="/references">← References</Link> · {IMAGES.label}
      </p>
      <div className="ip-main">
        <figure className="ip-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.url} alt={`AI-generated image: ${im.userPrompt.split(/(?<=[.!?])\s/)[0]}`} width={1024} height={576} />
          <figcaption className="ip-caption">
            <AiLabel
              kind="image"
              text={AI_LABEL.imageBy(by)}
              view={{
                ...readerImageView({ versionId: im.versionId, by, prompt: im.userPrompt, chapter: im.chapter, where, date }),
                full: { href: '#recipe', text: 'Full recipe, on this page (How this was made) ↓' },
              }}
            />
            <br />
            <span className="ip-meta">
              {date} ·{' '}
              <Link href={reader}>
                Chapter {im.chapter}
                {where ? ` · ${where}` : ''} · Open in reader →
              </Link>
            </span>
          </figcaption>
        </figure>
        {passage.length > 0 && (
          <blockquote className="ip-passage">
            {passage.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </blockquote>
        )}
        {inImage.length > 0 && <InThisImage items={inImage} />}
        {/* Another image of the same passage (owner, 2026-10-10); shown where "Add an image" shows. Model-drafted wording. */}
        <MakeImageLink className="mi-from ip-make" passage={{ chapter: im.chapter, start: im.start, end: im.end }}>
          {W.create.ofThis} →
        </MakeImageLink>
      </div>

      <div className="ip-side">
        <ImageActions versionId={im.versionId} byFid={im.byFid} chapter={im.chapter} />

        {/* Owner, 2026-10-10: the passage first; the prompt, the model and the rest when opened. Still on the page as served (P1g). */}
        <details className="ip-how" id="recipe">
        <summary className="ip-h">How this was made: the prompt, the model, the settings</summary>
        <dl className="recipe-list ip-recipe">
          <dt className="ip-wide">The prompt, as the person wrote it</dt>
          <dd className="ip-wide ip-words">{im.userPrompt}</dd>
          {im.style && (
            <>
              <dt className="ip-wide">Style added (text drafted by the coding agent, a closed model)</dt>
              <dd className="ip-wide ip-words ip-added">{im.style.text}</dd>
            </>
          )}
          {im.designs.length > 0 && (
            <>
              <dt className="ip-wide">{W.designs.image.added}</dt>
              {im.designs.map((d) => (
                <dd key={d.versionId} className="ip-wide ip-words ip-added">
                  <Link href={`/references/designs/${d.versionId}`}>
                    {d.kind === 'style' ? d.title || d.entity : d.entity} v{d.versionNo} · {d.by}
                  </Link>
                  {d.assist ? ' (text drafted by the coding agent, a closed model)' : ''}: {d.text}
                </dd>
              ))}
            </>
          )}
          {im.references.length > 0 && (
            <>
              <dt className="ip-wide">{W.designs.image.references}</dt>
              <dd className="ip-wide recipe-mono">{im.references.map((r) => `sha256 ${r.sha256}`).join(', ')}</dd>
            </>
          )}
          {im.sheets && im.sheets.added.length > 0 && (
            <>
              <dt className="ip-wide">{W.designs.sheets.shorthandTitle} (text drafted by the coding agent, a closed model)</dt>
              {im.sheets.added.map((a) => (
                <dd key={`${a.kind}-${a.slug}`} className="ip-wide ip-words ip-added">
                  {a.text}
                </dd>
              ))}
            </>
          )}
          <dt className="ip-wide">The exact prompt sent to the model</dt>
          <dd className="ip-wide">
            <pre className="recipe-prompt">{im.prompt}</pre>
          </dd>
          <dt>Model</dt>
          <dd>
            {(im.model === IMAGES.editModel.id ? IMAGES.editModel : IMAGES.model).name} ({im.model}), open weights, {(im.model === IMAGES.editModel.id ? IMAGES.editModel : IMAGES.model).licence}. It ran on {im.host}, endpoint{' '}
            <span className="recipe-mono">{im.modelVersion}</span>.
          </dd>
          <dt>Settings</dt>
          <dd className="recipe-mono">
            {Object.entries(im.settings)
              .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
              .join(', ')}
            {im.seed !== null ? `, seed ${im.seed}` : ''}
          </dd>
          <dt>Checks</dt>
          <dd>The prompt was checked by gpt-oss-safeguard-20b against the published rules, and the image by the host&apos;s safety checker, before anyone saw it.</dd>
          <dt>Request</dt>
          <dd className="recipe-mono">{im.requestId ?? 'not recorded'}</dd>
          <dt>Cost</dt>
          <dd>{im.costUsd !== null ? `$${im.costUsd.toFixed(4)}` : 'not recorded'}</dd>
          <dt>Published</dt>
          <dd>
            By {im.byName ? `@${im.byName} (FID ${im.byFid})` : `FID ${im.byFid}`}, {date}, for Chapter {im.chapter}
            {where ? `, ${where}` : ''}. Licence GPL-3.0.
          </dd>
          <dt>File</dt>
          <dd className="recipe-mono">sha256 {im.sha256}</dd>
        </dl>
        </details>
        <p className="as-draft ic-draftline">{W.draftLine}</p>
      </div>
    </div>
  );
}

/** "In this image: Seila · Gladias and Seila's house", each linking to its sheet. */
function InThisImage({ items }: { items: { href: string; name: string }[] }) {
  return (
    <p className="ip-in-image" data-in-image="">
      <span className="ip-in-image-key">{W.designs.sheets.inThisImage}:</span>{' '}
      {items.map((x, i) => (
        <span key={x.href}>
          {i > 0 && ' · '}
          <Link href={x.href}>{x.name}</Link>
        </span>
      ))}
    </p>
  );
}
