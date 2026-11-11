/** Shown at the sign-in step and on About: the two outside services, before anything starts. Model-drafted wording. */
export const SIGN_IN_SERVICES =
  'Signing in goes through two Farcaster services: its relay (relay.farcaster.xyz), which passes the request to your Farcaster app, and its sign-in server (auth.farcaster.xyz), which checks your signature against the Optimism network through node providers Farcaster does not name. They see your Farcaster ID and that you signed in here, not what you read or ask. You stay signed in for an hour, kept on this device, not in a cookie.';

/**
 * The ways to sign in, as shown side by side (owner, 2026-10-30: Farcaster and a wallet as equals). The order and which
 * are shown come from SIGN_IN_METHODS (src/lib/config.ts). The two labels are the ones already on the site; each `line`
 * is DRAFT wording (coding agent, 2026-10-30) for the owner's reread: one short line on what that sign-in is.
 * Lens and Bluesky (branch signin-lens-bluesky) are off and never shown on the site until the owner turns them on after
 * rereading their legal drafts; their two lines are DRAFT wording too.
 */
export const SIGN_IN_CHOICES = {
  farcaster: { label: 'Sign in with Farcaster', line: 'Your Farcaster account, approved in the Farcaster app.' },
  wallet: { label: 'Sign in with a wallet', line: 'An Ethereum wallet, in this browser or in your wallet app.' },
  lens: { label: 'Sign in with Lens', line: 'Your Lens account, signed for by the wallet that owns or manages it.' },
  bluesky: { label: 'Sign in with Bluesky', line: 'Your Bluesky account, approved on your Bluesky server.' },
} as const;
