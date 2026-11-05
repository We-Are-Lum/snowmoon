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
 * What a sheet's page says about the remix challenge (owner, 2026-10-31), with its words written here: the Entry badge
 * and Withdraw, a candidate's note and Submit (owner, 2026-11-04), the admin line, the invite on a challenge character's sheet, and "Posted
 * on". The page draws it on the server once the owner has opened the challenge (CHALLENGE.public); until then
 * (owner, 2026-11-04) only admins see it, from GET /api/challenge/standing (admins only), drawn as if it were open.
 */
type Sql = postgres.Sql;

export interface SheetLine {
  badge: string | null;
  text: string;
  link: { href: string; text: string } | null;
  muted: boolean;
  /** Submit or Withdraw, for the version's maker only (the component checks who is signed in). */
  submit: SubmitWords | null;
}
/** Submit's words, written on the server so the component's script carries none of the challenge's (owner, 2026-11-04). */
export interface SubmitWords {
  submitted: boolean;
  head: string;
  note: string;
  label: string;
  submit: string;
  done: string;
  withdraw: string;
  withdrawNote: string;
  withdrawn: string;
  /** How many more today, for n = 0 … CHALLENGE.submissionsPerDay. */
  left: string[];
  /** "Post it first": the head, the note, a label per network, and the post's words (approved 2026-11-05). */
  postHead: string;
  postNote: string;
  postOn: { farcaster: string; bluesky: string; lens: string };
  postText: string;
}
export const submitWords = (submitted: boolean, name: string): SubmitWords => ({
  submitted,
  head: CW.submitHead,
  note: CW.submitNote(),
  label: CW.submitLabel,
  submit: CW.submit,
  done: CW.submitted,
  withdraw: CW.withdraw,
  withdrawNote: CW.withdrawNote,
  withdrawn: CW.withdrawn,
  left: Array.from({ length: CHALLENGE.submissionsPerDay + 1 }, (_, n) => CW.submissionsLeft(n)),
  postHead: CW.submitPostHead,
  postNote: CW.submitPostNote,
  postOn: { farcaster: CW.submitPostOn('Farcaster'), bluesky: CW.submitPostOn('Bluesky'), lens: CW.submitPostOn('Lens') },
  postText: CW.submitPostText(name),
});
export interface SheetChallenge {
  lines: SheetLine[];
  posts: PostedOnItem[];
}

export async function sheetChallenge(sql: Sql, d: { kind: string; entity: string; versionId: string }, callName: string, pub: boolean = CHALLENGE.public, now: Date = new Date()): Promise<SheetChallenge> {
  const standing = await versionStanding(sql, d.versionId).catch(() => null);
  const posts = CHALLENGE.posts ? await postsFor(sql, d.versionId).catch(() => []) : [];
  const invite = d.kind === 'character' && challengeSheetsOpen(now, PRIVACY, pub) && isChallengeCharacter(d.entity);
  const toChallenge = { href: '/challenge', text: `${CW.title} →` };
  const line = (l: Partial<SheetLine> & { text: string }): SheetLine => ({ badge: null, link: null, muted: false, submit: null, ...l });
  const lines: SheetLine[] = [];
  const open = challengeOpenNow(now, pub);
  // Its maker can withdraw it until entries close (owner, 2026-11-04).
  if (standing?.kind === 'entry') lines.push(line({ badge: CW.badge, text: CW.badgeNote(callName), link: toChallenge, submit: open ? submitWords(true, callName) : null }));
  // After the close Submit is refused, so nothing is offered (launch rehearsal, 2026-11-02).
  if (standing?.kind === 'candidate')
    lines.push(open ? line({ text: CW.candidateNote(callName), muted: true, submit: submitWords(false, callName) }) : line({ text: CW.candidateClosedNote(callName), muted: true }));
  if (standing?.kind === 'admin') lines.push(line({ text: CW.adminNote, muted: true }));
  if (invite && !standing) lines.push(line({ text: CW.sheetInvite(callName), link: toChallenge }));
  return { lines, posts: posts.map(({ id, network, handle, at, url }) => ({ id, network, handle, at, url })) };
}
