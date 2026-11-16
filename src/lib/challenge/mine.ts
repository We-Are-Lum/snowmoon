import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import { callNameOf } from './names';
import { eligibilityOf, exampleIds, readSubmissions, windowVersions } from './entries';
import { postsFor } from './posts';
import { chooseEntries, inWindow, newestFirst } from './rules';
import { MINE_WORDING } from './mine-wording';
import { CHALLENGE_WORDING as CW } from './wording';

type Sql = postgres.Sql;

const M = { ...MINE_WORDING, exampleLabel: CW.exampleLabel, exampleInfo: CW.exampleInfo };
export type MineWords = typeof M;

/** One of your challenge pictures, as "Your challenge pictures" lists it. */
export interface MinePicture {
  versionId: string;
  href: string;
  thumb: string | null;
  name: string;
  createdAt: string;
  /** An admin's picture submitted with its post: shown under "Entries" with the "Admin example" label, never an entry. */
  example: boolean;
  /** Its newest post (entries and examples), as a link. */
  post: { url: string; handle: string; network: string } | null;
  /** Withdraw, as the rules allow: an entry (not an example) while entries are open. */
  canWithdraw: boolean;
}

/**
 * "Your challenge pictures" (owner, 2026-11-12), for the person signed in: their published challenge pictures made in the
 * entry window, in two groups, each newest first. "Published, not submitted": the ones they can still submit (an eligible
 * picture not entered; an admin's picture not yet an example). "Entries": their entries, each with its post and Withdraw
 * while entries are open, and an admin's examples, labelled. Pictures made but not published aren't listed: they aren't
 * kept anywhere (owner, 2026-11-12: option a). Read-only; their own pictures only.
 */
export async function myChallengePictures(sql: Sql, person: number, now = new Date()): Promise<{ published: MinePicture[]; entries: MinePicture[]; w: MineWords }> {
  if (!CHALLENGE.entries) return { published: [], entries: [], w: M };
  const mine = (await windowVersions(sql)).filter((v) => v.forked && v.person === person).sort(newestFirst);
  if (!mine.length) return { published: [], entries: [], w: M };
  const elig = await eligibilityOf(sql, mine);
  const entered = new Set(chooseEntries(mine.filter((v) => elig.get(v.versionId)?.eligible === true), await readSubmissions(sql), () => true).map((v) => v.versionId));
  const admins = mine.filter((v) => elig.get(v.versionId)?.why === 'admin');
  const examples = await exampleIds(sql, admins, elig);
  const open = inWindow(now);
  const row = async (v: (typeof mine)[number], example: boolean, entry: boolean): Promise<MinePicture> => {
    const p = entry || example ? (await postsFor(sql, v.versionId))[0] ?? null : null;
    return {
      versionId: v.versionId,
      href: `/challenge/p/${v.versionId}`,
      thumb: v.thumb,
      name: callNameOf(bookCharacter(v.character)?.name ?? v.character),
      createdAt: v.createdAt,
      example,
      post: p ? { url: p.url, handle: p.handle, network: p.network } : null,
      canWithdraw: entry && open,
    };
  };
  const published: MinePicture[] = [];
  const entries: MinePicture[] = [];
  for (const v of mine) {
    if (entered.has(v.versionId)) entries.push(await row(v, false, true));
    else if (examples.has(v.versionId)) entries.push(await row(v, true, false));
    else if (elig.get(v.versionId)?.eligible === true || elig.get(v.versionId)?.why === 'admin') published.push(await row(v, false, false));
  }
  return { published, entries, w: M };
}
