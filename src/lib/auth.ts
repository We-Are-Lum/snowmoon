import 'server-only';
import { createClient } from '@farcaster/quick-auth';

/**
 * Sign In with Farcaster via Quick Auth, as a bearer token.
 *
 * Every authenticated request carries `Authorization: Bearer <quick auth JWT>`
 * (the client uses sdk.quickAuth.fetch, which adds it). No cookie: on Farcaster
 * web the app runs in a cross-site iframe, where browsers that block third-party
 * cookies (Safari, Brave) would drop it.
 */
const quickAuth = createClient();

export function domain(request: Request): string {
  if (process.env.NEXT_PUBLIC_URL) return new URL(process.env.NEXT_PUBLIC_URL).hostname;
  return (request.headers.get('host') ?? 'localhost').split(':')[0];
}

/** The signed-in FID, or null if the request has no valid Quick Auth token. */
export async function getFid(request: Request): Promise<number | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  try {
    const payload = await quickAuth.verifyJwt({ token, domain: domain(request) });
    return Number(payload.sub);
  } catch {
    return null;
  }
}
