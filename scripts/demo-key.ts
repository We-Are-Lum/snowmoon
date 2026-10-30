/**
 * A personal agent key, end to end, locally (owner, 2026-10-20: "Test with a fresh agent using only that page
 * and a key. Keys never appear in chat or logs."). The person makes a key on /dashboard (a real browser at phone
 * size, taps counted). A fresh headless Claude session gets only the address of agents.md and the key in an
 * environment variable, as an app's secret store would hold it: never in its prompt. It may use curl and
 * nothing else. Then the transcript and the server's output are searched for the key, and the person
 * reviews the drafts and ends the key in one tap. Writes docs/agents/demo-key/.
 *
 *   npm run build && npx tsx --conditions=react-server scripts/demo-key.ts
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { startStage, ROOT } from './lib/agents-harness';

const OUT = path.join(ROOT, 'docs/agents/demo-key');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const PORT = 3456;
const S = await startStage({ port: PORT, public: false });
const { BASE, people } = S;
const log: string[] = [];
const say = (s: string) => (console.log(s), log.push(s));

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
async function personContext(p: { token: string; address: string }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  const payload = JSON.parse(Buffer.from(p.token.split('.')[1], 'base64url').toString()) as { exp: number };
  const a = p.address.toLowerCase();
  // The microphone: headless Chrome here hangs on a real or fake device, so a generated tone stands in for
  // the person's voice. The recorder, the upload, the transcription route and the person's check all run as on
  // the site; the words come from the labelled stand-in transcription (SAID, below).
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
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
/** One fresh headless Claude session with no MCP servers: only curl, and the key in its environment. */
async function agentSession(label: string, key: string, prompt: string) {
  const args = ['-p', prompt, '--strict-mcp-config', '--allowedTools', 'Bash(curl:*)', '--disallowedTools', 'Edit,Write,Read,NotebookEdit,WebFetch,WebSearch,Glob,Grep,Task,Agent,TodoWrite', '--output-format', 'stream-json', '--verbose', '--max-turns', '30', '--model', 'sonnet'];
  const started = Date.now();
  const lines: string[] = await new Promise((resolve) => {
    const out: string[] = [];
    const p = spawn('claude', args, { cwd: OUT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SNOWMOON_AGENT_KEY: key } });
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
  // A readable transcript: the prompt, each tool call and its result (shortened), and the agent's words.
  const md: string[] = [`## ${label}`, '', `Prompt (model-drafted test prompt):`, '', '> ' + prompt.replace(/\n/g, '\n> '), ''];
  let cost = 0;
  for (const l of lines) {
    let m: { type: string; message?: { content?: { type: string; text?: string; name?: string; input?: unknown; content?: unknown }[] }; total_cost_usd?: number; result?: string; num_turns?: number };
    try { m = JSON.parse(l); } catch { continue; }
    if (m.type === 'assistant')
      for (const c of m.message?.content ?? []) {
        if (c.type === 'text' && c.text?.trim()) md.push(`**Agent:** ${c.text.trim()}`, '');
        if (c.type === 'tool_use') md.push(`**Tool call:** \`${String(c.name)}\``, '```json', JSON.stringify(c.input, null, 2).slice(0, 2500), '```', '');
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
  // The home folder is replaced with ~ (paths in the CLI's own init event).
  writeFileSync(path.join(OUT, `transcript-${label}.jsonl`), lines.join('\n').replaceAll(homedir(), '~') + '\n');
  say(`  ${label}: ${lines.length} events`);
  return { md: md.join('\n'), cost };
}

const transcripts: string[] = [];
let costs = 0;
/** Taps a person makes, per phase (owner, 2026-10-20: "count taps"). Typing or speaking is the creative act, not a tap. */
const taps: Record<string, string[]> = {};
let phase = 'setup';
async function tap(page: Page, selector: string | ReturnType<Page['getByRole']>, what: string) {
  (taps[phase] ??= []).push(what);
  const loc = typeof selector === 'string' ? page.locator(selector).first() : selector;
  await loc.click();
}
const reviewRow = 'section[aria-labelledby="you-review"] .draft-row';
const rowFor = (page: Page, title: RegExp) => page.locator(reviewRow).filter({ has: page.locator('strong', { hasText: title }) }).first();
// What the person says to their agent in the Claude app: a model-drafted stand-in for the owner's own words.

const ASK = 'Use my Fifteen Days version (version 2). On the first shot that has a spoken line, try a new frame with my note "warmer morning light", and mark Bai as the one speaking. Then tell me what is waiting.';
let key = '';
try {
  const ctxA = await personContext(people.A);
  const pageA = await ctxA.newPage();
  pageA.setDefaultTimeout(30_000);
  say('1. The person makes an agent key on /dashboard (shown once)');
  phase = 'make a key (once)';
  await pageA.goto(`${BASE}/dashboard`);
  (taps[phase] ??= []).push('open the Dashboard');
  // The key is blurred in every screenshot: it is a local test key, and still never shown in an artifact.
  await pageA.addStyleTag({ content: '[data-agent-key] { filter: blur(7px); }' });
  const maker = pageA.locator('details.agent-key');
  await maker.scrollIntoViewIfNeeded();
  await tap(pageA, maker.locator('summary'), 'Make an agent key');
  await maker.locator('#agent-key-name').fill('Muse');
  await snap(pageA, 'make-a-key', false);
  await tap(pageA, maker.getByRole('button', { name: 'Make the key' }), 'Make the key');
  await maker.locator('[data-agent-key]').waitFor();
  key = (await maker.locator('[data-agent-key]').textContent())?.trim() ?? '';
  await snap(pageA, 'key-shown-once-blurred', false);
  await tap(pageA, maker.getByRole('button', { name: 'Copy' }), 'Copy');
  await tap(pageA, maker.getByRole('button', { name: /Done/ }), 'Done, hide it');
  say(`  a key was made (${key.startsWith('sk1_') ? 'sk1_…' : 'not a key!'}); the page no longer shows it: ${(await pageA.locator('[data-agent-key]').count()) === 0}`);

  say('2. A fresh agent, told only where agents.md is; the key is in its environment');
  phase = 'ask';
  (taps[phase] ??= []).push('send the message (in the app)');
  const s1 = await agentSession('agent-key', key,
    `You are an AI agent working for one person. They asked you to connect to Snowmoon Party and do something there. ` +
    `Start by reading ${BASE}/agents.md (use curl), and follow it. Your person's agent key is in the environment variable SNOWMOON_AGENT_KEY: ` +
    `use it only as "$SNOWMOON_AGENT_KEY" in your curl headers, and never print, echo or repeat its value. ` +
    `Your person said (their words, a test stand-in): "${ASK}" ` +
    `For anything the tools can't do, call log_gap. Finish by telling your person in two or three sentences what's waiting for them.`);
  transcripts.push(s1.md);
  costs += s1.cost;

  say('3. The key is nowhere: not in the transcript, not in the server’s output');
  const raw = readFileSync(path.join(OUT, 'transcript-agent-key.jsonl'), 'utf8');
  const inTranscript = raw.includes(key) || raw.includes(key.slice(4, 24));
  const inLogs = S.serverLog().includes(key) || S.serverLog().includes(key.slice(4, 24));
  say(`  in the agent's transcript: ${inTranscript ? 'YES (failure)' : 'no'}; in the server's output: ${inLogs ? 'YES (failure)' : 'no'}`);
  if (inTranscript || inLogs) process.exitCode = 1;

  say('4. The person reviews on /dashboard, then ends the key in one tap');
  phase = 'review on /dashboard';
  await pageA.reload();
  (taps[phase] ??= []).push('open the Dashboard');
  await pageA.locator(reviewRow).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await pageA.locator('section[aria-labelledby="you-review"]').scrollIntoViewIfNeeded();
  await snap(pageA, 'drafts-from-the-key');
  const drafts = await (await fetch(`${BASE}/api/drafts`, { headers: { authorization: `Bearer ${people.A.token}` } })).json();
  say(`  waiting: ${(drafts.drafts as { title: string; agent?: string }[]).map((d) => d.title).join('; ') || 'nothing'}`);
  phase = 'end the key';
  const row = pageA.locator('.agent-row').filter({ hasText: 'Muse' }).first();
  await row.scrollIntoViewIfNeeded();
  await snap(pageA, 'key-on-you', false);
  await tap(pageA, row.getByRole('button', { name: 'Disconnect' }), 'Disconnect');
  await pageA.waitForTimeout(800);
  const after = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
  say(`  the key after Disconnect: ${after.status === 401 ? 'refused (401)' : `still works (${after.status}): failure`}`);
  if (after.status !== 401) process.exitCode = 1;

  say('Taps, by phase (the message to the agent is the creative act; only sending it counts):');
  for (const [k, v] of Object.entries(taps)) say(`  ${k}: ${v.length} (${v.join(' · ')})`);
  await browser.close();
} catch (e) {
  say(`FAILED: ${(e as Error).message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  await S.stop();
}
// The key itself is never written: the files are searched once more and scrubbed if it is somehow there.
for (const f of readdirSync(OUT)) {
  const p = path.join(OUT, f);
  if (!/\.(md|jsonl)$/.test(f)) continue;
  const t = readFileSync(p, 'utf8');
  if (key && t.includes(key)) { writeFileSync(p, t.replaceAll(key, 'sk1_[removed]')); say(`  (removed the key from ${f})`); process.exitCode = 1; }
}
writeFileSync(path.join(OUT, 'transcript.md'), [`# A personal agent key, end to end (local demo, ${new Date().toISOString().slice(0, 16)} UTC)`, '', `Person A is a wallet account on a local copy of the site (PGlite, \`next start\`, AGENTS_TEST=1, owner-only mode), the author of Fifteen Days version 2 here. The agent is a fresh headless Claude Code session (model: sonnet) with no MCP servers and only curl allowed. It was told the address of agents.md, and the key was in its environment (SNOWMOON_AGENT_KEY), never in its prompt. The frame comes from Remix's pipeline with its labelled stand-in model. Nothing here touched production. The key in the screenshots is blurred.`, '', '## Steps', '', ...log.map((l) => (l.startsWith('  ') ? `- ${l.trim()}` : `\n**${l}**\n`)), '', ...transcripts, '', `Total of the CLI's cost estimates: $${costs.toFixed(4)} (on the Claude subscription).`].join('\n'));
