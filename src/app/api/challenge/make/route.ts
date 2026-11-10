import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFid, getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { mayGenerate } from '~/lib/images/gate';
import { paidPicture } from '~/lib/images/paid';
import { referencePicture } from '~/lib/images/reference-picture';
import { signTicket, type TicketDesign } from '~/lib/images/ticket';
import { bookCharacter } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';
import { characterAnchor, makeView, momentPrompt, othersIn, challengeStyles, readMake, remixPrompt, resolveStyle } from '~/lib/challenge/make';
import { MAKE_WORDING } from '~/lib/challenge/make-wording';
import { CHALLENGE_CLOSED_DEFAULT, challengeDefaultModel, challengeModel, closedUsableBy, DEFAULT_CHALLENGE_MODEL, reserveUsd, modelView, noticeProblem } from '~/lib/challenge/models';
import { oneCharacterProblem } from '~/lib/challenge/one-character';
import { challengeSpend, makeWith, recipeModel } from '~/lib/challenge/make-model';
import { MODEL_WORDING } from '~/lib/challenge/model-wording';
import { lookFor } from '~/lib/challenge/looks';
import { whereFrom } from '~/lib/images/countries';
import { closedCapReached, generationsLeft } from '~/lib/images/limits';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { nextUtcMidnight } from '~/lib/images/paid';
import { isWalletNumber } from '~/lib/images/remixes';
import { defaultLook, sourceOf } from '~/lib/challenge/pictures';
import { spoilerExceptionOn } from '~/lib/challenge/spoilers';
import { challengeVisibleTo } from '~/lib/challenge/visibility';

/**
 * The remix screen's API (branch challenge-moments, 2026-11-05; docs/proposals/challenge-moments.md §1.3 S2).
 *
 * GET ?from=<version>: the screen's data (the picture tapped, the styles, the models, its words, and the fifteen moments
 * only while CHALLENGE.moments is on), for whoever may see the challenge (everyone once CHALLENGE.public is on, admins
 * before); 404 otherwise, and after entries close (P9g).
 *
 * POST { from, words, style, model } (and `moment` while the moments are on): one draft picture through the site's own image pipeline, exactly as "Make an image"
 * makes one: signed in, consent, the Generate gate (the site's check), the daily count and spend caps, the prompt
 * check (on the whole prompt, so the style's words, a person's own included, are checked with the change words), the
 * host's safety checker. The model must be one of challengeModels() (src/lib/challenge/models.ts); today the edit
 * model, with the tapped picture as reference image 1. With the moments off (owner, 2026-11-08) the prompt is
 * remixPrompt (the words, reference image 1, the style's text and KEEP_LINE, the no-lettering line) and the picture is
 * anchored to the character's first passage; with them on, momentPrompt with the other characters' current default
 * looks after it, anchored to the moment's passage. Nothing about the draft
 * is kept here: the picture and its signed record go back to the device, and Publish (/api/images/publish) writes it.
 *
 * Models (branch challenge-models, owner, 2026-11-08): GET sends the Model row (src/lib/challenge/models.ts modelView),
 * the open default first, and for a wallet account the line saying why closed models aren't offered; POST's `model`
 * must be one of them, and anything not offered to this visitor is refused (a closed model only where its maker
 * serves: the country is read from Vercel's header for this request and never kept). A closed model also needs
 * `notice: { version, adult: true }`: its maker's notice shown and the 18+ box ticked on the device. Every model but
 * the open default gets the tapped picture as its single reference image. The recipe records the model's id,
 * endpoint, host and cost; a closed picture counts as CLOSED_IMAGES.countsAs of the day's free pictures.
 *
 * Owner, 2026-11-09: GET also sends `defaultModel`, the model the row starts on (GPT Image 2.5 Sunburst for someone who
 * can use it, until entries close: P3's one exception; FLUX otherwise). POST refuses change words naming another
 * challenge character first (one character per picture), and a FLUX picture fal's checker blocks answers the owner's
 * words and uses none of today's pictures.
 */
