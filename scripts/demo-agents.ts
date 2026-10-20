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
// What A "says" through the fake microphone: the stand-in transcription returns these in turn (fixed test words,
// standing in for a person's; written by the coding agent for the demo, never published).
const SAID = [
  'Morning of the semi-final. Bai tells Zei to slow down, and this time he listens. Start in the lobby, end with him calm.',
  'Take the note about ending close on his face. And hold the last shot longer, let it be quiet.',
];
const S = await startStage({ port: PORT, transcript: SAID.join('|') });
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
  writeFileSync(path.join(OUT, `transcript-${label}.jsonl`), lines.join('\n') + '\n');
  say(`  ${label}: ${lines.length} events`);
  return { md: md.join('\n'), cost };
}

const A_SHORT = `${people.A.address.slice(0, 6)}…${people.A.address.slice(-4)}`;
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
try {
  const ctxA = await personContext(people.A);
  const ctxB = await personContext(people.B);

  say('1. Each person connects an agent (the consent page, then Allow)');
  const agentA = await connectInBrowser(ctxA, 'Claude', 'A-connects-claude');
  const agentB = await connectInBrowser(ctxB, 'Claude (second agent)', 'B-connects-second-agent');

  say('2. Idea: A says an idea on /you (spoken; the transcript comes back for A to check)');
  phase = 'idea → first thing made';
  const pageA = await ctxA.newPage();
  await pageA.goto(`${BASE}/you`);
  (taps[phase] ??= []).push('open the You page');
  await pageA.locator('#you-idea').waitFor();
  await snap(pageA, 'A-you-tell-your-agent', false);
  await tap(pageA, pageA.getByRole('button', { name: 'Speak' }).first(), 'Speak');
  await pageA.waitForTimeout(1500);
  await tap(pageA, pageA.getByRole('button', { name: 'Stop' }).first(), 'Stop');
  await pageA.waitForFunction(() => (document.querySelector('#you-idea') as HTMLTextAreaElement | null)?.value.length);
  await snap(pageA, 'A-spoken-idea-to-check', false);
  await tap(pageA, pageA.getByRole('button', { name: 'Send to your agent' }).first(), 'Send to your agent');
  await pageA.waitForTimeout(800);
  say(`  A said: "${await (await fetch(`${BASE}/api/requests`, { headers: { authorization: `Bearer ${people.A.token}` } })).json().then((j) => j.requests[0]?.words)}"`);

  const work = (extra: string) =>
    `You are connected to snowmoon.party as an agent for your person. Call whoami, then read_requests: those are your person's own words, and your to-do list. ` +
    `${extra} Answer each request with a draft (answering: its id). Story words stay human: place your person's own words exactly as they said them, or the book's word for word with the block, and never write lines yourself. ` +
    `Finish by telling your person in two sentences what's waiting for them.`;
  (taps[phase] ??= []).push('tell their AI “go” (one message in Claude)');
  const s1 = await agentSession('agent-A-1-idea', agentA.token, work('For an idea, make a storyboard from 4 to 6 shots of the published scene Fifteen Days, version 2 (list_scenes, get_scene); pick shots that show what the idea says.'));
  transcripts.push(s1.md);
  costs += s1.cost;

  // No reload: the You page shows the draft as it lands (it checks while something is waiting).
  await pageA.locator(reviewRow).first().waitFor({ timeout: 60_000 });
  await pageA.locator('section[aria-labelledby="you-review"]').scrollIntoViewIfNeeded();
  await snap(pageA, 'A-first-thing-made');
  say('3. A keeps it (one tap)');
  phase = 'keep';
  await tap(pageA, `${reviewRow} button.ic-primary`, 'Keep');
  await pageA.waitForTimeout(1000);
  const drafts = await (await fetch(`${BASE}/api/drafts`, { headers: { authorization: `Bearer ${people.A.token}` } })).json();
  const first = (drafts.published as { kind: string; piece: string; id: string; title: string }[])[0];
  say(`  kept: ${first.title} (${first.kind})`);

  say('4. Feedback: B (a person) writes a note; B’s agent drafts one; B keeps it');
  phase = 'feedback from others';
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/p/${first.piece}`);
  await snap(pageB, 'B-sees-the-piece');
  await pageB.locator('#piece-note').fill('Lovely. Could it end on a held close-up of his face instead of the wide? Let the quiet land.');
  await tap(pageB, pageB.getByRole('button', { name: 'Post note' }), 'B: Post note');
  await pageB.waitForTimeout(1200);
  const s2 = await agentSession('agent-B-note', agentB.token,
    `You are connected to snowmoon.party as an agent for your person. Call whoami. Another person's piece was just published: piece ${first.piece} (get_piece). Leave one short, specific, constructive note on its latest version (leave_note), about the pictures and timing, not story lines. Tell your person the note is waiting for them.`);
  transcripts.push(s2.md);
  costs += s2.cost;
  await pageB.goto(`${BASE}/you`);
  await pageB.locator(reviewRow).first().waitFor();
  await tap(pageB, `${reviewRow} button.ic-primary`, 'B: Keep (their agent’s note)');
  await pageB.waitForTimeout(1000);

  say('5. A reads the notes and tells their agent what to change (spoken, on the piece)');
  phase = 'feedback → revision';
  await pageA.goto(`${BASE}/p/${first.piece}`);
  (taps[phase] ??= []).push('open the piece (from a notification or /you)');
  await pageA.locator('#piece-tell').waitFor();
  await snap(pageA, 'A-sees-feedback');
  await tap(pageA, pageA.getByRole('button', { name: 'Speak' }).first(), 'Speak');
  await pageA.waitForTimeout(1500);
  await tap(pageA, pageA.getByRole('button', { name: 'Stop' }).first(), 'Stop');
  await pageA.waitForFunction(() => (document.querySelector('#piece-tell') as HTMLTextAreaElement | null)?.value.length);
  await tap(pageA, pageA.getByRole('button', { name: 'Send to your agent' }).first(), 'Send to your agent');
  await pageA.waitForTimeout(800);
  (taps[phase] ??= []).push('tell their AI “go”');
  const s3 = await agentSession('agent-A-2-revision', agentA.token, work(`Also call read_feedback: other people's notes on your person's work. Revise the piece your person kept (propose_revision of its latest published version), answering your person's request, and crediting the other notes you take up (notes: their ids).`));
  transcripts.push(s3.md);
  costs += s3.cost;

  // No trip to /you: the new version appears on the piece itself, with Keep, Try again and Say more.
  await pageA.locator('.piece-own-draft .draft-row').first().waitFor({ timeout: 60_000 });
  await pageA.locator('.piece-own-draft').first().scrollIntoViewIfNeeded();
  await snap(pageA, 'A-revision-to-react-to');
  await tap(pageA, '.piece-own-draft .draft-row button.ic-primary', 'Keep');
  await pageA.waitForLoadState('load');
  await pageA.waitForTimeout(1500);
  await pageA.goto(`${BASE}/p/${first.piece}`);
  await snap(pageA, 'A-published-with-stamp');
  await pageA.locator('details.piece-recipe-box').last().locator('summary').click();
  await snap(pageA, 'A-recipe-open');
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(`${BASE}/p/${first.piece}`);
  await snap(desk, 'desktop-piece');
  await desk.goto(`${BASE}/agents.md`);
  await snap(desk, 'desktop-agents-md', false);

  say('6. A disconnects the agent in one tap');
  phase = 'disconnect';
  await pageA.goto(`${BASE}/you`);
  await tap(pageA, 'section[aria-labelledby="you-agents"] .agent-row button', 'Disconnect');
  await pageA.waitForTimeout(800);
  await pageA.locator('section[aria-labelledby="you-agents"]').scrollIntoViewIfNeeded();
  await snap(pageA, 'A-disconnected', false);
  const ping = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agentA.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  say(`  the agent's token after Disconnect: HTTP ${ping.status}`);
  say('Taps, by phase (typing or speaking is the creative act and isn’t counted as a tap):');
  for (const [k, v] of Object.entries(taps)) say(`  ${k}: ${v.length} (${v.join(', ')})`);
} catch (e) {
  say(`DEMO FAILED: ${(e as Error).stack ?? e}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await S.stop();
}
writeFileSync(path.join(OUT, 'transcript.md'), [`# The loop, end to end (local demo, ${new Date().toISOString().slice(0, 16)} UTC)`, '', `People A (${A_SHORT}) and B are wallet accounts on a local copy of the site (PGlite, \`next start\`, AGENTS_TEST=1). The agents are two separate headless Claude Code sessions (model: sonnet), each limited to this site's MCP tools, connected with the token its person granted on the consent page. Speaking uses a generated tone in place of a microphone (headless Chrome here can't open one) and a labelled stand-in transcription that returns fixed words written for the test; the recorder, upload, transcription route and the person's check run as on the site. Nothing here touched production.`, '', '## Steps', '', ...log.map((l) => (l.startsWith('  ') ? `- ${l.trim()}` : `\n**${l}**\n`)), '', ...transcripts, '', `Total of the CLI's cost estimates: $${costs.toFixed(4)} (on the Claude subscription).`].join('\n'));
console.log(`demo written to ${path.relative(ROOT, OUT)}`);
