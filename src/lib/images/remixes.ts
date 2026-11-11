import { IMAGES } from '../config';

/**
 * Free remixes (owner, 2026-11-04), the pure rules; src/lib/images/limits.ts (reserve) runs them under the person's
 * lock, so two views at once can't pass the count. No network, no database here, so scripts/test-challenge.ts proves
 * each rule on stand-ins.
 *
 * - Who counts remixes: a Farcaster account that passes the check, not an admin (IMAGES.perDayFor) and not invited
 *   (IMAGES.invited). Admins and invited makers keep counting pictures, as before. Wallet accounts pay per picture.
 * - A remix is one sheet's three views. Its first view starts it and uses `remixUnits` of the day's
 *   IMAGES.designs.remixesPerDay; its other views, and any view made again, use none, up to
 *   IMAGES.designs.picturesPerRemix pictures in all. So a view that fails (the prompt check or the model didn't answer,
 *   or the safety checker dropped it) is made again inside the same remix without using another.
 * - A remix on a closed model counts IMAGES.designs.closedRemixUnits (3): the hook for branch remix-model-choice,
 *   which passes its chosen model's `open` here. Today every remix is on the open default, so 1.
 */

/**
 * Person numbers: an FID is above zero; a wallet account is -1 to -999,999,999; a Lens or Bluesky account is at or
 * below -1,000,000,000 (studio.sheet_remix_asks takes FIDs and these, never a wallet's). The same ranges as
 * bluesky-check's src/lib/people.ts (isWalletPerson, isSocialPerson): when the branches meet, use those and drop these.
 */
export const SOCIAL_PERSON_BASE = 1_000_000_000;
export const isWalletNumber = (person: number) => person < 0 && person > -SOCIAL_PERSON_BASE;
export const isSocialNumber = (person: number) => person <= -SOCIAL_PERSON_BASE;

/**
 * Whether this person's sheet views count as remixes (else as pictures, as before): an FID, or a Lens or Bluesky
 * account (owner, 2026-11-04: a Bluesky account that passes its check gets free remixes). Whether a Lens or Bluesky
 * account passed is decided before this, by bluesky-check's gate at the top of reserve() (freeFor); nothing on this
 * branch signs one in. Never a wallet account: it pays per picture.
 */
export const countsRemixes = (fid: number, lists: { perDayFor: Readonly<Record<number, number>>; invited: readonly number[] } = IMAGES): boolean =>
  (fid > 0 || isSocialNumber(fid)) && lists.perDayFor[fid] === undefined && !lists.invited.includes(fid);

/** How many of the day's remixes one remix uses: 1 on an open model, 3 on a closed one (remix-model-choice's hook). */
export const remixUnits = (model: { open: boolean }): number => (model.open ? 1 : IMAGES.designs.closedRemixUnits);

export type RemixRefusal = 'remix-limit' | 'remix-used';

/**
 * May this view be made? `starts`: it is the first view of a new remix. `used`: the units of the remixes this person
 * started today. `tries`: pictures already asked for in this remix (failed ones included).
 */
export function remixRefusal(
  p: { starts: boolean; units: number; used: number; tries: number },
  limits: { perDay: number; perRemix: number } = { perDay: IMAGES.designs.remixesPerDay, perRemix: IMAGES.designs.picturesPerRemix },
): RemixRefusal | null {
  if (p.starts) return p.used + p.units > limits.perDay ? 'remix-limit' : null;
  // A remix that was never started (no row) can't be continued: start a new one.
  if (p.tries <= 0 || p.tries >= limits.perRemix) return 'remix-used';
  return null;
}

/** One row of studio.sheet_remix_asks: one per picture asked for in a remix. */
export interface RemixAsk {
  remix: string;
  units: number;
  at: string;
}

/** The units of the remixes started since `since` (each remix once, at its first row), whatever their later views. */
export function remixesUsed(rows: readonly RemixAsk[], since: Date): number {
  const first = new Map<string, RemixAsk>();
  for (const r of rows) {
    const f = first.get(r.remix);
    if (!f || r.at < f.at) first.set(r.remix, r);
  }
  return [...first.values()].filter((r) => Date.parse(r.at) >= since.getTime()).reduce((n, r) => n + r.units, 0);
}

/** Remixes left today, from the units used (never below zero). */
export const remixesLeft = (used: number, perDay: number = IMAGES.designs.remixesPerDay) => Math.max(0, perDay - used);
