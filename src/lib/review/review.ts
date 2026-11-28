import 'server-only';
import type postgres from 'postgres';
import { formatEther } from 'viem';
import { isAdmin } from '../admins';
import { BOUNTY_REVIEW as B, IMAGES } from '../config';
import { bookCharacter } from '../images/designs';
import { byline } from '../images/byline';
import { callNameOf } from '../challenge/names';
import { challengePictures, type ChallengePicture } from '../challenge/pictures';
import { entryHref, notEnteredAll, standing, type NotEntered, type Standing } from '../challenge/entries';
import { backstoryOf } from '../challenge/backstories';
import { linkedTo } from '../wallet/credit';
import { configLink } from '../wallet/links';
import { onChain, type OnChain, type Reader } from './chain';
import { hintsFor, linkedFiles, linkedPages, readRules, type LinkedPicture } from './rules';
import { basescanAddress, blueskyProfile, farcasterProfile, lensProfile, poidhAccount, tokenUriHref } from './links';
import { isSocialPerson, isWalletPerson, socialAccountOf, walletAccountOf } from '../people';
import { isKind, isLabel, LABELS, type ClaimCard, type EntryCard, type InlineView, type Kind, type LabelKey, type Marks, type NotEnteredCard, type PostSlot, type ReviewView } from './types';
import { postRefsIn, postView, profilesByAddress, storedRef } from './inline';

/**
 * /admin/bounty's answers (owner, 2026-11-23; branch bounty-review). Admins only: everyone else gets 404 before
 * anything is read, on Base or in the database. The bounty's claims are read on Base each time (src/lib/review/chain.ts,
 * cached a minute), never stored; the labels and notes are the admins' own, private (P5: no public page, feed, agent
 * tool or API reads studio.review_*; npm run test:bounty-review scans every file). It sorts newest first, under P5b's
 * exception for admin-only pages. It publishes nothing and changes nothing anyone else sees.
 */
type Sql = postgres.Sql;
/** The challenge's entries; tests pass their own. */
export type EntriesOf = (sql: Sql) => Promise<Pick<Standing, 'entries'>>;
export type Answer<T> = { status: 200; body: T } | { status: 400 | 404 | 409 | 503; body: { error: string } };

