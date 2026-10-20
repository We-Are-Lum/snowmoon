/**
 * The loop, end to end, locally (owner, 2026-10-20): idea → draft → feedback (a note from a person and one
 * from a second agent) → revision → the person approves. Two separate Claude sessions (Claude Code,
 * headless, on the maintainer's own Claude subscription) are the agents, each connected to the local
 * site's /mcp with the token its person granted on the real consent page. People's steps are clicks in a
 * real browser (Chrome, phone size). Writes docs/agents/demo/: screenshots, each agent's transcript, and
 * a summary. The agents' prompts are model-drafted test prompts, labelled as such in the transcript.
 *
 *   npm run build && npx tsx --conditions=react-server scripts/demo-agents.ts
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { startStage, ROOT } from './lib/agents-harness';

const OUT = path.join(ROOT, 'docs/agents/demo');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const PORT = 3456;
const S = await startStage({ port: PORT });
const { BASE, people } = S;
const log: string[] = [];
const say = (s: string) => (console.log(s), log.push(s));

const browser = await chromium.launch({ channel: 'chrome' });
async function personContext(p: { token: string; address: string }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const payload = JSON.parse(Buffer.from(p.token.split('.')[1], 'base64url').toString()) as { exp: number };
  const a = p.address.toLowerCase();
  await ctx.addInitScript((v) => {
    localStorage.setItem('snowmoon.wallet', v);
  }, JSON.stringify({ token: p.token, address: a, short: `${a.slice(0, 6)}…${a.slice(-4)}`, exp: payload.exp }));
  return ctx;
}
let shot = 0;
async function snap(page: Page, name: string, full = true) {
  shot++;
  const file = `${String(shot).padStart(2, '0')}-${name}.png`;
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, file), fullPage: full });
  say(`  screenshot ${file}`);
  return file;
}

/** The person connects an agent on the real consent page; the redirect is caught, and the code exchanged. */
async function connectInBrowser(ctx: BrowserContext, clientName: string, shotName: string) {
  const redirect = 'http://127.0.0.1:53682/callback';
  const reg = await (await fetch(`${BASE}/api/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: clientName, redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })).json();
  const verifier = randomBytes(32).toString('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'demo', scope: 'read drafts images notes offline_access', resource: `${BASE}/mcp` });
  const page = await ctx.newPage();
  let back = '';
  await page.route('http://127.0.0.1:53682/**', (route) => {
    back = route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p style="font:16px sans-serif;padding:24px">Connected. You can close this tab.</p>' });
  });
  await page.goto(`${BASE}/oauth/authorize?${q}`);
  await page.getByRole('button', { name: 'Allow', exact: true }).waitFor();
  await page.waitForFunction(() => !(document.querySelector('button.ic-primary') as HTMLButtonElement | null)?.disabled);
  const file = await snap(page, shotName);
  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  for (let i = 0; i < 40 && !back; i++) await page.waitForTimeout(250);
  await page.close();
  const code = new URL(back).searchParams.get('code')!;
  const tok = await (await fetch(`${BASE}/api/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: redirect, resource: `${BASE}/mcp` }) })).json();
  say(`  ${clientName}: connected (access token for ${tok.expires_in} s, refresh token issued)`);
  return { token: tok.access_token as string, file };
}

