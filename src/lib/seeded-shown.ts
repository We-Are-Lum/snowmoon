import 'server-only';
import { hiddenSeeded } from './admin-hidden';
import { loadIntro, type Intro } from './intro';
import type { Quote } from './quote';

/**
 * A seeded image an admin hid is gone wherever it shows (owner, 2026-10-30: "A hide on a seeded image reaches
 * everywhere it shows: home, About, quote cards, the player, share images. Add a check."). The chapter page and the
 * player get their images already filtered (src/app/chapter/[n]/page.tsx); References and the design sheets through
 * sheetImages. These two cover the rest: the introduction's cards (home, About, the "What is this?" sheet in every
 * page's shell) and quote cards (the share page and its card image). check:principles P5f checks every one.
 */

/** The introduction with any hidden seeded image taken off its card (the card shows as it does with no image). */
export async function introShown(): Promise<Intro> {
  const intro = loadIntro();
  const hidden = await hiddenSeeded();
  if (!hidden.size) return intro;
  return { ...intro, cards: intro.cards.map((c) => (c.image && hidden.has(c.image.id) ? { ...c, image: null } : c)) };
}

/** A quote card without its picture when the picture is a hidden seeded image (the card is drawn as one with none). */
export async function quoteShown(quote: Quote | null): Promise<Quote | null> {
  if (!quote?.image) return quote;
  return (await hiddenSeeded()).has(quote.image.id) ? { ...quote, image: null } : quote;
}
