import type { Hint, LinkedPicture } from './rules';

/**
 * What /admin/bounty shows (owner, 2026-11-23; branch bounty-review). Client-safe types and the three labels. Labels
 * and notes are private to admins (P5): only the admin routes under /api/admin/bounty read or write them.
 */
export const LABELS = [
  { key: 'followed_directions', name: 'Followed directions' },
  { key: 'good', name: 'Good' },
  { key: 'top', name: 'Top' },
] as const;
export type LabelKey = (typeof LABELS)[number]['key'];
export const isLabel = (x: unknown): x is LabelKey => LABELS.some((l) => l.key === x);

export type Kind = 'bounty_claim' | 'challenge_entry';
export const isKind = (x: unknown): x is Kind => x === 'bounty_claim' || x === 'challenge_entry';

/** Filters: all, unlabelled, or one label. */
export const FILTERS = ['all', 'unlabelled', 'followed_directions', 'good', 'top'] as const;
export type Filter = (typeof FILTERS)[number];

export interface Marks {
  labels: { label: LabelKey; by: string; at: string }[];
  note: { text: string; by: string; at: string } | null;
}

export interface ClaimCard {
  kind: 'bounty_claim';
  subject: string;
  id: number;
  title: string;
  description: string;
  /** The claimer: their site name when the site links the wallet; where to see them (Farcaster, Basescan, poidh). */
  claimer: { address: string; name: string | null; profile: string | null; basescan: string | null; poidh: string | null };
  createdAt: string;
  accepted: boolean;
  /** Where its picture was named (the tokenURI's host), shown as text; the picture itself comes through the site. */
  pictureHost: string | null;
  /** The claim's original picture (its tokenURI; ipfs:// through the public gateway), as a link; null if not http(s). */
  pictureHref: string | null;
  hasPicture: boolean;
  hints: Hint[];
  linked: LinkedPicture[];
  marks: Marks;
}

export interface EntryCard {
  kind: 'challenge_entry';
  subject: string;
  title: string;
  characterName: string;
  by: string;
  /** The maker's profile: Farcaster, Lens or Bluesky, or Basescan for a wallet account; null when there is none. */
  byHref: string | null;
  createdAt: string;
  /** The entry's picture on this site. */
  image: string | null;
  href: string;
  backstory: string | null;
  marks: Marks;
}

/**
 * "Published, not entered" (2026-11-27): a challenge picture published in the window that isn't an entry now (never
 * submitted, or withdrawn), with what only admins see: the eligibility decided at publish, as words.
 */
export interface NotEnteredCard {
  versionId: string;
  title: string;
  characterName: string;
  by: string;
  byHref: string | null;
  createdAt: string;
  image: string | null;
  href: string;
  /** Whether its maker's picture could be entered, as decided at publish (admins and first remixes never). */
  eligible: boolean;
  /** The eligibility in words ("Eligible: passed the check at publish", "Admin: never an entry", …). */
  eligibility: string;
  /** Other facts: withdrawn, an admin example, not a remix of a base. */
  tags: string[];
}

export interface ReviewView {
  bounty: {
    name: string;
    poidhUrl: string;
    amountEth: string;
    settled: boolean;
    steps: string[];
    rules: string[];
    readAt: string;
    /** Which Base reader answered (an address of ours or Base's own; never a key). */
    rpc: string;
  } | null;
  /** Why the bounty couldn't be read, when it couldn't. */
  bountyError: string | null;
  claims: ClaimCard[];
  entries: EntryCard[];
  /** "Published, not entered", newest first; its length is the count shown at the top of the list. */
  notEntered: NotEnteredCard[];
  /** The tables aren't on this database yet: labels can't be saved. */
  labelsReady: boolean;
}

/**
 * A post or profile read live for /admin/bounty (owner, 2026-11-27; branch bounty-inline): read from the post's own
 * network when an admin opens the page, kept in memory for 5 minutes, never stored. No like, recast, reply or follower
 * count is ever read into these. Pictures are signed addresses of the admin media route (/api/admin/bounty/media),
 * never the network's own address.
 */
export type InlineNetwork = 'farcaster' | 'bluesky' | 'lens';
export interface ProfileView {
  network: InlineNetwork;
  /** The display name, if the account has one. */
  name: string | null;
  /** The handle (Farcaster username, Bluesky handle, Lens username). */
  handle: string | null;
  bio: string | null;
  /** A media route address for the profile picture, or null. */
  picture: string | null;
  /** The profile on its network. */
  url: string | null;
}
export interface PostView {
  network: InlineNetwork;
  /** The post on its network (rebuilt from its checked parts). */
  url: string;
  at: string;
  text: string;
  /** Media route addresses for its pictures, at most four. */
  pictures: string[];
  author: ProfileView | null;
}
export type PostSlot = { ok: true; post: PostView } | { ok: false; why: string; url: string | null };
export interface InlineView {
  /** By claim subject ("560:<id>"): the claimer's Farcaster profile (by their address) and the posts their description links. */
  claims: Record<string, { profile: ProfileView | null; posts: PostSlot[] }>;
  /** By entry (version id): the posts its maker added (the submitted one first). */
  entries: Record<string, { posts: PostSlot[] }>;
  /** Why Farcaster couldn't be read here (no Neynar key on this deployment), when that is so. */
  farcasterNote: string | null;
  readAt: string;
}
