/**
 * Remix challenge pictures are never attached to a passage or moment (owner, 2026-11-10). On an in-memory Postgres with
 * every migration (never a production database). Each check runs on the real code and on a planted violation, which it
 * must catch.
 *
 *   npm run test:no-anchor
 *
 *  N1 publish: a challenge ticket gives no anchor and no moment (a ticket signed before 2026-11-10, with a passage and a
 *     moment, too); every other image keeps its anchor; an image ticket without a passage is refused;
 *  N2 the make route signs no passage and no moment, and carries nothing over from the picture it starts from;
 *  N3 the database: a challenge picture without an anchor row still shows on its own page, in the feed, in the report
 *     queue; one with an old anchor row (published 8-10 Nov) is read with no passage; the reader's chapters never list
 *     either; a reader's image keeps its passage; every query that joined the passages now tolerates none.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { challengeRecord, publishAnchor } from '../src/lib/images/anchor';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
const failed: string[] = [];
const need = (ok: boolean, what: string) => (ok ? [] : [what]);
function proven(name: string, real: string[], planted: string[]) {
  const ok = real.length === 0 && planted.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? `real: ${real.join('; ')}` : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${planted.length ? '' : ' (plant not caught)'}`);
}

// N1
{
  const challenge = { character: 'zei', from: 'f', fromKind: 'picture' as const, moment: 'm07', scene: 'a scene', model: 'flux2-klein-4b-edit' };
  const pub = read('src/app/api/images/publish/route.ts');
  const real = [
    ...need(publishAnchor({ chapter: null, start: null, end: null, challenge }) === null, 'a new challenge ticket gives an anchor'),
    ...need(publishAnchor({ chapter: 2, start: 2, end: 2, challenge }) === null, 'an old challenge ticket (with a passage) gives an anchor'),
    ...need(JSON.stringify(publishAnchor({ chapter: 4, start: 10, end: 12 })) === '{"chapter":4,"start":10,"end":12}', 'a reader\'s image loses its anchor'),
    ...need(publishAnchor({ chapter: null, start: null, end: null }) === null && /if \(!t\.challenge && !anchor\) return no\(/.test(pub), 'an image ticket with no passage isn\'t refused'),
    ...need(!('moment' in challengeRecord(challenge)) && !('scene' in challengeRecord(challenge)) && challengeRecord(challenge).from === 'f', 'the published record keeps a moment, or loses what it started from'),
    ...need(/const anchor = publishAnchor\(t\);/.test(pub) && /if \(anchor\) await tx`insert into studio\.anchors/.test(pub) && /\.\.\.\(anchor \? \{ anchor \} : \{\}\)/.test(pub) && /challenge: challengeRecord\(t\.challenge\)/.test(pub), 'publish doesn\'t use the rule'),
  ];
  const planted = need(/if \(anchor\) await tx`insert into studio\.anchors/.test(pub.replace('if (anchor) await tx`insert into studio.anchors', 'await tx`insert into studio.anchors')), 'planted: an anchor written for every image');
  proven('N1 publish: no anchor and no moment for a challenge picture (a ticket signed earlier too); every other image keeps its anchor', real, planted);
}

// N2
{
  const route = read('src/app/api/challenge/make/route.ts');
  const signed = (src: string) => (src.split('signTicket({')[1] ?? '').split('\n  });')[0];
  const rules = (src: string) => [
    ...need(/v: 1, fid, chapter: null, start: null, end: null,/.test(signed(src)), 'the ticket carries a passage'),
    ...need(!/moment:|scene:/.test(signed(src)), 'the ticket carries a moment or its scene'),
    ...need(!/characterAnchor\(|src\.moment|anchor/.test(signed(src)), 'something is carried over from the source picture'),
  ];
  const { makeView } = await import('../src/lib/challenge/make');
  const view = makeView({ kind: 'picture', versionId: 'v', character: 'zei', url: 'u', sha256: 's', width: 1, height: 1, text: '', title: '', by: null, byFid: 1, versionNo: 1, moment: 'm07', styleElement: null } as never, { styles: [] });
  proven('N2 the make route signs no passage and no moment, and carries nothing over from the picture it starts from (moments off: the source\'s moment isn\'t offered)', [...rules(route), ...need(view.source.moment === null && view.moments.length === 0, `the source's moment: ${view.source.moment}`)], rules(route.replace('v: 1, fid, chapter: null, start: null, end: null,', 'v: 1, fid, chapter: 2, start: 2, end: 2,')));
}

// N3
{
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(read(`supabase/migrations/${f}`));
  await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
  const image = async (o: { challenge?: Record<string, unknown>; anchor?: [number, number, number]; by?: number; at: string }) => {
    const recipeId = randomUUID(), elementId = randomUUID(), versionId = randomUUID();
    const params = { user_prompt: 'Zei with a red scarf', by_name: 'naaate', ...(o.anchor ? { anchor: { chapter: o.anchor[0], start: o.anchor[1], end: o.anchor[2] } } : {}), ...(o.challenge ? { challenge: o.challenge } : {}) };
    await db.query(`insert into studio.recipes (id, source, provider, model, model_version, prompt, params, seed, cost_usd, created_by_fid) values ($1, 'in_app', 'fal.ai', 'flux2-klein-4b-edit', 'e', 'p', $2, 1, 0.01, $3)`, [recipeId, JSON.stringify(params), o.by ?? 6786]);
    await db.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, created_at) values ($1, 'snowmoon', 'image', $2, $3)`, [elementId, o.by ?? 6786, o.at]);
    await db.query(`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256, recipe_id) values ($1, $2, 1, '{"lettering":[]}', $3, $4, $5)`, [versionId, elementId, `https://pictures.example/${versionId}.jpg`, versionId.replace(/-/g, '').padEnd(64, '0'), recipeId]);
    if (o.anchor) await db.query(`insert into studio.anchors (version_id, work_id, chapter, start_idx, end_idx) values ($1, 'snowmoon', $2, $3, $4)`, [versionId, ...o.anchor]);
    return { versionId, elementId };
  };
  const reader = await image({ anchor: [2, 2, 2], at: '2026-11-10T01:00:00Z' });
  const fresh = await image({ challenge: { character: 'zei', from: 'x', fromKind: 'sheet' }, at: '2026-11-10T02:00:00Z' });
  const old = await image({ challenge: { character: 'zei', from: 'x', fromKind: 'sheet', moment: 'm07' }, anchor: [2, 2, 2], at: '2026-11-10T03:00:00Z' });
  await db.query(`insert into studio.removal_log (element_id, step, by_fid, role, reason) values ($1, 'reported', 1, 'reader', 'other')`, [fresh.elementId]);
  const server = new PGLiteSocketServer({ db, port: 54399, host: '127.0.0.1' });
  await server.start();
  const sql = postgres('postgres://postgres@127.0.0.1:54399/postgres', { prepare: false, max: 1, onnotice: () => {} });
  const D = await import('../src/lib/images/data');
  const S = sql as never;
  const byV = async (v: string) => D.imageByVersion(S, v);
  const [r, f, o] = [await byV(reader.versionId), await byV(fresh.versionId), await byV(old.versionId)];
  const feedIds = (await D.feed(S, 'new', 10)).map((x) => x.versionId);
  const ch2 = (await D.chapterImages(S, 2)).map((x) => x.versionId);
  const queue = (await D.reportQueue(S)).map((x) => String((x as { version_id?: unknown }).version_id));
  // The query of before (an inner join on the passages), for the plant.
  const [inner] = await sql<{ n: number }[]>`select count(*)::int as n from studio.element_versions v join studio.anchors a on a.version_id = v.id where v.id = ${fresh.versionId}`;
  await sql.end();
  await server.stop();
  const real = [
    ...need(r?.chapter === 2 && r.start === 2 && r.end === 2, `a reader's image: ${JSON.stringify(r && { c: r.chapter, s: r.start })}`),
    ...need(f !== null && f.chapter === null && f.start === null, 'a challenge picture with no anchor row doesn\'t show on its own page, or shows a passage'),
    ...need(o !== null && o.chapter === null, 'an old anchor row (8-10 Nov) is read for a challenge picture'),
    ...need([reader, fresh, old].every((x) => feedIds.includes(x.versionId)), `the feed: ${feedIds.length}`),
    ...need(ch2.length === 1 && ch2[0] === reader.versionId, `the reader's chapter 2 lists ${ch2.length}`),
    ...need(queue.includes(fresh.versionId), 'a reported challenge picture is missing from the report queue'),
    ...need(/left join studio\.anchors a on a\.version_id = v\.id and not \(r\.params \? 'challenge'\)/.test(read('src/lib/you.ts')), 'the You page drops pictures without a passage'),
    ...need(/left join studio\.anchors a on a\.version_id = fv\.id and not coalesce\(fr\.params \? 'challenge', false\)/.test(read('src/lib/images/designs.ts')), 'a style\'s "built on" drops pictures without a passage'),
    ...need(!/\bjoin studio\.anchors\b/.test(read('src/lib/images/data.ts').replace(/left join studio\.anchors/g, '')), 'data.ts still inner-joins the passages'),
  ];
  // Planted: the inner join of before loses a challenge picture with no anchor row.
  const planted = need(inner.n === 1, 'planted (the old inner join): the challenge picture without a passage is lost');
  proven('N3 the database: a challenge picture with no anchor shows on its page, in the feed and the report queue; an old anchor row is never read for one; the reader\'s chapters list neither; a reader\'s image keeps its passage', real, planted);
}

console.log(`\ntest:no-anchor: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
