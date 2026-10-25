'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '~/lib/client-auth';
import { AGENT_WORDING } from '~/lib/agents/wording';
import type { AgentRow } from '~/lib/agents/accounts';
import type { NoteView, VersionView } from '~/lib/agents/pieces';
import type { RequestView } from '~/lib/agents/requests';
import type { SuggestionView } from '~/lib/agents/suggestions';
import { TellAgent, sendRequest } from './tell-agent';
import { PublishedTextField } from '../publish-words';
import { AgentAddressField } from './agent-address-field';
import { AgentKeyMaker } from './agent-key';
import { PieceVersion, shortMentions } from './piece-version';
import './agents.css';
import { exactDollars } from '~/lib/wallet/price-text';

/**
 * On /you (owner, 2026-10-20): the person's agents, each with one-tap Disconnect, linking a wallet
 * agent, and the review list of what their agents drafted, with Publish and Discard. Hidden entirely
 * while agents are switched off (/api/agents answers 404).
 */
const W = AGENT_WORDING.you;
const R = AGENT_WORDING.react;
const T = AGENT_WORDING.tell;
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

/** A draft and the three reactions (owner, 2026-10-20): keep, try again, say more. No settings to edit. */
export function DraftRow({ v, onDone }: { v: VersionView; onDone: () => void }) {
  const src = useDraftImage(v);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (action: 'keep' | 'again' | 'more' | 'run', words?: string, spoken?: boolean) => {
    setBusy(true);
    setErr(null);
    const r = await authFetch('/api/drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ what: 'version', id: v.id, action, words, spoken }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) onDone();
    else if (action === 'run') setErr(((await r?.json().catch(() => ({}))) as { error?: string }).error ?? T.failed);
    return r?.ok ? null : T.failed;
  };
  // A frame try or a video test costs money: it is made only when the person approves the shown estimate.
  const change = (v.body as { change?: { type?: string; estimate_usd?: number; price_usd?: number } }).change;
  const needsApproval = v.kind === 'edit' && (change?.type === 'frame' || change?.type === 'video') && !v.approved;
  return (
    <div className="draft-row" data-draft={v.id}>
      <p><strong>{v.title}</strong> <span className="piece-sub">{v.kind}</span></p>
      <PieceVersion v={v} imageSrc={src} />
      {needsApproval && (
        <div className="draft-actions">
          <button type="button" className="ic-primary" disabled={busy} onClick={() => void act('run')}>
            {busy ? R.making : change?.type === 'video' ? R.makeVideo(change.estimate_usd ?? 0) : typeof change?.price_usd === 'number' ? R.makeFramePaid(exactDollars(change.price_usd)) : R.makeFrame(change?.estimate_usd ?? 0)}
          </button>
        </div>
      )}
      {v.spentUsd !== null && <p className="you-note">{R.spent(v.spentUsd)}</p>}
      {err && <p className="you-note" role="alert">{err}</p>}
      <div className="draft-actions">
        <button type="button" className={needsApproval ? 'ic-secondary' : 'ic-primary'} disabled={busy} onClick={() => void act('keep')}>{R.keep}</button>
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => void act('again')}>{R.again}</button>
        <button type="button" className="ic-secondary" disabled={busy} aria-expanded={more} onClick={() => setMore((m) => !m)}>{R.more}</button>
      </div>
      {more && (
        <div className="draft-say-more">
          <TellAgent id={`more-${v.id}`} label={T.note} compact send={(words, spoken) => act('more', words, spoken)} />
        </div>
      )}
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
        <button type="button" className="ic-primary" disabled={busy} onClick={() => void act('publish')}>{R.keep}</button>
        <button type="button" className="ic-secondary" disabled={busy} onClick={() => void act('discard')}>{W.discard}</button>
      </div>
    </div>
  );
}

function Asked({ r }: { r: RequestView }) {
  const about = r.about && 'version' in r.about ? `on “${r.about.title}”` : r.about && 'moment' in r.about ? (r.about.at ? `at ${r.about.at} in the film (${r.about.shot})` : `on a moment (${r.about.shot})`) : 'a new idea';
  return (
    <div className="request-row" data-request={r.id}>
      <p className="you-note">{r.kind === 'again' ? 'Try again' : r.kind === 'more' ? 'Say more' : r.kind === 'note' ? 'A note' : 'An idea'}, {about}{r.spoken ? ', spoken' : ''}</p>
      <p>{r.words}</p>
    </div>
  );
}

const S = AGENT_WORDING.you;
const whereOf = (x: SuggestionView) => [x.page, x.moment ? `moment ${x.moment}${x.at ? ` at ${x.at}` : ''}` : null].filter(Boolean).join(' · ');

/**
 * "Suggest an improvement" (owner, 2026-10-22), for the invited people: typed or spoken, to the owner only.
 * The owner also sees everyone's here, with who said it and where they were.
 */
