import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { IMAGES } from '../config';
import { challengeModel, reserveUsd, type ChallengeModel } from '../challenge/models';
import { designByVersion } from '../images/designs';
import type { Where } from '../images/countries';
import type { Made } from '../images/fal';
import type { paidPicture } from '../images/paid';
import { signTicket } from './ticket';
import type { SceneTicket } from './takes';
import { TAKES_WORDING as W } from './takes-wording';

/**
 * The free picture of one's own scene (Nate, 2026-11-26): one per account, for those the voice switch lets in. The order:
 * words in quotation marks are refused first, before anything is used; then the free picture is claimed
 * (studio.claim_free_scene: a second request while one is being made is refused, not made); the prompt check and the
 * picture are paidPicture's, as every picture's (the rules, the blocked names, the safety checker), its cost counted in
 * the site's free daily image budget (studio.image_costs, funded 'free', under imagesDailySpendCapUsd); GPT Image through
 * Vercel AI Gateway (Nate, 2026-11-26) with Lord Ephelion's published sheet's front view as the reference. Made: recorded
 * for good (finish_free_scene, with its sha256 only); refused or failed: the claim is given up (release_free_scene). The
 * picture and its recipe go back to the device with a signed record; nothing else is kept.
 */
type Sql = postgres.Sql;
type Result = { status: number; json: Record<string, unknown> };

export interface SceneDeps {
  real: boolean;
  reference: (url: string, sha256: string) => Promise<Buffer | null>;
  paid: typeof paidPicture;
  make: (m: ChallengeModel, prompt: string, refs: Buffer[], request: Request, worstUsd: number, description: string) => Promise<Made>;
}

/** Words in quotation marks (straight, curly, guillemets, low): refused before anything is used. */
export const QUOTES = /["“”„«»]/;
export const GPT_IMAGE = 'gpt-image-2.5-sunburst';

/** Lord Ephelion's newest published sheet's front view: the free picture's one reference. */
export async function ephelionFront(sql: Sql): Promise<{ versionId: string; url: string; sha256: string } | null> {
  const [v] = await sql<{ id: string }[]>`
    select v.id::text from studio.element_versions v join studio.elements e on e.id = v.element_id join studio.entities en on en.id = e.entity_id
    where e.element_type = 'design' and e.status = 'published' and en.kind = 'character' and en.name = 'Lord Ephelion'
    order by v.created_at desc limit 1`;
  if (!v) return null;
  const front = (await designByVersion(sql, v.id).catch(() => null))?.shown.body.views.front;
  return front?.url && front.sha256 ? { versionId: v.id, url: front.url, sha256: front.sha256 } : null;
}

export async function freeSceneState(sql: Sql, fid: number) {
  const [r] = await sql<{ made: boolean }[]>`select made_at is not null as made from studio.ephelion_scene_pictures where person = ${fid}`;
  return { made: Boolean(r?.made) };
}

export async function makeFreeScene(sql: Sql, fid: number, request: Request, raw: unknown, where: Where, deps: SceneDeps): Promise<Result> {
  const description = String((raw as { description?: unknown } | null)?.description ?? '').trim();
  if (!description || description.length > 400) return { status: 400, json: { error: W.describeLabel, reason: 'empty' } };
  if (QUOTES.test(description)) return { status: 422, json: { error: W.refusedQuotes, reason: 'quotes' } };
  const m = challengeModel(GPT_IMAGE, where, true);
  if (!m) return { status: 503, json: { error: W.notHere, reason: 'model' } };
  const [c] = await sql<{ ok: boolean }[]>`select studio.claim_free_scene(${fid}::bigint) as ok`;
  if (!c?.ok) {
    const made = (await freeSceneState(sql, fid)).made;
    return { status: 409, json: { error: made ? W.used : W.making, reason: made ? 'used' : 'busy' } };
  }
  const release = () => sql`select studio.release_free_scene(${fid}::bigint)`.catch(() => undefined);
  try {
    const front = await ephelionFront(sql);
    const ref = front && (await deps.reference(front.url, front.sha256));
    if (!front || !ref) {
      await release();
      return { status: 503, json: { error: W.failed, reason: 'reference' } };
    }
    const prompt = `${description}\n\nThe man in the reference picture is Lord Ephelion: keep his face and build; what he wears and where he is come from the words above.\n\n${IMAGES.suffix}`;
    const worst = reserveUsd(m, { width: IMAGES.viewSize.width, height: IMAGES.viewSize.height });
    // Only the site's free daily image budget (Nate, 2026-11-27): never the person's own daily count (pool 'scene').
    const paid = await deps.paid(sql, fid, request, { checkText: prompt, spend: { model: { id: m.allowlistId, host: m.call.host }, reserveUsd: worst, pool: 'scene' }, maker: m.maker, make: () => deps.make(m, prompt, [ref], request, worst, description) });
    if (!paid.ok) {
      await release();
      const refused = paid.status === 422 || /refus|block|rule/i.test(String((paid.extra as { reason?: unknown } | undefined)?.reason ?? ''));
      return { status: paid.status, json: { error: refused ? W.refusedRules : paid.status === 429 ? paid.error : W.failed, reason: refused ? 'rules' : 'failed' } };
    }
    const bytes = Buffer.from(paid.made.bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const ext = bytes[0] === 0x89 ? 'png' : 'jpg';
    const [f] = await sql<{ ok: boolean }[]>`select studio.finish_free_scene(${fid}::bigint, ${sha256}) as ok`;
    if (!f?.ok) return { status: 409, json: { error: W.used, reason: 'used' } };
    const recipe = {
      v: 1,
      kind: 'ephelion-scene',
      description,
      descriptionBy: 'the performer',
      prompt,
      model: { id: m.allowlistId, name: m.name, maker: m.maker, open: m.open, host: m.call.host, standIn: !deps.real },
      reference: { role: 'his look', versionId: front.versionId, url: front.url, sha256: front.sha256 },
      guard: { model: IMAGES.guardModel, verdict: 'ok' },
      madeAt: new Date().toISOString(),
    };
    const ticket = signTicket({ v: 1, kind: 'scene', person: fid, sha256, ext, recipe, issuedAt: Date.now() } satisfies SceneTicket);
    return { status: 200, json: { image: `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`, sha256, ext, recipe, ticket } };
  } catch (e) {
    await release();
    console.error('free scene: failed', (e as Error).name);
    return { status: 502, json: { error: W.failed, reason: 'failed' } };
  }
}
