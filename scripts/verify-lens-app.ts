/**
 * Verify the site's own Lens App before its address goes into SOCIAL_SIGN_IN.lens.app (owner, 2026-11-05: "with the
 * Lens App address set and verified"). Read-only: it only reads Lens Chain's public RPC (eth_chainId, eth_getCode,
 * eth_getTransactionByHash, eth_getTransactionReceipt, eth_call) and Grove's public gateway. No key, no signing, no
 * transaction, no spend.
 *
 *   npm run verify:lens-app -- --address=0x<App> --tx=0x<the transaction that created it> --owner=0x<owner's wallet>
 *   npm run verify:lens-app -- --self-test     (planted wrong inputs, each of which must fail)
 *
 * What "verified" means here (exit 0 only if every check passes):
 *  V1 The RPC is Lens Chain mainnet (chain id 232).
 *  V2 The address has contract code on Lens Chain.
 *  V3 The transaction succeeded, was sent to the LensFactory, and in it the AppFactory announced this address as a
 *     new App (its App-deployed event, topic 1 = the address). So the App was made through the LensFactory, in that
 *     transaction, not elsewhere.
 *  V4 The App's owner (the owner() of its access control, App.getAccessControl()) is the owner's wallet. The
 *     transaction was sent by that wallet, or by Lens's sponsor when Lens paid the gas (the Builder sign-in that asked
 *     for it was the owner's); the report says which.
 *  V5 The App's metadata URI (App.getMetadataURI(), and the URI in the AppFactory's event) is the uploaded
 *     lens://a0001df5…99d4.
 *  V6 That file's bytes on Grove, and docs/lens-app-metadata.json in this repository, both hash to sha256
 *     bddb0e3e…9d26.
 *
 * Drafted by the coding agent (Anthropic's Claude, a closed model).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPublicClient, decodeAbiParameters, http, toFunctionSelector, type Hex } from 'viem';

const RPC = 'https://rpc.lens.xyz';
const CHAIN_ID = 232;
const LENS_FACTORY = '0x1fa75d26819ac733bf7b1c1b36c3f8aef32d2cc0';
const APP_FACTORY = '0xb3b7502c47e16a1e3c6d660b73006f45ec327b0b';
/** The AppFactory's App-deployed event (topic 0), read from every App deploy through the LensFactory (2026-11-05). */
const APP_DEPLOYED = '0xf3d26c5d4f39c7f923aa40fae8b7b935990269d8560ad7905e49675ea10f59a0';
/** The sender of every sponsored App deploy we found (docs/lens-app-registration.md, "Gas estimate"). */
const LENS_SPONSOR = '0xb9646756556c0b80a7f0a5ac9dc8693f3264e348';
const METADATA_URI = 'lens://a0001df5cbdfdde5837b0896b0a4006eff7f614ff37dc240677b2508005499d4';
const METADATA_SHA256 = 'bddb0e3e35ade9e28b884e7003f2663942ecf996196f809bf2ec2707f96e9d26';
const GROVE = `https://api.grove.storage/${METADATA_URI.slice('lens://'.length)}`;
const ROOT = path.resolve(import.meta.dirname, '..');

const client = createPublicClient({ transport: http(RPC, { timeout: 20_000 }) });
const isAddr = (a: unknown): a is Hex => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
const isHash = (h: unknown): h is Hex => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h);
const low = (a: string | null | undefined) => (a ?? '').toLowerCase();
const word = (a: string) => '0x' + low(a).slice(2).padStart(64, '0');

async function callString(to: Hex, sig: string): Promise<string | null> {
  try {
    const r = await client.call({ to, data: toFunctionSelector(sig) });
    return r.data ? (decodeAbiParameters([{ type: 'string' }], r.data)[0] as string) : null;
  } catch {
    return null;
  }
}
async function callAddress(to: Hex, sig: string): Promise<string | null> {
  try {
    const r = await client.call({ to, data: toFunctionSelector(sig) });
    return r.data && r.data.length >= 66 ? '0x' + r.data.slice(-40) : null;
  } catch {
    return null;
  }
}

/** Cached across self-test runs: the Grove bytes don't depend on the inputs. */
let groveSha: Promise<string | null> | null = null;