const missing = (e: unknown) => (e as { code?: string })?.code === '42P01';
export const claimSubject = (claimId: number, bountyId: number = B.bountyId) => `${bountyId}:${claimId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Which Base reader answers, as words: the address only when it is Base's own (a BASE_RPC_URL may hold a key). */
export const rpcInUse = () => (process.env.BASE_RPC_URL ? 'BASE_RPC_URL (set for this deployment)' : IMAGES.prepaid.rpcUrl);

/** Names the site knows for these FIDs, from their own published work (no outside lookup). */
async function namesOf(sql: Sql, fids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const want = [...new Set(fids.filter((f) => Number.isSafeInteger(f) && f > 0))];
  if (!want.length) return out;
  const rows = await sql<{ fid: string; name: string }[]>`
    select distinct on (e.created_by_fid) e.created_by_fid::text as fid, coalesce(r.params->>'by_name', v.body->>'by_name') as name
    from studio.elements e
    join studio.element_versions v on v.element_id = e.id
    left join studio.recipes r on r.id = v.recipe_id
    where e.created_by_fid in ${sql(want)} and coalesce(r.params->>'by_name', v.body->>'by_name') is not null
    order by e.created_by_fid, v.created_at desc`;
  for (const r of rows) out.set(Number(r.fid), r.name);
  return out;
}

/** For each claimer address: the FID the site shows its work under (a linked wallet account, or the config's links). */
async function fidsOfAddresses(sql: Sql, addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const want = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!want.length) return out;
  let accounts: { id: number; address: string }[] = [];
  try {
    accounts = (await sql`select id::int as id, address from studio.wallet_accounts where address in ${sql(want)}`) as unknown as typeof accounts;
  } catch (e) {
    if (!missing(e)) throw e;
  }
  const linked = await linkedTo(sql, accounts.map((a) => -a.id));
  for (const a of accounts) {
    const fid = linked.get(-a.id);
    if (fid) out.set(a.address, fid);
  }
  for (const a of want) if (!out.has(a)) {
    const fid = configLink(a);
    if (fid) out.set(a, fid);
  }
  return out;
}

/** The labels and notes on these subjects, with who set each. */
async function marksOf(sql: Sql, kind: Kind): Promise<{ ready: boolean; marks: Map<string, Marks>; fids: number[] }> {
  const marks = new Map<string, Marks>();
  const get = (s: string) => marks.get(s) ?? (marks.set(s, { labels: [], note: null }), marks.get(s)!);
  try {
    const labels = await sql<{ subject: string; label: LabelKey; set_by: string; set_at: Date }[]>`
      select subject, label, set_by::text, set_at from studio.review_labels where kind = ${kind}`;
    const notes = await sql<{ subject: string; note: string; set_by: string; set_at: Date }[]>`
      select subject, note, set_by::text, set_at from studio.review_notes where kind = ${kind}`;
    const order = LABELS.map((l) => l.key as string);
    for (const l of labels) get(l.subject).labels.push({ label: l.label, by: l.set_by, at: new Date(l.set_at).toISOString() });
    for (const m of marks.values()) m.labels.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    for (const n of notes) get(n.subject).note = { text: n.note, by: n.set_by, at: new Date(n.set_at).toISOString() };
    return { ready: true, marks, fids: [...labels, ...notes].map((r) => Number(r.set_by)) };
  } catch (e) {
    if (missing(e)) return { ready: false, marks, fids: [] };
    throw e;
  }
}
const named = (m: Marks | undefined, names: Map<number, string>): Marks => {
  const who = (fid: string) => byline(names.get(Number(fid)) ?? null, Number(fid));
  return { labels: (m?.labels ?? []).map((l) => ({ ...l, by: who(l.by) })), note: m?.note ? { ...m.note, by: who(m.note.by) } : null };
};

const linkedPicture = (p: ChallengePicture): LinkedPicture => {
  const c = bookCharacter(p.character);
  return { versionId: p.versionId, character: p.character, characterName: callNameOf(c?.name ?? p.character), byFid: p.byFid, byName: p.byName, href: entryHref(p.versionId) };
};

/** The claim cards, newest first, with their hints and labels. */
export function claimCards(chainRead: OnChain, pictures: ChallengePicture[], fidOf: Map<string, number>, names: Map<number, string>, marks: Map<string, Marks>): ClaimCard[] {
  const rules = readRules(chainRead.bounty.description, chainRead.bounty.createdAt);
  const byVersion = new Map(pictures.map((p) => [p.versionId, p]));
  const byFile = new Map(pictures.filter((p) => p.thumb).map((p) => [p.thumb!, p]));
  // Each address's claims, oldest first: the claim's place among them.
  const seen = new Map<string, number>();
  const nth = new Map<number, number>();
  for (const c of [...chainRead.claims].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)) {
    seen.set(c.issuer, (seen.get(c.issuer) ?? 0) + 1);
    nth.set(c.id, seen.get(c.issuer)!);
  }
  return [...chainRead.claims]
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    .map((c) => {
      const pages = linkedPages(c.description);
      const found = [...pages.map((v) => byVersion.get(v)), ...linkedFiles(c.description, c.uri).map((f) => byFile.get(f))].filter((p): p is ChallengePicture => Boolean(p));
      const linked = [...new Map(found.map((p) => [p.versionId, linkedPicture(p)])).values()];
      const createdAt = new Date(c.createdAt * 1000).toISOString();
      const fid = fidOf.get(c.issuer);
      let host: string | null = null;
      try {
        host = c.uri ? (c.uri.startsWith('ipfs://') ? 'ipfs' : new URL(c.uri).hostname) : null;
      } catch {
        host = null;
      }
      return {
        kind: 'bounty_claim' as const,
        subject: claimSubject(c.id, chainRead.bounty.id),
        id: c.id,
        title: c.name,
        description: c.description,
        claimer: {
          address: c.issuer,
          name: fid ? byline(names.get(fid) ?? null, fid) : null,
          profile: fid ? farcasterProfile(fid, names.get(fid)) : null,
          basescan: basescanAddress(c.issuer),
          poidh: poidhAccount(c.issuer),
        },
        createdAt,
        accepted: c.accepted,
        pictureHost: host,
        pictureHref: tokenUriHref(c.uri, B.ipfsGateway),
        hasPicture: Boolean(c.uri),
        hints: hintsFor(rules, { description: c.description, createdAt }, { pages, pictures: linked }, { n: nth.get(c.id)!, of: seen.get(c.issuer)! }),
        linked,
        marks: named(marks.get(claimSubject(c.id, chainRead.bounty.id)), names),
      };
    });
}

/** The challenge's entries (not the admin examples), newest first, each with its labels. */
/** Where to see each maker: Farcaster for a FID, Basescan for a wallet account, Lens or Bluesky for theirs. */
async function profilesOf(sql: Sql, makers: { person: number; byName: string | null }[]): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  const wallets = [...new Set(makers.filter((m) => isWalletPerson(m.person)).map((m) => walletAccountOf(m.person)))];
  const socials = [...new Set(makers.filter((m) => isSocialPerson(m.person)).map((m) => socialAccountOf(m.person)))];
  const address = new Map<number, string>();
  const social = new Map<number, { kind: string; subject: string; handle: string | null }>();
  try {
    if (wallets.length) for (const r of await sql<{ id: number; address: string }[]>`select id::int as id, address from studio.wallet_accounts where id in ${sql(wallets)}`) address.set(r.id, r.address);
    if (socials.length) for (const r of await sql<{ id: number; kind: string; subject: string; handle: string | null }[]>`select id::int as id, kind, subject, handle from studio.social_accounts where id in ${sql(socials)}`) social.set(r.id, r);
  } catch (e) {
    if (!missing(e)) throw e;
  }
  for (const m of makers) {
    if (m.person > 0) out.set(m.person, farcasterProfile(m.person, m.byName));
    else if (isWalletPerson(m.person)) out.set(m.person, basescanAddress(address.get(walletAccountOf(m.person)) ?? ''));
    else if (isSocialPerson(m.person)) {
      const s = social.get(socialAccountOf(m.person));
      out.set(m.person, !s ? null : s.kind === 'lens' ? lensProfile(s.handle) : blueskyProfile(s.handle, s.subject));
    }
  }
  return out;
}

async function entryCards(sql: Sql, marks: Map<string, Marks>, names: Map<number, string>, entriesOf: EntriesOf): Promise<EntryCard[]> {
  const st = await entriesOf(sql);
  const profiles = await profilesOf(sql, st.entries.map((e) => ({ person: e.maker, byName: e.byName })));
  const ids = st.entries.map((e) => e.versionId);
  const bodies = new Map<string, { body: unknown; asset_url: string | null }>();
  if (ids.length) for (const r of await sql<{ id: string; body: unknown; asset_url: string | null }[]>`select id::text, body, asset_url from studio.element_versions where id in ${sql(ids)}`) bodies.set(r.id, r);
  return st.entries.map((e) => {
    const c = bookCharacter(e.character);
    const name = callNameOf(c?.name ?? e.character);
    const v = bodies.get(e.versionId);
    return {
      kind: 'challenge_entry' as const,
      subject: e.versionId,
      title: e.title || name,
      characterName: name,
      by: byline(e.byName, e.maker),
      byHref: profiles.get(e.maker) ?? null,
      createdAt: e.createdAt,
      image: e.thumb ?? v?.asset_url ?? null,
      href: entryHref(e.versionId),
      backstory: backstoryOf(v?.body)?.text ?? null,
      marks: named(marks.get(e.versionId), names),
    };
  });
}

/** A not-entered picture's eligibility, in words, for admins only. */
export function eligibilityWords(r: Pick<NotEntered, 'eligibility' | 'firstRemix'>): { eligible: boolean; words: string } {
  if (r.firstRemix) return { eligible: false, words: 'The owner’s first remix: never an entry' };
  const e = r.eligibility;
  if (e.eligible) return { eligible: true, words: e.why === 'invited' ? 'Eligible: invited' : 'Eligible: passed the check at publish' };
  if (e.why === 'admin') return { eligible: false, words: 'Admin: never an entry' };
  if (e.why === 'below') return { eligible: false, words: 'Not eligible: didn’t pass the check at publish' };
  if (e.why === 'not-a-farcaster-account') return { eligible: false, words: 'Not eligible: a wallet account' };
  return { eligible: false, words: 'Not eligible: not checked at publish (no answer, or no decision stored)' };
}

async function notEnteredCards(sql: Sql, entries: Pick<Standing, 'entries'>): Promise<NotEnteredCard[]> {
  const rows = await notEnteredAll(sql, entries);
  const profiles = await profilesOf(sql, rows.map((r) => ({ person: r.maker, byName: r.byName })));
  return rows.map((r) => {
    const c = bookCharacter(r.character);
    const name = callNameOf(c?.name ?? r.character);
    const e = eligibilityWords(r);
    const tags = [r.withdrawn ? 'Submitted, then withdrawn' : null, r.example ? 'Admin example (shown with the entries)' : null, r.forked ? null : 'Not a remix of a base: can’t be entered'].filter((t): t is string => Boolean(t));
    return { versionId: r.versionId, title: r.title || name, characterName: name, by: byline(r.byName, r.maker), byHref: profiles.get(r.maker) ?? null, createdAt: r.createdAt, image: r.thumb, href: entryHref(r.versionId), eligible: e.eligible, eligibility: e.words, tags };
  });
}

/** Everything the page shows. 404 unless an admin, before anything is read. */
export async function reviewView(sql: Sql | null, fid: number | null, opts: { reader?: Reader; fresh?: boolean; entriesOf?: EntriesOf } = {}): Promise<Answer<ReviewView>> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'Not available here' } };
  const [claimMarks, entryMarks] = [await marksOf(sql, 'bounty_claim'), await marksOf(sql, 'challenge_entry')];
  let chainRead: OnChain | null = null;
  let bountyError: string | null = null;
  try {
    chainRead = await onChain(opts);
  } catch (e) {
    bountyError = `The bounty couldn't be read on Base just now (${(e as Error).name}). Try again in a minute.`;
  }
  const pictures = chainRead ? await challengePictures(sql) : [];
  const fidOf = chainRead ? await fidsOfAddresses(sql, chainRead.claims.map((c) => c.issuer)) : new Map<string, number>();
  const names = await namesOf(sql, [...fidOf.values(), ...claimMarks.fids, ...entryMarks.fids]);
  const rules = chainRead ? readRules(chainRead.bounty.description, chainRead.bounty.createdAt) : null;
  const st = await (opts.entriesOf ?? standing)(sql);
  return {
    status: 200,
    body: {
      bounty: chainRead && rules ? {
        name: chainRead.bounty.name, poidhUrl: B.poidhUrl, amountEth: formatEther(BigInt(chainRead.bounty.amountWei)), settled: chainRead.bounty.claimer !== null,
        steps: rules.steps, rules: rules.rules, readAt: chainRead.readAt, rpc: rpcInUse(),
      } : null,
      bountyError,
      claims: chainRead ? claimCards(chainRead, pictures, fidOf, names, claimMarks.marks) : [],
      entries: await entryCards(sql, entryMarks.marks, names, () => Promise.resolve(st)),
      notEntered: await notEnteredCards(sql, st),
      labelsReady: claimMarks.ready && entryMarks.ready,
    },
  };
}

