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

// The options, for each model (owner, 2026-11-04: ZDR required for Google on Vertex only; training off and a pin for both).
{
  const g = (B.closedImageRequest('gemini-3.1-flash-image', 'p', ref).body as any).providerOptions.gateway;
  check("Gemini: zeroDataRetention, disallowPromptTraining and only ['vertex']", g.zeroDataRetention === true && g.disallowPromptTraining === true && JSON.stringify(g.only) === '["vertex"]', JSON.stringify(g));
  const o = (B.closedImageRequest('gpt-image-2.5-sunburst', 'p', ref).body as any).providerOptions.gateway;
  check("GPT: disallowPromptTraining and only ['openai'], no ZDR asked (OpenAI's endpoint has none)", o.disallowPromptTraining === true && JSON.stringify(o.only) === '["openai"]' && o.zeroDataRetention === undefined, JSON.stringify(o));
  for (const m of ['gemini-3.1-flash-image', 'gpt-image-2.5-sunburst'] as const) {
    const r = B.closedImageRequest(m, 'p', ref);
    check(`${m}: the settings record the same gateway options`, JSON.stringify((r.settings as any).gateway) === JSON.stringify((r.body as any).providerOptions.gateway));
    check(`${m}: sent to the Vercel AI Gateway only`, r.url.startsWith('https://ai-gateway.vercel.sh/v1/'));
  }
}
{
  const r = B.closedImageRequest('gemini-3.1-flash-image', 'a sample', null, '16:9');
  const b = r.body as any;
  check('a text-only Gemini sample: no picture sent, 16:9, the same gateway options', b.messages[0].content.length === 1 && b.messages[0].content[0].type === 'text' && b.providerOptions.google.imageConfig.aspectRatio === '16:9' && b.providerOptions.gateway.zeroDataRetention === true && b.providerOptions.gateway.only[0] === 'vertex');
  const t = B.closedImageRequest('gpt-image-2.5-sunburst', 'p', null);
  check('a text-only GPT picture: the generations endpoint, portrait, training off and pinned, no picture sent', t.url.endsWith('/images/generations') && (t.body as any).size === '1024x1536' && !(t.body as any).images && (t.body as any).providerOptions.gateway.disallowPromptTraining === true && (t.body as any).providerOptions.gateway.only[0] === 'openai');
}
// Planted violations, one per rule: each body is caught before it is sent.
check('violation: Google on Vertex without zeroDataRetention is refused', throws(() => B.assertGatewayOptions('gemini-3.1-flash-image', { providerOptions: { gateway: { only: ['vertex'], disallowPromptTraining: true } } }), /zeroDataRetention/));
check('violation: Google without disallowPromptTraining is refused', throws(() => B.assertGatewayOptions('gemini-3.1-flash-image', { providerOptions: { gateway: { only: ['vertex'], zeroDataRetention: true } } }), /disallowPromptTraining/));
check('violation: Google not pinned to Vertex is refused', throws(() => B.assertGatewayOptions('gemini-3.1-flash-image', { providerOptions: { gateway: { only: ['google'], zeroDataRetention: true, disallowPromptTraining: true } } }), /only must be \['vertex'\]/));
check('violation: OpenAI without disallowPromptTraining is refused', throws(() => B.assertGatewayOptions('gpt-image-2.5-sunburst', { providerOptions: { gateway: { only: ['openai'] } } }), /disallowPromptTraining/));
check('violation: OpenAI with no provider pin is refused', throws(() => B.assertGatewayOptions('gpt-image-2.5-sunburst', { providerOptions: { gateway: { disallowPromptTraining: true } } }), /only must be \['openai'\]/));
check('violation: OpenAI pinned elsewhere is refused', throws(() => B.assertGatewayOptions('gpt-image-2.5-sunburst', { providerOptions: { gateway: { only: ['azure'], disallowPromptTraining: true } } }), /only must be/));
check('allowed: OpenAI with training off and the pin, without ZDR', !throws(() => B.assertGatewayOptions('gpt-image-2.5-sunburst', { providerOptions: { gateway: { only: ['openai'], disallowPromptTraining: true } } }), /./));

// The endpoint list, read before any paid call; the retention recorded.
{
  const { f, sent } = fakeFetch(endpoints('vertex', true), geminiReply);
  const made = await B.closedImage('gemini-3.1-flash-image', 'p', ref, { key: 'k', fetch: f });
  const ret = (made.settings as any).retention;
  check('Gemini on Vertex with ZDR: one call sent, the retention recorded as zero', sent.length === 1 && sent[0].body.providerOptions.gateway.zeroDataRetention === true && made.costUsd === 0.0677 && ret?.zero_data_retention === true && ret?.no_training === true && !ret?.kept);
}
{
  const { f, sent } = fakeFetch(endpoints('vertex', false), geminiReply);
  let err = '';
  try { await B.closedImage('gemini-3.1-flash-image', 'p', ref, { key: 'k', fetch: f }); } catch (e) { err = String(e); }
  check('violation: Vertex listed without ZDR: refused, nothing sent', sent.length === 0 && /no zero data retention/.test(err), err);
}
{
  const { f, sent } = fakeFetch(endpoints('openai', false), gptReply);
  const made = await B.closedImage('gpt-image-2.5-sunburst', 'p', ref, { key: 'k', fetch: f });
  const ret = (made.settings as any).retention;
  check('OpenAI without ZDR (as the gateway lists GPT Image 2.5 Sunburst): allowed after the endpoint list, sent once', sent.length === 1 && sent[0].body.providerOptions.gateway.zeroDataRetention === undefined);
  check('OpenAI without ZDR: the recipe settings record what was kept (up to 30 days, quoted, with source and date)', ret?.zero_data_retention === false && /up to 30 days/.test(ret?.kept?.quote ?? '') && /developers\.openai\.com/.test(ret?.kept?.source ?? '') && typeof ret?.endpoint_list_read_at === 'string', JSON.stringify(ret));
}
{
  const { f, sent } = fakeFetch(endpoints('openai', false, false), gptReply);
  let err = '';
  try { await B.closedImage('gpt-image-2.5-sunburst', 'p', ref, { key: 'k', fetch: f }); } catch (e) { err = String(e); }
  check('violation: OpenAI listed without no-training: refused, nothing sent', sent.length === 0 && /no training/.test(err), err);
}
{
  const { f, sent } = fakeFetch({ data: { endpoints: [] } }, gptReply);
  let err = '';
  try { await B.closedImage('gpt-image-2.5-sunburst', 'p', ref, { key: 'k', fetch: f }); } catch (e) { err = String(e); }
  check('violation: no endpoint list entry for the pinned provider: refused, nothing sent', sent.length === 0 && /lists no openai endpoint/.test(err), err);
}
{
  let err = '';
  try { await B.closedImage('gemini-3.1-flash-image', 'p', ref, { key: '', fetch: fakeFetch({}, {}).f }); } catch (e) { err = String(e); }
  check('no gateway key: refused', /no AI_GATEWAY_API_KEY/.test(err));
}

console.log(`test:batch-model: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
