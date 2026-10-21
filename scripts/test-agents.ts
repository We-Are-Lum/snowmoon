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
 *  G  P4a (in-process): an agent's draft-only route passes; one that can publish, or keep, fails.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { startStage, connect, mcp, tool, ROOT, cimdDocs } from './lib/agents-harness';
import { AGENTS as AGENT_CONFIG } from '../src/lib/config';

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
  check('O3 server metadata: S256 only, public clients, CIMD and DCR, iss in responses', JSON.stringify(asm.code_challenge_methods_supported) === '["S256"]' && JSON.stringify(asm.token_endpoint_auth_methods_supported) === '["none","private_key_jwt"]' && asm.client_id_metadata_document_supported === true && asm.authorization_response_iss_parameter_supported === true && asm.registration_endpoint === `${BASE}/api/oauth/register`);
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

  console.log('J  a metadata-document client that signs its token requests (private_key_jwt), as ChatGPT does');
  {
    const { generateKeyPairSync, sign: rsaSign, randomBytes: rb, createHash: ch } = await import('node:crypto');
    const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const cid = 'https://cimd.test/chatgpt-like';
    const cb = 'https://chatgpt.example/connector/oauth/callback';
    cimdDocs.set('/chatgpt-like', { client_id: cid, client_name: 'ChatGPT', redirect_uris: [cb], token_endpoint_auth_method: 'private_key_jwt', jwks_uri: 'https://cimd.test/chatgpt-like/jwks' });
    cimdDocs.set('/chatgpt-like/jwks', { keys: [{ ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] });
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = () => Math.floor(Date.now() / 1000);
    const assertion = (over: Record<string, unknown> = {}, key = kp.privateKey) => {
      const head = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${b64({ iss: cid, sub: cid, aud: `${BASE}/api/oauth/token`, iat: now(), exp: now() + 120, jti: rb(12).toString('hex'), ...over })}`;
      return `${head}.${rsaSign('sha256', Buffer.from(head), key).toString('base64url')}`;
    };
    const AT = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
    const verifier = rb(32).toString('base64url');
    const q = new URLSearchParams({ response_type: 'code', client_id: cid, redirect_uri: cb, code_challenge: ch('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'st-gpt', resource: `${BASE}/mcp` });
    const ok = await asPerson(people.A.token, '/api/oauth/approve', { method: 'POST', body: JSON.stringify({ query: q.toString(), allow: true }) });
    const code = new URL(((await ok.json()) as { to?: string }).to ?? 'http://x/').searchParams.get('code') ?? '';
    const tokenWith = (extra: Record<string, string>, base: Record<string, string> = { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: cb }) =>
      fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...base, client_id: cid, resource: `${BASE}/mcp`, ...extra }) });
    check('J1 server metadata offers none and private_key_jwt, with the signing algorithms', JSON.stringify(asm.token_endpoint_auth_methods_supported) === '["none","private_key_jwt"]' && asm.token_endpoint_auth_signing_alg_values_supported?.includes('RS256'));
    check('J2 a private_key_jwt metadata document is accepted at sign-in, and the person’s Allow sends back a code', ok.ok && !!code);
    const noAssert = await tokenWith({});
    check('J3 without its signed assertion, the token request is refused (invalid_client, 401)', noAssert.status === 401 && (await noAssert.json()).error === 'invalid_client');
    const wrongKey = await tokenWith({ client_assertion_type: AT, client_assertion: assertion({}, stranger.privateKey) });
    const wrongAud = await tokenWith({ client_assertion_type: AT, client_assertion: assertion({ aud: 'https://elsewhere.example/token' }) });
    const expired = await tokenWith({ client_assertion_type: AT, client_assertion: assertion({ exp: now() - 120 }) });
    const otherIss = await tokenWith({ client_assertion_type: AT, client_assertion: assertion({ iss: 'https://cimd.test/someone-else', sub: 'https://cimd.test/someone-else' }) });
    check('J4 an assertion signed by another key, for another audience, expired, or from another client is refused', [wrongKey, wrongAud, expired, otherIss].every((r) => r.status === 401), [wrongKey, wrongAud, expired, otherIss].map((r) => r.status).join(','));
    const good = await tokenWith({ client_assertion_type: AT, client_assertion: assertion() });
    const goodJ = (await good.json()) as { access_token?: string; refresh_token?: string };
    check('J5 with a valid assertion and the PKCE verifier, the code becomes tokens that work at /mcp', good.ok && !!goodJ.access_token && (await mcp(BASE, goodJ.access_token!, 'ping')).status === 200, JSON.stringify(goodJ).slice(0, 200));
    const refreshBase = { grant_type: 'refresh_token', refresh_token: goodJ.refresh_token ?? '' };
    const refreshBare = await tokenWith({}, refreshBase);
    const refreshed = await tokenWith({ client_assertion_type: AT, client_assertion: assertion() }, refreshBase);
    check('J6 a refresh needs a fresh assertion too', refreshBare.status === 401 && refreshed.ok);
    const badVerifier = await (async () => {
      const r = await asPerson(people.A.token, '/api/oauth/approve', { method: 'POST', body: JSON.stringify({ query: q.toString(), allow: true }) });
      const c2 = new URL(((await r.json()) as { to: string }).to).searchParams.get('code') ?? '';
      return tokenWith({ client_assertion_type: AT, client_assertion: assertion() }, { grant_type: 'authorization_code', code: c2, code_verifier: rb(32).toString('base64url'), redirect_uri: cb });
    })();
    check('J7 PKCE is still required for a signing client: a wrong verifier is refused even with a valid assertion', badVerifier.status === 400 && (await badVerifier.json()).error === 'invalid_grant');
    cimdDocs.set('/secret-client', { client_id: 'https://cimd.test/secret-client', client_name: 'S', redirect_uris: [cb], token_endpoint_auth_method: 'client_secret_basic' });
    const secretPage = await (await fetch(`${BASE}/oauth/authorize?client_id=${encodeURIComponent('https://cimd.test/secret-client')}&redirect_uri=${encodeURIComponent(cb)}&response_type=code&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`)).text();
    const publicWithAssertion = await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x', client_id: a2.client, client_assertion_type: AT, client_assertion: assertion() }) });
    check('J8 a metadata document asking for a client secret is still refused; a public client may not send an assertion', secretPage.includes('can’t be used') && publicWithAssertion.status === 401);
    // This test's agent is ended, so the counts below are as before.
    await S.pg.query(`update studio.agents set revoked_at = now() where person = $1 and client_id = $2`, [people.A.person, cid]);
  }

  // The agents used from here on: A's Claude, B's ChatGPT.
  const agentA = (await connect(BASE, people.A.token, 'Claude')).access_token;
  const agentB = (await connect(BASE, people.B.token, 'ChatGPT')).access_token;

  console.log('P  agents never pose as people');
  const you = await fetch(`${BASE}/api/you`, { headers: { authorization: `Bearer ${agentA}` } });
  const approveAsAgent = await fetch(`${BASE}/api/oauth/approve`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ query: a1.query.toString(), allow: true }) });
  const publishAsAgent = await fetch(`${BASE}/api/drafts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ what: 'version', id: '00000000-0000-4000-8000-000000000000', action: 'publish' }) });
  const noteAsAgent = await fetch(`${BASE}/api/notes`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ on: 'x', text: 'hi' }) });
  const agentsAsAgent = await fetch(`${BASE}/api/agents`, { headers: { authorization: `Bearer ${agentA}` } });
  check('P1 an agent’s token is refused as a person (You page, Allow, publish, notes, agents list)', [you, approveAsAgent, publishAsAgent, noteAsAgent, agentsAsAgent].every((r) => r.status === 401 || r.status === 404), [you, approveAsAgent, publishAsAgent, noteAsAgent, agentsAsAgent].map((r) => r.status).join(','));
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
  check('R15 speaking needs a person’s sign-in and audio', (trAnon.status === 401 || trAnon.status === 404) && trText.status === 400);
  const audioCols = await S.pg.query<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_schema = 'studio' and (data_type = 'bytea' or column_name ~ 'audio|recording')`);
  check('R16 no recording is kept: no table has a place for audio', audioCols.rows[0].n === 0, String(audioCols.rows[0].n));
  const agentRequest = await fetch(`${BASE}/api/requests`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA}` }, body: JSON.stringify({ kind: 'idea', words: 'an agent pretending to be its person' }) });
  check('R17 an agent can’t put words in its person’s mouth (a request needs the person’s sign-in)', agentRequest.status === 401 || agentRequest.status === 404);

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
  const own = await tool(BASE, agentA, 'propose_revision', { of: ideaVersion, notes: [pn.note.id, bNote.out.note], changes: { text: 'A short scene from Zei’s side: the rice goes cold in two beats, and the scene opens on the empty bowls.' } });
  check('F6 a revision of the person’s own piece is its next version, crediting version 1', own.ok && own.out.n === 2 && own.out.piece === ideaPiece && (own.out.credit as { n: number }[])[0].n === 1, own.error ?? '');
  const ownStamp = own.out.stamp as { feedback?: { person: number }[]; agent_notes?: { agent: string }[] };
  check('F6b a person’s note counts as their feedback in the stamp; an agent’s note is credited to the agent, never to its person', (ownStamp.feedback ?? []).length === 1 && ownStamp.feedback![0].person === people.B.person && (ownStamp.agent_notes ?? []).length === 1 && ownStamp.agent_notes![0].agent.startsWith('ChatGPT, agent of'), JSON.stringify(ownStamp));
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

  console.log('E  editing your own adaptation (drafts; spending only after approval)');
  const edA = (await connect(BASE, people.A.token, 'Claude')).access_token;
  const v2data = JSON.parse(readFileSync(path.join(ROOT, 'public/editor/1/v2/data.json'), 'utf8')) as { shots: { id: string; lines?: { cue: string; takes?: { id: string }[] }[] }[] };
  const withLine = v2data.shots.find((x) => (x.lines ?? []).some((l) => (l.takes ?? []).length > 1))!;
  const line = withLine.lines!.find((l) => (l.takes ?? []).length > 1)!;
  const takes = await tool(BASE, edA, 'list_takes', { adaptation: 1, version: 2, shot: withLine.id });
  check('E1 list_takes: the lines of a shot of their own version and the takes for each', takes.ok && (takes.out.lines as { cue: string; takes: string[] }[]).some((l) => l.cue === line.cue && l.takes.length > 1), takes.error ?? '');
  const notMine = await tool(BASE, edA, 'try_frame', { adaptation: 1, version: 1, shot: withLine.id, note: 'Warmer light.' });
  check('E2 a version someone else made can’t be edited', !notMine.ok && /own versions/.test(notMine.error ?? ''));
  const tf = await tool(BASE, edA, 'try_frame', { adaptation: 1, version: 2, shot: withLine.id, note: 'Warmer light, and Bai a little closer to him.' });
  const tfDraft = (await (await asPerson(people.A.token, '/api/drafts')).json()).drafts.find((d: { id: string }) => d.id === tf.out.version) as { approved: boolean; spentUsd: number | null; image: unknown };
  check('E3 try_frame is a draft with an estimate, waiting for approval; nothing is made or spent yet', tf.ok && Number((tf.out.change as { estimate_usd: number }).estimate_usd) > 0 && tfDraft && !tfDraft.approved && tfDraft.spentUsd === null && !tfDraft.image, tf.error ?? JSON.stringify(tfDraft));
  const bRuns = await asPerson(people.B.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: tf.out.version, action: 'run' }) });
  check('E4 nobody else can approve the spend', bRuns.status === 404);
  const run = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: tf.out.version, action: 'run' }) });
  const ranDraft = (await (await asPerson(people.A.token, '/api/drafts')).json()).drafts.find((d: { id: string }) => d.id === tf.out.version) as { approved: boolean; spentUsd: number | null; made: { label: string; kind: string } | null };
  const frameImg = await asPerson(people.A.token, `/api/pieces/image/${tf.out.version}`);
  check('E5 the person approves: the frame is made (Remix’s pipeline, stand-in model here), kept private, its cost recorded', run.ok && ranDraft.approved && ranDraft.spentUsd !== null && ranDraft.made?.label === 'Made here' && frameImg.ok && frameImg.headers.get('content-type') === 'image/jpeg', `${run.status} ${JSON.stringify(ranDraft)}`);
  const anonImg = await fetch(`${BASE}/api/pieces/image/${tf.out.version}`);
  check('E6 the made frame is private to its person', anonImg.status === 404);
  const twice = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: tf.out.version, action: 'run' }) });
  check('E7 approved once only (no double spending)', twice.status === 409);
  const otherTake = line.takes!.map((t) => t.id).find((id) => id !== (takes.out.lines as { cue: string; in_use: string | null }[]).find((l) => l.cue === line.cue)?.in_use) ?? line.takes![0].id;
  const sw = await tool(BASE, edA, 'swap_take', { adaptation: 1, version: 2, shot: withLine.id, cue: line.cue, take: otherTake });
  const swBad = await tool(BASE, edA, 'swap_take', { adaptation: 1, version: 2, shot: withLine.id, cue: line.cue, take: 'no-such-take' });
  check('E8 swap_take drafts another of the line’s own takes; a take that isn’t there is refused', sw.ok && !swBad.ok, sw.error ?? '');
  const tm = await tool(BASE, edA, 'change_timing', { adaptation: 1, version: 2, shot: withLine.id, seconds: 4 });
  const tmBad = await tool(BASE, edA, 'change_timing', { adaptation: 1, version: 2, shot: withLine.id, seconds: 0.1 });
  check('E9 change_timing drafts a new length; under 0.3 s is refused', tm.ok && !tmBad.ok && (tm.out.change as { was: { from_s: number } }).was.from_s >= 0);
  const sp = await tool(BASE, edA, 'mark_speaking', { adaptation: 1, version: 2, shot: withLine.id, who: ['Bai'] });
  check('E10 mark_speaking drafts who speaks', sp.ok && JSON.stringify((sp.out.change as { who: string[] }).who) === '["Bai"]');
  const vt = await tool(BASE, edA, 'request_video_test', { adaptation: 1, version: 2, shot: withLine.id, note: 'Steam rising from the cup; the camera holds.' });
  const vrun = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: vt.out.version, action: 'run' }) });
  const vid = await asPerson(people.A.token, `/api/pieces/image/${vt.out.version}`);
  check('E11 a video test runs only on approval (fal stood in), kept private, its estimate recorded', vt.ok && vrun.ok && vid.ok && vid.headers.get('content-type') === 'video/mp4', `${vt.error ?? ''} ${vrun.status}`);
  let capAt = 0;
  for (let i = 2; i <= 6; i++) {
    const more = await tool(BASE, edA, 'request_video_test', { adaptation: 1, version: 2, shot: withLine.id, note: `Test ${i}.` });
    const r = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: more.out.version, action: 'run' }) });
    if (!r.ok) { capAt = i; check('E12 the daily cap stops the sixth video test, saying why', r.status === 429 && /most for today/.test((await r.json()).error ?? '')); break; }
  }
  check('E12b …at exactly the sixth', capAt === 6, String(capAt));
  const editList = ((await mcp(BASE, edA, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
  check('E13 still nothing that publishes, spends on its own, or pays', ['try_frame', 'swap_take', 'change_timing', 'mark_speaking', 'request_video_test', 'log_gap'].every((n) => editList.includes(n)) && !editList.some((n) => /publish|spend|pay|approve|run/i.test(n)));

  console.log('N  direction notes and line rewrites (the person’s words exactly; never a guessed shot)');
  {
    const said = 'Eyes on the pieces, not on Zei —  he doesn’t look up until “toast”.';
    const one = await tool(BASE, edA, 'find_line', { adaptation: 1, version: 2, words: 'toast' });
    const m1 = (one.out?.matches ?? []) as { shot: string; cue: string; time: string; speaker: string }[];
    check('N1 find_line finds the line by its words: shot, cue, time, speaker', one.ok && m1.length === 1 && m1[0].cue === 'b1-6' && m1[0].shot === '14-b1-6' && m1[0].speaker === 'Bai' && /^0:3\d\.\d$/.test(m1[0].time) && one.out.ask === null, JSON.stringify(one.out ?? one.error));
    const many = await tool(BASE, edA, 'find_line', { adaptation: 1, version: 2, speaker: 'Bai' });
    check('N2 when more than one line fits, it says to ask the person', many.ok && (many.out.matches as unknown[]).length > 1 && /ask your person/.test(String(many.out.ask)));
    const noShot = await tool(BASE, edA, 'add_direction', { adaptation: 1, version: 2, kind: 'intent', text: 'Make them lean in here.' });
    const notThere = await tool(BASE, edA, 'add_direction', { adaptation: 1, version: 2, kind: 'acting', shot: '14-b1-6', character: 'Deluin', text: 'Deluin smirks.' });
    check('N3 no shot, no note: it asks instead of guessing; a character not in the shot is refused', !noShot.ok && /never guess/.test(noShot.error ?? '') && !notThere.ok && /isn’t in shot/.test(notThere.error ?? ''), `${noShot.error} | ${notThere.error}`);
    const notMineD = await tool(BASE, edA, 'add_direction', { adaptation: 1, version: 1, kind: 'intent', shot: '14-b1-6', text: 'x' });
    check('N4 only on the person’s own version', !notMineD.ok && /own versions/.test(notMineD.error ?? ''));
    const act = await tool(BASE, edA, 'add_direction', { adaptation: 1, version: 2, kind: 'acting', shot: '14-b1-6', character: 'bai', text: `  ${said}\n` });
    const intent = await tool(BASE, edA, 'add_direction', { adaptation: 1, version: 2, kind: 'intent', shot: '14-b1-6', text: 'The viewer should feel Bai has already won.' });
    const deliv = await tool(BASE, edA, 'add_direction', { adaptation: 1, version: 2, kind: 'delivery', cue: 'b1-6', text: 'Quieter, almost to himself. No pause before “but”.' });
    const back = await tool(BASE, edA, 'get_direction', { adaptation: 1, version: 2 });
    const notes = (back.out?.notes ?? []) as { kind: string; text: string; character: string | null; shot: string; filedBy: string | null }[];
    check('N5 acting, intent and delivery are filed to the right shot and kind, in the person’s words exactly (only the ends trimmed), as filed by the agent', act.ok && intent.ok && deliv.ok && notes.some((n) => n.kind === 'acting' && n.text === said && n.character === 'Bai' && n.shot === '14-b1-6' && String(n.filedBy).startsWith('Claude')) && notes.some((n) => n.kind === 'delivery' && n.shot === '14-b1-6'), JSON.stringify(notes));
    const rw1 = await tool(BASE, edA, 'rewrite_line', { adaptation: 1, version: 2, cue: 'b1-6', text: 'That one’s toast. He just hasn’t heard.' });
    const rw2 = await tool(BASE, edA, 'rewrite_line', { adaptation: 1, version: 2, cue: 'b1-6', text: 'That one’s toast, and he doesn’t even know it.' });
    const rwBad = await tool(BASE, edA, 'rewrite_line', { adaptation: 1, version: 2, text: 'A line.' });
    check('N6 a rewrite is a draft against the original; the newest is the draft; no cue, no rewrite', rw1.ok && rw2.ok && (/^That other loser/.test(String(rw2.out.original)) && rw2.out.status === 'draft' && !rwBad.ok && /never guess/.test(rwBad.error ?? '')), JSON.stringify(rw2.out ?? rw2.error));
    const scriptRes = await asPerson(people.A.token, '/api/direction?adaptation=1&version=2');
    const script = (await scriptRes.json()) as { shots: { id: string; time: string; intent: unknown[]; acting: unknown[]; lines: { cue: string; speaker: string | null; time: string; rewrite: { text: string; id: string } | null; delivery: unknown[] }[] }[]; rerecord: { speaker: string; lines: { cue: string; line: string; original: string | null; delivery: string[] }[] }[] };
    const sh = script.shots?.find((x) => x.id === '14-b1-6');
    const ln = sh?.lines.find((l) => l.cue === 'b1-6');
    const bai = script.rerecord?.find((g) => g.speaker === 'Bai')?.lines.find((l) => l.cue === 'b1-6');
    check('N7 the script page: every shot and line with speaker and time, the notes inline, the rewrite as a draft', scriptRes.ok && script.shots.length === 85 && !!ln && ln.speaker === 'Bai' && ln.rewrite?.text === 'That one’s toast, and he doesn’t even know it.' && sh!.intent.length === 1 && sh!.acting.length === 1 && ln.delivery.length === 1, JSON.stringify(sh ?? script).slice(0, 400));
    check('N8 the rewritten line joins the re-record sheet, with its delivery note, by speaker', !!bai && bai.line === 'That one’s toast, and he doesn’t even know it.' && /^That other loser/.test(bai.original ?? '') && bai.delivery.length === 1, JSON.stringify(script.rerecord));
    const sheetNote = (bai as { notes?: { id: string; filedBy: string | null }[] } | undefined)?.notes?.[0];
    check('N8b the re-record sheet says who filed the delivery note and has its id for the "These were my words" tap', !!sheetNote?.id && String(sheetNote.filedBy).startsWith('Claude') && String((bai as { rewriteFiledBy?: string } | undefined)?.rewriteFiledBy).startsWith('Claude'), JSON.stringify(bai));
    const bScript = await asPerson(people.B.token, '/api/direction?adaptation=1&version=2');
    const anonScript = await fetch(`${BASE}/api/direction?adaptation=1&version=2`);
    check('N9 the script and its notes are the author’s only (someone else: refused; signed out: not found)', bScript.status === 400 && anonScript.status === 404, `${bScript.status} ${anonScript.status}`);
    const own = await asPerson(people.A.token, '/api/direction', { method: 'POST', body: JSON.stringify({ action: 'note', adaptation: 1, version: 2, kind: 'delivery', cue: 'b1-6', text: 'Lighter.' }) });
    const ownId = ((await own.json()) as { note: string }).note;
    const wd = await asPerson(people.A.token, '/api/direction', { method: 'POST', body: JSON.stringify({ action: 'withdraw', id: ownId }) });
    const rec = await asPerson(people.A.token, '/api/direction', { method: 'POST', body: JSON.stringify({ action: 'recorded', id: ln?.rewrite?.id }) });
    const after = (await (await asPerson(people.A.token, '/api/direction?adaptation=1&version=2')).json()) as typeof script;
    const afterLn = after.shots.find((x) => x.id === '14-b1-6')?.lines.find((l) => l.cue === 'b1-6');
    check('N10 from the page: a note of their own, withdrawn; a rewrite marked recorded leaves the sheet', own.ok && wd.ok && rec.ok && afterLn?.delivery.length === 1 && afterLn.rewrite === null, JSON.stringify(afterLn));
    const fr = await tool(BASE, edA, 'try_frame', { adaptation: 1, version: 2, shot: '14-b1-6', note: 'Same frame, warmer.' });
    const frRun = await asPerson(people.A.token, '/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: fr.out.version, action: 'run' }) });
    const frMade = ((await (await asPerson(people.A.token, '/api/drafts')).json()).drafts.find((d: { id: string }) => d.id === fr.out.version) as { made: { prompt?: string; direction?: { character: string; text: string; by: string }[] } | null }).made;
    check('N11 acting notes feed that shot’s frame prompt, in their words, and show in the recipe as theirs', frRun.ok && !!frMade?.prompt?.includes(`Bai: ${said}`) && frMade.direction?.[0]?.text === said && frMade.direction[0].by === 'person', `${frRun.status} ${JSON.stringify(frMade)?.slice(0, 300)}`);
    const agentRw = await tool(BASE, edA, 'rewrite_line', { adaptation: 1, version: 2, cue: 'b1-3', text: 'Nah. Too fake.' });
    const ownRw = await asPerson(people.A.token, '/api/direction', { method: 'POST', body: JSON.stringify({ action: 'rewrite', adaptation: 1, version: 2, cue: 'b1-4', text: 'Such patience.' }) });
    const lineAt = async (cue: string) => ((await (await asPerson(people.A.token, '/api/direction?adaptation=1&version=2')).json()) as { shots: { lines: { cue: string; rewrite: { id: string; filedBy: string | null } | null }[] }[] }).shots.flatMap((x) => x.lines).find((l) => l.cue === cue);
    const before = await lineAt('b1-3');
    const mine = await lineAt('b1-4');
    const conf = await asPerson(people.A.token, '/api/direction', { method: 'POST', body: JSON.stringify({ action: 'confirm', id: before?.rewrite?.id }) });
    const bConf = await asPerson(people.B.token, '/api/direction', { method: 'POST', body: JSON.stringify({ action: 'confirm', id: before?.rewrite?.id }) });
    const confirmed = await lineAt('b1-3');
    check('N13 an agent-filed rewrite is labelled as filed by the agent until the person taps "These were my words"; their own is theirs at once; someone else can’t confirm it; an unconfirmed acting note is labelled in the recipe', agentRw.ok && ownRw.ok && String(before?.rewrite?.filedBy).startsWith('Claude') && mine?.rewrite?.filedBy === null && bConf.status !== 200 && conf.ok && confirmed?.rewrite?.filedBy === null && String((frMade?.direction?.[0] as { filedBy?: string } | undefined)?.filedBy).startsWith('Claude'), `${JSON.stringify(before?.rewrite)} ${JSON.stringify(confirmed?.rewrite)} ${bConf.status}`);
    const noVersion = await S.pg.query(`insert into studio.direction_notes (person, adaptation_id, version, kind, shot, body, confirmed_at) values ($1, 1, 999, 'intent', '14-b1-6', 'x', now())`, [people.A.person]).then(() => 'kept', (e: Error) => e.message);
    const unconfirmedOwn = await S.pg.query(`insert into studio.direction_notes (person, adaptation_id, version, kind, shot, body) values ($1, 1, 2, 'intent', '14-b1-6', 'x')`, [people.A.person]).then(() => 'kept', (e: Error) => e.message);
    check('N14 the tables refuse a note on a version that doesn’t exist, and a row the person filed without confirmed_at', /foreign key/i.test(noVersion) && /check constraint/i.test(unconfirmedOwn), `${noVersion} | ${unconfirmedOwn}`);
    check('N15 the owner’s agents have higher daily counts (500 drafts, 200 notes, 150 images); everyone else keeps 50, 20 and 50; the per-minute brakes are the same', AGENT_CONFIG.limitsFor[6786]?.drafts === 500 && AGENT_CONFIG.limitsFor[6786]?.notes === 200 && AGENT_CONFIG.limitsFor[6786]?.images === 150 && AGENT_CONFIG.limits.drafts === 50 && AGENT_CONFIG.limits.notes === 20 && AGENT_CONFIG.limits.images === 50 && !('imagesPerMinute' in (AGENT_CONFIG.limitsFor[6786] ?? {})));
    const dList = ((await mcp(BASE, edA, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
    check('N12 the four direction tools are there, and still nothing that publishes or spends', ['find_line', 'get_direction', 'add_direction', 'rewrite_line'].every((n) => dList.includes(n)) && !dList.some((n) => /publish|spend|pay|approve|run/i.test(n)));
  }

  console.log('G  gaps');
  const gap = await tool(BASE, edA, 'log_gap', { asked: 'Make Zei’s coat blue in every shot of the hotel.', missing: 'No tool changes a character across many shots at once.' });
  const gapsA = (await (await asPerson(people.A.token, '/api/drafts')).json()).gaps as { asked: string; agent: string }[];
  const gapsB = (await (await asPerson(people.B.token, '/api/drafts')).json()).gaps as unknown[];
  check('G1 log_gap records what was asked and what was missing, on the person’s You page only', gap.ok && gapsA.some((g) => g.asked.includes('coat blue') && g.agent === 'Claude') && gapsB.length === 0);

  console.log('A  the allowlist: everyone else sees nothing new');
  const dRoutes = await Promise.all(['/api/agents', '/api/drafts', '/api/requests'].map((u) => asPerson(people.D.token, u)));
  check('A1 someone not on the allowlist gets 404 from every agent route', dRoutes.every((r) => r.status === 404), dRoutes.map((r) => r.status).join(','));
  const dApprove = await asPerson(people.D.token, '/api/oauth/approve', { method: 'POST', body: JSON.stringify({ query: a1.query.toString(), allow: true }) });
  check('A2 …and can’t connect an agent', dApprove.status === 403);
  const dSpeak = await fetch(`${BASE}/api/requests/transcribe`, { method: 'POST', headers: { 'content-type': 'audio/wav', authorization: `Bearer ${people.D.token}` }, body: Buffer.from('x') });
  check('A3 …or use speaking', dSpeak.status === 404);
  await S.pg.query(`update studio.agents set person = $1 where person = $2 and revoked_at is null`, [people.D.person, people.C.person]);
  const cAgents = (await S.pg.query<{ id: string }>(`select id from studio.agents where person = $1 and revoked_at is null`, [people.D.person])).rows;
  check('A4 an agent whose person is off the allowlist stops at once (checked on every request)', cAgents.length > 0 && (await mcp(BASE, c2.access_token, 'ping')).status === 401);

  console.log('DB database floors (0019, 0021)');
  const refused = async (q: string, params: unknown[] = []) => S.pg.query(q, params).then(() => false, () => true);
  check('DB1 a wallet agent\'s address must be lowercase (the server lowercases it before insert)', await refused(`insert into studio.agents (person, route, name, address, scopes, expires_at) values (-999, 'wallet', 'x', '0xABCDEF0000000000000000000000000000000001', '{read}', now() + interval '1 day')`));
  check('DB2 a key\'s spend cap is at most $10 in the database too', await refused(`insert into studio.agents (person, route, name, scopes, expires_at, spend_cap_usd) values (-999, 'key', 'x', '{read}', now() + interval '1 day', 10.01)`) && !(await refused(`insert into studio.agents (person, route, name, scopes, expires_at, spend_cap_usd) values (-998, 'key', 'x', '{read}', now() + interval '1 day', 10)`)));
  check('DB3 a piece\'s adaptation must exist', await refused(`insert into studio.pieces (kind, person, adaptation_id, title) values ('idea', -999, 987654, 'x')`));
  const fnCfg = (await S.pg.query<{ cfg: string[] | null }>(`select proconfig as cfg from pg_proc where proname = 'agents_three'`)).rows[0]?.cfg ?? [];
  check('DB4 agents_three() runs with an empty search_path', fnCfg.some((c) => /^search_path=(""|)$/.test(c)), JSON.stringify(fnCfg));

  console.log('S  story words, in-process');
  const filter = await import('../src/lib/agents/filter');
  const { AGENTS } = await import('../src/lib/config');
  check('S1 story words stay human: agents’ own lines are refused by default', filter.storyWordsAllowed(-5) === false && AGENTS.storyWords === 'refused');
  check('S0 as shipped, the allowlist is FID 6786 only: no wallet, and the payment address is not one', JSON.stringify(AGENTS.people.fids) === '[6786]' && AGENTS.people.wallets.length === 0);
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

  console.log('G  P4a: an agent\'s route passes only if it creates drafts (owner, 2026-10-20), in-process');
  const { p4aProblems, agentToolProblems } = await import('./lib/p4a');
  const readReal = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
  const readWith = (over: Record<string, string>) => (rel: string) => over[rel] ?? readReal(rel);
  const real = (f: string) => ({ file: f, src: readReal(f) });
  const head = "import { NextResponse } from 'next/server';\nimport { agentFromRequest } from '~/lib/agents/core';\n";
  const guard = "  const agent = await agentFromRequest(request).catch(() => null);\n  if (!agent) return NextResponse.json({ error: 'token' }, { status: 401 });\n";
  const draftOnly = { file: 'src/app/api/planted-draft/route.ts', src: `${head}import { runTool } from '~/lib/agents/tools';\nexport async function POST(request: Request) {\n${guard}  return NextResponse.json(await runTool(agent, 'start_idea', await request.json()));\n}\n` };
  const publishes = { file: 'src/app/api/planted-publish/route.ts', src: `${head}import { decide } from '~/lib/agents/pieces';\nexport async function POST(request: Request) {\n${guard}  const b = await request.json();\n  return NextResponse.json({ ok: await decide(agent.person, 'version', b.id, 'publish') });\n}\n` };
  const keeps = { file: 'src/app/api/planted-keep/route.ts', src: `${head}import { runTool } from '~/lib/agents/tools';\nexport async function POST(request: Request) {\n${guard}  const b = await request.json();\n  await fetch('/api/drafts', { method: 'POST', body: JSON.stringify({ what: 'version', id: b.id, action: 'keep' }) });\n  return NextResponse.json(await runTool(agent, 'start_idea', b));\n}\n` };
  const noToken = { file: 'src/app/api/planted-open/route.ts', src: `import { NextResponse } from 'next/server';\nimport { runTool } from '~/lib/agents/tools';\nexport async function POST(request: Request) {\n  return NextResponse.json(await runTool({} as never, 'start_idea', await request.json()));\n}\n` };
  const p = (r: { file: string; src: string }[], read = readReal) => p4aProblems(r, read);
  const realAgentRoutes = ['src/app/mcp/route.ts', 'src/app/api/agent/v1/[tool]/route.ts', 'src/app/api/oauth/register/route.ts', 'src/app/api/oauth/token/route.ts', 'src/app/api/oauth/revoke/route.ts', 'src/app/api/agents/wallet/link/route.ts', 'src/app/api/agents/wallet/token/route.ts'].map(real);
  check('G1 the real agent routes (/mcp, REST POST) and the agent sign-in routes pass', p(realAgentRoutes).length === 0, p(realAgentRoutes).join('; '));
  check('G2 the real agent tools are draft-only (no publish, keep or spend tool; writers write drafts)', agentToolProblems(readReal).length === 0, agentToolProblems(readReal).join('; '));
  check('G3 a planted draft-only agent route passes', p([draftOnly]).length === 0, p([draftOnly]).join('; '));
  check('G4 an agent route that can publish fails', p([publishes]).some((x) => x.includes('can publish or keep')), p([publishes]).join('; '));
  check('G5 an agent route that can keep fails', p([keeps]).some((x) => x.includes('can publish or keep') && x.includes('keep')), p([keeps]).join('; '));
  check('G6 a route reaching the tools without an agent\'s token fails', p([noToken]).some((x) => x.includes('without an agent\'s token')));
  const tools = readReal('src/lib/agents/tools.ts');
  const keepTool = tools.replace("name: 'leave_note',", "name: 'keep_draft',");
  check('G7 a tool that keeps, served to agents, fails the draft-only route too', p([draftOnly], readWith({ 'src/lib/agents/tools.ts': keepTool })).some((x) => x.includes('keep_draft')));
  const decideTool = tools.replace('import { addNote, draftPiece,', 'import { addNote, decide, draftPiece,');
  check('G8 a tool module that takes decide (publish, keep) from pieces fails', p([draftOnly], readWith({ 'src/lib/agents/tools.ts': decideTool })).some((x) => x.includes('decide')));
  const publishingNote = readReal('src/lib/agents/pieces.ts').replace("${agent ? 'draft' : 'published'}", "'published'");
  check('G9 a draft writer that would publish an agent\'s note fails', p([draftOnly], readWith({ 'src/lib/agents/pieces.ts': publishingNote })).some((x) => x.includes('addNote')));
  const signInWrites = readReal('src/lib/agents/oauth.ts') + "\nexport async function x() { await sql()`update studio.piece_versions set status = 'draft'`; }\n";
  check('G10 an agent sign-in route whose module writes pieces fails', p([real('src/app/api/oauth/token/route.ts')], readWith({ 'src/lib/agents/oauth.ts': signInWrites })).some((x) => x.includes('piece_versions')));
} catch (e) {
  failures.push(`crashed: ${(e as Error).stack ?? e}`);
} finally {
  await S.stop();
}
// Owner-only mode, as it ships (owner, 2026-10-20): the connector works; public pages stay off.
console.log('M  owner-only mode (public pages off)');
{
  const M = await startStage({ public: false });
  try {
    const md = await fetch(`${M.BASE}/agents.md`);
    const list = await fetch(`${M.BASE}/p`);
    const meta = await fetch(`${M.BASE}/.well-known/oauth-protected-resource/mcp`);
    const mcpAnon = await fetch(`${M.BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
    const mdText = md.ok ? await md.text() : '';
    check('M1 agents.md is there (site-wide) and names the endpoint and the key header; /p is not; the connector and its metadata are', md.ok && mdText.split('\n')[2] === 'Connecting is open only to the site\'s owner for now.' && mdText.includes(`${M.BASE}/mcp`) && mdText.includes('X-Snowmoon-Key') && !/sk1_[A-Za-z0-9_-]{20}/.test(mdText) && list.status === 404 && meta.ok && mcpAnon.status === 401, `${md.status} ${list.status} ${meta.status} ${mcpAnon.status}`);
    const owner = await connect(M.BASE, M.people.A.token, 'Claude');
    const idea = await tool(M.BASE, owner.access_token, 'start_idea', { title: 'x', text: 'an idea' });
    await fetch(`${M.BASE}/api/drafts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${M.people.A.token}` }, body: JSON.stringify({ what: 'version', id: idea.out.version, action: 'keep' }) });
    check('M2 a kept piece stays private: no public page for it', (await fetch(`${M.BASE}/p/${idea.out.piece}`)).status === 404);

    console.log('K  a personal agent key (for apps that send a key in a header)');
    const asA = (u: string, body?: unknown) => fetch(`${M.BASE}${u}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: `Bearer ${M.people.A.token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const made = await asA('/api/agents', { action: 'key', name: 'Muse', capUsd: 0.03 });
    const mk = (await made.json()) as { id: string; key: string; expiresAt: string; spendCapUsd: number };
    const days = (Date.parse(mk.expiresAt) - Date.now()) / 86_400_000;
    check('K1 a key is made on /you: shown once, sk1_, 30 days, with its cap; not cacheable', made.ok && /^sk1_[A-Za-z0-9_-]{40,}$/.test(mk.key) && days > 29.9 && days < 30.1 && mk.spendCapUsd === 0.03 && (made.headers.get('cache-control') ?? '').includes('no-store'));
    const unnamed = (await (await asA('/api/agents', { action: 'key', name: '', capUsd: 1 })).json()) as { id?: string; key?: string; error?: string };
    const unnamedRow = JSON.parse(await (await asA('/api/agents')).text()).agents.find((a: { id: string }) => a.id === unnamed.id) as { name?: string } | undefined;
    await asA('/api/agents', { action: 'disconnect', id: unnamed.id });
    check('K1b the name is optional (fewer taps): a key made without one is called "Agent key"', !!unnamed.key && unnamedRow?.name === 'Agent key', unnamed.error ?? JSON.stringify(unnamedRow ?? {}));
    const listed = await (await asA('/api/agents')).text();
    const stored = await M.pg.query<{ n: number }>(`select count(*)::int as n from studio.agent_tokens where token_hash = $1`, [mk.key]);
    const dump = JSON.stringify((await M.pg.query(`select * from studio.agents`)).rows) + JSON.stringify((await M.pg.query(`select * from studio.agent_tokens`)).rows);
    check('K2 never shown again, never stored: the list hasn’t it, and only its sha256 is kept', !listed.includes(mk.key) && listed.includes('"route":"key"') && stored.rows[0].n === 0 && !dump.includes(mk.key) && dump.includes(createHash('sha256').update(mk.key).digest('hex')));
    const viaBearer = await tool(M.BASE, mk.key, 'whoami');
    const viaHeader = await fetch(`${M.BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Snowmoon-Key': mk.key }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami', arguments: {} } }) });
    const hv = ((await viaHeader.json()) as { result?: { structuredContent?: Record<string, unknown> } }).result?.structuredContent ?? {};
    check('K3 the key works as a bearer token and in the X-Snowmoon-Key header; whoami shows the cap', viaBearer.ok && (viaBearer.out as { spend_cap_usd?: number }).spend_cap_usd === 0.03 && (hv as { spend_cap_usd?: number }).spend_cap_usd === 0.03);
    const kTools = ((await mcp(M.BASE, mk.key, 'tools/list')).body?.result?.tools ?? []).map((t) => t.name);
    const kAsPerson = await fetch(`${M.BASE}/api/drafts`, { headers: { authorization: `Bearer ${mk.key}` } });
    const inUrl = await fetch(`${M.BASE}/mcp?key=${mk.key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
    check('K4 drafts only: no image tool, no way to the person’s own routes, and never from a URL', kTools.includes('try_frame') && !kTools.includes('bring_in_image') && kAsPerson.status !== 200 && inUrl.status === 401, `${kAsPerson.status} ${inUrl.status}`);
    const kShot = await tool(M.BASE, mk.key, 'list_scenes');
    const v2 = (kShot.out as { scenes?: { versions: { version: number }[] }[] }).scenes?.[0]?.versions.find((v) => v.version === 2);
    const scene = await tool(M.BASE, mk.key, 'get_scene', { adaptation: 1, version: 2 });
    const shotId = ((scene.out as { shots?: { id: string; lines?: unknown[] }[] }).shots ?? []).find((s) => (s.lines ?? []).length)?.id;
    const fr = await tool(M.BASE, mk.key, 'try_frame', { adaptation: 1, version: 2, shot: shotId, note: 'Warmer light.' });
    const runFr = await asA('/api/drafts', { what: 'version', id: fr.out.version, action: 'run' });
    const vt1 = await tool(M.BASE, mk.key, 'request_video_test', { adaptation: 1, version: 2, shot: shotId, note: 'Steam rises.' });
    const runV1 = await asA('/api/drafts', { what: 'version', id: vt1.out.version, action: 'run' });
    const vt2 = await tool(M.BASE, mk.key, 'request_video_test', { adaptation: 1, version: 2, shot: shotId, note: 'Again.' });
    const runV2 = await asA('/api/drafts', { what: 'version', id: vt2.out.version, action: 'run' });
    const capErr = runV2.ok ? '' : ((await runV2.json()) as { error?: string }).error ?? '';
    check('K5 the spend cap holds: a $0.05 frame is refused at a $0.03 cap, one $0.025 video runs, a second is refused', !!v2 && fr.ok && runFr.status === 429 && runV1.ok && runV2.status === 429 && /spend cap/.test(capErr), `${fr.error ?? ''} ${runFr.status} ${runV1.status} ${runV2.status}`);
    const spentRow = JSON.parse(await (await asA('/api/agents')).text()).agents.find((a: { id: string }) => a.id === mk.id) as { spentUsd: number; spendCapUsd: number };
    check('K6 /you shows what the key has spent of its cap', spentRow.spentUsd === 0.025 && spentRow.spendCapUsd === 0.03, JSON.stringify(spentRow));
    const dKey = await fetch(`${M.BASE}/api/agents`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${M.people.D.token}` }, body: JSON.stringify({ action: 'key', name: 'x' }) });
    check('K7 someone not on the allowlist can’t make a key', dKey.status === 404);
    const off = await asA('/api/agents', { action: 'disconnect', id: mk.id });
    check('K8 one tap ends it at once', off.ok && (await mcp(M.BASE, mk.key, 'ping')).status === 401);
    await new Promise((r) => setTimeout(r, 300));
    check('K9 the key never appears in the server’s output', M.serverLog().length > 0 && !M.serverLog().includes(mk.key) && !M.serverLog().includes(mk.key.slice(4, 24)));
  } catch (e) {
    failures.push(`owner-only stage crashed: ${(e as Error).stack ?? e}`);
  } finally {
    await M.stop();
  }
}
if (S.serverErr().includes('Error')) console.log('server stderr (tail):\n' + S.serverErr().split('\n').slice(-15).join('\n'));
if (failures.length) {
  console.error(`AGENT TESTS FAILED (${failures.length}, ${passed} passed):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`agent tests passed: ${passed} checks (OAuth, never a person, tools, drafts private, feedback and credit, images, limits, wallet agents, story words)`);
