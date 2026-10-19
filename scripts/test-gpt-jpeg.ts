/**
 * test:gpt-jpeg: a GPT Image remix frame is stored as a JPEG converted on our server, and its recipe records both the
 * original PNG's sha256 and the stored JPEG's (owner, 2026-10-19). No network, no database, no key: the gateway is a
 * stand-in fetch that answers as the real one did on 2026-10-19 (a PNG for output_format "jpeg"), with a picture
 * drawn here, and the credential is a placeholder that is never sent anywhere.
 *
 *  J1: makeGptEdit stores a JPEG (FF D8), 1536×864, from the gateway's PNG.
 *  J2: the recipe's model_output.sha256 is the sha256 of the exact PNG the gateway sent; content_type image/png; not kept.
 *  J3: the recipe's output_sha256 is the sha256 of the stored JPEG's bytes, and differs from the PNG's.
 *  J4: the conversion is repeatable: the same PNG gives the same JPEG sha256.
 *  J5: a PNG with transparency is flattened (the JPEG decodes, 3 channels, no alpha); no metadata is carried over.
 *  J6: a JPEG from the model is stored as sent: both sha256s are the same, converted null.
 *  J7: anything else is refused (makeGptEdit throws ImageUnavailable; nothing to store).
 *  J11: every request carries providerOptions.gateway.disallowPromptTraining = true, and no zeroDataRetention (this
 *       model has none: the gateway refuses it); the frame's recipe records the flag.
 *  J8: a FLUX frame's recipe is unchanged: no model_output, output_sha256 of its bytes.
 *  J9: the stand-in gateway was called once per make, at the gateway's URL, asking for output_format "jpeg".
 *  J10: the flag is still off: REMIX_MODEL is 'flux'.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makeGptEdit } from '../src/lib/images/gateway-image';
import { ImageUnavailable } from '../src/lib/images/fal';
import { outputRecord, storedJpeg } from '../src/lib/images/stored-jpeg';
import { REMIX_GPT, REMIX_MODEL } from '../src/lib/remix/model';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let failed = 0;
function check(id: string, what: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${what}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
}

// A placeholder credential so makeGptEdit reaches fetch; fetch is replaced below, so it never leaves this process.
for (const k of ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN']) delete process.env[k];
process.env.AI_GATEWAY_API_KEY = 'placeholder-not-a-key';

const W = REMIX_GPT.size.width;
const H = REMIX_GPT.size.height;
// A picture with detail (gradient and noise), so the JPEG is a real re-encode rather than a flat block.
const raw = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 3;
  raw[i] = (x * 255) / W;
  raw[i + 1] = (y * 255) / H;
  raw[i + 2] = ((x ^ y) * 7) & 255;
}
const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().withMetadata({ exif: { IFD0: { ImageDescription: 'test-metadata' } } }).toBuffer();
const pngAlpha = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.4 } } }).png().toBuffer();
const jpegFromModel = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();

const calls: { url: string; outputFormat: unknown; gateway: Record<string, unknown> | null }[] = [];
let answer: Buffer = png;
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? '{}'));
  calls.push({ url: String(url), outputFormat: body.output_format, gateway: body.providerOptions?.gateway ?? null });
  return new Response(JSON.stringify({ data: [{ b64_json: answer.toString('base64') }], providerMetadata: { gateway: { cost: '0.026908', generationId: 'gen_test' } } }), { status: 200 });
}) as typeof fetch;

const request = new Request('http://127.0.0.1/api/remix/generate');
const refs = [{ bytes: jpegFromModel, contentType: 'image/jpeg', width: W, height: H }];

// J1–J3
answer = png;
const made = await makeGptEdit('a test prompt', refs, request);
const meta = await sharp(made.bytes).metadata();
check('J1', 'the stored frame is a 1536×864 JPEG converted from the PNG', made.contentType === 'image/jpeg' && made.bytes[0] === 0xff && made.bytes[1] === 0xd8 && meta.format === 'jpeg' && meta.width === W && meta.height === H, { contentType: made.contentType, meta: { format: meta.format, width: meta.width, height: meta.height } });
const rec = outputRecord(made);
check('J2', "the recipe's model_output is the gateway's PNG, by its own sha256, not kept", rec.model_output?.sha256 === sha(png) && rec.model_output?.content_type === 'image/png' && rec.model_output?.size_bytes === png.length && rec.model_output?.width === W && rec.model_output?.height === H && rec.model_output?.kept === false && /JPEG on our server/.test(rec.model_output?.converted ?? ''), rec.model_output);
check('J3', "the recipe's output_sha256 is the stored JPEG's, and differs from the PNG's", rec.output_sha256 === sha(made.bytes) && rec.content_type === 'image/jpeg' && rec.output_sha256 !== rec.model_output?.sha256, { output: rec.output_sha256, png: rec.model_output?.sha256 });

// J4
const again = await storedJpeg(png);
check('J4', 'the same PNG gives the same JPEG sha256', !!again && sha(again.bytes) === sha(made.bytes), { first: sha(made.bytes), again: again && sha(again.bytes) });

// J5
answer = pngAlpha;
const flat = await makeGptEdit('a test prompt', refs, request);
const flatMeta = await sharp(flat.bytes).metadata();
const plainMeta = await sharp(made.bytes).metadata();
check('J5', 'a PNG with transparency is flattened; no metadata carried over', flatMeta.format === 'jpeg' && flatMeta.channels === 3 && !flatMeta.hasAlpha && !plainMeta.exif && !plainMeta.icc && !plainMeta.xmp, { channels: flatMeta.channels, hasAlpha: flatMeta.hasAlpha, exif: !!plainMeta.exif, icc: !!plainMeta.icc, xmp: !!plainMeta.xmp });

// J6
answer = jpegFromModel;
const asSent = await makeGptEdit('a test prompt', refs, request);
const recJ = outputRecord(asSent);
check('J6', "a JPEG from the model is stored as sent: both sha256s the same, converted null", asSent.bytes.equals(jpegFromModel) && recJ.output_sha256 === sha(jpegFromModel) && recJ.model_output?.sha256 === recJ.output_sha256 && recJ.model_output?.content_type === 'image/jpeg' && recJ.model_output?.converted === null, recJ);

// J7
answer = Buffer.from('GIF89a not a picture we take');
let refused = false;
try {
  await makeGptEdit('a test prompt', refs, request);
} catch (e) {
  refused = e instanceof ImageUnavailable;
}
check('J7', 'any other format is refused', refused && (await storedJpeg(answer)) === null);

// J8
const fluxBytes = jpegFromModel;
const recF = outputRecord({ bytes: fluxBytes, contentType: 'image/jpeg' });
check('J8', "a FLUX frame's recipe has no model_output and its own sha256", !('model_output' in recF) && recF.output_sha256 === sha(fluxBytes), recF);

// J9
check('J9', 'the stand-in gateway was called once per make, at the gateway URL, asking for JPEG', calls.length === 4 && calls.every((c) => c.url === REMIX_GPT.url && c.outputFormat === 'jpeg'), calls);

// J11
check('J11', 'every request asks the gateway not to route to a provider that trains on prompts (disallowPromptTraining), and never asks for ZDR; the recipe records it', calls.length === 4 && calls.every((c) => c.gateway?.disallowPromptTraining === true && !('zeroDataRetention' in (c.gateway ?? {}))) && (made.settings as { providerOptions?: { gateway?: { disallowPromptTraining?: boolean } } })?.providerOptions?.gateway?.disallowPromptTraining === true, { calls, settings: made.settings });

// J10
check('J10', "the flag is still off (REMIX_MODEL 'flux')", REMIX_MODEL === 'flux', REMIX_MODEL);

console.log(`\ntest:gpt-jpeg: ${11 - failed}/11 passed (PNG ${png.length.toLocaleString()} bytes → JPEG ${made.bytes.length.toLocaleString()} bytes)`);
process.exit(failed ? 1 : 0);
