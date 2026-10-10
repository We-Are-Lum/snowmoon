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
import * as cheerio from 'cheerio';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_TEMPLATES } from '../src/templates';
import { LiveScreen } from '../src/components/live-screen';
import { CHAT, IMAGES, REPO_URL } from '../src/lib/config';
import { NOTICE_REVIEW, currentNoticeItems, noticeKey } from '../src/lib/chat/notice';
import { LEGAL, PRIVACY, TERMS, legalKey } from '../src/lib/legal';
import { LEARN_TEXT } from '../src/lib/minpentai/learn-text';
import { BOOK_TAG, NARRATION_MAX_WORDS, PERSON_TAG, parseBeats } from '../src/lib/script-beats';
import { GLOSSARY_FILE, loadBlocks, verifyGlossary, type Glossary } from './lib/glossary';

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
// P2b (owner, 2026-10-09): under an image and on the narration, a compact visible label that says
// "AI", which is a button opening the recipe sheet; the whole declaration ("AI-generated",
// "not by the author") is in the page as served, inside that button (visually hidden, part of its
// accessible name), and in the sheet's "Who made it" row.
const AI_GENERATED = /\bAI[- ]generated\b/i;
const NOT_AUTHOR = /not by the author/i;
const SAYS_AI = /\bAI\b/;
type AiLabelTag = { open: string; visible: string; hidden: string; recipe: string | null; item: string | null };
/** Every AI label button in served HTML: its opening tag, its visible text, and its visually hidden text. */
function aiLabels(html: string): AiLabelTag[] {
  return [...html.matchAll(/(<button\b[^>]*\bclass="ai-label"[^>]*>)([\s\S]*?)<\/button>/g)].map(([, open, inner]) => {
    const hidden = [...inner.matchAll(/<span class="sr-only">([\s\S]*?)<\/span>/g)].map((m) => htmlText(m[1])).join(' ');
    const attr = (name: string) => open.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&') ?? null;
    return { open, visible: htmlText(inner.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')).trim(), hidden, recipe: attr('data-recipe'), item: attr('data-item') };
  });
}
function aiLabelProblems(where: string, html: string, kind: 'image' | 'voice'): string[] {
  const labels = aiLabels(html).filter((l) => l.open.includes(`data-ai="${kind}"`));
  if (!labels.length) return [`${where}: no AI label (a button with "AI" in its visible text) in the page as served`];
  const problems: string[] = [];
  for (const l of labels) {
    if (!SAYS_AI.test(l.visible)) problems.push(`${where}: the visible label does not say "AI": "${l.visible.slice(0, 40)}"`);
    if (!/\baria-haspopup="dialog"/.test(l.open)) problems.push(`${where}: the AI label does not open a dialog (aria-haspopup="dialog")`);
    if (!AI_GENERATED.test(l.hidden)) problems.push(`${where}: "AI-generated" is not served with the label`);
    if (!NOT_AUTHOR.test(l.hidden)) problems.push(`${where}: "not by the author" is not served with the label`);
  }
  return problems;
}
/** A source file without its comments, so a comment cannot stand in for what the code draws. */
const code = (rel: string) =>
  read(rel)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
/** A glossary word whose first narrated clip is in chapter 1 (c1-b87), so it is in the served HTML. */
const GLOSSARY_CLIP_PAGE = '/glossary/autobus';
const READER_IMAGE_FILES = [
  'src/components/reader-images.tsx',
  'src/components/image-feed.tsx',
  'src/app/image/[id]/page.tsx',
  'src/components/image-composer.tsx',
  'src/components/moderate-queue.tsx',
];
add({
  id: 'P2b',
  principle: 2,
  name: 'generated images and narration carry an AI label, with "AI-generated, not by the author" served and in the recipe sheet',
  load: async () => {
    const { AI_LABEL, AI_DECLARED, WHOSE } = await import('../src/lib/ai-declared');
    const ch1 = await page('/chapter/1');
    // A glossary word whose clip is in chapter 1, so the server's HTML (limit: chapter 1) draws it.
    const glossary = await page(GLOSSARY_CLIP_PAGE);
    // The recipe sheet as served: GET /api/recipe for each label on chapter 1 (and the glossary clip) that names a recipe file.
    const sheets: { what: string; whose: string }[] = [];
    for (const l of [...aiLabels(ch1), ...aiLabels(glossary)].filter((l) => l.recipe)) {
      const q = new URLSearchParams({ file: l.recipe!, ...(l.item ? { item: l.item } : {}) });
      const r = await fetch(`${BASE}/api/recipe?${q}`);
      sheets.push({ what: `${l.recipe}${l.item ? ` (${l.item})` : ''}`, whose: r.ok ? String(((await r.json()) as { whose?: unknown }).whose ?? '') : `HTTP ${r.status}` });
    }
    // A reader's image page, as served (when the live database is reachable), and the feed.
    const rows = await readerImages('published');
    const imagePage = rows?.length ? { id: rows[0].id, html: await page(`/image/${rows[0].id}`) } : null;
    return {
      ch1,
      glossary,
      sheets,
      feed: await page('/images'),
      imagePage,
      wording: {
        labels: [AI_LABEL.image, AI_LABEL.voice, AI_LABEL.imageBy('@someone')],
        declared: [AI_DECLARED.image, AI_DECLARED.voice],
        whose: Object.values(WHOSE).map((w) => (typeof w === 'function' ? w('@someone') : w)),
      },
      sheetSource: code('src/components/recipe-sheet.tsx'),
      card: code('src/app/api/card/[n]/[range]/route.tsx'),
      imageCard: code('src/app/api/image-card/[id]/route.tsx'),
      // Readers' images drawn after load (the chapter strip, the composer, the moderators' queue): each uses the label.
      readers: READER_IMAGE_FILES.map((f) => ({ file: f, text: code(f) })),
      player: code('src/components/chapter-player.tsx'),
    };
  },
  run: ({ ch1, glossary, sheets, feed, imagePage, wording, sheetSource, card, imageCard, readers, player }) => {
    const problems: string[] = [];
    // Chapter 1 as served: every seeded image's caption, and the narration credit.
    const figures = [...ch1.matchAll(/<figure class="seed-image"[\s\S]*?<\/figure>/g)].map((m) => m[0]);
    if (!figures.length) problems.push('chapter 1: no seeded images found to check');
    figures.forEach((f, i) => problems.push(...aiLabelProblems(`chapter 1 image ${i + 1}`, f, 'image')));
    const credit = ch1.match(/<p class="[^"]*\bnarration-credit\b[^"]*">[\s\S]*?<\/p>/)?.[0] ?? '';
    problems.push(...aiLabelProblems('chapter 1 narration credit', credit, 'voice'));
    if (!/Synthetic narration/.test(aiLabels(credit).map((l) => l.hidden).join(' '))) problems.push('chapter 1: the narration credit does not say "Synthetic narration"');
    // The glossary's "Hear it" clip: the same voice label, beside its "no word timings" note.
    const clip = glossary.match(/<div class="gl-clip">[\s\S]*?<\/p><\/div>/)?.[0] ?? '';
    problems.push(...aiLabelProblems(`${GLOSSARY_CLIP_PAGE} clip`, clip, 'voice'));
    if (clip && !/no word timings/.test(clip)) problems.push(`${GLOSSARY_CLIP_PAGE}: the clip does not say it plays the whole paragraph (no word timings)`);
    // The sheet, as served for those labels.
    if (!sheets.length) problems.push('chapter 1: no label names a recipe file, so the sheet could not be checked');
    for (const s of sheets as { what: string; whose: string }[]) {
      if (!AI_GENERATED.test(s.whose) || !NOT_AUTHOR.test(s.whose)) problems.push(`recipe sheet for ${s.what}: "Who made it" does not say AI-generated and not by the author: "${s.whose.slice(0, 60)}"`);
    }
    if (!/\{view\.whose\}/.test(sheetSource)) problems.push('src/components/recipe-sheet.tsx: the sheet does not show "Who made it" (view.whose)');
    // The feed and a reader's image page, as served.
    const captions = [...feed.matchAll(/<p class="block-caption pictures-caption">[\s\S]*?<\/p>/g)].map((m) => m[0]);
    captions.forEach((c, i) => problems.push(...aiLabelProblems(`/images caption ${i + 1}`, c, 'image')));
    if (imagePage) problems.push(...aiLabelProblems(`/image/${imagePage.id}`, imagePage.html.match(/<figcaption class="ip-caption">[\s\S]*?<\/figcaption>/)?.[0] ?? '', 'image'));
    // The wording itself (src/lib/ai-declared.ts).
    for (const l of wording.labels as string[]) if (!SAYS_AI.test(l)) problems.push(`src/lib/ai-declared.ts: label "${l}" does not say "AI"`);
    // Every label names who made it (owner, 2026-10-09).
    for (const l of wording.labels as string[]) if (!/ · by \S/.test(l)) problems.push(`src/lib/ai-declared.ts: label "${l}" does not name who made it (" · by …")`);
    for (const d of [...wording.declared, ...wording.whose] as string[]) if (!NOT_AUTHOR.test(d)) problems.push(`src/lib/ai-declared.ts: "${d.slice(0, 60)}" does not say "not by the author"`);
    for (const d of wording.declared as string[]) if (!AI_GENERATED.test(d)) problems.push(`src/lib/ai-declared.ts: "${d}" does not say "AI-generated"`);
    // Where readers' images and the listen view are drawn after load: the label is used.
    for (const r of readers as { file: string; text: string }[]) {
      if (!/<AiLabel\b[\s\S]*?\bkind="image"[\s\S]*?\btext=\{AI_LABEL\.(image|imageBy)\b/.test(r.text)) problems.push(`${r.file}: a reader's image is shown without the AI label`);
    }
    if (!/<AiLabel\s+kind="voice"/.test(player)) problems.push('src/components/chapter-player.tsx: the player shows the narration without the AI label');
    if (!/<AiLabel\s+kind="image"/.test(player)) problems.push('src/components/chapter-player.tsx: the listen view shows an image without the AI label');
    // Pictures shared off the site carry the whole declaration in the picture: there is no sheet to open there.
    if (!AI_GENERATED.test(card)) problems.push('quote cards with an image do not label the image as AI-generated');
    if (!AI_GENERATED.test(imageCard) || !NOT_AUTHOR.test(imageCard)) problems.push('the image share card does not say AI-generated and not by the author');
    return problems;
  },
  plant: (c) => {
    c.ch1 = c.ch1.replace(/not by the author/gi, '');
    c.glossary = c.glossary.replace(/class="ai-label"/g, 'class="clip-credit"');
    c.sheets.push({ what: 'planted', whose: 'The project made it.' });
    c.readers[0].text = c.readers[0].text.replace(/<AiLabel\b/g, '<Caption');
    c.card = c.card.replace(/AI[- ]generated/gi, 'picture');
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
add({
  id: 'P2e',
  principle: 2,
  name: "the glossary's quotes (explanations and each word's first sentence) are the book's sentences, verbatim, at real block ids; no written definitions",
  load: async () => ({ glossary: json<Glossary>(GLOSSARY_FILE), blocks: Object.fromEntries(loadBlocks(ROOT)) }),
  run: ({ glossary, blocks }) => verifyGlossary(glossary, new Map(Object.entries(blocks))),
  plant: (c) => {
    // A model-style definition passed off as a quote, at a real block.
    c.glossary.terms[0].explanations.push({ block: 'c1-b9', chapter: 1, idx: 9, text: 'An invented word for a kind of bus.' });
    // And a first sentence that is not the book's (one word changed). test:glossary proves each kind alone.
    c.glossary.terms[1].first_sentence.text = c.glossary.terms[1].first_sentence.text.replace(/\w+/, 'Plainly');
  },
});

// Short labels with ⓘ (owner ruling, 2026-10-09): "a short visible word, with ⓘ for the details. An icon
// alone doesn't count." Each InfoLabel is a button with its word visible, the ⓘ, the declaration served
// visually hidden, and it opens a dialog. P2g, P2h and P8f require the word, and plant a missing one.
type InfoLabelTag = { kind: string; visible: string; hidden: string; dialog: boolean; icon: boolean };
function infoLabels(html: string): InfoLabelTag[] {
  const $ = cheerio.load(html);
  return $('button.info-label').map((_, el) => {
    const b = $(el);
    return {
      kind: b.attr('data-label') ?? '',
      visible: b.find('.info-word').text().trim(),
      hidden: b.find('.sr-only').text().trim(),
      dialog: b.attr('aria-haspopup') === 'dialog',
      icon: b.find('svg.info-i').length === 1,
    };
  }).get();
}
function infoLabelProblems(where: string, l: InfoLabelTag, word: string): string[] {
  const problems: string[] = [];
  if (l.visible !== word) problems.push(`${where}: the label's visible word is "${l.visible}", not "${word}" (an icon alone doesn't count)`);
  if (!l.icon) problems.push(`${where}: the "${word}" label has no ⓘ`);
  if (!l.dialog) problems.push(`${where}: the "${word}" label does not open its details (aria-haspopup="dialog")`);
  if (l.hidden.replace(/[()\s]/g, '').length < 10) problems.push(`${where}: the "${word}" label serves no declaration`);
  return problems;
}
const blankWord = (html: string, word: string) => html.replace(`<span class="info-word">${word}</span>`, '<span class="info-word"></span>');

add({
  id: 'P2g',
  principle: 2,
  name: 'on every chapter page as served, each screen redrawn from a template says "Redrawn ⓘ"; screens drawn as in the book get no marker',
  load: async () => {
    const { LABELS } = await import('../src/lib/labels');
    return { word: LABELS.redrawn.word as string, pages: await Promise.all(Array.from({ length: 32 }, async (_, i) => ({ n: i + 1, html: await page(`/chapter/${i + 1}`) }))) };
  },
  run: ({ word, pages }) => {
    const problems: string[] = [];
    let redrawn = 0;
    for (const { n, html } of pages as { n: number; html: string }[]) {
      const $ = cheerio.load(html);
      const figures = $('figure.block[data-source]');
      if (!figures.length && /<figure class="block (screen|figure)/.test(html)) problems.push(`chapter ${n}: screens carry no data-source, so their markers cannot be checked`);
      figures.each((_, el) => {
        const f = $(el);
        const id = f.attr('id') ?? '?';
        const labels = infoLabels($.html(f)).filter((l) => l.kind === 'redrawn');
        if (f.attr('data-source') === 'template') {
          redrawn++;
          if (labels.length !== 1) problems.push(`${id}: redrawn from a template, but has ${labels.length} "Redrawn" labels`);
          for (const l of labels) problems.push(...infoLabelProblems(id, l, word));
        } else if (labels.length) problems.push(`${id}: drawn as in the book, but marked "Redrawn"`);
      });
    }
    if (!redrawn) problems.push('no screen redrawn from a template found to check');
    return problems;
  },
  plant: (c) => {
    const p = c.pages.find((x: { html: string }) => x.html.includes(`<span class="info-word">${c.word}</span>`));
    if (p) p.html = blankWord(p.html, c.word);
  },
});
add({
  id: 'P2h',
  principle: 2,
  name: 'Listen shows "AI description ⓘ" while a model-drafted description plays',
  load: async () => {
    const { LABELS } = await import('../src/lib/labels');
    const L = LABELS.aiDescription;
    return { word: L.word as string, props: { word: L.word as string, kind: 'ai-description' as const, declaration: L.declaration, title: L.title, body: [...L.body] }, player: code('src/components/chapter-player.tsx') };
  },
  run: async ({ word, props, player }) => {
    const { InfoLabel } = await import('../src/components/info-label');
    const problems: string[] = [];
    if (!/\bAI\b/.test(word) || !/description/i.test(word)) problems.push(`src/lib/labels.ts: the word "${word}" does not say "AI description"`);
    if (!/not the author/i.test(props.declaration)) problems.push('src/lib/labels.ts: the AI description declaration does not say it is not the author\'s words');
    const labels = infoLabels(renderToStaticMarkup(createElement(InfoLabel, props)));
    if (labels.length !== 1) problems.push('the AI description label does not render as one label');
    for (const l of labels) problems.push(...infoLabelProblems('Listen', l, word));
    // Drawn in the player wherever the current line is a description.
    const branch = player.match(/current\?\.description \?([\s\S]*?)\{current\.description\}/)?.[1] ?? '';
    if (!/<InfoLabel\b[\s\S]*?word=\{LABELS\.aiDescription\.word\}[\s\S]*?kind="ai-description"/.test(branch)) problems.push('src/components/chapter-player.tsx: a spoken description plays without the "AI description" label');
    return problems;
  },
  plant: (c) => {
    c.props.word = '';
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
const PAGES = ['/', '/chapter/1', '/chapter/30', '/about', '/cards', '/adaptations', '/adaptations/dog-dawn', '/share/1/4?img=c1-b005-toy-drone', '/images', '/moderate', '/glossary', '/glossary/zei', '/terms', '/privacy'];
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
const PRIVATE_FID_TABLES = ['ratings', 'likes', 'take_likes', 'picks', 'contributor_consents', 'image_asks', 'removal_log', 'image_scores'];
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
      insert into studio.image_scores (fid, score) values (42, 0.8);
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

// Image making for everyone (owner, 2026-10-09) does not go live before the Terms and Privacy pages
// do, and the Privacy page must say that Neynar receives the FID. At runtime the generate route
// also refuses everyone outside the invited list until next.config.ts has found both page files at
// build time (APP_LEGAL_PAGES) and SNOWMOON_ALERT_URL is set (src/lib/images/gate.ts).
add({
  id: 'P6n',
  principle: 6,
  name: 'image making is open beyond the invited list only with Terms and Privacy pages, the Privacy page naming Neynar',
  load: async () => {
    const page = (p: string) => (existsSync(path.join(ROOT, p)) ? read(p) : null);
    const gate = page('src/lib/images/gate.ts') ?? '';
    return {
      enabled: IMAGES.enabled,
      // Open beyond the invited list: the gate decides by score, not by the list alone.
      openBeyondInvited: /lookUp\(/.test(gate),
      terms: page('src/app/terms/page.tsx'),
      // The page renders the words kept in src/lib/legal.ts; read both.
      privacy: page('src/app/privacy/page.tsx') === null ? null : `${page('src/app/privacy/page.tsx')}\n${page('src/lib/legal.ts') ?? ''}`,
    };
  },
  run: ({ enabled, openBeyondInvited, terms, privacy }) => {
    if (!enabled || !openBeyondInvited) return [];
    const problems: string[] = [];
    if (terms === null) problems.push('image making is open beyond the invited list, but src/app/terms/page.tsx is missing');
    if (privacy === null) problems.push('image making is open beyond the invited list, but src/app/privacy/page.tsx is missing');
    else if (!/Neynar/.test(privacy)) problems.push('the Privacy page does not say that Neynar receives the Farcaster ID at Generate');
    return problems;
  },
  plant: (c) => {
    c.enabled = true;
    c.openBeyondInvited = true;
    c.terms = null;
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

// P6g–P6j (owner, 2026-10-09): the Privacy page, About, the assistant's notice and the image
// consent screen name the same outside services. The vocabulary is the services the Privacy page
// names (src/lib/legal.ts, section 7). "Vercel" is the host, apart from "Vercel AI Gateway";
// "Farcaster" is its services (sign-in, relay, public API, a report there), not a Farcaster ID,
// name, username or app. Pages are read as served (--url); the notice and the consent screen
// from their source, as readers are shown them.
const SERVICES: [string, RegExp][] = [
  ['Vercel AI Gateway', /\bVercel AI Gateway\b/g],
  ['Vercel', /\bVercel\b(?! AI Gateway)/g],
  ['Cloudflare', /\bCloudflare\b/g],
  ['Supabase', /\bSupabase\b/g],
  ['Groq', /\bGroq\b/g],
  ['fal.ai', /\bfal\.ai\b/g],
  ['Farcaster', /\bFarcaster\b(?!(?:['’]s)? (?:ID|name|username|app|mini app)\b)/g],
  ['Neynar', /\bNeynar\b/g],
  ['GitHub', /\bGitHub\b/g],
  // Owner's Privacy wording of 2026-10-10 names these two as well.
  ['ntfy', /\bntfy\b/g],
  ['Spotify', /\bSpotify\b/g],
];
/** At Generate, the image prompt goes to Groq (the check; through Vercel AI Gateway when Groq is busy) and
 *  fal.ai (the image), the FID to Neynar (the gate). The gateway is named on the consent screen too (owner, 2026-10-10). */
const AT_GENERATE = ['Groq', 'Vercel AI Gateway', 'fal.ai', 'Neynar'];
const named = (text: string) => new Set(SERVICES.filter(([, re]) => text.match(re)).map(([n]) => n));
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));
const pageText = (html: string, sel: string) => {
  // A space before every tag, so a heading's last word and the next paragraph's first don't run together.
  const $ = cheerio.load(html.replace(/</g, ' <'));
  $('script, style, noscript').remove();
  return $(sel).first().text().replace(/\s+/g, ' ');
};
interface Named {
  /** The Privacy page as served: its paragraphs and list items, one per unit. */
  privacy: string[];
  about: string;
  notice: string;
  consent: string;
}
let namedCache: Named | null = null;
async function loadNamed(): Promise<Named> {
  if (!namedCache) {
    const $ = cheerio.load(await page('/privacy'));
    const privacy = $('.legal p, .legal li').map((_, el) => $(el).text().replace(/\s+/g, ' ')).get();
    const c = json('config/consent.json');
    const w = c.versions[c.current];
    namedCache = {
      privacy,
      about: pageText(await page('/about'), '.shell-main .page, main .page, .page'),
      notice: currentNoticeItems().flat().join('\n'),
      consent: [w.line, w.title, ...w.text].join('\n'),
    };
  }
  return clone(namedCache);
}
const privacyAll = (c: Named) => named(c.privacy.join('\n'));
add({
  id: 'P6g',
  principle: 6,
  name: 'the Privacy page names every outside service that About, the assistant\'s notice or the image consent screen names',
  load: loadNamed,
  run: (c: Named) => {
    if (!c.privacy.length) return ['/privacy: no policy text served (.legal p, .legal li)'];
    const p = privacyAll(c);
    const problems: string[] = [];
    for (const [where, text] of [['About', c.about], ['the assistant\'s notice', c.notice], ['the image consent screen', c.consent]] as const)
      for (const s of diff(named(text), p)) problems.push(`${where} names ${s}; the Privacy page does not`);
    for (const s of AT_GENERATE) if (!p.has(s)) problems.push(`the Privacy page does not name ${s}, which receives the prompt or the Farcaster ID at Generate`);
    return problems;
  },
  plant: (c: Named) => {
    c.privacy = c.privacy.map((u) => u.replace(/Neynar/g, 'A scoring service'));
  },
});
add({
  id: 'P6h',
  principle: 6,
  name: 'About names the same outside services as the Privacy page',
  load: loadNamed,
  run: (c: Named) => {
    const p = privacyAll(c), a = named(c.about);
    if (!c.about.trim()) return ['/about: no page text served'];
    return [
      ...diff(p, a).map((s) => `the Privacy page names ${s}; About does not`),
      ...diff(a, p).map((s) => `About names ${s}; the Privacy page does not`),
    ];
  },
  plant: (c: Named) => {
    c.about = c.about.replace(/Neynar/g, 'A scoring service');
  },
});
add({
  id: 'P6i',
  principle: 6,
  name: 'the assistant\'s notice names exactly the services the Privacy page says receive assistant questions',
  load: loadNamed,
  run: (c: Named) => {
    // Privacy, section 5 ("Your question is sent to…") and section 7 ("…receive assistant questions").
    const units = c.privacy.filter((u) => /\bYour question is sent\b|\breceive assistant questions\b/.test(u));
    if (!units.length) return ['the Privacy page no longer says where assistant questions go'];
    const want = named(units.join('\n')), got = named(c.notice);
    return [
      ...diff(want, got).map((s) => `the Privacy page says ${s} receives assistant questions; the notice does not name it`),
      ...diff(got, want).map((s) => `the notice names ${s}; the Privacy page does not say it receives assistant questions`),
    ];
  },
  plant: (c: Named) => {
    c.notice = c.notice.replace(/Vercel AI Gateway/g, 'a gateway');
  },
});
add({
  id: 'P6j',
  principle: 6,
  name: 'the image consent screen (config/consent.json, current) names exactly the services that receive the prompt or the FID at Generate',
  load: loadNamed,
  run: (c: Named) => {
    const got = named(c.consent), want = new Set(AT_GENERATE);
    return [
      ...diff(want, got).map((s) => `the consent screen does not name ${s}, which receives the prompt or the Farcaster ID at Generate`),
      ...diff(got, want).map((s) => `the consent screen names ${s}, which receives nothing at Generate`),
    ];
  },
  plant: (c: Named) => {
    c.consent = c.consent.replace(/, and your Farcaster ID to Neynar[^.]*/, '');
  },
});

// P6k, P6l: the words of /privacy and /terms are words the owner (FID 6786) has reread, the
// notice's P6f rule. LEGAL.ownerReread is set only on the owner's word, never by an agent.
for (const [id, which, doc] of [['P6k', 'privacy', PRIVACY], ['P6l', 'terms', TERMS]] as const) {
  add({
    id,
    principle: 6,
    name: `the ${which === 'privacy' ? 'Privacy' : 'Terms'} page shows words the owner (FID 6786) has reread`,
    load: async () => ({ words: legalKey(doc), ownerReread: LEGAL.ownerReread[which] }),
    run: ({ words, ownerReread }) => {
      if (!ownerReread) return [`the owner has not reread the ${which} page's current words (key ${words}); after the owner says "reread", set LEGAL.ownerReread.${which} to { words: '${words}', on: <date>, by: 'FID 6786' } (src/lib/legal.ts)`];
      if (ownerReread.words !== words) return [`the ${which} page's words changed since the owner reread them on ${ownerReread.on}; an agent's reread is not enough. After the owner rereads them, set LEGAL.ownerReread.${which}.words to '${words}'`];
      return [];
    },
    plant: (c) => {
      c.ownerReread = { words: 'not-these-words', on: '2026-01-01', by: 'FID 6786' };
    },
  });
}
add({
  id: 'P6m',
  principle: 6,
  name: 'the Terms and Privacy pages carry their effective date (LEGAL.effective is set; no placeholder ships)',
  load: async () => ({ effective: LEGAL.effective, served: [await page('/terms'), await page('/privacy')].map((h) => pageText(h, '.legal')) }),
  run: ({ effective, served }) => {
    if (!effective) return ['LEGAL.effective (src/lib/legal.ts) is null: set it to the day the pages go live (YYYY-MM-DD) when the owner merges'];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) return [`LEGAL.effective is "${effective}", not YYYY-MM-DD`];
    const problems: string[] = [];
    served.forEach((t: string, i: number) => {
      const p = i ? '/privacy' : '/terms';
      if (!t.includes(`Effective: ${effective}`)) problems.push(`${p}: does not show "Effective: ${effective}" (deployed before the date was set?)`);
      if (/\{\{|EFFECTIVE_DATE/.test(t)) problems.push(`${p}: a placeholder is showing`);
    });
    return problems;
  },
  plant: (c) => {
    c.effective = null;
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
    // Statements about the book: every screen's sources, and the note that quotes the book on new rules
    // (c4-b84). The Learn game's own rules (learn-game/*.ts) are invented for this edition and are
    // deliberately not compared with the book's rule (owner, 2026-10-09; P8d checks the label instead).
    // The rule page (/minpentai/rule) is the book's rule and is checked the same way: its sources, and its text's quote.
    const screens = [...LEARN_TEXT.watch, ...Object.values(LEARN_TEXT.lessons), LEARN_TEXT.rulePage]
      .map((s) => ({ title: s.title, tags: [...s.tags] as string[], sources: s.sources.map(([a, b]) => [a, b] as [string, string]) }));
    const sources = screens.flatMap((s) => s.sources.map(([what, where]) => ({ screen: s.title, what, where })));
    const ids = (s: string) => (s.match(/c\d+-b\d+(?:–b\d+)?/g) ?? []).join(' · ');
    sources.push({ screen: 'the rules note', what: LEARN_TEXT.rulesNote.text, where: ids(LEARN_TEXT.rulesNote.text) });
    sources.push({ screen: 'the rule page', what: LEARN_TEXT.rulePage.text, where: ids(LEARN_TEXT.rulePage.text) });
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
  name: 'the Learn game is labelled as rules invented for this edition, quotes c4-b84 on new rules, and links to the book\'s rule on /minpentai/rule, which is labelled as the book\'s',
  load: async () => ({
    tags: LEARN_TEXT.tags,
    note: LEARN_TEXT.rulesNote,
    screens: [
      ...LEARN_TEXT.watch.map((s, i) => ({ id: `watch ${i + 1}`, tags: [...s.tags] as string[], sources: s.sources.map(([a, b]) => [a, b]), rulesNote: false })),
      ...Object.entries(LEARN_TEXT.lessons).map(([id, s]) => ({ id, tags: [...s.tags] as string[], sources: s.sources.map(([a, b]) => [a, b]), rulesNote: 'rulesNote' in s && !!s.rulesNote })),
    ],
    page: read('src/app/minpentai/learn.tsx'),
    // The rule page: the book's rule (c4-b5, c4-b7) on engine.ts. Its words, its page, and its view.
    rulePage: {
      tags: [...LEARN_TEXT.rulePage.tags] as string[],
      sources: LEARN_TEXT.rulePage.sources.map(([a, b]) => [a, b]),
      text: LEARN_TEXT.rulePage.text,
      route: existsSync(path.join(ROOT, 'src/app/minpentai/rule/page.tsx')) ? read('src/app/minpentai/rule/page.tsx') : '',
      view: existsSync(path.join(ROOT, 'src/app/minpentai/rule/rule-view.tsx')) ? read('src/app/minpentai/rule/rule-view.tsx') : '',
    },
  }),
  run: ({ tags, note, screens, page, rulePage }) => {
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
    // The note: invented for this edition, the book's own words on new rules (quoted, with its block), and the link
    // to the rule page. The book says "every game there's always some kind of new rule" (c4-b84), not that the rule
    // changes every match: the note and the sources quote it and never paraphrase it so (owner, 2026-10-09).
    if (!/invented for this edition/i.test(note.text)) problems.push('rules note: does not say the rules are invented for this edition');
    if (!/"every game there[’']s always some kind of new rule"/i.test(note.text) || !/c4-b84/.test(note.text)) problems.push('rules note: does not quote c4-b84, "every game there\'s always some kind of new rule"');
    const unquoted = (s: string) => s.replace(/"[^"]*"/g, ' ');
    const CHANGES = /\b(?:the\s+)?rules?\s+(?:change|changes|changed|changing|is\s+changed|are\s+changed)\s+(?:(?:with|for|in)\s+)?(?:every|each)\s+(?:match|game)\b|\b(?:new|different)\s+rules?\s+(?:every|each)\s+(?:match|game)\b/i;
    for (const [where, s] of [['rules note', note.text], ['rules note link', note.link], ...screens.flatMap((x: { id: string; sources: string[][] }) => x.sources.map(([w]) => [`${x.id} source`, w]))] as [string, string][]) {
      if (CHANGES.test(unquoted(s))) problems.push(`${where}: "${s}" says the rule changes every match; quote c4-b84 instead`);
    }
    if (note.href !== '/minpentai/rule' || !/c4-b5/.test(note.text) || !/rule recovered from the book.s figure/i.test(note.link)) problems.push('rules note: does not link to /minpentai/rule for the rule recovered from c4-b5');
    for (const id of ['goal', 'rule', 'practice']) if (!screens.find((s: { id: string }) => s.id === id)?.rulesNote) problems.push(`${id}: does not show the rules note`);
    // The page draws every tag and the note, and the note's link opens the rule page.
    if (!/<MinpentaiTags tags=\{v\.tags\}/.test(page)) problems.push('learn.tsx does not show the screens\' tags');
    if (!/T\.rulesNote\.text/.test(page) || !/<Link href=\{T\.rulesNote\.href\}[^>]*>\{T\.rulesNote\.link\}<\/Link>/.test(page)) problems.push('learn.tsx does not show the rules note with its link to the rule page');
    // The rule page is the book's rule: labelled FROM THE BOOK, never as invented; cites the figure (c4-b5) and the
    // rule's name (c4-b7); exists; shows its tags; runs engine.ts on the figure's board.
    const R = rulePage;
    if (!R.tags.includes('book') || R.tags.includes('rules')) problems.push(`rule page: tagged ${R.tags.join(', ')}; the book's rule must be FROM THE BOOK and not RULES INVENTED`);
    for (const id of ['c4-b5', 'c4-b7']) if (!R.sources.some(([, w]: string[]) => new RegExp(`${id}\\b`).test(w)) || !R.text.includes(id)) problems.push(`rule page: does not cite ${id} in its text and its sources`);
    if (!/<RuleView\b/.test(R.route)) problems.push('rule page: src/app/minpentai/rule/page.tsx is missing or does not render the rule view');
    if (!/<MinpentaiTags tags=\{R\.tags\}/.test(R.view)) problems.push('rule page: the view does not show its tags');
    if (!/from '~\/lib\/minpentai\/engine'/.test(R.view) || !/c4b5Preset/.test(R.view)) problems.push('rule page: the view does not run engine.ts on the c4-b5 board');
    return problems;
  },
  plant: (c) => {
    c.screens[4].tags = c.screens[4].tags.filter((t: string) => t !== 'rules');
  },
});

add({
  id: 'P8e',
  principle: 8,
  name: 'every live voting screen starts in the state the book shows (slider, reading, marks, title), and every slider in the book is one',
  load: async () => {
    const items: {
      id: string;
      source: { title: string; min: number; max: number; step: number; value: number; labels: string[] };
      spec: { name: string; min: number; max: number; step: number; start: number; labels: string[] } | null;
      ssr: string;
    }[] = [];
    for (let n = 1; n <= 32; n++) {
      for (const b of json(`content/snowmoon/text/chapter-${n}.json`).blocks) {
        if (b.kind !== 'screen' && b.kind !== 'figure') continue;
        const $ = cheerio.load(b.content);
        const input = $('input[type="range"]');
        const t = DEFAULT_TEMPLATES.find((t) => t.matches(b));
        if (!input.length && !t?.live) continue;
        // The source's slider, read from its HTML with the HTML defaults for a range input.
        const attr = (k: string, d: number) => (input.attr(k) !== undefined ? Number(input.attr(k)) : d);
        const min = attr('min', 0);
        const max = attr('max', 100);
        const step = attr('step', 1);
        const value = input.attr('value') !== undefined ? Number(input.attr('value')) : max < min ? min : min + Math.round((max - min) / 2 / step) * step;
        const labels = input.next('div').children('span').map((_, s) => $(s).text().replace(/\s+/g, '')).get();
        const title = $('th').first().text().trim();
        const spec = t?.live ? t.live(b) : null;
        const ssr = spec ? renderToStaticMarkup(createElement(LiveScreen, { html: t!.render(b), slider: spec, draftLine: false })) : '';
        items.push({ id: `c${n}-b${b.idx}`, source: { title, min, max, step, value, labels }, spec, ssr });
      }
    }
    return items;
  },
  run: (items) => {
    const problems: string[] = [];
    if (!items.length) problems.push('no voting screens found');
    for (const { id, source: s, spec, ssr } of items) {
      if (!spec) {
        problems.push(`${id}: the book draws a slider here, but the screen is not live`);
        continue;
      }
      const same = (what: string, got: unknown, want: unknown) => {
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${id}: ${what} is ${JSON.stringify(got)}, the source's is ${JSON.stringify(want)}`);
      };
      same('the slider\'s range', [spec.min, spec.max, spec.step], [s.min, s.max, s.step]);
      same('the slider\'s starting value', spec.start, s.value);
      same('the slider\'s marks', spec.labels, s.labels);
      same('the slider\'s name', spec.name, s.title);
      // What the island renders first: its value, the drawn thumb, the marks, the reading.
      const $ = cheerio.load(ssr);
      same('the island\'s starting value', Number($('[data-value]').attr('data-value')), s.value);
      const f = /--f:\s*([\d.]+)/.exec($('[data-live-track]').attr('style') ?? '')?.[1];
      same('the drawn thumb', f === undefined ? null : Number(f), (s.value - s.min) / (s.max - s.min));
      same('the marks drawn', $('.vv-labels > span, .dv-labels > span').map((_, e) => $(e).text().replace(/\s+/g, '')).get(), s.labels);
      // The reading starts as the mark under the source's thumb (the marks are spread evenly).
      const at = ((s.value - s.min) / (s.max - s.min)) * (s.labels.length - 1);
      const under = Number.isInteger(at) ? s.labels[at] : null;
      if (under === null) problems.push(`${id}: the source's thumb is between marks; no reading to check`);
      else same('the starting reading', $('.live-value').text().replace(/\s+/g, ''), under);
      if (!$('.live-reset').length) problems.push(`${id}: no Reset`);
    }
    return problems;
  },
  plant: (items) => {
    items[0].ssr = items[0].ssr.replace(/--f:\s*[\d.]+/, '--f:0.6');
  },
});

add({
  id: 'P8f',
  principle: 8,
  name: 'Minpentai\'s tags are "Book ⓘ", "Invented ⓘ" and "Draft ⓘ", each a visible word opening its explanation',
  load: async () => {
    const { MinpentaiTags } = await import('../src/app/minpentai/mp-tags');
    const { LABELS } = await import('../src/lib/labels');
    const screens = [
      ...LEARN_TEXT.watch.map((s, i) => ({ id: `watch ${i + 1}`, tags: [...s.tags] as string[] })),
      ...Object.entries(LEARN_TEXT.lessons).map(([id, s]) => ({ id, tags: [...s.tags] as string[] })),
      { id: 'rule page', tags: [...LEARN_TEXT.rulePage.tags] as string[] },
    ];
    return {
      words: { book: LABELS.minpentai.book.word, invented: LABELS.minpentai.invented.word, draft: LABELS.minpentai.draft.word } as Record<string, string>,
      screens: screens.map((s) => ({ ...s, html: renderToStaticMarkup(createElement(MinpentaiTags, { tags: s.tags as never })) })),
    };
  },
  run: ({ words, screens }) => {
    const problems: string[] = [];
    const INVENTED = ['rules', 'imag', 'lens', 'inv'];
    if (words.book !== 'Book' || words.invented !== 'Invented' || words.draft !== 'Draft') problems.push(`src/lib/labels.ts: the words are ${JSON.stringify(words)}, not Book, Invented and Draft`);
    for (const s of screens as { id: string; tags: string[]; html: string }[]) {
      const want = [
        ...(s.tags.includes('book') ? ['book'] : []),
        ...(s.tags.some((t) => INVENTED.includes(t)) ? ['invented'] : []),
        ...(s.tags.includes('draft') ? ['draft'] : []),
      ];
      const labels = infoLabels(s.html);
      if (JSON.stringify(labels.map((l) => l.kind)) !== JSON.stringify(want)) problems.push(`${s.id}: labels ${labels.map((l) => l.kind).join(', ') || 'none'}, expected ${want.join(', ')}`);
      for (const l of labels) if (words[l.kind]) problems.push(...infoLabelProblems(s.id, l, words[l.kind]));
    }
    return problems;
  },
  plant: (c) => {
    // A missing word for each of the three.
    for (const k of ['book', 'invented', 'draft']) {
      const s = c.screens.find((x: { html: string }) => x.html.includes(`<span class="info-word">${c.words[k]}</span>`));
      if (s) s.html = blankWord(s.html, c.words[k]);
    }
  },
});

// ---------------------------------------------------------------------------

const selected =checks.filter((c) => !ONLY || c.id.startsWith(ONLY));
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
