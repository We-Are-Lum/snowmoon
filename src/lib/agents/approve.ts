import 'server-only';
import { isWalletPerson } from '../people';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { after } from 'next/server';
import { editorData } from '../agent/data';
import { AGENTS, REMIX } from '../config';
import { generate, remixPictures, remixPrompt } from '../remix/make';
import { remixShot, savedLayoutPicture } from '../remix/shot';
import { sha256, sql } from './core';
import type { Change } from './edits';
import { actingFor, actingPrompt } from './direction';
import { readMade, storeMade } from './images';
import { versionById } from './pieces';
import { priceUsd } from '../wallet/credits';

/**
 * Spending on an edit draft, only when its person approves the shown estimate on /you (owner, 2026-10-20: "cost
 * shown, my approval before any spend"). Kept apart from the agent tools on purpose: no agent tool imports this
 * module; only the person's own "Make it" (POST /api/drafts, action run) reaches it.
 */

function publicFile(src: string): Buffer | null {
  if (!/^\/editor\/[\w/.-]+\.(jpg|png)$/.test(src)) return null;
  const f = path.join(process.cwd(), 'public', src);
  return existsSync(f) ? readFileSync(f) : null;
}

/** The person approved a frame try: Remix's pipeline makes it as them (their caps and checks), kept private here. */
async function runFrame(person: number, request: Request, body: { adaptation: number; version: number; shot: string; change: Extract<Change, { type: 'frame' }> }) {
  const shot = remixShot(body.adaptation, body.version, body.shot);
  // The shot's saved layout (its committed depth frame), as Remix sends it for a shot without a camera (owner, 2026-10-22).
  const layout = shot?.prompt ? await savedLayoutPicture(shot, REMIX.layout) : null;
  if (!shot || !layout) return { ok: false as const, status: 400, error: 'This shot has no committed layout to redraw from.' };
  const pictures = remixPictures(layout, shot);
  // A wallet account is charged the price its Make it button showed, or nothing (Terms 6a: "the price shown").
  if (isWalletPerson(person) && body.change.price_usd !== priceUsd(REMIX.reserveUsd(pictures.length))) return { ok: false as const, status: 409, error: 'The price of this frame has changed. Ask your agent to draft it again.' };
  // The person's acting notes for this shot go into the prompt, in their words, and into the recipe as theirs.
  const acting = await actingFor(person, body.adaptation, body.version, body.shot);
  const prompt = remixPrompt(shot, pictures, [body.change.note, actingPrompt(acting)].filter(Boolean).join(' '));
  const g = await generate(sql(), person, request, prompt, pictures);
  if (!g.ok) return { ok: false as const, status: g.status, error: g.error };
  const key = await storeMade(g.made.bytes, 'jpg');
  return { ok: true as const, key, sha: sha256(g.made.bytes), spent: g.made.costUsd + (g.guard.costUsd ?? 0), made: { kind: 'frame', label: 'Made here', model: g.made.settings, request_id: g.made.requestId, seed: g.made.seed, prompt, inputs: pictures.map((p) => ({ role: p.role, name: p.name, sha256: p.sha256 })), ...(acting.length ? { direction: acting } : {}) } };
}

/**
 * Asks fal to delete its CDN copy of a video test an hour after making it (owner, 2026-10-24). NOT honoured in the one
 * real test (2026-10-24, sync fal.run, LongCat 480p): the file was still served anonymously after 63 minutes, and an
 * initial_acl "forbid" sent with it was ignored too (so it is left out). Privacy §7 claims neither; it changes only
 * when fal is shown to delete the file.
 */
export const FAL_VIDEO_LIFECYCLE = JSON.stringify({ expiration_duration_seconds: 3600 });

