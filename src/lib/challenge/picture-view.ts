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
import { remixLines } from './lineage';
import { imageByVersion } from '../images/data';
import { closedModel, modelName, modelTerms } from '../images/recipe-lines';
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

/** One step of a picture's credit chain (the redesign's CreditChain): a picture or a base it was remixed from. */
export type ChainStep = { versionId: string; thumb: string | null; href: string | null; label: string; current: boolean; hidden?: boolean };

/**
 * The credit chain (owner-approved redesign, screen 4): what the picture was remixed from, oldest first (src/lib/
 * challenge/lineage.ts), its base first (the 'uses' link of the line's oldest picture), then the picture itself. A base
 * is labelled "Base · {maker}" and isn't linked (no crumb into References on the flow); a published picture links to its
 * page. Read-only.
 */
async function creditChain(sql: Sql, p: { elementId: string; versionId: string; thumb: string | null; character: string }, self: string): Promise<ChainStep[]> {
  const line = (await remixLines(sql, [p.elementId]).catch(() => new Map())).get(p.elementId) ?? [];
  const pics: string[] = line.map((a: { versionId: string }) => a.versionId);
  // The base: the oldest picture in the line (or this one) uses its character's sheet ('uses', as picturesCount reads it).
  const oldest = pics.length ? pics[pics.length - 1] : p.versionId;
  const name = bookCharacter(p.character)?.name ?? '';
  const [base] = await sql<{ to_version: string }[]>`
    select tv.id::text as to_version
    from studio.links l
    join studio.element_versions tv on tv.id = l.to_version_id
    join studio.elements te on te.id = tv.element_id and te.element_type = 'design'
    join studio.entities en on en.id = te.entity_id and en.kind = 'character' and en.name = ${name}
    where l.kind = 'uses' and l.from_version_id = ${oldest}
    limit 1`.catch(() => []);
  const ids = base ? [...pics, base.to_version] : pics;
  const rows = ids.length
    ? await sql<{ version_id: string; element_type: string; created_by_fid: number; status: string; asset_url: string | null; body: Record<string, unknown> | null; p_by_name: string | null }[]>`
        select v.id::text as version_id, e.element_type, e.created_by_fid, e.status, v.asset_url, v.body, r.params->>'by_name' as p_by_name
        from studio.element_versions v join studio.elements e on e.id = v.element_id left join studio.recipes r on r.id = v.recipe_id
        where v.id in ${sql(ids)}`.catch(() => [])
    : [];
  const by = new Map(rows.map((r) => [r.version_id, r]));
  const steps: ChainStep[] = ids
    .slice()
    .reverse()
    .map((id: string): ChainStep | null => {
      const r = by.get(id);
      if (!r) return null;
      const b = (r.body ?? {}) as { views?: { front?: { url?: string } }; by_name?: string; role?: string };
      const image = r.element_type === 'image';
      const who = image ? designByline(r.p_by_name, Number(r.created_by_fid)) : designByline(b.by_name ?? null, Number(r.created_by_fid), b.role ?? null);
      const published = r.status === 'published';
      // A step that isn't published (hidden by its maker or a moderator): "A hidden picture", with no picture, name or
      // link (owner, 2026-11-12). "Started from" then says the same.
      if (!published) return { versionId: id, thumb: null, href: null, label: P.hiddenStep, current: false, hidden: true };
      return { versionId: id, thumb: image ? r.asset_url : (b.views?.front?.url ?? null), href: image ? `/challenge/p/${id}` : null, label: image ? who : `${L.baseLabel} · ${who}`, current: false };
    })
    .filter((x: ChainStep | null): x is ChainStep => x !== null);
  return [...steps, { versionId: p.versionId, thumb: p.thumb, href: null, label: self, current: true }];
}

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
  // An admin's own picture (owner, 2026-11-12): its maker sees Submit to share it as an example (never an entry); once
  // submitted, it is marked "Admin example" with its ⓘ.
  const example = standing?.kind === 'admin' && standing.example;
  const exampleSubmit: SubmitWords | null =
    open && standing?.kind === 'admin' && !standing.example ? { ...submitWords(false, name), postText: P.postText(name, m?.title ?? null), done: CW.exampleSubmitted, example: true } : null;
  const posts: PostedOnItem[] = CHALLENGE.posts ? (await postsFor(sql, p.versionId).catch(() => [])).map(({ id, network, handle, at, url }) => ({ id, network, handle, at, url })) : [];
  const maker = designByline(p.byName, p.byFid);
  // Its backstory (owner, 2026-11-09): in its version's body (new pictures only).
  const [vb] = await sql<{ body: unknown }[]>`select body from studio.element_versions where id = ${p.versionId}`;
  const backstory = backstoryOf(vb?.body);
  // The redesign (screen 4): the model and its maker, the date, the chain and the recipe's main lines.
  const im = await imageByVersion(sql, p.versionId).catch(() => null);
  const model = im?.model ? `${modelName(im.model)}, ${modelTerms(im.model)}` : null;
  const chain = await creditChain(sql, p, P.thisOne);
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
    /** "Admin example" and its ⓘ (owner, 2026-11-12): an admin's picture submitted with its post. */
    example: example ? { label: CW.exampleLabel, info: CW.exampleInfo } : null,
    note: standing?.kind === 'admin' ? (example ? null : CW.adminNote) : !CHALLENGE.pictureEntries ? P.notEntriesYet : null,
    submit: submit ?? exampleSubmit,
    posts,
    /** "AI-generated · {model}, a closed model by {maker}" (owner, 2026-11-12: no "not by the author" in sight here;
     *  the AI label's hidden declaration keeps it). */
    aiLine: model ? `${P.aiLine} · ${model}` : P.aiLine,
    /** A closed model's maker, for the phone's chip ("AI · OpenAI"); null for an open model. */
    aiMaker: im?.model ? (closedModel(im.model)?.closed ? (closedModel(im.model)?.maker ?? null) : null) : null,
    /** The day it was made, Pacific time ("14 Nov"). */
    date: new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'America/Los_Angeles' }),
    chain: chain.length > 1 ? chain : [],
    made: {
      style: im?.style?.text ?? null,
      model,
      startedFrom: chain.length > 1 ? chain[chain.length - 2].label : null,
      prompt: im?.prompt ?? null,
    },
    w: { close: P.close, published: P.published, wordsHead: P.wordsHead, recipe: P.recipe, every: L.entriesLink, another: P.another, signInLine: P.signInLine, rules: L.rulesLink, oneADay: exampleSubmit ? null : P.oneADay, postsHead: P.postsHead, postsNote: P.postsNote, postTexts: sameTexts(P.postText(name, m?.title ?? null)), othersTexts: textsFor([shareMaker(p.byName, p.byFid)], (who) => (m ? P.othersText(name, m.title, who) : P.othersTextPlain(name, who))), remixThis: P.remixThis, remixedFrom: P.remixedFrom, madeHead: P.recipe, madeWords: P.wordsHead, madeStyle: P.madeStyle, madeModel: P.madeModel, madeFrom: P.madeFrom, madePrompt: P.madePrompt, madeFull: P.madeFull, shareHead: P.shareHead, copy: P.copy, copied: P.copied, thenSubmit: exampleSubmit ? CW.exampleSubmitHead : P.thenSubmit, on: { farcaster: CW.submitPostOn('Farcaster'), bluesky: CW.submitPostOn('Bluesky'), lens: CW.submitPostOn('Lens') } },
  };
}
export type PictureView = NonNullable<Awaited<ReturnType<typeof pictureView>>>;
