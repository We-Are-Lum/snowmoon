import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE } from '../config';
import { bookCharacter } from '../images/designs';
import { designByline } from '../images/byline';
import { SUBMIT_WORDING, versionStanding } from './entries';
import { chapterChip } from './moments';
import { shownMoment } from './moment-switch';
import { challengePictures } from './pictures';
import { postsFor } from './posts';
import { backstoryOf } from './backstories';
import { challengeOpenNow, phase } from './rules';
import { submitWords, type SubmitWords } from './sheet-lines';
import { CHALLENGE_WORDING as CW } from './wording';
import { LANDING_WORDING as L } from './landing-wording';
import { PICTURE_WORDING as P } from './picture-wording';
import { sameTexts, shareMaker, textsFor } from './share-makers';
import type { PostedOnItem } from '~/components/posted-on';
import { callNameOf } from './names';

/**
 * A challenge picture's page, /challenge/p/<version> (owner, 2026-11-05; docs/proposals/challenge-moments.md §1.3
 * S4–S5), share first: the post buttons and the ready post (its words and this page's link) right under the picture,
 * then for its maker Submit (one a day, unchanged; option B: paste the post's address), then its character and moment,
 * who made it and their words. Plain data with its words written here, for the page's
 * component (src/components/challenge-picture.tsx). Read-only: never asks Neynar or anyone.
 */
type Sql = postgres.Sql;

const callName = (slug: string) => callNameOf(bookCharacter(slug)?.name ?? slug);

export async function pictureView(sql: Sql, versionId: string, now: Date = new Date()) {
  const [p] = await challengePictures(sql, { versionId });
  if (!p || !p.thumb) return null;
  const name = callName(p.character);
  // Its moment, only while the moments are on (CHALLENGE.moments; off since 2026-11-08): with them off, none is shown,
  // in the title, the ready post or the share texts, even for a picture made with one.
  const m = shownMoment(p.moment);
  const standing = CHALLENGE.pictureEntries ? await versionStanding(sql, p.versionId).catch(() => null) : null;
  const open = challengeOpenNow(now);
  const entry = standing?.kind === 'entry';
  // Submit for its maker, while entries are open and pictures are the entries (the component checks who is signed in).
  const submit: SubmitWords | null = open && (standing?.kind === 'candidate' || entry) ? { ...submitWords(entry, name), postText: P.postText(name, m?.title ?? null) } : null;
  const posts: PostedOnItem[] = CHALLENGE.posts ? (await postsFor(sql, p.versionId).catch(() => [])).map(({ id, network, handle, at, url }) => ({ id, network, handle, at, url })) : [];
  const maker = designByline(p.byName, p.byFid);
  // Its backstory (owner, 2026-11-09): in its version's body (new pictures only).
  const [vb] = await sql<{ body: unknown }[]>`select body from studio.element_versions where id = ${p.versionId}`;
  const backstory = backstoryOf(vb?.body);
  return {
    versionId: p.versionId,
    /** Remixing it (anyone but its maker): its remix screen from the owner's flip (before the open date too) until entries close; none after. */
    remixHref: CHALLENGE.public && phase(now) !== 'closed' ? `/challenge/make?from=${p.versionId}` : null,
    /**
     * Its maker's line in place of Submit (owner, 2026-11-07): before the open date, "Entries open …" for every picture;
     * from the open date to the close, for a picture published before it, that it can't be entered.
     */
    notYet: CHALLENGE.pictureEntries && CHALLENGE.public && phase(now) === 'before' ? SUBMIT_WORDING.opens() : null,
    beforeOpen: CHALLENGE.pictureEntries && phase(now) === 'open' && Date.parse(p.createdAt) < Date.parse(CHALLENGE.dates.opens) ? { ...P.beforeOpen, href: `/challenge/make?from=${p.versionId}` } : null,
    url: p.thumb,
    character: p.character,
    byFid: p.byFid,
    alt: L.pictureAltMoment(name),
    title: m ? P.title(name, m.title, chapterChip(m)) : name,
    by: P.by(maker),
    words: p.words,
    backstory,
    name,
    /** Who it's invented by, as the page names its maker ('@name'). */
    maker,
    badge: entry ? CW.badge : null,
    note: standing?.kind === 'admin' ? CW.adminNote : !CHALLENGE.pictureEntries ? P.notEntriesYet : null,
    submit,
    posts,
    w: { close: P.close, published: P.published, wordsHead: P.wordsHead, recipe: P.recipe, every: L.entriesLink, another: P.another, signInLine: P.signInLine, rules: L.rulesLink, oneADay: P.oneADay, postTexts: sameTexts(P.postText(name, m?.title ?? null)), othersTexts: textsFor([shareMaker(p.byName, p.byFid)], (who) => (m ? P.othersText(name, m.title, who) : P.othersTextPlain(name, who))), remixThis: P.remixThis, shareHead: P.shareHead, copy: P.copy, copied: P.copied, thenSubmit: P.thenSubmit, on: { farcaster: CW.submitPostOn('Farcaster'), bluesky: CW.submitPostOn('Bluesky'), lens: CW.submitPostOn('Lens') } },
  };
}
export type PictureView = NonNullable<Awaited<ReturnType<typeof pictureView>>>;
