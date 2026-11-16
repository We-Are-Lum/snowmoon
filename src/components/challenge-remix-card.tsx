import Link from 'next/link';
import { designByline } from '~/lib/images/byline';
import { AiTag } from './ai-tag';
import { AdminExampleLabel } from './admin-example-label';

/**
 * One remix on /challenge (the random selection) and /challenge/remixes (the feed): its front view, the character,
 * its name and who made it. No remix, like or built-on count, and no badge that features one (owner, 2026-11-04; P5i).
 * No challenge words live here (the random selection is in scripts everyone is served): the character's words come in
 * `w`, written on the server (src/lib/challenge/landing-wording.ts).
 */
export type RemixCardData = { versionId: string; character: string; title: string; byName: string | null; byFid: number; thumb: string | null; /** Its page, when not a sheet's (a challenge picture: /challenge/p/<id>). */ href?: string; /** An admin example on /challenge/entries (owner, 2026-11-12): its label and ⓘ words. */ example?: { label: string; info: string } };
/** A character's words for its cards: its call name, the title of an untitled remix, the picture's alt text. */
export type RemixCardWords = { name: string; untitled: string; alt: string };

export function RemixCardView({ r, w }: { r: RemixCardData; w: RemixCardWords }) {
  const title = r.title.trim() || w.untitled;
  return (
    <li className="ch-card" data-character={r.character} data-version={r.versionId} data-example={r.example ? 'admin' : undefined}>
      <Link href={r.href ?? `/references/designs/${r.versionId}`} className="ch-card-link" prefetch={false}>
        {r.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ch-card-img" src={r.thumb} alt={w.alt} width={288} height={384} loading="lazy" />
        ) : (
          <span className="ch-card-img ch-card-empty" aria-hidden="true" />
        )}
        <span className="ch-card-name">{w.name}</span>
        <span className="ch-card-title">{title}</span>
        <span className="ch-card-by">{designByline(r.byName, r.byFid)}</span>
      </Link>
      {r.example && <AdminExampleLabel label={r.example.label} info={r.example.info} />}
      {r.thumb && (
        <span className="ch-card-ai">
          <AiTag what="Views" />
        </span>
      )}
    </li>
  );
}
