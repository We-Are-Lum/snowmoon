/**
 * scripts/lib/batch-model.ts: every closed call carries zeroDataRetention, disallowPromptTraining and its pinned
 * provider (owner, 2026-11-04), and nothing is sent unless the gateway lists that provider with ZDR and no training.
 * No network: a stand-in fetch records what would be sent. Run: npm run test:batch-model
 */
import * as B from './lib/batch-model';

let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = '') => { if (ok) passed++; else failures.push(`${name}${detail ? `: ${detail}` : ''}`); };
const throws = (f: () => unknown, re: RegExp) => { try { f(); return false; } catch (e) { return re.test(String(e)); } };
const ref = { bytes: Buffer.from('png'), contentType: 'image/png' };

const endpoints = (provider: string, zdr: boolean, noTrain = true) => ({ data: { endpoints: [{ provider_name: 'google', has_no_training: true }, { provider_name: provider, has_zdr: zdr, has_no_training: noTrain }] } });
function fakeFetch(listing: unknown, reply: unknown) {
  const sent: { url: string; body: any }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (!init?.method) return new Response(JSON.stringify(listing), { status: 200 });
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, sent };
}
const geminiReply = { id: 'g1', usage: { cost: 0.0677 }, choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${Buffer.from('img').toString('base64')}` } }] } }] };
const gptReply = { data: [{ b64_json: Buffer.from('img').toString('base64') }], providerMetadata: { gateway: { cost: 0.0467, generationId: 'o1' } } };

// The options, for each model.
for (const [m, provider] of [['gemini-3.1-flash-image', 'vertex'], ['gpt-image-2.5-sunburst', 'openai']] as const) {
  const r = B.closedImageRequest(m, 'p', ref);
  const g = (r.body as any).providerOptions.gateway;
  check(`${m}: zeroDataRetention, disallowPromptTraining and only ['${provider}'] on the request`, g.zeroDataRetention === true && g.disallowPromptTraining === true && JSON.stringify(g.only) === JSON.stringify([provider]), JSON.stringify(g));
  check(`${m}: the recipe's settings record the same options`, JSON.stringify((r.settings as any).gateway) === JSON.stringify(g));
  check(`${m}: sent to the Vercel AI Gateway only`, r.url.startsWith('https://ai-gateway.vercel.sh/v1/'));
}
{
  const r = B.closedImageRequest('gemini-3.1-flash-image', 'a sample', null, '16:9');
  const b = r.body as any;
  check('a text-only Gemini sample: no picture sent, 16:9, the same gateway options', b.messages[0].content.length === 1 && b.messages[0].content[0].type === 'text' && b.providerOptions.google.imageConfig.aspectRatio === '16:9' && b.providerOptions.gateway.zeroDataRetention === true && b.providerOptions.gateway.only[0] === 'vertex');
  check('a text-only GPT picture is refused (not built)', throws(() => B.closedImageRequest('gpt-image-2.5-sunburst', 'p', null), /Gemini only/));
}
// Planted proofs: a body missing any option is caught.
check('proof: a body without zeroDataRetention is refused', throws(() => B.assertGatewayOptions('gemini-3.1-flash-image', { providerOptions: { gateway: { only: ['vertex'], disallowPromptTraining: true } } }), /zeroDataRetention/));
check('proof: a body without disallowPromptTraining is refused', throws(() => B.assertGatewayOptions('gpt-image-2.5-sunburst', { providerOptions: { gateway: { only: ['openai'], zeroDataRetention: true } } }), /disallowPromptTraining/));
check('proof: Google not pinned to Vertex is refused', throws(() => B.assertGatewayOptions('gemini-3.1-flash-image', { providerOptions: { gateway: { only: ['google'], zeroDataRetention: true, disallowPromptTraining: true } } }), /only must be \['vertex'\]/));
check('proof: no provider pin is refused', throws(() => B.assertGatewayOptions('gpt-image-2.5-sunburst', { providerOptions: { gateway: { zeroDataRetention: true, disallowPromptTraining: true } } }), /only must be/));

// The endpoint check before any paid call.
{
  const { f, sent } = fakeFetch(endpoints('vertex', true), geminiReply);
  const made = await B.closedImage('gemini-3.1-flash-image', 'p', ref, { key: 'k', fetch: f });
  check('Gemini on Vertex with ZDR: one call sent, with the options', sent.length === 1 && sent[0].body.providerOptions.gateway.zeroDataRetention === true && made.costUsd === 0.0677);
}
{
  const { f, sent } = fakeFetch(endpoints('openai', false), gptReply);
  let err = '';
  try { await B.closedImage('gpt-image-2.5-sunburst', 'p', ref, { key: 'k', fetch: f }); } catch (e) { err = String(e); }
  check('a provider without ZDR (as the gateway lists OpenAI for GPT Image 2.5 Sunburst, 2026-11-03): refused, nothing sent', sent.length === 0 && /no zero data retention/.test(err), err);
}
{
  const { f, sent } = fakeFetch(endpoints('vertex', true, false), geminiReply);
  let err = '';
  try { await B.closedImage('gemini-3.1-flash-image', 'p', ref, { key: 'k', fetch: f }); } catch (e) { err = String(e); }
  check('a provider without no-training: refused, nothing sent', sent.length === 0 && /no training/.test(err), err);
}
{
  const { f, sent } = fakeFetch(endpoints('openai', true), gptReply);
  await B.closedImage('gpt-image-2.5-sunburst', 'p', ref, { key: 'k', fetch: f });
  check('OpenAI, if listed with ZDR: sent with only [\'openai\']', sent.length === 1 && sent[0].body.providerOptions.gateway.only[0] === 'openai');
}
{
  let err = '';
  try { await B.closedImage('gemini-3.1-flash-image', 'p', ref, { key: '', fetch: fakeFetch({}, {}).f }); } catch (e) { err = String(e); }
  check('no gateway key: refused', /no AI_GATEWAY_API_KEY/.test(err));
}

console.log(`test:batch-model: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
