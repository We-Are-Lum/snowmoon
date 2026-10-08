/**
 * The reading assistant's route to the model (src/lib/chat/model.ts). Fails (exit 1) on any problem.
 *
 *   npm run test:chat-route
 *
 * fetch is a stand-in, so no call leaves the machine. Checks:
 * - With the project's key, the provider is called directly, without providerOptions.
 * - When the direct call is busy and the fallback is on, the gateway answers,
 *   pinned to the same provider with zero data retention.
 * - A gateway answer from any other provider is refused.
 * - With no key and no gateway token, nothing is sent.
 */
import { CHAT } from '../src/lib/config';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${name}${detail ? `: ${detail}` : ''}`));

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let answers: (() => Response)[] = [];
globalThis.fetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, body: JSON.parse(String(init.body)) });
  return (answers.shift() ?? (() => new Response('{}', { status: 500 })))();
}) as typeof fetch;
const ok = (servedBy?: string | null) => () =>
  Response.json({
    id: 'r1',
    choices: [{ message: { content: 'an answer', ...(servedBy ? { provider_metadata: { gateway: { routing: { finalProvider: servedBy } } } } : {}) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
const busy = () => new Response('{"error":"capacity_exceeded"}', { status: 498 });

const { complete, ModelUnavailable, BUSY_RETRY_MS } = await import('../src/lib/chat/model');
BUSY_RETRY_MS.splice(0, BUSY_RETRY_MS.length, 0, 0, 0);
const MODEL = Object.keys(CHAT.prices)[0];
const msgs = [{ role: 'user' as const, content: 'q' }];
const opts = { maxTokens: 10, temperature: 0 };

// The notice names every hop in use.
check('the route names the gateway exactly while the fallback is on', (!!CHAT.host && CHAT.route.includes(CHAT.host)) === CHAT.gatewayFallback && !!CHAT.providerName && CHAT.route.includes(CHAT.providerName), CHAT.route);

// Direct.
process.env[CHAT.direct.keyEnv] = 'test-key';
calls = []; answers = [ok()];
const r1 = await complete('gw-token', MODEL, msgs, opts);
check('direct answers first', r1.route === 'direct' && calls.length === 1 && calls[0].url === CHAT.direct.endpoint, JSON.stringify(calls.map((c) => c.url)));
check('the direct call carries no providerOptions', calls[0] && !('providerOptions' in calls[0].body));

// Busy direct → gateway, pinned.
calls = []; answers = [busy, ok(CHAT.provider)];
if (CHAT.gatewayFallback) {
  const r2 = await complete('gw-token', MODEL, msgs, opts);
  check('busy direct falls back to the gateway', r2.route === 'gateway' && calls[1]?.url === CHAT.endpoint);
  const po = JSON.stringify(calls[1]?.body.providerOptions ?? {});
  check('the gateway call is pinned with zero data retention', po.includes('"zeroDataRetention":true') && po.includes(`"${CHAT.provider}"`), po);

  // A gateway answer from another provider is refused.
  calls = []; answers = [busy, ok('someone-else')];
  let refused = false;
  try { await complete('gw-token', MODEL, msgs, opts); } catch (e) { refused = e instanceof ModelUnavailable; }
  check('a gateway answer from another provider is refused', refused);
} else {
  try { await complete('gw-token', MODEL, msgs, opts); } catch {}
  check('without the fallback, the gateway is never called', calls.every((c) => c.url === CHAT.direct.endpoint));
}

// No route.
delete process.env[CHAT.direct.keyEnv];
calls = [];
let none = false;
try { await complete(null, MODEL, msgs, opts); } catch (e) { none = e instanceof ModelUnavailable; }
check('with no key and no token, nothing is sent', none && calls.length === 0);

if (failures.length) {
  console.error(`chat route tests FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`chat route tests passed: ${passed} checks`);
