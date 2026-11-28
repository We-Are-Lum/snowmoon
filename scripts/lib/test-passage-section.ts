/**
 * test:voice's passages section (Nate, 2026-11-27: "A passage counts as the person's one live take of that speech, at
 * least 3 sentences, judged the same as a whole take with its "Passage: sentences N–M" label always shown"). The range
 * rules, the time limit, the convert route (refusals, the word check over the passage only, the recipe), the label on
 * the take, its page, its card and the recorder, and one live take per speech either way. Run from scripts/test-voice.ts
 * after the takes section, with its database, routes and sign-ins. Drafted by the coding agent (Claude, a closed model by
 * Anthropic).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';

type RouteMod = Record<string, (r: Request, c?: unknown) => Promise<Response>>;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
// The database returns jsonb with its keys in its own order: compare the fields.
const same = (p: unknown, from: number, to: number) => (p as { from?: number; to?: number } | undefined)?.from === from && (p as { to?: number } | undefined)?.to === to;

export async function passageSection(o: {
  ROOT: string; STORE: string; sql: postgres.Sql; check: (label: string, ok: boolean, why?: string) => void;
  route: (p: string) => Promise<RouteMod>; as: (fid: number | null, init?: RequestInit, url?: string) => Request;
  takeForm: (t: Uint8Array, extra?: Record<string, string>) => FormData; stubCalls: () => number;
  GARANCE: number;
}) {
  const { ROOT, STORE, sql, check, route, as, takeForm, stubCalls, GARANCE } = o;
  const P = await import(path.join(ROOT, 'src/lib/voice/passage.ts'));
  const { speeches } = await import(path.join(ROOT, 'src/lib/voice/speech.ts'));
  const { takeMaxSeconds } = await import(path.join(ROOT, 'src/lib/voice/spoken.ts'));
  const convert = await route('convert');
  const takes = await route('takes');
  const take = await route('takes/[id]');
  const statusRoute = await route('status');

  // The rules: at least 3 sentences in a row, inside the speech; the whole speech is no passage.
  const bad = [[0, 1], [4, 2], [-1, 2], [0, 99], [1.5, 4], ['a', 4], [3, '']];
  check('PA. a passage is at least 3 sentences in a row within the speech: shorter, backwards, outside or not whole numbers are refused',
    bad.every(([f, t]) => P.readPassage(f, t, 20) === 'bad') && JSON.stringify(P.readPassage('2', '4', 20)) === '{"from":2,"to":4}' && P.readPassage(null, null, 20) === null && P.readPassage('0', '19', 20) === null && P.readPassage(0, 2, 3) === null);
  check('PA. the label, numbered from 1: "Passage: sentences 3–5"', P.passageLabel({ from: 2, to: 4 }) === 'Passage: sentences 3–5' && P.recipePassageLabel({ id: 'x', passage: { from: 2, to: 4 } }) === 'Passage: sentences 3–5' && P.recipePassageLabel({ id: 'x' }) === null);
  check('PA. the time limit scales to the passage\'s words, with 15 s to spare, never over the speech\'s',
    P.passageMaxSeconds(180, 100, 400) === 60 && P.passageMaxSeconds(180, 390, 400) === 180 && P.passageMaxSeconds(180, 400, 400) === 180 && P.passageMaxSeconds(120, 1, 400) === 16);

  // The convert route: the passage is checked before anything is sent.
  const sp = speeches().find((x: { id: string }) => x.id === 'ephelion-c13-b64');
  const count = sp.sentences.length;
  const wordsOf = (xs: { text: string }[]) => xs.reduce((a, x) => a + P.wordsIn(x.text), 0);
  const pass = { from: 2, to: 5 };
  const limit = P.passageMaxSeconds(takeMaxSeconds(sp.id), wordsOf(P.passageSentences(sp.sentences, pass)), wordsOf(sp.sentences));
  const freshDay = () => sql`update studio.voice_asks set at = now() - interval '2 days' where fid = ${GARANCE}`;
  await freshDay();
  const calls0 = stubCalls();
  const refused = [];
  for (const [f, t] of [['0', '1'], ['5', '3'], ['2', String(count)], ['-1', '3']]) {
    const r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { passageFrom: f, passageTo: t, seconds: '10' }) }));
    refused.push(r.status === 400 && /at least 3/.test(String(((await r.json()) as { error?: string }).error)));
  }
  let r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { passageFrom: '2', passageTo: '5', sentence: '3', seconds: '5' }) }));
  const sentenceRefused = r.status === 400;
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { passageFrom: '2', passageTo: '5', seconds: String(limit + 2) }) }));
  const tooLong = r.status === 413;
  check('PA. the server refuses a passage under 3 sentences, backwards or outside the speech (400), a redone sentence sent as a passage (400), and a passage over its scaled limit (413), all before any call to ElevenLabs',
    refused.every(Boolean) && sentenceRefused && tooLong && stubCalls() === calls0, JSON.stringify({ refused, sentenceRefused, tooLong, limit }));

  await freshDay();
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(40_000), { passageFrom: '2', passageTo: '5', seconds: String(Math.min(limit, 40)) }) }));
  const j = (await r.json()) as { draftId?: string; checks?: { n: number }[] | null; error?: string };
  const [d] = j.draftId ? await sql`select recipe from studio.voice_drafts where id = ${j.draftId}` : [];
  const rec = d?.recipe as { speech: { passage?: unknown }; check: { sentences: number; unmatched: number[] } | null; timeline?: { sentences: { n: number }[] } } | undefined;
  check('PA. a passage is converted and kept as a whole take: the word check covers only its sentences (by the speech\'s numbers)',
    r.status === 200 && (j.checks ?? []).map((x) => x.n).join(',') === '2,3,4,5' && rec?.check?.sentences === 4 && (rec?.check?.unmatched ?? []).every((n) => n >= 2 && n <= 5), JSON.stringify({ status: r.status, err: j.error, checks: j.checks?.map((x) => x.n), check: rec?.check }));
  // (An improvised take's strip numbers the transcript's own sentences; word for word, the speech's.)
  const wfw = (rec as { spoken?: { kind?: string } } | undefined)?.spoken?.kind !== 'improvised';
  check('PA. ... and its recipe keeps the passage beside the speech', same(rec?.speech.passage, pass.from, pass.to) && (!wfw || (rec?.timeline?.sentences ?? []).every((x) => x.n >= 2 && x.n <= 5)), JSON.stringify({ passage: rec?.speech.passage, wfw, strip: rec?.timeline?.sentences?.map((x) => x.n) }));
  await freshDay();

  // Entering: a passage counts as the person's one live take of the speech, either way round.
  const draft = async (passage: { from: number; to: number } | null) => {
    const id = randomUUID();
    const audio = randomBytes(4000);
    const key = `voice-drafts/${id}/0-${sha(audio)}.mp3`;
    mkdirSync(path.dirname(path.join(STORE, key)), { recursive: true });
    writeFileSync(path.join(STORE, key), audio);
    const recipe = { provider: 'elevenlabs', model: 'eleven_multilingual_sts_v2', takes: [{ takeSha256: 'd'.repeat(64) }], check: { sentences: 3, matched: 3, unmatched: [] }, speech: { id: sp.id, title: sp.title, ...(passage ? { passage } : {}) }, preset: { id: 'ephelion-warm-lecturer', name: 'Warm, measured (American)' } };
    await sql`insert into studio.voice_drafts (id, fid, kind, speech_id, preset_id, recipe) values (${id}, ${GARANCE}, 'performance', ${sp.id}, 'ephelion-warm-lecturer', ${sql.json(recipe)})`;
    await sql`insert into studio.voice_draft_audio (draft_id, n, role, storage_key, bytes, sha256, seconds) values (${id}, 0, 'take', ${key}, ${audio.length}, ${sha(audio)}, 12)`;
    return id;
  };
  const enter = (draftId: string, replace = false) => takes.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ draftId, picture: { source: 'preset', id: 'study' }, named: true, replace }) }));
  const live = async () => (await sql`select id::text from studio.voice_publications where fid = ${GARANCE} and speech_id = ${sp.id} and kind = 'take' and taken_down_at is null`).map((x) => x.id as string);
  r = await enter(await draft(null));
  const wholeId = String(((await r.json()) as { id?: string }).id);
  const dP = await draft({ from: 3, to: 6 });
  r = await enter(dP);
  const asked = r.status === 409 && ((await r.json()) as { reason?: string }).reason === 'entered';
  r = await enter(dP, true);
  const passId = String(((await r.json()) as { id?: string }).id);
  const afterPassage = await live();
  check('PA. a passage take is the person\'s one live take of the speech: asked first (409), then it replaces the whole take',
    asked && r.status === 200 && afterPassage.length === 1 && afterPassage[0] === passId && passId !== wholeId, JSON.stringify({ asked, afterPassage }));
  const pub = (await (await take.GET(as(null), { params: Promise.resolve({ id: passId }) })).json()) as { recipe: { take: { label: string; passage: string | null }; speech: { passage?: unknown } } };
  check('PA. ... its public recipe carries the passage and its label, beside the usual label', pub.recipe.take.passage === 'Passage: sentences 4–7' && pub.recipe.take.label === 'word for word' && same(pub.recipe.speech.passage, 3, 6), JSON.stringify({ take: pub.recipe?.take, passage: pub.recipe?.speech?.passage }));
  const st = (await (await statusRoute.GET(as(GARANCE))).json()) as { takes: Record<string, { id: string; passage: string | null }[]> };
  const card = st.takes[sp.id]?.find((x) => x.id === passId);
  check('PA. ... the card\'s take carries the label', card?.passage === 'Passage: sentences 4–7', JSON.stringify(st.takes[sp.id]));
  r = await enter(await draft(null), true);
  const backId = String(((await r.json()) as { id?: string }).id);
  const afterWhole = await live();
  check('PA. ... and a whole take replaces a passage take the same way', r.status === 200 && afterWhole.length === 1 && afterWhole[0] === backId);
  const stW = (await (await statusRoute.GET(as(GARANCE))).json()) as { takes: Record<string, { id: string; passage: string | null }[]> };
  check('PA. ... a whole take shows no passage label', stW.takes[sp.id]?.find((x) => x.id === backId)?.passage === null);

  // The label wherever the take is shown, and nothing sorts by it (P7).
  const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
  const page = src('src/app/ephelion/take/[id]/page.tsx');
  const landing = src('src/components/ephelion-landing.tsx');
  const entry = src('src/components/ephelion-entry.tsx');
  const recorder = src('src/components/ephelion-recorder.tsx');
  const takesLib = src('src/lib/voice/takes.ts');
  check('PA. the label shows on the take\'s page, its title (the Share card) and its share sheet, and its words are the passage\'s',
    /const passage = recipePassageLabel\(r\.speech\)/.test(page) && /\[r\.take\?\.label \?\? 'word for word', passage\]/.test(page) && /recipePassageLabel\(speech\)\]\.filter\(Boolean\)\.join/.test(page) && /title=\{passage \?/.test(page) && /speech: \{ id: t\.speechId, passage: r\.speech\?\.passage \}/.test(page));
  check('PA. ... on the landing card\'s latest take and More recordings (one row component), the entry step and Entered, and the recorder',
    /\[t\.voice, t\.label, t\.passage\]/.test(landing) && (entry.match(/data-slot="passage-label"/g) ?? []).length === 2 && /passage=\{passageText\}/.test(recorder) && /data-slot="passage-label"/.test(recorder));
  check('PA. ... and nothing orders takes by it (P7: newest first, one a person)', !/order by[^`]*passage/i.test(takesLib) && /order by speech_id, fid, published_at desc/.test(takesLib));
  check('PA. the recorder sends the passage only with a whole take, keeps it with the take on this device, and asks before changing it with a take there',
    /else if \(passage\) \{\s*form\.set\('passageFrom'/.test(recorder) && /saveTake\(fid, speech\.id, out\.blob, out\.seconds, passage\)/.test(recorder) && /if \(take\) return setConfirmPassage/.test(recorder) && /passageMaxSeconds\(speechMax/.test(recorder));
}
