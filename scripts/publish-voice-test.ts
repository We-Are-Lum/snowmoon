/**
 * Upload what the owner's phone test (/voice-test) downloads to R2 (media.snowmoon.party/voice/…), then fetch
 * every file back from its public address and check its sha256. Only model and runtime files and two
 * finished lines already public in the repository: never a raw take (src/lib/voice-test.ts).
 *
 *   npm run publish:voice-test -- --dry                 local files checked against their pinned sha256 only
 *   npm run publish:voice-test                          uploads what is missing, then checks every public URL
 *   npm run publish:voice-test -- --from=<spike dir>    where the model and runtime are (default ~/snowmoon-refs/voice-spike)
 *
 * The model files are the spike's int4 build (models/chatterbox-onnx-q4/), the runtime is onnxruntime-web
 * 1.30.0's dist (web/node_modules/onnxruntime-web/dist/). Keys carry sha256s, so objects are immutable.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pool, r2, sha256File } from './lib/r2';
import { VOICE_TEST, VOICE_TEST_FILES, VOICE_TEST_MEDIA, type VoiceFile } from '../src/lib/voice-test';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const SPIKE = arg('from') ?? path.join(os.homedir(), 'snowmoon-refs/voice-spike');
const dry = process.argv.includes('--dry');

const local = (f: VoiceFile): string => {
  const name = path.basename(f.key);
  if (f === VOICE_TEST.line || f === VOICE_TEST.reference) return path.join(ROOT, (f as typeof VOICE_TEST.line).repo);
  if (name.endsWith('.onnx') || name.endsWith('.onnx_data')) return path.join(SPIKE, 'models/chatterbox-onnx-q4', name);
  return path.join(SPIKE, 'web/node_modules/onnxruntime-web/dist', name);
};
const type = (key: string) =>
  key.endsWith('.wasm') ? 'application/wasm' : key.endsWith('.mjs') ? 'text/javascript' : key.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream';

const problems: string[] = [];
for (const f of VOICE_TEST_FILES) {
  const p = local(f);
  if (!existsSync(p)) problems.push(`${p} is not here`);
  else if ((await sha256File(p)) !== f.sha256) problems.push(`${p}: sha256 is not ${f.sha256}`);
}
// The prefixes name the files they hold (the first 12 hex of the sha256 of their sorted `sha256  name` lines).
for (const group of [[VOICE_TEST.model.encoder, VOICE_TEST.model.encoderData, VOICE_TEST.model.decoder, VOICE_TEST.model.decoderData], [VOICE_TEST.runtime.ort, VOICE_TEST.runtime.glue, VOICE_TEST.runtime.wasm]]) {
  const lines = group.map((f) => `${f.sha256}  ${path.basename(f.key)}\n`).sort((a, b) => a.slice(66).localeCompare(b.slice(66))).join('');
  const want = createHash('sha256').update(lines).digest('hex').slice(0, 12);
  if (!path.dirname(group[0].key).endsWith(want)) problems.push(`${path.dirname(group[0].key)} should end in ${want}`);
}
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
if (dry) {
  console.log(`dry run: ${VOICE_TEST_FILES.length} files match their sha256; nothing uploaded`);
  process.exit(0);
}

const { put, publicUrl } = r2();
await pool(VOICE_TEST_FILES, 2, async (f) => {
  const { url, uploaded } = await put(`${VOICE_TEST_MEDIA}/${f.key}`, local(f), type(f.key));
  console.log(`${uploaded ? 'uploaded' : 'present '} ${url}`);
});
// Fetch each back from its public address, as the page will (with the site as Origin), and check it.
let bad = 0;
for (const f of VOICE_TEST_FILES) {
  const url = `${publicUrl}/${VOICE_TEST_MEDIA}/${f.key}`;
  const res = await fetch(url, { headers: { Origin: 'https://snowmoon.party' }, cache: 'no-store' });
  const body = Buffer.from(await res.arrayBuffer());
  const sha = createHash('sha256').update(body).digest('hex');
  const ok = res.ok && sha === f.sha256 && body.length === f.bytes;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok ' : 'BAD'} ${f.sha256}  ${body.length}  ${url}  [${res.headers.get('content-type')}; ${res.headers.get('cache-control')}; cors ${res.headers.get('access-control-allow-origin')}]`,
  );
}
if (bad) {
  console.error(`${bad} file(s) did not come back as uploaded`);
  process.exit(1);
}
