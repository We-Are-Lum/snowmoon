/**
 * Checks for docs/principles.md. Each automated check is proven to fail on a
 * planted violation: for every check, a copy of its inputs gets one violation
 * injected, and the check must report it.
 *
 *   npm run check:principles                       checks + proofs, against https://snowmoon.party
 *   npm run check:principles -- --url=http://localhost:3000
 *   npm run check:principles -- --only=P6          one principle
 *
 * Exit 1 if any check fails or any proof does not fail. Database checks use an
 * in-memory Postgres (PGlite) with the migrations, plus the live database
 * (read-only) when STUDIO_DATABASE_URL is set. Page checks fetch the deployed
 * site; the third-party request check drives the local Chrome.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { chromium } from 'playwright-core';
import { DEFAULT_TEMPLATES } from '../src/templates';

const ROOT = path.resolve(import.meta.dirname, '..');
const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'https://snowmoon.party').replace(/\/$/, '');
const ONLY = arg('only');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const json = <T = any>(rel: string): T => JSON.parse(read(rel)); // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T>(v: T): T => structuredClone(v);
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const walk = (dir: string, re: RegExp): string[] =>
  existsSync(path.join(ROOT, dir))
    ? readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: false })
        .map(String)
        .filter((f) => re.test(f))
        .map((f) => path.join(dir, f))
    : [];

interface Check<C> {
  id: string;
  principle: number;
  name: string;
  load: () => Promise<C>;
  run: (c: C) => Promise<string[]> | string[];
  /** Inject one violation into a copy of the inputs; run() must then report it. */
  plant: (c: C) => void;
}
const checks: Check<any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
const add = <C>(c: Check<C>) => checks.push(c);

// Shared, loaded once.
const pageCache = new Map<string, string>();
async function page(p: string): Promise<string> {
  if (!pageCache.has(p)) {
    const r = await fetch(BASE + p, { headers: { 'cache-control': 'no-cache' } });
    pageCache.set(p, r.ok ? await r.text() : `HTTP ${r.status}`);
  }
  return pageCache.get(p)!;
}
async function pglite(extraSql = ''): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(read(`supabase/migrations/${f}`));
  }
  if (extraSql) await db.exec(extraSql);
  return db;
}

