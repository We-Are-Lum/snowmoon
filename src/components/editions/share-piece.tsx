'use client';

import sdk from '@farcaster/miniapp-sdk';
import { useState } from 'react';
import { EW } from '~/lib/editions/wording';

/** Share an edition page: a cast inside the Farcaster miniapp, the phone's share sheet, or a copied link. */
export function SharePiece({ path, title }: { path: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    const text = EW.shareText(title);
    if (await sdk.isInMiniApp().catch(() => false)) {
      await sdk.actions.composeCast({ text, embeds: [url] }).catch(() => {});
      return;
    }
    if (navigator.share) {
      await navigator.share({ title, text, url }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(url).then(() => (setCopied(true), setTimeout(() => setCopied(false), 2000)), () => {});
  };
  return (
    <button type="button" className="ed-button ed-button-outline" onClick={() => void share()}>
      {copied ? EW.copied : EW.share}
    </button>
  );
}
