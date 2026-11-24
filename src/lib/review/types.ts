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
  claimer: { address: string; name: string | null };
  createdAt: string;
  accepted: boolean;
  /** Where its picture was named (the tokenURI's host), shown as text; the picture itself comes through the site. */
  pictureHost: string | null;
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
  createdAt: string;
  /** The entry's picture on this site. */
  image: string | null;
  href: string;
  backstory: string | null;
  marks: Marks;
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
  /** The tables aren't on this database yet: labels can't be saved. */
  labelsReady: boolean;
}
