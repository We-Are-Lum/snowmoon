/**
 * A stand-in Farcaster client for npm run check:miniapp: it frames the app the way
 * Farcaster on the web does (an iframe, ~424×695) and answers the SDK through
 * @farcaster/miniapp-host. Sign-in returns a well-formed SIWE message with a fake
 * signature; the check mocks the Quick Auth server, so no real account is involved.
 */
import { exposeToIframe } from '@farcaster/miniapp-host';

declare global {
  interface Window {
    __host: { ready: number; signIn: number; other: string[] };
  }
}

const target = new URLSearchParams(location.search).get('url')!;
const iframe = document.createElement('iframe');
iframe.src = target;
iframe.style.cssText = 'width:424px;height:695px;border:0';
document.body.appendChild(iframe);
window.__host = { ready: 0, signIn: 0, other: [] };
const origin = new URL(target);

const impl: Record<string, unknown> = {
  context: {
    user: { fid: 6786, username: 'check' },
    client: { clientFid: 9152, added: false, safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 } },
    location: { type: 'launcher' },
    features: { haptics: false },
  },
  ready: () => {
    window.__host.ready++;
  },
  signIn: async ({ nonce }: { nonce: string }) => {
    window.__host.signIn++;
    const message = [
      `${origin.host} wants you to sign in with your Ethereum account:`,
      '0x0000000000000000000000000000000000000001',
      '',
      'Farcaster Auth',
      '',
      `URI: ${origin.origin}`,
      'Version: 1',
      'Chain ID: 10',
      `Nonce: ${nonce}`,
      'Issued At: 2026-10-07T00:00:00.000Z',
      'Resources:',
      '- farcaster://fid/6786',
    ].join('\n');
    return { message, signature: '0x00' };
  },
  getCapabilities: async () => ['actions.ready', 'actions.signIn'],
  getChains: async () => [],
};
const sdk = new Proxy(impl, {
  get: (t, k: string) =>
    k in t
      ? t[k]
      : () => {
          window.__host.other.push(k);
          return undefined;
        },
});
exposeToIframe({ iframe, sdk: sdk as never, miniAppOrigin: origin.origin });
