import { MAXS, RUNGS } from './play-game/game';

/**
 * Sharing a ladder win (owner, 2026-10-19: opt-in, a card made on demand, nothing stored, no ranking).
 * Everything a shared result shows is in its link: the rung beaten and the steps it took. The server
 * keeps nothing about it; the card is drawn from the link each time. The link is not proof of a win:
 * anyone could type one, which is fine because nothing ranks or compares results.
 */
export type SharedResult = { rung: number; name: string; steps: number };

/** A result from a link's query (r = rung 1–5, s = steps 1–MAXS), or null for anything else. */
export function parseResult(r: string | null | undefined, s: string | null | undefined): SharedResult | null {
  if (!r || !s || !/^[1-5]$/.test(r) || !/^\d{1,3}$/.test(s)) return null;
  const rung = Number(r), steps = Number(s);
  if (steps < 1 || steps > MAXS) return null;
  return { rung, name: RUNGS[rung]!.n, steps };
}

export const resultPath = (x: { rung: number; steps: number }) => `/minpentai/result?r=${x.rung}&s=${x.steps}`;

/** The words a share starts with; the person can change them in the composer before posting. */
export const resultText = (x: SharedResult) =>
  `I beat ${x.name}, rung ${x.rung} of 5 on the Minpentai ladder, in ${x.steps} steps. A game from Snowmoon, with rules invented for this edition.`;