const no = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const hidden = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function GET(request: Request) {
  const fid = await getFid(request);
  // Who is asking, for the Model row only: a wallet account sees why closed models aren't offered to it.
  const person = fid ?? (await getPerson(request).catch(() => null));
  if (!challengeVisibleTo(fid) || !spoilerExceptionOn()) return hidden();
  const sql = db();
  const from = new URL(request.url).searchParams.get('from') ?? '';
  const src = sql ? await sourceOf(sql, from).catch(() => null) : null;
  if (!src) return hidden();
  // The country decides the Model row for this answer only; it isn't kept, logged or sent on.
  const where = whereFrom(request.headers);
  const wallet = person !== null && isWalletNumber(person);
  const row = modelView(where, { wallet });
  // Today's free pictures left, so the screen can say when a closed pick (3 of them) won't fit; null signed out or for a wallet.
  const picturesLeft = sql && person !== null && !isWalletNumber(person) ? await generationsLeft(sql, person).catch(() => null) : null;
  // The model the row starts on: GPT Image 2.5 Sunburst for someone who can use it, until entries close (P3's one
  // exception, owner 2026-11-09; models.ts challengeDefaultModel); FLUX for everyone else and after the close.
  // When one more closed picture would pass today's closed caps: start on FLUX and say so under the Model row (owner,
  // 2026-11-09: never start on a model that will refuse). The line's {reset} is written by the browser.
  const closedOffered = row.models.some((m) => !m.open);
  const gpt = challengeModel(CHALLENGE_CLOSED_DEFAULT, where);
  const capReached = sql && closedOffered && gpt ? await closedCapReached(sql, reserveUsd(gpt, IMAGES.size)).catch(() => false) : false;
  const defaultModel = challengeDefaultModel({ where, signedIn: person !== null, wallet, picturesLeft, now: new Date(), closedCapReached: capReached });
  const capLine = capReached ? { text: IMAGE_WORDING.designs.models.closedSpend, resetAt: nextUtcMidnight() } : null;
  return NextResponse.json({ ...makeView(src, { styles: sql ? await challengeStyles(sql) : [], models: row.models }), modelsNote: row.note, picturesLeft, defaultModel: row.models.some((m) => m.id === defaultModel) ? defaultModel : DEFAULT_CHALLENGE_MODEL, capLine }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const fid = await getPerson(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in to make it' }, { status: 401 });
  if (!challengeVisibleTo(fid) || !spoilerExceptionOn()) return hidden();
  if (!IMAGES.enabled) return no('Making images is switched off for now', 503);
  const sql = db();
  if (!sql || !process.env.FAL_KEY || !process.env.IMAGES_TICKET_SECRET) return no('Making images is not set up on this deployment', 503);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return no('Bad request', 400);
  }
  const r = readMake(body);
  if (!r.ok) return no(r.error, 400);
  const src = await sourceOf(sql, r.from);
  if (!src) return no('This picture can’t be remixed for the challenge.', 400);
  // One character per picture for now (owner, 2026-11-09): change words naming another challenge character are refused
  // here, before any model or check runs, so the attempt uses none of today's pictures. Only the change box is read.
  const second = oneCharacterProblem(r.words, src.character);
  if (second) return no(second, 400, { reason: 'character' });
  // The model, before anything is counted: one offered to this visitor (the country, for this request only), with
  // its maker's notice and the 18+ box answered on the device for a closed one; never a wallet account's prepaid path.
  const where = whereFrom(request.headers);
  const chosen = challengeModel(r.model, where);
  if (!chosen) return no(MAKE_WORDING.noModel, 400, { reason: 'model' });
  if (!chosen.open && isWalletNumber(fid)) return no(MODEL_WORDING.walletOnly, 403, { reason: 'model' });
  const notice = noticeProblem(chosen, (body as { notice?: unknown }).notice);
  if (notice) return no(notice === 'adult' ? MODEL_WORDING.adultFirst : MODEL_WORDING.noticeFirst, 403, { reason: notice });
  if (!(await hasConsented(fid))) return no('Agree to how your words are published first', 403, { reason: 'consent' });
  const gate = await mayGenerate(sql, fid);
  if (!gate.ok) return no(gate.error, gate.status, { reason: gate.reason });

  const callName = (slug: string) => (bookCharacter(slug)?.name ?? slug).split(' ')[0];
  const name = callName(src.character);
  const moment = r.moment;
  // The Style row (moments off): a listed style, Random's draw from the published styles, or the person's own words.
  const style = moment ? null : resolveStyle(r.style, await challengeStyles(sql));
  if (!moment && !style) return no(MAKE_WORDING.noStyle, 400);
  // With the moments on: the other challenge characters in the moment, each by their current default look.
  // Only the open default takes the others' looks; every other model gets the tapped picture alone.
  const others = moment && chosen.id === DEFAULT_CHALLENGE_MODEL ? (await Promise.all(othersIn(moment, src.character).map(async (slug) => ({ slug, look: await defaultLook(sql, slug) })))).filter((o): o is { slug: string; look: NonNullable<typeof o.look> } => o.look !== null) : [];
  const prompt = moment ? momentPrompt({ words: r.words, name, scene: moment.scene, others: others.map((o) => callName(o.slug)) }) : remixPrompt({ words: r.words, name, look: lookFor(src.character), style: style!.text });
  const looks = [src, ...others.map((o) => o.look)];
  const pictures: { bytes: Buffer; contentType: string; width: number; height: number }[] = [];
  for (const l of looks) {
    const bytes = await referencePicture(l.url, l.sha256);
    if (!bytes) return no('The picture could not be read. Try again in a moment.', 503);
    pictures.push({ bytes, contentType: 'image/jpeg', width: l.width, height: l.height });
  }

  // Counted from here, whatever happens next (blocked attempts count), as every picture is.
  // The prompt check reads the whole prompt: the change words and the style's words (a person's own style too, even
  // with no other words), so a named artist, studio, film or real person in either is refused before anything is made.
  const spend = challengeSpend(chosen, pictures);
  const paid = await paidPicture(sql, fid, request, {
    checkText: prompt,
    // The whole prompt (words, the style's text, the keep line) is long: the larger check budget, as a sheet's views
    // and Remix pass (1,200). At the default 400 the style test of 2026-11-08 had 62 of 90 prompts answered "unclear".
    guardMaxTokens: IMAGES.designs.guardMaxTokens,
    spend,
    make: () => makeWith(chosen, prompt, pictures, request, spend.reserveUsd),
    // A FLUX picture fal's safety checker blocks (owner, 2026-11-09): its own words, the closed-model clause only for
    // someone who can use one here, and it uses none of today's pictures (its spend still counts against the caps).
    // fal's checker stays on. A closed model's refusal, and the prompt check's, count as before.
    ...(chosen.id === DEFAULT_CHALLENGE_MODEL ? { blocked: { error: MODEL_WORDING.openBlocked(closedUsableBy(where, isWalletNumber(fid))), giveBack: true } } : {}),
  });
  if (!paid.ok) return no(paid.error, paid.status, paid.extra);
  const made = paid.made;
  const sha256 = createHash('sha256').update(made.bytes).digest('hex');
  // Started from a base sheet: published as a 'uses' link (through `designs`, with no text added). The others' looks
  // are 'uses' links too, so the recipe credits every picture sent.
  const asDesign = (l: (typeof looks)[number] & { kind: 'sheet' }): TicketDesign => ({ versionId: l.versionId, kind: 'character', entity: bookCharacter(l.character)?.name ?? l.character, title: l.title, by: designByline(l.by, l.byFid), versionNo: l.versionNo, text: '', assist: null });
  const designs: TicketDesign[] = looks.filter((l): l is (typeof looks)[number] & { kind: 'sheet' } => l.kind === 'sheet').map(asDesign);
  // A published style (picked, or Random's draw): a 'uses' link too, with the exact text added and who drafted it.
  const sd = style?.design;
  if (sd) designs.push({ versionId: sd.versionId, kind: 'style', entity: sd.entity, title: sd.title, by: designByline(sd.byName, sd.byFid), versionNo: sd.versionNo, text: sd.text, assist: sd.assist ?? null });
  const anchor = moment ? { chapter: moment.chapter, start: moment.start, end: moment.end } : characterAnchor(src.character);
  const ticket = signTicket({
    v: 1, fid, chapter: anchor.chapter, start: anchor.start, end: anchor.end, userPrompt: r.words, style: null, prompt,
    model: recipeModel(chosen).id, endpoint: recipeModel(chosen).endpoint, host: recipeModel(chosen).host, settings: made.settings,
    seed: made.seed, requestId: made.requestId, sha256, width: IMAGES.size.width, height: IMAGES.size.height,
    costUsd: made.costUsd, guard: { model: IMAGES.guardModel, verdict: 'ok' }, at: new Date().toISOString(),
    ...(designs.length ? { designs } : {}),
    references: looks.map((l) => ({ url: l.url, sha256: l.sha256 })),
    sheets: { characters: [src.character, ...others.map((o) => o.slug)], place: null, added: [] },
    challenge: {
      character: src.character, from: src.versionId, fromKind: src.kind, model: chosen.id,
      ...(moment ? { moment: moment.id, scene: moment.scene } : {}),
      ...(style ? { style: { choice: style.choice, id: style.id, elementId: style.design?.elementId ?? null, label: style.label, text: style.text } } : {}),
    },
  });
  return NextResponse.json(
    { ticket, image: `data:${made.contentType};base64,${made.bytes.toString('base64')}`, sha256, prompt, left: paid.left, style: style ? (style.choice === 'random' ? MAKE_WORDING.randomDrew(style.label ?? '') : style.label) : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
