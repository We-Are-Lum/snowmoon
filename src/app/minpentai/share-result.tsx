'use client';

import { sdk } from '@farcaster/miniapp-sdk';
import { inMiniApp } from '~/lib/client-auth';
import { appUrl } from '~/lib/config';
import { parseResult, resultPath, resultText } from '~/lib/minpentai/share-result';
import type { RulesetId } from '~/lib/minpentai/versions/solo-v1';

/**
 * Share a ladder win, only if the player taps (owner, 2026-10-19). Opens their own Farcaster or X
 * composer with words and a link they can change; we post nothing and store nothing. The card is
 * drawn from the link (src/app/api/minpentai-card).
 */
export function ShareResult({ rung, steps, rs }: { rung: number; steps: number; rs?: RulesetId }) {
  const x = parseResult(String(rung), String(steps), null, rs && rs !== 1 ? String(rs) : null);
  if (!x) return null;
  const url = `${appUrl()}${resultPath(x)}`;
  const text = resultText(x);

  const cast = async () => {
    if (await inMiniApp()) {
      await sdk.actions.composeCast({ text, embeds: [url] }).catch(() => {});
      return;
    }
    const u = new URL('https://farcaster.xyz/~/compose');
    u.searchParams.set('text', text);
    u.searchParams.append('embeds[]', url);
    window.open(u.toString(), '_blank', 'noopener');
  };
  const post = async () => {
    const u = new URL('https://x.com/intent/post');
    u.searchParams.set('text', text);
    u.searchParams.set('url', url);
    if (await inMiniApp()) await sdk.actions.openUrl(u.toString()).catch(() => {});
    else window.open(u.toString(), '_blank', 'noopener');
  };

  return (
    <div className="mp-share">
      <p className="mp-label">SHARE THIS WIN? ONLY IF YOU WANT TO. NOTHING IS SAVED OR RANKED.</p>
      <div className="mp-two">
        <button type="button" className="mp-btn" onClick={cast}>CAST IT</button>
        <button type="button" className="mp-btn" onClick={post}>POST ON X</button>
      </div>
    </div>
  );
}
