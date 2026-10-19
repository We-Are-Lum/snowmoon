/**
 * test:gpt-png-private: a GPT Image remix frame's original PNG is kept in the private bucket only, is deleted when its
 * frame is erased, and stays when its frame is hidden (owner, 2026-10-19: "Keep the original PNGs privately in R2.
 * Delete a PNG whenever its frame is deleted"). No network, no database, no key: R2 is an in-memory stand-in for the
 * S3 client (every PutObject, CopyObject and DeleteObject the site's own store code sends lands in it), the database
 * a stand-in answering setHidden's two statements, and the gateway a stand-in answering a PNG, as the real one did.
 *
 *  P1: the PNG lands in the private bucket, under remix/model-output/<its sha256>.png, byte for byte.
 *  P2: the public bucket never has it: no PNG, no object with its key or sha256, at any step (checked after every
 *      command, so a copy that was later removed would still fail).
 *  P3: the recipe's model_output says kept: true with that private key, and holds no URL; output_sha256 is the JPEG's.
 *  P4: the stored JPEG is in the public bucket, and the PNG was put before it.
 *  P5: hiding the frame (setHidden, the maker's hide and then the maintainer's) moves the JPEG to the private bucket
 *      and leaves the PNG there, unchanged; unhiding leaves it too.
 *  P6: erasing the frame (eraseFrameFiles, the maintainer's procedure) deletes the PNG and the JPEG from both buckets.
 *  P11: on request (eraseOriginalPng, the maintainer's; owner, 2026-10-19, D5), only the PNG is deleted; the frame's
 *       JPEG stays public. A FLUX frame has no PNG to delete.
 *  P7: a recipe whose private key doesn't match its sha256 is refused, so erasure can't be pointed at another object.
 *  P8: a FLUX frame keeps nothing private on creation, and its erasure deletes only its own picture.
 *  P9: no route deletes a frame: no remix route calls eraseFrameFiles or deleteObjects, and 0013 gives the site's
 *      role no delete on studio.remix_frames.
 *  P10: the flag is still off: REMIX_MODEL is 'flux'.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { makeGptEdit } from '../src/lib/images/gateway-image';
import { modelOutputKey, keyFor } from '../src/lib/images/store';
import { eraseFrameFiles, eraseOriginalPng, putFrameFiles, setHidden, type Frame } from '../src/lib/remix/frames';
import { REMIX_GPT, REMIX_MODEL } from '../src/lib/remix/model';
import { SYSTEM_FID } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let failed = 0;
let total = 0;
function check(id: string, what: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${what}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
}

// Placeholders only: the S3 client and fetch are replaced below, so nothing leaves this process.
for (const k of ['REMIX_TEST_FAKES', 'REMIX_TEST_STORE', 'VERCEL_OIDC_TOKEN']) delete process.env[k];
Object.assign(process.env, {
  AI_GATEWAY_API_KEY: 'placeholder-not-a-key',
  R2_ACCOUNT_ID: 'placeholder',
  R2_ACCESS_KEY_ID: 'placeholder',
  R2_SECRET_ACCESS_KEY: 'placeholder',
  R2_BUCKET: 'test-public',
  R2_PRIVATE_BUCKET: 'test-private',
  R2_IMAGES_PUBLIC_URL: 'https://pictures.test.invalid',
});

// ---- R2 stand-in: two buckets in memory; the public one is checked after every command. ----
const buckets: Record<string, Map<string, { body: Buffer; contentType?: string }>> = { 'test-public': new Map(), 'test-private': new Map() };
const order: string[] = [];
let pngSha = '';
let publicEverHadPng: string[] = [];
const watchPublic = () => {
  for (const [k, v] of buckets['test-public']) {
    const isPng = v.body.length > 8 && v.body.readUInt32BE(0) === 0x89504e47;
    if (isPng || (pngSha && (k.includes(pngSha) || k.includes(pngSha.slice(0, 32)) || sha(v.body) === pngSha))) publicEverHadPng.push(k);
  }
};
S3Client.prototype.send = async function (cmd: unknown) {
  const i = (cmd as { input: Record<string, unknown> }).input;
  const b = buckets[String(i.Bucket)];
  if (!b) throw Object.assign(new Error('no such bucket'), { name: 'NoSuchBucket' });
  if (cmd instanceof PutObjectCommand) {
    b.set(String(i.Key), { body: Buffer.from(i.Body as Buffer), contentType: i.ContentType as string });
    order.push(`put ${i.Bucket} ${i.Key}`);
  } else if (cmd instanceof CopyObjectCommand) {
    const [srcBucket, ...rest] = String(i.CopySource).split('/');
    const src = buckets[srcBucket]?.get(rest.join('/'));
    if (!src) throw Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
    b.set(String(i.Key), { ...src });
    order.push(`copy ${srcBucket}->${i.Bucket} ${i.Key}`);
  } else if (cmd instanceof DeleteObjectCommand) {
    b.delete(String(i.Key));
    order.push(`delete ${i.Bucket} ${i.Key}`);
  } else throw new Error('unexpected command');
  watchPublic();
  return {};
} as typeof S3Client.prototype.send;

// ---- gateway stand-in: answers a PNG drawn here, as the real one answered output_format "jpeg". ----
const W = REMIX_GPT.size.width;
const H = REMIX_GPT.size.height;
const raw = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const j = (y * W + x) * 3;
  raw[j] = (x * 255) / W;
  raw[j + 1] = (y * 255) / H;
  raw[j + 2] = ((x ^ y) * 5) & 255;
}
const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
pngSha = sha(png);
globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }], providerMetadata: { gateway: { cost: '0.026908', generationId: 'gen_test' } } }), { status: 200 })) as typeof fetch;

// ---- database stand-in: the frame row setHidden reads and updates. ----
const MAKER = 4242;
let rowState: Record<string, unknown> = {};
const fakeSql = (async (strings: TemplateStringsArray, ...vals: unknown[]) => {
  const q = strings.join('?');
  if (/^\s*select \* from studio\.remix_frames where id = \?/.test(q)) return [rowState];
  if (/^\s*update studio\.remix_frames set hidden = true/.test(q)) return [(rowState = { ...rowState, hidden: true, hidden_by: vals[0], hidden_role: vals[1] })];
  if (/^\s*update studio\.remix_frames set hidden = false/.test(q)) return [(rowState = { ...rowState, hidden: false, hidden_by: null, hidden_role: null })];
  throw new Error(`unexpected statement: ${q.slice(0, 60)}`);
}) as unknown as Parameters<typeof setHidden>[0];

// ---- make a frame, as the generate route does ----
const ref = { bytes: await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer(), contentType: 'image/jpeg', width: W, height: H };
const made = await makeGptEdit('a test prompt', [ref], new Request('http://127.0.0.1/api/remix/generate'));
const files = await putFrameFiles(made);
const key = modelOutputKey(pngSha);
const priv = buckets['test-private'];
const pub = buckets['test-public'];

check('P1', 'the PNG is in the private bucket under its sha256 key, byte for byte', key === `remix/model-output/${pngSha}.png` && !!priv.get(key)?.body.equals(png) && priv.get(key)?.contentType === 'image/png', { key, has: priv.has(key) });
check('P2', 'the public bucket never had the PNG', publicEverHadPng.length === 0 && ![...pub.keys()].some((k) => k.endsWith('.png')), publicEverHadPng);
const mo = files.record.model_output;
const recText = JSON.stringify(files.record);
check('P3', "model_output: kept true, its private key, no URL; output_sha256 is the JPEG's", !!mo && mo.kept === true && mo.private_key === key && mo.sha256 === pngSha && files.record.output_sha256 === sha(made.bytes) && files.record.output_sha256 !== pngSha && !/https?:|pictures\.|\.invalid|r2\.cloudflarestorage/.test(recText), files.record);
const jpegKey = keyFor(files.sha256);
check('P4', 'the JPEG is public, and the PNG was put first', pub.get(jpegKey)?.body.equals(made.bytes) === true && order.indexOf(`put test-private ${key}`) >= 0 && order.indexOf(`put test-private ${key}`) < order.indexOf(`put test-public ${jpegKey}`), order);

// ---- hide and unhide ----
rowState = { id: '00000000-0000-4000-8000-000000000001', adaptation_id: 1, version_id: 2, shot_id: 's1', person: MAKER, own_words: 'w', prompt: 'p', recipe: { kind: 'remix-frame', ...files.record }, image_url: files.url, image_sha256: files.sha256, cost_usd: 0.027, by_name: null, hidden: false, hidden_role: null, created_at: new Date().toISOString() };
const id = String(rowState.id);
const steps: Record<string, boolean> = {};
const pngThere = () => !!priv.get(key)?.body.equals(png);
steps.makerHide = (await setHidden(fakeSql, MAKER, id, true)).ok && !pub.has(jpegKey) && priv.has(jpegKey) && pngThere();
steps.makerUnhide = (await setHidden(fakeSql, MAKER, id, false)).ok && pub.has(jpegKey) && pngThere();
steps.maintainerHide = (await setHidden(fakeSql, SYSTEM_FID, id, true)).ok && !pub.has(jpegKey) && pngThere();
check('P5', 'hiding (maker, maintainer) and unhiding keep the PNG private and unchanged', Object.values(steps).every(Boolean) && publicEverHadPng.length === 0, steps);

// ---- erasure ----
const frame = { imageSha256: files.sha256, recipe: rowState.recipe as Frame['recipe'] };
await eraseFrameFiles(frame);
check('P6', 'erasing the frame deletes the PNG and the JPEG from both buckets', !priv.has(key) && !priv.has(jpegKey) && !pub.has(jpegKey), { priv: [...priv.keys()], pub: [...pub.keys()] });

let refused = false;
try {
  await eraseFrameFiles({ imageSha256: files.sha256, recipe: { model_output: { ...mo, private_key: 'images/readers/someone-elses.jpg' } } });
} catch {
  refused = true;
}
check('P7', "a private key that doesn't match its sha256 is refused", refused);

// ---- on request: the PNG only (owner, 2026-10-19, D5) ----
const again = await putFrameFiles(made);
const againKey = keyFor(again.sha256);
const onRequest = await eraseOriginalPng({ recipe: { kind: 'remix-frame', ...again.record } });
const fluxNone = await eraseOriginalPng({ recipe: { kind: 'remix-frame', content_type: 'image/jpeg', output_sha256: again.sha256 } });
check('P11', 'on request, only the PNG is erased: the frame\'s JPEG stays public; a FLUX frame has none', !priv.has(key) && pub.get(againKey)?.body.equals(made.bytes) === true && onRequest.deleted.join() === key && fluxNone.deleted.length === 0, { onRequest, fluxNone, priv: [...priv.keys()], pub: [...pub.keys()] });
await eraseFrameFiles({ imageSha256: again.sha256, recipe: { kind: 'remix-frame', ...again.record } });

// ---- a FLUX frame ----
const before = priv.size;
const flux = await putFrameFiles({ bytes: ref.bytes, contentType: 'image/jpeg' });
const fluxKey = keyFor(flux.sha256);
const fluxNothingPrivate = priv.size === before && !('model_output' in flux.record);
priv.set('remix/model-output/unrelated-test-object.png', { body: Buffer.from('keep me') });
await eraseFrameFiles({ imageSha256: flux.sha256, recipe: { kind: 'remix-frame', ...flux.record } });
check('P8', 'a FLUX frame keeps nothing private; its erasure deletes only its own picture', fluxNothingPrivate && !pub.has(fluxKey) && priv.has('remix/model-output/unrelated-test-object.png'), { fluxNothingPrivate, priv: [...priv.keys()] });

// ---- no route deletes a frame ----
const routeFiles: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(n)) routeFiles.push(p);
  }
};
walk(path.join(ROOT, 'src/app'));
const callers = routeFiles.filter((f) => /eraseFrameFiles|eraseOriginalPng|deleteObjects\(|deletePrivate\(/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
const m13 = readFileSync(path.join(ROOT, 'supabase/migrations/0013_remix.sql'), 'utf8');
const noDelete = /revoke delete, truncate, references, trigger on studio\.remix_frames/.test(m13) && !/grant[^;]*delete[^;]*remix_frames/i.test(m13);
check('P9', 'no route deletes a frame (no caller of eraseFrameFiles in src/app; no delete grant in 0013)', callers.length === 0 && noDelete, { callers, noDelete });

check('P10', "the flag is still off (REMIX_MODEL 'flux')", REMIX_MODEL === 'flux', REMIX_MODEL);

console.log(`\ntest:gpt-png-private: ${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
