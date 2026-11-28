/**
 * Links on /admin/bounty (owner, 2026-11-26; branch bounty-links). Pure and client-safe. Admins only, as the page is:
 * nothing public changes. Every link opens in a new tab with rel="noopener noreferrer nofollow" (LINK_REL).
 *
 * - Text (a claim's description, an entry's backstory): every http(s) URL becomes a link whose text is the URL itself,
 *   in full, so an admin sees where it goes. Nothing else is ever a link: javascript:, data:, ipfs:, mailto: and the
 *   rest stay plain text.
 * - Profiles: Farcaster (farcaster.xyz/<username>, or farcaster.xyz/~/profiles/<FID> with no username; both checked
 *   in a browser on 2026-11-26), Basescan for an address, Lens (hey.xyz/u/<name>, as the site's share links), Bluesky
 *   (bsky.app/profile/<handle or DID>), and the claimer's poidh account page (poidh.xyz/account/<address>, as poidh's
 *   bounty page links its claimers). poidh has no page per claim (its bounty page lists them, and its own guide names
 *   none, 2026-11-26).
 */
export const LINK_REL = 'noopener noreferrer nofollow';

/** The URL if it is http or https, else null. */
export function safeHttp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export type TextPart = { text: string } | { href: string; text: string };

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`]+/gi;
/** Trailing characters that end a sentence or close a bracket rather than belong to the URL. */
function trimTail(url: string): string {
  let u = url;
  for (;;) {
    const last = u.slice(-1);
    if (/[.,;:!?*_~]/.test(last)) u = u.slice(0, -1);
    else if (last === ')' && (u.match(/\(/g) ?? []).length < (u.match(/\)/g) ?? []).length) u = u.slice(0, -1);
    else if (last === ']' && (u.match(/\[/g) ?? []).length < (u.match(/\]/g) ?? []).length) u = u.slice(0, -1);
    else return u;
  }
}

/** Text split into plain parts and links: each http(s) URL is a link showing the URL itself. */
export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    const start = m.index ?? 0;
    const raw = trimTail(m[0]);
    const href = safeHttp(raw);
    if (!href || !raw) continue;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ href, text: raw });
    at = start + raw.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out.length ? out : [{ text }];
}

const USERNAME = /^[a-z0-9][a-z0-9.-]{0,30}$/i;
export const farcasterProfile = (fid: number, username: string | null | undefined): string =>
  username && USERNAME.test(username) ? `https://farcaster.xyz/${username.toLowerCase()}` : `https://farcaster.xyz/~/profiles/${fid}`;
export const basescanAddress = (address: string): string | null => (/^0x[0-9a-fA-F]{40}$/.test(address) ? `https://basescan.org/address/${address.toLowerCase()}` : null);
export const poidhAccount = (address: string): string | null => (/^0x[0-9a-fA-F]{40}$/.test(address) ? `https://poidh.xyz/account/${address.toLowerCase()}` : null);
/** A Lens username ("lens/<name>") on Hey; null without one. */
export const lensProfile = (handle: string | null | undefined): string | null => {
  const name = handle?.replace(/^lens\//, '');
  return name && /^[a-z0-9_.-]{1,64}$/i.test(name) ? `https://hey.xyz/u/${name}` : null;
};
/** A Bluesky profile by its handle, or by its DID when it has none. */
export const blueskyProfile = (handle: string | null | undefined, did: string): string | null => {
  const id = handle && /^[a-z0-9.-]{1,253}$/i.test(handle) ? handle : /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]{1,253})$/.test(did) ? did : null;
  return id ? `https://bsky.app/profile/${id}` : null;
};
/** A claim's tokenURI as a link: https as it is, ipfs:// through the public gateway; anything else, none. */
export const tokenUriHref = (uri: string | null | undefined, gateway: string): string | null =>
  !uri ? null : uri.startsWith('ipfs://') ? safeHttp(`${gateway}${uri.slice(7).replace(/^ipfs\//, '')}`) : safeHttp(uri);
