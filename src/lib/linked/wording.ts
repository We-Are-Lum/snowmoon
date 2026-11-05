/**
 * Words for linked accounts (LINKED_ACCOUNTS, off). No server-only imports: pages may use them.
 *
 * The refusal's next step (proposal section 12.2, (b)): APPROVED by the owner (reread pack item 10; reviewed by the
 * coordinator, approved by the owner, 2026-11-04), word for word. Everything else here is DRAFT, drafted by a coding
 * agent (Claude, a closed model by Anthropic), for the owner's reread before linking ships.
 */
export type Network = 'farcaster' | 'lens' | 'bluesky';
const NAMES: Record<Network, string> = { farcaster: 'Farcaster', lens: 'Lens', bluesky: 'Bluesky' };

/** "a Farcaster account", "a Farcaster or Lens account", "a Farcaster, Lens or Bluesky account"; in the fixed order. */
export function networksPhrase(missing: readonly Network[]): string | null {
  const order: Network[] = ['farcaster', 'lens', 'bluesky'];
  const names = order.filter((n) => missing.includes(n)).map((n) => NAMES[n]);
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
  return `a ${list} account`;
}

export const LINKED_WORDING = {
  /** Generate, images and frames: (b), approved. With every network linked, line 2 is (a)'s. */
  refusal: (missing: readonly Network[]): [string, string] => {
    const n = networksPhrase(missing);
    return [
      'Your account doesn’t pass the site’s check for free images and frames.',
      n ? `Link ${n} that passes, or sign in with a wallet and prepay.` : 'You can still make them: sign in with a wallet and prepay.',
    ];
  },
  /** Challenge Submit: (b), approved. Never offers prepay (owner, 2026-11-04, 10.2). With every network linked, (a)'s line 2. */
  submitRefusal: (missing: readonly Network[]): [string, string] => {
    const n = networksPhrase(missing);
    return [
      'This version can’t count as an entry: your account didn’t pass the site’s check when you published it.',
      n ? `Link ${n} that passes, then publish a new version and submit it.` : 'You can still remix and share it, but only an account that passes can enter.',
    ];
  },
  /** DRAFT, for the owner's OK (2026-11-05). The You page's panel (src/components/linked-accounts.tsx). */
  panel: {
    title: 'Linked accounts',
    intro: 'Your Snowmoon account keeps your work, challenge entries, balance and name. Each social account or wallet you link is a way in; your main sign-in manages them.',
    kinds: { farcaster: 'Farcaster', wallet: 'Wallet', lens: 'Lens', bluesky: 'Bluesky' } as Record<'farcaster' | 'wallet' | 'lens' | 'bluesky', string>,
    you: 'signed in here',
    unlink: 'Unlink',
    unlinkAsk: 'Unlink this sign-in? It takes nothing with it: its work stays with your Snowmoon account. For 30 days it can’t join or start another Snowmoon account.',
    unlinkYes: 'Unlink',
    cancel: 'Cancel',
    linkThis: (name: string) => `Link ${name}`,
    linkAsk: (name: string) => `Link ${name} to you?`,
    linkYes: 'Link',
    another: 'Link another account',
    anotherHow: (networks: string) => `Sign in with ${networks} on this device as well, then come back here to link it.`,
    wallets: (left: number) => (left > 0 ? `You can link ${left} more ${left === 1 ? 'wallet' : 'wallets'}.` : 'You have linked 3 wallets, the most you can.'),
    walletSignIn: 'Sign in with a wallet on this device as well, then come back here to link it.',
    failed: 'That didn’t work. Try again in a moment.',
  },
  /** DRAFT. The confirm screen before a link (proposal section 3). */
  confirm: 'What you made with it belongs to your Snowmoon account and is shown under the one name you choose, so anyone can see it is yours.',
} as const;