/** A short-lived fal CDN token for our account (fal docs, "Reading a Restricted File"). Never logged. */
export async function falCdnToken(testUrl: string | null | undefined, auth: Record<string, string>): Promise<string | null> {
  const r = await fetch(`${testUrl ?? 'https://rest.fal.ai'}/storage/auth/token?storage_type=fal-cdn-v3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ expiration_seconds: 600 }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { token?: unknown } | null;
  return r?.ok && typeof j?.token === 'string' ? j.token : null;
}

/** The person approved a video test: LongCat-Video 480p on fal, from the shot's frame and their note, kept private. Exported only for a one-off real test script; runApproved is its one caller in the site. */
export async function runVideo(person: number, body: { adaptation: number; version: number; shot: string; change: Extract<Change, { type: 'video' }> }) {
  const data = editorData(body.adaptation, body.version)?.shots.find((s) => s.id === body.shot);
  const frame = typeof data?.frame === 'string' ? publicFile(data.frame as string) : null;
  if (!frame) return { ok: false as const, status: 400, error: 'This shot has no frame to move.' };
  const acting = await actingFor(person, body.adaptation, body.version, body.shot);
  const prompt = [body.change.note, actingPrompt(acting)].filter(Boolean).join(' ');
  const testUrl = process.env.VERCEL ? null : process.env.AGENTS_TEST_FAL_URL;
  const key = process.env.FAL_KEY;
  if (!testUrl && !key) return { ok: false as const, status: 503, error: 'Video tests aren’t set up here.' };
  const auth: Record<string, string> = key && !testUrl ? { authorization: `Key ${key}` } : {};
  const res = await fetch(`${testUrl ?? 'https://fal.run'}/${body.change.model}`, {
    method: 'POST',
    // X-Fal-Store-IO: 0, as for every image (src/lib/images/fal.ts): fal keeps no request-history copy of the request
    // or its reply. That header doesn't cover the video file fal puts on its CDN; the lifecycle header does (Privacy §7,
    // owner 2026-10-24) asks fal to delete it after an hour, but in the one real test fal didn't (see FAL_VIDEO_LIFECYCLE).
    headers: { 'content-type': 'application/json', 'X-Fal-Store-IO': '0', 'X-Fal-Object-Lifecycle-Preference': FAL_VIDEO_LIFECYCLE, ...auth },
    body: JSON.stringify({ image_url: `data:image/jpeg;base64,${frame.toString('base64')}`, prompt, enable_safety_checker: true }),
    signal: AbortSignal.timeout(280_000),
  }).catch(() => null);
  const out = (await res?.json().catch(() => null)) as { video?: { url?: string }; request_id?: string } | null;
  const url = out?.video?.url;
  if (!res?.ok || !url) return { ok: false as const, status: 502, error: 'The video model didn’t answer. Nothing was kept; try again later.' };
  // Read as our own account: FAL_KEY exchanged for a short-lived CDN token, sent as the Bearer (works for a file whose
  // ACL forbids others too, should fal apply one).
  const token = await falCdnToken(testUrl, auth);
  const vid = token
    ? await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : null;
  if (!vid) return { ok: false as const, status: 502, error: 'The video couldn’t be fetched. Try again later.' };
  const bytes = Buffer.from(vid);
  const stored = await storeMade(bytes, 'mp4');
  const sha = sha256(bytes);
  // Our copy is read back and must match what fal sent before fal's copy may be deleted (owner, 2026-10-25).
  const back = await readMade(stored).catch(() => null);
  const confirmed = !!back && sha256(back) === sha;
  const requestId = out?.request_id ?? res.headers.get('x-fal-request-id');
  return { ok: true as const, key: stored, sha, spent: body.change.estimate_usd, made: { kind: 'video', label: 'Made here', model: body.change.model, host: 'fal.ai', request_id: requestId ?? null, prompt, inputs: [{ role: 'frame', sha256: sha256(frame) }], ...(acting.length ? { direction: acting } : {}), cost_note: 'the estimate (fal returns no price per call)', fal: { request_id: requestId ?? null, copy_confirmed: confirmed, deleted_at: null, error: confirmed ? null : 'our copy did not read back the same; fal\'s copy kept', tried_at: null } } };
}

/** "Make it": the person approves the spend on their own draft; within the daily caps; at most once. */
export async function runApproved(person: number, versionId: string, request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const v = await versionById(versionId);
  if (!v || v.person !== person || v.status !== 'draft' || v.kind !== 'edit') return { ok: false, status: 404, error: 'Not found' };
  const body = v.body as { adaptation: number; version: number; shot: string; change: Change };
  if (body.change.type !== 'frame' && body.change.type !== 'video') return { ok: false, status: 400, error: 'Nothing to make for this edit.' };
  const estimate = body.change.estimate_usd;
  const s = sql();
  // The checks and the claim are one transaction under a lock per person (as Remix's own reserve() does): a second
  // "Make it" for the same person waits here until the first has claimed its draft, then sees it. An approval still
  // in progress (approved_at set, spent_usd not yet written) counts at its estimate, so two taps at once can't both
  // slip past the $2 a day or a key's spend cap. The lock is per person because the daily caps are per person and a
  // key belongs to one person; the fal or image call itself runs after the lock is released.
  type Gate = { ok: true } | { ok: false; status: number; error: string };
  const gate: Gate = await s.begin(async (tx): Promise<Gate> => {
    await tx`select pg_advisory_xact_lock(hashtext('snowmoon.agents.approve'), ${person}::int)`;
    const [row] = await tx<{ approved: boolean }[]>`select approved_at is not null as approved from studio.piece_versions where id = ${versionId} for update`;
    if (!row || row.approved) return { ok: false, status: 409, error: 'Already approved.' };
    const [today] = await tx<{ frames: number; videos: number; usd: number }[]>`
      select count(*) filter (where pv.body->'change'->>'type' = 'frame')::int as frames,
             count(*) filter (where pv.body->'change'->>'type' = 'video')::int as videos,
             coalesce(sum(coalesce(pv.spent_usd, (pv.body->'change'->>'estimate_usd')::numeric, 0)), 0)::float8 as usd
      from studio.piece_versions pv join studio.pieces p on p.id = pv.piece_id
      where p.person = ${person} and (pv.approved_at at time zone 'utc')::date = (now() at time zone 'utc')::date and pv.id <> ${versionId}`;
    const over =
      body.change.type === 'frame' && today.frames >= AGENTS.spend.framesPerDay ? `${AGENTS.spend.framesPerDay} frame tries a day`
      : body.change.type === 'video' && today.videos >= AGENTS.spend.videosPerDay ? `${AGENTS.spend.videosPerDay} video tests a day`
      : today.usd + estimate > AGENTS.spend.dailyCapUsd ? `$${AGENTS.spend.dailyCapUsd} a day of approved spending`
      : null;
    if (over) return { ok: false, status: 429, error: `That's the most for today: ${over}. More tomorrow (00:00 UTC).` };
    // A personal key's spend cap: what all its approved drafts have spent (or, still in progress, their estimate), plus this one, stays within it.
    const [key] = await tx<{ cap: string | null; spent: number }[]>`
      select a.spend_cap_usd as cap,
             (select coalesce(sum(coalesce(o.spent_usd, (o.body->'change'->>'estimate_usd')::numeric, 0)), 0)::float8 from studio.piece_versions o
               where o.agent_id = a.id and o.id <> ${versionId} and (o.spent_usd is not null or o.approved_at is not null)) as spent
      from studio.piece_versions pv join studio.agents a on a.id = pv.agent_id where pv.id = ${versionId}`;
    if (key?.cap !== null && key !== undefined && Number(key.spent) + estimate > Number(key.cap) + 1e-9)
      return { ok: false, status: 429, error: `That's over this agent key's spend cap ($${Number(key.cap).toFixed(2)}; $${Number(key.spent).toFixed(2)} spent). Make a new key with a higher cap, or approve less.` };
    await tx`update studio.piece_versions set approved_at = now() where id = ${versionId}`;
    return { ok: true };
  });
  if (!gate.ok) return gate;
  const fail = async (status: number, error: string) => {
    await s`update studio.piece_versions set approved_at = null where id = ${versionId}`;
    return { ok: false as const, status, error };
  };
  const r = body.change.type === 'frame' ? await runFrame(person, request, body as never) : await runVideo(person, body as never);
  if (!r.ok) return fail(r.status, r.error);
  await s`update studio.piece_versions set spent_usd = ${r.spent}, made = ${s.json(r.made as postgres.JSONValue)}, image_key = ${r.key}, image_sha256 = ${r.sha} where id = ${versionId}`;
  // fal's copy of a video test is deleted after the response; earlier failures are retried here too. Never blocks this.
  after(async () => {
    if (body.change.type === 'video') await cleanupFal(versionId).catch((e) => console.error('fal cleanup', versionId, (e as Error)?.name ?? 'error'));
    await retryFalCleanups().catch((e) => console.error('fal cleanup retries', (e as Error)?.name ?? 'error'));
  });
  return { ok: true };
}

