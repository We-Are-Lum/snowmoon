'use client';

import { useState } from 'react';
import { createWalletClient, custom, formatEther, getAddress, type EIP1193Provider } from 'viem';
import { lens } from 'viem/chains';

/**
 * Registering Snowmoon's own Lens App in the owner's browser (owner, 2026-11-04; docs/lens-app-registration.md).
 *
 * 1. Connect the wallet that will own the App.
 * 2. Builder sign-in: Lens's `challenge(builder)` gives a Sign-In with Ethereum text; the wallet signs it (no gas);
 *    `authenticate` gives a Builder access token, kept only in this page's memory.
 * 3. `createApp` with the arguments in the doc, and the metadata already uploaded to Grove (immutable).
 * 4. If Lens sends the transaction itself (CreateAppResponse), wait for it. If it returns one for the owner to send
 *    (SelfFundedTransactionRequest), show to, value and chainId (and the rest) before anything is signed, check them
 *    against the expected LensFactory, 0 and 232, and send only on the owner's tap. TransactionWillFail: show why.
 * 5. Find the App's address from the transaction, and the line for SOCIAL_SIGN_IN.lens.app.
 *
 * Calls go only to https://api.lens.xyz/graphql (CORS allows any origin), Grove's gateway (to re-check the metadata's
 * bytes) and the wallet. Lens's GraphQL schema was read by introspection on 2026-11-04.
 */

const LENS_API = 'https://api.lens.xyz/graphql';
/** docs/lens-app-metadata.json, uploaded to Grove (chain_id 232, immutable) on 2026-11-04. */
const METADATA = {
  uri: 'lens://a0001df5cbdfdde5837b0896b0a4006eff7f614ff37dc240677b2508005499d4',
  gateway: 'https://api.grove.storage/a0001df5cbdfdde5837b0896b0a4006eff7f614ff37dc240677b2508005499d4',
  sha256: 'bddb0e3e35ade9e28b884e7003f2663942ecf996196f809bf2ec2707f96e9d26',
};
/** What a transaction from Lens must be, or the page won't send it (docs/lens-app-registration.md, step 4). */
const EXPECTED = { to: '0x1fa75D26819Ac733bf7B1C1B36C3F8aEF32d2Cc0', value: 0n, chainId: 232 } as const;

/** createApp's arguments (docs/lens-app-registration.md, step 3). */
const CREATE_APP = {
  metadataUri: METADATA.uri,
  admins: [],
  graph: { globalGraph: true },
  defaultFeed: { globalFeed: true },
  feeds: [],
  namespace: { globalNamespace: true },
  groups: [],
  verification: false,
  signers: [],
};

type Raw = { type: number; to: string; from: string; nonce: number; gasLimit: number; maxPriorityFeePerGas: string; maxFeePerGas: string; data: `0x${string}`; value: string; chainId: number };
type Step =
  | { at: 'start' }
  | { at: 'signed-in'; account: `0x${string}`; token: string }
  | { at: 'to-send'; account: `0x${string}`; raw: Raw; reason: string }
  | { at: 'waiting'; hash: `0x${string}`; by: 'Lens' | 'you' }
  | { at: 'done'; hash: `0x${string}`; app: string }
  | { at: 'will-fail'; reason: string };

async function gql<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
  const res = await fetch(LENS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const out = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || out.errors?.length || !out.data) throw new Error(out.errors?.[0]?.message ?? `Lens answered ${res.status}`);
  return out.data;
}

