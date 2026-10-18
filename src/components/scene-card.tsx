import Link from 'next/link';
import '../styles/home.css';
import { ownMedia, shownVersion } from '~/lib/adaptation-pages';
import { AI_LABEL } from '~/lib/ai-declared';
import { AiLabel } from './recipe-sheet';
import { posterFor } from '~/lib/scene-delivery';
import { POSTER_ALT, POSTERS, POSTER_V1 } from '~/lib/scene-posters';

/**
 * The published scene, as a card: Fifteen Days, the owner's chosen version (version 2 from 2026-10-18), on the home page and at the top of
 * /adaptations (owner, 2026-10-18: "adaptations isn't in the main menu or on the homepage yet").
 * Its poster and AI label come from the version's own recipe. Wording DRAFTED by the coding agent.
 */
export async function SceneCard({ as = 'home' }: { as?: 'home' | 'list' }) {
  const v = await Promise.race([shownVersion(6786, 1), new Promise<null>((r) => setTimeout(() => r(null), 2000))]).catch(() => null);
  const poster = posterFor(ownMedia(v?.recipe.video_url), ownMedia(v?.recipe.poster_url));
  const label = v?.recipe.ai_label ?? null;
  return (
    <section className={`home-card scene-card scene-card-${as}`} aria-labelledby={`scene-card-${as}`}>
      <div className="home-card-head">
        <h2 id={`scene-card-${as}`}>A scene from the book</h2>
        <span className="home-ref">after chapter 14</span>
      </div>
      <Link href="/@naaate/1" className="scene-card-link">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={POSTER_ALT[v?.id ?? 1] ?? POSTER_ALT[1]} width={1280} height={720} />
        )}
        <span className="scene-card-title">Fifteen Days</span>
        <span className="scene-card-by">by @naaate · spoilers through chapter 19</span>
      </Link>
      <p className="scene-card-label">
        <AiLabel kind="image" text={AI_LABEL.imageBy('@naaate')} view={POSTERS[v?.id ?? 1] ?? POSTER_V1} />
        {label ? ` · ${label}` : ''}
      </p>
      <div className="home-actions">
        <Link href="/@naaate/1" className="home-btn home-btn-solid">
          Watch
        </Link>
        <Link href="/@naaate/1/shot/first" className="home-btn home-btn-line">
          Remix the next shot
        </Link>
      </div>
    </section>
  );
}
