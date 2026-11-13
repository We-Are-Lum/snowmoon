import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import type { Hash, PublicClient } from 'viem';
import { POIDH, POIDH_BOUNTY_ID } from '../config';
import { POIDH_ABI } from './abi';
import { claimDescription, claimIdFromLogs, claimMetadata, claimsUsed, claimTitle, createClaimData, issuerOk, type ClaimRow } from './claim';
import { BOUNTY_WORDING as W } from './wording';

/**
 * Submitting a challenge picture's backstory to the poidh bounty (owner, 2026-11-12; branch challenge-backstory-bounty;
 * ported from warplore's comic bounty: lib/comic/store.ts pinComic and lib/comic/sync.ts recordEntry). Two steps, both
 * for the picture's maker only:
 *  1. prepareClaim: PINATA_JWT set, fewer than POIDH.claimsPerPerson claims used, bounties(POIDH_BOUNTY_ID) read on Base
 *     again with its issuer POIDH_BOUNTY_ISSUER; then the picture (its stored bytes, sha256 checked) and the record JSON
 *     are pinned, a row is kept in studio.challenge_bounty_claims, and createClaim's calldata goes back for the maker's
 *     own wallet to send. No gas is sponsored.
 *  2. recordClaim: the wallet's transaction hash is kept at once; its receipt is read (up to POIDH.receiptWaitMs) and
 *     the ClaimCreated for this bounty and this record's URI gives the claim's id; on a timeout the hash stays and the
 *     answer is 202.
 * Nothing here calls a model: the claim's words are the character's name, the picture's title and the maker's own
 * backstory (already checked by the prompt guard when it was saved), and the page's link.
 */
type Sql = postgres.Sql;
export type Reader = Pick<PublicClient, 'readContract' | 'waitForTransactionReceipt'>;
export interface Pinner {
  ready: () => boolean;
  file: (bytes: Uint8Array, name: string, type: string) => Promise<{ ok: true; cid: string; url: string } | { ok: false; error: string }>;
  json: (content: unknown, name: string) => Promise<{ ok: true; cid: string; url: string } | { ok: false; error: string }>;
}
export type ImageReader = (url: string, sha256: string) => Promise<{ bytes: Uint8Array; type: string; ext: string } | null>;

type Fail = { ok: false; status: number; error: string };

/** bounties(POIDH_BOUNTY_ID), read on Base now (never cached): is its issuer the owner's wallet? */
export async function bountyIsOwners(reader: Reader): Promise<boolean> {
  try {
    const b = await reader.readContract({ address: POIDH.core, abi: POIDH_ABI, functionName: 'bounties', args: [BigInt(POIDH_BOUNTY_ID)] });
    return issuerOk((b as readonly unknown[])[1] as string);
  } catch {
    return false;
  }
}

/** The person's claim rows for this bounty, as the cap reads them. */
async function rowsOf(sql: Sql, person: number): Promise<(ClaimRow & { id: string; versionId: string; description: string; imageUrl: string; uri: string; title: string })[]> {
  const rows = await sql<{ id: string; version_id: string; tx_hash: string | null; outcome: 'confirmed' | 'reverted' | null; pinned_at: Date; description: string; image_url: string; metadata_uri: string; title: string }[]>`
    select id::text, version_id::text, tx_hash, outcome, pinned_at, description, image_url, metadata_uri, title
    from studio.challenge_bounty_claims where bounty_id = ${POIDH_BOUNTY_ID} and fid = ${person} order by pinned_at, id`;
  return rows.map((r) => ({ id: r.id, versionId: r.version_id, txHash: r.tx_hash, outcome: r.outcome, pinnedAt: new Date(r.pinned_at).toISOString(), description: r.description, imageUrl: r.image_url, uri: r.metadata_uri, title: r.title }));
}

/** What the picture's page shows its maker: their claims on this picture, and how many are left across all. */
export async function claimsView(sql: Sql, person: number, versionId: string, now: Date = new Date()) {
  const rows = await sql<{ id: string; version_id: string; tx_hash: string | null; outcome: 'confirmed' | 'reverted' | null; claim_id: string | null; pinned_at: Date }[]>`
    select id::text, version_id::text, tx_hash, outcome, claim_id::text, pinned_at
    from studio.challenge_bounty_claims where bounty_id = ${POIDH_BOUNTY_ID} and fid = ${person} order by pinned_at, id`;
  const asRows: ClaimRow[] = rows.map((r) => ({ txHash: r.tx_hash, outcome: r.outcome, pinnedAt: new Date(r.pinned_at).toISOString() }));
  return {
    left: Math.max(0, POIDH.claimsPerPerson - claimsUsed(asRows, now)),
    max: POIDH.claimsPerPerson,
    mine: rows.filter((r) => r.version_id === versionId && r.tx_hash).map((r) => ({ id: r.id, txHash: r.tx_hash!, claimId: r.claim_id, outcome: r.outcome })),
  };
}

/** A picture to submit: what the claim says and where its bytes are. */
export interface ClaimPicture {
  versionId: string;
  name: string;
  pictureTitle: string | null;
  imageUrl: string;
  imageSha256: string;
  backstory: { id: string | null; text: string };
}
export type Prepared = { ok: true; id: string; title: string; description: string; uri: string; to: `0x${string}`; data: `0x${string}`; chainId: number; bountyId: number };