export async function verifyLensApp(input: { address: string; tx: string; owner: string }): Promise<{ problems: string[]; notes: string[] }> {
  const problems: string[] = [];
  const notes: string[] = [];
  if (!isAddr(input.address) || !isHash(input.tx) || !isAddr(input.owner)) return { problems: ['--address, --tx and --owner must be an address, a transaction hash and an address'], notes };
  const app = input.address;

  const chain = await client.getChainId();
  if (chain !== CHAIN_ID) problems.push(`V1: the RPC is chain ${chain}, not Lens Chain (${CHAIN_ID})`);

  const code = await client.getCode({ address: app }).catch(() => undefined);
  if (!code || code === '0x') problems.push(`V2: ${app} has no contract code on Lens Chain`);

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: input.tx }).catch(() => null),
    client.getTransactionReceipt({ hash: input.tx }).catch(() => null),
  ]);
  let eventUri: string | null = null;
  if (!tx || !receipt) problems.push(`V3: transaction ${input.tx} not found on Lens Chain`);
  else {
    if (receipt.status !== 'success') problems.push('V3: the transaction did not succeed');
    if (low(tx.to) !== LENS_FACTORY) problems.push(`V3: the transaction was sent to ${tx.to}, not the LensFactory`);
    const made = receipt.logs.find((l) => low(l.address) === APP_FACTORY && low(l.topics[0]) === APP_DEPLOYED && low(l.topics[1]) === word(app));
    if (!made) problems.push(`V3: in this transaction the AppFactory did not deploy ${app}`);
    else {
      try {
        eventUri = (decodeAbiParameters([{ type: 'string' }, { type: 'string' }], made.data)[0] as string) ?? null;
      } catch {
        eventUri = null;
      }
    }
    const from = low(tx.from);
    if (from === low(input.owner)) notes.push('sent by the owner’s wallet');
    else if (from === LENS_SPONSOR) notes.push('sent by Lens’s sponsor (Lens paid the gas)');
    else problems.push(`V4: the transaction was sent by ${tx.from}, neither the owner’s wallet nor Lens’s sponsor`);
  }

  const access = await callAddress(app, 'getAccessControl()');
  const appOwner = access ? await callAddress(access as Hex, 'owner()') : null;
  if (low(appOwner) !== low(input.owner)) problems.push(`V4: the App's owner is ${appOwner ?? 'unknown'}, not ${input.owner}`);

  const uri = await callString(app, 'getMetadataURI()');
  if (uri !== METADATA_URI) problems.push(`V5: the App's metadata URI is ${uri ?? 'unreadable'}, not ${METADATA_URI}`);
  if (tx && receipt && eventUri !== METADATA_URI) problems.push(`V5: the deploy event's metadata URI is ${eventUri ?? 'unreadable'}`);

  const local = createHash('sha256').update(readFileSync(path.join(ROOT, 'docs/lens-app-metadata.json'))).digest('hex');
  if (local !== METADATA_SHA256) problems.push(`V6: docs/lens-app-metadata.json hashes to ${local}`);
  groveSha ??= fetch(GROVE, { signal: AbortSignal.timeout(20_000), redirect: 'error' })
    .then(async (r) => (r.ok ? createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex') : null))
    .catch(() => null);
  const grove = await groveSha;
  if (grove !== METADATA_SHA256) problems.push(`V6: Grove's copy hashes to ${grove ?? 'unreadable'}`);

  return { problems, notes };
}

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);

if (process.argv.includes('--self-test')) {
  // Plants, each of which must fail: real Lens Chain data used the wrong way.
  // - Lens's own Test App with its own owner, against a real App deploy it wasn't made in (V3, V5);
  // - an address with no code (Lens's sponsor, an account) (V2, V3);
  // - a real App deploy through the LensFactory (the newest one found with our metadata URI, at --address/--tx if
  //   given), but with the wrong owner (V4);
  // - not an address at all.
  const TEST_APP = '0x8A5Cc31180c37078e1EbA2A23c861Acf351a97cE';
  const TEST_APP_OWNER = '0x9248090e86bce5ae1420b98751404d654c35cf0d';
  const SOME_DEPLOY = (arg('tx') ?? '0x7001522f7cad6c9ebd58204998e62af93cdd62ff627b05a2584ca58ae524e576') as Hex;
  const SOME_APP = arg('address') ?? '0x3cd3df83e3f74e855d7c4104a8ed9eba23faae47';
  const plants: [string, { address: string; tx: string; owner: string }, string][] = [
    ['Lens’s Test App, not made in this transaction', { address: TEST_APP, tx: SOME_DEPLOY, owner: TEST_APP_OWNER }, 'V3'],
    ['an address with no code', { address: LENS_SPONSOR, tx: SOME_DEPLOY, owner: TEST_APP_OWNER }, 'V2'],
    ['a real App with the wrong owner', { address: SOME_APP, tx: SOME_DEPLOY, owner: '0x' + '1'.repeat(40) }, 'V4'],
    ['not an address', { address: 'snowmoon', tx: SOME_DEPLOY, owner: TEST_APP_OWNER }, 'must be'],
  ];
  let bad = 0;
  for (const [name, input, expect] of plants) {
    const { problems } = await verifyLensApp(input);
    const ok = problems.some((p) => p.includes(expect));
    console.log(`${ok ? 'ok  ' : 'FAIL'} planted ${name}: ${ok ? `refused (${problems.filter((p) => p.includes(expect))[0]})` : `not refused for ${expect} (${problems.join('; ') || 'passed'})`}`);
    if (!ok) bad++;
  }
  console.log(bad ? `${bad} plant(s) passed: the verifier is broken` : 'every plant was refused');
  process.exit(bad ? 1 : 0);
}

const input = { address: arg('address') ?? '', tx: arg('tx') ?? '', owner: arg('owner') ?? '' };
const { problems, notes } = await verifyLensApp(input);
for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log('Not verified: leave SOCIAL_SIGN_IN.lens.app as it is.');
  process.exit(1);
}
console.log(`Verified: ${input.address} is a Lens App on Lens Chain, made through the LensFactory in ${input.tx}, owned by ${input.owner}, with metadata ${METADATA_URI} (sha256 ${METADATA_SHA256}).`);
console.log(`Config line: app: '${input.address}' as '' | \`0x\${string}\`,`);
