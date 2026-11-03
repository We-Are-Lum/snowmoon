import Link from 'next/link';
import { designByline } from '~/lib/images/byline';
import { LANDING_WORDING as L } from '~/lib/challenge/landing-wording';
import { AiTag } from './ai-tag';

/**
 * One remix on /challenge (the random selection) and /challenge/remixes (the feed): its front view, the character,
 * its name and who made it. No remix, like or built-on count, and no badge that features one (owner, 2026-11-04; P5i).
 */
export type RemixCardData = { versionId: string; character: string; title: string; byName: string | null; byFid: number; thumb: string | null };

export function RemixCardView({ r, name }: { r: RemixCardData; name: string }) {
  const title = r.title.trim() || L.untitled(name);
  return (
    <li className="ch-card" data-character={r.character} data-version={r.versionId}>
      <Link href={`/references/designs/${r.versionId}`} className="ch-card-link">
        {r.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ch-card-img" src={r.thumb} alt={L.pictureAlt(name)} width={288} height={384} loading="lazy" />
        ) : (
          <span className="ch-card-img ch-card-empty" aria-hidden="true" />
        )}
        <span className="ch-card-name">{name}</span>
        <span className="ch-card-title">{title}</span>
        <span className="ch-card-by">{designByline(r.byName, r.byFid)}</span>
      </Link>
      {r.thumb && (
        <span className="ch-card-ai">
          <AiTag what="Views" />
        </span>
      )}
    </li>
  );
}
