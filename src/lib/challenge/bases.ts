import 'server-only';
import type postgres from 'postgres';
import { CHALLENGE, WORK_ID } from '../config';
import type { DesignBody, DesignPicture } from '../element-body';
import { closedModel, modelName } from '../images/recipe-lines';
import { basesOf } from './rules';

type Sql = postgres.Sql | postgres.TransactionSql;

/**
 * Bases made by closed models (owner, 2026-11-04). Bases and references may be made by several models, closed ones
 * included, each labelled with its maker as every recipe is (src/lib/images/recipe-lines.ts). A base whose pictures
 * name a closed model is refused until CHALLENGE.closedBasesAllowed is true, which waits for the owner's reread of the
 * Terms and Privacy lines that name the providers (check:principles P6s). A model that isn't on config/models.json is
 * refused always: nothing says whether it is open. Remixers' models are not affected: the fork form is unchanged.
 */

/** The closed models (and models not on the list) a design's pictures were made with, each named with its maker. */
export function closedModelsIn(body: Pick<DesignBody, 'samples' | 'views'>): { model: string; label: string; listed: boolean }[] {
  const pics: DesignPicture[] = [...(body.samples ?? []), ...(['front', 'side', 'back'] as const).flatMap((k) => (body.views?.[k] ? [body.views[k]!] : []))];
  const out = new Map<string, { model: string; label: string; listed: boolean }>();
  for (const p of pics) {
    const id = p.recipe?.model;
    if (!id) continue;
    const c = closedModel(id);
    if (!c) out.set(id, { model: id, label: `${id} (not on the model list)`, listed: false });
    else if (c.closed) out.set(id, { model: id, label: `${modelName(id)}, a closed model${c.maker ? ` by ${c.maker}` : ''}`, listed: true });
  }
  return [...out.values()];
}

/**
 * Why a design can't be a base yet, or null when it can. For the script that publishes the bases (call it before
 * writing) and for the bases read below. `allowed` is CHALLENGE.closedBasesAllowed.
 */
export function closedBaseRefusal(body: Pick<DesignBody, 'samples' | 'views'>, allowed: boolean = CHALLENGE.closedBasesAllowed): string | null {
  const found = closedModelsIn(body);
  const unlisted = found.filter((f) => !f.listed);
  if (unlisted.length) return `made with ${unlisted.map((f) => f.label).join(', ')}: add the model to config/models.json first`;
  if (found.length && !allowed) return `made with ${found.map((f) => f.label).join(', ')}: a closed-model base waits for CHALLENGE.closedBasesAllowed (the owner's reread of the Terms and Privacy lines)`;
  return null;
}

/**
 * Never published (owner, 2026-11-04): the 12 closed-model drafts in (docs/starting-sheet-drafts/bases.md, six
 * by GPT Image 2.5 Sunburst, six by Gemini 3.1 Flash Image). They were made before the retention settings and their recipes
 * don't record what was kept. Any closed picture that is published is made fresh. Each by its JPEG's sha256 and its
 * original PNG's.
 */
export const NEVER_PUBLISH: ReadonlySet<string> = new Set([
  '5326c6f92812ede7d9390081c912ad02e1dab7c78ecc4ca4a2a6a22a841dfd7c', // zei-front-closed-gpt.jpg (JPEG)
  '1a235785adfbc1e234b177691105e9b56018e129e2df71f9b7616ae9106c9693', // zei-front-closed-gpt.jpg (its original PNG)
  '7dc7aa1cae4afd268355f3616fcb28a076272b5a1bcbdae4119209797286abcb', // zei-front-closed-gemini.jpg (JPEG)
  'aa17a0891b8116a6a9bc20eaed724cebf45318d6ba5113e33ea79f495253a2f3', // zei-front-closed-gemini.jpg (its original PNG)
  '7389023180272730bbb222edcd80ff0e7bc4a4ea2ed19424c1b2b9603387f292', // bai-front-closed-gpt.jpg (JPEG)
  '84845c258d9da0c2fa2a22022f5aea13b15c0d23e09ef9ff76201ccaef9ab7f3', // bai-front-closed-gpt.jpg (its original PNG)
  'b31125e19632188b22b50fe066385bb2b600511ff70d4be80d019773f09c6f2e', // gladias-front-closed-gpt.jpg (JPEG)
  '2001370b67d55d8ef1720a5dd8eba5b13dec05e3fe1e0a63d6884c14574b45da', // gladias-front-closed-gpt.jpg (its original PNG)
  '13131b6ce1290e8c92ea938713cdfa8e2792fb6b80712ed87188ef58e485e712', // seila-front-closed-gpt.jpg (JPEG)
  '5adf331d6b64bc0921a1fb2a50053b011229c3aa947e483e760a41c1090d0301', // seila-front-closed-gpt.jpg (its original PNG)
  '2e71f7a4a14502579d31885d36018a7c7341f99aaf3add3fb443b9be5f45daa4', // deluin-front-closed-gpt.jpg (JPEG)
  '394ae7ab5a90f3b2c04b3a1feff712bda73bb68eaec29d52d75379f3010971de', // deluin-front-closed-gpt.jpg (its original PNG)
  'f775bda841d47148d812d2948f27285f0cf9e003efbfd87e5246970e8b0dcd33', // mu-front-closed-gpt.jpg (JPEG)
  '8ac20fdab9ec4f0b1ec92874055c40e1d8ac8987d168550e7971d079b6d30362', // mu-front-closed-gpt.jpg (its original PNG)
  '47a8b97f148da336c59ec0346350d21276efad14f1c25dd625136786c6858771', // bai-front-closed-gemini.jpg (JPEG)
  '5d6336e92082ee5ad0c3b24c8a2127588b5b5ecaa5d6122c42a429015d823b7d', // bai-front-closed-gemini.jpg (its original PNG)
  '00ff20dc61f7507183d567899efd2230c99543c41c7bdbf267a9abc796238cac', // gladias-front-closed-gemini.jpg (JPEG)
  '5f1b42785bcff19805a6fa3667a674f890a4a02de58337e9cd645d3eb173c712', // gladias-front-closed-gemini.jpg (its original PNG)
  '2eb6faaae99ed909c0b9d0434a8ff89c2dc349f64c3bb3dd7fb04e76897afce4', // seila-front-closed-gemini.jpg (JPEG)
  '0f17e4c2404117bc926b3874fb9bbbed9ab405c5e2e17d329e2e1714201f8739', // seila-front-closed-gemini.jpg (its original PNG)
  '0bc5c4c180b75a0be6b1b53e7ce50ee7d5cb49a934f85cb2f485036b35b89f66', // deluin-front-closed-gemini.jpg (JPEG)
  '8025ea7ff48c717a2670f70068ab14d34a0118c7dbe5935e9ea92f4a46dffe0a', // deluin-front-closed-gemini.jpg (its original PNG)
  '65ac87f48924d56136d46a89a109ecf8b77fb95157faedc6a4db65d0ebd46e56', // mu-front-closed-gemini.jpg (JPEG)
  'a1f47383f501dde62d8dc8b884b282c1de65adad627d6871a83dffb669ccdabb', // mu-front-closed-gemini.jpg (its original PNG)
]);

