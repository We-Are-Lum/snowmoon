'use client';

import { useState } from 'react';
import { authFetch } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { AgentKeyField } from './agent-key-field';

/**
 * Make a personal agent key on /you (owner, 2026-10-20): for an app that connects with a key in a header
 * (Muse). Drafts only, a spend cap, 30 days. The key is shown here once, from the answer to the request
 * that made it, and kept only in this component's memory until "Done": never stored on the device, never
 * sent anywhere else. The name and cap boxes are AgentKeyField (check:principles P1f). DRAFT wording.
 */
const W = AGENT_WORDING.you;

export function AgentKeyMaker({ onMade }: { onMade: () => void }) {
  const [name, setName] = useState('');
  const [cap, setCap] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setBusy(true);
    setError(null);
    const r = await authFetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'key', name, capUsd: Number(cap) }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { key?: string; error?: string };
    setBusy(false);
    if (r?.ok && out.key) {
      setKey(out.key);
      setName('');
      onMade();
    } else setError(out.error ?? 'That didn’t work.');
  };
  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key).then(() => setCopied(true), () => {});
  };
  return (
    <details className="agent-wallet agent-key">
      <summary>{W.keyTitle}</summary>
      <p className="you-note">{W.keyNote}</p>
      {key ? (
        <div className="agent-key-once" role="status">
          <p className="you-note">{W.keyShown}</p>
          <pre className="agent-message" data-agent-key>{key}</pre>
          <div className="draft-actions">
            <button type="button" className="ic-primary" onClick={() => void copy()}>{copied ? W.keyCopied : W.keyCopy}</button>
            <button type="button" className="ic-secondary" onClick={() => { setKey(null); setCopied(false); }}>{W.keyDone}</button>
          </div>
        </div>
      ) : (
        <>
          <AgentKeyField id="agent-key-name" kind="name" label={W.keyName} value={name} onChange={setName} />
          <AgentKeyField id="agent-key-cap" kind="cap" label={W.keyCap} value={cap} onChange={setCap} />
          {error && <p role="alert" className="you-note">{error}</p>}
          <button type="button" className="ic-secondary" disabled={busy || !name.trim() || cap === ''} onClick={() => void make()}>{W.keyMake}</button>
        </>
      )}
    </details>
  );
}