function Suggestions() {
  const [data, setData] = useState<{ mine: SuggestionView[]; all?: (SuggestionView & { who: string })[]; gaps?: { id: string; who: string; agent: string; asked: string; missing: string; createdAt: string }[]; failures?: ({ id: string; agent: string; tool: string; kind: string; message: string; args: string[]; createdAt: string } & { who: string })[]; notes?: NoteView[] } | null>(null);
  const load = useCallback(async () => {
    const r = await authFetch('/api/suggestions').catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return null;
  return (
    <>
      <section className="you-section" aria-labelledby="you-suggest">
        <h2 id="you-suggest">{S.suggest}</h2>
        <TellAgent id="you-suggest-box" label={S.suggestLabel} sendLabel={S.suggestSend} whenNote={S.suggestNote} sentNote={S.suggestSent} send={async (words, spoken) => {
          const r = await authFetch('/api/suggestions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ words, spoken, page: '/you' }) }).catch(() => null);
          if (r?.ok) {
            void load();
            return null;
          }
          return ((await r?.json().catch(() => ({}))) as { error?: string }).error ?? T.failed;
        }} />
        {data.mine.length > 0 && (
          <details className="you-suggested">
            <summary>{S.yourSuggestions} ({data.mine.length})</summary>
            {data.mine.map((x) => (
              <div className="request-row" key={x.id} data-suggestion={x.id}>
                <p className="you-note">{when(x.createdAt)}{x.spoken ? ', spoken' : ''}{x.filedBy ? `, ${S.passedOnBy(x.filedBy)}` : ''}</p>
                <p>{x.words}</p>
              </div>
            ))}
          </details>
        )}
      </section>
      {data.all && (
        <section className="you-section" aria-labelledby="you-suggestions-all">
          <h2 id="you-suggestions-all">{S.allSuggestions}</h2>
          <p className="you-note">{S.allSuggestionsNote}</p>
          {data.all.length === 0 && <p className="you-note">None yet.</p>}
          {data.all.map((x) => (
            <div className="request-row" key={x.id} data-suggestion-all={x.id}>
              <p className="you-note"><strong>{x.who}</strong>, {when(x.createdAt)}{x.spoken ? ', spoken' : ''}{x.filedBy ? `, ${S.passedOnBy(x.filedBy)}` : ''}{whereOf(x) ? ` · ${whereOf(x)}` : ''}</p>
              <p>{x.words}</p>
            </div>
          ))}
        </section>
      )}
      {data.gaps && (
        <section className="you-section" aria-labelledby="you-gaps-all">
          <h2 id="you-gaps-all">{S.allGaps}</h2>
          <p className="you-note">{S.allGapsNote}</p>
          {data.gaps.length === 0 && <p className="you-note">None yet.</p>}
          {data.gaps.map((g) => (
            <div className="request-row" key={g.id} data-gap-all={g.id}>
              <p className="you-note"><strong>{g.who}</strong>, {when(g.createdAt)}, {S.passedOnBy(g.agent)}</p>
              <p>{g.asked}</p>
              <p className="you-note">{S.gapMissing}: {g.missing}</p>
            </div>
          ))}
        </section>
      )}
      {data.failures && (
        <section className="you-section" aria-labelledby="you-failures-all">
          <h2 id="you-failures-all">{S.allFailures}</h2>
          <p className="you-note">{S.allFailuresNote}</p>
          {data.failures.length === 0 && <p className="you-note">None yet.</p>}
          {data.failures.map((f) => <Failure key={f.id} f={f} who={f.who} />)}
        </section>
      )}
      {data.notes && (
        <section className="you-section" aria-labelledby="you-notes-all">
          <h2 id="you-notes-all">{S.allNotes}</h2>
          <p className="you-note">{S.allNotesNote}</p>
          {data.notes.length === 0 && <p className="you-note">None yet.</p>}
          {data.notes.map((n) => (
            <div className="request-row" key={n.id} data-note-all={n.id}>
              <p className="you-note"><strong>{n.by}</strong>, {when(n.createdAt)}{n.agent ? `, ${n.agent}` : ""}</p>
              <p>{n.text}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

/** One failed tool call (step 0): when, which agent and tool, what kind, the message, and the argument names. */
function Failure({ f, who }: { f: { id: string; agent: string; tool: string; kind: string; message: string; args: string[]; createdAt: string }; who?: string }) {
  return (
    <div className="request-row" data-failure={f.id}>
      <p className="you-note">{who ? <><strong>{who}</strong>, </> : null}{when(f.createdAt)}, {f.agent} · <code>{f.tool}</code> · {W.failureKind[f.kind] ?? f.kind}</p>
      <p>{f.message}</p>
      {f.args.length > 0 && <p className="you-note">sent: {f.args.join(', ')}</p>}
    </div>
  );
}

export function AgentsOnYou() {
  const [on, setOn] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [scripts, setScripts] = useState<{ adaptation: number; version: number; title: string }[]>([]);
  const [drafts, setDrafts] = useState<{ drafts: VersionView[]; notes: NoteView[]; published: VersionView[]; waiting: RequestView[]; gaps: { id: string; agent: string; asked: string; missing: string; createdAt: string }[]; failures?: { id: string; agent: string; tool: string; kind: string; message: string; args: string[]; createdAt: string }[] } | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const a = await authFetch('/api/agents').catch(() => null);
    if (!a || a.status === 404) return setOn(false);
    setOn(true);
    if (a.ok) {
      const out = (await a.json()) as { agents: AgentRow[]; scripts?: { adaptation: number; version: number; title: string }[] };
      setAgents(out.agents);
      setScripts(out.scripts ?? []);
    }
    const d = await authFetch('/api/drafts').catch(() => null);
    if (d?.ok) setDrafts(await d.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // While the agent has something to do, its drafts appear here as they land: no reload, no second visit.
  const waiting = drafts?.waiting.length ?? 0;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [waiting, load]);
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
      <section className="you-section" aria-labelledby="you-tell">
        <h2 id="you-tell">{T.idea}</h2>
        <TellAgent id="you-idea" label={T.idea} send={async (words, spoken) => {
          const err = await sendRequest({ kind: 'idea', words, spoken });
          if (!err) void load();
          return err;
        }} />
      </section>
      {scripts.length > 0 && (
        <section className="you-section" aria-labelledby="you-scripts">
          <h2 id="you-scripts">{AGENT_WORDING.direction.scripts}</h2>
          <ul className="you-list">
            {scripts.map((x) => (
              <li key={x.version}><Link href={`/you/script/${x.adaptation}/${x.version}`} data-script-link>{AGENT_WORDING.direction.title(x.title)} (version {x.version})</Link></li>
            ))}
          </ul>
        </section>
      )}
      <section className="you-section" aria-labelledby="you-review">
        <h2 id="you-review">{W.review}</h2>
        <p className="you-note">{W.reviewNote}</p>
        {drafts && drafts.drafts.length === 0 && drafts.notes.length === 0 && <p className="you-note">{W.noDrafts}</p>}
        {drafts?.drafts.map((v) => <DraftRow key={v.id} v={v} onDone={() => void load()} />)}
        {drafts?.notes.map((n) => <NoteRow key={n.id} n={n} title={titleOf(n.version)} onDone={() => void load()} />)}
        {drafts && drafts.waiting.length > 0 && (
          <>
            <h3 className="you-sub">{W.asked}</h3>
            {drafts.waiting.map((r) => <Asked key={r.id} r={r} />)}
          </>
        )}
      </section>
      {drafts && drafts.gaps.length > 0 && (
        <section className="you-section" aria-labelledby="you-gaps">
          <h2 id="you-gaps">{W.gaps}</h2>
          <p className="you-note">{W.gapsNote}</p>
          {drafts.gaps.map((g) => (
            <div className="request-row" key={g.id} data-gap={g.id}>
              <p className="you-note">{W.gapAsked} ({g.agent}, {when(g.createdAt)}):</p>
              <p>{g.asked}</p>
              <p className="you-note">{W.gapMissing}: {g.missing}</p>
            </div>
          ))}
        </section>
      )}
      {drafts?.failures && drafts.failures.length > 0 && (
        <section className="you-section" aria-labelledby="you-failures">
          <h2 id="you-failures">{W.failures}</h2>
          <p className="you-note">{W.failuresNote}</p>
          {drafts.failures.map((f) => <Failure key={f.id} f={f} />)}
        </section>
      )}
      <Suggestions />
      <section className="you-section" aria-labelledby="you-agents">
        <h2 id="you-agents">{W.agents}</h2>
        <p className="you-note">{W.agentsNote}</p>
        {agents.length === 0 && <p className="you-note">{W.none}</p>}
        {agents.map((a) => (
          <div className="agent-row" key={a.id} data-agent={a.id}>
            <p><strong>{a.name}</strong> <span className="piece-chip">agent</span></p>
            <p className="you-note">{W.via(a.route)} · {a.scopes.join(', ')} · {W.lastUsed(when(a.lastUsedAt))}</p>
            {a.route === 'key' && a.spendCapUsd !== null && <p className="you-note">{W.keyLine(a.spentUsd, a.spendCapUsd, a.expiresAt.slice(0, 10))}</p>}
            {a.waitingForSignature && <p className="you-note">{W.waiting}</p>}
            <button type="button" className="ic-secondary" onClick={() => void disconnect(a.id)}>{W.disconnect}</button>
          </div>
        ))}
        <AgentKeyMaker onMade={() => void load()} />
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
    </>
  );
}
