import 'server-only';
import { IMAGES } from '../config';
import { bookCharacter } from '../images/designs';
import { shorthandLine, sheetCharacter } from '../images/sheets';
import type { TicketSheets } from '../images/ticket';
import { chapterChip, momentById, MOMENTS, readerHref, type Moment } from './moments';
import { MAKE_WORDING as M } from './make-wording';
import type { Source } from './pictures';

/**
 * The remix screen's server half (branch challenge-moments, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S2):
 * what the model receives for a challenge picture, and the screen's data.
 *
 * The prompt, exactly as sent and recorded (P1): the person's words first; then that the person in the reference picture
 * is the character remixed, kept as they are; then the moment's scene line (this edition's, drafted by the coding agent;
 * the moment's quote is shown, never sent); then, for each other challenge character in the moment, the project's
 * shorthand for their current default look (owner, answer 10: "other characters are drawn from their current default
 * looks"); then the site's no-lettering line. The reference picture is the one tapped (a base sheet's front view, or a
 * challenge picture), sent to the edit model.
 */
export function momentPrompt(p: { words: string; name: string; scene: string; others: string[] }): string {
  return [p.words.trim(), `The person in the reference picture is ${p.name}: keep their face, hair and clothes as they are.`, p.scene, ...p.others, IMAGES.suffix].filter(Boolean).join('\n\n');
}

/** The other challenge characters in the moment, as the project's shorthand (their current default look), for the recipe. */
export function othersIn(m: Moment, character: string): TicketSheets | null {
  const added = m.characters
    .filter((c) => c !== character)
    .map((slug) => sheetCharacter(slug))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => ({ kind: 'character' as const, slug: c.slug, name: c.name, text: shorthandLine(c) }));
  return { characters: [character, ...added.map((a) => a.slug)], place: null, added };
}

/** What the request may hold: a version to start from, a moment of the fifteen, and the person's words. */
export function readMake(body: unknown): { ok: true; from: string; moment: Moment; words: string } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as { from?: unknown; moment?: unknown; words?: unknown };
  const from = typeof b.from === 'string' && /^[0-9a-f-]{36}$/i.test(b.from) ? b.from.toLowerCase() : null;
  if (!from) return { ok: false, error: M.noSource };
  const moment = momentById(typeof b.moment === 'string' ? b.moment : null);
  if (!moment) return { ok: false, error: M.noMoment };
  const words = typeof b.words === 'string' ? b.words.trim() : '';
  if (!words) return { ok: false, error: M.noWords };
  if (words.length > IMAGES.promptMaxChars) return { ok: false, error: `Describe it in up to ${IMAGES.promptMaxChars} characters` };
  return { ok: true, from, moment, words };
}

const callName = (slug: string) => (bookCharacter(slug)?.name ?? slug).split(' ')[0];

/** The moments as the strip shows them: all fifteen, in the book's order, each with its chapter and its quotes. */
export const momentChips = () =>
  MOMENTS.map((m) => ({ id: m.id, title: m.title, chip: chapterChip(m), withCharacters: m.characters, quotes: m.quotes.map((q) => ({ block: q.block, text: q.text, href: readerHref(q.block) })) }));

/** The remix screen's data: the picture tapped, the moments, and every word the screen shows. */
export function makeView(src: Source) {
  const name = callName(src.character);
  return {
    source: { versionId: src.versionId, kind: src.kind, character: src.character, name, url: src.url, moment: src.moment },
    moments: momentChips(),
    w: { ...M, remixing: M.remixing(name), picture: M.picture(name) },
  };
}
export type MakeView = ReturnType<typeof makeView>;
