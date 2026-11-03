/**
 * Play's rulesets as versions: Play's four drawn rules, Play's 15 x 10 board.
 * Every Play page, the server and the replay run on versions/engine.ts with this; under it the
 * engine plays exactly as game.ts did before the one engine (scripts/test-minpentai-versions.ts,
 * against the frozen copy in scripts/fixtures/minpentai/).
 */
import { engine, layout, type Engine, type Layout } from './engine';
import { BASE, BASE_DRAWN, assertFog, type DrawnRule, type Settings, type Version } from './schema';

/** What the engine needs of a version: its rules, nothing about who made it. */
export type VersionRules = Pick<Version, 'set' | 'drawn' | 'rocksAt'>;

/** Play as it was until 2026-10-22, frozen: 96 steps, computer players build up to 5 towers. Never edit. */
export const SOLO_V1: VersionRules = { set: {} };
/** Play rules draft 2 (owner, 2026-10-22, after Luis's play tests): 120 steps, computer players build up to 10 towers. */
export const SOLO_V2: VersionRules = { set: { maxSteps: 120, botTowers: 10 } };
/**
 * Draft 2's rules, played against the search computer (owner, 2026-10-31: the search computer replaces the old
 * players, as its own ruleset after cap10). Same settings as 2; a different object, so its number is its own.
 * Play's practice match and ladder use it; the snap and one-on-one stay on 2.
 */
export const SOLO_V3: VersionRules = { set: { maxSteps: 120, botTowers: 10 } };

/**
 * Play's rulesets by number (owner, 2026-10-30: a rule change never changes old links). Every challenge
 * link, snap state or run token, Resume row, Play "continue" link, share card and one-on-one match carries
 * the number it was made under; anything made before rulesets were numbered carries none and loads as 1.
 * A new rule change adds a number here (the stronger computer's players will be 3); old numbers never change.
 */
export const RULESETS = { 1: SOLO_V1, 2: SOLO_V2, 3: SOLO_V3 } as const;
export type RulesetId = keyof typeof RULESETS;
/** The ruleset new Play matches use. */
export const PLAY_RULESET: RulesetId = 2;
export const PLAY: VersionRules = RULESETS[PLAY_RULESET];
/** The ruleset Play's practice match and computer ladder use: the search computer's. */
export const LADDER_RULESET: RulesetId = 3;
export const LADDER: VersionRules = RULESETS[LADDER_RULESET];
/** Whether a ruleset's computer players are the search computer (versions/search.ts) rather than the old rungs (botPlan). */
export const usesSearch = (v: VersionRules) => v === SOLO_V3;
/** A ruleset number from a link, token or row: missing or unknown means 1 (made before numbering). */
export const rulesetId = (x: unknown): RulesetId => (x === 2 || x === '2' ? 2 : x === 3 || x === '3' ? 3 : 1);
/** The ruleset of a Play-sized version object, or null for a player-made version. */
export const rulesetOfRules = (v: VersionRules): RulesetId | null => (v === SOLO_V1 ? 1 : v === SOLO_V2 ? 2 : v === SOLO_V3 ? 3 : null);
/** A ruleset's step limit (for checking a result's step without building a match). */
export const maxStepsOf = (id: RulesetId) => ({ ...BASE, ...RULESETS[id].set }).maxSteps;
export const SOLO_V1_LAYOUT: Layout = layout(SOLO_V1, BASE);
export const SOLO_V1_ENGINE: Engine = engine(SOLO_V1_LAYOUT);

/** A version's drawn rules (Play's four when it names none). */
export const drawnOf = (v: VersionRules): DrawnRule[] => v.drawn ?? BASE_DRAWN;

/** The settings in force under a version once its drawn rule is known (by id; none for ''). */
export function settingsFor(v: VersionRules, ruleId: string): Settings {
  const d = drawnOf(v).find((x) => x.id === ruleId);
  const s: Settings = { ...BASE, ...v.set, ...(d?.set ?? {}) };
  assertFog(s);
  return s;
}

/** The engine for a version's board (Play's own engine object for Play-sized boards). */
export function engineFor(v: VersionRules, s: Settings): Engine {
  if (s.width === BASE.width && s.height === BASE.height && s.startTowers === BASE.startTowers && !v.rocksAt) return SOLO_V1_ENGINE;
  return engine(layout(v, s));
}

const bySize = new Map<string, Engine>();
/** An engine for drawing a board of this size (the page's view of a match; where the starts are doesn't matter). */
export function engineForSize(W: number, H: number): Engine {
  if (W === SOLO_V1_LAYOUT.W && H === SOLO_V1_LAYOUT.H) return SOLO_V1_ENGINE;
  const key = `${W}x${H}`;
  if (!bySize.has(key)) bySize.set(key, engine(layout({}, { ...BASE, width: W, height: H })));
  return bySize.get(key)!;
}
