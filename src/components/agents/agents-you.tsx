'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import type { AgentRow } from '~/lib/agents/accounts';
import type { NoteView, VersionView } from '~/lib/agents/pieces';
import { PublishedTextField } from '../publish-words';
import { AgentAddressField } from './agent-address-field';
import { PieceVersion, shortMentions } from './piece-version';
import './agents.css';

/**
 * On /you (owner, 2026-10-20): the person's agents, each with one-tap Disconnect, linking a wallet
 * agent, and the review list of what their agents drafted, with Publish and Discard. Hidden entirely
 * while agents are switched off (/api/agents answers 404).
 */
const W = AGENT_WORDING.you;
const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null);

/** A draft's image needs the person's token, so it is fetched and shown from memory. */
function useDraftImage(v: VersionView) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!v.image) return;
    let url: string | null = null;
    void authFetch(`/api/pieces/image/${v.id}`).then(async (r) => {
      if (r.ok) setSrc((url = URL.createObjectURL(await r.blob())));
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [v]);
  return src;
}

function DraftRow({ v, onDone }: { v: VersionView; onDone: () => void }) {
  const src = useDraftImage(v);
  const [busy, setBusy] = useState(false);
  const act = async (action: 'publish' | 'discard') => {
    setBusy(true);
    await authFetch('/api/drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ what: 'version', id: v.id, action }) }).catch(() => null);
    setBusy(false);
    onDone();
  };
  return (
    <div className="draft-row" data-draft={v.id}>
      <p><strong>{v.title}</strong> <span className="piece-sub">{v.kind}</span></p>
      <PieceVersion v={v} imageSrc={src} />
      <div className="draft-actions">
        <button type="button" className="ic-primary" disabled={busy} onClick={() => void act('publish')}>{W.publish}</button>
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => void act('discard')}>{W.discard}</button>
      </div>
    </div>
  );
}

function NoteRow({ n, title, onDone }: { n: NoteView; title: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: 'publish' | 'discard') => {
    setBusy(true);
    await authFetch('/api/drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ what: 'note', id: n.id, action }) }).catch(() => null);
    setBusy(false);
    onDone();
  };
  return (
    <div className="draft-row" data-note={n.id}>
      <p><strong>{W.noteOn(title)}</strong></p>
      <p><span className="piece-maker">{n.agent}</span> <span className="piece-chip">agent</span> <span className="piece-chip">draft</span></p>
      <p>{shortMentions(n.text)}</p>
      <p className="you-note"><Link href={`/p/${n.piece}`}>{W.open}</Link></p>
      <div className="draft-actions">
        <button type="button" className="ic-primary" disabled={busy} onClick={() => void act('publish')}>{W.publish}</button>
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => void act('discard')}>{W.discard}</button>
      </div>
    </div>
  );
}

export function AgentsOnYou() {
  const [on, setOn] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [drafts, setDrafts] = useState<{ drafts: VersionView[]; notes: NoteView[]; published: VersionView[] } | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const a = await authFetch('/api/agents').catch(() => null);
    if (!a || a.status === 404) return setOn(false);
    setOn(true);
    if (a.ok) setAgents(((await a.json()) as { agents: AgentRow[] }).agents);
    const d = await authFetch('/api/drafts').catch(() => null);
    if (d?.ok) setDrafts(await d.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!on) return null;
  const disconnect = async (id: string) => {
    await authFetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'disconnect', id }) }).catch(() => null);
    void load();
  };
  const link = async () => {
    setError(null);
    const r = await authFetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'wallet', address, name }) }).catch(() => null);
    const out = (await r?.json().catch(() => ({}))) as { message?: string; error?: string };
    if (r?.ok && out.message) {
      setMessage(out.message);
      setName('');
      setAddress('');
      void load();
    } else setError(out.error ?? 'That didn’t work.');
  };
  const titleOf = (versionId: string) => [...(drafts?.published ?? []), ...(drafts?.drafts ?? [])].find((v) => v.id === versionId)?.title ?? 'a published version';
  return (
    <>
      <section className="you-section" aria-labelledby="you-agents">
        <h2 id="you-agents">{W.agents}</h2>
        <p className="you-note">{W.agentsNote}</p>
        {agents.length === 0 && <p className="you-note">{W.none}</p>}
        {agents.map((a) => (
          <div className="agent-row" key={a.id} data-agent={a.id}>
            <p><strong>{a.name}</strong> <span className="piece-chip">agent</span></p>
            <p className="you-note">{W.via(a.route)} · {a.scopes.join(', ')} · {W.lastUsed(when(a.lastUsedAt))}</p>
            {a.waitingForSignature && <p className="you-note">{W.waiting}</p>}
            <button type="button" className="ic-secondary" onClick={() => void disconnect(a.id)}>{W.disconnect}</button>
          </div>
        ))}
        <details className="agent-wallet">
          <summary>{W.walletTitle}</summary>
          <p className="you-note">{W.walletNote}</p>
          <PublishedTextField id="agent-name" label={W.walletName} value={name} onChange={setName} rows={1} maxLength={60} />
          <AgentAddressField id="agent-address" label={W.walletAddress} value={address} onChange={setAddress} />
          {error && <p role="alert" className="you-note">{error}</p>}
          <button type="button" className="ic-secondary" disabled={!name.trim() || !address.trim()} onClick={() => void link()}>{W.walletAdd}</button>
          {message && (
            <>
              <p className="you-note">{W.walletMessage}</p>
              <pre className="agent-message">{message}</pre>
            </>
          )}
        </details>
      </section>
      <section className="you-section" aria-labelledby="you-review">
        <h2 id="you-review">{W.review}</h2>
        <p className="you-note">{W.reviewNote}</p>
        {drafts && drafts.drafts.length === 0 && drafts.notes.length === 0 && <p className="you-note">{W.noDrafts}</p>}
        {drafts?.drafts.map((v) => <DraftRow key={v.id} v={v} onDone={() => void load()} />)}
        {drafts?.notes.map((n) => <NoteRow key={n.id} n={n} title={titleOf(n.version)} onDone={() => void load()} />)}
      </section>
    </>
  );
}