export async function prepareClaim(deps: { sql: Sql; reader: Reader; pin: Pinner; readImage: ImageReader; now?: Date }, person: number, pic: ClaimPicture): Promise<Prepared | Fail> {
  const { sql, reader, pin } = deps;
  const now = deps.now ?? new Date();
  // Not set up: nothing read on Base, nothing fetched, nothing kept.
  if (!pin.ready()) return { ok: false, status: 503, error: W.notSetUp };
  const title = claimTitle(pic.name, pic.pictureTitle);
  const description = claimDescription(pic.backstory.text, pic.versionId);
  const rows = await rowsOf(sql, person);
  const sameWords = rows.filter((r) => r.versionId === pic.versionId && r.description === description && r.title === title);
  const open = sameWords.find((r) => !r.txHash);
  if (claimsUsed(rows, now, open ?? null) >= POIDH.claimsPerPerson) return { ok: false, status: 429, error: W.none(POIDH.claimsPerPerson) };
  // The bounty must be the owner's, read again now, before anything is pinned or sent.
  if (!(await bountyIsOwners(reader))) return { ok: false, status: 503, error: W.notOwners };
  const answer = (id: string, uri: string): Prepared => ({ ok: true, id, title, description, uri, to: POIDH.core, data: createClaimData({ title, description, uri }), chainId: POIDH.chainId, bountyId: POIDH_BOUNTY_ID });
  // The same words, not yet sent: the same row again (a retry after a cancel). Pinned before and sent: a new row, no new pin.
  if (open) return answer(open.id, open.uri);
  let imageUrl: string, uri: string;
  const before = sameWords[0];
  if (before) ({ imageUrl, uri } = before);
  else {
    if (new Set(rows.map((r) => r.uri)).size >= POIDH.pinsPerPerson) return { ok: false, status: 429, error: W.tooManyPins };
    const img = await deps.readImage(pic.imageUrl, pic.imageSha256);
    if (!img) return { ok: false, status: 502, error: W.imageUnread };
    const file = await pin.file(img.bytes, `snowmoon-${pic.versionId}.${img.ext}`, img.type);
    if (!file.ok) return { ok: false, status: file.error === 'not-set-up' ? 503 : 502, error: file.error === 'not-set-up' ? W.notSetUp : W.pinFailed };
    const json = await pin.json(claimMetadata({ title, description, image: file.url, versionId: pic.versionId }), `snowmoon-${pic.versionId}.json`);
    if (!json.ok) return { ok: false, status: 502, error: W.pinFailed };
    imageUrl = file.url;
    uri = json.url;
  }
  const [r] = await sql<{ id: string }[]>`
    insert into studio.challenge_bounty_claims (bounty_id, version_id, fid, backstory_id, title, description, image_url, metadata_uri)
    values (${POIDH_BOUNTY_ID}, ${pic.versionId}, ${person}, ${pic.backstory.id}, ${title}, ${description}, ${imageUrl}, ${uri})
    returning id::text`;
  return answer(r.id, uri);
}

export type Recorded = { ok: true; status: 200; claimId: string } | { ok: false; status: 202; error: string; txHash: string } | Fail;

export async function recordClaim(deps: { sql: Sql; reader: Reader; waitMs?: number }, person: number, rowId: string, tx: `0x${string}`): Promise<Recorded> {
  const { sql, reader } = deps;
  const [row] = await sql<{ id: string; tx_hash: string | null; claim_id: string | null; metadata_uri: string; bounty_id: string; outcome: string | null }[]>`
    select id::text, tx_hash, claim_id::text, metadata_uri, bounty_id::text, outcome from studio.challenge_bounty_claims where id = ${rowId} and fid = ${person}`;
  if (!row) return { ok: false, status: 404, error: 'Not found' };
  if (row.claim_id) return { ok: true, status: 200, claimId: row.claim_id };
  if (row.tx_hash && row.tx_hash !== tx) return { ok: false, status: 409, error: 'This claim was already sent in another transaction.' };
  if (!row.tx_hash) {
    try {
      const set = await sql`update studio.challenge_bounty_claims set tx_hash = ${tx}, sent_at = now() where id = ${rowId} and tx_hash is null returning id`;
      if (!set.length) return { ok: false, status: 409, error: 'This claim was already sent in another transaction.' };
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') return { ok: false, status: 409, error: 'That transaction is already recorded.' };
      throw e;
    }
  }
  let receipt;
  try {
    receipt = await reader.waitForTransactionReceipt({ hash: tx as Hash, timeout: deps.waitMs ?? POIDH.receiptWaitMs });
  } catch {
    return { ok: false, status: 202, error: W.pendingConfirm, txHash: tx };
  }
  if (receipt.status !== 'success') {
    await sql`update studio.challenge_bounty_claims set outcome = 'reverted', confirmed_at = now() where id = ${rowId} and outcome is null`;
    return { ok: false, status: 409, error: W.failedOnChain };
  }
  const id = claimIdFromLogs(receipt.logs as never, { bountyId: Number(row.bounty_id), uri: row.metadata_uri });
  if (id === null) return { ok: false, status: 202, error: W.notInTx, txHash: tx };
  const from = typeof receipt.from === 'string' && /^0x[0-9a-fA-F]{40}$/.test(receipt.from) ? receipt.from.toLowerCase() : null;
  await sql`update studio.challenge_bounty_claims set claim_id = ${id.toString()}, outcome = 'confirmed', confirmed_at = now(), wallet = ${from} where id = ${rowId} and claim_id is null`;
  return { ok: true, status: 200, claimId: id.toString() };
}

/** The picture's stored bytes: fetched from its own asset URL, and only if their sha256 is the one recorded at publish. */
export const readStoredImage: ImageReader = async (url, sha256) => {
  if (!/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== sha256.toLowerCase()) return null;
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, type: 'image/jpeg', ext: 'jpg' };
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { bytes, type: 'image/png', ext: 'png' };
    if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { bytes, type: 'image/webp', ext: 'webp' };
    return null;
  } catch {
    return null;
  }
};