function provider(): EIP1193Provider | null {
  return typeof window !== 'undefined' ? ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The checks a transaction from Lens must pass before the page offers to send it. */
export function rawProblems(raw: Pick<Raw, 'to' | 'value' | 'chainId' | 'from'>, account: string): string[] {
  const p: string[] = [];
  if (raw.to.toLowerCase() !== EXPECTED.to.toLowerCase()) p.push(`to is ${raw.to}, not the LensFactory ${EXPECTED.to}`);
  if (BigInt(raw.value) !== EXPECTED.value) p.push(`value is ${formatEther(BigInt(raw.value))} GHO, not 0`);
  if (raw.chainId !== EXPECTED.chainId) p.push(`chainId is ${raw.chainId}, not ${EXPECTED.chainId} (Lens Chain)`);
  if (raw.from.toLowerCase() !== account.toLowerCase()) p.push(`from is ${raw.from}, not your wallet ${account}`);
  return p;
}

export function LensAppRegister() {
  const [step, setStep] = useState<Step>({ at: 'start' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [metaOk, setMetaOk] = useState<boolean | null>(null);

  const run = (what: string, f: () => Promise<void>) => async () => {
    setError('');
    setBusy(what);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const wallet = () => {
    const p = provider();
    if (!p) throw new Error('No wallet in this browser. Open this page in a browser with your wallet.');
    return createWalletClient({ chain: lens, transport: custom(p) });
  };

  const checkMetadata = run('Checking the metadata on Grove…', async () => {
    const bytes = await fetch(METADATA.gateway).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Grove answered ${r.status}`))));
    const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    setMetaOk(hex === METADATA.sha256);
  });

  const signIn = run('Waiting for your wallet to sign the Builder sign-in…', async () => {
    const w = wallet();
    const [account] = await w.requestAddresses();
    if (!account) throw new Error('The wallet gave no address.');
    const { challenge } = await gql<{ challenge: { id: string; text: string } }>(
      'mutation ($r: ChallengeRequest!) { challenge(request: $r) { id text } }',
      { r: { builder: { address: account } } },
    );
    const signature = await w.signMessage({ account, message: challenge.text });
    const { authenticate: a } = await gql<{ authenticate: { __typename: string; accessToken?: string; reason?: string } }>(
      'mutation ($r: SignedAuthChallenge!) { authenticate(request: $r) { __typename ... on AuthenticationTokens { accessToken } ... on WrongSignerError { reason } ... on ExpiredChallengeError { reason } ... on ForbiddenError { reason } } }',
      { r: { id: challenge.id, signature } },
    );
    if (!a.accessToken) throw new Error(`Lens refused the sign-in (${a.__typename}): ${a.reason ?? 'no reason given'}`);
    setStep({ at: 'signed-in', account, token: a.accessToken });
  });

  const waitFor = async (hash: `0x${string}`, by: 'Lens' | 'you') => {
    setStep({ at: 'waiting', hash, by });
    for (let i = 0; i < 90; i++) {
      const { transactionStatus: s } = await gql<{ transactionStatus: { __typename: string; reason?: string } }>(
        'query ($r: TransactionStatusRequest!) { transactionStatus(request: $r) { __typename ... on FailedTransactionStatus { reason } } }',
        { r: { txHash: hash } },
      );
      if (s.__typename === 'FailedTransactionStatus') throw new Error(`The transaction failed: ${s.reason ?? 'no reason given'} (${hash})`);
      if (s.__typename === 'FinishedTransactionStatus') {
        const { app } = await gql<{ app: { address: string } | null }>('query ($r: AppRequest!) { app(request: $r) { address } }', { r: { txHash: hash } });
        if (app?.address) return setStep({ at: 'done', hash, app: getAddress(app.address) });
      }
      await sleep(2000);
    }
    throw new Error(`Still waiting after 3 minutes. The transaction is ${hash}; check it on the explorer, then reload and look it up.`);
  };

  const createApp = (account: `0x${string}`, token: string) =>
    run('Asking Lens to create the App…', async () => {
      const { createApp: r } = await gql<{ createApp: { __typename: string; hash?: `0x${string}`; reason?: string; raw?: Raw } }>(
        'mutation ($r: CreateAppRequest!) { createApp(request: $r) { __typename ... on CreateAppResponse { hash } ... on SelfFundedTransactionRequest { reason raw { type to from nonce gasLimit maxPriorityFeePerGas maxFeePerGas data value chainId } } ... on TransactionWillFail { reason } } }',
        { r: CREATE_APP },
        token,
      );
      if (r.__typename === 'CreateAppResponse' && r.hash) return waitFor(r.hash, 'Lens');
      if (r.__typename === 'SelfFundedTransactionRequest' && r.raw) return setStep({ at: 'to-send', account, raw: r.raw, reason: r.reason ?? '' });
      if (r.__typename === 'TransactionWillFail') return setStep({ at: 'will-fail', reason: r.reason ?? 'no reason given' });
      throw new Error(`Lens answered something unexpected (${r.__typename}).`);
    });

  const send = (account: `0x${string}`, raw: Raw) =>
    run('Waiting for your wallet to send the transaction…', async () => {
      if (rawProblems(raw, account).length) throw new Error('This transaction failed the checks; nothing was sent.');
      const w = wallet();
      await w.switchChain({ id: lens.id }).catch(() => w.addChain({ chain: lens }));
      const hash = await w.sendTransaction({
        account,
        chain: lens,
        to: getAddress(raw.to),
        data: raw.data,
        value: BigInt(raw.value),
        gas: BigInt(raw.gasLimit),
        maxFeePerGas: BigInt(raw.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(raw.maxPriorityFeePerGas),
      });
      await waitFor(hash, 'you');
    });

  return (
    <div className="lens-app">
      <h2 className="you-section">1. The metadata</h2>
      <p className="you-note">
        Uploaded to Grove, Lens&rsquo;s storage, as an immutable file: <code>{METADATA.uri}</code> (
        <a href={METADATA.gateway} target="_blank" rel="noreferrer">open it</a>). Its sha256 is <code>{METADATA.sha256}</code>.
      </p>
      <p>
        <button type="button" className="button" onClick={checkMetadata} disabled={!!busy}>Check its bytes</button>{' '}
        {metaOk === true && <span>The file on Grove matches.</span>}
        {metaOk === false && <strong>The file on Grove doesn&rsquo;t match. Don&rsquo;t go on.</strong>}
      </p>

      <h2 className="you-section">2. Sign in to Lens as a Builder</h2>
      <p className="you-note">Your wallet signs a sign-in message from Lens. No gas, no transaction.</p>
      {step.at === 'start' && (
        <p><button type="button" className="button" onClick={signIn} disabled={!!busy}>Sign in with my wallet</button></p>
      )}
      {step.at !== 'start' && step.at !== 'will-fail' && 'account' in step && <p>Signed in as a Builder: <code>{step.account}</code></p>}

      <h2 className="you-section">3. Create the App</h2>
      <table className="lens-app-args">
        <tbody>
          <tr><th>metadataUri</th><td><code>{CREATE_APP.metadataUri}</code></td></tr>
          <tr><th>admins, feeds, groups, signers</th><td>none</td></tr>
          <tr><th>graph, defaultFeed, namespace</th><td>Lens&rsquo;s global ones</td></tr>
          <tr><th>verification</th><td>off</td></tr>
          <tr><th>sponsorship, treasury</th><td>not set</td></tr>
        </tbody>
      </table>
      {step.at === 'signed-in' && (
        <p><button type="button" className="button" onClick={createApp(step.account, step.token)} disabled={!!busy}>Create the App</button></p>
      )}

      {step.at === 'to-send' && (() => {
        const problems = rawProblems(step.raw, step.account);
        return (
          <>
            <h2 className="you-section">4. Lens asks you to send this transaction</h2>
            {step.reason && <p className="you-note">Lens says: {step.reason}</p>}
            <table className="lens-app-args">
              <tbody>
                <tr><th>to</th><td><code>{step.raw.to}</code> {step.raw.to.toLowerCase() === EXPECTED.to.toLowerCase() ? '(the LensFactory)' : <strong>(not the LensFactory)</strong>}</td></tr>
                <tr><th>value</th><td>{formatEther(BigInt(step.raw.value))} GHO ({step.raw.value} wei)</td></tr>
                <tr><th>chainId</th><td>{step.raw.chainId} {step.raw.chainId === EXPECTED.chainId ? '(Lens Chain)' : <strong>(not Lens Chain)</strong>}</td></tr>
                <tr><th>from</th><td><code>{step.raw.from}</code></td></tr>
                <tr><th>gas</th><td>up to {step.raw.gasLimit.toLocaleString()} gas at up to {formatEther(BigInt(step.raw.maxFeePerGas) * 10n ** 9n)} gwei: at most {formatEther(BigInt(step.raw.gasLimit) * BigInt(step.raw.maxFeePerGas))} GHO</td></tr>
                <tr><th>data</th><td>{(step.raw.data.length - 2) / 2} bytes, starting <code>{step.raw.data.slice(0, 10)}</code> (expected <code>0xec5c08c0</code>)</td></tr>
              </tbody>
            </table>
            {problems.length > 0 ? (
              <p><strong>Not sent: {problems.join('; ')}.</strong></p>
            ) : (
              <>
                <p><label><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I checked to, value and chainId.</label></p>
                <p><button type="button" className="button" onClick={send(step.account, step.raw)} disabled={!!busy || !checked}>Send from my wallet</button></p>
              </>
            )}
          </>
        );
      })()}

      {step.at === 'will-fail' && <p><strong>Lens says the transaction would fail: {step.reason}</strong> Nothing was sent.</p>}
      {step.at === 'waiting' && (
        <p>
          Waiting for the transaction ({step.by === 'Lens' ? 'sent by Lens; you pay nothing' : 'sent from your wallet'}):{' '}
          <a href={`${lens.blockExplorers.default.url}/tx/${step.hash}`} target="_blank" rel="noreferrer"><code>{step.hash}</code></a>
        </p>
      )}
      {step.at === 'done' && (
        <>
          <h2 className="you-section">Done</h2>
          <p>The App: <a href={`${lens.blockExplorers.default.url}/address/${step.app}`} target="_blank" rel="noreferrer"><code>{step.app}</code></a></p>
          <p className="you-note">Send me the address and this transaction; I&rsquo;ll put it in <code>SOCIAL_SIGN_IN.lens.app</code>:</p>
          <pre>{`app: '${step.app}', // ours, registered ${new Date().toISOString().slice(0, 10)}, tx ${step.hash}`}</pre>
        </>
      )}

      {busy && <p className="you-note">{busy}</p>}
      {error && <p role="alert"><strong>{error}</strong></p>}
    </div>
  );
}
