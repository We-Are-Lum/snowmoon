/**
 * The admins' chapter pictures (owner, 2026-11-18, option B; branch chapter-pictures-admin). One check per point:
 *  A. admins only: every route answers 401 signed out and holds the 404 gate for anyone else; the writes refuse a
 *     non-admin whatever the caller checked;
 *  M. the model choice: the open model first and the default; a closed one only where its maker serves, and only with
 *     its notice and the 18+ box; the closed call gets the picture shown now as its one reference;
 *  D. the recorded decisions: a redo is a private draft (no public recipe) by the admin, with the review's own
 *     "regenerate" row; a keep names the admin, the handle and the time, and puts the file in the public bucket once;
 *  U. undo: the committed file and any earlier version can be shown again in one step; nothing is deleted;
 *  R. the recipe shows the model, its maker, the style and the note; the chapter's caption says who and when;
 *  C. the admins' cap: $20 a day, apart from the entrants' caps, with the reset time;
 *  L. the look: one of the site's offered styles or a line; blocked names refused; a lettered picture can't be redone;
 *  P. P5j: the real files pass; each planted fault fails.
 *
 *   npm run test:chapter-pictures
 *
 * In-memory Postgres (PGlite, every migration, 0042_chapter_picture_versions included), through postgres.js as
 * studio_writer, as the site connects. No network, no model, no bucket: every such call is a stand-in.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
// One of the challenge's offered styles, published: "Comic book".
const STYLE_VERSION = '00000009-0000-4000-8000-000000000077';
await pg.query(`insert into studio.entities (id, work_id, kind, name) values ('00000001-0000-4000-8000-000000000077','snowmoon','style','Comic book')`);
await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000008-0000-4000-8000-000000000077','snowmoon','design',6786,'00000001-0000-4000-8000-000000000077','published')`);
await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ($1,'00000008-0000-4000-8000-000000000077',1,$2)`, [
  STYLE_VERSION,
  JSON.stringify({ title: 'Comic book', text: 'Comic book: bold ink outlines, flat colour, halftone shading.', samples: [{ url: 'https://media.snowmoon.party/x.jpg', sha256: 'b'.repeat(64), recipe: { prompt: 'p', model: 'm' } }], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null }),
]);
const PORT = 54371;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;

const { redoPicture, showPicture, setLook, adminView, redoable } = await import('../src/lib/chapter-pictures/pictures');
const { readReplacements, publicRecipe, pictureHistory, pictureBytes } = await import('../src/lib/chapter-pictures/read');
const { saveVersion, saveDecision } = await import('../src/lib/chapter-pictures/admin');
const { recipeProblems, redoPrompt, REDO_LINE, day, localDay } = await import('../src/lib/chapter-pictures/shared');
const { withReplacements } = await import('../src/lib/chapter-pictures/view');
const { paidPicture } = await import('../src/lib/images/paid');
const { closedSpentToday } = await import('../src/lib/images/limits');
const { CHAPTER_PICTURES, IMAGES, CLOSED_PROVIDERS } = await import('../src/lib/config');
const { checkJob, checkJobs } = await import('../src/lib/illustration-check/jobs');
const { loadIllustrations } = await import('../src/lib/illustrations');
const { p5bProblems, p5jProblems, P5J_PLANTS } = await import('./lib/p5b');
type Sql = Parameters<typeof redoPicture>[0];
type Deps = Parameters<typeof redoPicture>[5];
const S = sql as unknown as Sql;

const GARANCE = 193912, NATE = 6786, STRANGER = 4242;
const US = { country: 'US', region: null }, NOWHERE = { country: null, region: null };
const JOB = 'c1-b005-toy-drone';
const job = checkJob(JOB)!;
const jpeg = async (r: number) => sharp({ create: { width: 1024, height: 576, channels: 3, background: { r, g: 120, b: 160 } } }).jpeg().toBuffer();
const calls: { kind: string; prompt?: string; refBytes?: number; model?: string; pool?: string; checkText?: string }[] = [];
const puts: string[] = [];
const REF = await jpeg(10);
const stubPaid: typeof paidPicture = async (_sql, _fid, _req, j) => {
  calls.push({ kind: 'paid', pool: j.spend?.pool, checkText: j.checkText, model: j.spend?.model.id });
  return { ok: true, made: await j.make(), left: 9 };
};
let shade = 30;
const deps: Deps = {
  reference: async (url, sha) => {
    calls.push({ kind: 'reference', model: url });
    return sha ? REF : null;
  },
  makeOpen: async (prompt, ref) => {
    calls.push({ kind: 'open', prompt, refBytes: ref.bytes.length });
    return { bytes: await jpeg((shade += 40)), contentType: 'image/jpeg', seed: 7, requestId: 'fal-stand-in', nsfw: false, costUsd: 0.012, settings: { stand_in: true } };
  },
  makeClosed: async (m, prompt, ref) => {
    calls.push({ kind: 'closed', prompt, refBytes: ref.length, model: m.id });
    return { bytes: await jpeg((shade += 40)), contentType: 'image/jpeg', seed: null, requestId: 'gateway-stand-in', nsfw: false, costUsd: 0.0478, settings: { size: '1536x1024', stand_in: true } };
  },
  putPublic: async (sha) => {
    puts.push(sha);
    return `https://pictures.snowmoon.party/images/readers/${sha.slice(0, 32)}.jpg`;
  },
  storageReady: () => true,
  handleFor: async (fid) => (fid === GARANCE ? 'garance' : fid === NATE ? 'naaate' : null),
  paid: stubPaid,
  consented: async (fid) => fid === GARANCE || fid === NATE,
};
const consentedAdmins = deps.consented;
const req = new Request('http://localhost/api/you/illustrations/redo', { method: 'POST' });
const notice = (maker: 'OpenAI' | 'Google') => ({ version: CLOSED_PROVIDERS[maker].noticeVersion, adult: true });

// A. Admins only.
const routes = ['src/app/api/you/illustrations/route.ts', 'src/app/api/you/illustrations/redo/route.ts', 'src/app/api/you/illustrations/show/route.ts', 'src/app/api/you/illustrations/look/route.ts', 'src/app/api/you/illustrations/draft/[id]/route.ts'];
for (const r of routes) {
  const text = readFileSync(path.join(ROOT, r), 'utf8');
  check(`A. ${r} answers anyone not an admin with 404`, /if \(!isAdmin\(fid\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(text));
  check(`A. ${r} checks the sign-in first (401)`, /if \(fid === null\) return NextResponse\.json\(\{ error: 'Sign in' \}, \{ status: 401 \}\);/.test(text));
}
for (const r of routes) {
  const mod = await import(path.join(ROOT, r));
  const handler = mod.POST ?? mod.GET;
  const res = await handler(new Request('http://localhost/x', { method: mod.POST ? 'POST' : 'GET', body: mod.POST ? '{}' : undefined }), { params: Promise.resolve({ id: '0' }) });
  check(`A. ${r} signed out: 401`, res.status === 401, String(res.status));
}
let threw = false;
try {
  await saveVersion(S, STRANGER, { jobId: JOB, chapter: 1, model: 'm', maker: 'x', open: true, look: null, note: 'n', prompt: 'p', recipe: {} as never, sha256: 'a'.repeat(64), width: 1024, height: 576, jpeg: REF, costUsd: 0 });
} catch {
  threw = true;
}
check('A. a non-admin can\'t write a version, whatever the caller checked', threw);
threw = false;
try {
  await saveDecision(S, STRANGER, { jobId: JOB, chapter: 1, versionId: null, action: 'restore', publicUrl: null, byHandle: null });
} catch {
  threw = true;
}
check('A. a non-admin can\'t write a decision', threw);
check('A. nothing was written by the non-admin', (await sql`select count(*)::int n from studio.chapter_picture_decisions`)[0].n === 0);
const draftRoute = readFileSync(path.join(ROOT, 'src/app/api/you/illustrations/draft/[id]/route.ts'), 'utf8');
check('A. a draft\'s file is served privately, never cached', /'Cache-Control': 'private, no-store'/.test(draftRoute));

// L. The look.
let r = await setLook(S, GARANCE, { chapter: null, look: { kind: 'style', id: 'not-offered' } });
check('L. a style that isn\'t offered is refused', r.status === 400);
r = await setLook(S, GARANCE, { chapter: null, look: null });
check('L. every chapter needs a look', r.status === 400);
const blocked = (JSON.parse(readFileSync(path.join(ROOT, 'config/image-blocked-names.json'), 'utf8')) as { names: string[] }).names[0];
r = await setLook(S, GARANCE, { chapter: 3, look: { kind: 'line', text: 'Soft watercolour washes.' } });
check('L. a written look needs the own-words consent first', r.status === 403 && r.json.reason === 'consent');
r = await setLook(S, GARANCE, { chapter: 3, look: { kind: 'line', text: `Drawn like a portrait of ${blocked}` } }, consentedAdmins);
check('L. a look naming a blocked real person is refused', r.status === 400 && /real people/.test(String(r.json.error)), JSON.stringify(r.json));
r = await setLook(S, GARANCE, { chapter: null, look: { kind: 'style', id: STYLE_VERSION } });
check('L. "Comic book" saved as every chapter\'s look', r.status === 200, JSON.stringify(r.json));
const lettered = checkJobs().find((j) => j.lettering.length)!;
check('L. a lettered picture can\'t be redone (no words until the lettering work ships)', !redoable(lettered) && redoable(job));
r = await redoPicture(S, GARANCE, req, { jobId: lettered.id, note: 'x', model: 'flux2-klein-4b-edit' }, US, deps);
check('L. ... and the redo route says so', r.status === 400 && /lettering/.test(String(r.json.error)));

// M. The model choice.
const view = await adminView(S, US);
check('M. the open model is first (the default)', view.models[0]?.open === true && view.models[0]?.id === 'flux2-klein-4b-edit', view.models.map((m) => m.id).join(','));
check('M. where OpenAI serves, GPT Image 2.5 Sunburst is offered, named with its maker and closed', view.models.some((m) => m.id === 'gpt-image-2.5-sunburst' && m.maker === 'OpenAI' && !m.open));
check('M. with no country, only the open model', (await adminView(S, NOWHERE)).models.every((m) => m.open));
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: 'Make the drone smaller.', model: 'gpt-image-2.5-sunburst' }, NOWHERE, deps);
check('M. a closed model where its maker doesn\'t serve is refused', r.status === 400 && /isn’t offered/.test(String(r.json.error)));
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: 'Make the drone smaller.', model: 'gpt-image-2.5-sunburst' }, US, deps);
check('M. a closed model without its notice is refused', r.status === 400 && r.json.reason === 'notice');
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: 'Make the drone smaller.', model: 'gpt-image-2.5-sunburst', notice: { version: CLOSED_PROVIDERS.OpenAI.noticeVersion } }, US, deps);
check('M. ... and without the 18+ box', r.status === 400 && r.json.reason === 'adult');
check('M. nothing was spent or stored for a refused redo', !calls.some((c) => c.kind === 'paid') && (await sql`select count(*)::int n from studio.chapter_picture_versions`)[0].n === 0);
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: '' }, US, deps);
check('D. a redo needs a note', r.status === 400);
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: 'A note.' }, US, { ...deps, consented: async () => false });
check('D. a redo needs the own-words consent (its note is published once kept)', r.status === 403 && r.json.reason === 'consent');

// D. A redo with the open default, then one with GPT.
const NOTE1 = 'Make the drone smaller, and the morning light warmer.';
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: NOTE1 }, US, deps);
check('M. no model named: the open default', r.status === 200 && calls.some((c) => c.kind === 'open'), JSON.stringify(r.json));
const v1 = String(r.json.versionId);
const paid1 = calls.find((c) => c.kind === 'paid')!;
check('C. the redo is paid from the admins\' pool', paid1.pool === 'admin');
check('R. the whole prompt is checked: the note, the look and the no-words line', !!paid1.checkText?.includes(NOTE1) && paid1.checkText.includes('halftone shading') && paid1.checkText.endsWith(IMAGES.suffix));
check('M. the reference is the picture shown now (the committed file)', calls.some((c) => c.kind === 'reference' && c.model === job.image!.url));
const NOTE2 = 'Show the boy mid-leap, one hand on the drone.';
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: NOTE2, model: 'gpt-image-2.5-sunburst', notice: notice('OpenAI') }, US, deps);
check('M. with the notice and 18+, GPT Image 2.5 Sunburst makes it, from the picture shown now', r.status === 200 && calls.some((c) => c.kind === 'closed' && c.model === 'gpt-image-2.5-sunburst' && c.refBytes === REF.length), JSON.stringify(r.json));
const v2 = String(r.json.versionId);
const [row2] = await sql<{ made_by_fid: string; model: string; maker: string; open_weights: boolean; note: string }[]>`select made_by_fid, model, maker, open_weights, note from studio.chapter_picture_versions where id = ${v2}`;
check('D. the draft records the admin, the model, its maker, closed, and the note', Number(row2.made_by_fid) === GARANCE && row2.model === 'gpt-image-2.5-sunburst' && row2.maker === 'OpenAI' && row2.open_weights === false && row2.note === NOTE2);
const reviews = await sql<{ decision: string; note: string; by_fid: string }[]>`select decision, note, by_fid from studio.illustration_reviews where job_id = ${JOB} order by id`;
check('D. each redo is also a "regenerate" in the review, by the admin, with the note', reviews.length === 2 && reviews.every((x) => x.decision === 'regenerate' && Number(x.by_fid) === GARANCE) && reviews[1].note === NOTE2);
check('D. a draft changes nothing public: the chapter still shows the committed file', !(await readReplacements(S)).has(JOB));
check('D. a draft has no public recipe', (await publicRecipe(S, v2)) === null);
check('D. a draft has no public file', puts.length === 0);

// Keep.
r = await showPicture(S, GARANCE, { jobId: JOB, versionId: v2 }, deps);
check('D. keep: shown at once, its chapter returned for revalidation', r.status === 200 && (r as { chapter?: number }).chapter === 1, JSON.stringify(r.json));
const shown = (await readReplacements(S)).get(JOB);
check('D. the chapter shows the kept version', shown?.versionId === v2 && shown.url.startsWith('https://pictures.snowmoon.party/'));
const [d1] = await sql<{ action: string; by_fid: string; by_handle: string; decided_at: Date }[]>`select action, by_fid, by_handle, decided_at from studio.chapter_picture_decisions order by id desc limit 1`;
check('D. the keep names the admin (FID and handle) and the time', d1.action === 'keep' && Number(d1.by_fid) === GARANCE && d1.by_handle === 'garance' && !!d1.decided_at);
check('D. the kept file went to the public bucket once, matching the draft', puts.length === 1 && puts[0] === createHash('sha256').update((await pictureBytes(S, v2))!).digest('hex'));
r = await showPicture(S, GARANCE, { jobId: JOB, versionId: v2 }, deps);
check('D. keeping the picture already shown is refused (409)', r.status === 409);

// R. The recipe and the caption.
const rec = await publicRecipe(S, v2);
check('R. the public recipe names the model, its maker, closed, the style and the note', rec?.recipe.model.id === 'gpt-image-2.5-sunburst' && rec.recipe.model.maker === 'OpenAI' && rec.recipe.model.open === false && rec.look?.kind === 'style' && rec.look.label === 'Comic book' && rec.note === NOTE2);
check('R. ... and the admin who kept it, and when', rec?.published_by.fid === GARANCE && rec.published_by.handle === 'garance' && !!rec.published_by.at);
check('R. the recipe is complete (the rule P1d applies)', recipeProblems({ recipe: rec?.recipe, publishedBy: rec?.published_by }).length === 0, recipeProblems({ recipe: rec?.recipe, publishedBy: rec?.published_by }).join(', '));
check('R. the rule catches a recipe with no style or note', recipeProblems({ recipe: { prompt: 'p', model: { id: 'm', maker: 'x', open: true } } as never, publishedBy: { fid: 1, action: 'keep', at: 'x' } }).length >= 2);
const imgs = withReplacements(loadIllustrations(1), await readReplacements(S), (id) => (id === 'gpt-image-2.5-sunburst' ? 'GPT Image 2.5 Sunburst' : id));
const one = imgs.find((i) => i.id === JOB)!;
check('R. the chapter shows the kept file, with "Redone by @garance", its time and the model with its maker', one.url === shown!.url && one.replaced!.by === 'Redone by @garance' && one.replaced!.at === shown!.at && one.replaced!.model === 'GPT Image 2.5 Sunburst, a closed model by OpenAI', `${one.replaced?.by} / ${one.replaced?.model}`);
check('R. the recipe sheet gets the instant, to write it in the reader\'s own time', one.replaced!.view.published?.whenIso === shown!.at);
// Dates in the reader's own time (owner, 2026-11-18): the server's stable form is UTC; the browser's is its own zone.
const late = '2026-11-19T04:30:00.000Z';
check('T. the server writes UTC (stable): 19 Nov', day(late) === '19 Nov 2026', day(late));
check('T. a reader in Los Angeles sees 18 Nov', localDay(late, 'America/Los_Angeles') === '18 Nov 2026', localDay(late, 'America/Los_Angeles'));
check('T. a reader in Tokyo sees 19 Nov', localDay(late, 'Asia/Tokyo') === '19 Nov 2026');
const ld = readFileSync(path.join(ROOT, 'src/components/local-date.tsx'), 'utf8');
check('T. the date starts as the server wrote it and changes only after mount (no hydration mismatch)', /useState\(\(\) => day\(iso\)\)/.test(ld) && /useEffect\(\(\) => setText\(localDay\(iso\)\), \[iso\]\)/.test(ld));
const pageSrc = readFileSync(path.join(ROOT, 'src/app/chapter/[n]/page.tsx'), 'utf8');
check('T. the chapter caption writes its date with LocalDate', /<LocalDate iso=\{image\.replaced\.at\} \/>/.test(pageSrc));
const review = readFileSync(path.join(ROOT, 'src/components/illustration-review.tsx'), 'utf8');
check('O. the old three buttons are hidden where the redo is offered, and say they only record elsewhere', /const redoHere = Boolean\(pictures\?\.ready && item\.redoable\);/.test(review) && /\{canSave && !redoHere && \(\n\s*<div className="you-actions illus-actions">/.test(review) && /recordOnly: 'These record your decision for the review only\. They change nothing on the site\.'/.test(review));
check('R. its recipe sheet has the prompt, the style and the note', one.replaced!.view.prompt?.text === rec!.recipe.prompt && one.replaced!.view.inputs.some((i) => i.label === 'Style' && /Comic book/.test(i.value)) && one.replaced!.view.inputs.some((i) => i.label === 'Note' && i.value.startsWith(NOTE2)));
check('R. the other pictures of the chapter are unchanged', imgs.filter((i) => i.id !== JOB).every((i) => !('replaced' in i) && i.url.startsWith('https://media.snowmoon.party/')));
check('R. the redo prompt starts with the redo line and drops the cast-sheet references', redoPrompt('A man from reference image 2 waves.', 'n', null, 's').prompt === `${REDO_LINE} A man waves.\n\nn\n\ns`);

// U. Undo.
r = await showPicture(S, NATE, { jobId: JOB, versionId: null }, deps);
check('U. the committed file again, in one step', r.status === 200 && !(await readReplacements(S)).has(JOB));
r = await showPicture(S, GARANCE, { jobId: JOB, versionId: v2 }, deps);
check('U. the kept version again, in one step, without a second upload', r.status === 200 && (await readReplacements(S)).get(JOB)?.versionId === v2 && puts.length === 1);
const [d3] = await sql<{ action: string }[]>`select action from studio.chapter_picture_decisions order by id desc limit 1`;
check('U. ... recorded as a restore', d3.action === 'restore');
r = await showPicture(S, GARANCE, { jobId: JOB, versionId: v1 }, deps);
check('U. the other draft can be kept instead', r.status === 200 && (await readReplacements(S)).get(JOB)?.versionId === v1 && puts.length === 2);
const hist = await pictureHistory(S);
check('U. nothing is deleted: both versions and every decision stay', hist.versions.get(JOB)?.length === 2 && hist.decisions.get(JOB)?.length === 4);
check('U. the replaced version stays linkable: its public recipe still answers', (await publicRecipe(S, v2))?.history.length === 4);
let refused = false;
try {
  await sql`delete from studio.chapter_picture_versions`;
} catch {
  refused = true;
}
check('U. the site\'s database role can\'t delete a version', refused);
refused = false;
try {
  await sql`update studio.chapter_picture_decisions set version_id = null`;
} catch {
  refused = true;
}
check('U. ... or change a decision in place', refused);

// C. The admins' cap.
await sql`insert into studio.image_costs (funded, kind, model, provider, verdict, calls, cost_usd) values ('admin', 'image', 'gpt-image-2.5-sunburst', 'Vercel AI Gateway', 'ok', 1, ${CHAPTER_PICTURES.adminDailyCapUsd - 0.05})
  on conflict (day, funded, kind, model, provider, verdict) do update set cost_usd = excluded.cost_usd`;
r = await redoPicture(S, GARANCE, req, { jobId: JOB, note: 'One more.', model: 'gpt-image-2.5-sunburst', notice: notice('OpenAI') }, US, { ...deps, paid: paidPicture });
check('C. at the $20 cap the redo is refused, with the reset time', r.status === 429 && r.json.reason === 'admin-spend' && typeof r.json.resetAt === 'string' && /\{reset\}/.test(String(r.json.error)), JSON.stringify(r.json));
check('C. the admins\' spend is not in the entrants\' closed total', (await closedSpentToday(S)) === 0);
const [free] = await sql<{ usd: number }[]>`select coalesce(sum(cost_usd), 0)::float8 usd from studio.image_costs where funded = 'free'`;
check('C. ... nor in the free cap', free.usd === 0);
check('C. the page is told the cap and what is spent', (await adminView(S, US)).cap.capUsd === 20 && (await adminView(S, US)).cap.spentUsd > 19);

// P. P5j.
const src = (dir: string): { file: string; text: string }[] =>
  readdirSync(path.join(ROOT, dir), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => ({ file: path.join(dir, f), text: readFileSync(path.join(ROOT, dir, f), 'utf8') }));
const files = src('src');
check('P. P5j passes on the real files', p5jProblems(files).length === 0, p5jProblems(files).join('; '));
check('P. P5b still passes on the real files', p5bProblems(files).length === 0, p5bProblems(files).join('; '));
for (const [name, plant] of Object.entries(P5J_PLANTS)) {
  const withPlant = name === 'elsewhere' ? [...files, plant] : [...files.filter((f) => f.file !== plant.file), plant];
  check(`P. P5j catches the planted fault "${name}"`, p5jProblems(withPlant).length > 0);
}

await sql.end();
await server.stop();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
