/**
 * Leaving mid-conversion, and the take kept on the device (Nate, 2026-11-22), against a real local server: this
 * branch's production build (`next start`), a throwaway in-memory database (PGlite, every migration), the ElevenLabs
 * stub with a slow conversion, and Chromium with its fake microphone. No network, no spending.
 *
 *  L1. a whole-take conversion whose request is cut off mid-flight (the client aborts while ElevenLabs is still
 *      converting) is still kept as its person's draft, with the converted audio only;
 *  L2. in the browser: a take is saved on the device and is there after a reload; another sign-in on the same browser
 *      neither sees nor converts it; Remove deletes it;
 *  L3. in the browser: leaving during a conversion asks first (beforeunload); the page closed mid-conversion, the draft
 *      is kept all the same, and coming back shows the take and the draft it became;
 *  L5. keeping fails after the conversion (the store refuses the write): the page says so, nothing is half-kept, and
 *      Convert again from the take on the device keeps it;
 *  L4. switching speeches with a take in the tab: each speech shows and sends only its own take.
 *
 *   npm run build, then:   tsx scripts/test-voice-leave.ts --url=http://127.0.0.1:3417
 * The script starts `next start` itself on that port. Run it with the worktree's .env.local moved aside (it points at
 * production): the server must see only this script's settings.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStub } from './lib/elevenlabs-stub';

const ROOT = path.resolve(import.meta.dirname, '..');
const url = process.argv.find((a) => a.startsWith('--url='))?.slice(6);
if (!url || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) throw new Error('--url=http://127.0.0.1:<port> is required (a local server only)');
if (existsSync(path.join(ROOT, '.env.local'))) throw new Error('Move this worktree\'s .env.local aside first: the server must not see production settings');
const PORT = Number(new URL(url).port);
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NATE = 6786;
const GARANCE = 193912;
const PG_PORT = 54383;
const STUB_PORT = 54393;
const DELAY = 6000;

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const pgServer = new PGLiteSocketServer({ db: pg, port: PG_PORT, host: '127.0.0.1' });
await pgServer.start();
// Chromium's fake microphone, as WebM/Opus, makes about 12 kB a second; a slow conversion, to leave during it.
const stub = await startStub(STUB_PORT, { bytesPerSecond: 12000, convertDelayMs: DELAY });
const STORE = mkdtempSync(path.join(os.tmpdir(), 'voice-leave-'));
const storeFiles = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d, { withFileTypes: true })) n.isDirectory() ? walk(path.join(d, n.name)) : out.push(path.join(d, n.name)); };
  if (existsSync(STORE)) walk(STORE);
  return out;
};

const env = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? '',
  NODE_ENV: 'production',
  STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${PG_PORT}/postgres`,
  VOICE_TEST_ON: '1',
  VOICE_TEST_FID: `${NATE},${GARANCE}`,
  VOICE_TEST_STORE: STORE,
  ELEVENLABS_BASE_URL: `http://127.0.0.1:${STUB_PORT}`,
  VOICE_TICKET_SECRET: 'test-voice-leave-secret-0123456789',
} as NodeJS.ProcessEnv;
const server = spawn(path.join(ROOT, 'node_modules/.bin/next'), ['start', '-p', String(PORT), '-H', '127.0.0.1'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
const serverLog: string[] = [];
server.stdout.on('data', (d: Buffer) => serverLog.push(String(d)));
server.stderr.on('data', (d: Buffer) => serverLog.push(String(d)));
for (let i = 0; ; i++) {
  if (await fetch(`${url}/api/version`).then((r) => r.ok, () => false)) break;
  if (i > 120) throw new Error(`the server didn't start: ${serverLog.join('').slice(-800)}`);
  await sleep(500);
}

const api = (fid: number, p: string, init: RequestInit = {}) => fetch(`${url}/api/voice/${p}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer voice-test-${fid}` } });
const drafts = async (fid: number) => (await pg.query<{ id: string; recipe: { kept?: string; takes: { takeSha256: string; convertedSha256: string }[] } }>(`select id, recipe from studio.voice_drafts where fid = $1 and kind = 'performance' order by made_at`, [fid])).rows;
const status = (await (await api(NATE, 'status')).json()) as { consent: { sha256: string }; speech: { id: string }; speeches: { id: string; title: string }[]; choices: { presetId: string; candidate: number }[] };
for (const fid of [NATE, GARANCE]) await api(fid, 'consent', { method: 'POST', body: JSON.stringify({ sha256: status.consent.sha256 }) });

try {
  // L1. The request cut off mid-flight.
  {
    const take = randomBytes(12000 * 35); // the stub hears it as 35 s
    const f = new FormData();
    f.set('take', new Blob([take], { type: 'audio/webm' }));
    f.set('speechId', status.speech.id);
    f.set('presetId', status.choices[0].presetId);
    f.set('candidate', String(status.choices[0].candidate));
    f.set('seconds', '35');
    f.set('agree', status.consent.sha256);
    const ac = new AbortController();
    const sent = api(NATE, 'convert', { method: 'POST', body: f, signal: ac.signal });
    // Cut off once ElevenLabs has the take and is still converting.
    for (let i = 0; i < 100 && !stub.calls.some((c) => c.path.startsWith('/v1/speech-to-speech/')); i++) await sleep(50);
    const reachedStub = stub.calls.some((c) => c.path.startsWith('/v1/speech-to-speech/'));
    ac.abort();
    const cut = await sent.then(() => 'answered', (e) => (String(e).includes('abort') ? 'aborted' : String(e)));
    check('L1. the request reached ElevenLabs and was then cut off by the client, before any answer', reachedStub && cut === 'aborted', cut);
    check('L1. ... no draft yet at the moment it was cut off', (await drafts(NATE)).length === 0);
    let kept: Awaited<ReturnType<typeof drafts>> = [];
    for (let i = 0; i < 60 && !kept.length; i++) {
      await sleep(500);
      kept = await drafts(NATE);
    }
    const d = kept[0];
    check('L1. the conversion went on, and was kept as its person\'s draft after the client had gone', kept.length === 1 && d.recipe.kept === 'automatically, when the conversion came back' && d.recipe.takes[0].takeSha256 === sha(take), JSON.stringify(kept).slice(0, 300));
    const files = storeFiles();
    check('L1. ... its stored audio is the converted speech, never the take', files.length === 1 && files.every((p) => sha(new Uint8Array(readFileSync(p))) === d?.recipe.takes[0].convertedSha256) && files.every((p) => !readFileSync(p).includes(take.subarray(0, 64))));
    check('L1. ... and its history item and transcript were deleted at ElevenLabs all the same', stub.deleted.length === 1 && stub.kept().length === 0 && stub.deletedTranscripts.length === 1);
    await pg.query(`delete from studio.voice_draft_audio`);
    await pg.query(`delete from studio.voice_drafts`);
    for (const p of storeFiles()) rmSync(p);
  }

  // L2 and L3. In the browser.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await ctx.route('**/api/chat/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
  const as = async (page: import('playwright-core').Page, fid: number) => {
    await page.evaluate((f) => localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `voice-test-${f}`, fid: f, username: `fid${f}`, exp: Math.floor(Date.now() / 1000) + 86400 })), fid);
    await page.reload();
  };
  let page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('snowmoon.intro-seen', 'v2'));
  await page.goto(`${url}/storyboard/record`);
  await as(page, NATE);
  const ready = async () => {
    await page.locator('#vr-pick-h').first().waitFor({ timeout: 30_000 });
    if (!(await page.locator('input[name="voice"]:checked').count())) await page.locator('input[name="voice"]').first().check();
    await page.locator('#vr-rec-h').first().waitFor({ timeout: 30_000 });
  };
  await ready();
  await page.getByRole('button', { name: 'Record' }).click();
  await sleep(4000);
  await page.getByRole('button', { name: /^Stop/ }).click();
  await page.locator('.vr-take').waitFor({ timeout: 30_000 });
  check('L2. a take says it is saved on this device', await page.locator('.vr-take', { hasText: 'Saved on this device' }).count() === 1);
  const keys = () => page.evaluate(() => new Promise<string[]>((res, rej) => {
    const r = indexedDB.open('snowmoon-voice-takes', 1);
    r.onsuccess = () => {
      const q = r.result.transaction('takes', 'readonly').objectStore('takes').getAllKeys();
      q.onsuccess = () => (res(q.result.map(String)), r.result.close());
      q.onerror = () => rej(q.error);
    };
    r.onerror = () => rej(r.error);
  }));
  check('L2. ... in this browser\'s IndexedDB, under the signed-in FID and the speech', (await keys()).join() === `${NATE}:${status.speech.id}`, (await keys()).join());
  await page.reload();
  await ready();
  await page.locator('.vr-take').waitFor({ timeout: 15_000 }).catch(() => {});
  check('L2. after a reload the take is still there', await page.locator('.vr-take', { hasText: 'Saved on this device' }).count() === 1);
  await as(page, GARANCE);
  await ready();
  await sleep(1500);
  check('L2. another sign-in on the same browser doesn\'t see it, and has nothing to convert', (await page.locator('.vr-take').count()) === 0 && (await page.getByRole('button', { name: /^Convert/ }).count()) === 0);
  check('L2. ... though it is still on the device, under the first FID only', (await keys()).join() === `${NATE}:${status.speech.id}`);
  await as(page, NATE);
  await ready();
  await page.locator('.vr-take').waitFor({ timeout: 15_000 });
  check('L2. back as its person, the take is there again', await page.locator('.vr-take', { hasText: 'Saved on this device' }).count() === 1);

  // L3. Leaving during a conversion.
  await page.locator('.vr-take input[type="checkbox"]').check();
  const callsBefore = stub.calls.filter((c) => c.path.startsWith('/v1/speech-to-speech/')).length;
  await page.getByRole('button', { name: /^Convert/ }).click();
  for (let i = 0; i < 100 && stub.calls.filter((c) => c.path.startsWith('/v1/speech-to-speech/')).length === callsBefore; i++) await sleep(50);
  let asked = false;
  page.once('dialog', async (d) => {
    asked = d.type() === 'beforeunload';
    await d.accept();
  });
  await page.close({ runBeforeUnload: true });
  for (let i = 0; i < 20 && !asked; i++) await sleep(100);
  check('L3. leaving during a conversion asks first', asked);
  check('L3. ... and the page was closed while ElevenLabs was still converting', (await drafts(NATE)).length === 0);
  let kept: Awaited<ReturnType<typeof drafts>> = [];
  for (let i = 0; i < 60 && !kept.length; i++) {
    await sleep(500);
    kept = await drafts(NATE);
  }
  check('L3. the draft was kept after the page had gone', kept.length === 1 && kept[0].recipe.kept === 'automatically, when the conversion came back');
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/storyboard/record`);
  await ready();
  await page.locator('.vr-take').waitFor({ timeout: 15_000 });
  check('L3. coming back: the take is still on the device, and says it became a draft', await page.locator('.vr-take', { hasText: 'converted and kept as your draft' }).count() === 1);
  check('L3. ... and the draft is in the list', await page.locator('#vr-drafts-h').count() === 1);

  // L5. Keeping fails after the conversion: the store refuses every write (as a storage outage would).
  const { chmodSync } = await import('node:fs');
  // The test database's daily counts are cleared between steps: three whole takes a person a day would stop this run.
  const freshDay = () => pg.query('delete from studio.voice_asks');
  await freshDay();
  const filesBefore = storeFiles().length;
  chmodSync(STORE, 0o500);
  await page.locator('.vr-take input[type="checkbox"]').check();
  await page.getByRole('button', { name: /^Convert/ }).click();
  const said = page.locator('text=/couldn.t be kept as your draft/');
  await said.first().waitFor({ timeout: 60_000 }).catch(() => {});
  check('L5. keeping failed after the conversion: the page says so, and that the recording is still on this device', (await said.count()) > 0 && (await page.locator('text=/still on this device/').count()) > 0);
  chmodSync(STORE, 0o700);
  check('L5. ... nothing was half-kept (no new draft, no new file)', (await drafts(NATE)).length === 1 && storeFiles().length === filesBefore);
  check('L5. ... the take is still there, with Convert', (await page.locator('.vr-take', { hasText: 'Saved on this device' }).count()) === 1 && (await page.getByRole('button', { name: /^Convert/ }).count()) === 1);
  await page.locator('.vr-take input[type="checkbox"]').check();
  await page.getByRole('button', { name: /^Convert/ }).click();
  await page.locator('text=Kept as your draft.').first().waitFor({ timeout: 60_000 }).catch(() => {});
  check('L5. Convert again from the take on the device: kept', (await drafts(NATE)).length === 2 && (await page.locator('text=Kept as your draft.').count()) > 0);

  // L4. Switching speeches with a take in the tab.
  const [first, second] = status.speeches;
  const takeShaOnPage = () => page.locator('.vr-take audio').first().evaluate(async (a: HTMLAudioElement) => {
    const b = await (await fetch(a.src)).arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
  });
  const firstSha = await takeShaOnPage();
  await page.locator('label.vr-speech', { hasText: second.title }).locator('input').check();
  await sleep(1000);
  check(`L4. switching to "${second.title}" with "${first.title}"'s take in the tab: no take is shown for it`, (await page.locator('.vr-take').count()) === 0 && (await page.getByRole('button', { name: /^Convert/ }).count()) === 0);
  await page.getByRole('button', { name: 'Record' }).click();
  await sleep(2500);
  await page.getByRole('button', { name: /^Stop/ }).click();
  await page.locator('.vr-take').waitFor({ timeout: 30_000 });
  const secondSha = await takeShaOnPage();
  check('L4. ... its own take is recorded and kept beside the first, under its own key', secondSha !== firstSha && (await keys()).sort().join() === [`${NATE}:${first.id}`, `${NATE}:${second.id}`].sort().join(), (await keys()).join());
  await page.locator('label.vr-speech', { hasText: first.title }).locator('input').check();
  await page.locator('.vr-take').waitFor({ timeout: 15_000 });
  check(`L4. back on "${first.title}": its own take is shown, not the other's`, (await takeShaOnPage()) === firstSha);
  await page.locator('label.vr-speech', { hasText: second.title }).locator('input').check();
  await page.locator('.vr-take').waitFor({ timeout: 15_000 });
  check(`L4. on "${second.title}" again: its own take`, (await takeShaOnPage()) === secondSha);
  await freshDay();
  const sent: string[] = [];
  const onReq = (r: import('playwright-core').Request) => {
    if (r.url().endsWith('/api/voice/convert')) sent.push(r.postDataBuffer()?.toString('latin1') ?? '');
  };
  page.on('request', onReq);
  await page.locator('.vr-take input[type="checkbox"]').check();
  await page.getByRole('button', { name: /^Convert/ }).click();
  await page.locator('text=Kept as your draft.').first().waitFor({ timeout: 60_000 }).catch(() => {});
  page.off('request', onReq);
  const all = await drafts(NATE);
  const last = all.at(-1);
  const lastSpeech = (await pg.query<{ speech_id: string }>(`select speech_id from studio.voice_drafts where id = $1`, [last?.id])).rows[0]?.speech_id;
  check(`L4. Convert sends "${second.title}"'s take with "${second.title}" only, and its draft is of that speech`, sent.length === 1 && sent[0].includes(`\r\n\r\n${second.id}\r\n`) && !sent[0].includes(`\r\n\r\n${first.id}\r\n`) && last?.recipe.takes[0].takeSha256 === secondSha && lastSpeech === second.id, `${lastSpeech} ${sent.length}`);
  await page.locator('label.vr-speech', { hasText: first.title }).locator('input').check();
  await page.locator('.vr-take').waitFor({ timeout: 15_000 });

  // Remove: the take leaves the device.
  await page.locator('.vr-take').getByRole('button', { name: 'Remove' }).click();
  await sleep(500);
  check('L2. Remove deletes that speech\'s take from the device, and only that one', (await keys()).join() === `${NATE}:${second.id}` && (await page.locator('.vr-take').count()) === 0, (await keys()).join());
  await page.reload();
  await ready();
  await sleep(1500);
  check('L2. ... and it stays gone after a reload', (await page.locator('.vr-take').count()) === 0);
  check('L. no errors on the page', errors.length === 0, errors.join(' | '));
  await browser.close();
} finally {
  server.kill('SIGTERM');
  await stub.close();
  await pgServer.stop();
  rmSync(STORE, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
