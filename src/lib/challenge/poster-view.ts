import 'server-only';
import { REPO_URL } from '../config';
import { WHOSE } from '../ai-declared';
import type { RecipeView } from '../recipe-view';
import { callNameOfSlug } from './names';
import recipe from '../../../public/challenge/poster-recipe.json';

/**
 * The challenge poster's recipe sheet, behind its ⓘ on the home page (owner, 2026-11-12), set from the committed
 * public/challenge/poster-recipe.json by a fixed template: every value is the recipe's own; the sentences around them are
 * DRAFT wording, drafted by the coding agent (Claude, a closed model by Anthropic).
 */
export const POSTER_LABEL = 'AI image · by Snowmoon Party';

export function posterView(): RecipeView {
  const m = recipe.model;
  return {
    file: '',
    github: `${REPO_URL}/blob/main/public/challenge/poster-recipe.json`,
    whose: WHOSE.projectImage,
    full: { href: '/challenge/poster-recipe.json', text: 'Full recipe →' },
    what: 'The remix challenge poster. The model drew it from the seven characters’ default bases; the words on it were added in code, not by the model.',
    model: { name: `${m.name} (${m.maker}, a closed model)`, licence: 'closed', where: `on ${m.via}, a hosted service` },
    prompt: { label: 'The prompt', text: recipe.prompt },
    inputs: [
      ...recipe.references.map((r, i) => ({ label: `Reference ${i + 1}: ${callNameOfSlug(r.character)}, ${r.title}`, value: r.url })),
      { label: 'Made in code', value: recipe.made_in_code },
    ],
    published: { by: 'the owner (FID 6786)', when: recipe.at.slice(0, 10) },
    cost: `$${recipe.cost_usd.toFixed(4)}, through ${m.via}`,
  };
}
