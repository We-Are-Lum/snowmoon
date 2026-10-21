/**
 * Versions of Minpentai Play for the snap (spike, 2026-10-21). A version is solo-v1 with some of
 * its numbers changed: the extra rule fixed instead of drawn, sight, the turn interval, the glider
 * cost. These are the numbers the engine already takes as parameters (game.ts: m.R, m.every,
 * m.cost, and m.rule for diagonal flight); anything else needs the rule modules of
 * docs/proposals/minpentai-rule-modules.md (minpentai-onchain branch), which are not built.
 *
 * Nobody can make a version yet. The one below is a sample by this edition, labelled as such, so
 * the snap's "What's different" card has something to show. Player-made versions will come from
 * the mini app; until then the snap reads them only from this list, never from the link, so a link
 * can't put words in a player's name.
 */
import { RULES, type RuleId } from '../play-game/game';

export interface Version {
  id: string;
  name: string;
  /** Who made it, as shown. */
  by: string;
  /** The extra rule, fixed instead of drawn. The first random number is still drawn (and unused),
   * so the computer player's numbers stay where they are in the base game. */
  rule?: RuleId;
  /** Sight and placing distance (base 3, or 2 under sight2). */
  R?: number;
  /** Steps between turns to act (base 12, or 8 under every8). */
  every?: number;
  /** Glider cost (base 4, or 3 under cost3). */
  cost?: number;
}

export const VERSIONS: Record<string, Version> = {
  'fast-fog': { id: 'fast-fog', name: 'Fast fog', by: 'Snowmoon Party (a sample)', rule: 'every8', R: 2 },
};

export function versionOf(id: string | null | undefined): Version | null {
  return (id && Object.prototype.hasOwnProperty.call(VERSIONS, id) && VERSIONS[id]) || null;
}

/** The match's numbers: the drawn rule unless the version fixes one, then the version's overrides. */
export function settings(drawn: RuleId, v: Version | null) {
  const rule = v?.rule ?? drawn;
  return {
    rule,
    R: v?.R ?? (rule === 'sight2' ? 2 : 3),
    every: v?.every ?? (rule === 'every8' ? 8 : 12),
    cost: v?.cost ?? (rule === 'cost3' ? 3 : 4),
  };
}

/** What a version changes, one short line each, for the "What's different" card. */
export function differences(v: Version): string[] {
  const out: string[] = [];
  if (v.rule) out.push(`The extra rule is always this one: ${RULES[v.rule]}`);
  if (v.R !== undefined && v.R !== (v.rule === 'sight2' ? 2 : 3)) out.push(`You see and place ${v.R} squares around your towers (not 3).`);
  if (v.every !== undefined && v.every !== (v.rule === 'every8' ? 8 : 12)) out.push(`Turns to act every ${v.every} steps.`);
  if (v.cost !== undefined && v.cost !== (v.rule === 'cost3' ? 3 : 4)) out.push(`Gliders cost ${v.cost} points.`);
  return out;
}
