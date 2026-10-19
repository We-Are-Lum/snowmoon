import { NextResponse } from 'next/server';
import { getPerson, getWallet } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES, REMIX, remixGenerateOn } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { mayGenerate } from '~/lib/images/gate';
import { bylineName } from '~/lib/names';
import { shortAddress } from '~/lib/wallet/session';
import { generate, remixPictures, remixPrompt, remixPromptMax, testFakes } from '~/lib/remix/make';
import { closedRecipeModel, REMIX_GPT } from '~/lib/remix/model';
import { gatewayToken } from '~/lib/chat/model';
import { frameStorageReady, putFrameFiles, saveFrame } from '~/lib/remix/frames';
import { layoutPicture, remixShot } from '~/lib/remix/shot';

/**
 * Generate from any camera (owner, 2026-10-18): the live layout from the person's browser (the shot
 * camera's view, as a depth map), the shot's cast cards and plate, and the prompt (the shot's own
 * prompt plus the person's words), through the Pictures pipeline: sign-in (Farcaster, or a prepaid
 * wallet account), consent, the Pictures gate, Remix's own daily count and free cap, the prompt
 * check and blocked names, the Pictures reference-picture model and price, the host's safety checker; or, with
 * REMIX_MODEL = 'gpt' (off) and a version GPT Image drew, that closed model through Vercel AI Gateway (src/lib/remix/model.ts).
 * The frame is saved at once to the person's remix of the shot, with its full recipe, and its page
 * is /remix/<id>.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

/** The camera and people as the editor reports them, kept in the recipe; numbers and short strings only. */
function cameraOf(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = JSON.stringify(raw);
  if (text.length > 4000 || !/^[\w\s"{}\[\]:,.\-+]*$/.test(text)) return null;
  return JSON.parse(text);
}

export async function POST(request: Request) {
  const person = await getPerson(request);
  if (person === null) return NextResponse.json({ error: 'Sign in to remix' }, { status: 401 });
  if (!remixGenerateOn()) return no('Remixing is switched off for now', 503);
  const sql = db();
  if (!sql || !frameStorageReady()) return no('Remixing is not set up on this deployment', 503);

  let body: { adaptation?: unknown; version?: unknown; shot?: unknown; words?: unknown; layout?: unknown; camera?: unknown; nameProof?: unknown };
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const adaptation = Number(body.adaptation), version = Number(body.version);
  const shotId = typeof body.shot === 'string' && /^[\w-]{1,64}$/.test(body.shot) ? body.shot : '';
  const words = typeof body.words === 'string' ? body.words.trim() : '';
  if (!Number.isInteger(adaptation) || !Number.isInteger(version) || !shotId) return no('Bad request', 400);
  const shot = remixShot(adaptation, version, shotId);
  if (!shot) return no('No such shot', 404);
  // The model's credential: FAL_KEY for FLUX; the site's gateway credential for GPT Image (REMIX_MODEL = 'gpt' only).
  const keyed = (process.env.REMIX_TEST_FAKES === '1' && testFakes()) || (shot.model === 'gpt' ? Boolean(gatewayToken(request)) : Boolean(process.env.FAL_KEY));
  if (!keyed) return no('Remixing is not set up on this deployment', 503);
  if (!shot.hasCamera || !shot.prompt) return no('This shot has no camera and prompt to remix', 400);
  if (!words || words.length > REMIX.ownWordsMaxChars) return no(`Say what to change in up to ${REMIX.ownWordsMaxChars} characters`, 400);
  const layout = layoutPicture(body.layout, REMIX.layout);
  if (!layout) return no('The live layout did not come through. Try again.', 400);
  const [v] = await sql`select 1 from studio.adaptation_versions where id = ${version} and adaptation_id = ${adaptation} and not hidden`;
  if (!v) return no('No such version', 404);
  if (!(await hasConsented(person))) return no('Agree to how your words are published first', 403, { reason: 'consent' });
  const gate = await mayGenerate(sql, person);
  if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });

  const pictures = remixPictures(layout, shot);
  const prompt = remixPrompt(shot, pictures, words);
  if (prompt.length > remixPromptMax(shot.model)) return no('This prompt is too long to send. Say what to change in fewer words.', 400);
  const g = await generate(sql, person, request, prompt, pictures, shot.model);
  if (!g.ok) return no(g.error, g.status, g.extra);
  const made = g.made;

  const wallet = person < 0 ? getWallet(request) : null;
  const by = wallet ? { name: shortAddress(wallet.address), source: 'wallet' as const } : await bylineName(person, body.nameProof);
  // The stored picture, and a GPT Image frame's original PNG in the private bucket (owner, 2026-10-19).
  const { sha256, url, record: pictureRecord } = await putFrameFiles(made);
  const madeAt = new Date().toISOString();
  const flux = IMAGES.editModel;
  // A closed model is recorded with its maker, the date and "closed model" (principle 3; owner, 2026-10-18).
  const recipeModel = shot.model === 'gpt' ? closedRecipeModel(madeAt) : { id: flux.id, name: flux.name, licence: flux.licence, endpoint: flux.endpoint, host: flux.host };
  const frame = await saveFrame(sql, {
    adaptationId: adaptation,
    versionId: version,
    shotId: shot.id,
    person,
    ownWords: words,
    prompt,
    recipe: {
      kind: 'remix-frame',
      model: recipeModel,
      settings: made.settings,
      seed: made.seed,
      request_id: made.requestId,
      made_at: madeAt,
      size: shot.model === 'gpt' ? REMIX_GPT.size : IMAGES.size,
      // content_type and output_sha256: the stored picture (output_sha256 is the frame's image_sha256). For GPT Image,
      // model_output is what the model sent (a PNG, with its own sha256), converted to this JPEG on our server and kept
      // in the private bucket under private_key, never at a URL (owner, 2026-10-19).
      ...pictureRecord,
      cost_usd: made.costUsd,
      checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' }, ...(shot.model === 'gpt' ? { model_moderation: "passed (OpenAI's own)" } : { host_safety_checker: 'passed' }), blocked_names: 'none' },
      // version_frame_of: the version whose frame and prompt were sent (version 1's, for a shot of version 2, the GPT cut, while Remix draws with the open-weight model).
      shot: { id: shot.id, n: shot.n, version_frame: shot.recipeId, version_frame_sha256: shot.recipeSha256, version_frame_of: shot.from },
      pictures: pictures.map((p, i) => ({ n: i + 1, role: p.role, name: p.name, sent_sha256: p.sha256, width: p.width, height: p.height, served: p.src, made_from: p.file, made_from_sha256: p.fileSha256 })),
      camera: cameraOf(body.camera),
      // The shot's own prompt and the plate's sentence were drafted by the coding agent; the person's words are theirs.
      assist: { shot_prompt: 'the version\'s own prompt for this shot, drafted by the coding agent', plate_line: shot.model === 'gpt' ? null : 'drafted by the coding agent', own_words: 'the remixer\'s, unchanged' },
      by_name: by.name,
      by_name_source: by.source,
      ...(testFakes() ? { test: process.env.REMIX_TEST_FAKES === '1' ? 'made by the local test stand-in, not a model' : process.env.REMIX_TEST_FAKES === 'store' ? 'a local test run: the real model and prompt check, kept on this machine' : 'a local test run: the real model, with the prompt check stood in' } : {}),
    },
    imageUrl: url,
    imageSha256: sha256,
    costUsd: made.costUsd,
    byName: by.name,
  });
  return NextResponse.json(
    { id: frame.id, page: `/remix/${frame.id}`, url, sha256, words, left: g.left, ...(person < 0 ? { prepaid: true } : {}) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
