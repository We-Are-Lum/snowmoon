/**
 * Play today as a version: no settings changed, Play's four drawn rules, Play's 15 x 10 board.
 * Every Play page, the server and the replay run on versions/engine.ts with this; under it the
 * engine plays exactly as game.ts did before the one engine (scripts/test-minpentai-versions.ts,
 * against the frozen copy in scripts/fixtures/minpentai/).
 */
import { engine, layout, type Engine, type Layout } from './engine';
import { BASE, BASE_DRAWN, assertFog, type DrawnRule, type Settings, type Version } from './schema';

/** What the engine needs of a version: its rules, nothing about who made it. */
export type VersionRules = Pick<Version, 'set' | 'drawn' | 'rocksAt'>;

export const SOLO_V1: VersionRules = { set: {} };
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
