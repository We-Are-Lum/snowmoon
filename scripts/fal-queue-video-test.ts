/**
 * PREPARED, NOT RUN. The queue test for fal's video files (owner, 2026-10-24: "the queue test with the 5-second length:
 * up to $0.10"). Run it only on the owner's word:
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/fal-queue-video-test.ts --run
 *
 * It sends runVideo's own request (src/lib/agents/approve.ts: the shot's public frame as a data: URI, the note, the
 * safety checker on, X-Fal-Store-IO: 0) through fal's queue (queue.fal.run) instead of sync fal.run, with:
 * - num_frames 75 at 15 fps: 5 s, $0.025 at $0.005 a generated second (fal's page, read 2026-10-24); the cap is $0.10;
 * - X-Fal-Object-Lifecycle-Preference {"expiration_duration_seconds": 3600, "initial_acl": {"default": "forbid"}}.
 * It then reads the video with a fresh CDN token (POST rest.fal.ai/storage/auth/token), saves it to a local folder,
 * and checks: an anonymous fetch of fal's link (403 wanted), the file's ACL (GET api.fal.ai/v1/storage/files/acl), and
 * the time it was made, for the one-hour check. Prints no key or token; the link goes to a private file only.
 * Nothing goes to the database or to R2.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MODEL = 'fal-ai/longcat-video/distilled/image-to-video/480p';
const FPS = 15;
const SECONDS = 5;
const USD_PER_SECOND = 0.005;
const CAP_USD = 0.1;
const FRAME = 'public/editor/1/v2/frames/H01-Q3-g1.jpg'; // Fifteen Days v2, shot 0-EST (the owner's own version)
const NOTE = 'Slight head turn. (Queue test of fal file deletion and access.)';
const OUT = path.join(process.env.HOME ?? '/tmp', 'Library/Mobile Documents/com~apple~CloudDocs/snowmoon-takes');

const estimate = SECONDS * USD_PER_SECOND;
if (estimate > CAP_USD) throw new Error(`estimate $${estimate} is over the $${CAP_USD} cap`);
if (!process.argv.includes('--run')) {
  console.log(`Prepared, not run. Would spend about $${estimate.toFixed(3)} (${SECONDS} s × $${USD_PER_SECOND}); pass --run on the owner's word.`);
  process.exit(0);
}
const key = process.env.FAL_KEY;
if (!key) throw new Error('FAL_KEY is not set');
const auth = { authorization: `Key ${key}` };
const lifecycle = JSON.stringify({ expiration_duration_seconds: 3600, initial_acl: { default: 'forbid' } });
const frame = readFileSync(FRAME);

const submit = await fetch(`https://queue.fal.run/${MODEL}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Fal-Store-IO': '0', 'X-Fal-Object-Lifecycle-Preference': lifecycle, ...auth },
  body: JSON.stringify({ image_url: `data:image/jpeg;base64,${frame.toString('base64')}`, prompt: NOTE, num_frames: SECONDS * FPS, enable_safety_checker: true }),
});
const q = (await submit.json()) as { request_id?: string; status_url?: string; response_url?: string };
if (!submit.ok || !q.status_url || !q.response_url) throw new Error(`queue submit failed: ${submit.status}`);
for (let i = 0; i < 120; i++) {
  const s = (await (await fetch(q.status_url, { headers: auth })).json()) as { status?: string };
  if (s.status === 'COMPLETED') break;
  if (i === 119) throw new Error('not done after 10 minutes');
  await new Promise((r) => setTimeout(r, 5000));
}
const result = (await (await fetch(q.response_url, { headers: auth })).json()) as { video?: { url?: string } };
const url = result.video?.url;
if (!url) throw new Error('no video link in the result');
const madeAt = new Date().toISOString();

const tok = (await (await fetch('https://rest.fal.ai/storage/auth/token?storage_type=fal-cdn-v3', { method: 'POST', headers: { 'content-type': 'application/json', ...auth }, body: JSON.stringify({ expiration_seconds: 600 }) })).json()) as { token?: string };
const withToken = tok.token ? await fetch(url, { headers: { authorization: `Bearer ${tok.token}` } }) : null;
const bytes = withToken?.ok ? Buffer.from(await withToken.arrayBuffer()) : null;
const anon = await fetch(url).then((r) => r.status);
const acl = await fetch(`https://api.fal.ai/v1/storage/files/acl?url=${encodeURIComponent(url)}`, { headers: auth }).then(async (r) => `${r.status} ${await r.text()}`);

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'fal-queue-video-test.txt'), `${url}\nmade ${madeAt}\nrequest ${q.request_id ?? ''}\n`, { mode: 0o600 });
if (bytes) writeFileSync(path.join(OUT, 'fal-queue-video-test.mp4'), bytes);
console.log(JSON.stringify({ madeAt, requestId: q.request_id, estimateUsd: estimate, withTokenStatus: withToken?.status ?? 'no token', bytes: bytes?.length ?? 0, anonStatus: anon, acl, linkSavedTo: path.join(OUT, 'fal-queue-video-test.txt') }, null, 1));
