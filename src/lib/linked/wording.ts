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
  /** DRAFT. A2, shown at Generate while one of the person's accounts is in its 30-day wait. */
  wait: (until: string) =>
    `One of your accounts was unlinked from someone else less than 30 days ago, so free images and frames are off for you until ${new Date(until).toUTCString().slice(5, 16)}. You can still sign in with a wallet and prepay.`,
  /** DRAFT. Link refusals, by rule. */
  link: {
    off: 'Linking accounts isn’t open yet.',
    same: 'That’s the account you’re signed in with.',
    'payment-address': 'This address can’t be linked.',
    attempts: 'Too many link attempts today. Try again tomorrow.',
    'belongs-to-someone': 'This account already belongs to someone with other accounts. Unlink it there first.',
    'one-of-kind': 'You can link one Farcaster account, one Lens account and one Bluesky account.',
    wallets: 'You can link up to 3 wallets.',
    moves: 'This account has moved twice in the last year, so it stays where it is.',
    frozen: 'This account has a challenge entry, so it stays with you until the challenge’s rewards are paid.',
    unknown: 'That account can’t be linked.',
    wait: (until: string) => `This account was unlinked less than 30 days ago. It can be linked to someone else from ${new Date(until).toUTCString().slice(5, 16)}.`,
  },
  /** DRAFT. Unlink refusals. */
  unlink: {
    off: 'Linking accounts isn’t open yet.',
    none: 'That account isn’t linked to you.',
    last: 'This is your only account, so it can’t be unlinked.',
    frozen: 'This account has a challenge entry, so it stays with you until the challenge’s rewards are paid.',
  },
  /** DRAFT, for the owner's OK (2026-11-05). The You page's panel (src/components/linked-accounts.tsx). */
  panel: {
    title: 'Linked accounts',
    intro: 'Accounts you link are one person here: your free images and frames, limits and the remix challenge count once for all of them, and your work shows under one name.',
    kinds: { farcaster: 'Farcaster', wallet: 'Wallet', lens: 'Lens', bluesky: 'Bluesky' } as Record<'farcaster' | 'wallet' | 'lens' | 'bluesky', string>,
    you: 'signed in here',
    unlink: 'Unlink',
    unlinkAsk: 'Unlink this account? Its work will show under its own name again, and it can be linked to someone else only after 30 days.',
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
  confirm: 'Your work from both accounts will be shown under one name, so anyone can see they are yours.',
} as const;
