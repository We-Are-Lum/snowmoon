import 'server-only';
import type { Illustration } from '../illustrations';
import type { RecipeView } from '../recipe-view';
import { CHALLENGE_MODELS } from '../challenge/models';
import { adminName, day, lookName, modelLine, recipePath, replacedBy, type ShownReplacement } from './shared';

/**
 * A chapter picture as the chapter shows it once an admin has kept a redo (owner, 2026-11-18, option B): the kept
 * file in place of the committed one, and its recipe sheet filled from the database's record (principle 1): the
 * model and its maker, open or closed, the look, the admin's note, the exact prompt, and who kept it and when. The
 * sheet's full recipe is the public JSON at /api/chapter-pictures/<version> (check:principles P1d reads it signed out).
 * Wording DRAFT (coding agent, 2026-11-18).
 */
export interface Redone {
  versionId: string;
  /** "Redone by @garance" */
  by: string;
  /** When it was kept (ISO); pages write it in the reader's own time (src/components/local-date.tsx). */
  at: string;
  /** "GPT Image 2.5 Sunburst, a closed model by OpenAI" */
  model: string;
  /** The recipe sheet, from the database's record. */
  view: RecipeView;
}
export type ShownIllustration = Illustration & { replaced?: Redone };

/** A model's name as captions give it (the challenge's list names every model a redo can use); its id otherwise. */
export const modelNameOf = (id: string) => CHALLENGE_MODELS.find((m) => m.allowlistId === id)?.name ?? id;

export function replacementView(r: ShownReplacement, modelName: string): RecipeView {
  return {
    file: recipePath(r.versionId),
    github: recipePath(r.versionId),
    whose: `${adminName(r.byFid, r.byHandle)}, an admin of Snowmoon Party, redid the project's picture with an image model. AI-generated, not by the author.`,
    full: { href: recipePath(r.versionId), text: 'Full recipe →' },
    what: `A picture for Chapter ${r.chapter}, redone by an admin in place of the edition's first picture (which stays in the repository and can be shown again). A starting point, not canon.`,
    model: { name: modelLine(modelName, r.maker, r.open), licence: r.open ? 'open weights' : 'closed: its weights aren’t published, so the recipe can’t be re-run exactly', where: 'through a hosted service named in the full recipe' },
    prompt: { label: 'The exact prompt', text: r.prompt },
    inputs: [
      { label: 'Style', value: r.look ? `${lookName(r.look)}: ${r.look.text}` : 'none' },
      { label: 'Note', value: `${r.note} (by ${adminName(r.byFid, r.byHandle)})` },
      { label: 'Reference', value: 'the picture the chapter showed before (its sha256 is in the full recipe)' },
    ],
    published: { by: `${adminName(r.byFid, r.byHandle)} (admin)`, when: day(r.at), whenIso: r.at },
    resultLicence: 'GPL-3.0',
  };
}

/** The chapter's pictures with every kept redo in place of its committed file; the rest unchanged. */
export function withReplacements(images: Illustration[], shown: Map<string, ShownReplacement>, nameOf: (model: string) => string): ShownIllustration[] {
  return images.map((im) => {
    const r = shown.get(im.id);
    if (!r) return im;
    const name = nameOf(r.model);
    const { lettering: _lettering, reviewed: _reviewed, ...rest } = im;
    void _lettering;
    void _reviewed;
    return {
      ...rest,
      url: r.url,
      width: r.width,
      height: r.height,
      recipe: recipePath(r.versionId),
      replaced: { versionId: r.versionId, by: replacedBy(r), at: r.at, model: modelLine(name, r.maker, r.open), view: replacementView(r, name) },
    };
  });
}

/**
 * One seeded picture as every page shows it now: the kept redo for its job (the latest decision wins), or the
 * committed file when there is none or the latest decision restored it. The same rule as the chapter page, for the
 * introduction's cards, quote cards, References, the sheets and the pick switch.
 */
export function shownPicture<T extends Illustration>(im: T, shown: Map<string, ShownReplacement>, nameOf: (model: string) => string = modelNameOf): T & { replaced?: Redone } {
  if (!shown.has(im.id)) return im;
  const [r] = withReplacements([im], shown, nameOf);
  // The committed file's lettering and review mark belong to that file, not to the redo (as on the chapter page).
  const { lettering: _lettering, reviewed: _reviewed, ...rest } = im;
  void _lettering;
  void _reviewed;
  return { ...rest, url: r.url, width: r.width, height: r.height, recipe: r.recipe, replaced: r.replaced } as T & { replaced?: Redone };
}
