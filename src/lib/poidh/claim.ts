import { decodeEventLog, encodeFunctionData, type Hex } from 'viem';
import { POIDH, POIDH_BOUNTY_ID, POIDH_BOUNTY_ISSUER } from '../config';
import { POIDH_ABI } from './abi';

/**
 * A backstory's claim on the poidh bounty (owner, 2026-11-12; branch challenge-backstory-bounty): what it says, how many
 * a person may send through the app, and how its receipt is read. Pure (no network, no database): the routes, the
 * picture's page and scripts/test-backstory-bounty.ts read the same functions. No model is called anywhere here: the
 * title is the character's call name and the picture's moment, the description is the maker's own backstory and the
 * picture's page link.
 */

/** The picture's page as the claim links it: always the live site, never a preview's or localhost's address. */
export const SITE = 'https://snowmoon.party';
export const picturePage = (versionId: string) => `${SITE}/challenge/p/${versionId}`;

/** "{Name}: {picture title}", or just "{Name}" when the picture has no title (no moment shown). */
export function claimTitle(name: string, pictureTitle: string | null | undefined): string {
  const t = (pictureTitle ?? '').trim();
  return t ? `${name}: ${t}` : name;
}

/** The backstory, a blank line, then the picture's page link; cut to POIDH.descriptionMax characters (the link kept whole when it fits). */
export function claimDescription(backstory: string, versionId: string, max: number = POIDH.descriptionMax): string {
  const link = picturePage(versionId);
  const text = backstory.trim();
  const whole = `${text}\n\n${link}`;
  if ([...whole].length <= max) return whole;
  // Too long: shorten the backstory, keep the link (the claim always leads back to its picture).
  const room = max - [...`…\n\n${link}`].length;
  if (room <= 0) return [...whole].slice(0, max).join('');
  return `${[...text].slice(0, room).join('').trimEnd()}…\n\n${link}`;
}

/** The pinned record's JSON (the claim NFT's metadata, in poidh's own form). */
export function claimMetadata(a: { title: string; description: string; image: string; versionId: string }) {
  return { name: a.title, description: a.description, image: a.image, external_url: picturePage(a.versionId) };
}

/** createClaim's calldata, for the maker's wallet to send to POIDH.core. */
export const createClaimData = (a: { bountyId?: number; title: string; description: string; uri: string }): Hex =>
  encodeFunctionData({ abi: POIDH_ABI, functionName: 'createClaim', args: [BigInt(a.bountyId ?? POIDH_BOUNTY_ID), a.title, a.description, a.uri] });

/** A person's claim rows, as the cap reads them. */
export interface ClaimRow {
  txHash: string | null;
  outcome: 'confirmed' | 'reverted' | null;
  pinnedAt: string;
}

/**
 * How many of the person's POIDH.claimsPerPerson claims are used: every claim sent through the app (a transaction
 * recorded) that didn't fail on Base, plus every pin not yet sent from the last POIDH.pendingMinutes (so three open pins
 * can't become a fourth claim). Claims made on poidh.xyz itself aren't counted.
 */
export function claimsUsed(rows: readonly ClaimRow[], now: Date = new Date(), except: ClaimRow | null = null): number {
  const since = now.getTime() - POIDH.pendingMinutes * 60_000;
  return rows.filter((r) => r !== except && (r.txHash ? r.outcome !== 'reverted' : Date.parse(r.pinnedAt) >= since)).length;
}
export const claimsLeft = (rows: readonly ClaimRow[], now: Date = new Date()) => Math.max(0, POIDH.claimsPerPerson - claimsUsed(rows, now));

/** Is this the owner's bounty? bounties(id).issuer must equal POIDH_BOUNTY_ISSUER (any case); the zero address is no bounty. */
export function issuerOk(issuer: string | null | undefined, want: string = POIDH_BOUNTY_ISSUER): boolean {
  return typeof issuer === 'string' && /^0x[0-9a-fA-F]{40}$/.test(issuer) && !/^0x0{40}$/.test(issuer) && issuer.toLowerCase() === want.toLowerCase();
}

/** One log of a receipt, as viem gives it. */
export interface ReceiptLog {
  address: string;
  data: Hex;
  topics: readonly Hex[];
}

/**
 * The claim's id from its receipt: the ClaimCreated that POIDH.core emitted for this bounty and this record's URI. Null
 * when there is none (a smart wallet's hash that isn't the final transaction, or another contract's log).
 */
export function claimIdFromLogs(logs: readonly ReceiptLog[], want: { bountyId: number; uri: string; core?: string }): bigint | null {
  const core = (want.core ?? POIDH.core).toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== core) continue;
    try {
      const ev = decodeEventLog({ abi: POIDH_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName !== 'ClaimCreated') continue;
      if (ev.args.bountyId !== BigInt(want.bountyId) || ev.args.imageUri !== want.uri) continue;
      return ev.args.id;
    } catch {
      continue;
    }
  }
  return null;
}

/** A wallet's address as kept: lowercase 0x and 40 hex digits; null for anything else. */
export const walletAddress = (x: unknown): `0x${string}` | null => (typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x.trim()) ? (x.trim().toLowerCase() as `0x${string}`) : null);
/** A transaction hash as kept: lowercase; null for anything else. */
export const txHash = (x: unknown): `0x${string}` | null => (typeof x === 'string' && /^0x[0-9a-fA-F]{64}$/.test(x.trim()) ? (x.trim().toLowerCase() as `0x${string}`) : null);
