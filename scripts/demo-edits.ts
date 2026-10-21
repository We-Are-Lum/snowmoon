/**
 * Editing your own adaptation through your agent, end to end, locally (owner, 2026-10-20: "edit Fifteen Days
 * myself through agents on my phone"). A fresh headless Claude session is the agent, connected to the local
 * site's /mcp with the token its person granted on the real consent page; it gets the person's chat message
 * (a model-drafted stand-in for the owner's words, labelled as such) and uses the edit tools and log_gap. The
 * person then approves the spend and keeps the edits on /you, in a real browser at phone size, with every tap
 * counted. Writes docs/agents/demo-edits/: screenshots, the agent's transcript, and a summary.
 *
 *   npm run build && npx tsx --conditions=react-server scripts/demo-edits.ts
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { startStage, ROOT } from './lib/agents-harness';

const OUT = path.join(ROOT, 'docs/agents/demo-edits');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const PORT = 3456;
const S = await startStage({ port: PORT });
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
const ASK =
  'In my version of Fifteen Days (version 2), on the first shot that has a spoken line: ' +
  '1) try a new frame, my note: "warmer morning light, steam rising from his cup". ' +
  '2) Use a different take of that line. ' +
  '3) Make the shot after it 4 seconds long. ' +
  '4) It\'s Bai speaking in that first shot, mark it. ' +
  '5) Ask for a video test of that first shot: "steam rises, the camera holds". ' +
  '6) And make Zei\'s coat blue in every hotel shot.';
try {
  const ctxA = await personContext(people.A);
  say('1. The person connects their agent (the consent page, then Allow)');
  phase = 'connect (once)';
  (taps[phase] ??= []).push('Allow');
  const agentA = await connectInBrowser(ctxA, 'Claude', 'connect-claude');

  say('2. The person asks, in one chat message; a fresh agent session does the work');
  phase = 'ask';
  (taps[phase] ??= []).push('send the message in Claude');
  const s1 = await agentSession('agent-edits', agentA.token,
    `You are connected to snowmoon.party as an agent for your person, through its connector. Call whoami first. ` +
    `Your person just said to you in chat (their words, a test stand-in): "${ASK}" ` +
    `Do each thing you can as a draft, using the tools. For anything the tools can't do, call log_gap with what they asked and what was missing. ` +
    `Finish by telling your person in two or three sentences what's waiting for them and what you couldn't do.`);
  transcripts.push(s1.md);
  costs += s1.cost;

  const pageA = await ctxA.newPage();
  pageA.setDefaultTimeout(30_000);
  phase = 'review on /you';
  await pageA.goto(`${BASE}/you`);
  (taps[phase] ??= []).push('open the You page');
  await pageA.locator(reviewRow).first().waitFor({ timeout: 60_000 });
  await pageA.locator('section[aria-labelledby="you-review"]').scrollIntoViewIfNeeded();
  await snap(pageA, 'edits-waiting');
  const drafts = await (await fetch(`${BASE}/api/drafts`, { headers: { authorization: `Bearer ${people.A.token}` } })).json();
  say(`  waiting: ${(drafts.drafts as { title: string }[]).map((d) => d.title).join('; ')}`);
  say(`  gaps: ${(drafts.gaps as { asked: string; missing: string }[]).map((g) => `asked "${g.asked}"; missing: ${g.missing}`).join(' | ') || 'none'}`);

  say('3. The person approves the new frame (cost shown), then keeps it');
  phase = 'frame: approve and keep';
  const frameRow = rowFor(pageA, /new frame/);
  if (await frameRow.count()) {
    await tap(pageA, frameRow.getByRole('button', { name: /^Make it/ }), 'Make it (cost shown)');
    await frameRow.locator('img, video').first().waitFor({ timeout: 60_000 }).catch(() => {});
    await frameRow.scrollIntoViewIfNeeded();
    await snap(pageA, 'frame-made', false);
    await tap(pageA, rowFor(pageA, /new frame/).getByRole('button', { name: 'Keep' }), 'Keep');
    await pageA.waitForTimeout(800);
  } else say('  (no frame draft)');

  say('4. The video test: approve, then keep');
  phase = 'video test: approve and keep';
  const videoRow = rowFor(pageA, /video test/);
  if (await videoRow.count()) {
    await tap(pageA, videoRow.getByRole('button', { name: /^Run the test/ }), 'Run the test (cost shown)');
    await videoRow.locator('video').first().waitFor({ timeout: 60_000 }).catch(() => {});
    await videoRow.scrollIntoViewIfNeeded();
    await snap(pageA, 'video-test-made', false);
    await tap(pageA, rowFor(pageA, /video test/).getByRole('button', { name: 'Keep' }), 'Keep');
    await pageA.waitForTimeout(800);
  } else say('  (no video draft)');

  say('5. The free edits (take, timing, who speaks): one Keep each');
  phase = 'free edits: keep each';
  for (const t of [/another take/, /new timing/, /who.s speaking/]) {
    const row = rowFor(pageA, t);
    if (!(await row.count())) { say(`  (no draft for ${t})`); continue; }
    await row.scrollIntoViewIfNeeded();
    await tap(pageA, row.getByRole('button', { name: 'Keep' }), 'Keep');
    await pageA.waitForTimeout(800);
  }

  say('6. What the agent couldn’t do, on /you');
  phase = 'gaps';
  await pageA.reload();
  const gapsSection = pageA.locator('section[aria-labelledby="you-gaps"]');
  await gapsSection.waitFor({ timeout: 15_000 }).catch(() => {});
  if (await gapsSection.count()) {
    await gapsSection.scrollIntoViewIfNeeded();
    await snap(pageA, 'gaps-on-you', false);
  } else say('  (no gaps section)');
  const after = await (await fetch(`${BASE}/api/drafts`, { headers: { authorization: `Bearer ${people.A.token}` } })).json();
  say(`  kept: ${(after.published as { title: string; spentUsd: number | null }[]).map((d) => `${d.title}${d.spentUsd !== null ? ` ($${d.spentUsd})` : ''}`).join('; ')}`);
  say(`  still waiting: ${(after.drafts as unknown[]).length}`);

  say('Taps, by phase (the chat message is the creative act and isn’t counted, only sending it):');
  for (const [k, v] of Object.entries(taps)) say(`  ${k}: ${v.length} (${v.join(' · ')})`);
  await browser.close();
} catch (e) {
  say(`FAILED: ${(e as Error).message.split('\n')[0]}`);
  for (const p of browser.contexts().flatMap((c) => c.pages())) await snap(p, 'failed').catch(() => {});
  process.exitCode = 1;
} finally {
  await S.stop();
}
writeFileSync(path.join(OUT, 'transcript.md'), [`# Editing your own scene through your agent (local demo, ${new Date().toISOString().slice(0, 16)} UTC)`, '', `Person A is a wallet account on a local copy of the site (PGlite, \`next start\`, AGENTS_TEST=1), the author of Fifteen Days version 2 here. The agent is a fresh headless Claude Code session (model: sonnet), limited to this site's MCP tools and connected with the token A granted on the consent page. A's chat message is a model-drafted stand-in for the owner's words. The frame comes from Remix's pipeline with its labelled stand-in model (REMIX_TEST_FAKES), and the video from a stand-in for fal; no paid model was called. Nothing here touched production.`, '', '## Steps', '', ...log.map((l) => (l.startsWith('  ') ? `- ${l.trim()}` : `\n**${l}**\n`)), '', ...transcripts, '', `Total of the CLI's cost estimates: $${costs.toFixed(4)} (on the Claude subscription).`].join('\n'));