/** One headless Claude session as the agent: only this site's tools, no shell, no files, no web. */
async function agentSession(label: string, token: string, prompt: string) {
  const cfg = path.join(OUT, `.mcp-${label}.json`);
  writeFileSync(cfg, JSON.stringify({ mcpServers: { snowmoon: { type: 'http', url: `${BASE}/mcp`, headers: { Authorization: `Bearer ${token}` } } } }));
  const args = ['-p', prompt, '--mcp-config', cfg, '--strict-mcp-config', '--allowedTools', 'mcp__snowmoon', '--disallowedTools', 'Bash,Edit,Write,Read,NotebookEdit,WebFetch,WebSearch,Glob,Grep,Task,Agent,TodoWrite', '--output-format', 'stream-json', '--verbose', '--max-turns', '30', '--model', 'sonnet'];
  const started = Date.now();
  const lines: string[] = await new Promise((resolve) => {
    const out: string[] = [];
    const p = spawn('claude', args, { cwd: OUT, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      out.push(...parts.filter(Boolean));
    });
    p.stderr.on('data', (d) => process.stderr.write(d));
    p.on('close', () => resolve(buf ? [...out, buf] : out));
  });
  rmSync(cfg);
  // A readable transcript: the prompt, each tool call and its result (shortened), and the agent's words.
  const md: string[] = [`## ${label}`, '', `Prompt (model-drafted test prompt):`, '', '> ' + prompt.replace(/\n/g, '\n> '), ''];
  let cost = 0;
  for (const l of lines) {
    let m: { type: string; message?: { content?: { type: string; text?: string; name?: string; input?: unknown; content?: unknown }[] }; total_cost_usd?: number; result?: string; num_turns?: number };
    try { m = JSON.parse(l); } catch { continue; }
    if (m.type === 'assistant')
      for (const c of m.message?.content ?? []) {
        if (c.type === 'text' && c.text?.trim()) md.push(`**Agent:** ${c.text.trim()}`, '');
        if (c.type === 'tool_use') md.push(`**Tool call:** \`${String(c.name).replace('mcp__snowmoon__', '')}\``, '```json', JSON.stringify(c.input, null, 2).slice(0, 2500), '```', '');
      }
    if (m.type === 'user')
      for (const c of m.message?.content ?? []) {
        if (c.type !== 'tool_result') continue;
        const text = Array.isArray(c.content) ? (c.content as { text?: string }[]).map((x) => x.text ?? '').join('') : String(c.content ?? '');
        md.push('**Result:**', '```', text.slice(0, 1500) + (text.length > 1500 ? ' …' : ''), '```', '');
      }
    if (m.type === 'result') {
      cost = m.total_cost_usd ?? 0;
      md.push(`*Session ended: ${m.num_turns} turns, ${Math.round((Date.now() - started) / 1000)} s; the CLI's own cost estimate $${cost.toFixed(4)} (billed to the Claude subscription, not per call).*`, '');
    }
  }
  writeFileSync(path.join(OUT, `transcript-${label}.jsonl`), lines.join('\n') + '\n');
  say(`  ${label}: ${lines.length} events`);
  return { md: md.join('\n'), cost };
}

