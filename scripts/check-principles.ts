/**
 * Checks for docs/principles.md. Each automated check is proven to fail on a
 * planted violation: for every check, a copy of its inputs gets one violation
 * injected, and the check must report it.
 *
 *   npm run check:principles   (exit 0: all ran and passed; 1: a failure; 2: none failed but some did not run)                       checks + proofs, against https://snowmoon.party
 *   npm run check:principles -- --url=http://localhost:3000
 *   npm run check:principles -- --only=P6          one principle
 *
 * Exit 1 if any check fails or any proof does not fail. Database checks use an
 * in-memory Postgres (PGlite) with the migrations, plus the live database
 * (read-only) when STUDIO_DATABASE_URL is set. Page checks fetch the deployed
 * site; the third-party request check drives the local Chrome.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import { chromium } from 'playwright-core';
import { DEFAULT_TEMPLATES } from '../src/templates';
import { CHAT, IMAGES, REPO_URL } from '../src/lib/config';
import { NOTICE_REVIEW, currentNoticeItems, noticeKey } from '../src/lib/chat/notice';
import { LEARN_TEXT } from '../src/lib/minpentai/learn-text';
import { BOOK_TAG, NARRATION_MAX_WORDS, PERSON_TAG, parseBeats } from '../src/lib/script-beats';

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

// P1d-f: prompts are public, and people know their words will be (owner
// decision, Oct 5, 2026). A signed-out visitor must reach the exact prompt of
// every published generated asset: the page links the recipe, and the file at
// that link (fetched anonymously from the public repo) holds the prompt.
// Where "public" recipes are read from: GitHub main (the check of record, after a merge), or with
// --ref=local this checkout's files, so a branch can be checked before it is merged (owner, 2026-10-08).
const REF = arg('ref') ?? 'main';
const RAW = REPO_URL.replace('https://github.com/', 'https://raw.githubusercontent.com/') + `/${REF}/`;
const rawCache = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
async function rawJson(rel: string) {
  if (!rawCache.has(rel)) {
    if (REF === 'local') rawCache.set(rel, existsSync(path.join(ROOT, rel)) ? json(rel) : { http: 404 });
    else {
      const r = await fetch(RAW + rel);
      rawCache.set(rel, r.ok ? await r.json() : { http: r.status });
    }
  }
  return rawCache.get(rel);
}
const PAGE_CHAPTERS = [1, 30];
add({
  id: 'P1d',
  principle: 1,
  name: 'a signed-out visitor reaches the exact prompt of every published image and narration',
  load: async () => {
    const images = json('content/snowmoon/illustrations/published.json').images as {
      id: string; chapter: number; recipe: string; png_sha256?: string; clean?: { png_sha256: string }; lettered?: { record: string };
    }[];
    const narration = Array.from({ length: 32 }, (_, i) => json(`content/snowmoon/narration/kokoro-af_heart/chapter-${i + 1}.json`)) as {
      chapter: number; recipe: string; segments: { idx: number; text: string }[];
    }[];
    const files: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const rel of new Set([...images.flatMap((i) => [i.recipe, i.lettered?.record].filter(Boolean) as string[]), ...narration.map((n) => n.recipe)])) {
      files[rel] = clone(await rawJson(rel));
    }
    const pages: Record<number, string> = {};
    for (const n of PAGE_CHAPTERS) pages[n] = await page(`/chapter/${n}`);
    return { images, narration, files, pages };
  },
  run: ({ images, narration, files, pages }) => {
    const problems: string[] = [];
    const href = (rel: string) => `${REPO_URL}/blob/main/${rel}`;
    for (const im of images) {
      const f = files[im.recipe];
      if (!f || f.http) { problems.push(`${im.id}: recipe ${im.recipe} not public (HTTP ${f?.http})`); continue; }
      const want = im.clean?.png_sha256 ?? im.png_sha256;
      const entry = (f.images ?? []).find((e: { id: string; sha256: string }) => e.id === im.id && (!want || e.sha256 === want));
      if (!entry || !String(entry.prompt ?? '').trim()) problems.push(`${im.id}: no prompt for this render in the public recipe`);
      if (im.lettered) {
        const l = files[im.lettered.record];
        if (!l || l.http || !(l.images ?? []).some((e: { id: string }) => e.id === im.id)) problems.push(`${im.id}: lettering record not public`);
      }
      if (PAGE_CHAPTERS.includes(im.chapter)) {
        if (!pages[im.chapter].includes(href(im.recipe))) problems.push(`${im.id}: chapter ${im.chapter} page does not link its recipe`);
        if (im.lettered && !pages[im.chapter].includes(href(im.lettered.record))) problems.push(`${im.id}: chapter ${im.chapter} page does not link its lettering record`);
      }
    }
    for (const n of narration) {
      const f = files[n.recipe];
      if (!f || f.http) { problems.push(`narration ${n.chapter}: recipe not public (HTTP ${f?.http})`); continue; }
      const spoken = new Map((f.blocks ?? []).map((b: { idx: number; text: string }) => [b.idx, b.text]));
      const missing = n.segments.filter((s) => !String(spoken.get(s.idx) ?? '').trim() || spoken.get(s.idx) !== s.text);
      if (missing.length) problems.push(`narration ${n.chapter}: ${missing.length} segments have no matching spoken text in the public recipe`);
      if (PAGE_CHAPTERS.includes(n.chapter) && !pages[n.chapter].includes(href(n.recipe))) problems.push(`narration ${n.chapter}: the page does not link its recipe`);
    }
    return problems;
  },
  plant: (c) => {
    const first = c.images[0];
    c.files[first.recipe].images.find((e: { id: string }) => e.id === first.id).prompt = '';
    c.pages[1] = c.pages[1].split(`${REPO_URL}/blob/main/${c.narration[0].recipe}`).join('');
  },
});
add({
  id: 'P1e',
  principle: 1,
  name: 'live database: the public API serves the spoken text of the house narration',
  load: async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { skipped: true, segments: 0, prompts: [] as (string | null)[] };
    const get = async (q: string) =>
      (await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'studio' } })).json();
    const [house] = await get('house_narrations?select=narration_id&work_id=eq.snowmoon&chapter=eq.1');
    const segs = house ? await get(`narration_segments?select=recipe_id&narration_id=eq.${house.narration_id}&order=idx&limit=10`) : [];
    const ids = (segs as { recipe_id: string }[]).map((s) => s.recipe_id);
    const recipes = ids.length ? await get(`recipes?select=id,prompt&id=in.(${ids.join(',')})`) : [];
    return { skipped: false, segments: ids.length, prompts: ids.map((id) => (recipes as { id: string; prompt: string | null }[]).find((r) => r.id === id)?.prompt ?? null) };
  },
  run: ({ skipped, segments, prompts }) => {
    if (skipped) return ['skipped: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set'];
    if (!segments) return ['chapter 1 house narration segments are not publicly readable'];
    const hidden = prompts.filter((p) => !p?.trim()).length;
    return hidden ? [`${hidden} of ${segments} chapter 1 narration recipes are missing or private`] : [];
  },
  plant: (c) => {
    c.skipped = false;
    c.segments = Math.max(1, c.segments);
    c.prompts = [null];
  },
});
add({
  id: 'P1f',
  principle: 1,
  name: 'every text box whose contents may be published shows the publication line (PublishedTextField)',
  load: async () => walk('src', /\.tsx$/).map((f) => ({ file: f, text: read(f) })),
  run: (files) => {
    const problems: string[] = [];
    const line = json('config/consent.json');
    if (!line.versions?.[line.current]?.line) problems.push('config/consent.json: no current publication line');
    for (const { file, text } of files) {
      // The two components that may hold a text box: one shows the publication line, the
      // other (questions kept on the device, never published) says it is never published.
      if (file.endsWith('components/publish-words.tsx')) continue;
      // A report's note (readers' images, 2026-10-08): read only by moderators, never published, and it says so.
      if (file.endsWith('components/private-note-field.tsx')) {
        for (const [what, re] of [['private', /Private:/], ['read only by moderators', /only moderators read it/], ['never published', /Never published/], ['described to screen readers', /aria-describedby/]] as const)
          if (!re.test(text)) problems.push(`${file}: the note box must say it is ${what}`);
        if (/fetch\(|supabase|\/api\//.test(text)) problems.push(`${file}: the note box must not send its text anywhere itself`);
        continue;
      }
      if (file.endsWith('components/private-text-field.tsx')) {
        // Owner (2026-10-07): saved only on this device, sent to Vercel and Groq to be answered, never published; labelled draft.
        // 2026-10-08: Groq directly, the gateway only when Groq is busy, and both named while the fallback is on.
        // 2026-10-08 (docs/prompts/011-wording-decisions.md, row 29): the owner's own words, so tagged as theirs, not draft.
        for (const [what, re] of [
          ['saved only on this device', /Saved only on this device/],
          ['sent to the provider (CHAT.providerName) to be answered', /Sent to \{CHAT\.providerName\} to be answered/],
          ['naming the gateway while it is the fallback', /CHAT\.gatewayFallback \? ` \(through \$\{CHAT\.host\}/],
          ['never published', /Never published/],
          ['labelled draft, or marked as the owner\'s words', /as-draft|The owner's words \(FID 6786/],
          ['described to screen readers', /aria-describedby/],
        ] as const)
          if (!re.test(text)) problems.push(`${file}: the private box must say it is ${what}`);
        if (/fetch\(|supabase|\/api\//.test(text)) problems.push(`${file}: the private box must not send its text anywhere itself`);
        continue;
      }
      for (const m of text.matchAll(/<textarea\b|<input\b(?![^>]*type=["'](?:hidden|checkbox|radio|range|submit|button|file)["'])[^>]*>/g)) {
        problems.push(`${file}: a bare text box; use PublishedTextField so the publication line shows (${m[0].slice(0, 40)})`);
      }
    }
    return problems;
  },
  plant: (c) => {
    c.push({ file: 'src/app/planted/page.tsx', text: '<textarea name="prompt" />' });
  },
});

// Readers' images (slice 1, 2026-10-08): the exact prompt of every published one is on its page,
// readable signed out. Checked live: each image's page is fetched anonymously.
async function readerImages(status: 'published' | 'hidden') {
  const url = process.env.STUDIO_DATABASE_URL;
  if (!url) return null;
  const sql = postgres(url, { prepare: false, max: 1 });
  const rows = await sql<{ id: string; prompt: string | null; user_prompt: string | null; asset_url: string | null }[]>`
    select v.id, r.prompt, r.params->>'user_prompt' as user_prompt, v.asset_url
    from studio.elements e join studio.element_versions v on v.element_id = e.id left join studio.recipes r on r.id = v.recipe_id
    where e.element_type = 'image' and e.status = ${status} and r.source = 'in_app'`;
  await sql.end();
  return [...rows];
}
const htmlText = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
add({
  id: 'P1g',
  principle: 1,
  name: "a signed-out visitor reads the exact prompt of every reader's published image on its page",
  load: async () => {
    const rows = await readerImages('published');
    if (!rows) return { skipped: true, pages: [] as { id: string; prompt: string; html: string }[] };
    const pages = [];
    for (const r of rows) {
      const res = await fetch(`${BASE}/image/${r.id}`);
      pages.push({ id: r.id, prompt: r.prompt ?? '', html: res.ok ? await res.text() : '' });
    }
    return { skipped: false, pages };
  },
  run: ({ skipped, pages }) => {
    if (skipped) return ['skipped: STUDIO_DATABASE_URL not set'];
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    return (pages as { id: string; prompt: string; html: string }[])
      .filter((p) => !p.prompt || !htmlText(p.html).includes(norm(p.prompt)))
      .map((p) => `image ${p.id}: its page does not show the exact prompt to a signed-out visitor`);
  },
  plant: (c) => {
    c.skipped = false;
    c.pages.push({ id: 'planted', prompt: 'a prompt nobody can read', html: '<p>no prompt here</p>' });
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
  load: async () => ({
    ch1: await page('/chapter/1'),
    card: read('src/app/api/card/[n]/[range]/route.tsx'),
    // Readers' images: every place one is shown says AI-generated and not by the author.
    readers: ['src/components/reader-images.tsx', 'src/components/image-feed.tsx', 'src/app/image/[id]/page.tsx', 'src/app/api/image-card/[id]/route.tsx'].map((f) => ({ file: f, text: read(f) })),
  }),
  run: ({ ch1, card, readers }) => {
    const problems: string[] = [];
    for (const r of readers as { file: string; text: string }[]) {
      if (!AI_LABEL.test(r.text)) problems.push(`${r.file}: a reader's image is shown without "AI-generated"`);
      if (!/not by the author/i.test(r.text)) problems.push(`${r.file}: a reader's image is shown without "not by the author"`);
    }
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
    c.readers[0].text = c.readers[0].text.replace(/not by the author/gi, '');
  },
});

add({
  id: 'P2c',
  principle: 2,
  name: 'every narration and dialogue line in an adaptation script has a human author recorded',
  load: async () => ({
    scripts: walk('adaptations', /(^|\/)script\.md$/).map((f) => ({ file: f, text: read(f) })),
  }),
  run: ({ scripts }) => {
    const problems: string[] = [];
    for (const { file, text } of scripts) {
      for (const beat of parseBeats(text)) {
        for (const l of beat.inline) problems.push(`${file}:${l.line}: beat ${beat.n} ${l.field} written on the field line, with no author tag`);
        for (const l of [...beat.narration, ...beat.dialogue]) {
          const t = l.tag ?? '';
          if (!BOOK_TAG.test(t) && !PERSON_TAG.test(t))
            problems.push(`${file}:${l.line}: beat ${beat.n} line has no human author (\`book c<ch>-b<idx>\` or \`by FID <n> on <date>\`): ${l.text.slice(0, 60)}`);
        }
      }
    }
    return problems;
  },
  plant: (c) => {
    c.scripts.push({
      file: 'adaptations/planted/script.md',
      text: '## Beat 1 · Planted\n\n- **narration:**\n  - `new` A line a model wrote.\n- **dialogue:**\n  - Zei: An untagged line.\n',
    });
  },
});

// The recorded exception (owner ruling, Oct 5, 2026): 148 model-drafted spoken
// descriptions stay in the house narration, labelled. The list may only shrink.
const DESCRIPTION_EXCEPTIONS_MAX = 148;
const plainSpoken = (t: string) => t.replace(/\[([^\]]+)\]\(\/[^)]*\/\)/g, '$1');
add({
  id: 'P2d',
  principle: 2,
  name: 'spoken descriptions are written by a person or on the shrinking exception list',
  load: async () => ({
    exceptions: json('content/snowmoon/read-aloud/exceptions.json'),
    chapters: Array.from({ length: 32 }, (_, i) => json(`content/snowmoon/read-aloud/chapter-${i + 1}.json`)),
  }),
  run: ({ exceptions, chapters }) => {
    type Entry = { chapter: number; idx: number; read_aloud_sha256: string };
    type Override = { idx: number; read_aloud: string; written_by?: { fid?: unknown; date?: string } };
    const problems: string[] = [];
    const entries = exceptions.entries as Entry[];
    if (entries.length > DESCRIPTION_EXCEPTIONS_MAX)
      problems.push(`exceptions.json has ${entries.length} entries; the list may only shrink (max ${DESCRIPTION_EXCEPTIONS_MAX})`);
    const listed = new Map(entries.map((e) => [`${e.chapter}-${e.idx}`, e.read_aloud_sha256]));
    const used = new Set<string>();
    chapters.forEach((ch: { overrides: Override[] }, i: number) => {
      for (const o of ch.overrides) {
        const key = `${i + 1}-${o.idx}`;
        const by = o.written_by;
        if (by) {
          if (typeof by.fid !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(by.date ?? '')) problems.push(`c${key}: written_by needs { fid, date }`);
          const n = plainSpoken(o.read_aloud).split(/\s+/).filter(Boolean).length;
          if (n > NARRATION_MAX_WORDS) problems.push(`c${key}: person-written description is ${n} words (max ${NARRATION_MAX_WORDS})`);
          if (listed.has(key)) problems.push(`c${key}: written by a person; remove it from exceptions.json`);
        } else if (listed.get(key) !== sha256(o.read_aloud)) {
          problems.push(`c${key}: model-drafted description is not on the exception list (or its text changed)`);
        } else used.add(key);
      }
    });
    for (const key of listed.keys()) if (!used.has(key) && !problems.some((p) => p.startsWith(`c${key}:`))) problems.push(`exceptions.json lists c${key}, which no longer has a description; remove it`);
    return problems;
  },
  plant: (c) => {
    c.chapters[0].overrides.push({ idx: 9999, read_aloud: 'A new description a model drafted.' });
    c.exceptions.entries.push({ chapter: 1, idx: 9999, read_aloud_sha256: sha256('A new description a model drafted.') });
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
    // Hosted renders (adaptation trials and picks): every endpoint must belong to an allowlisted model.
    const endpoints = new Map<string, string>();
    for (const f of walk('adaptations', /(^|\/)recipe\.json$/)) {
      for (const im of (json(f).images ?? []) as { endpoint?: string }[]) if (im.endpoint) endpoints.set(im.endpoint, f);
    }
    // Readers' images (slice 1): the image model's endpoint and the prompt check, as configured.
    endpoints.set(IMAGES.model.endpoint, 'src/lib/config.ts IMAGES.model');
    endpoints.set(IMAGES.guardModel, 'src/lib/config.ts IMAGES.guardModel');
    return { models: json('config/models.json').models, used: [...used.entries()], endpoints: [...endpoints.entries()] };
  },
  run: ({ models, used, endpoints }) => {
    const problems: string[] = [];
    for (const [endpoint, file] of endpoints) {
      const m = models.find((x: { hosted?: { endpoints?: Record<string, number> } }) => x.hosted?.endpoints && endpoint in x.hosted.endpoints);
      if (!m) problems.push(`hosted endpoint ${endpoint} (used in ${file}) is not on the allowlist`);
    }
    for (const [repo, file] of used) {
      const m = models.find((x: { repo: string }) => x.repo === repo);
      if (!m) problems.push(`${repo} (used in ${file}) is not on the allowlist`);
      else if (m.open_weights === false) console.log(`  note: closed model in use: ${repo}`);
    }
    return problems;
  },
  plant: (c) => {
    c.used.push(['example/closed-model', 'planted']);
    c.endpoints.push(['fal-ai/not-allowlisted', 'planted']);
  },
});

add({
  id: 'P3c',
  principle: 3,
  name: 'every committed recipe file declares assist: which inputs a model drafted (null if none)',
  load: async () => ({
    models: json('config/models.json'),
    recipes: walk('content/snowmoon/recipes', /\.json$/).map((f) => ({ file: f, data: json(f) })),
  }),
  run: ({ models, recipes }) => {
    const drafting = new Set(((models.drafting ?? []) as { id: string }[]).map((m) => m.id));
    const problems: string[] = [];
    for (const { file, data } of recipes) {
      if (!('assist' in data)) problems.push(`${file}: no assist field`);
      else if (data.assist !== null && !drafting.has(data.assist.model)) problems.push(`${file}: assist.model ${data.assist.model} is not in config/models.json drafting`);
    }
    return problems;
  },
  plant: (c) => {
    delete c.recipes[0].data.assist;
  },
});

add({
  id: 'P3d',
  principle: 3,
  name: 'live database: house narration recipes declare assist (recipes.assist or recipe_assist)',
  load: async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const empty = { skipped: '', ids: [] as string[], withColumn: [] as string[], withSide: [] as string[] };
    if (!url || !key) return { ...empty, skipped: 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set' };
    const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'studio' };
    const get = async (q: string) => fetch(`${url}/rest/v1/${q}`, { headers });
    const side = await get('recipe_assist?select=recipe_id&limit=1');
    if (side.status === 404) return { ...empty, skipped: 'studio.recipe_assist does not exist yet (migration 0005 not applied)' };
    const [house] = await (await get('house_narrations?select=narration_id&work_id=eq.snowmoon&chapter=eq.1')).json();
    const segs = (await (await get(`narration_segments?select=recipe_id&narration_id=eq.${house.narration_id}`)).json()) as { recipe_id: string }[];
    const ids = segs.map((x) => x.recipe_id);
    const inList = `(${ids.join(',')})`;
    const recipes = (await (await get(`recipes?select=id,assist&id=in.${inList}`)).json()) as { id: string; assist: unknown }[];
    const sides = (await (await get(`recipe_assist?select=recipe_id&recipe_id=in.${inList}`)).json()) as { recipe_id: string }[];
    return { skipped: '', ids, withColumn: recipes.filter((r) => r.assist).map((r) => r.id), withSide: sides.map((r) => r.recipe_id) };
  },
  run: ({ skipped, ids, withColumn, withSide }) => {
    if (skipped) return [`skipped: ${skipped}`];
    const have = new Set([...withColumn, ...withSide]);
    const missing = ids.filter((id) => !have.has(id)).length;
    return missing ? [`${missing} of ${ids.length} chapter 1 narration recipes have no assist record (run scripts/backfill-recipe-assist.ts)`] : [];
  },
  plant: (c) => {
    c.skipped = '';
    c.ids = [...c.ids, '00000000-0000-0000-0000-00000000dead'];
  },
});

// ---------------------------------------------------------------------------
// P4. No model output is published without a signed-in person's action.
// ---------------------------------------------------------------------------
const P4A_EXEMPT = new Set(['src/app/api/auth/web/start/route.ts']);
add({
  id: 'P4a',
  principle: 4,
  name: 'every write API route requires a signed-in FID',
  load: async () => walk('src/app/api', /route\.tsx?$/).map((f) => ({ file: f, src: read(f) })),
  // Named exemption (owner instruction, 2026-10-08: website sign-in): the route that starts a sign-in
  // cannot require one. It writes nothing of ours; it opens a channel on Farcaster's relay.
  run: (routes) =>
    routes
      .filter((r: { file: string }) => !P4A_EXEMPT.has(r.file))
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
    // Allowed paths: an in-app action by a signed-in FID, or the maintainer
    // publishing via a script, with the date and an evidence file in the repo.
    type By = { fid?: unknown; action?: string; role?: string; script?: string; date?: string; evidence?: string };
    const ok = (p: By | undefined) => {
      if (!p || typeof p.fid !== 'number' || !p.action) return false;
      if (p.role !== 'maintainer') return true;
      return !!p.script && existsSync(p.script) && /^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '') && !!p.evidence && existsSync(p.evidence);
    };
    const problems: string[] = [];
    const want = '{ fid, action } (maintainer: + script, date, evidence file)';
    if (!ok(images.published_by)) problems.push(`illustrations/published.json: no valid published_by ${want}`);
    const missing = narration.filter((x: { published_by?: By }) => !ok(x.published_by)).length;
    if (missing) problems.push(`narration: ${missing} of 32 chapter indexes have no valid published_by ${want}`);
    return problems;
  },
  plant: (c) => {
    delete c.images.published_by;
    c.narration[0].published_by = { ...c.narration[0].published_by, evidence: 'docs/prompts/does-not-exist.md' };
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

// Hidden readers' images (decision 21): out of public reads, and their file gone from the public bucket.
add({
  id: 'P5c',
  principle: 5,
  name: "a hidden reader's image is gone from public pages and from the public bucket",
  load: async () => {
    const rows = await readerImages('hidden');
    if (!rows) return { skipped: true, items: [] as { id: string; page: number; file: number }[] };
    const items = [];
    for (const r of rows) {
      const page = (await fetch(`${BASE}/image/${r.id}`)).status;
      const file = r.asset_url ? (await fetch(r.asset_url, { method: 'HEAD' })).status : 404;
      items.push({ id: r.id, page, file });
    }
    return { skipped: false, items };
  },
  run: ({ skipped, items }) => {
    if (skipped) return ['skipped: STUDIO_DATABASE_URL not set'];
    return (items as { id: string; page: number; file: number }[]).flatMap((i) => [
      ...(i.page === 404 ? [] : [`hidden image ${i.id}: its page still answers (${i.page})`]),
      ...(i.file === 404 || i.file === 403 ? [] : [`hidden image ${i.id}: its file is still public (${i.file})`]),
    ]);
  },
  plant: (c) => {
    c.skipped = false;
    c.items.push({ id: 'planted', page: 200, file: 200 });
  },
});

// ---------------------------------------------------------------------------
// P6. No third-party requests; individual ratings not publicly readable.
// ---------------------------------------------------------------------------
const PAGES = ['/', '/chapter/1', '/chapter/30', '/about', '/cards', '/adaptations', '/adaptations/dog-dawn', '/share/1/4?img=c1-b005-toy-drone', '/images', '/moderate'];
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
const PRIVATE_FID_TABLES = ['ratings', 'likes', 'take_likes', 'picks', 'contributor_consents', 'image_asks', 'removal_log'];
add({
  id: 'P6b',
  principle: 6,
  name: 'migrations: individual ratings, likes and other per-person rows are not publicly readable',
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
      insert into studio.likes (version_id, fid) values ('00000000-0000-0000-0000-0000000000f1', 42);
      insert into studio.takes (id, work_id, chapter, title, created_by_fid) values ('00000000-0000-0000-0000-00000000aa01','snowmoon',1,'t',1);
      insert into studio.take_likes (take_id, fid) values ('00000000-0000-0000-0000-00000000aa01', 42);
      insert into studio.picks (fid, entity_id, version_id) values (42,'00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000f1');
      insert into studio.contributor_consents (fid, kind, consent_text_sha256) values (42,'handmade_upload','${'a'.repeat(64)}');
      insert into studio.image_asks (fid) values (42);
      insert into studio.removal_log (element_id, step, by_fid, role, reason) values ('00000000-0000-0000-0000-0000000000b1','reported',42,'reader','spam');`);
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

add({
  id: 'P6c',
  principle: 6,
  name: 'live database: the public API refuses individual ratings and likes, and serves totals',
  load: async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { skipped: true, results: [] as { table: string; status: number; body: string }[] };
    const results = [];
    for (const table of ['ratings', 'likes', 'take_likes', 'rating_totals', 'like_totals', 'take_like_totals']) {
      const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'studio' },
      });
      results.push({ table, status: r.status, body: (await r.text()).slice(0, 200) });
    }
    return { skipped: false, results };
  },
  run: ({ skipped, results }) => {
    if (skipped) return ['skipped: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set'];
    const problems: string[] = [];
    for (const r of results as { table: string; status: number; body: string }[]) {
      const isTotal = r.table.endsWith('_totals');
      if (isTotal && r.status !== 200) problems.push(`${r.table}: public cannot read totals (HTTP ${r.status})`);
      if (!isTotal && r.status === 200) problems.push(`${r.table}: public can read individual rows`);
    }
    return problems;
  },
  plant: (c) => {
    c.skipped = false;
    c.results = [{ table: 'likes', status: 200, body: '[]' }];
  },
});

// The app reaches the database only as studio_writer (STUDIO_DATABASE_URL).
// Keys that bypass row-level security, or connect as the database owner, must
// not sit on the Vercel project at all (owner decision, Oct 5, 2026).
const FORBIDDEN_VARS = /^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_JWT_SECRET|POSTGRES_[A-Z0-9_]*)$/;
add({
  id: 'P6d',
  principle: 6,
  name: 'the Vercel project holds no service-role or secret key, JWT secret or POSTGRES_* variable (names only)',
  load: async () => {
    // Names only: `vercel env ls` prints names and masks values; nothing else is read.
    try {
      const out = execFileSync('npx', ['-y', 'vercel', 'env', 'ls'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
      const names = [...out.matchAll(/^ ([A-Z][A-Z0-9_]*)\s/gm)].map((m) => m[1]);
      return { skipped: names.length ? '' : 'vercel env ls listed no variables (not linked or not signed in?)', names };
    } catch (e) {
      return { skipped: `vercel CLI unavailable: ${(e as Error).message.split('\n')[0]}`, names: [] as string[] };
    }
  },
  run: ({ skipped, names }) => {
    if (skipped) return [`skipped: ${skipped}`];
    return names.filter((n) => FORBIDDEN_VARS.test(n)).map((n) => n === 'SUPABASE_SECRET_KEY'
        ? `${n} is set on the Vercel project (accepted open item, owner 2026-10-08: left for now; see docs/principles.md §6)`
        : `${n} is set on the Vercel project; remove it (the app uses only STUDIO_DATABASE_URL)`);
  },
  plant: (c) => {
    c.skipped = '';
    c.names = [...c.names, 'POSTGRES_URL'];
  },
});

add({
  id: 'P6e',
  principle: 6,
  name: 'the assistant\'s notice ("What the assistant does") was reread after the last change to how the chat works',
  load: async () => {
    // Everything that decides where a question goes, what is kept and what the
    // assistant will do: the chat code and routes, its prompts, and its settings.
    const files = [
      ...readdirSync(path.join(ROOT, 'src/lib/chat')).filter((f) => f.endsWith('.ts') && f !== 'notice.ts').map((f) => `src/lib/chat/${f}`),
      ...readdirSync(path.join(ROOT, 'src/app/api/chat'), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts')).map((f) => `src/app/api/chat/${f}`),
      ...readdirSync(path.join(ROOT, 'config/prompts')).filter((f) => f.startsWith('chat-')).map((f) => `config/prompts/${f}`),
    ].sort();
    const parts = files.map((f) => `${f}\n${readFileSync(path.join(ROOT, f), 'utf8')}`);
    parts.push(`CHAT\n${JSON.stringify(CHAT)}`);
    return { parts, reviewedFor: NOTICE_REVIEW.reviewedFor };
  },
  run: ({ parts, reviewedFor }) => {
    const now = createHash('sha256').update(parts.join('\n\0\n')).digest('hex').slice(0, 16);
    return now === reviewedFor
      ? []
      : [
          `how the chat works changed since the notice was last reread. Reread noticeItems in src/lib/chat/notice.ts (and the chat lines on /about and in the private box), ` +
            `fix anything no longer true, then set NOTICE_REVIEW.reviewedFor to '${now}' and record who reread it`,
        ];
  },
  plant: (c) => {
    c.parts = [...c.parts.slice(0, -1), c.parts[c.parts.length - 1].replace('"gatewayFallback":true', '"gatewayFallback":false') + ' '];
  },
});

add({
  id: 'P6f',
  principle: 6,
  name: 'the assistant\'s notice shows words the owner (FID 6786) has reread',
  load: async () => ({ words: noticeKey(currentNoticeItems()), ownerReread: NOTICE_REVIEW.ownerReread }),
  run: ({ words, ownerReread }) => {
    if (!ownerReread) return [`the owner has not reread the notice's current words (key ${words}); after the owner rereads them, set NOTICE_REVIEW.ownerReread to { words: '${words}', on: <date> }`];
    if (ownerReread.words !== words)
      return [`the notice's words changed since the owner reread them on ${ownerReread.on}; an agent's reread is not enough. After the owner rereads them, set ownerReread.words to '${words}'`];
    return [];
  },
  plant: (c) => {
    c.ownerReread = { words: 'not-these-words', on: '2026-01-01' };
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

add({
  id: 'P8c',
  principle: 8,
  name: 'what Learn says about the book cites a real block, and its Dzegoban is the source\'s (its own game is not checked against the book)',
  load: async () => {
    const text: Record<number, Record<number, string>> = {};
    const plain = (c: string) => c.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
    for (let n = 1; n <= 32; n++) {
      text[n] = {};
      for (const b of json(`content/snowmoon/text/chapter-${n}.json`).blocks) text[n][b.idx] = plain(b.content);
    }
    // Statements about the book: every screen's sources, and the note that says the book's rule changes
    // every match. The Learn game's own rules (learn-game/*.ts) are invented for this edition and are
    // deliberately not compared with the book's rule (owner, 2026-10-09; P8d checks the label instead).
    const screens = [...LEARN_TEXT.watch, ...Object.values(LEARN_TEXT.lessons)]
      .map((s) => ({ title: s.title, tags: [...s.tags] as string[], sources: s.sources.map(([a, b]) => [a, b] as [string, string]) }));
    const sources = screens.flatMap((s) => s.sources.map(([what, where]) => ({ screen: s.title, what, where })));
    sources.push({ screen: 'the rules note', what: LEARN_TEXT.rulesNote.text, where: (LEARN_TEXT.rulesNote.text.match(/c\d+-b\d+(?:–b\d+)?/g) ?? []).join(' · ') });
    const files = Object.fromEntries(sources.filter((s) => /^(src|docs)\//.test(s.where)).map((s) => [s.where, existsSync(path.join(ROOT, s.where.split(' ')[0]))]));
    const countdown = { dz: LEARN_TEXT.hud.dz, english: LEARN_TEXT.hud.dzEnglish, page: read('src/app/minpentai/learn.tsx') };
    return { text, sources, screens, files, countdown };
  },
  run: ({ text, sources, screens, files, countdown }) => {
    const problems: string[] = [];
    const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    for (const { screen, what, where } of sources) {
      // A source is a block id (or a range or list of them), something marked invented, or a file of ours that exists.
      if (/^invented\b/.test(where)) continue;
      if (/^(src|docs)\//.test(where)) { if (!files[where]) problems.push(`${screen}: "${what}" cites ${where}, which does not exist`); continue; }
      const ids = [...where.matchAll(/c(\d+)-b(\d+)(?:–b(\d+))?/g)];
      if (!ids.length) { problems.push(`${screen}: "${what}" cites "${where}", which is not a block id and not marked invented`); continue; }
      let body = '';
      for (const [, ch, a, b] of ids) {
        for (let i = Number(a); i <= Number(b ?? a); i++) {
          if (text[Number(ch)]?.[i] === undefined) problems.push(`${screen}: c${ch}-b${i} does not exist`);
          else body += ' ' + text[Number(ch)][i];
        }
      }
      // Quoted words must be in the cited blocks.
      for (const q of what.matchAll(/"([^"]+)"/g)) if (!norm(body).includes(norm(q[1]))) problems.push(`${screen}: "${q[1]}" is not in ${where}`);
    }
    // Every screen with a "From the book" tag lists at least one block.
    for (const s of screens) if ((s.tags as string[]).includes('book') && !s.sources.some(([, w]: [string, string]) => /c\d+-b\d+/.test(w))) problems.push(`${s.title}: tagged From the book but cites no block`);
    // The broadcast's countdown is the book's Dzegoban (c4-b97, as written) and its English (c4-b98), and the page shows those words.
    if (!text[4][97]?.includes(`"${countdown.dz}"`) && !text[4][97]?.includes(countdown.dz)) problems.push(`countdown: "${countdown.dz}" is not c4-b97's Dzegoban`);
    if (text[4][98]?.trim() !== countdown.english) problems.push(`countdown: "${countdown.english}" is not c4-b98`);
    if (!/T\.hud\.dz\}/.test(countdown.page) || !/T\.hud\.dzEnglish\}/.test(countdown.page)) problems.push('countdown: learn.tsx does not show the countdown from learn-text.ts');
    if (!sources.length) problems.push('no Minpentai sources found');
    return problems;
  },
  plant: (c) => {
    c.sources[0].where = 'c4-b9999';
    c.countdown.dz = 'MU GU GEI TAO FA';
  },
});

add({
  id: 'P8d',
  principle: 8,
  name: 'the Learn game is labelled as rules invented for this edition, and points to the book\'s rule in the sandbox',
  load: async () => ({
    tags: LEARN_TEXT.tags,
    note: LEARN_TEXT.rulesNote,
    screens: [
      ...LEARN_TEXT.watch.map((s, i) => ({ id: `watch ${i + 1}`, tags: [...s.tags] as string[], sources: s.sources.map(([a, b]) => [a, b]), rulesNote: false })),
      ...Object.entries(LEARN_TEXT.lessons).map(([id, s]) => ({ id, tags: [...s.tags] as string[], sources: s.sources.map(([a, b]) => [a, b]), rulesNote: 'rulesNote' in s && !!s.rulesNote })),
    ],
    page: read('src/app/minpentai/learn.tsx'),
  }),
  run: ({ tags, note, screens, page }) => {
    const problems: string[] = [];
    if (!/invented for this edition/i.test(tags.rules)) problems.push(`the "rules" tag reads "${tags.rules}", not "invented for this edition"`);
    for (const s of screens) {
      // Under the hood runs the rule recovered from the book: it is the book's, so it must not carry the
      // invented label, and it must cite the figure.
      if (s.id === 'hood') {
        if (s.tags.includes('rules')) problems.push('hood: the book\'s rule is labelled as invented');
        if (!s.sources.some(([, w]: string[]) => /c4-b5\b/.test(w))) problems.push('hood: does not cite the figure c4-b5');
        continue;
      }
      if (!s.tags.includes('rules')) problems.push(`${s.id}: no "${tags.rules}" tag`);
      if (!s.tags.includes('draft')) problems.push(`${s.id}: no "Draft wording" tag`);
    }
    // The note: invented for this edition, the book's rule changes every match (with its block), and the way to the sandbox.
    if (!/invented for this edition/i.test(note.text)) problems.push('rules note: does not say the rules are invented for this edition');
    if (!/rule changes every match/i.test(note.text) || !/c4-b84/.test(note.text)) problems.push('rules note: does not say, with c4-b84, that in the book the rule changes every match');
    if (!/sandbox/i.test(note.text) || !/c4-b5/.test(note.text) || !/sandbox/i.test(note.link)) problems.push('rules note: does not point to the sandbox for the rule recovered from c4-b5');
    for (const id of ['goal', 'rule', 'practice']) if (!screens.find((s: { id: string }) => s.id === id)?.rulesNote) problems.push(`${id}: does not show the rules note`);
    // The page draws every tag and the note, and the note's link opens the sandbox.
    if (!/T\.tags\[k\]/.test(page)) problems.push('learn.tsx does not show the screens\' tags');
    if (!/T\.rulesNote\.text/.test(page) || !/onClick=\{onFree\}>\{T\.rulesNote\.link\}/.test(page)) problems.push('learn.tsx does not show the rules note with its sandbox link');
    return problems;
  },
  plant: (c) => {
    c.screens[4].tags = c.screens[4].tags.filter((t: string) => t !== 'rules');
  },
});

// ---------------------------------------------------------------------------

const selected = checks.filter((c) => !ONLY || c.id.startsWith(ONLY));
let failed = 0;
let unproven = 0;
/** Checks that could not run here (no database URL, no Vercel CLI…): never counted as passing. */
const notRun: { id: string; why: string }[] = [];
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
  if (skipped) {
    notRun.push({ id: c.id, why: problems[0].replace(/^skipped:\s*/, '') });
    console.log(`NOT RUN ${c.id} ${c.name}: ${problems[0].replace(/^skipped:\s*/, '')}`);
  }
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
const passed = selected.length - failed - notRun.length;
console.log(`\n${passed} pass, ${failed} fail, ${notRun.length} not run, of ${selected.length}; ${selected.length - unproven} of ${selected.length} proven to fail on a planted violation`);
for (const n of notRun) console.log(`  not run: ${n.id} (${n.why})`);
if (!failed && !unproven && notRun.length) console.log(`NOT A FULL PASS: ${notRun.length} check(s) did not run here.`);
// 0 only when every check ran and passed; 1 on a failure; 2 when nothing failed but some did not run.
process.exit(failed || unproven ? 1 : notRun.length ? 2 : 0);
