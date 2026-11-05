import { SOCIAL_SIGN_IN } from '../config';

/**
 * Words for linking and unlinking Lens and Bluesky accounts (the You page's panel and src/app/api/social-link).
 * DRAFT wording, drafted by the coding agent (Anthropic's Claude, a closed model), for the owner's reread. Not legal
 * text: the legal sentences are Privacy §4's link item and Terms §4 (src/lib/legal.ts).
 */
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const kindName = (k: 'lens' | 'bluesky') => (k === 'lens' ? 'Lens' : 'Bluesky');

export const LINK_WORDING = {
  title: 'Linked Lens and Bluesky accounts',
  /** Shown before linking: what becomes true. */
  offer: (kind: 'lens' | 'bluesky', account: string, to: string) => `Link the ${kindName(kind)} account ${account} to ${to}?`,
  offerWhat: (to: string) => `While linked, signing in with it signs you in as ${to}, and what you make with it shows under ${to}, so anyone can see the two are yours.`,
  waitNote: `You can unlink it here at any time. An account you unlink can be linked to a different account only after ${SOCIAL_SIGN_IN.relinkWaitDays} days.`,
  yes: 'Link them',
  no: 'Not now',
  linked: (kind: 'lens' | 'bluesky', account: string, to: string) => `The ${kindName(kind)} account ${account} is linked to ${to}: signing in with it signs you in as ${to}.`,
  linkedHere: (kind: 'lens' | 'bluesky', account: string) => `${account} (${kindName(kind)}) is linked to this account: signing in with it signs you in here.`,
  signInFarcaster: 'Sign in with Farcaster as well to link this account to it.',
  addBluesky: 'Link a Bluesky account to this Lens account',
  addLens: 'Link a Lens account',
  addBlueskyToFarcaster: 'Link a Bluesky account',
  forget: (name: string) => `Not now: forget ${name} on this device`,
  unlink: 'Unlink',
  unlinkConfirm: `Unlink? Signing in with that account will be its own account again. It can be linked to a different account only after ${SOCIAL_SIGN_IN.relinkWaitDays} days.`,
  unlinkYes: 'Unlink',
  unlinkNo: 'Keep it',
  wait: (until: string) => `This account was unlinked less than ${SOCIAL_SIGN_IN.relinkWaitDays} days ago. It can be linked to a different account from ${day(until)}, or to the one it was linked to at any time.`,
  linkedElsewhere: 'This account is already linked. Unlink it first.',
  notYet: 'Linking isn’t available yet.',
  notLinked: 'This account isn’t linked.',
  cannot: 'These two can’t be linked.',
  failed: 'That didn’t work. Try again in a moment.',
} as const;