/** Whether a subject is one the page lists now: a claim on the bounty (read on Base), or a challenge entry. */
async function known(sql: Sql, kind: Kind, subject: string, reader: Reader | undefined, entriesOf: EntriesOf): Promise<boolean> {
  if (kind === 'bounty_claim') {
    const m = /^(\d+):(\d+)$/.exec(subject);
    if (!m || Number(m[1]) !== B.bountyId) return false;
    const read = await onChain({ reader });
    return read.claims.some((c) => c.id === Number(m[2]));
  }
  if (!UUID.test(subject)) return false;
  return (await entriesOf(sql)).entries.some((e) => e.versionId === subject);
}

export type Change = { kind: unknown; subject: unknown; label?: unknown; on?: unknown; note?: unknown };

/**
 * One admin's change: a label on or off, or the note set (an empty note clears it). Each is kept in studio.review_log
 * with who and when. 404 unless an admin, before anything is read.
 */
export async function changeMarks(sql: Sql | null, fid: number | null, c: Change, opts: { reader?: Reader; entriesOf?: EntriesOf } = {}): Promise<Answer<{ ok: true }>> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'Not available here' } };
  if (!isKind(c.kind) || typeof c.subject !== 'string') return { status: 400, body: { error: 'Say which claim or entry' } };
  const kind = c.kind;
  const subject = c.subject;
  const isNote = c.note !== undefined;
  if (!isNote && (!isLabel(c.label) || typeof c.on !== 'boolean')) return { status: 400, body: { error: 'A label (followed_directions, good or top) and on: true or false' } };
  const note = isNote ? (typeof c.note === 'string' ? c.note.trim() : null) : null;
  if (isNote && (note === null || note.length > B.noteMax)) return { status: 400, body: { error: `A note of at most ${B.noteMax} characters` } };
  try {
    if (!(await known(sql, kind, subject, opts.reader, opts.entriesOf ?? standing))) return { status: 404, body: { error: 'No such claim or entry' } };
  } catch {
    return { status: 503, body: { error: "The bounty couldn't be read on Base just now" } };
  }
  try {
    await sql.begin(async (tx) => {
      if (!isNote) {
        const label = c.label as LabelKey;
        const changed = c.on
          ? await tx`insert into studio.review_labels (kind, subject, label, set_by) values (${kind}, ${subject}, ${label}, ${fid}) on conflict do nothing returning label`
          : await tx`delete from studio.review_labels where kind = ${kind} and subject = ${subject} and label = ${label} returning label`;
        if (changed.length) await tx`insert into studio.review_log (kind, subject, change, label, by_fid) values (${kind}, ${subject}, ${c.on ? 'label_on' : 'label_off'}, ${label}, ${fid})`;
      } else if (note) {
        await tx`insert into studio.review_notes (kind, subject, note, set_by) values (${kind}, ${subject}, ${note}, ${fid})
          on conflict (kind, subject) do update set note = excluded.note, set_by = excluded.set_by, set_at = now()`;
        await tx`insert into studio.review_log (kind, subject, change, note, by_fid) values (${kind}, ${subject}, 'note_set', ${note}, ${fid})`;
      } else {
        const gone = await tx`delete from studio.review_notes where kind = ${kind} and subject = ${subject} returning subject`;
        if (gone.length) await tx`insert into studio.review_log (kind, subject, change, by_fid) values (${kind}, ${subject}, 'note_cleared', ${fid})`;
      }
    });
  } catch (e) {
    if (missing(e)) return { status: 503, body: { error: 'Labels can’t be saved yet: the review tables aren’t on this database.' } };
    throw e;
  }
  return { status: 200, body: { ok: true } };
}

