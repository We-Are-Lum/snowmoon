import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { PRIVACY } from '../legal';
import { versionStanding } from './entries';
import { challengeSheetsOpen, isChallengeCharacter } from './open-sheets';
import { postsFor } from './posts';
import { challengeOpenNow } from './rules';
import { CHALLENGE_WORDING as CW } from './wording';
import type { PostedOnItem } from '~/components/posted-on';

/**
 * What a sheet's page says about the remix challenge (owner, 2026-10-31), with its words written here: the Entry badge,
 * a candidate's note and "Mark as my entry", the admin line, the invite on a challenge character's sheet, and "Posted
 * on". The page draws it on the server once the owner has opened the challenge (CHALLENGE.public); until then
 * (owner, 2026-11-04) only admins see it, from GET /api/challenge/standing (admins only), drawn as if it were open.
 */
type Sql = postgres.Sql;

export interface SheetLine {
  badge: string | null;
  text: string;
  link: { href: string; text: string } | null;
  muted: boolean;
  mark: { mark: string; marked: string } | null;
}
export interface SheetChallenge {
  lines: SheetLine[];
  posts: PostedOnItem[];
}

export async function sheetChallenge(sql: Sql, d: { kind: string; entity: string; versionId: string }, callName: string, pub: boolean = CHALLENGE.public, now: Date = new Date()): Promise<SheetChallenge> {
  const standing = await versionStanding(sql, d.versionId).catch(() => null);
  const posts = CHALLENGE.posts ? await postsFor(sql, d.versionId).catch(() => []) : [];
  const invite = d.kind === 'character' && challengeSheetsOpen(now, PRIVACY, pub) && isChallengeCharacter(d.entity);
  const toChallenge = { href: '/challenge', text: `${CW.title} →` };
  const line = (l: Partial<SheetLine> & { text: string }): SheetLine => ({ badge: null, link: null, muted: false, mark: null, ...l });
  const lines: SheetLine[] = [];
  if (standing?.kind === 'entry') lines.push(line({ badge: CW.badge, text: CW.badgeNote(callName), link: toChallenge }));
  // After the close a mark is refused, so no button is offered (launch rehearsal, 2026-11-02).
  if (standing?.kind === 'candidate')
    lines.push(challengeOpenNow(now, pub) ? line({ text: CW.candidateNote, muted: true, mark: { mark: CW.mark, marked: CW.marked } }) : line({ text: CW.candidateClosedNote(callName), muted: true }));
  if (standing?.kind === 'admin') lines.push(line({ text: CW.adminNote, muted: true }));
  if (invite && !standing) lines.push(line({ text: CW.sheetInvite(callName), link: toChallenge }));
  return { lines, posts: posts.map(({ id, network, handle, at, url }) => ({ id, network, handle, at, url })) };
}