type FalBlock = { request_id: string | null; copy_confirmed: boolean; deleted_at: string | null; error: string | null; tried_at: string | null; files?: number };
const RETRY_AFTER_MS = 5 * 60_000;

/** fal's Platform API, or the local tests' stand-in. */
const falPlatform = () => {
  const testUrl = process.env.VERCEL ? null : process.env.AGENTS_TEST_FAL_URL;
  return testUrl ? { base: testUrl, key: 'test' } : { base: 'https://api.fal.ai', key: process.env.FAL_CLEANUP_KEY ?? null };
};

/**
 * Deletes fal's copy of an approved video test once ours is confirmed (owner, 2026-10-25: "delete fal's copies as soon
 * as we have ours"): a sha256 re-check of our stored copy against the one recorded, then DELETE
 * /v1/models/requests/{id}/payloads with FAL_CLEANUP_KEY (a key that may only delete). The outcome is kept in the
 * draft's recipe (made.fal); a failure is logged and retried by retryFalCleanups. Never touches our copy.
 */
export async function cleanupFal(versionId: string): Promise<'deleted' | 'skipped' | 'failed'> {
  const s = sql();
  const [v] = await s<{ made: { fal?: FalBlock } | null; image_key: string | null; image_sha256: string | null }[]>`select made, image_key, image_sha256 from studio.piece_versions where id = ${versionId}`;
  const fal = v?.made?.fal;
  if (!v || !fal || !fal.request_id || fal.deleted_at || !v.image_key || !v.image_sha256) return 'skipped';
  const { base, key } = falPlatform();
  if (!key) return 'skipped';
  const save = (patch: Partial<FalBlock>) =>
    s`update studio.piece_versions set made = jsonb_set(made, '{fal}', ${s.json({ ...fal, ...patch, tried_at: new Date().toISOString() } as postgres.JSONValue)}) where id = ${versionId}`;
  const back = await readMade(v.image_key).catch(() => null);
  if (!back || sha256(back) !== v.image_sha256) {
    await save({ copy_confirmed: false, error: 'our copy did not read back the same; fal\'s copy kept' });
    console.error('fal cleanup: copy not confirmed', versionId);
    return 'failed';
  }
  const r = await fetch(`${base}/v1/models/requests/${encodeURIComponent(fal.request_id)}/payloads`, {
    method: 'DELETE',
    headers: { authorization: `Key ${key}`, 'idempotency-key': `snowmoon-${fal.request_id}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { cdn_delete_results?: { exception: string | null }[] } | null;
  const failed = (j?.cdn_delete_results ?? []).filter((x) => x.exception);
  if (!r?.ok || failed.length) {
    const error = !r ? 'fal did not answer' : !r.ok ? `fal answered ${r.status}` : `${failed.length} file(s) not deleted`;
    await save({ copy_confirmed: true, error });
    console.error('fal cleanup failed', versionId, error);
    return 'failed';
  }
  await save({ copy_confirmed: true, error: null, deleted_at: new Date().toISOString(), files: j?.cdn_delete_results?.length ?? 0 });
  return 'deleted';
}

/** Retries video tests whose fal copy wasn't deleted, a few at a time, at most every RETRY_AFTER_MS each. */
export async function retryFalCleanups(limit = 5) {
  const before = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
  const rows = await sql()<{ id: string }[]>`select id from studio.piece_versions
    where made->'fal'->>'request_id' is not null and made->'fal'->>'deleted_at' is null
      and coalesce(made->'fal'->>'tried_at', '1970-01-01') < ${before} order by approved_at limit ${limit}`;
  for (const r of rows) await cleanupFal(r.id);
}
