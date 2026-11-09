import { IMAGES } from '../config';

/**
 * The remix screen's Model row (owner, 2026-11-08, the simpler challenge): the models a challenge picture may be made
 * with, as a list, so another lane (branch challenge-models) can add GPT Image 2.5, Gemini 3.1 Flash Image and
 * Qwen-Image-Edit without changing the screen: each entry is one chip ("{label} · {maker} · open|closed"), the screen
 * sends the chosen `id`, and POST /api/challenge/make refuses any id that isn't in challengeModels(). Today it holds
 * one entry: the site's edit model, FLUX.2 [klein] 4B by Black Forest Labs, open (the line MAKE_WORDING.modelChip
 * shows). A closed model added here must name its maker and say "closed" (P2, P3; the closed-models rule), and ships
 * only in the release whose Terms and Privacy name its provider.
 */
export interface ChallengeModel {
  /** The id the screen sends and the recipe records (config/models.json's id). */
  id: string;
  /** The model's name, as its maker writes it. */
  label: string;
  /** Who made it. */
  maker: string;
  /** Open weights (true) or a closed model (false). */
  open: boolean;
}

/** Every model the challenge offers, in the order the screen shows them; the first is the default. */
export function challengeModels(): ChallengeModel[] {
  return [{ id: IMAGES.editModel.id, label: IMAGES.editModel.name, maker: 'Black Forest Labs', open: true }];
}

/** One chip's words: "FLUX.2 [klein] 4B · Black Forest Labs · open". */
export const modelChipText = (m: ChallengeModel) => `${m.label} · ${m.maker} · ${m.open ? 'open' : 'closed'}`;

/** The model the request names, if the challenge offers it. Null (refused) for anything else, a missing one included. */
export function modelFromRequest(id: unknown, models: readonly ChallengeModel[] = challengeModels()): ChallengeModel | null {
  return typeof id === 'string' ? (models.find((m) => m.id === id) ?? null) : null;
}
