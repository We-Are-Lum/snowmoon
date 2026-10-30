import type { RecipeView } from './recipe-view';
import { AI_LABEL, WHOSE, readerImageView } from './ai-declared';

/**
 * The AI label's recipe sheet for each kind of AI-made picture shown on the Dashboard and on a public
 * profile (/@<handle>), and on the scene card (src/components/scene-card.tsx). Filled from what the
 * screen already has; no model writes anything here. Wording DRAFTED by the coding agent.
 */
/** Each version's poster recipe, in short; each version's shots' full recipes are in its live editor's RECIPE tab (on the site, no GitHub). Draft wording. */
export const POSTER_V1: RecipeView = {
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
export const POSTER_V2: RecipeView = {
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
export const POSTERS: Record<number, RecipeView> = { 1: POSTER_V1, 2: POSTER_V2 };
/** Each poster's alt text. Draft wording. */
export const POSTER_ALT: Record<number, string> = {
  1: 'Fifteen Days: in the caf\u00e9, Deluin waves Zei over while Bai sits at the table',
  2: 'Fifteen Days: Zei smiling, Bai frowning, arms crossed, and Deluin looking on warmly, side by side',
};


/** The poster's alt text for a version: the known ones above, else the title and version. DRAFT wording for the owner. */
export const posterAlt = (versionId: number, title: string) => POSTER_ALT[versionId] ?? `${title}, version ${versionId}: the poster`;

/**
 * A scene version's poster, in the AI label's sheet: the known posters above (Fifteen Days, versions 1
 * and 2), else what the version's recipe says (its AI declaration and where its recipe is).
 * DRAFT wording for the owner.
 */
export function posterView(v: { id: number; adaptationId: number; createdAt: string; recipe: { ai_label?: string | null; recipe_url?: string | null } }, title: string, by: string): RecipeView {
  const known = v.adaptationId === 1 ? POSTERS[v.id] : undefined;
  if (known) return known;
  const recipe = v.recipe.recipe_url ?? null;
  return {
    file: '',
    github: recipe ?? '',
    whose: `AI-generated picture, not by the author. ${title} is by ${by}.`,
    full: recipe ? { href: recipe, text: 'The version\u2019s recipe' } : null,
    what: `The poster of ${title}, version ${v.id}.${v.recipe.ai_label ? ` ${v.recipe.ai_label}` : ''}`,
    model: null,
    prompt: null,
    inputs: [],
    published: { by, when: v.createdAt },
  };
}

/** A remix frame (studio.remix_frames), in the AI label's sheet; its page is the full recipe. DRAFT wording for the owner. */
export function frameView(f: { id: string; by: string; title: string; shot: string; versionId: number; words: string; at: string; model: { name?: string; licence?: string; host?: string } | null }): RecipeView {
  return {
    file: '',
    github: `/remix/${f.id}`,
    whose: WHOSE.reader(f.by),
    full: { href: `/remix/${f.id}`, text: 'Full recipe \u2192' },
    what: `A remix frame of ${f.title}, shot ${f.shot}, version ${f.versionId}: a starting point, not canon.`,
    model: f.model?.name ? { name: f.model.name, licence: f.model.licence ?? '', where: f.model.host ? `on ${f.model.host}, a hosted service` : 'not recorded' } : null,
    prompt: { label: 'Their words', text: f.words },
    inputs: [],
    published: { by: f.by, when: f.at.slice(0, 10) },
  };
}

/** A reader's picture (studio.elements, an image): the same sheet as the feed's. */
export const pictureView = (p: { versionId: string; by: string; prompt: string; chapter: number; at: string }) =>
  readerImageView({ versionId: p.versionId, by: p.by, prompt: p.prompt, chapter: p.chapter, date: p.at.slice(0, 10) });

export const labelFor = (by: string) => AI_LABEL.imageBy(by);
