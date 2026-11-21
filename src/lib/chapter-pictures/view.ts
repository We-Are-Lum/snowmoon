import 'server-only';
import type { Illustration } from '../illustrations';
import type { RecipeView } from '../recipe-view';
import { CHALLENGE_MODELS } from '../challenge/models';
import { addedBy, adminName, day, lookName, modelLine, recipePath, replacedBy, type Addition, type ShownReplacement } from './shared';

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

/**
 * The pictures admins added to one chapter (owner, 2026-11-19), as the chapter and its player show them: each kept one
 * after its block, with "Added by @handle · date · model" and its recipe sheet. A draft never kept, one taken off the
 * chapter, or one an admin hid (studio.seeded_hidden, as for the committed pictures) isn't shown. Wording DRAFT.
 */
export function addedPictures(chapter: number, additions: Addition[], shown: Map<string, ShownReplacement>, hidden: Set<string>, nameOf: (model: string) => string = modelNameOf): AddedIllustration[] {
  return keptAddedPictures(additions.filter((a) => a.chapter === chapter), shown, hidden, nameOf);
}

/**
 * Every added picture that shows now, in any chapter, in book order (chapter, then its block, then when it was added):
 * the same rule as the chapter (kept, not taken off, not hidden), for the other places an added picture reaches (owner,
 * 2026-11-21: quote cards, References and the sheets, the pick switch).
 */
export function keptAddedPictures(additions: Addition[], shown: Map<string, ShownReplacement>, hidden: Set<string>, nameOf: (model: string) => string = modelNameOf): AddedIllustration[] {
  return additions
    .filter((a) => shown.has(a.jobId) && !hidden.has(a.jobId))
    .sort((a, b) => a.chapter - b.chapter || a.after - b.after || a.at.localeCompare(b.at))
    .map((a) => {
      const r = shown.get(a.jobId)!;
      const name = nameOf(r.model);
      const view = replacementView(r, name);
      return {
        id: a.jobId,
        idx: a.after,
        chapter: a.chapter,
        url: r.url,
        width: r.width,
        height: r.height,
        recipe: recipePath(r.versionId),
        alt: `AI-generated image: ${r.note.length > 200 ? `${r.note.slice(0, 197)}…` : r.note}`,
        passage: { start: a.start, end: a.end },
        sheets: r.sheets ?? [],
        replaced: {
          versionId: r.versionId,
          by: addedBy(r),
          at: r.at,
          model: modelLine(name, r.maker, r.open),
          view: {
            ...view,
            whose: `${adminName(r.byFid, r.byHandle)}, an admin of Snowmoon Party, added this picture to the chapter with an image model. AI-generated, not by the author.`,
            what: `A picture an admin added to Chapter ${r.chapter}, for blocks ${a.start}–${a.end}. A starting point, not canon.`,
            inputs: view.inputs.map((i) => (i.label === 'Reference' ? { label: 'References', value: 'any characters’ sheet pictures sent with it are named in the full recipe' } : i)),
          },
        },
      };
    });
}
export type AddedIllustration = Omit<Illustration, 'lettering' | 'reviewed'> & {
  chapter: number;
  passage: { start: number; end: number };
  /** The character sheets whose pictures were sent with it (by slug). */
  sheets: string[];
  replaced: Redone;
};
