/**
 * The owner's model comparison (2026-10-08): after the first three readers' images, run the same
 * three exact prompts through FLUX.2 [klein] 4B text-to-image on fal.ai and show both side by
 * side. Cap: $0.10 (refuses to start if the worst case is over). Nothing is published: the
 * results and their recipe stay in the output folder, for the owner to look at.
 *
 *   npx tsx --env-file=.env.local scripts/compare-image-models.ts --out=<folder>
 *
 * Needs STUDIO_DATABASE_URL (to read the three published prompts) and FAL_KEY.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = path.resolve(arg('out') ?? 'compare-out');
const CAP_USD = 0.1;
const ENDPOINT = 'fal-ai/flux-2/klein/4b';
const PRICE_PER_MP = 0.005; // fal's page, 2026-10-08
const W = 1024, H = 576;

const key = process.env.FAL_KEY;
if (!key || !process.env.STUDIO_DATABASE_URL) throw new Error('needs FAL_KEY and STUDIO_DATABASE_URL');
const worst = 3 * Math.max(1, (W * H) / 1e6) * PRICE_PER_MP;
if (worst > CAP_USD) throw new Error(`worst case $${worst.toFixed(4)} is over the $${CAP_USD} cap`);

const sql = postgres(process.env.STUDIO_DATABASE_URL, { prepare: false, max: 1 });
const rows = await sql<{ id: string; prompt: string; asset_url: string; seed: number | null }[]>`
  select v.id, r.prompt, v.asset_url, r.seed from studio.elements e
  join studio.element_versions v on v.element_id = e.id join studio.recipes r on r.id = v.recipe_id
  where e.element_type = 'image' and r.source = 'in_app' and e.status = 'published'
  order by e.created_at asc limit 3`;
await sql.end();
if (rows.length < 3) throw new Error(`only ${rows.length} readers' images are published; the comparison waits for three`);

mkdirSync(OUT, { recursive: true });
const recipe: Record<string, unknown>[] = [];
let spent = 0;
const pairs: Buffer[] = [];
for (const r of rows) {
  const settings = { image_size: { width: W, height: H }, num_images: 1, enable_safety_checker: true, output_format: 'jpeg', sync_mode: true };
  const res = await fetch(`https://fal.run/${ENDPOINT}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', 'X-Fal-Store-IO': '0' },
    body: JSON.stringify({ prompt: r.prompt, ...settings }),
  });
  if (!res.ok) throw new Error(`fal.ai ${res.status}`);
  const j = (await res.json()) as { images?: { url?: string }[]; seed?: number; has_nsfw_concepts?: boolean[] };
  const cost = ((W * H) / 1e6) * PRICE_PER_MP;
  spent += cost;
  const m = j.images?.[0]?.url?.match(/^data:[^;]+;base64,(.+)$/);
  if (!m || j.has_nsfw_concepts?.[0]) {
    recipe.push({ of: r.id, endpoint: ENDPOINT, prompt: r.prompt, settings, result: 'flagged or missing' });
    continue;
  }
  const klein = Buffer.from(m[1], 'base64');
  writeFileSync(path.join(OUT, `${r.id}-klein.jpg`), klein);
  const zimage = Buffer.from(await (await fetch(r.asset_url)).arrayBuffer());
  pairs.push(await sharp({ create: { width: W * 2 + 16, height: H, channels: 3, background: '#F4F2ED' } })
    .composite([{ input: await sharp(zimage).resize(W, H).toBuffer(), left: 0, top: 0 }, { input: await sharp(klein).resize(W, H).toBuffer(), left: W + 16, top: 0 }])
    .jpeg({ quality: 88 }).toBuffer());
  recipe.push({ of: r.id, endpoint: ENDPOINT, model: 'FLUX.2 [klein] 4B (Apache-2.0)', prompt: r.prompt, settings, seed: j.seed ?? null, request_id: res.headers.get('x-fal-request-id'), cost_usd: Number(cost.toFixed(4)) });
}
const sheet = await sharp({ create: { width: W * 2 + 16, height: pairs.length * (H + 16), channels: 3, background: '#F4F2ED' } })
  .composite(pairs.map((p, i) => ({ input: p, left: 0, top: i * (H + 16) })))
  .jpeg({ quality: 88 }).toBuffer();
writeFileSync(path.join(OUT, 'side-by-side.jpg'), sheet);
writeFileSync(path.join(OUT, 'recipe.json'), JSON.stringify({ purpose: "owner's comparison, 2026-10-08: left Z-Image Turbo (published), right FLUX.2 [klein] 4B, same exact prompt", date: new Date().toISOString().slice(0, 10), cap_usd: CAP_USD, spent_usd: Number(spent.toFixed(4)), images: recipe }, null, 2));
console.log(`compared ${pairs.length} prompts; spent $${spent.toFixed(4)} (cap $${CAP_USD}); ${path.join(OUT, 'side-by-side.jpg')}`);
