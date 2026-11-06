import Link from 'next/link';
import type { DesignPicture } from '~/lib/element-body';
import { LANDING_WORDING as L, landingAction } from '~/lib/challenge/landing';
import { CHALLENGE_WORDING as CW } from '~/lib/challenge/wording';
import { AiTag } from './ai-tag';
import { ChallengeArrival } from './challenge-arrival';
import { ChallengeLike } from './challenge-like';
import { PostedOn, type PostedOnItem } from './posted-on';

/**
 * The top of a challenge character's sheet page, as a landing page for someone arriving from a post (owner,
 * 2026-11-04): the front view large, the maker, a big Remix button to this version's remix form (while entries are
 * open; a line in its place before and after), the like slot (off until likes ship, planned 12 November: renders
 * nothing), and "Posted on". Signed out, a line or two on what this is and how to remix, linking /challenge.
 * The rest of the sheet page (its text, versions, recipe) follows unchanged.
 */
export function ChallengeRemixLanding(p: {
  versionId: string;
  name: string;
  title: string;
  by: string;
  remix: boolean;
  front: DesignPicture;
  phase: 'before' | 'open' | 'closed';
  posts: PostedOnItem[];
}) {
  const action = landingAction(p.versionId, p.phase);
  return (
    <section className="rl-landing" aria-label={L.previewTitle(p.name, p.title)}>
      <ChallengeArrival text={L.arrival(p.name, p.phase)} linkText={L.arrivalLink} />
      <figure className="rl-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rl-picture" src={p.front.url} alt={`AI-generated front view of ${p.name}, not by the author`} width={p.front.recipe.width} height={p.front.recipe.height} data-zoom="" tabIndex={0} />
        <figcaption className="rl-caption">
          <span className="rl-maker">{p.remix ? L.remixOf(p.by) : L.maker(p.by)}</span>
          <span className="rl-ai">
            <AiTag /> <span className="dz-muted">{CW.title}</span>
          </span>
        </figcaption>
      </figure>
      <div className="rl-actions">
        {'href' in action ? (
          <>
            <Link className="rl-remix" href={action.href}>
              {action.label}
            </Link>
            <p className="rl-note">{L.remixNote(p.name)}</p>
          </>
        ) : (
          <p className="rl-note rl-closed">
            {action.line} <Link href="/challenge">{CW.title} →</Link>
          </p>
        )}
        <ChallengeLike versionId={p.versionId} />
      </div>
      {p.posts.length > 0 && <PostedOn versionId={p.versionId} posts={p.posts} />}
    </section>
  );
}