// ---------------------------------------------------------------------------
// P1. Every published generated asset has a public recipe.
// ---------------------------------------------------------------------------
add({
  id: 'P1a',
  principle: 1,
  name: 'every published image matches a committed recipe (and lettered ones a lettering record)',
  load: async () => {
    const recipes: Record<string, string[]> = {};
    for (const f of walk('content/snowmoon/recipes/images', /chapter-\d+\.json$/)) {
      recipes[f] = json(f).images.map((i: { sha256: string }) => i.sha256);
    }
    return { published: json('content/snowmoon/illustrations/published.json').images, recipes, lettering: json('content/snowmoon/recipes/images/lettering.json').images };
  },
  run: ({ published, recipes, lettering }) => {
    const problems: string[] = [];
    for (const im of published) {
      const clean = im.clean?.png_sha256 ?? im.png_sha256;
      if (!recipes[im.recipe]?.includes(clean)) problems.push(`${im.id}: no recipe in ${im.recipe} for the render ${clean.slice(0, 12)}`);
      if (im.lettered) {
        const r = lettering.find((x: { id: string }) => x.id === im.id);
        if (!r || r.input.sha256 !== clean || r.output.sha256 !== im.lettered.png_sha256) problems.push(`${im.id}: lettered file has no matching lettering record`);
      }
    }
    return problems;
  },
  plant: (c) => {
    c.published[0].png_sha256 = '0'.repeat(64);
    if (c.published[0].clean) c.published[0].clean.png_sha256 = '0'.repeat(64);
  },
});
add({
  id: 'P1b',
  principle: 1,
  name: 'every published narration file matches its committed recipe',
  load: async () => {
    const out: { chapter: number; index: any; recipe: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let n = 1; n <= 32; n++) {
      out.push({ chapter: n, index: json(`content/snowmoon/narration/kokoro-af_heart/chapter-${n}.json`), recipe: json(`content/snowmoon/recipes/narration/chapter-${n}.json`) });
    }
    return out;
  },
  run: (chs) => {
    const problems: string[] = [];
    for (const { chapter, index, recipe } of chs) {
      if (index.chapter_file.sha256 !== recipe.stitched.m4a_sha256) problems.push(`chapter ${chapter}: stitched file not in its recipe`);
      const wavs = new Set(recipe.blocks.map((b: { sha256?: string }) => b.sha256));
      for (const s of index.segments) if (!wavs.has(s.source_wav_sha256)) problems.push(`chapter ${chapter} b${s.idx}: no recipe block for its audio`);
    }
    return problems;
  },
  plant: (chs) => {
    chs[0].recipe.blocks = chs[0].recipe.blocks.filter((b: { idx: number }) => b.idx !== chs[0].index.segments[0].idx);
  },
});
add({
  id: 'P1c',
  principle: 1,
  name: 'in the database, every version of a published element has a recipe',
  load: async () => {
    const url = process.env.STUDIO_DATABASE_URL;
    if (!url) return { rows: [] as { id: string; recipe_id: string | null }[], skipped: true };
    const sql = postgres(url, { prepare: false, max: 1 });
    const rows = await sql<{ id: string; recipe_id: string | null }[]>`
      select v.id, v.recipe_id from studio.element_versions v join studio.elements e on e.id = v.element_id where e.status = 'published'`;
    await sql.end();
    return { rows: [...rows], skipped: false };
  },
  run: ({ rows, skipped }) =>
    skipped ? ['skipped: STUDIO_DATABASE_URL not set'] : rows.filter((r: { recipe_id: string | null }) => !r.recipe_id).map((r: { id: string }) => `version ${r.id} has no recipe`),
  plant: (c) => {
    c.skipped = false;
    c.rows.push({ id: 'planted', recipe_id: null });
  },
});

