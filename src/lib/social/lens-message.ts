/**
 * Is Lens's sign-in message for this site and this wallet? Checked in the browser before the wallet is asked to sign
 * (src/lib/social/client.ts), and by the tests with Lens's real message format (scripts/test-signin-lens-bluesky.ts).
 *
 * Lens's challenge is a Sign-In with Ethereum message (EIP-4361). Read from Lens's API on 2026-11-05 with three origins:
 * its first line is "<hostname> wants you to sign in with your Ethereum account:" with the HOSTNAME only, never a port
 * (origin http://127.0.0.1:3000 gives "127.0.0.1 wants you…"), while its "URI:" line is the whole origin with a trailing
 * slash ("URI: http://127.0.0.1:3000/"). So the domain is compared with location.hostname and the URI with
 * location.origin, the address with the wallet, and the chain with Lens Chain (232). A port mismatch on localhost made
 * the first check refuse every Lens sign-in there (owner's run, 2026-11-05); the live site has no port, so it passed.
 */
export const LENS_CHAIN_ID = 232;

export interface LensMessageFields {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
}

/** The fields of a Sign-In with Ethereum message, or null if it isn't one. */
export function lensMessageFields(text: string): LensMessageFields | null {
  const lines = text.split(/\r?\n/);
  const head = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(lines[0] ?? '');
  const address = (lines[1] ?? '').trim();
  const field = (name: string) => lines.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2).trim() ?? null;
  const uri = field('URI');
  const chain = field('Chain ID');
  if (!head || !/^0x[0-9a-fA-F]{40}$/.test(address) || !uri || !chain || !/^\d+$/.test(chain)) return null;
  return { domain: head[1], address, uri, chainId: Number(chain) };
}

/** Why the message isn't for this site and wallet ('domain' | 'uri' | 'address' | 'chain' | 'format'), or null if it is. */
export function lensMessageProblem(text: string, site: { hostname: string; origin: string }, wallet: string): 'format' | 'domain' | 'uri' | 'address' | 'chain' | null {
  const f = lensMessageFields(text);
  if (!f) return 'format';
  if (f.domain.toLowerCase() !== site.hostname.toLowerCase()) return 'domain';
  if (f.uri.replace(/\/$/, '').toLowerCase() !== site.origin.replace(/\/$/, '').toLowerCase()) return 'uri';
  if (f.address.toLowerCase() !== wallet.toLowerCase()) return 'address';
  if (f.chainId !== LENS_CHAIN_ID) return 'chain';
  return null;
}
