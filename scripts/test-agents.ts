/**
 * Agents that act for a person (owner, 2026-10-20; docs/agents/design.md). Fails (exit 1) on any problem.
 *
 *   npm run build && npm run test:agents
 *
 * Offline: every migration (0019 DRAFT included) in PGlite, the built site under `next start` with
 * AGENTS_TEST=1, two people signed in with test wallet sessions (scripts/lib/agents-harness.ts).
 * Checks, in groups:
 *  O  OAuth and discovery: 401 with the metadata pointer; metadata documents; registration; the person's
 *     Allow; PKCE; one-time codes (a reused code withdraws the agent's tokens); refresh tokens replaced,
 *     and a reused one withdraws everything; the resource binding; a bad redirect never followed.
 *  P  Agents never pose as people: an agent's token is refused by every person route.
 *  T  Tools: the list (no publish, spend or payment tool; write tools not read-only), whoami, every draft
 *     tool, book lines word for word, agent words labelled, character versions, scopes.
 *  D  Drafts stay private until the person publishes: piece page, image, list; only the person publishes.
 *  F  Feedback: a person's note and a second agent's note (draft, then published by its person); mentions
 *     of a person's agents; read_feedback; revisions with the credit chain, own and someone else's.
 *  I  Brought-in images: metadata removed, 16:9 only, a planted "known" hash refused and the agent
 *     disconnected, never stored.
 *  L  Limits: 3 agents per person; daily notes; disconnect stops the agent at once.
 *  W  Wallet agents: the link message, the agent's signature, its own sign-in, REST.
 *  S  Story words: the switch and the human-written-only list (in-process).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { startStage, connect, mcp, tool, ROOT } from './lib/agents-harness';

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// A planted "known" image, for the scan's refusal path (the stand-in matches only this hash).
const KNOWN = await sharp({ create: { width: 320, height: 180, channels: 3, background: { r: 200, g: 0, b: 0 } } }).png().toBuffer();
const S = await startStage({ scanner: sha(KNOWN) });
const { BASE, people } = S;
const asPerson = (token: string, url: string, init: RequestInit = {}) => fetch(BASE + url, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });

try {
  console.log('O  OAuth and discovery');
  const anon = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) });
  const www = anon.headers.get('www-authenticate') ?? '';
  check('O1 /mcp without a token: 401 with resource_metadata', anon.status === 401 && www.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`), `${anon.status} ${www}`);
  const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json();
  check('O2 protected resource metadata names /mcp exactly and this site as its server', prm.resource === `${BASE}/mcp` && prm.authorization_servers?.[0] === BASE, JSON.stringify(prm));
  const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
  check('O3 server metadata: S256 only, public clients, CIMD and DCR, iss in responses', JSON.stringify(asm.code_challenge_methods_supported) === '["S256"]' && JSON.stringify(asm.token_endpoint_auth_methods_supported) === '["none"]' && asm.client_id_metadata_document_supported === true && asm.authorization_response_iss_parameter_supported === true && asm.registration_endpoint === `${BASE}/api/oauth/register`);
  const badReg = await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'x', redirect_uris: ['http://evil.example/cb'] }) });
  check('O4 a plain-http redirect to another machine is refused at registration', badReg.status === 400);
  const page = await (await fetch(`${BASE}/oauth/authorize?client_id=nobody&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&response_type=code&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`, { redirect: 'manual' })).text();
  check('O5 an unknown client is shown an error on our page, never redirected', page.includes('can’t be used') && !page.includes('evil.example/cb?'));

  const a1 = await connect(BASE, people.A.token, 'Claude');
  check('O6 the person’s Allow sends back a code, the state and iss', !!a1.redirect.searchParams.get('code') && a1.redirect.searchParams.get('state') === 'st-Claude' && a1.redirect.searchParams.get('iss') === BASE);
  check('O7 the code becomes an hour’s access token and a refresh token', a1.access_token?.startsWith('sa1_') && a1.refresh_token?.startsWith('sr1_'));
  const reuse = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: a1.redirect.searchParams.get('code')!, code_verifier: a1.verifier, client_id: a1.client }) });
  check('O8 a code used twice is refused…', reuse.status === 400 && (await reuse.json()).error === 'invalid_grant');
  check('O9 …and the agent’s tokens are withdrawn', (await mcp(BASE, a1.access_token, 'ping')).status === 401);
  const a2 = await connect(BASE, people.A.token, 'Claude');
  check('O10 reconnecting the same client renews the same agent (still one agent)', ((await (await asPerson(people.A.token, '/api/agents')).json()).agents as unknown[]).length === 1);
  const r1 = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a2.refresh_token, client_id: a2.client }) });
  const r1j = await r1.json();
  check('O11 a refresh token gives new tokens, and a new refresh token', r1.ok && r1j.refresh_token && r1j.refresh_token !== a2.refresh_token);
  const r2 = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a2.refresh_token, client_id: a2.client }) });
  check('O12 a refresh token used twice is refused, and everything of that agent’s is withdrawn', r2.status === 400 && (await mcp(BASE, r1j.access_token, 'ping')).status === 401);
  const wrongVerifier = await (async () => {
    const reg = await (await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Pkce', redirect_uris: ['http://localhost:1/cb'] }) })).json();
    const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://localhost:1/cb', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' });
    const to = new URL((await (await asPerson(people.A.token, '/api/oauth/approve', { method: 'POST', body: JSON.stringify({ query: q.toString(), allow: true }) })).json()).to);
    return fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: to.searchParams.get('code')!, code_verifier: 'y'.repeat(43), client_id: reg.client_id }) });
  })();
  check('O13 a wrong PKCE verifier is refused', wrongVerifier.status === 400);
  const wrongResource = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: r1j.refresh_token, client_id: a2.client, resource: 'https://other.example/mcp' }) });
  check('O14 a token for another resource is refused', wrongResource.status === 400 && (await wrongResource.json()).error === 'invalid_target');
  const deny = await (await asPerson(people.C.token, '/api/oauth/approve', { method: 'POST', body: JSON.stringify({ query: a1.query.toString(), allow: false }) })).json();
  check('O15 “Don’t allow” sends back access_denied', new URL(deny.to).searchParams.get('error') === 'access_denied');

  // The agents used from here on: A's Claude, B's ChatGPT.
  const agentA = (await connect(BASE, people.A.token, 'Claude')).access_token;
  const agentB = (await connect(BASE, people.B.token, 'ChatGPT')).access_token;

  console.log('P  agents never pose as people');
  const you = await fetch(`${BASE}/api/you`, { headers: { authorization: `Bearer ${agentA}` } });
  const approveAsAgent = await fetch(`${BASE}/api/oauth/approve`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ query: a1.query.toString(), allow: true }) });
  const publishAsAgent = await fetch(`${BASE}/api/drafts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ what: 'version', id: '00000000-0000-4000-8000-000000000000', action: 'publish' }) });
  const noteAsAgent = await fetch(`${BASE}/api/notes`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ on: 'x', text: 'hi' }) });
  const agentsAsAgent = await fetch(`${BASE}/api/agents`, { headers: { authorization: `Bearer ${agentA}` } });
  check('P1 an agent’s token is refused as a person (You page, Allow, publish, notes, agents list)', [you, approveAsAgent, publishAsAgent, noteAsAgent, agentsAsAgent].every((r) => r.status === 401), [you, approveAsAgent, publishAsAgent, noteAsAgent, agentsAsAgent].map((r) => r.status).join(','));
  const asPersonToken = await mcp(BASE, people.A.token, 'ping');
  check('P2 a person’s token is not an agent’s at /mcp', asPersonToken.status === 401);

  console.log('T  tools');
  const init = await mcp(BASE, agentA, 'initialize', { protocolVersion: '2025-11-25' });
  check('T1 initialize answers 2025-11-25 with instructions', Boolean(init.body?.result && (init.body.result as { protocolVersion?: string }).protocolVersion === '2025-11-25'));
  const list = (await mcp(BASE, agentA, 'tools/list')).body?.result?.tools ?? [];
  const names = list.map((t) => t.name);
  check('T2 the tools: reads, drafts, feedback, notes, images; nothing that publishes, spends or pays', ['whoami', 'start_idea', 'draft_storyboard', 'draft_frames', 'draft_character_version', 'bring_in_image', 'read_feedback', 'propose_revision', 'leave_note', 'search_book'].every((n) => names.includes(n)) && !names.some((n) => /publish|spend|pay|buy|wallet|transfer/i.test(n)), names.join(','));
  check('T3 write tools are marked as writes, read tools read-only, every tool titled', list.every((t) => typeof t.annotations.title === 'string') && list.find((t) => t.name === 'start_idea')!.annotations.readOnlyHint === false && list.find((t) => t.name === 'search_book')!.annotations.readOnlyHint === true);
  const who = await tool(BASE, agentA, 'whoami');
  check('T4 whoami: “Claude, agent of @0xa11c…a11c”, drafts only', who.ok && String(who.out.you).startsWith('Claude, agent of @0xa11c') && String(who.out.rule).includes('your person publishes'), JSON.stringify(who.out));

  const chapter14 = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/text/chapter-14.json'), 'utf8')) as { blocks: { idx: number; kind: string; content: string }[] };
  const para = chapter14.blocks.find((b) => b.kind === 'paragraph' && b.content.replace(/<[^>]+>/g, '').length > 80)!;
  const plain = para.content.replace(/<[^>]+>/g, '').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
  const bookLine = plain.split(/(?<=[.!?])\s+/)[0];
  const idea = await tool(BASE, agentA, 'start_idea', { title: 'The cold rice', text: 'A short scene from Zei’s side: the dinner after the semi-final, told through the food going cold.', adaptation: 1, lines: [{ source: 'book', block: `c14-b${para.idx}`, text: bookLine }] });
  check('T5 start_idea: a private draft; a book line word for word is accepted', idea.ok && idea.out.status === 'draft', idea.error ?? '');
  const badBook = await tool(BASE, agentA, 'start_idea', { title: 'x', text: 'y', lines: [{ source: 'book', block: `c14-b${para.idx}`, text: bookLine.replace(/\w+/, 'Something') }] });
  check('T6 a book line that isn’t word for word is refused', !badBook.ok && /word for word/.test(badBook.error ?? ''));
  const agentWords = await tool(BASE, agentA, 'start_idea', { title: 'With a line', text: 'An idea with one line the agent wrote.', lines: [{ source: 'agent', speaker: 'Zei', text: 'Fifteen days is nothing.' }] });
  check('T7 agent-written story words are refused (story words stay human)', !agentWords.ok && /stay human/.test(agentWords.error ?? ''), agentWords.error ?? '');
  const hiddenScript = await tool(BASE, agentA, 'start_idea', { title: 'x', text: 'ZEI: "I will not lose again, not this time."' });
  check('T7b a script line hidden in the description is refused too', !hiddenScript.ok);
  const board = await tool(BASE, agentA, 'draft_storyboard', { title: 'Gate at dusk', adaptation: 1, version: 2, items: [{ shot: '0-EST', seconds: 3, note: 'hold on the hall' }, { shot: '1-FLOOR', seconds: 2 }] });
  check('T8 draft_storyboard from a published version’s shots', board.ok, board.error ?? '');
  const badShot = await tool(BASE, agentA, 'draft_storyboard', { title: 'x', adaptation: 1, version: 2, items: [{ shot: 'NOPE' }] });
  check('T9 a shot that isn’t in the version is refused', !badShot.ok);
  const frames = await tool(BASE, agentA, 'draft_frames', { title: 'Two prompts', adaptation: 1, version: 2, frames: [{ shot: '0-EST', prompt: 'A wide hall emptying after a match, evening light through tall windows.' }] });
  check('T10 draft_frames: prompts only', frames.ok, frames.error ?? '');
  const character = await tool(BASE, agentA, 'draft_character_version', { character: 'zei', description: 'Zei at eighteen in winter: a grey wool coat over the tournament jacket, hair cut short.' });
  check('T11 draft_character_version for a character with a design sheet', character.ok, character.error ?? '');
  const notChar = await tool(BASE, agentA, 'draft_character_version', { character: 'gandalf', description: 'x' });
  check('T12 a character the book doesn’t have is refused', !notChar.ok);
  const link = await tool(BASE, agentA, 'start_idea', { title: 'x', text: 'see https://example.com/thing' });
  check('T13 links only to snowmoon.party', !link.ok && /snowmoon\.party/.test(link.error ?? ''));
  const readOnly = (await connect(BASE, people.C.token, 'Reader', 'read')).access_token;
  const scoped = await tool(BASE, readOnly, 'start_idea', { title: 'x', text: 'y' });
  const scopedList = ((await mcp(BASE, readOnly, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
  check('T14 an agent given only "read" sees no draft tools and can’t draft', !scoped.ok && !scopedList.includes('start_idea') && scopedList.includes('search_book'));

  console.log('D  drafts stay private until the person publishes');
  const ideaPiece = idea.out.piece as string;
  const ideaVersion = idea.out.version as string;
  check('D1 a draft’s piece page is not found', (await fetch(`${BASE}/p/${ideaPiece}`)).status === 404);
  check('D2 the person sees it in their review list', ((await (await asPerson(people.A.token, '/api/drafts')).json()).drafts as { id: string }[]).some((d) => d.id === ideaVersion));
  const bPublishesA = await asPerson(people.B.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: ideaVersion, action: 'publish' }) });
  check('D3 someone else can’t publish it', bPublishesA.status === 404);
  const pub = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: ideaVersion, action: 'publish' }) });
  const ideaPage = await (await fetch(`${BASE}/p/${ideaPiece}`)).text();
  check('D4 the person publishes; the page shows it with “Claude, agent of @…”', pub.ok && ideaPage.includes('The cold rice') && ideaPage.includes('Claude, agent of @0xa11c'));
  check('D5 an idea the agent had itself is the agent’s in the stamp, not the person’s', ideaPage.includes('Idea by Claude, agent of @0xa11c') && !ideaPage.includes('Idea by @0xa11c'));

  console.log('R  requests (the person’s words), the stamp, and reacting');
  const said = 'A scene where Bai teaches Zei to wait. She says: Don’t rush it, Zei. And for once he sits still.';
  const reqRes = await asPerson(people.A.token, '/api/requests', { method: 'POST', body: JSON.stringify({ kind: 'idea', words: said }) });
  const reqId = (await reqRes.json()).id as string;
  check('R1 a person tells their agent an idea', reqRes.ok && /^[0-9a-f-]{36}$/.test(reqId));
  const rr = (await tool(BASE, agentA, 'read_requests')).out.requests as { id: string; words: string; kind: string }[];
  check('R2 the agent reads it, in the person’s own words', rr.some((r) => r.id === reqId && r.words === said && r.kind === 'idea'));
  const bReq = (await (await asPerson(people.B.token, '/api/requests', { method: 'POST', body: JSON.stringify({ kind: 'idea', words: 'B’s own idea.' }) })).json()).id as string;
  const stolen = await tool(BASE, agentA, 'start_idea', { title: 'x', text: 'y', answering: bReq });
  check('R3 an agent can’t answer someone else’s request (or claim their idea)', !stolen.ok);
  const wrongLine = await tool(BASE, agentA, 'draft_storyboard', { title: 'Wait', adaptation: 1, version: 2, items: [{ shot: '0-EST' }], lines: [{ source: 'person', speaker: 'Bai', text: 'Take your time, Zei.' }], answering: reqId });
  check('R4 a “person’s line” that isn’t in what they said is refused', !wrongLine.ok && /typed or said/.test(wrongLine.error ?? ''));
  const made = await tool(BASE, agentA, 'draft_storyboard', { title: 'Wait', adaptation: 1, version: 2, items: [{ shot: '0-EST', seconds: 3, note: 'hold on the hall' }, { shot: '1-FLOOR', seconds: 2 }], lines: [{ source: 'person', speaker: 'Bai', text: 'Don’t rush it, Zei.' }], answering: reqId });
  check('R5 the agent makes it, placing the person’s own line word for word', made.ok, made.error ?? '');
  const st = made.out.stamp as { idea?: { person?: number; words?: string }; words?: { person?: unknown }; made_by?: string };
  check('R6 its stamp: idea and words by the person (their words kept), made by the agent', st.idea?.person === people.A.person && st.idea?.words === said && !!st.words?.person && String(st.made_by).startsWith('Claude, agent of'));
  check('R7 the request is answered (off the to-do list)', !((await tool(BASE, agentA, 'read_requests')).out.requests as { id: string }[]).some((r) => r.id === reqId));
  const more = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: made.out.version, action: 'more', words: 'End on his hands, not the hall.', spoken: true }) });
  const moreId = (await more.json()).request as string;
  check('R8 “Say more” (spoken) becomes the agent’s next request on that draft', more.ok && ((await tool(BASE, agentA, 'read_requests')).out.requests as { id: string; kind: string }[]).some((r) => r.id === moreId && r.kind === 'more'));
  const v2 = await tool(BASE, agentA, 'propose_revision', { of: made.out.version, answering: moreId, changes: { items: [{ shot: '0-EST', seconds: 2 }, { shot: '1-FLOOR', seconds: 3, note: 'end on his hands' }] } });
  const draftsNow = (await (await asPerson(people.A.token, '/api/drafts')).json()).drafts as { id: string; piece: string; stamp: { feedback?: { own: boolean; spoken: boolean }[]; idea?: { person: number } } }[];
  const mine = draftsNow.filter((d) => d.piece === made.out.piece);
  check('R9 the revision replaces the draft in the review list, keeps the idea, adds the person’s spoken note', v2.ok && mine.length === 1 && mine[0].id === v2.out.version && mine[0].stamp.idea?.person === people.A.person && !!mine[0].stamp.feedback?.some((f) => f.own && f.spoken), v2.error ?? JSON.stringify(mine));
  const again = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: v2.out.version, action: 'again' }) });
  const againId = (await again.json()).request as string;
  const afterAgain = (await (await asPerson(people.A.token, '/api/drafts')).json()).drafts as { piece: string }[];
  check('R10 “Try again” takes the draft away and asks the agent again', again.ok && !afterAgain.some((d) => d.piece === made.out.piece) && ((await tool(BASE, agentA, 'read_requests')).out.requests as { id: string; kind: string }[]).some((r) => r.id === againId && r.kind === 'again'));
  const v3 = await tool(BASE, agentA, 'propose_revision', { of: v2.out.version, answering: againId, changes: { items: [{ shot: '1-FLOOR', seconds: 3 }, { shot: '0-EST', seconds: 2 }] } });
  const kept = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: v3.out.version, action: 'keep' }) });
  const keptPage = await (await fetch(`${BASE}/p/${made.out.piece}`)).text();
  check('R11 Keep publishes it; the page shows the stamp “Idea and words by @…” and the person’s own words', v3.ok && kept.ok && keptPage.includes('Idea and words by @0xa11c') && keptPage.includes('teaches Zei to wait'), v3.error ?? '');
  const details = keptPage.indexOf('<details');
  const firstShotId = keptPage.indexOf('1-FLOOR');
  check('R12 the machinery (shot ids, timings) is behind Recipe, not in the default view', details > 0 && firstShotId > details && keptPage.includes('Recipe'));
  const momentReq = await asPerson(people.A.token, '/api/requests', { method: 'POST', body: JSON.stringify({ kind: 'idea', words: 'Here, let the silence go longer.', moment: '1/2/0-EST' }) });
  const badMoment = await asPerson(people.A.token, '/api/requests', { method: 'POST', body: JSON.stringify({ kind: 'idea', words: 'x', moment: '1/2/NOPE' }) });
  check('R13 a note on a moment becomes a request about that moment; a moment that isn’t there is refused', momentReq.ok && badMoment.status === 400);
  const audio = Buffer.from('RIFF0000WAVEfmt fake recording bytes');
  const tr = await fetch(`${BASE}/api/requests/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav', authorization: `Bearer ${people.A.token}` }, body: audio });
  const trj = await tr.json();
  check('R14 speaking: the recording comes back as words to check (labelled stand-in here)', tr.ok && trj.text === 'Bai tells Zei to slow down, and this time he listens.' && /stand-in/.test(trj.by));
  const trAnon = await fetch(`${BASE}/api/requests/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: audio });
  const trText = await fetch(`${BASE}/api/requests/transcribe`, { method: 'POST', headers: { 'content-type': 'text/plain', authorization: `Bearer ${people.A.token}` }, body: 'x' });
  check('R15 speaking needs a person’s sign-in and audio', trAnon.status === 401 && trText.status === 400);
  const audioCols = await S.pg.query<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_schema = 'studio' and (data_type = 'bytea' or column_name ~ 'audio|recording')`);
  check('R16 no recording is kept: no table has a place for audio', audioCols.rows[0].n === 0, String(audioCols.rows[0].n));
  const agentRequest = await fetch(`${BASE}/api/requests`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ kind: 'idea', words: 'an agent pretending to be its person' }) });
  check('R17 an agent can’t put words in its person’s mouth (a request needs the person’s sign-in)', agentRequest.status === 401);

  console.log('F  feedback, revisions and credit');
  const personNote = await asPerson(people.B.token, '/api/notes', { method: 'POST', body: JSON.stringify({ on: ideaVersion, text: `Lovely. @${people.A.address}'s agent, could the rice go cold in two beats, not one?` }) });
  const pn = await personNote.json();
  check('F1 a person’s note is public at once, and mentions A’s agents', personNote.ok && pn.note.status === 'published' && pn.note.mentions.some((m: { kind: string }) => m.kind === 'agents'), JSON.stringify(pn));
  const bNote = await tool(BASE, agentB, 'leave_note', { on: ideaVersion, text: 'Agent note: the idea could open on the empty bowls instead of the players.' });
  check('F2 a second agent’s note is a draft, labelled as from an agent', bNote.ok && bNote.out.status === 'draft' && String(bNote.out.label).includes('ChatGPT, agent of'), bNote.error ?? '');
  const beforePublish = (await tool(BASE, agentA, 'read_feedback')).out.notes as { agent: string | null }[];
  check('F3 read_feedback doesn’t see the other agent’s note before its person publishes it', beforePublish.length === 1 && beforePublish[0].agent === null);
  const dup = await tool(BASE, agentB, 'leave_note', { on: ideaVersion, text: 'Agent note: the idea could open on the empty bowls instead of the players.' });
  check('F4 the same note twice is refused', !dup.ok);
  await asPerson(people.B.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'note', id: bNote.out.note, action: 'publish' }) });
  const fb = (await tool(BASE, agentA, 'read_feedback')).out.notes as { agent: string | null; addressedToAgents: boolean; text: string }[];
  check('F5 read_feedback: both notes, the person’s addressed to A’s agents, the agent’s labelled', fb.length === 2 && fb.some((n) => n.addressedToAgents && n.agent === null) && fb.some((n) => n.agent?.startsWith('ChatGPT, agent of')), JSON.stringify(fb));
  const own = await tool(BASE, agentA, 'propose_revision', { of: ideaVersion, changes: { text: 'A short scene from Zei’s side: the rice goes cold in two beats, and the scene opens on the empty bowls.' } });
  check('F6 a revision of the person’s own piece is its next version, crediting version 1', own.ok && own.out.n === 2 && own.out.piece === ideaPiece && (own.out.credit as { n: number }[])[0].n === 1, own.error ?? '');
  await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: own.out.version, action: 'publish' }) });
  const remix = await tool(BASE, agentB, 'propose_revision', { of: own.out.version, title: 'Cold rice, from the waiter’s side', changes: { text: 'The same dinner, seen by the robot waiter clearing the bowls.' } });
  check('F7 a revision of someone else’s published version is a new piece of B’s, crediting the chain', Boolean(remix.ok && remix.out.piece !== ideaPiece && (remix.out.credit as { agent: string | null; n: number }[]).length === 2 && (remix.out.credit as { agent: string | null }[])[0].agent?.startsWith('Claude, agent of')), JSON.stringify(remix.out));
  await asPerson(people.B.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: remix.out.version, action: 'publish' }) });
  const remixPage = await (await fetch(`${BASE}/p/${remix.out.piece}`)).text();
  check('F8 the remix’s page says “Revised from Claude, agent of @…”', remixPage.includes('Revised from') && remixPage.includes('Claude, agent of'));
  const draftRemix = await tool(BASE, agentB, 'propose_revision', { of: board.out.version, changes: {} });
  check('F9 someone else’s draft can’t be seen or revised', !draftRemix.ok);

  console.log('I  brought-in images');
  const withGps = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 60, b: 90 } } })
    .withExif({ IFD0: { Artist: 'someone', ImageDescription: 'secret place' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } }).jpeg().toBuffer();
  check('I0 the test image carries metadata (EXIF and GPS)', !!(await sharp(withGps).metadata()).exif);
  const img = await tool(BASE, agentA, 'bring_in_image', { title: 'The hall, redrawn', image_base64: withGps.toString('base64'), adaptation: 1, version: 2, shot: '0-EST', recipe: { prompt: 'A wide hall emptying after a match', model: { name: 'Some image model', maker: 'Some lab', weights: 'closed', ran_on: 'my own subscription' }, inputs: [{ sha256: 'f'.repeat(64), what: 'not ours' }] } });
  check('I1 a 16:9 JPEG is taken in as a draft, labelled “Brought in … recipe as declared, not checked”', img.ok && String(img.out.label).includes('recipe as declared, not checked'), img.error ?? '');
  const stored = readdirSync(path.join(S.store, 'brought-in'));
  const storedBytes = readFileSync(path.join(S.store, 'brought-in', stored[0]));
  check('I2 stored with every piece of metadata removed', stored.length === 1 && !(await sharp(storedBytes).metadata()).exif);
  const draftImg = await fetch(`${BASE}/api/pieces/image/${img.out.version}`);
  const ownImg = await asPerson(people.A.token, `/api/pieces/image/${img.out.version}`);
  check('I3 the draft image is hidden from everyone but its person', draftImg.status === 404 && ownImg.ok);
  const aiWords = await tool(BASE, agentA, 'bring_in_image', { title: 'A card with words on it', words: 'ai', image_base64: withGps.toString('base64'), recipe: { prompt: 'A card with a line of dialogue on it', model: { name: 'Some image model', maker: 'Some lab', weights: 'closed' }, inputs: [] } });
  await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: aiWords.out.version, action: 'keep' }) });
  const everything = await (await fetch(`${BASE}/p`)).text();
  const humanOnly = await (await fetch(`${BASE}/p?words=human`)).text();
  check('I3b a brought-in piece with AI-written words is labelled, and “human-written only” leaves it out', aiWords.ok && everything.includes('A card with words on it') && everything.includes('AI-written words') && !humanOnly.includes('A card with words on it'), aiWords.error ?? '');
  const square = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  const sq = await tool(BASE, agentA, 'bring_in_image', { title: 'x', image_base64: square.toString('base64'), recipe: { prompt: 'x', model: { name: 'm', maker: 'k', weights: 'open' }, inputs: [] } });
  check('I4 an image that isn’t 16:9 is refused', !sq.ok && /16:9/.test(sq.error ?? ''));
  const junk = await tool(BASE, agentA, 'bring_in_image', { title: 'x', image_base64: Buffer.from('not an image at all').toString('base64'), recipe: { prompt: 'x', model: { name: 'm', maker: 'k', weights: 'open' }, inputs: [] } });
  check('I5 bytes that aren’t an image are refused', !junk.ok);
  const throwaway = (await connect(BASE, people.C.token, 'Throwaway')).access_token;
  const known = await tool(BASE, throwaway, 'bring_in_image', { title: 'x', image_base64: KNOWN.toString('base64'), recipe: { prompt: 'x', model: { name: 'm', maker: 'k', weights: 'open' }, inputs: [] } });
  check('I6 a planted “known” image is refused, and the agent is disconnected at once', !known.ok && /disconnected/.test(known.error ?? '') && (await mcp(BASE, throwaway, 'ping')).status === 401);
  check('I7 …and nothing of it was stored', readdirSync(path.join(S.store, 'brought-in')).length === 1);

  console.log('L  limits and disconnecting');
  const c2 = await connect(BASE, people.C.token, 'Second');
  const c3 = await connect(BASE, people.C.token, 'Third').catch(() => null);
  const fourth = await (async () => {
    const reg = await (await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Fourth', redirect_uris: ['http://localhost:2/cb'] }) })).json();
    const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://localhost:2/cb', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' });
    return asPerson(people.C.token, '/api/oauth/approve', { method: 'POST', body: JSON.stringify({ query: q.toString(), allow: true }) });
  })();
  check('L1 a fourth live agent is refused (Reader, Second, Third are live)', fourth.status === 409 && !!c2.access_token && !!c3?.access_token, String(fourth.status));
  let refusedAt = 0;
  for (let i = 1; i <= 21; i++) {
    const n = await tool(BASE, agentB, 'leave_note', { on: ideaVersion, text: `Note number ${i} on the cold rice.` });
    if (!n.ok) { refusedAt = i; break; }
  }
  check('L2 notes: 20 a day per agent (counting the two earlier tries), then refused', refusedAt === 19, String(refusedAt));
  const agentsOfA = (await (await asPerson(people.A.token, '/api/agents')).json()).agents as { id: string }[];
  const off = await asPerson(people.A.token, '/api/agents', { method: 'POST', body: JSON.stringify({ action: 'disconnect', id: agentsOfA[0].id }) });
  check('L3 Disconnect stops the agent at once', off.ok && (await mcp(BASE, agentA, 'ping')).status === 401);
  const stillThere = (await (await asPerson(people.A.token, '/api/drafts')).json()).drafts as unknown[];
  check('L4 …and its drafts stay with the person', stillThere.length >= 3);

  console.log('W  wallet agents');
  const robot = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  const started = await (await asPerson(people.B.token, '/api/agents', { method: 'POST', body: JSON.stringify({ action: 'wallet', name: 'Fleet bot 1', address: robot.address }) })).json();
  check('W1 the person names a wallet agent and gets the message it must sign', typeof started.message === 'string' && started.message.includes('I am an agent of @0xb0b0'));
  const wrongSig = await fetch(`${BASE}/api/agents/wallet/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link: started.id, signature: await privateKeyToAccount('0x' + '1'.repeat(64) as `0x${string}`).signMessage({ message: started.message }) }) });
  check('W2 another wallet’s signature doesn’t link it', wrongSig.status === 400);
  const linked = await fetch(`${BASE}/api/agents/wallet/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link: started.id, signature: await robot.signMessage({ message: started.message }) }) });
  check('W3 the agent’s own signature links it', linked.ok);
  const nonce = await (await fetch(`${BASE}/api/wallet/nonce`)).json();
  const siwe = createSiweMessage({ address: robot.address, chainId: nonce.chainId, domain: nonce.domain, nonce: nonce.nonce, uri: nonce.uri, version: '1', statement: nonce.statement, issuedAt: new Date() });
  const tokRes = await fetch(`${BASE}/api/agents/wallet/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: siwe, signature: await robot.signMessage({ message: siwe }) }) });
  const walletTok = (await tokRes.json()).access_token as string;
  check('W4 the linked agent signs in for an hour’s token', tokRes.ok && walletTok?.startsWith('sa1_'));
  const rest = await fetch(`${BASE}/api/agent/v1/whoami`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${walletTok}` }, body: '{}' });
  check('W5 REST works with it: “Fleet bot 1, agent of @0xb0b0…”', rest.ok && String((await rest.json()).you).startsWith('Fleet bot 1, agent of @0xb0b0'));
  const restAnon = await fetch(`${BASE}/api/agent/v1/whoami`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('W6 REST without a token: 401', restAnon.status === 401);

  console.log('S  story words, in-process');
  const filter = await import('../src/lib/agents/filter');
  const { AGENTS } = await import('../src/lib/config');
  check('S1 story words stay human: agents’ own lines are refused by default', filter.storyWordsAllowed(-5) === false && AGENTS.storyWords === 'refused');
  check('S2 never for the owner (human-written only)', filter.storyWordsAllowed(6786) === false);
  let refusedForOwner = false;
  (AGENTS as { storyWords: string }).storyWords = 'allowed';
  try { filter.checkLines([{ source: 'agent', text: 'A line.' }], 6786); } catch { refusedForOwner = true; }
  check('S3 even with the old switch on, an agent line for the owner is refused', refusedForOwner);
  const tw = filter.checkText('ZEI: "I will not lose again."', 'text', 500, -5);
  check('S4 (old switch on) a script line hidden in free text counts as the agent’s story words', tw.wordsByAgent === true);
  const okPerson = filter.checkLines([{ source: 'person', text: 'Don’t rush it, Zei.' }], -5, ['She says: Don’t rush it, Zei. And he sits.']);
  check('S4c a person’s line is accepted when it is in what they said, word for word', okPerson.personWords === true);
  const dir = filter.checkText('Hold on the room before anyone speaks. We see Zei cross the lobby, eyes down.', 'note', 500, -5);
  check('S4b a shot direction or description is not story words', dir.wordsByAgent === false);
  (AGENTS as { storyWords: string }).storyWords = 'refused';
  let refusedAll = false;
  try { filter.checkLines([{ source: 'agent', text: 'A line.' }], -5); } catch { refusedAll = true; }
  check('S5 with the switch back at "refused", agent lines are refused for everyone', refusedAll);
} catch (e) {
  failures.push(`crashed: ${(e as Error).stack ?? e}`);
} finally {
  await S.stop();
}
if (S.serverErr().includes('Error')) console.log('server stderr (tail):\n' + S.serverErr().split('\n').slice(-15).join('\n'));
if (failures.length) {
  console.error(`AGENT TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`agent tests passed: ${passed} checks (OAuth, never a person, tools, drafts private, feedback and credit, images, limits, wallet agents, story words)`);
