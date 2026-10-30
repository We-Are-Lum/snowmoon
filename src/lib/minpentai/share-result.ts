import { RUNGS } from './play-game/game';
import { maxStepsOf, rulesetId, type RulesetId } from './versions/solo-v1';
import { SETTINGS } from './versions/schema';

/**
 * Sharing a ladder win (owner, 2026-10-19: opt-in, a card made on demand, nothing stored, no ranking).
 * Everything a shared result shows is in its link: the rung beaten and the steps it took. The server
 * keeps nothing about it; the card is drawn from the link each time. The link is not proof of a win:
 * anyone could type one, which is fine because nothing ranks or compares results.
 */
export type SharedResult = { rung: number; name: string; steps: number; version?: string; rs: RulesetId };

/** A player-made version's short ID (docs/proposals/minpentai-one-engine-plan.md, part B). */
export const VERSION_ID = /^[0-9a-hjkmnp-tv-z]{10,12}$/;

/**
 * A result from a link's query (r = rung 1–5, s = steps 1–MAXS), or null for anything else. With
 * v (a version's short ID), the win was on that version, which may run up to 240 steps.
 */
export function parseResult(r: string | null | undefined, s: string | null | undefined, v?: string | null, g?: string | null): SharedResult | null {
  // g: the ruleset the win was under (solo-v1.ts RULESETS); a link made before rulesets were numbered has none and is 1.
  if (g != null && !/^[12]$/.test(g)) return null;
  const rs = rulesetId(g);
  if (!r || !s || !/^[1-5]$/.test(r) || !/^\d{1,3}$/.test(s)) return null;
  if (v != null && !VERSION_ID.test(v)) return null;
  const rung = Number(r), steps = Number(s);
  if (steps < 1 || steps > (v ? SETTINGS.maxSteps.max : maxStepsOf(rs))) return null;
  return { rung, name: RUNGS[rung]!.n, steps, rs, ...(v ? { version: v } : {}) };
}

export const resultPath = (x: { rung: number; steps: number; version?: string; rs?: RulesetId }) => `/minpentai/result?r=${x.rung}&s=${x.steps}${x.version ? `&v=${x.version}` : ''}${x.rs && x.rs !== 1 ? `&g=${x.rs}` : ''}`;

/** The words a share starts with; the person can change them in the composer before posting. */
export const resultText = (x: SharedResult) =>
  `I beat ${x.name}, rung ${x.rung} of 5 on the Minpentai ladder, in ${x.steps} steps. A game from Snowmoon, with rules invented for this edition.`;
