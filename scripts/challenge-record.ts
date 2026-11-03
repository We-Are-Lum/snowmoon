/**
 * The challenge record's export (docs/proposals/challenge-record.md; owner, 2026-11-01 and 2026-11-02): fingerprints,
 * not copies. Reads the database read-only (`sql.begin('read only', …)`, as studio_writer through
 * STUDIO_DATABASE_URL) and writes the record LOCALLY ONLY:
 *
 *   npm run challenge-record -- entries
 *
 * writes challenge-record-out/entries.json (RFC 8785, UTF-8, no trailing newline) and entries.json.sha256, and prints
 * the record's CID, computed offline with the plan's fixed settings (CIDv1, raw leaves, sha2-256, 1 MiB chunks). There
 * is no upload, pin or network path for the record here at all: pinning is the owner's step, on his machine, with the
 * commands this prints. Each picture's fingerprint is the sha256 the version stores; checking it against the bytes
 * served is a separate step (docs/proposals/challenge-record.md), not built here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { CHALLENGE } from '../src/lib/config';
import { phase } from '../src/lib/challenge/rules';
import { readEntriesRecord } from '../src/lib/challenge-record/load';
import { offlineCid, recordBytes, recordProblems, sha256Hex, type RecordVersion } from '../src/lib/challenge-record/record';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'challenge-record-out');
const args = process.argv.slice(2);

async function main() {
  if (args[0] !== 'entries') {
    console.log('usage: challenge-record entries (see the file header)');
    process.exit(2);
  }
  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) throw new Error('STUDIO_DATABASE_URL is not set (.env.local)');
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  let got: Awaited<ReturnType<typeof readEntriesRecord>>;
  try {
    got = await sql.begin('read only', (tx) => readEntriesRecord(tx as unknown as postgres.Sql));
  } finally {
    await sql.end();
  }
  const { record } = got;
  const problems = recordProblems(record);
  if (problems.length) throw new Error(`the record failed its checks: ${problems.join('; ')}`);
  const bytes = recordBytes(record);
  const sha = sha256Hex(bytes);
  const cid = offlineCid(bytes);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'entries.json'), bytes);
  writeFileSync(path.join(OUT, 'entries.json.sha256'), `${sha}  entries.json\n`);
  const p = phase();
  const published = record.versions.filter((v): v is RecordVersion => 'published_at' in v);
  console.log(`challenge ${CHALLENGE.id}: entries ${p === 'closed' ? 'closed' : p === 'open' ? 'still open (a record of the entries so far)' : 'not open yet (a record of nothing so far)'}`);
  console.log(`entries: ${got.entries}; versions in the record: ${record.versions.length} (${published.filter((v) => v.entry).length} entries, ${published.filter((v) => !v.entry).length} built on, ${record.versions.length - published.length} by id only)`);
  console.log(`written: ${path.relative(ROOT, path.join(OUT, 'entries.json'))} (${bytes.length} bytes)`);
  console.log(`sha256:  ${sha}`);
  console.log(cid ? `cid:     ${cid} (offline: CIDv1, raw leaves, sha2-256, 1 MiB chunks)` : 'cid:     not computed (over one 1 MiB chunk: needs kubo, `ipfs add --only-hash`, which is not installed)');
  console.log('nothing was uploaded or pinned. The owner pins it on his machine:');
  console.log('  ipfs add --cid-version=1 --raw-leaves --chunker=size-1048576 --pin challenge-record-out/entries.json');
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