/** A claim's picture for an admin: its tokenURI read on Base now (never from the request), then fetched with the guards. */
export async function claimPictureFor(fid: number | null, claimParam: string | null, deps: { reader?: Reader; picture: (uri: string) => Promise<{ jpeg: Buffer } | null> }): Promise<{ status: 200; jpeg: Buffer } | { status: 400 | 404 | 502 | 503; error: string }> {
  if (!isAdmin(fid)) return { status: 404, error: 'Not found' };
  const id = Number(claimParam);
  if (!Number.isSafeInteger(id) || id < 0) return { status: 400, error: 'Say which claim' };
  let read: OnChain;
  try {
    read = await onChain({ reader: deps.reader });
  } catch {
    return { status: 503, error: "The bounty couldn't be read on Base just now" };
  }
  const claim = read.claims.find((c) => c.id === id);
  if (!claim) return { status: 404, error: 'No such claim on this bounty' };
  if (!claim.uri) return { status: 404, error: 'This claim names no picture' };
  const pic = await deps.picture(claim.uri);
  return pic ? { status: 200, jpeg: pic.jpeg } : { status: 502, error: 'Picture not readable' };
}

/** Run `fn` over `items`, a few at a time (the networks are asked politely). */
async function inBatches<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/**
 * The live part of the page (owner, 2026-11-27; the principle 6 exception for /admin/bounty): each claimer's Farcaster
 * profile (by their address), the posts each claim's description links, and the posts each entry's maker added, read
 * from their networks now (src/lib/review/inline.ts; 5 minutes in memory, never stored). 404 unless an admin, before
 * anything is read.
 */
