import Link from 'next/link';
import '../styles/home.css';
import { ownMedia, shownVersion } from '~/lib/adaptation-pages';
import { AI_LABEL } from '~/lib/ai-declared';
import { AiLabel } from './recipe-sheet';
import { posterFor } from '~/lib/scene-delivery';
import type { RecipeView } from '~/lib/recipe-view';

/** Each version's poster recipe, in short; each version's shots' full recipes are in its live editor's RECIPE tab (on the site, no GitHub). Draft wording. */
const POSTER_V1: RecipeView = {
  file: 'adaptations/fifteen-days/versions/1.json',
  // Version 1's own editor (its fixed link's), since the chosen version is 2 (2026-10-18).
  github: '/@naaate/1/v/1/shot/first#recipe',
  whose: 'AI-generated picture, not by the author. Fifteen Days is by @naaate.',
  full: { href: '/@naaate/1/v/1/shot/first#recipe', text: 'Every shot\u2019s recipe, in the live editor' },
  what: 'The poster of Fifteen Days, version 1: the caf\u00e9 master frame.',
  model: { name: 'Qwen-Image-Edit-2509, finished with FLUX.2 [klein] 4B', licence: 'Apache-2.0', where: 'fal.ai' },
  prompt: null,
  inputs: [],
  published: { by: '@naaate', when: '2026-10-18' },
};
/** Version 2, the GPT cut (owner, 2026-10-18): its pictures by a closed model, named with its maker, the date and that it is closed. Draft wording. */
const POSTER_V2: RecipeView = {
  file: 'adaptations/fifteen-days/versions/2.json',
  github: 'adaptations/fifteen-days/versions/2.json',
  whose: 'AI-generated picture, not by the author. Fifteen Days is by @naaate.',
  // Every shot's recipe, its GPT picture and every picture sent with it, in the live editor (2026-10-18).
  full: { href: '/@naaate/1/v/2/shot/first#recipe', text: 'Every shot\u2019s recipe, in the live editor' },
  what: 'The poster of Fifteen Days, version 2 (the GPT version): three GPT Image close-ups (Zei, Bai, Deluin) side by side, cropped in code, no text.',
  model: { name: 'GPT Image 2.5 Sunburst (OpenAI), a closed model, on 2026-10-18; inputs open, model closed', licence: "proprietary: OpenAI's terms; weights not published", where: 'on the Vercel AI Gateway, a hosted service' },
  prompt: null,
  inputs: [
    { label: 'Its pictures', value: 'adaptations/fifteen-days/preprod/gpt/recipes/: cov-gate-CU-Z-smile-K7-g1, cov-corridor-CU-B-sour-K9-g1 and cov-cafe-CU-D-warm-E16-g2, each with its prompt and every picture sent, by sha256' },
    { label: 'How it was put together', value: 'adaptations/fifteen-days/versions/2.json, "poster_shown": the crops (the recipe\u2019s "poster" is the same three with a title bar, taken off for the home card)' },
  ],
  published: { by: '@naaate', when: '2026-10-18' },
};
const POSTERS: Record<number, RecipeView> = { 1: POSTER_V1, 2: POSTER_V2 };
/** Each poster's alt text. Draft wording. */
const POSTER_ALT: Record<number, string> = {
  1: 'Fifteen Days: in the caf\u00e9, Deluin waves Zei over while Bai sits at the table',
  2: 'Fifteen Days: Zei smiling, Bai frowning, arms crossed, and Deluin looking on warmly, side by side',
};

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
