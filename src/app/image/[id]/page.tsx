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
import { AiLabel } from '~/components/recipe-sheet';
import { AI_LABEL, readerImageView } from '~/lib/ai-declared';

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
  return (
    <div className="page prose image-page">
      <p className="label ip-crumb">
        <Link href="/images">← Pictures</Link> · {IMAGES.label}
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
          <dt className="ip-wide">The exact prompt sent to the model</dt>
          <dd className="ip-wide">
            <pre className="recipe-prompt">{im.prompt}</pre>
          </dd>
          <dt>Model</dt>
          <dd>
            {IMAGES.model.name} ({im.model}), open weights, {IMAGES.model.licence}. It ran on {im.host}, endpoint <span className="recipe-mono">{im.modelVersion}</span>.
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
