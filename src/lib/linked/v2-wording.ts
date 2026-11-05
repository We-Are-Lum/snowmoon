/**
 * Linked accounts v2: the refusals' words. DRAFT, not reread by the owner (docs/legal/linked-accounts-v2-wording.md).
 * Mostly the design's own drafts (docs/proposals/linked-accounts-v2.md, "Site words"). Drafted by a coding agent
 * (Claude, a closed model by Anthropic). Shown only while LINKED_ACCOUNTS.enabled is on.
 */
export type V2Why =
  | 'off'
  | 'not-linked'
  | 'not-main'
  | 'is-main'
  | 'only-main-cancels'
  | 'last-sign-in'
  | 'has-account'
  | 'kind-taken'
  | 'wallets'
  | 'attempts'
  | 'wait-start'
  | 'wait-join'
  | 'moves'
  | 'pending'
  | 'no-request'
  | 'same-account'
  | 'social-only'
  | 'payment-address';

const day = (d?: Date) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Los_Angeles' }) : 'later';

export const V2_REFUSALS: Record<V2Why, (until?: Date) => string> = {
  off: () => 'Linking accounts isn\'t open yet.',
  'not-linked': () => 'That sign-in isn\'t part of your Snowmoon account.',
  'not-main': () => 'Only your main sign-in can do that.',
  'is-main': () => 'This is already your main sign-in.',
  'only-main-cancels': () => 'Only your main sign-in can cancel this request.',
  'last-sign-in': () => 'This is your Snowmoon account\'s only sign-in.',
  'has-account': () => 'That sign-in is part of another Snowmoon account. To join the two, sign in with the main sign-in of each.',
  'kind-taken': () => 'Your Snowmoon account already has an account on that network.',
  wallets: () => 'Your Snowmoon account already has 3 wallets.',
  attempts: () => 'Too many tries to link today. Try again tomorrow.',
  'wait-start': (u) => `This sign-in left a Snowmoon account recently. It can join another or start a new one from ${day(u)}.`,
  'wait-join': (u) => `This sign-in left a Snowmoon account recently. It can join another Snowmoon account, or start one, from ${day(u)}.`,
  moves: (u) => `This account has moved between Snowmoon accounts twice this year. It can move again from ${day(u)}.`,
  pending: () => 'A request for a new main sign-in is already waiting.',
  'no-request': () => 'There is no request to cancel.',
  'same-account': () => 'Those sign-ins are already one Snowmoon account.',
  'payment-address': () => 'This address can\'t be linked.',
  'social-only': () => 'To submit, sign in with one of your social accounts (Farcaster, Lens or Bluesky): your entry links to your own post there.',
};
