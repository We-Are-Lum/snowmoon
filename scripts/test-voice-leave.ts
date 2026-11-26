/**
 * Leaving mid-conversion, and the take kept on the device (Nate, 2026-11-22), against a real local server: this
 * branch's production build (`next start`), a throwaway in-memory database (PGlite, every migration), the ElevenLabs
 * stub with a slow conversion, and Chromium with its fake microphone. No network, no spending.
 *
 *  L1. a whole-take conversion whose request is cut off mid-flight (the client aborts while ElevenLabs is still
 *      converting) is still kept as its person's draft, with the converted audio only;
 *  L2. in the browser (the four-step recorder at /ephelion/record, 2026-11-26): a take is saved on the device and is there after a reload; another sign-in on the same browser
 *      neither sees nor converts it; Remove deletes it;
 *  L3. in the browser: leaving during a conversion asks first (beforeunload); the page closed mid-conversion, the draft
 *      is kept all the same, and coming back shows the take and the draft it became;
 *  L5. keeping fails after the conversion (the store refuses the write): the page says so, nothing is half-kept, and
 *      Convert again from the take on the device keeps it;
 *  L4. switching speeches with a take in the tab: each speech shows and sends only its own take;
 *  L6. a take kept without its word check (the transcription failed): the draft says so, and "Check the words" checks
 *      its own converted audio and keeps it again with the check, the one without it removed.
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
const TESTER = 6852; // VOICE.testers: the voice pages, nothing else of an admin's
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
  VOICE_TEST_FID: `${NATE},${GARANCE},${TESTER}`,
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
    check('L1. ... and its history item and transcript were deleted at ElevenLabs all the same', stub.deleted.length === 1 && stub.kept().length === 0 && stub.deletedTranscripts.length === 1, JSON.stringify({ deleted: stub.deleted, kept: stub.kept(), transcripts: stub.deletedTranscripts }));
    await pg.query(`delete from studio.voice_draft_audio`);
    await pg.query(`delete from studio.voice_drafts`);
    for (const p of storeFiles()) rmSync(p);
  }

  // L8. The voice samples (2026-11-26): an admin makes the missing ones (the stub's text-to-speech), a tester can't.
  {
    const list0 = (await (await api(TESTER, 'samples')).json()) as { samples: { ready: boolean }[]; canMake: boolean; missing: number; missingCredits: number };
    check('L8. the samples list: every offered speech × saved voice, none made yet; a tester may not make them', list0.samples.length > 0 && list0.missing === list0.samples.length && list0.missingCredits > 0 && list0.canMake === false);
    check('L8. ... a tester asking to make them gets the not-found', (await api(TESTER, 'samples', { method: 'POST' })).status === 404);
    const ttsBefore = stub.calls.filter((c) => c.path.startsWith('/v1/text-to-speech/')).length;
    const made = await api(NATE, 'samples', { method: 'POST' });
    const mj = (await made.json()) as { made: number; missing: number };
    check('L8. an admin makes them: one text-to-speech call each, all made', made.ok && mj.made === list0.samples.length && mj.missing === 0 && stub.calls.filter((c) => c.path.startsWith('/v1/text-to-speech/')).length - ttsBefore === list0.samples.length, JSON.stringify(mj));
    const again = (await (await api(NATE, 'samples', { method: 'POST' })).json()) as { made: number };
    check('L8. ... made once: asking again makes none', again.made === 0);
    const one = await api(TESTER, `samples?speech=${status.speeches[0].id}&preset=${status.choices[0].presetId}`);
    check('L8. a tester plays a sample (MP3)', one.ok && one.headers.get('content-type') === 'audio/mpeg' && (await one.arrayBuffer()).byteLength > 0);
    check('L8. ... and the samples are kept in the private store, not as drafts', storeFiles().some((f) => f.includes(`${path.sep}voice-samples${path.sep}`)) && (await pg.query(`select 1 from studio.voice_drafts where kind = 'reading'`)).rows.length === 0);
  }

  // L2 to L7. In the browser, on the four-step recorder (/ephelion/record, 2026-11-26).
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], acceptDownloads: true });
  await ctx.route('**/api/chat/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
  const as = async (page: import('playwright-core').Page, fid: number) => {
    await page.evaluate((f) => localStorage.setItem('snowmoon.signin', JSON.stringify({ token: `voice-test-${f}`, fid: f, username: `fid${f}`, exp: Math.floor(Date.now() / 1000) + 86400 })), fid);
    await page.reload();
  };
  let page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Every request body the page sends, to prove edited words never leave the device.
  const bodies: string[] = [];
  const watchBodies = (p: import('playwright-core').Page) => p.on('request', (r) => bodies.push(r.postDataBuffer()?.toString('latin1') ?? ''));
  watchBodies(page);
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('snowmoon.intro-seen', 'v2'));
  const [first, second] = status.speeches;
  const voice = status.choices[0].presetId;
  const step = (n: number) => page.locator(`button[data-step="${n}"]`);
  const enabled = async (n: number) => !(await step(n).isDisabled());
  await page.goto(`${url}/ephelion/record?speech=${first.id}`);
  await as(page, NATE);
  await step(1).waitFor({ timeout: 30_000 });
  check('L7. ?speech= opens step 2 with that speech chosen; steps 3 and 4 greyed until reached', (await step(2).getAttribute('aria-current')) === 'step' && (await enabled(1)) && (await enabled(2)) && !(await enabled(3)) && !(await enabled(4)));
  await page.locator(`[data-voice="${voice}"]`).first().click();
  check('L7. ... a voice picked: step 3 reached, 4 still greyed', (await enabled(3)) && !(await enabled(4)));
  await page.getByRole('button', { name: 'Next: record' }).click();
  const agreeBtn = page.getByRole('button', { name: 'I agree' });
  if (await agreeBtn.count()) await agreeBtn.click();
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 30_000 });
  // Edited words: kept on this device, shown as the script, never in any request.
  const MARK = 'Zanzibarquill lighthouses sing tonight.';
  await page.getByRole('button', { name: 'Edit text' }).click();
  await page.locator('#er-words').fill(`${MARK} Second line here.`);
  await page.getByRole('button', { name: 'Done' }).click();
  check('L7. edited words are the script, marked as yours', (await page.locator('.er-script', { hasText: 'Zanzibarquill' }).count()) === 1 && (await page.getByText('Your edited words').count()) === 1);
  const stored = await page.evaluate((k) => localStorage.getItem(k), `snowmoon.ephelion.words.${NATE}.${first.id}`);
  check('L7. ... kept in this browser under the person and the speech', stored?.startsWith(MARK) === true);
  // Highlight controls: off and on, the size, kept as settings.
  await page.getByRole('button', { name: 'Bigger text' }).click();
  const fontPx = await page.locator('.er-script').evaluate((e) => getComputedStyle(e).fontSize);
  check('L7. Bigger text makes the script bigger', fontPx === '32px', fontPx);
  // Record: the countdown, then recording, then stopped (never discarded).
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.locator('.er-badge-count').waitFor({ timeout: 5_000 }).catch(() => {});
  check('L7. a 3-second countdown first, labelled', (await page.locator('.er-badge-count', { hasText: 'Countdown' }).count()) === 1);
  await page.locator('.er-badge-rec').waitFor({ timeout: 10_000 });
  check('L7. then recording, labelled, with the highlight on the first sentence', (await page.locator('.er-badge-rec').count()) === 1 && (await page.locator('.er-now').count()) === 1);
  await page.getByRole('button', { name: /Forward a line/ }).click();
  check('L7. Forward a line moves the highlight', (await page.locator('.er-now').getAttribute('data-n')) === '1');
  await page.locator('.er-script').dispatchEvent('wheel');
  await page.locator('.er-paused').waitFor({ timeout: 3_000 }).catch(() => {});
  check('L7. scrolling by hand pauses the highlight, with Resume', (await page.getByText('Highlight paused while you scroll.').count()) === 1 && (await page.getByRole('button', { name: 'Resume' }).count()) === 1);
  await page.getByRole('button', { name: 'Resume' }).click();
  check('L7. ... Resume goes on', (await page.locator('.er-paused').count()) === 0);
  await page.getByText('Highlight', { exact: true }).click();
  check('L7. Highlight off: no sentence highlighted while recording', (await page.locator('.er-now').count()) === 0);
  await page.getByText('Highlight', { exact: true }).click();
  await sleep(2500);
  await page.getByRole('button', { name: 'Stop' }).first().click();
  await page.getByRole('button', { name: 'Next: listen' }).waitFor({ timeout: 30_000 });
  await page.getByText(/saved on this phone/).first().waitFor({ timeout: 10_000 }).catch(() => {});
  check('L2. stopped: labelled, saved on this device, with Record again and Next: listen', (await page.getByText(/saved on this phone/).count()) === 1 && (await page.getByRole('button', { name: 'Record again' }).count()) === 1 && (await enabled(4)));
  const keys = () => page.evaluate(() => new Promise<string[]>((res, rej) => {
    const r = indexedDB.open('snowmoon-voice-takes', 1);
    r.onsuccess = () => {
      const q = r.result.transaction('takes', 'readonly').objectStore('takes').getAllKeys();
      q.onsuccess = () => (res(q.result.map(String)), r.result.close());
      q.onerror = () => rej(q.error);
    };
    r.onerror = () => rej(r.error);
  }));
  check('L2. ... in this browser\'s IndexedDB, under the signed-in FID and the speech', (await keys()).join() === `${NATE}:${first.id}`, (await keys()).join());
  await page.getByRole('button', { name: 'Next: listen' }).click();
  await page.locator('.er-take').waitFor({ timeout: 15_000 });
  // Save your own recording: from this device.
  const dl = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), page.locator('.er-take').getByRole('button', { name: 'Save to my phone' }).click()]).then(([d]) => d).catch(() => null);
  check('L7. Save to my phone saves your own recording from the device', Boolean(dl && /my-recording\.(webm|m4a|ogg)$/.test(dl.suggestedFilename())), dl?.suggestedFilename());
  await page.reload();
  await step(4).waitFor({ timeout: 30_000 });
  await step(4).click();
  await page.locator('.er-take').waitFor({ timeout: 15_000 });
  check('L2. after a reload the take is still there, with the speech and voice still chosen', (await page.locator('.er-take', { hasText: 'Saved on this device' }).count()) === 1);
  await as(page, GARANCE);
  await step(1).waitFor({ timeout: 30_000 });
  await sleep(1500);
  check('L2. another sign-in on the same browser doesn\'t see it, and has nothing to convert', (await page.locator('.er-take').count()) === 0 && !(await enabled(4)) && (await page.getByRole('button', { name: /^Make it his voice/ }).count()) === 0);
  check('L2. ... though it is still on the device, under the first FID only', (await keys()).join() === `${NATE}:${first.id}`);
  await as(page, NATE);
  await step(4).waitFor({ timeout: 30_000 });
  await step(4).click();
  await page.locator('.er-take').waitFor({ timeout: 15_000 });
  check('L2. back as its person, the take is there again', (await page.locator('.er-take', { hasText: 'Saved on this device' }).count()) === 1);
  // Another voice keeps the take.
  const other = status.choices.find((c) => c.presetId !== voice)?.presetId;
  if (other) {
    await step(2).click();
    await page.locator(`[data-voice="${other}"]`).first().click();
    await step(4).click();
    check('L7. another voice keeps the take', (await page.locator('.er-take').count()) === 1);
    await step(2).click();
    await page.locator(`[data-voice="${voice}"]`).first().click();
    await step(4).click();
  }

  // L3. Leaving during a conversion.
  await page.locator('.er-tick input[type="checkbox"]').check();
  const callsBefore = stub.calls.filter((c) => c.path.startsWith('/v1/speech-to-speech/')).length;
  await page.getByRole('button', { name: /^Make it his voice/ }).click();
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
  check('L7. no request ever carried the edited words', !bodies.some((b) => b.includes('Zanzibarquill')));
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  watchBodies(page);
  await page.goto(`${url}/ephelion/record`);
  await step(4).waitFor({ timeout: 30_000 });
  await step(4).click();
  await page.locator('.er-take').waitFor({ timeout: 15_000 });
  check('L3. coming back: the take is still on the device, and its draft is offered with "Convert again" asked first', (await page.locator('[data-slot="convert-again"]').count()) === 1);

  // L5. Keeping fails after the conversion: the store refuses every write (as a storage outage would).
  const { chmodSync } = await import('node:fs');
  const freshDay = () => pg.query('delete from studio.voice_asks');
  // A fresh day's counts, and the page reloaded to read them (the take is still on the device).
  const freshPage = async () => {
    await freshDay();
    await page.reload();
    await step(4).click();
    await page.locator('.er-take').waitFor({ timeout: 15_000 });
  };
  await freshPage();
  const filesBefore = storeFiles().length;
  const dirs = (d: string): string[] => [d, ...readdirSync(d, { withFileTypes: true }).filter((n) => n.isDirectory()).flatMap((n) => dirs(path.join(d, n.name)))];
  const storeDirs = dirs(STORE);
  for (const d of storeDirs) chmodSync(d, 0o500);
  await page.getByRole('button', { name: 'Convert again' }).click();
  await page.locator('.er-tick input[type="checkbox"]').check();
  await page.getByRole('button', { name: /^Convert again/ }).click();
  const said = page.locator('text=/couldn.t be kept as your draft/');
  await said.first().waitFor({ timeout: 60_000 }).catch(() => {});
  check('L5. keeping failed after the conversion: the page says so, and that the recording is still on this device', (await said.count()) > 0 && (await page.locator('text=/still on this device/').count()) > 0);
  for (const d of storeDirs) chmodSync(d, 0o700);
  check('L5. ... nothing was half-kept (no new draft, no new file)', (await drafts(NATE)).length === 1 && storeFiles().length === filesBefore);
  check('L5. ... the take is still there', (await page.locator('.er-take', { hasText: 'Saved on this device' }).count()) === 1);

  // L6. Kept without its word check, then "Check the words again".
  await freshPage();
  stub.setFailTranscribe(true);
  const before6 = (await drafts(NATE)).length;
  if (await page.getByRole('button', { name: 'Convert again' }).count()) await page.getByRole('button', { name: 'Convert again' }).first().click();
  await page.locator('.er-tick input[type="checkbox"]').check();
  await page.getByRole('button', { name: /^(Convert again|Make it his voice)/ }).click();
  await page.locator('text=/word check could not be made/').first().waitFor({ timeout: 60_000 }).catch(() => {});
  stub.setFailTranscribe(false);
  const noCheck = (await pg.query<{ id: string; recipe: { check: unknown } }>(`select id, recipe from studio.voice_drafts where fid = $1 order by made_at desc limit 1`, [NATE])).rows[0];
  check('L6. a take whose transcription failed is kept, without its word check, and the page says so', (await drafts(NATE)).length === before6 + 1 && noCheck?.recipe.check === null && (await page.locator('text=/word check could not be made/').count()) > 0);
  // Save the converted take (from the site, its own draft).
  const dl2 = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('.er-converted').getByRole('button', { name: 'Save to my phone' }).click()]).then(([d]) => d).catch(() => null);
  check('L7. Save to my phone saves the converted take', Boolean(dl2 && /\.mp3$/.test(dl2.suggestedFilename())), dl2?.suggestedFilename());
  await page.getByRole('button', { name: 'Check the words again' }).click();
  await page.locator('[data-slot="take-label"]').first().waitFor({ timeout: 60_000 }).catch(() => {});
  const after6 = (await pg.query<{ id: string; recipe: { check: unknown; checkedAgain?: { from: string } } }>(`select id, recipe from studio.voice_drafts where fid = $1 order by made_at desc limit 1`, [NATE])).rows[0];
  check('L6. "Check the words again": the draft is kept again with its check, and the one without it is gone', after6?.recipe.check !== null && after6?.recipe.checkedAgain?.from === noCheck?.id && (await pg.query(`select 1 from studio.voice_drafts where id = $1`, [noCheck?.id])).rows.length === 0 && (await page.locator('[data-slot="take-label"]').count()) === 1);

  // L4. Changing the speech clears the take, after asking.
  await step(1).click();
  await page.locator(`button[data-speech="${second.id}"]`).click();
  await page.getByRole('button', { name: 'Use this speech' }).click();
  check(`L4. choosing "${second.title}" with a take of "${first.title}" asks first`, (await page.getByText(`Change the speech? Your take of “${first.title}” is removed from this device.`).count()) === 1);
  await page.getByRole('button', { name: 'Keep this one' }).click();
  check('L4. ... "Keep this one" keeps it', (await keys()).join() === `${NATE}:${first.id}`);
  await page.getByRole('button', { name: 'Use this speech' }).click();
  await page.getByRole('button', { name: 'Change the speech' }).click();
  await sleep(500);
  check('L4. ... "Change the speech" removes it from the device and opens Voice for the new speech, with step 4 greyed', (await keys()).length === 0 && (await step(2).getAttribute('aria-current')) === 'step' && !(await enabled(4)), (await keys()).join());
  check('L7. edited words of the first speech stay on the device (they are its own, not the take)', Boolean(await page.evaluate((k) => localStorage.getItem(k), `snowmoon.ephelion.words.${NATE}.${first.id}`)));
  check('L. no errors on the page', errors.length === 0, errors.join(' | '));
  await browser.close();
} finally {
  server.kill('SIGTERM');
  await stub.close();
  await pgServer.stop();
  // L5 makes the store's folders read-only: writable again before removing them, so a failure isn't hidden by this one.
  const { chmodSync: chmodBack } = await import('node:fs');
  const all = (d: string): string[] => { try { return [d, ...readdirSync(d, { withFileTypes: true }).filter((n) => n.isDirectory()).flatMap((n) => all(path.join(d, n.name)))]; } catch { return []; } };
  for (const d of all(STORE)) { try { chmodBack(d, 0o700); } catch { /* gone */ } }
  rmSync(STORE, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