/** Why a design's pictures can't be published, if any is on NEVER_PUBLISH (its sha256, or the original's in its recipe). */
export function neverPublishRefusal(body: Pick<DesignBody, 'samples' | 'views'>): string | null {
  const pics: DesignPicture[] = [...(body.samples ?? []), ...(['front', 'side', 'back'] as const).flatMap((k) => (body.views?.[k] ? [body.views[k]!] : []))];
  for (const p of pics) {
    const orig = (p.recipe?.settings as { converted?: { sha256?: string } } | undefined)?.converted?.sha256;
    const hit = [p.sha256, orig].find((s) => s && NEVER_PUBLISH.has(s));
    if (hit) return `a picture (sha256 ${hit}) is one of the 12 closed drafts in docs/starting-sheet-drafts/bases.md, which are never published (the owner's decision)`;
  }
  return null;
}

/**
 * Why a style can't be published yet, or null when it can (owner, 2026-11-04: closed styles' samples are gated like
 * bases). A style whose samples name a closed model waits for the same switch, CHALLENGE.closedBasesAllowed, which waits
 * for the owner's reread of the lines naming the providers ("the remix challenge's bases, styles and references"). For
 * the script that publishes styles (scripts/seed-designs.ts): call it before writing.
 */
export function closedStyleRefusal(body: Pick<DesignBody, 'samples'>, allowed: boolean = CHALLENGE.closedBasesAllowed): string | null {
  const found = closedModelsIn({ samples: body.samples ?? [], views: {} });
  const unlisted = found.filter((f) => !f.listed);
  if (unlisted.length) return `samples made with ${unlisted.map((f) => f.label).join(', ')}: add the model to config/models.json first`;
  if (found.length && !allowed) return `samples made with ${found.map((f) => f.label).join(', ')}: a closed-model style waits for CHALLENGE.closedBasesAllowed (the owner's reread of the Terms and Privacy lines)`;
  return null;
}

/**
 * The configured bases (CHALLENGE.bases) that are refused, with why: each base id read from the database (an element
 * id: every version of it; a version id: that version) and checked with closedBaseRefusal. Read-only. An id that is no
 * published sheet isn't listed here (startingSheets leaves it out). Empty while no bases are picked.
 */
export async function refusedBases(sql: Sql, bases: Record<string, readonly string[]> = CHALLENGE.bases, allowed: boolean = CHALLENGE.closedBasesAllowed): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(Object.keys(bases).flatMap((c) => basesOf(c, bases)))];
  if (!ids.length) return out;
  const rows = await sql`
    select e.id::text as element_id, v.id::text as version_id, v.body from studio.elements e
    join studio.element_versions v on v.element_id = e.id
    where e.element_type = 'design' and e.work_id = ${WORK_ID} and (e.id::text in ${sql(ids)} or v.id::text in ${sql(ids)})`;
  for (const r of rows) {
    const why = closedBaseRefusal((r.body ?? {}) as DesignBody, allowed);
    if (!why) continue;
    for (const id of [String(r.element_id), String(r.version_id)]) if (ids.includes(id) && !out.has(id)) out.set(id, why);
  }
  return out;
}
