/**
 * The backstory bounty (branch challenge-backstory-bounty, owner's spec 2026-11-12). Stand-ins only: Base is a stub
 * reader, Pinata a stub pinner, and every real fetch is refused; nothing is called or spent. The database is an
 * in-memory Postgres (PGlite) with every migration, NEXT_challenge_bounty_claims.sql included. Each check runs on the
 * real code and on a planted violation, which it must catch.
 *
 *   npm run test:backstory-bounty
 *
 *  K1 the claim's title is "{Name}: {picture title}" (or "{Name}"), its description the backstory, a blank line and the
 *     picture's page on snowmoon.party, cut to 1,500 characters with the link kept; the paragraph rule (1–3).
 *  K2 up to three claims per person through the app: sent ones that didn't fail, plus unsent pins from the last 15
 *     minutes; a fourth is refused (429) before anything is read on Base or pinned; a retry reuses its own pin.
 *  K3 the issuer check: bounties(560) is read on Base before any pin, and a wrong issuer (or none) refuses, pinning nothing.
 *  K4 ClaimCreated is decoded from a fabricated receipt log, only for POIDH.core, this bounty and this URI; recordClaim
 *     keeps the hash at once, the claim id once confirmed, and answers 202 (hash kept) on a timeout.
 *  K5 without PINATA_JWT: "not set up yet" (503), with nothing read on Base, fetched, pinned or kept.
 *  K6 no model is involved: no poidh file, route or the page's box imports a model, nothing is fetched while preparing
 *     or recording a claim, and the guide is never put in the box.
 *  K7 the migration's read-back (a) and (b) pass on PGlite, and the settings are the owner's.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { encodeAbiParameters, encodeEventTopics, type Hex } from 'viem';
import { POIDH, POIDH_BOUNTY_ID, POIDH_BOUNTY_ISSUER } from '../src/lib/config';
import { POIDH_ABI } from '../src/lib/poidh/abi';
import * as C from '../src/lib/poidh/claim';
import { BOUNTY_WORDING as W } from '../src/lib/poidh/wording';
import { BACKSTORY_GUIDE, readAddedBackstory } from '../src/lib/challenge/backstory';
import type { ImageReader, Pinner, Reader } from '../src/lib/poidh/bounty';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
const failed: string[] = [];
function proven(name: string, real: string[], plant: string[]) {
  const ok = real.length === 0 && plant.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? real.join('; ') : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${plant.length ? '' : ' (plant not caught)'}`);
}
const need = (c: boolean, what: string) => (c ? [] : [what]);

// Every real fetch is refused: nothing here may reach Pinata, Base or a model.
const fetched: string[] = [];
globalThis.fetch = (async (u: unknown) => {
  fetched.push(String(u));
  throw new Error('no network in this test');
}) as typeof fetch;
const savedJwt = process.env.PINATA_JWT;
delete process.env.PINATA_JWT;

const V = '00000000-0000-0000-0000-00000000f0f0';
const V2 = '00000000-0000-0000-0000-00000000f0f1';

// K1
{
  const build = (title: typeof C.claimTitle, desc: typeof C.claimDescription) => {
    const long = 'Zei walked. '.repeat(200).trim();
    const d = desc(long, V);
    const short = desc('Zei left the ice road.\n\nNow he keeps a lamp lit.', V);
    return [
      ...need(title('Zei', 'The ice road') === 'Zei: The ice road' && title('Zei', null) === 'Zei' && title('Zei', '  ') === 'Zei', 'the title isn\'t "{Name}: {picture title}" or "{Name}"'),
      ...need(short === `Zei left the ice road.\n\nNow he keeps a lamp lit.\n\nhttps://snowmoon.party/challenge/p/${V}`, `the description reads ${JSON.stringify(short)}`),
      ...need([...d].length === 1500 && d.endsWith(`\n\nhttps://snowmoon.party/challenge/p/${V}`) && d.startsWith('Zei walked.'), `a long one is ${[...d].length} characters, or loses its link`),
      ...need(POIDH.descriptionMax === 1500 && [...desc('é'.repeat(1490), V)].length <= 1500, 'the cap isn\'t 1,500 characters'),
      ...need(C.picturePage(V) === `https://snowmoon.party/challenge/p/${V}`, 'the link isn\'t the live site\'s'),
    ];
  };
  const paras = [
    ...need(readAddedBackstory({ text: 'One.\n\nTwo.\n\nThree.' }).ok && !readAddedBackstory({ text: 'One.\n\nTwo.\n\nThree.\n\nFour.' }).ok && !readAddedBackstory({ text: '  ' }).ok && readAddedBackstory({ text: 'One line\nthen another.' }).ok, 'the 1–3 paragraph rule'),
  ];
  proven('K1 title "{Name}: {picture title}", description = backstory + page link, cut to 1,500 with the link kept; 1–3 paragraphs', [...build(C.claimTitle, C.claimDescription), ...paras], build(C.claimTitle, (t, v) => `${t}\n\n${C.picturePage(v)}`.slice(0, 2000)));
}

// The database.
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
const dir = path.join(ROOT, 'supabase/migrations');
for (const f of [...readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort(), ...readdirSync(dir).filter((f) => /^NEXT_.*\.sql$/.test(f)).sort()]) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-00000000e0e0','snowmoon','style','Test style');
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000000-0000-0000-0000-00000000b0b0','snowmoon','design',6786,'00000000-0000-0000-0000-00000000e0e0','published');
  insert into studio.element_versions (id, element_id, version_no) values ('${V}','00000000-0000-0000-0000-00000000b0b0',1), ('${V2}','00000000-0000-0000-0000-00000000b0b0',2);`);
const PORT = 54393;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
const S = sql as unknown as postgres.Sql;
const B = await import('../src/lib/poidh/bounty');
const P = await import('../src/lib/poidh/pinata');

// Stand-ins.
let issuer: string = POIDH_BOUNTY_ISSUER;
const calls = { read: 0, pins: 0, images: 0 };
let cid = 0;
const reader = (receipt?: () => Promise<unknown>) =>
  ({
    readContract: async () => {
      calls.read++;
      return [BigInt(POIDH_BOUNTY_ID), issuer, 'Snowmoon Character Backstory', '', 33n, '0x0000000000000000000000000000000000000000', 0n, 0n];
    },
    waitForTransactionReceipt: receipt ?? (async () => { throw new Error('timeout'); }),
  }) as unknown as Reader;
const pin: Pinner = {
  ready: () => true,
  file: async () => (calls.pins++, { ok: true, cid: `bafkreiimage${++cid}aaaaaaaaaa`, url: `https://gateway.pinata.cloud/ipfs/bafkreiimage${cid}aaaaaaaaaa` }),
  json: async () => (calls.pins++, { ok: true, cid: `bafkreijson${++cid}aaaaaaaaaa`, url: `https://gateway.pinata.cloud/ipfs/bafkreijson${cid}aaaaaaaaaa` }),
};
const readImage: ImageReader = async () => (calls.images++, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), type: 'image/jpeg', ext: 'jpg' });
const pic = (text: string, versionId = V) => ({ versionId, name: 'Zei', pictureTitle: null, imageUrl: 'https://media.snowmoon.party/x.jpg', imageSha256: 'a'.repeat(64), backstory: { id: null, text } });
const reset = () => Object.assign(calls, { read: 0, pins: 0, images: 0 });
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;

// K5: not set up.
{
  reset();
  const noJwt = { ...pin, ready: P.pinataReady };
  const r = await B.prepareClaim({ sql: S, reader: reader(), pin: noJwt, readImage }, 501, pic('A backstory.'));
  const direct = await P.pinJson({ a: 1 }, 'x');
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from studio.challenge_bounty_claims`;
  const notSetUp = (res: typeof r, c: typeof calls) => [
    ...need(!P.pinataReady() && !res.ok && res.status === 503 && res.error === W.notSetUp, `without PINATA_JWT: ${JSON.stringify(res)}`),
    ...need(c.read === 0 && c.images === 0 && c.pins === 0 && fetched.length === 0 && n === 0, 'something was read on Base, fetched, pinned or kept'),
    ...need(!direct.ok && direct.error === 'not-set-up', 'the pinner itself doesn\'t refuse without the key'),
    ...need(/process\.env\.PINATA_JWT/.test(read('src/lib/poidh/pinata.ts')) && /process\.env\.PINATA_GATEWAY/.test(read('src/lib/poidh/pinata.ts')) && !/console\.(log|error)\([^)]*jwt/i.test(read('src/lib/poidh/pinata.ts')), 'the key isn\'t read by name only'),
  ];
  proven('K5 without PINATA_JWT: "not set up yet" (503); nothing read on Base, fetched, pinned or kept', notSetUp(r, calls), notSetUp({ ok: true } as never, { ...calls, read: 1 }));
}

// K3: the issuer check.
{
  reset();
  issuer = '0x1111111111111111111111111111111111111111';
  const wrong = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic('A backstory.'));
  const wrongCalls = { ...calls };
  issuer = '0x0000000000000000000000000000000000000000';
  const none = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic('A backstory.'));
  issuer = POIDH_BOUNTY_ISSUER.toLowerCase();
  const ok = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic('A backstory.'));
  const checks = (isOk: typeof C.issuerOk) => [
    ...need(!wrong.ok && wrong.status === 503 && !none.ok && wrongCalls.read === 1 && wrongCalls.pins === 0 && wrongCalls.images === 0, 'a wrong issuer or no bounty wasn\'t refused before pinning'),
    ...need(ok.ok && calls.read === 3 && calls.pins === 2, 'the owner\'s bounty (any case) wasn\'t read again and pinned'),
    ...need(isOk(POIDH_BOUNTY_ISSUER) && isOk(POIDH_BOUNTY_ISSUER.toLowerCase()) && !isOk('0x1111111111111111111111111111111111111111') && !isOk('0x0000000000000000000000000000000000000000') && !isOk(null) && !isOk('nope'), 'issuerOk'),
    ...need(ok.ok && ok.to === POIDH.core && ok.chainId === 8453 && ok.bountyId === 560 && ok.data.startsWith('0x'), 'the calldata isn\'t for createClaim on bounty 560'),
  ];
  proven('K3 bounties(560) is read on Base before any pin; a wrong issuer or no bounty refuses and pins nothing', checks(C.issuerOk), checks(() => true));
}

// K2: three per person.
{
  // 501 has one open pin from K3. Send it, and two more; the fourth is refused.
  reset();
  const ids: string[] = [];
  for (const [i, text] of ['A backstory.', 'Second.', 'Third.'].entries()) {
    const r = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic(text));
    if (!r.ok) throw new Error(`K2 setup: ${r.error}`);
    ids.push(r.id);
    await sql`update studio.challenge_bounty_claims set tx_hash = ${tx(100 + i)}, sent_at = now() where id = ${r.id}`;
  }
  reset();
  const fourth = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic('Fourth.', V2));
  const other = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 502, pic('Someone else.'));
  // A failed one gives its place back.
  await sql`update studio.challenge_bounty_claims set outcome = 'reverted', confirmed_at = now() where id = ${ids[2]}`;
  const afterFail = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic('Fourth.', V2));
  const retry = afterFail.ok ? await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 501, pic('Fourth.', V2)) : null;
  const now = new Date('2026-11-12T12:00:00Z');
  const rows = (pinnedAgo: number[]) => pinnedAgo.map((m) => ({ txHash: null, outcome: null, pinnedAt: new Date(now.getTime() - m * 60_000).toISOString() }));
  const cap = (used: typeof C.claimsUsed) => [
    ...need(ids.length === 3 && !fourth.ok && fourth.status === 429 && fourth.error === W.none(3), `the fourth: ${JSON.stringify(fourth)}`),
    ...need(other.ok, 'another person was capped by 501\'s claims'),
    ...need(afterFail.ok && retry?.ok === true && (retry as { id: string }).id === (afterFail as { id: string }).id, 'a failed claim didn\'t give its place back, or a retry didn\'t reuse its own pin'),
    ...need(used(rows([1, 2, 3]), now) === 3 && used(rows([1, 20, 30]), now) === 1, 'unsent pins from the last 15 minutes don\'t count, or old ones do'),
    ...need(used([{ txHash: tx(1), outcome: 'reverted', pinnedAt: now.toISOString() }, { txHash: tx(2), outcome: null, pinnedAt: '2026-01-01T00:00:00Z' }], now) === 1, 'sent claims: a failed one counts, or a pending one doesn\'t'),
    ...need(POIDH.claimsPerPerson === 3, 'the cap isn\'t three'),
  ];
  proven('K2 up to three claims per person through the app (sent and not failed, plus pins from the last 15 minutes); a fourth is refused; a retry reuses its pin', cap(C.claimsUsed), cap(() => 0));
}

// K4: ClaimCreated from a fabricated receipt.
{
  const uri = 'https://gateway.pinata.cloud/ipfs/bafkreijsontestaaaaaaaaaa';
  const log = (o: { bountyId?: bigint; uri?: string; address?: string; id?: bigint } = {}) => ({
    address: o.address ?? POIDH.core,
    topics: encodeEventTopics({ abi: POIDH_ABI, eventName: 'ClaimCreated', args: { id: o.id ?? 777n, issuer: '0x2222222222222222222222222222222222222222', bountyId: o.bountyId ?? 560n } }) as Hex[],
    data: encodeAbiParameters(
      [{ type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'uint256' }, { type: 'string' }, { type: 'uint256' }],
      [POIDH_BOUNTY_ISSUER, 'Zei', 'A backstory.', 1762900000n, o.uri ?? uri, 0n],
    ),
  });
  const decode = (fn: typeof C.claimIdFromLogs) => [
    ...need(fn([log()], { bountyId: 560, uri }) === 777n, 'the claim id isn\'t decoded'),
    ...need(fn([log({ bountyId: 561n })], { bountyId: 560, uri }) === null, 'another bounty\'s claim is taken'),
    ...need(fn([log({ uri: `${uri}x` })], { bountyId: 560, uri }) === null, 'another record\'s claim is taken'),
    ...need(fn([log({ address: '0x3333333333333333333333333333333333333333' })], { bountyId: 560, uri }) === null, 'another contract\'s log is taken'),
    ...need(fn([{ address: POIDH.core, topics: ['0x01'], data: '0x' }, log({ id: 9n })], { bountyId: 560, uri }) === 9n, 'an unreadable log stops the search'),
  ];
  proven('K4a ClaimCreated is decoded from a fabricated receipt log, only for POIDH.core, bounty 560 and this URI', decode(C.claimIdFromLogs), decode(() => 777n));

  // recordClaim: a prepared claim of 503, sent; the receipt times out (202, hash kept), then confirms.
  issuer = POIDH_BOUNTY_ISSUER;
  const p = await B.prepareClaim({ sql: S, reader: reader(), pin, readImage }, 503, pic('Recorded.'));
  if (!p.ok) throw new Error('K4 setup');
  const t = tx(4242);
  const timedOut = await B.recordClaim({ sql: S, reader: reader(), waitMs: 1 }, 503, p.id, t);
  const [kept] = await sql<{ tx_hash: string | null; claim_id: string | null }[]>`select tx_hash, claim_id::text from studio.challenge_bounty_claims where id = ${p.id}`;
  const notTheirs = await B.recordClaim({ sql: S, reader: reader(), waitMs: 1 }, 504, p.id, t);
  const otherTx = await B.recordClaim({ sql: S, reader: reader(), waitMs: 1 }, 503, p.id, tx(4243));
  const good = await B.recordClaim({ sql: S, reader: reader(async () => ({ status: 'success', from: '0xABCDEF0000000000000000000000000000000001', logs: [log({ uri: p.uri, id: 31337n })] })), waitMs: 1 }, 503, p.id, t);
  const [done] = await sql<{ claim_id: string | null; outcome: string | null; wallet: string | null }[]>`select claim_id::text, outcome, wallet from studio.challenge_bounty_claims where id = ${p.id}`;
  const recorded = (k: typeof kept, d: typeof done) => [
    ...need(timedOut.status === 202 && !timedOut.ok && k.tx_hash === t && k.claim_id === null, `a timeout: ${JSON.stringify(timedOut)}, kept ${JSON.stringify(k)}`),
    ...need(notTheirs.status === 404 && otherTx.status === 409, 'someone else\'s claim, or a second transaction, is taken'),
    ...need(good.ok && good.claimId === '31337' && d.claim_id === '31337' && d.outcome === 'confirmed' && d.wallet === '0xabcdef0000000000000000000000000000000001', `confirmed: ${JSON.stringify(good)} ${JSON.stringify(d)}`),
  ];
  // Planted: a timeout that forgot the hash, and a confirm that kept no claim id.
  proven('K4b recordClaim keeps the hash at once, answers 202 on a timeout, takes only its maker\'s claim and transaction, and keeps the claim id and wallet once confirmed', recorded(kept, done), recorded({ ...kept, tx_hash: null }, { ...done, claim_id: null }));
}

// K6: no model.
{
  const files = ['src/lib/poidh/abi.ts', 'src/lib/poidh/claim.ts', 'src/lib/poidh/pinata.ts', 'src/lib/poidh/bounty.ts', 'src/lib/poidh/picture.ts', 'src/lib/poidh/wallet.ts', 'src/lib/poidh/wording.ts', 'src/app/api/challenge/backstory/claim/route.ts', 'src/app/api/challenge/backstory/claimed/route.ts', 'src/components/challenge-backstory-bounty.tsx'];
  const MODEL = /from '[^']*(chat\/model|images\/guard|images\/fal|images\/closed|images\/paid|batch-model|@ai-sdk|from 'ai')'|checkPrompt|generateText|streamText/;
  const comp = read('src/components/challenge-backstory-bounty.tsx');
  const addRoute = read('src/app/api/challenge/backstory/route.ts');
  const noModel = (srcs: Record<string, string>, box: string) => [
    ...Object.entries(srcs).flatMap(([f, t]) => need(!MODEL.test(t), `${f} imports or calls a model`)),
    ...need(!/placeholder=|BACKSTORY_GUIDE[^\n]*value=|value=\{[^}]*(GUIDE|guide|hint)/.test(box) && /value=\{text\}/.test(box) && /setText\(out\.backstory\?\.text \?\? ''\)/.test(box), 'the guide is put in the box, or the box starts from anything but the saved backstory'),
    ...need(/checkBackstory\(sql, request, r\.backstory\.text/.test(addRoute) && !/\b(generate\w*|suggest\w*|complete)\(/i.test(addRoute), 'the add route does more than the prompt check'),
    ...need(fetched.length === 0, `something was fetched: ${fetched.join(', ')}`),
    ...need(BACKSTORY_GUIDE.length === 5, 'the guide isn\'t five points'),
  ];
  const srcs = Object.fromEntries(files.map((f) => [f, read(f)]));
  proven('K6 no model is involved: no poidh file, route or the box imports one; nothing fetched; the guide never in the box', noModel(srcs, comp), noModel({ ...srcs, 'src/lib/poidh/claim.ts': `import { checkPrompt } from '../images/guard';\n${srcs['src/lib/poidh/claim.ts']}` }, comp.replace('value={text}', 'value={text || BACKSTORY_GUIDE[0]}')));
}

// K7: the read-back and the settings.
{
  const mig = read('supabase/migrations/NEXT_challenge_bounty_claims.sql');
  const part3 = mig.slice(mig.indexOf('-- 3. The read-back'));
  const uncomment = (block: string) => block.split('\n').filter((l) => l.startsWith('-- ') && !/^-- (\(a\)|\(b\)|3\.)/.test(l) && !/^-- (A realistic|the newest|that ends with)/.test(l)).map((l) => l.slice(3)).join('\n');
  const a = uncomment(part3.slice(part3.indexOf('-- (a)'), part3.indexOf('-- (b)')));
  const b = uncomment(part3.slice(part3.indexOf('-- do $$')));
  const ra = await db.query<{ n: number; ok: boolean }>(a);
  const notices: string[] = [];
  let bErr = '';
  try {
    await db.query(b, [], { onNotice: (n: { message: string }) => notices.push(n.message) } as never);
  } catch (e) {
    bErr = String((e as Error).message);
  }
  const [{ n: left }] = (await db.query<{ n: number }>(`select count(*)::int as n from studio.challenge_bounty_claims where fid = 2147483646`)).rows;
  const rb = (rows: typeof ra.rows) => [
    ...need(rows.length === 7 && rows.every((r) => r.ok), `read-back (a): ${JSON.stringify(rows.filter((r) => !r.ok))}`),
    ...need(!bErr && notices.includes('READ-BACK PASSED') && left === 0, `read-back (b): ${bErr || notices.join(' | ')}`),
    ...need(/^-- MUST RUN AS postgres/m.test(mig) && /rollback;\n\n-- 2\. The migration\.\nbegin;/.test(mig) && /\ncommit;\n/.test(mig), 'the file doesn\'t say who runs it, or lacks the dry run'),
    ...need(POIDH_BOUNTY_ID === 560 && POIDH_BOUNTY_ISSUER === '0x5bE8bDC96c423f265FC589ff8611e4C72eE94dCA' && POIDH.core === '0x5555Fa783936C260f77385b4E153B9725feF1719', 'the settings aren\'t the owner\'s'),
    ...need(W.warning === 'This goes onchain and can’t be deleted, even if the picture is hidden here.' && W.needsEth === 'You need a little ETH on Base to submit (under a cent).', 'the owner\'s two lines aren\'t exact'),
  ];
  // Planted: the writer given delete on the claims (read-back (a) item 2 must turn false).
  await db.exec('grant delete on studio.challenge_bounty_claims to studio_writer');
  const planted = (await db.query<{ n: number; ok: boolean }>(a)).rows;
  await db.exec('revoke delete on studio.challenge_bounty_claims from studio_writer');
  proven('K7 the migration\'s read-back passes on PGlite (an insert, send, confirm and delete of a realistic row); the settings and the owner\'s two lines are exact', rb(ra.rows), rb(planted));
}

await sql.end();
await server.stop();
await db.close();
if (savedJwt !== undefined) process.env.PINATA_JWT = savedJwt;
console.log(`\ntest:backstory-bounty: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
