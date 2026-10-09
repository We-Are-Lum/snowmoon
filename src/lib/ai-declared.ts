import { IMAGES } from './config';
import type { RecipeView } from './recipe-view';

/**
 * How AI use is declared where an image or the narration is shown (principle 2), as the owner
 * asked on 2026-10-09: a compact visible label that includes "AI", a control that opens the recipe
 * sheet, and the whole declaration ("AI-generated", "not by the author") in the page as served
 * (visually hidden, part of the control's accessible name) and in the sheet.
 * All of it is draft wording by the coding agent (a closed model); check:principles P2b reads it.
 */

/** Who made the edition's own images and narration, as the labels name it (owner, 2026-10-09). */
export const EDITION_MAKER = 'Snowmoon Party';

/**
 * The visible label: short, says AI, and always names who made it (owner, 2026-10-09: "every
 * label names who made it"). `image` and `voice` are the edition's own (seeded illustrations,
 * the house narration); a reader's image is `imageBy` its @name or FID.
 */
export const AI_LABEL = {
  image: `AI image · by ${EDITION_MAKER}`,
  voice: `AI voice · by ${EDITION_MAKER}`,
  imageBy: (who: string) => `AI image · by ${who}`,
} as const;

/** Served with the label, visually hidden: the whole declaration. */
export const AI_DECLARED = {
  image: 'AI-generated image, not by the author',
  voice: 'Synthetic narration, an AI-generated voice, not by the author',
} as const;

/** Read after the declaration by a screen reader: what the control does. */
export const AI_OPENS = 'Opens how it was made';

/**
 * The sheet's "Who made it" row, by kind (draft wording, coding agent; owner to rewrite). Each says
 * AI-generated and "not by the author" in words (check:principles P2b reads them here).
 */
export const WHOSE = {
  projectImage: 'Snowmoon Party, the project, made it with an image model. AI-generated, not by the author.',
  lettering: "Snowmoon Party, the project, drew it in code over an AI-generated image. Not by the author; the words drawn are the book's.",
  narration: "Snowmoon Party, the project, made it with a speech model. AI-generated voice, not by the author; the words it reads are the book's.",
  opener: 'AI-generated voice, not by the author. A person on the project wrote the words.',
  episode: 'Made in code from the AI-generated narration. Not by the author.',
  cover: 'Drawn in code by the project, with no model. Not by the author.',
  reader: (by: string) => `${by.charAt(0).toUpperCase()}${by.slice(1)} made it with an image model. AI-generated, not by the author.`,
} as const;

/**
 * The recipe sheet for a reader's image (or a draft), filled from what the screen already has:
 * readers' images keep their recipe in the database, and their own page is the full recipe.
 */
export function readerImageView(o: {
  versionId: string | null;
  by: string;
  prompt?: string;
  chapter: number;
  where?: string | null;
  date?: string;
  model?: string;
  notPublished?: string;
}): RecipeView {
  const full = o.versionId ? `/image/${o.versionId}` : null;
  return {
    file: '',
    github: full ?? '',
    whose: WHOSE.reader(o.by),
    full: full ? { href: full, text: 'Full recipe →' } : null,
    what: `An image for Chapter ${o.chapter}${o.where ? `, ${o.where}` : ''}, made by a reader for one passage, not canon.`,
    model: { name: o.model ?? `${IMAGES.model.name}, open weights`, licence: IMAGES.model.licence, where: `on ${IMAGES.model.host}, a hosted service` },
    prompt: o.prompt ? { label: 'The prompt, as the person wrote it', text: o.prompt } : null,
    inputs: [],
    published: o.versionId ? { by: o.by, when: o.date ?? '' } : null,
    ...(o.versionId ? {} : { notPublished: o.notPublished ?? 'Not yet. Only you can see this draft.' }),
  };
}
