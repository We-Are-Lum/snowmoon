/**
 * test:voice's takes section (PR 6, 2026-11-26): entering takes with their pictures, replacing, refusals, take-down,
 * report and hide (with the picture), the free picture, the cards and the gate. Run from scripts/test-voice.ts with its
 * database, routes and sign-ins. Drafted by the coding agent (Claude, a closed model by Anthropic).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type postgres from 'postgres';

type RouteMod = Record<string, (r: Request, c?: unknown) => Promise<Response>>;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export async function takesSection(o: {
  ROOT: string; STORE: string; sql: postgres.Sql; check: (label: string, ok: boolean, why?: string) => void;
  route: (p: string) => Promise<RouteMod>; as: (fid: number | null, init?: RequestInit, url?: string) => Request;
  NATE: number; GARANCE: number; STRANGER: number;
}) {
  const { ROOT, STORE, sql, check, route, as, NATE, GARANCE, STRANGER } = o;
  const sharp = (await import('sharp')).default;
  const { TAKE_PICTURES } = await import(path.join(ROOT, 'src/lib/voice/take-pictures.ts'));
  const { TAKES_WORDING: W } = await import(path.join(ROOT, 'src/lib/voice/takes-wording.ts'));
  const { hideReachesTakes, unhideReachesTakes } = await import(path.join(ROOT, 'src/lib/voice/take-hide.ts'));
  const { moderationDeps } = await import(path.join(ROOT, 'src/lib/voice/publish-deps.ts'));
  const takes = await route('takes');
  const take = await route('takes/[id]');
  const scene = await route('scene');
  const report = await route('publications/[id]/report');
  const statusRoute = await route('status');

  // Lord Ephelion's sheet, an approved picture of him (the set's placeholder id), NATE's own picture of him, and NATE's
  // picture of another character; their bytes served to the route from a folder (VOICE_TEST_PICTURE_DIR).
  const dir = mkdtempSync(path.join(os.tmpdir(), 'voice-pictures-'));
  process.env.VOICE_TEST_PICTURE_DIR = dir;
  const jpg = async (bg: string) => sharp({ create: { width: 600, height: 400, channels: 3, background: bg } }).jpeg().toBuffer();
  const pics: Record<string, Buffer> = { 'set.jpg': await jpg('#334455'), 'own.jpg': await jpg('#554433'), 'other.jpg': await jpg('#335544') };
  for (const [n, b] of Object.entries(pics)) writeFileSync(path.join(dir, n), b);
  const url = (n: string) => `https://pictures.snowmoon.party/images/readers/${n}`;
  const [eph] = await sql`insert into studio.entities (work_id, kind, name) values ('snowmoon', 'character', 'Lord Ephelion') returning id`;
  const [sheet] = await sql`insert into studio.elements (work_id, element_type, created_by_fid, entity_id, status) values ('snowmoon', 'design', ${NATE}, ${eph.id}, 'published') returning id`;
  const front = { url: url('set.jpg'), sha256: sha(pics['set.jpg']) };
  const [sheetV] = await sql`insert into studio.element_versions (element_id, version_no, body) values (${sheet.id}, 1, ${sql.json({ title: 'Lord Ephelion', text: 'Lord Ephelion.', samples: [], views: { front }, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null })}) returning id`;
  const setVersion = TAKE_PICTURES.set[0].versionId as string;
  const picture = async (id: string | null, by: number, file: string, sheetVersion: string) => {
    const [e] = await sql`insert into studio.elements (work_id, element_type, created_by_fid, status) values ('snowmoon', 'image', ${by}, 'published') returning id`;
    const [v] = id
      ? await sql`insert into studio.element_versions (id, element_id, version_no, body, asset_url, asset_sha256) values (${id}, ${e.id}, 1, '{}', ${url(file)}, ${sha(pics[file])}) returning id`
      : await sql`insert into studio.element_versions (element_id, version_no, body, asset_url, asset_sha256) values (${e.id}, 1, '{}', ${url(file)}, ${sha(pics[file])}) returning id`;
    await sql`insert into studio.links (from_version_id, to_version_id, kind) values (${v.id}, ${sheetVersion}, 'uses')`;
    return { element: String(e.id), version: String(v.id) };
  };
  const setPic = await picture(setVersion, GARANCE, 'set.jpg', String(sheetV.id));
  const ownPic = await picture(null, NATE, 'own.jpg', String(sheetV.id));
  const otherPic = await picture(null, NATE, 'other.jpg', '00000009-0000-4000-8000-000000000103');

  // Converted takes, as the site keeps them: a performance draft, checked, with its audio in the private store.
  const draft = async (fid: number, speechId: string) => {
    const id = randomUUID();
    const audio = randomBytes(4000);
    const key = `voice-drafts/${id}/0-${sha(audio)}.mp3`;
    mkdirSync(path.dirname(path.join(STORE, key)), { recursive: true });
    writeFileSync(path.join(STORE, key), audio);
    const recipe = { provider: 'elevenlabs', model: 'eleven_multilingual_sts_v2', takes: [{ takeSha256: 'c'.repeat(64) }], check: { sentences: 3, matched: 3, unmatched: [] }, speech: { id: speechId, title: speechId }, preset: { id: 'ephelion-warm-lecturer', name: 'Warm, measured (American)' } };
    await sql`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values (${id}, ${fid}, 'performance', ${speechId}, 'ephelion-warm-lecturer', ${sql.json(recipe)})`;
    await sql`insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256, seconds) values (${id}, 0, 'take', ${key}, ${audio.length}, ${sha(audio)}, 12)`;
    return id;
  };
  const enter = (fid: number, draftId: string, pic: Record<string, unknown>, replace = false) =>
    takes.POST(as(fid, { method: 'POST', body: JSON.stringify({ draftId, picture: pic, named: true, replace }) }));
  const pubOf = async (id: string) => (await sql`select kind, speech_id, picture, files, taken_down_at, hidden_at from studio.voice_publications where id = ${id}`)[0];

  // The gate: someone the voice switch doesn't let in.
  check('TK. the gate: someone not let in gets 404 on the takes and the free picture', (await takes.GET(as(STRANGER))).status === 404 && (await scene.POST(as(STRANGER, { method: 'POST', body: '{}' }))).status === 404);
  const opts = (await (await takes.GET(as(NATE))).json()) as { set: { id: string; url: string | null }[]; scenes: unknown[]; own: { id: string }[]; placeholder: boolean };
  check('TK. the entry step offers the approved set (a placeholder for now), the three scenes, and NATE\'s own picture of him only', opts.placeholder && opts.set.length === 1 && opts.scenes.length === 3 && opts.own.length === 1 && opts.own[0].id === ownPic.version, JSON.stringify(opts));

  // Enter with the approved picture.
  const d1 = await draft(NATE, 'doing-fine-v2');
  let r = await enter(NATE, d1, { source: 'set', id: 'garance-remix' });
  let j = (await r.json()) as { id?: string; url?: string; error?: string; reason?: string };
  const t1 = String(j.id);
  const p1 = await pubOf(t1);
  check('TK. entering with an approved picture: a take, its audio and picture copied under takes/<id>/, public', r.status === 200 && p1?.kind === 'take' && (p1.files as { key: string }[]).every((f) => f.key.startsWith(`takes/${t1}/`) && existsSync(path.join(STORE, 'public', f.key))) && (p1.picture as { source: string; version: string }).version === setVersion, JSON.stringify(j));
  const rec = (await (await take.GET(as(null), { params: Promise.resolve({ id: t1 }) })).json()) as { recipe: { picture: { labels: string[]; by: string }; performer: unknown; voice: { takes: unknown[] } } };
  check('TK. ... its public recipe: the picture\'s labels and credit, the performer, the voice; never a recording', rec.recipe.picture.by === '@garance' && rec.recipe.picture.labels.includes(W.labelAi) && Array.isArray(rec.recipe.voice.takes) && !JSON.stringify(rec).includes('recording'));

  // A second take of the same speech: asked first; replacing takes the old one down in the same call.
  const d2 = await draft(NATE, 'doing-fine-v2');
  r = await enter(NATE, d2, { source: 'preset', id: 'study' });
  j = await r.json();
  check('TK. a second take of the same speech is asked first (409 "entered"), nothing published', r.status === 409 && j.reason === 'entered' && (await sql`select count(*)::int n from studio.voice_publications where draft_id = ${d2}`)[0].n === 0);
  r = await enter(NATE, d2, { source: 'preset', id: 'study' }, true);
  j = await r.json();
  const t2 = String(j.id);
  check('TK. ... "enter this one instead": the new one is live with a ready-made scene, the old one taken down', r.status === 200 && (await pubOf(t1)).taken_down_at !== null && (await pubOf(t2)).taken_down_at === null && (await pubOf(t2)).picture.source === 'preset');

  // Refused pictures.
  const d3 = await draft(NATE, 'natural-way-v2');
  r = await enter(NATE, d3, { source: 'own', id: otherPic.version });
  check('TK. a picture of another character is refused', r.status === 400 && (await r.json()).error === W.notOfHim);
  r = await enter(NATE, d3, { source: 'own', id: setPic.version });
  check('TK. someone else\'s picture as "own" is refused', r.status === 403 && (await r.json()).error === W.notYours);
  r = await enter(NATE, d3, { source: 'own', id: ownPic.version });
  j = await r.json();
  const t3 = String(j.id);
  check('TK. NATE\'s own published picture of him is accepted', r.status === 200 && (await pubOf(t3)).picture.version === ownPic.version);

  // The free picture (GPT Image: a country OpenAI serves, as the local runs set it).
  process.env.CLOSED_MODELS_TEST_COUNTRY = 'FR';
  const make = (fid: number, description: string) => scene.POST(as(fid, { method: 'POST', body: JSON.stringify({ description }) }));
  const row = async (fid: number) => (await sql`select made_at, picture_sha256 from studio.ephelion_scene_pictures where person = ${fid}`)[0];
  r = await make(NATE, 'A coat, a sign that reads "VOTE"');
  check('TK. free picture: words in quotation marks are refused first (Nate\'s line), nothing claimed', r.status === 422 && (await r.json()).error === W.refusedQuotes && !(await row(NATE)));
  r = await make(NATE, 'REFUSE-ME a coat on a rooftop');
  check('TK. ... refused by the rules: Nate\'s line, and the free picture isn\'t used', r.status === 422 && (await r.json()).error === W.refusedRules && !(await row(NATE)));
  r = await make(NATE, 'FAIL-ME a coat on a rooftop');
  check('TK. ... didn\'t come back: Nate\'s line, and the free picture isn\'t used', r.status === 502 && (await r.json()).error === W.failed && !(await row(NATE)));
  r = await make(NATE, 'A grey overcoat, on a windy rooftop at night');
  const made = (await r.json()) as { image: string; ticket: string; sha256: string; recipe: { reference: { versionId: string } } };
  check('TK. ... made: recorded for good with its sha256, his sheet as the reference, the picture and its record back to the device', r.status === 200 && (await row(NATE))?.picture_sha256 === made.sha256 && made.recipe.reference.versionId === String(sheetV.id) && /^data:image\//.test(made.image));
  r = await make(NATE, 'Another coat');
  check('TK. ... a second one: "You\'ve made your free picture." (Nate\'s line)', r.status === 409 && (await r.json()).error === W.used);
  const both = await Promise.all([make(GARANCE, 'A coat at dawn'), make(GARANCE, 'A coat at dusk')]);
  check('TK. ... two clicks at once make one picture: the other is refused', both.map((x) => x.status).sort().join(',') === '200,409' && (await row(GARANCE))?.made_at !== null);
  const d4 = await draft(NATE, 'last-five-years-v3');
  r = await enter(NATE, d4, { source: 'own-scene', ticket: made.ticket, image: made.image.replace('A', 'B') });
  check('TK. a free picture whose bytes aren\'t the one made is refused', r.status === 400);
  r = await enter(NATE, d4, { source: 'own-scene', ticket: made.ticket, image: made.image });
  j = await r.json();
  const t4 = String(j.id);
  check('TK. ... the free picture they made goes into the take, with its description in the recipe', r.status === 200 && (await pubOf(t4)).picture.source === 'own-scene' && (await pubOf(t4)).picture.sha256 === made.sha256);

  // The cards: one take a person a speech, newest first.
  const d5 = await draft(GARANCE, 'natural-way-v2');
  await enter(GARANCE, d5, { source: 'preset', id: 'crowd' });
  const st = (await (await statusRoute.GET(as(NATE))).json()) as { takes: Record<string, { id: string; performer: string | null }[]> };
  check('TK. the cards: each speech\'s live takes, at most one a person, newest first', st.takes['doing-fine-v2']?.length === 1 && st.takes['doing-fine-v2'][0].id === t2 && st.takes['natural-way-v2']?.length === 2 && st.takes['natural-way-v2'][0].id !== t3, JSON.stringify(st.takes));

  // Report and hide, with the picture.
  r = await report.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ reason: 'spam' }) }), { params: Promise.resolve({ id: t3 }) });
  check('TK. a take can be reported (#225\'s report, extended to takes)', r.status === 200);
  const d6 = await draft(GARANCE, 'doing-fine-v2');
  const t6 = String(((await (await enter(GARANCE, d6, { source: 'own', id: setPic.version })).json()) as { id: string }).id);
  const before = (await pubOf(t6)).files as { key: string }[];
  await hideReachesTakes(sql, ownPic.element, NATE, 'moderator', moderationDeps());
  await hideReachesTakes(sql, setPic.element, NATE, 'moderator', moderationDeps());
  check('TK. hiding a picture hides the takes that copied it, and moves their files to the private bucket', (await pubOf(t3)).hidden_at !== null && (await pubOf(t6)).hidden_at !== null && before.every((f) => !existsSync(path.join(STORE, 'public', f.key)) && existsSync(path.join(STORE, 'voice-hidden', f.key))));
  await unhideReachesTakes(sql, setPic.element, NATE, 'moderator', moderationDeps());
  await unhideReachesTakes(sql, ownPic.element, NATE, 'moderator', moderationDeps());
  check('TK. unhiding the picture brings back the take hidden only because of it, files back; the one with its own report stays hidden', (await pubOf(t6)).hidden_at === null && before.every((f) => existsSync(path.join(STORE, 'public', f.key))) && (await pubOf(t3)).hidden_at !== null);

  // Take-down.
  r = await take.DELETE(as(GARANCE, { method: 'DELETE' }), { params: Promise.resolve({ id: t2 }) });
  check('TK. someone else can\'t take a take down', r.status === 404 && (await pubOf(t2)).taken_down_at === null);
  const files2 = (await pubOf(t2)).files as { key: string }[];
  r = await take.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: t2 }) });
  check('TK. its performer takes it down: its files go, and its draft is a draft again', r.status === 200 && (await pubOf(t2)).taken_down_at !== null && files2.every((f) => !existsSync(path.join(STORE, 'public', f.key))) && (await sql`select published_at from studio.voice_drafts where id = ${d2}`)[0].published_at === null);

  // The code: the free picture counts in the free daily budget; Nate's lines on screen; the description box labelled.
  const fs = await import('node:fs');
  const free = fs.readFileSync(path.join(ROOT, 'src/lib/voice/free-scene.ts'), 'utf8');
  const entry = fs.readFileSync(path.join(ROOT, 'src/components/ephelion-entry.tsx'), 'utf8');
  check('TK. the free picture is paid as a free picture (no pool: funded free, under the free daily cap), GPT Image only', /spend: \{ model: \{ id: m\.allowlistId, host: m\.call\.host \}, reserveUsd: worst \}/.test(free) && /export const GPT_IMAGE = 'gpt-image-2\.5-sunburst'/.test(free) && !/pool:/.test(free.replace(/\/\/.*$/gm, '')));
  check('TK. the entry step shows Nate\'s lines and labels the description box (LocalTextField)', /W\.underButton/.test(entry) && /W\.used/.test(entry) && /<LocalTextField id="er-scene"/.test(entry) && W.underButton === 'One free picture per account. If it’s refused or doesn’t come back, it isn’t used. If it comes out differently than you hoped, it is.');
}
