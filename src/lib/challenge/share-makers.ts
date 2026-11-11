/**
 * Who a share text names, and how (owner, 2026-11-07, "the @ rule"): "@maker" only when the post goes to the maker's own
 * network (a Farcaster name in a Farcaster compose, a Bluesky handle in a Bluesky compose, a Lens username in a Hey
 * compose); anywhere else, or when the share doesn't know the network (Copy link, the ready text shown on the page, a
 * generic share), the handle without "@", so it can't tag a stranger. Pure, so the server writes every text and the
 * page only picks the one for the button pressed; shared by the pages and their tests.
 */
export type ShareNetwork = 'farcaster' | 'bluesky' | 'lens';
/** Where a text goes: one network's compose, or 'plain' (Copy link, the ready text, a share that doesn't know). */
export type ShareTarget = ShareNetwork | 'plain';
export type ShareTexts = Record<ShareTarget, string>;
export const SHARE_TARGETS: readonly ShareTarget[] = ['farcaster', 'bluesky', 'lens', 'plain'];

/** A maker as a share names them: their handle (no "@"), and the network it belongs to (null: none, e.g. a wallet). */
export interface ShareMaker {
  handle: string;
  network: ShareNetwork | null;
}

const SOCIAL_PERSON_BASE = 1_000_000_000;

/**
 * A maker from a version's byline fields (as src/lib/images/byline.ts reads them): a Farcaster FID with its name; a Lens
 * or Bluesky person (minus 1e9 and more) by the name kept at publish, "lens/<name>" for Lens, the handle for Bluesky; a
 * wallet by its shortened address. No name: "FID n", which no network can tag.
 */
export function shareMaker(byName: string | null | undefined, byFid: number): ShareMaker {
  const name = (byName ?? '').replace(/^@/, '').trim();
  if (byFid > 0) return name ? { handle: name, network: 'farcaster' } : { handle: `FID ${byFid}`, network: null };
  if (byFid <= -SOCIAL_PERSON_BASE && name) return name.startsWith('lens/') ? { handle: name, network: 'lens' } : { handle: name, network: 'bluesky' };
  return { handle: name || 'a wallet', network: null };
}

/** How one maker is written for a target: "@" only in their own network's compose. A Lens username is "@<name>" on Hey. */
export function makerFor(m: ShareMaker, target: ShareTarget): string {
  if (m.network === null || m.network !== target) return m.handle;
  return m.network === 'lens' ? `@${m.handle.replace(/^lens\//, '')}` : `@${m.handle}`;
}

/** Two names with "and", three or more with commas and "and" (owner, 2026-11-07). */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Every maker, written for a target and joined. */
export const makersFor = (makers: readonly ShareMaker[], target: ShareTarget) => joinNames(makers.map((m) => makerFor(m, target)));

/** One text per target, from a function of the makers as written there. */
export function textsFor(makers: readonly ShareMaker[], text: (names: string) => string): ShareTexts {
  return Object.fromEntries(SHARE_TARGETS.map((t) => [t, text(makersFor(makers, t))])) as ShareTexts;
}

/** The same text everywhere (a text that names no one, such as the maker's own). */
export const sameTexts = (text: string): ShareTexts => Object.fromEntries(SHARE_TARGETS.map((t) => [t, text])) as ShareTexts;

/** Every "@name" in a text (for the tests: an @ may only be a maker's, in their own network's compose). */
export const atNames = (text: string) => [...text.matchAll(/(^|[\s(“"])@([A-Za-z0-9_.\-/]+)/g)].map((m) => m[2]);

/**
 * What breaks the @ rule in a set of texts: an "@name" in a target that isn't that maker's own network's compose (Copy
 * link and the ready text included), or one that isn't a maker's at all. Empty when the texts follow it.
 */
export function atRuleProblems(texts: ShareTexts, makers: readonly ShareMaker[]): string[] {
  const problems: string[] = [];
  for (const t of SHARE_TARGETS) {
    for (const name of atNames(texts[t])) {
      const m = makers.find((x) => makerFor(x, t) === `@${name}`);
      if (!m) problems.push(`${t}: "@${name}" is not a maker named in their own network's compose`);
    }
  }
  return problems;
}
