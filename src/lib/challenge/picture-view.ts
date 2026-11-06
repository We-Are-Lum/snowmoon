import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import { designByline } from '../images/byline';
import { versionStanding } from './entries';
import { chapterChip, momentById } from './moments';
import { challengePictures } from './pictures';
import { postsFor } from './posts';
import { challengeOpenNow } from './rules';
import { submitWords, type SubmitWords } from './sheet-lines';
import { CHALLENGE_WORDING as CW } from './wording';
import { LANDING_WORDING as L } from './landing-wording';
import { PICTURE_WORDING as P } from './picture-wording';
import type { PostedOnItem } from '~/components/posted-on';

/**
 * A challenge picture's page, /challenge/p/<version> (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3
 * S4–S5), share first: the post buttons and the ready post (its words and this page's link) right under the picture,
 * then for its maker Submit (one a day, unchanged; option B: paste the post's address), then its character and moment,
 * who made it and their words. Plain data with its words written here, for the page's
 * component (src/components/challenge-picture.tsx). Read-only: never asks Neynar or anyone.
 */
type Sql = postgres.Sql;

const callName = (slug: string) => (bookCharacter(slug)?.name ?? slug).split(' ')[0];

export async function pictureView(sql: Sql, versionId: string, now: Date = new Date()) {
  const [p] = await challengePictures(sql, { versionId });
  if (!p || !p.thumb) return null;
  const name = callName(p.character);
  const m = momentById(p.moment)!;
  const standing = CHALLENGE.pictureEntries ? await versionStanding(sql, p.versionId).catch(() => null) : null;
  const open = challengeOpenNow(now);
  const entry = standing?.kind === 'entry';
  // Submit for its maker, while entries are open and pictures are the entries (the component checks who is signed in).
  const submit: SubmitWords | null = open && (standing?.kind === 'candidate' || entry) ? { ...submitWords(entry, name), postText: P.postText(name, m.title) } : null;
  const posts: PostedOnItem[] = CHALLENGE.posts ? (await postsFor(sql, p.versionId).catch(() => [])).map(({ id, network, handle, at, url }) => ({ id, network, handle, at, url })) : [];
  return {
    versionId: p.versionId,
    url: p.thumb,
    character: p.character,
    byFid: p.byFid,
    alt: L.pictureAltMoment(name),
    title: P.title(name, m.title, chapterChip(m)),
    by: P.by(designByline(p.byName, p.byFid)),
    words: p.words,
    badge: entry ? CW.badge : null,
    note: standing?.kind === 'admin' ? CW.adminNote : !CHALLENGE.pictureEntries ? P.notEntriesYet : null,
    submit,
    posts,
    w: { close: P.close, published: P.published, wordsHead: P.wordsHead, recipe: P.recipe, every: L.entriesLink, another: P.another, signInLine: P.signInLine, rules: L.rulesLink, oneADay: P.oneADay, postText: P.postText(name, m.title), shareHead: P.shareHead, copy: P.copy, copied: P.copied, thenSubmit: P.thenSubmit, on: { farcaster: CW.submitPostOn('Farcaster'), bluesky: CW.submitPostOn('Bluesky'), lens: CW.submitPostOn('Lens') } },
  };
}
export type PictureView = NonNullable<Awaited<ReturnType<typeof pictureView>>>;
