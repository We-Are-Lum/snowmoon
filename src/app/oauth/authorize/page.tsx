import { notFound } from 'next/navigation';
import { agentsOn } from '~/lib/agents/core';
import { checkAuthorize, OAuthError, SCOPE_TEXT } from '~/lib/agents/oauth';
import { AGENTS } from '~/lib/config';
import { AGENT_WORDING } from '~/lib/agents/wording';
import { AuthorizeConsent } from './consent';

/**
 * Where a person agrees to let an agent work for them (owner, 2026-10-20; docs/agents/design.md §1).
 * The request is checked here first; a bad client or redirect is shown on this page, never sent anywhere.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connect an agent', robots: { index: false } };
const W = AGENT_WORDING.authorize;

export default async function Authorize({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!agentsOn()) notFound();
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
  try {
    const ask = await checkAuthorize(q);
    return (
      <div className="page prose agent-authorize">
        <AuthorizeConsent
          query={q.toString()}
          client={ask.clientName}
          scopes={ask.scopes.filter((s) => s !== 'play').map((s) => SCOPE_TEXT[s])}
          // "play" is listed only to the people agent play is open to, who are granted it whether or not the app asked
          // (oauth.ts approve); anyone else is never granted it.
          play={AGENTS.minpentaiPlay.people.length ? { text: SCOPE_TEXT.play, people: [...AGENTS.minpentaiPlay.people] } : null}
          backHost={new URL(ask.redirectUri).host}
        />
      </div>
    );
  } catch (e) {
    return (
      <div className="page prose agent-authorize">
        <h1>Connect an agent</h1>
        <p role="alert">{W.bad} {e instanceof OAuthError ? e.message : 'something went wrong on our side.'}</p>
      </div>
    );
  }
}