// ---------------------------------------------------------------------------
// P2. AI use declared on every element; the book's text never altered; nothing
//     generated presented as the author's.
// ---------------------------------------------------------------------------
add({
  id: 'P2a',
  principle: 2,
  name: "the book's text is unaltered (every block's sha256 is the hash of its content)",
  load: async () => Array.from({ length: 32 }, (_, i) => json(`content/snowmoon/text/chapter-${i + 1}.json`)),
  run: (chs) =>
    chs.flatMap((c: { chapter: number; blocks: { idx: number; content: string; sha256: string }[] }) =>
      c.blocks.filter((b) => sha256(b.content) !== b.sha256).map((b) => `chapter ${c.chapter} b${b.idx}: text differs from its recorded hash`),
    ),
  plant: (chs) => {
    chs[0].blocks[2].content += ' (edited)';
  },
});
const AI_LABEL = /\bAI[- ]generated\b/i;
add({
  id: 'P2b',
  principle: 2,
  name: 'generated images and narration carry an AI declaration where they are shown',
  load: async () => ({ ch1: await page('/chapter/1'), card: read('src/app/api/card/[n]/[range]/route.tsx') }),
  run: ({ ch1, card }) => {
    const problems: string[] = [];
    const figures = [...ch1.matchAll(/<figure class="seed-image"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
    if (!figures.length) problems.push('chapter 1: no seeded images found to check');
    for (const f of figures) if (!AI_LABEL.test(f.replace(/<[^>]+>/g, ' '))) problems.push(`chapter 1 image caption lacks "AI-generated": ${f.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 70)}`);
    if (!/Synthetic narration/.test(ch1)) problems.push('chapter 1: the player does not say the narration is synthetic');
    if (!AI_LABEL.test(card)) problems.push('quote cards with an image do not label the image as AI-generated');
    return problems;
  },
  plant: (c) => {
    c.ch1 = c.ch1.replace(/Synthetic narration/g, 'Narration');
    c.card = c.card.replace(/AI[- ]generated/gi, 'picture');
  },
});

// ---------------------------------------------------------------------------
// P3. The allowlist records each model's license and whether its weights are
//     open; every model in use is on it; closed models in use are reported.
// ---------------------------------------------------------------------------
add({
  id: 'P3a',
  principle: 3,
  name: 'every allowlisted model records its license line and open_weights',
  load: async () => json('config/models.json').models,
  run: (models) =>
    models.flatMap((m: { id: string; license_line?: string; open_weights?: unknown }) => [
      ...(m.license_line ? [] : [`${m.id}: no license_line`]),
      ...(typeof m.open_weights === 'boolean' ? [] : [`${m.id}: open_weights is not recorded`]),
    ]),
  plant: (models) => {
    delete models[0].license_line;
  },
});
add({
  id: 'P3b',
  principle: 3,
  name: 'every model named in a recipe is on the allowlist; closed ones are reported',
  load: async () => {
    const used = new Map<string, string>();
    for (const f of walk('content/snowmoon/recipes/narration', /\.json$/)) used.set(json(f).model.repo, f);
    for (const f of walk('content/snowmoon/recipes/images', /chapter-\d+\.json$|cast|locations|test|style/)) {
      const m = json(f).model;
      if (m?.repo) used.set(m.repo, f);
    }
    return { models: json('config/models.json').models, used: [...used.entries()] };
  },
  run: ({ models, used }) => {
    const problems: string[] = [];
    for (const [repo, file] of used) {
      const m = models.find((x: { repo: string }) => x.repo === repo);
      if (!m) problems.push(`${repo} (used in ${file}) is not on the allowlist`);
      else if (m.open_weights === false) console.log(`  note: closed model in use: ${repo}`);
    }
    return problems;
  },
  plant: (c) => {
    c.used.push(['example/closed-model', 'planted']);
  },
});

// ---------------------------------------------------------------------------
// P4. No model output is published without a signed-in person's action.
// ---------------------------------------------------------------------------
add({
  id: 'P4a',
  principle: 4,
  name: 'every write API route requires a signed-in FID',
  load: async () => walk('src/app/api', /route\.tsx?$/).map((f) => ({ file: f, src: read(f) })),
  run: (routes) =>
    routes
      .filter((r: { src: string }) => /export async function (POST|PUT|PATCH|DELETE)\b/.test(r.src))
      .filter((r: { src: string }) => !(/getFid\(/.test(r.src) && /status: 401/.test(r.src)))
      .map((r: { file: string }) => `${r.file}: writes without requiring sign-in`),
  plant: (routes) => {
    routes.push({ file: 'src/app/api/planted/route.ts', src: 'export async function POST() { return new Response("ok"); }' });
  },
});
add({
  id: 'P4b',
  principle: 4,
  name: 'published generated assets record whose action published them',
  load: async () => ({
    images: json('content/snowmoon/illustrations/published.json'),
    narration: Array.from({ length: 32 }, (_, i) => json(`content/snowmoon/narration/kokoro-af_heart/chapter-${i + 1}.json`)),
  }),
  run: ({ images, narration }) => {
    const ok = (p: unknown) => !!p && typeof (p as { fid?: unknown }).fid === 'number' && !!(p as { action?: string }).action;
    const problems: string[] = [];
    if (!ok(images.published_by)) problems.push('illustrations/published.json: no published_by { fid, action }');
    const missing = narration.filter((x: { published_by?: unknown }) => !ok(x.published_by)).length;
    if (missing) problems.push(`narration: ${missing} of 32 chapter indexes have no published_by { fid, action }`);
    return problems;
  },
  plant: (c) => {
    delete c.images.published_by;
  },
});

// ---------------------------------------------------------------------------
// P5. Nothing is marked canon, official, or featured. Moderators can only hide.
// ---------------------------------------------------------------------------
const MARK = /\b(canon|canonical|official|featured|pinned|editor'?s pick|staff pick)\b/i;
// Sentences that deny a mark are allowed ("not canon", "Nothing in this edition is official").
const DENIAL = /\b(not|no|never|nothing|isn't|aren't|without)\b[^.]{0,60}\b(canon|canonical|official|featured)\b|\b(canon|official)\b[^.]{0,20}\b(not|never)\b/i;
add({
  id: 'P5a',
  principle: 5,
  name: 'no schema field and no UI text marks anything canon, official, or featured',
  load: async () => ({
    sql: walk('supabase/migrations', /\.sql$/).map((f) => ({ file: f, text: read(f) })),
    ui: walk('src', /\.tsx?$/).map((f) => ({ file: f, text: read(f) })),
  }),
  run: ({ sql, ui }) => {
    const problems: string[] = [];
    for (const { file, text } of sql) {
      for (const line of text.split('\n')) {
        const code = line.replace(/--.*$/, '');
        if (MARK.test(code)) problems.push(`${file}: ${code.trim().slice(0, 80)}`);
      }
    }
    for (const { file, text } of ui) {
      // UI-visible strings: JSX text and string literals.
      for (const m of text.matchAll(/(?:>([^<>{}]{3,})<|'([^'\n]{3,})'|"([^"\n]{3,})"|`([^`]{3,})`)/g)) {
        const s = m[1] ?? m[2] ?? m[3] ?? m[4];
        if (MARK.test(s) && !DENIAL.test(s)) problems.push(`${file}: "${s.trim().slice(0, 80)}"`);
      }
    }
    return problems;
  },
  plant: (c) => {
    c.sql.push({ file: 'planted.sql', text: 'alter table studio.elements add column featured boolean;' });
  },
});
add({
  id: 'P5b',
  principle: 5,
  name: 'moderator powers only hide',
  load: async () => walk('src', /\.tsx?$/).map((f) => ({ file: f, text: read(f) })),
  run: (files) =>
    files
      .filter((f: { file: string; text: string }) => /MODERATOR_FIDS/.test(f.text) && !f.file.endsWith('config.ts'))
      .filter((f: { text: string }) => /status\s*[:=]\s*['"](published|draft)['"]|set\s+status\s*=\s*'(published|draft)'|order by|\.sort\(/i.test(f.text))
      .map((f: { file: string }) => `${f.file}: moderator code does more than hide`),
  plant: (files) => {
    files.push({ file: 'src/planted.ts', text: "if (MODERATOR_FIDS.includes(fid)) await sql`update studio.elements set status = 'published'`" });
  },
});

// ---------------------------------------------------------------------------
// P6. No third-party requests; individual ratings not publicly readable.
// ---------------------------------------------------------------------------
const PAGES = ['/', '/chapter/1', '/chapter/30', '/about', '/cards', '/adaptations', '/adaptations/dog-dawn', '/share/1/4?img=c1-b005-toy-drone'];
add({
  id: 'P6a',
  principle: 6,
  name: 'production pages make no third-party requests',
  load: async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    const seen: { page: string; host: string }[] = [];
    for (const p of PAGES) {
      const tab = await browser.newPage({ viewport: { width: 390, height: 844 } });
      tab.on('request', (r) => seen.push({ page: p, host: new URL(r.url()).host }));
      await tab.goto(BASE + p, { waitUntil: 'networkidle' });
      await tab.mouse.wheel(0, 20000);
      await tab.waitForTimeout(1200);
      await tab.close();
    }
    await browser.close();
    return seen;
  },
  run: (seen) => {
    const site = new URL(BASE).hostname.replace(/^www\./, '');
    const firstParty = (h: string) => {
      const host = h.split(':')[0];
      return host === site || host.endsWith(`.${site}`) || host === 'localhost' || host === '127.0.0.1';
    };
    return [...new Set(seen.filter((s: { host: string }) => !firstParty(s.host)).map((s: { page: string; host: string }) => `${s.host} (from ${s.page})`))];
  },
  plant: (seen) => {
    seen.push({ page: '/chapter/1', host: 'fonts.googleapis.com' });
  },
});
const PRIVATE_FID_TABLES = ['ratings', 'picks', 'contributor_consents'];
add({
  id: 'P6b',
  principle: 6,
  name: 'individual ratings (and other per-person rows) are not publicly readable',
  load: async () => ({ extra: '' }),
  run: async ({ extra }) => {
    const db = await pglite(extra);
    await db.exec(`
      insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x');
      insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-00000000e001','snowmoon','character','x');
      insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id) values
        ('00000000-0000-0000-0000-0000000000b1','snowmoon','design',1,'00000000-0000-0000-0000-00000000e001');
      insert into studio.element_versions (id, element_id, version_no) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1',1);
      insert into studio.ratings (version_id, fid, value) values ('00000000-0000-0000-0000-0000000000f1', 42, 3);
      insert into studio.picks (fid, entity_id, version_id) values (42,'00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000f1');
      insert into studio.contributor_consents (fid, kind, consent_text_sha256) values (42,'handmade_upload','${'a'.repeat(64)}');`);
    const problems: string[] = [];
    for (const role of ['anon', 'authenticated']) {
      for (const t of PRIVATE_FID_TABLES) {
        await db.exec(`set role ${role}`);
        try {
          const r = await db.query<{ n: number }>(`select count(*)::int as n from studio.${t} where fid = 42`);
          if (r.rows[0].n > 0) problems.push(`${role} can read individual rows of studio.${t}`);
        } catch {
          // permission denied: private, as intended
        }
        await db.exec('reset role');
      }
    }
    await db.close();
    return problems;
  },
  plant: (c) => {
    c.extra = `grant select on studio.picks to anon; create policy planted on studio.picks for select using (true);`;
  },
});

// ---------------------------------------------------------------------------
// P7. Payments never enter scoring or ordering. No token. "Not affiliated" on
//     the first screen.
// ---------------------------------------------------------------------------
const PAYMENT = /\b(donations?|credit_grants?|funded_by_grant_id|amount|usd_at_time|cost_usd|sponsor)/i;
add({
  id: 'P7a',
  principle: 7,
  name: 'no scoring or ordering code reads payments',
  load: async () => walk('src', /\.tsx?$/).map((f) => ({ file: f, text: read(f) })),
  run: (files) => {
    const problems: string[] = [];
    for (const { file, text } of files) {
      for (const m of text.matchAll(/order by[^`'"]{0,200}|\.sort\([^)]{0,200}\)|score[^\n]{0,120}/gi)) {
        if (PAYMENT.test(m[0])) problems.push(`${file}: ordering or scoring uses payments: ${m[0].slice(0, 80)}`);
      }
    }
    return problems;
  },
  plant: (files) => {
    files.push({ file: 'src/planted.ts', text: 'select * from cards order by d.amount desc' });
  },
});
add({
  id: 'P7b',
  principle: 7,
  name: 'the first screen says "not affiliated" and "no token"; there is no token code',
  load: async () => ({
    home: await page('/'),
    code: [...walk('src', /\.tsx?$/), ...walk('supabase/migrations', /\.sql$/), ...walk('scripts', /\.(ts|py)$/)]
      .filter((f) => !f.endsWith('check-principles.ts'))
      .map((f) => ({ file: f, text: read(f) })),
  }),
  run: ({ home, code }) => {
    const problems: string[] = [];
    const firstScreen = home.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
    if (!/not affiliated with the author/i.test(firstScreen)) problems.push('first screen: "not affiliated with the author" is missing');
    if (!/There is no token/i.test(firstScreen)) problems.push('first screen: "There is no token" is missing');
    for (const { file, text } of code) if (/\b(erc-?20|erc-?721|tokenomics|airdrop|token sale|mint\s*\()/i.test(text)) problems.push(`${file}: token code`);
    return problems;
  },
  plant: (c) => {
    c.home = c.home.replace(/not affiliated with the author/gi, 'a fan edition');
  },
});

// ---------------------------------------------------------------------------
// P8. Dzegoban, Minpentai, and in-world screens match the source.
// ---------------------------------------------------------------------------
add({
  id: 'P8a',
  principle: 8,
  name: 'templated screens show every word of the source screen',
  load: async () => {
    const blocks: { chapter: number; idx: number; block: any; html: string }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let n = 1; n <= 32; n++) {
      for (const b of json(`content/snowmoon/text/chapter-${n}.json`).blocks) {
        const t = DEFAULT_TEMPLATES.find((t) => (b.kind === 'screen' || b.kind === 'figure') && t.matches(b));
        if (t) blocks.push({ chapter: n, idx: b.idx, block: b, html: t.render(b) });
      }
    }
    return blocks;
  },
  run: (blocks) => {
    const problems: string[] = [];
    const words = (s: string) => (s.match(/[A-Za-z0-9#.%:-]+/g) ?? []).map((w) => w.toLowerCase());
    for (const { chapter, idx, block, html } of blocks) {
      const shown = new Set(words(html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')));
      const source = words(block.content.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '));
      const missing = [...new Set(source)].filter((w) => !shown.has(w));
      if (missing.length) problems.push(`chapter ${chapter} b${idx}: template drops ${missing.slice(0, 5).join(', ')}`);
    }
    if (!blocks.length) problems.push('no templated screens found');
    return problems;
  },
  plant: (blocks) => {
    blocks[0].html = blocks[0].html.replace(/Badra/g, 'Bodra');
  },
});
add({
  id: 'P8b',
  principle: 8,
  name: 'Dzegoban lettering on images uses the words of the source',
  load: async () => {
    const items: { id: string; chapter: number; text: string }[] = [];
    for (const f of walk('content/snowmoon/illustrations', /chapter-\d+\.json$/)) {
      for (const j of json(f).jobs) for (const l of j.lettering ?? []) if (l.lang === 'dz') items.push({ id: j.id, chapter: j.chapter, text: l.text });
    }
    const dz: Record<number, string> = {};
    for (const n of new Set(items.map((i) => i.chapter))) {
      dz[n] = json(`content/snowmoon/text/chapter-${n}.json`)
        .blocks.map((b: { content: string }) => b.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '))
        .join(' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
    }
    return { items, dz };
  },
  run: ({ items, dz }) =>
    items.flatMap((i: { id: string; chapter: number; text: string }) =>
      i.text
        .split('\n')
        .filter((l) => l.trim())
        .filter((l) => !dz[i.chapter].includes(l.trim().toLowerCase().replace(/\s+/g, ' ')))
        .map((l) => `${i.id}: "${l.trim()}" is not in chapter ${i.chapter}'s Dzegoban`),
    ),
  plant: (c) => {
    c.items[0].text = c.items[0].text.replace('pa jan', 'pa jen');
  },
});

// ---------------------------------------------------------------------------

const selected = checks.filter((c) => !ONLY || c.id.startsWith(ONLY));
let failed = 0;
let unproven = 0;
console.log(`principles: ${selected.length} automated checks against ${BASE}\n`);
for (const c of selected) {
  let inputs: unknown;
  try {
    inputs = await c.load();
  } catch (e) {
    console.log(`FAIL ${c.id} ${c.name}\n  could not load: ${(e as Error).message}`);
    failed++;
    continue;
  }
  const problems = await c.run(inputs);
  const skipped = problems.length === 1 && problems[0].startsWith('skipped');
  if (skipped) console.log(`skip ${c.id} ${c.name}: ${problems[0]}`);
  else if (problems.length) {
    failed++;
    console.log(`FAIL ${c.id} ${c.name}`);
    for (const p of problems.slice(0, 8)) console.log(`  - ${p}`);
    if (problems.length > 8) console.log(`  … and ${problems.length - 8} more`);
  } else console.log(`ok   ${c.id} ${c.name}`);

  const planted = clone(inputs);
  c.plant(planted);
  const caught = (await c.run(planted)).filter((p) => !p.startsWith('skipped'));
  if (!caught.length) {
    unproven++;
    console.log(`  PROOF FAILED: a planted violation was not caught by ${c.id}`);
  }
}
console.log(`\n${selected.length - failed} of ${selected.length} pass; ${selected.length - unproven} of ${selected.length} proven to fail on a planted violation`);
process.exit(failed || unproven ? 1 : 0);
