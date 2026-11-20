import 'server-only';
import { hiddenSeeded } from './admin-hidden';
import { excerpt, loadIntro, type Intro, type IntroImage } from './intro';
import type { Quote } from './quote';
import { replacementsEverywhere } from './chapter-pictures/read';
import type { ShownReplacement } from './chapter-pictures/shared';
import { modelNameOf, shownPicture } from './chapter-pictures/view';

/**
 * A seeded image an admin hid is gone wherever it shows (owner, 2026-10-30: "A hide on a seeded image reaches
 * everywhere it shows: home, About, quote cards, the player, share images. Add a check."). The chapter page and the
 * player get their images already filtered (src/app/chapter/[n]/page.tsx); References and the design sheets through
 * sheetImages. These two cover the rest: the introduction's cards (home, About, the "What is this?" sheet in every
 * page's shell) and quote cards (the share page and its card image). check:principles P5f checks every one.
 *
 * A redo an admin kept reaches the same places (owner, 2026-11-18/19): each picture shows what its job shows now, the
 * latest decision winning (src/lib/chapter-pictures/view.ts, shownPicture), and the committed file when there is no
 * kept redo, when the latest decision restored it, or when the database can't be read.
 */

/** The introduction with any hidden seeded image taken off its card (the card shows as it does with no image). */
export async function introShown(): Promise<Intro> {
  const intro = loadIntro();
  const [hidden, shown] = await Promise.all([hiddenSeeded(), replacementsEverywhere()]);
  if (!hidden.size && !shown.size) return intro;
  return {
    ...intro,
    cards: intro.cards.map((c) => (!c.image ? c : hidden.has(c.image.id) ? { ...c, image: null } : { ...c, image: introPicture(c.image, shown) })),
  };
}

/** An introduction card's picture with its job's kept redo, if it has one: the file, its size, and who, when and what model. */
export function introPicture(im: IntroImage, shown: Map<string, ShownReplacement>): IntroImage {
  const r = shown.get(im.id);
  if (!r) return im;
  const p = shownPicture({ id: im.id, idx: 0, url: im.url, width: im.width, height: im.height, recipe: im.recipeFile, alt: im.alt }, shown, modelNameOf);
  return { ...im, url: p.url, width: p.width, height: p.height, redone: { ...p.replaced!, prompt: excerpt(r.prompt, 90) } };
}

/**
 * A quote card without its picture when the picture is a hidden seeded image (the card is drawn as one with none), and
 * with its job's kept redo in place of the committed file when there is one.
 */
export async function quoteShown(quote: Quote | null): Promise<Quote | null> {
  if (!quote?.image) return quote;
  if ((await hiddenSeeded()).has(quote.image.id)) return { ...quote, image: null };
  const shown = await replacementsEverywhere();
  return shown.has(quote.image.id) ? { ...quote, image: shownPicture(quote.image, shown) } : quote;
}