export async function inlineView(sql: Sql | null, fid: number | null, opts: { reader?: Reader; entriesOf?: EntriesOf; fetcher?: typeof fetch } = {}): Promise<Answer<InlineView>> {
  if (!isAdmin(fid)) return { status: 404, body: { error: 'Not found' } };
  if (!sql) return { status: 503, body: { error: 'Not available here' } };
  const f = opts.fetcher ?? fetch;
  let chainRead: OnChain | null = null;
  try {
    chainRead = await onChain({ reader: opts.reader });
  } catch {
    chainRead = null;
  }
  const claims: InlineView['claims'] = {};
  let farcasterNote: string | null = null;
  if (chainRead) {
    const { profiles, note } = await profilesByAddress(chainRead.claims.map((c) => c.issuer), f);
    farcasterNote = note;
    const posts = await inBatches(chainRead.claims, 4, async (c) => inBatches(postRefsIn(c.description), 2, (ref) => postView(ref, f)));
    chainRead.claims.forEach((c, i) => {
      claims[claimSubject(c.id, chainRead!.bounty.id)] = { profile: profiles.get(c.issuer) ?? null, posts: posts[i] };
    });
  }
  const st = await (opts.entriesOf ?? standing)(sql);
  const ids = st.entries.map((e) => e.versionId);
  type Stored = { version_id: string; network: string; post_id: string; url: string };
  let rows: Stored[] = [];
  if (ids.length) {
    try {
      rows = [...(await sql<Stored[]>`select version_id::text, network, post_id, url from studio.version_posts where version_id in ${sql(ids)} order by added_at, id`)];
    } catch (e) {
      if (!missing(e)) throw e;
    }
  }
  const entries: InlineView['entries'] = {};
  const byVersion = new Map<string, Stored[]>();
  for (const r of rows) byVersion.set(r.version_id, [...(byVersion.get(r.version_id) ?? []), r]);
  const entryPosts = await inBatches(ids, 4, async (v) => {
    const refs = (byVersion.get(v) ?? []).slice(0, 3).map((r) => storedRef(r.network, r.post_id, r.url)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    return inBatches(refs, 2, (ref) => postView(ref, f)) as Promise<PostSlot[]>;
  });
  ids.forEach((v, i) => (entries[v] = { posts: entryPosts[i] }));
  if (!farcasterNote && [...Object.values(entries), ...Object.values(claims)].some((x) => x.posts.some((p) => !p.ok && /Neynar key/.test(p.why)))) farcasterNote = 'Farcaster posts and profiles can’t be read on this deployment (no Neynar key).';
  return { status: 200, body: { claims, entries, farcasterNote, readAt: new Date().toISOString() } };
}