const A_SHORT = `${people.A.address.slice(0, 6)}…${people.A.address.slice(-4)}`;
const transcripts: string[] = [];
let costs = 0;
try {
  const ctxA = await personContext(people.A);
  const ctxB = await personContext(people.B);

  say('1. Each person connects an agent (the consent page, then Allow)');
  const agentA = await connectInBrowser(ctxA, 'Claude', 'A-connects-claude');
  const agentB = await connectInBrowser(ctxB, 'Claude (second agent)', 'B-connects-second-agent');

  const pageA = await ctxA.newPage();
  await pageA.goto(`${BASE}/you`);
  await pageA.locator('#you-agents').waitFor();
  await pageA.locator('#you-agents').scrollIntoViewIfNeeded();
  await snap(pageA, 'A-you-agents', false);

  say('2. Idea → draft: A’s agent starts an idea and drafts a storyboard');
  const s1 = await agentSession('agent-A-1-idea',
    agentA.token,
    `You are connected to snowmoon.party as an agent for your person. Call whoami first. Then look at the published scene "Fifteen Days" (list_scenes, then get_scene for its version 2) and the book around it if useful. ` +
      `Start one idea for a short new scene your person could make from that adaptation (start_idea, adaptation 1), and then draft a storyboard for it from 4 to 6 of version 2's shots (draft_storyboard). ` +
      `If you include story lines, either quote the book word for word with its block id, or mark them as your own; it's fine to leave lines out. Finish by telling your person, in two sentences, what's waiting for them and the ids.`);
  transcripts.push(s1.md);
  costs += s1.cost;

  await pageA.goto(`${BASE}/you`);
  await pageA.locator('#you-review').waitFor();
  await pageA.locator('.draft-row').first().waitFor();
  await pageA.locator('#you-review').scrollIntoViewIfNeeded();
  await snap(pageA, 'A-review-list-drafts');
  say('3. A publishes the idea and the storyboard from the review list');
  while ((await pageA.locator('.draft-row button.ic-primary').count()) > 0) {
    await pageA.locator('.draft-row button.ic-primary').first().click();
    await pageA.waitForTimeout(900);
  }
  const drafts = await (await fetch(`${BASE}/api/drafts`, { headers: { authorization: `Bearer ${people.A.token}` } })).json();
  const ideaV = (drafts.published as { kind: string; piece: string; id: string; title: string }[]).find((v) => v.kind === 'idea')!;
  say(`  published: ${drafts.published.map((v: { title: string }) => v.title).join(' · ')}`);

  say('4. Feedback: B (a person) writes a note; B’s agent drafts one; B publishes it');
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/p/${ideaV.piece}`);
  await snap(pageB, 'B-sees-published-idea');
  await pageB.locator('#piece-note').fill(`I like this. @${people.A.address}'s agent, could the board end on a held close-up instead of a wide? It would let the silence land.`);
  await pageB.getByRole('button', { name: 'Post note' }).click();
  await pageB.waitForLoadState('load');
  await pageB.waitForTimeout(1200);
  await snap(pageB, 'B-note-posted');

  const s2 = await agentSession('agent-B-note',
    agentB.token,
    `You are connected to snowmoon.party as an agent for your person. Call whoami first. Another person's idea was just published: piece ${ideaV.piece} (get_piece). ` +
      `Read it, and the scene it draws on if useful, then leave one short, specific, constructive note on its latest published version (leave_note). Don't write story lines for them. Tell your person the note is waiting for them to publish.`);
  transcripts.push(s2.md);
  costs += s2.cost;
  await pageB.goto(`${BASE}/you`);
  await pageB.locator('section[aria-labelledby="you-review"] .draft-row').first().waitFor();
  await pageB.locator('#you-review').scrollIntoViewIfNeeded();
  await snap(pageB, 'B-review-agent-note');
  await pageB.locator('section[aria-labelledby="you-review"] .draft-row button.ic-primary').first().click();
  await pageB.waitForTimeout(1000);
  await pageA.goto(`${BASE}/p/${ideaV.piece}`);
  await snap(pageA, 'A-sees-both-notes');

  say('5. Revision: A’s agent reads the feedback and proposes a revision');
  const s3 = await agentSession('agent-A-2-revision',
    agentA.token,
    `You are connected to snowmoon.party as an agent for your person. Call whoami, then read_feedback. Some notes are about your person's published work, and one is addressed to "@${people.A.address}'s agent", which is you. ` +
      `Decide which suggestions to take, then propose a revision of the storyboard your person published (list_my_work with status "published" to find it; propose_revision with the changed items). ` +
      `Then tell your person, in two or three sentences, what you changed and which note each change answers.`);
  transcripts.push(s3.md);
  costs += s3.cost;

  await pageA.goto(`${BASE}/you`);
  await pageA.locator('section[aria-labelledby="you-review"] .draft-row').first().waitFor();
  await pageA.locator('#you-review').scrollIntoViewIfNeeded();
  await snap(pageA, 'A-review-revision');
  say('6. A approves the revision');
  await pageA.locator('section[aria-labelledby="you-review"] .draft-row button.ic-primary').first().click();
  await pageA.waitForTimeout(1000);
  const after = await (await fetch(`${BASE}/api/drafts`, { headers: { authorization: `Bearer ${people.A.token}` } })).json();
  const board = (after.published as { kind: string; piece: string; n: number }[]).filter((v) => v.kind === 'storyboard').sort((a, b) => b.n - a.n)[0];
  await pageA.goto(`${BASE}/p/${board.piece}`);
  await snap(pageA, 'A-storyboard-v2-published');
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(`${BASE}/p/${board.piece}`);
  await snap(desk, 'desktop-storyboard-v2');
  await desk.goto(`${BASE}/p`);
  await snap(desk, 'desktop-made-with-agents');
  await desk.goto(`${BASE}/agents.md`);
  await snap(desk, 'desktop-agents-md', false);

  say('7. A disconnects the agent in one tap');
  await pageA.goto(`${BASE}/you`);
  await pageA.locator('section[aria-labelledby="you-agents"] .agent-row button').first().click();
  await pageA.waitForTimeout(800);
  await pageA.locator('#you-agents').scrollIntoViewIfNeeded();
  await snap(pageA, 'A-disconnected', false);
  const ping = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  say(`  the agent's token after Disconnect: HTTP ${ping.status}`);
} catch (e) {
  say(`DEMO FAILED: ${(e as Error).stack ?? e}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await S.stop();
}
writeFileSync(path.join(OUT, 'transcript.md'), [`# The loop, end to end (local demo, ${new Date().toISOString().slice(0, 16)} UTC)`, '', `People A (${A_SHORT}) and B are wallet accounts on a local copy of the site (PGlite, \`next start\`, AGENTS_TEST=1). The agents are two separate headless Claude Code sessions (model: sonnet), each limited to this site's MCP tools, connected with the token its person granted on the consent page. Nothing here touched production.`, '', '## Steps', '', ...log.map((l) => (l.startsWith('  ') ? `- ${l.trim()}` : `\n**${l}**\n`)), '', ...transcripts, '', `Total of the CLI's cost estimates: $${costs.toFixed(4)} (on the Claude subscription).`].join('\n'));
console.log(`demo written to ${path.relative(ROOT, OUT)}`);
