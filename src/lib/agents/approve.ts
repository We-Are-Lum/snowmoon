import 'server-only';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { editorData } from '../agent/data';
import { AGENTS, REMIX } from '../config';
import { generate, remixPictures, remixPrompt } from '../remix/make';
import { remixShot, savedLayoutPicture } from '../remix/shot';
import { sha256, sql } from './core';
import type { Change } from './edits';
import { actingFor, actingPrompt } from './direction';
import { storeMade } from './images';
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
  if (person < 0 && body.change.price_usd !== priceUsd(REMIX.reserveUsd(pictures.length))) return { ok: false as const, status: 409, error: 'The price of this frame has changed. Ask your agent to draft it again.' };
  // The person's acting notes for this shot go into the prompt, in their words, and into the recipe as theirs.
  const acting = await actingFor(person, body.adaptation, body.version, body.shot);
  const prompt = remixPrompt(shot, pictures, [body.change.note, actingPrompt(acting)].filter(Boolean).join(' '));
  const g = await generate(sql(), person, request, prompt, pictures);
  if (!g.ok) return { ok: false as const, status: g.status, error: g.error };
  const key = await storeMade(g.made.bytes, 'jpg');
  return { ok: true as const, key, sha: sha256(g.made.bytes), spent: g.made.costUsd + (g.guard.costUsd ?? 0), made: { kind: 'frame', label: 'Made here', model: g.made.settings, request_id: g.made.requestId, seed: g.made.seed, prompt, inputs: pictures.map((p) => ({ role: p.role, name: p.name, sha256: p.sha256 })), ...(acting.length ? { direction: acting } : {}) } };
}

/** The person approved a video test: LongCat-Video 480p on fal, from the shot's frame and their note, kept private. */
async function runVideo(person: number, body: { adaptation: number; version: number; shot: string; change: Extract<Change, { type: 'video' }> }) {
  const data = editorData(body.adaptation, body.version)?.shots.find((s) => s.id === body.shot);
  const frame = typeof data?.frame === 'string' ? publicFile(data.frame as string) : null;
  if (!frame) return { ok: false as const, status: 400, error: 'This shot has no frame to move.' };
  const acting = await actingFor(person, body.adaptation, body.version, body.shot);
  const prompt = [body.change.note, actingPrompt(acting)].filter(Boolean).join(' ');
  const testUrl = process.env.VERCEL ? null : process.env.AGENTS_TEST_FAL_URL;
  const key = process.env.FAL_KEY;
  if (!testUrl && !key) return { ok: false as const, status: 503, error: 'Video tests aren’t set up here.' };
  const res = await fetch(`${testUrl ?? 'https://fal.run'}/${body.change.model}`, {
    method: 'POST',
    // X-Fal-Store-IO: 0 as for every image (src/lib/images/fal.ts): fal keeps no copy of the request or reply.
    headers: { 'content-type': 'application/json', 'X-Fal-Store-IO': '0', ...(key && !testUrl ? { authorization: `Key ${key}` } : {}) },
    body: JSON.stringify({ image_url: `data:image/jpeg;base64,${frame.toString('base64')}`, prompt, enable_safety_checker: true }),
    signal: AbortSignal.timeout(280_000),
  }).catch(() => null);
  const out = (await res?.json().catch(() => null)) as { video?: { url?: string }; request_id?: string } | null;
  const url = out?.video?.url;
  if (!res?.ok || !url) return { ok: false as const, status: 502, error: 'The video model didn’t answer. Nothing was kept; try again later.' };
  const vid = await fetch(url, { signal: AbortSignal.timeout(60_000) }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  if (!vid) return { ok: false as const, status: 502, error: 'The video couldn’t be fetched. Try again later.' };
  const bytes = Buffer.from(vid);
  const stored = await storeMade(bytes, 'mp4');
  return { ok: true as const, key: stored, sha: sha256(bytes), spent: body.change.estimate_usd, made: { kind: 'video', label: 'Made here', model: body.change.model, host: 'fal.ai', request_id: out?.request_id ?? null, prompt, inputs: [{ role: 'frame', sha256: sha256(frame) }], ...(acting.length ? { direction: acting } : {}), cost_note: 'the estimate (fal returns no price per call)' } };
}

/** "Make it": the person approves the spend on their own draft; within the daily caps; at most once. */
export async function runApproved(person: number, versionId: string, request: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const v = await versionById(versionId);
  if (!v || v.person !== person || v.status !== 'draft' || v.kind !== 'edit') return { ok: false, status: 404, error: 'Not found' };
  const body = v.body as { adaptation: number; version: number; shot: string; change: Change };
  if (body.change.type !== 'frame' && body.change.type !== 'video') return { ok: false, status: 400, error: 'Nothing to make for this edit.' };
  const s = sql();
  const [claimed] = await s`update studio.piece_versions set approved_at = now() where id = ${versionId} and approved_at is null returning id`;
  if (!claimed) return { ok: false, status: 409, error: 'Already approved.' };
  const [today] = await s<{ frames: number; videos: number; usd: number }[]>`
    select count(*) filter (where pv.body->'change'->>'type' = 'frame')::int as frames,
           count(*) filter (where pv.body->'change'->>'type' = 'video')::int as videos,
           coalesce(sum(pv.spent_usd), 0)::float8 as usd
    from studio.piece_versions pv join studio.pieces p on p.id = pv.piece_id
    where p.person = ${person} and (pv.approved_at at time zone 'utc')::date = (now() at time zone 'utc')::date and pv.id <> ${versionId}`;
  const over =
    body.change.type === 'frame' && today.frames >= AGENTS.spend.framesPerDay ? `${AGENTS.spend.framesPerDay} frame tries a day`
    : body.change.type === 'video' && today.videos >= AGENTS.spend.videosPerDay ? `${AGENTS.spend.videosPerDay} video tests a day`
    : today.usd + body.change.estimate_usd > AGENTS.spend.dailyCapUsd ? `$${AGENTS.spend.dailyCapUsd} a day of approved spending`
    : null;
  const fail = async (status: number, error: string) => {
    await s`update studio.piece_versions set approved_at = null where id = ${versionId}`;
    return { ok: false as const, status, error };
  };
  if (over) return fail(429, `That's the most for today: ${over}. More tomorrow (00:00 UTC).`);
  // A personal key's spend cap: what all its approved drafts have spent, plus this one, stays within it.
  const [key] = await s<{ cap: string | null; spent: number }[]>`
    select a.spend_cap_usd as cap, (select coalesce(sum(o.spent_usd), 0)::float8 from studio.piece_versions o where o.agent_id = a.id and o.id <> ${versionId}) as spent
    from studio.piece_versions pv join studio.agents a on a.id = pv.agent_id where pv.id = ${versionId}`;
  if (key?.cap !== null && key !== undefined && Number(key.spent) + body.change.estimate_usd > Number(key.cap) + 1e-9)
    return fail(429, `That's over this agent key's spend cap ($${Number(key.cap).toFixed(2)}; $${Number(key.spent).toFixed(2)} spent). Make a new key with a higher cap, or approve less.`);
  const r = body.change.type === 'frame' ? await runFrame(person, request, body as never) : await runVideo(person, body as never);
  if (!r.ok) return fail(r.status, r.error);
  await s`update studio.piece_versions set spent_usd = ${r.spent}, made = ${s.json(r.made as postgres.JSONValue)}, image_key = ${r.key}, image_sha256 = ${r.sha} where id = ${versionId}`;
  return { ok: true };
}
