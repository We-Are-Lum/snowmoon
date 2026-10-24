/**
 * Upload the reading assistant's embedding model to R2 (media.snowmoon.party/models/…), then fetch every file back
 * from its public address and check its sha256 (src/lib/chat/embed.ts). Like scripts/publish-voice-test.ts.
 * The model is bge-small-en-v1.5 (BAAI, MIT), the int8 ONNX export by Xenova, at a fixed revision.
 *
 *   npx tsx scripts/publish-chat-embed.ts --dry                      local files checked against their sha256 only
 *   npx tsx --env-file=.env.local scripts/publish-chat-embed.ts      uploads what is missing (needs R2 keys; owner's OK first)
 *   … --from=<dir>     where the files are (default ~/snowmoon-refs/chat-embed/bge-small-en-v1.5)
 *
 * The prefix names the files it holds (the first 12 hex of the sha256 of their sorted `sha256  name` lines), so
 * objects are immutable and cached for a year.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pool, r2, sha256File } from './lib/r2';
import { EMBED } from '../src/lib/chat/embed';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const FROM = arg('from') ?? path.join(os.homedir(), 'snowmoon-refs/chat-embed/bge-small-en-v1.5');
const dry = process.argv.includes('--dry');
const KEY = (name: string) => `models/${EMBED.prefix}/${name}`;
const type = (name: string) => (name.endsWith('.json') ? 'application/json' : 'application/octet-stream');

const problems: string[] = [];
for (const f of EMBED.files) {
  const p = path.join(FROM, f.name);
  if (!existsSync(p)) problems.push(`${p} is not here`);
  else if ((await sha256File(p)) !== f.sha256) problems.push(`${p}: sha256 is not ${f.sha256}`);
}
const lines = EMBED.files.map((f) => `${f.sha256}  ${f.name}\n`).sort((a, b) => a.slice(66).localeCompare(b.slice(66))).join('');
const want = createHash('sha256').update(lines).digest('hex').slice(0, 12);
if (!EMBED.prefix.endsWith(want)) problems.push(`${EMBED.prefix} should end in ${want}`);
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
if (dry) {
  console.log(`dry run: ${EMBED.files.length} files match their sha256 (${EMBED.files.reduce((n, f) => n + f.bytes, 0)} bytes); would upload to ${EMBED.mediaBase}/${EMBED.prefix}/; nothing uploaded`);
  process.exit(0);
}

const { put, publicUrl } = r2();
await pool(EMBED.files, 2, async (f) => {
  const { url, uploaded } = await put(KEY(f.name), path.join(FROM, f.name), type(f.name));
  console.log(`${uploaded ? 'uploaded' : 'present '} ${url}`);
});
let bad = 0;
for (const f of EMBED.files) {
  const url = `${publicUrl}/${KEY(f.name)}`;
  if (!url.startsWith(EMBED.mediaBase)) problems.push(`${url} is not under ${EMBED.mediaBase}`);
  const res = await fetch(url, { cache: 'no-store' });
  const body = Buffer.from(await res.arrayBuffer());
  const ok = res.ok && createHash('sha256').update(body).digest('hex') === f.sha256 && body.length === f.bytes;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${f.sha256}  ${body.length}  ${url}  [${res.headers.get('cache-control')}]`);
}
if (bad || problems.length) {
  console.error(`${bad} file(s) did not come back as uploaded${problems.length ? `; ${problems.join('; ')}` : ''}`);
  process.exit(1);
}
