'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { authFetch, inMiniApp } from '~/lib/client-auth';

/**
 * A remix frame's Share (its link: copy it, or cast it with the cast composer, inside the Farcaster
 * app or on the website) and, for its maker or the maintainer, Hide (owner, 2026-10-18).
 */
export function castComposer(text: string, url: string) {
  return (async () => {
    if (await inMiniApp()) {
      await sdk.actions.composeCast({ text, embeds: [url] }).catch(() => {});
    } else {
      const u = new URL('https://farcaster.xyz/~/compose');
      u.searchParams.set('text', text);
      u.searchParams.append('embeds[]', url);
      window.open(u.toString(), '_blank', 'noopener');
    }
  })();
}

export function ShareRow({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState<'' | 'ok' | 'failed'>('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <div className="rx-share">
      <span className="rx-link">{url.replace(/^https?:\/\//, '')}</span>
      <div className="rx-row">
        <button type="button" className="rx-btn rx-btn-solid" onClick={copy} aria-live="polite">
          {copied === 'ok' ? 'Copied' : copied === 'failed' ? 'Hold the link to copy' : 'Copy link'}
        </button>
        <button type="button" className="rx-btn" onClick={() => void castComposer(text, url)}>
          Cast it
        </button>
      </div>
    </div>
  );
}

export function HideButton({ id, onChange, base = '/api/remix' }: { id: string; onChange?: (hidden: boolean) => void; base?: string }) {
  const [state, setState] = useState<{ canHide: boolean; hidden: boolean; canUnhide: boolean; as: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void authFetch(`${base}/${id}/hide`)
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState(null));
  }, [id, base]);
  if (!state?.canHide) return null;
  const act = async (hide: boolean) => {
    setNote(null);
    const r = await authFetch(`${base}/${id}/hide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hide }) });
    const out = (await r.json().catch(() => ({}))) as { hidden?: boolean; error?: string };
    if (!r.ok) return setNote(out.error ?? 'Could not change it');
    setState({ ...state, hidden: !!out.hidden, canUnhide: !!out.hidden });
    onChange?.(!!out.hidden);
    if (typeof window !== 'undefined' && !onChange) location.reload();
  };
  return (
    <div className="rx-row">
      {state.hidden ? (
        state.canUnhide && (
          <button type="button" className="rx-btn" onClick={() => act(false)}>
            Show it again
          </button>
        )
      ) : (
        <button type="button" className="rx-btn" onClick={() => act(true)}>
          {state.as === 'maintainer' ? 'Hide (maintainer)' : 'Hide this'}
        </button>
      )}
      {note && <span className="rx-note" role="status">{note}</span>}
    </div>
  );
}
