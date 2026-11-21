/**
 * The Ephelion voice slice 1 (DRAFT, branch ephelion-voice). One check per point:
 *  S. the switch: off in the committed config; every route 401 signed out, 404 to anyone not let in; on Vercel the
 *     local test switch and the stub address are ignored; a real ElevenLabs call is refused in the local tests;
 *  W. the speech: c13-b64 word for word, cut into sentences; the word check (case, punctuation, dashes, numbers);
 *  C. the consent: own-voice-v2 (the draft), agreed once, and a tick for each recording;
 *  V. convert: the take goes to ElevenLabs once, its history item is deleted, nothing of it is stored;
 *  T. transcribe: only converted audio; the mismatch shows; a redone sentence passes;
 *  A. accept: a private draft with its recipe (voice, model, settings, each take's sha256); forged files and records
 *     refused; no raw take anywhere in the database;
 *  R. the ready-made reading; D. drafts are their own person's only;
 *  $. costs in studio.voice_costs (no person), the caps, the per-person limit, and the 20%-over-estimate stop;
 *  M. config/models.json lists the four ElevenLabs models, closed, with their maker and what each keeps;
 *  P. P1h: the real flow passes and each planted violation is caught.
 *
 *   npm run test:voice
 *
 * In-memory Postgres (PGlite, every migration, NEXT_ephelion_voice included); ElevenLabs is the local stub
 * (scripts/lib/elevenlabs-stub.ts). No network, no spending.
 */
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { startStub } from './lib/elevenlabs-stub';
import { voiceProof, VOICE_PLANTS } from './lib/voice-proof';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};

const NATE = 6786;
const GARANCE = 193912;
const STRANGER = 4242;
const PG_PORT = 54381;
const STUB_PORT = 54391;

const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
// Published sheets to choose from (slice 2): one style, one character.
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const SHEET_BODY = (title: string, text: string) => JSON.stringify({ title, text, samples: [], views: {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null });
await pg.query(`insert into studio.entities (id, work_id, kind, name) values ('00000001-0000-4000-8000-000000000101','snowmoon','style','Ink and wash'), ('00000001-0000-4000-8000-000000000102','snowmoon','character','Ephelion')`);
await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000008-0000-4000-8000-000000000101','snowmoon','design',6786,'00000001-0000-4000-8000-000000000101','published'), ('00000008-0000-4000-8000-000000000102','snowmoon','design',6786,'00000001-0000-4000-8000-000000000102','published')`);
await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ('00000009-0000-4000-8000-000000000101','00000008-0000-4000-8000-000000000101',1,$1), ('00000009-0000-4000-8000-000000000102','00000008-0000-4000-8000-000000000102',1,$2)`, [
  SHEET_BODY('Ink and wash', 'Ink and wash: loose black ink lines, grey washes, paper texture.'),
  SHEET_BODY('Ephelion', 'Lord Ephelion: a tall man in a dark coat with a high collar.'),
]);
const pgServer = new PGLiteSocketServer({ db: pg, port: PG_PORT, host: '127.0.0.1' });
await pgServer.start();
const stub = await startStub(STUB_PORT);

const STORE = mkdtempSync(path.join(os.tmpdir(), 'voice-store-'));
const storeFiles = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d, { withFileTypes: true })) n.isDirectory() ? walk(path.join(d, n.name)) : out.push(path.relative(STORE, path.join(d, n.name))); };
  if (existsSync(STORE)) walk(STORE);
  return out;
};
Object.assign(process.env, {
  VOICE_TEST_STORE: STORE,
  STUDIO_DATABASE_URL: `postgres://studio_writer@127.0.0.1:${PG_PORT}/postgres`,
  VOICE_TEST_ON: '1',
  VOICE_TEST_FID: `${NATE},${GARANCE},${STRANGER}`,
  ELEVENLABS_BASE_URL: `http://127.0.0.1:${STUB_PORT}`,
  VOICE_TICKET_SECRET: 'test-voice-ticket-secret-0123456789',
});
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.ELEVENLABS_API_KEY;

const { VOICE } = await import('../src/lib/config');
const { voiceAllowed, voiceTestOn, elevenLabsBase } = await import('../src/lib/voice/flag');
type Shot = import('../src/lib/voice/board').Shot;
const { speeches } = await import('../src/lib/voice/speech');
const { checkSpeech, norm, wordsOf } = await import('../src/lib/voice/match');
const { voiceConsentWording } = await import('../src/lib/voice/consent');
const { db } = await import('../src/lib/db');
const sql = db()!;

const route = async (p: string) => (await import(path.join(ROOT, 'src/app/api/voice', p, 'route.ts'))) as Record<string, (r: Request, c?: unknown) => Promise<Response>>;
const status = await route('status');
const consent = await route('consent');
const convert = await route('convert');
const transcribe = await route('transcribe');
const accept = await route('accept');
const reading = await route('reading');
const draftAudioRoute = await route('drafts/[id]/[n]');
const draftRoute = await route('drafts/[id]');
const boards = await route('boards');
const boardPicture = await route('boards/picture');
const boardKeep = await route('boards/keep');
const board = await import('../src/lib/voice/board');
const as = (fid: number | null, init: RequestInit = {}, url = 'http://localhost/api/voice/x') =>
  new Request(url, { ...init, headers: { ...(init.headers ?? {}), ...(fid ? { authorization: `Bearer voice-test-${fid}` } : {}) } });
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

// S. The switch.
check('S. committed: the admin trial and the open switch are both off', VOICE.adminTrial === false && VOICE.open === false);
check('S. the local test switch is on here', voiceTestOn());
for (const [k, v] of [['VERCEL', '1'], ['VERCEL_ENV', 'production'], ['VERCEL_ENV', 'preview']] as const) {
  process.env[k] = v;
  check(`S. with ${k}=${v} the test switch is off, nobody is let in, and the stub address is ignored`, !voiceTestOn() && !voiceAllowed(NATE) && elevenLabsBase() === 'https://api.elevenlabs.io');
  delete process.env[k];
}
check('S. a non-admin is not let in during the admin trial', !voiceAllowed(STRANGER) && voiceAllowed(NATE) && voiceAllowed(GARANCE));
const routeFiles = ['status', 'consent', 'convert', 'transcribe', 'accept', 'reading', 'drafts/[id]/[n]', 'drafts/[id]', 'boards', 'boards/picture', 'boards/keep'];
for (const r of routeFiles) {
  const mod = await route(r);
  const h = mod.POST ?? mod.GET ?? mod.DELETE;
  const method = mod.POST ? 'POST' : mod.GET ? 'GET' : 'DELETE';
  const ctx = { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000', n: '0' }) };
  const out = await h(as(null, { method }), ctx);
  const stranger = await h(as(STRANGER, { method }), ctx);
  check(`S. ${r}: 401 signed out, 404 to a non-admin`, out.status === 401 && stranger.status === 404, `${out.status} ${stranger.status}`);
  if (mod.GET && mod.POST) {
    const g = await mod.GET(as(STRANGER), ctx);
    check(`S. ${r} GET: 404 to a non-admin`, g.status === 404);
  }
}
process.env.VOICE_TEST_ON = '';
// Off, the test sign-in isn't honoured either (401); a real admin sign-in is let in by nothing (404, voiceAllowed).
check('S. with the switch off, an admin isn\'t let in either', !voiceAllowed(NATE) && [401, 404].includes((await status.GET(as(NATE))).status));
process.env.VOICE_TEST_ON = '1';
for (const f of ['src/app/storyboard/record/page.tsx']) check(`S. ${f} is the site's usual not-found for everyone`, /notFound\(\);/.test(readFileSync(path.join(ROOT, f), 'utf8')));
{
  const saved = process.env.ELEVENLABS_BASE_URL;
  delete process.env.ELEVENLABS_BASE_URL;
  const { speechToSpeech } = await import('../src/lib/voice/elevenlabs');
  let refused = false;
  await speechToSpeech(new Uint8Array(10), 'audio/webm', 'x').catch((e) => (refused = /refused/.test(String(e))));
  check('S. in the local tests a real ElevenLabs call is refused (no spending)', refused);
  process.env.ELEVENLABS_BASE_URL = saved;
}

// W. The speech and the word check.
const speech = speeches()[0];
const ch13 = JSON.parse(readFileSync(path.join(ROOT, 'content/snowmoon/text/chapter-13.json'), 'utf8')) as { blocks: { idx: number; content: string }[] };
const blockText = ch13.blocks.find((b) => b.idx === 64)!.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
check('W. the speech is c13-b64, word for word (title, letter and sign-off)', speech.paragraphs.join(' ').replace(/\s+/g, ' ') === blockText, `${speech.paragraphs.join(' ').slice(0, 60)} | ${blockText.slice(0, 60)}`);
check('W. its sentences hold all its words, in order', speech.sentences.flatMap((s) => s.words).join(' ') === wordsOf(speech.paragraphs.join(' ')).join(' '));
check('W. it is marked a stand-in from the book, block c13-b64', speech.standIn && speech.source.kind === 'book' && (speech.source as { block: string }).block === 'c13-b64');
check('W. numbers, case, punctuation and apostrophes compare as words', norm('4') === norm('four') && norm("That's") === norm('thats') && norm('Veridia.') === norm('veridia') && wordsOf('Dreadknot - but').length === 2);
{
  const ss = speech.sentences.slice(0, 3);
  const heard = ss.flatMap((s) => s.words).map((w, i) => ({ text: w, start: i, end: i + 0.5 }));
  check('W. a perfect transcript passes every sentence', checkSpeech(ss, heard).every((c) => c.ok));
  const wrong = heard.map((h, i) => (i === ss[0].words.length + 1 ? { ...h, text: 'banana' } : h)).filter((_, i) => i !== heard.length - 1);
  const c = checkSpeech(ss, wrong);
  check('W. a wrong word fails its own sentence, with what was heard', !c[1].ok && c[1].missing.length === 1 && c[1].extra.includes('banana') && c[0].ok, JSON.stringify(c[1]));
  check('W. a missing last word fails the last sentence only', !c[2].ok && c[2].missing.length === 1 && c[0].ok);
  check('W. each sentence knows where it is in the audio', c[1].start !== null && c[1].end !== null && c[1].start! < c[1].end!);
  const one = speech.sentences[7];
  const c7 = checkSpeech([one], one.words.map((w, i) => ({ text: w, start: i, end: i + 0.5 })));
  check('W. one sentence on its own (a redo) is checked by its own number', c7.length === 1 && c7[0].n === 7 && c7[0].ok);
  // Names by sound (2026-11-21): what scribe heard without key terms.
  const sign = speech.sentences.filter((x) => /Lord Ephelion|Dreadknot's taxes/.test(x.text));
  const heardAs = (txt: string) => txt.split(' ').map((w, i) => ({ text: w, start: i, end: i + 0.5 }));
  const lord = sign.find((x) => x.text === 'Lord Ephelion')!;
  const cA = checkSpeech([lord], heardAs('Lord Aphelion'), speech.names);
  const cM = checkSpeech([lord], heardAs('Mortifelian'), speech.names);
  const dread = sign.find((x) => /Dreadknot's taxes/.test(x.text))!;
  const cD = checkSpeech([dread], heardAs(dread.text.replace(/Dreadknot/g, 'Dreadnought').replace(' 4 ', ' four ')), speech.names);
  const cX = checkSpeech([lord], heardAs('Lord Venice'), speech.names);
  check('W. names heard by sound pass, and are listed: "Lord Aphelion", "Mortifelian", "Dreadnought"', cA[0].ok && cA[0].bySound[0]?.heard === 'Aphelion' && cM[0].ok && cM[0].bySound[0]?.heard === 'Mortifelian' && cD[0].ok && cD[0].bySound.length >= 1, JSON.stringify([cA, cM, cD].map((c) => c[0])));
  check('W. ... a different word still fails ("Lord Venice")', !cX[0].ok);
  check('W. ... and only listed names are matched by sound (an ordinary word needs its spelling)', !checkSpeech([dread], heardAs(dread.text.replace('taxes', 'Texas')), speech.names)[0].ok);
}

// C. The consent.
const wording = voiceConsentWording();
const own = JSON.parse(readFileSync(path.join(ROOT, 'config/consent-own-voice.json'), 'utf8'));
check('C. the page shows own-voice-v2, the draft, with Nate\'s fixes', wording.version === 'own-voice-v2' && wording.text[0] === 'You record a speech. Your recording is converted into a character\'s voice, and only the converted speech can be published.' && /against the speech\.$/.test(wording.text[3]));
check('C. own-voice-v1 is still the file\'s current, untouched', own.current === 'own-voice-v1' && Boolean(own.versions['own-voice-v1']));
check('C. the bracketed training line is still there (Nate hasn\'t said it\'s done)', wording.text.some((t) => /\[Our account is set so it doesn't use them to train its models\.\]/.test(t)));
const take = randomBytes(160_000); // the stub hears it as 40 s
const form = (fields: Record<string, string | Blob>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const takeForm = (t: Uint8Array, extra: Record<string, string> = {}) => form({ take: new Blob([t], { type: 'audio/webm' }), speechId: speech.id, presetId: 'ephelion-light-russian', candidate: '1', seconds: '40', agree: wording.sha256, ...extra });
let r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(take) }));
check('C. before agreeing to the screen, convert is refused (403)', r.status === 403);
r = await consent.POST(as(NATE, { method: 'POST', body: JSON.stringify({ sha256: 'f'.repeat(64) }) }));
check('C. agreeing to another wording is refused (409)', r.status === 409);
r = await consent.POST(as(NATE, { method: 'POST', body: JSON.stringify({ sha256: wording.sha256 }) }));
check('C. agreeing to the wording shown is recorded once', r.status === 200 && (await sql`select count(*)::int n from studio.contributor_consents where fid = ${NATE} and kind = 'voice_recording' and consent_text_sha256 = ${wording.sha256}`)[0].n === 1);
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(take, { agree: '' }) }));
check('C. a recording sent without its own tick is refused (403)', r.status === 403);
check('C. ... and nothing reached ElevenLabs', !stub.calls.some((c) => c.path.startsWith('/v1/speech-to-speech')));

// V. Convert.
const before = stub.calls.length;
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(new Uint8Array(take)) }));
const ticket = r.headers.get('x-voice-ticket') ?? '';
const converted = new Uint8Array(await r.arrayBuffer());
check('V. the whole take is converted: MP3 back, with its signed record', r.status === 200 && r.headers.get('content-type') === 'audio/mpeg' && ticket.includes('.') && converted.length > 1000, String(r.status));
const sts = stub.calls.slice(before).filter((c) => c.path.startsWith('/v1/speech-to-speech/'));
check('V. ElevenLabs got the take once, into the preview\'s voice, with the model and settings', sts.length === 1 && sts[0].files[0]?.sha256 === sha(take) && /fdoGbz5eU4VUde5iMQYV/.test(sts[0].path) && sts[0].fields.model_id === VOICE.models.convert && JSON.parse(sts[0].fields.voice_settings).stability === 0.5);
check('V. the conversion\'s history item was deleted at ElevenLabs right after', stub.deleted.length === 1 && stub.deleted[0] === 'stubhist1');
check('V. the reply is not the take', sha(converted) !== sha(take));
check('V. the reply\'s cache is off', r.headers.get('cache-control') === 'no-store');
const preset = (await (await status.GET(as(NATE))).json()) as { choices: { presetId: string; candidate: number; previewUrl: string; saved?: boolean }[]; today: { credits: number } };
check('V. the three picked voices, in Nate\'s order (the default first), saved, played from our media host', preset.choices.map((c) => c.presetId).join() === 'ephelion-warm-lecturer,ephelion-warm-lecturer-2,ephelion-light-russian' && preset.choices.every((c) => (c as { saved?: boolean }).saved && c.previewUrl.startsWith('https://media.snowmoon.party/review/161f656a64a8e8f7c7ad4cb26b23703a/')));
check('V. rounds 1 and 2\'s unpicked voices are not offered', !preset.choices.some((c) => /rally-orator|cold-baritone|arctic|bright-coach|baritone$|sincere|^ephelion-lecturer$|^ephelion-russian$/.test(c.presetId)));
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(10), { presetId: 'ephelion-russian', candidate: '2' }) }));
check('V. ... an unpicked round-2 preview is refused before any call', r.status === 400);
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(10), { presetId: 'ephelion-rally-orator' }) }));
check('V. ... a round-1 voice is refused before any call', r.status === 400);
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(10), { presetId: 'nope' }) }));
check('V. an unknown voice is refused before any call', r.status === 400);

// T. Transcribe.
const tForm = (audio: Uint8Array, t: string) => form({ audio: new Blob([audio], { type: 'audio/mpeg' }), ticket: t });
const sttBefore = stub.calls.filter((c) => c.path === '/v1/speech-to-text').length;
r = await transcribe.POST(as(NATE, { method: 'POST', body: tForm(new Uint8Array(take), ticket) }));
check('T. the raw take is refused by transcription (400), and never sent', r.status === 400 && stub.calls.filter((c) => c.path === '/v1/speech-to-text').length === sttBefore);
r = await transcribe.POST(as(GARANCE, { method: 'POST', body: tForm(converted, ticket) }));
check('T. another person\'s conversion is refused', r.status === 400);
{
  // Tamper with the record itself (its signed body): change the seconds it claims.
  const [body, mac] = ticket.split('.');
  const t = JSON.parse(Buffer.from(body, 'base64url').toString());
  t.seconds = 1;
  r = await transcribe.POST(as(NATE, { method: 'POST', body: tForm(converted, `${Buffer.from(JSON.stringify(t)).toString('base64url')}.${mac}`) }));
  check('T. a tampered record is refused', r.status === 400);
}
r = await transcribe.POST(as(NATE, { method: 'POST', body: tForm(converted, ticket) }));
const t1 = (await r.json()) as { checks: { n: number; ok: boolean; missing: string[]; extra: string[] }[]; check: string };
const stt = stub.calls.filter((c) => c.path === '/v1/speech-to-text');
check('T. the converted speech is transcribed with word timings', r.status === 200 && stt.length === sttBefore + 1 && stt.at(-1)!.files[0].sha256 === sha(converted) && stt.at(-1)!.fields.timestamps_granularity === 'word');
check('T. ... by scribe_v3, with the speech\'s names as key terms', stt.at(-1)!.fields.model_id === 'scribe_v3' && (stt.at(-1)!.fields.keyterms ?? '').length > 0);
check('T. the stub\'s one wrong word shows in sentence 4 only', t1.checks.filter((c) => !c.ok).map((c) => c.n).join() === '3' && t1.checks[3].extra.includes('weakness'), JSON.stringify(t1.checks.filter((c) => !c.ok)));
{
  const stsAt = stub.calls.findIndex((c, i) => i >= before && c.path.startsWith('/v1/speech-to-speech/'));
  check('T. nothing ElevenLabs received after the conversion was the take', stsAt >= 0 && stub.calls.slice(stsAt + 1).every((c) => c.files.every((f) => f.sha256 !== sha(take))));
}

// Redo sentence 4.
const redoTake = randomBytes(20_000);
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(redoTake, { sentence: '3', seconds: '5' }) }));
const redoTicket = r.headers.get('x-voice-ticket') ?? '';
const redoAudio = new Uint8Array(await r.arrayBuffer());
check('T. one sentence is converted on its own', r.status === 200 && redoTicket.length > 10);
r = await transcribe.POST(as(NATE, { method: 'POST', body: tForm(redoAudio, redoTicket) }));
const t2 = (await r.json()) as { checks: { ok: boolean }[]; check: string };
if (!t2.checks?.[0]?.ok) console.log('  redo check:', JSON.stringify(t2).slice(0, 400));
check('T. the redone sentence matches, checked against that sentence only', r.status === 200 && t2.checks.length === 1 && t2.checks[0].ok);
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(2_000_000), { sentence: '3', seconds: '5' }) }));
check('T. a "sentence" longer than 30 seconds (by its size) is refused', r.status === 413);

// A. Accept.
const acceptForm = (main: Uint8Array, t: string, c: string, redo?: { audio: Uint8Array; ticket: string; check: string }) => {
  const f = form({ take: new Blob([main], { type: 'audio/mpeg' }), ticket: t, check: c });
  if (redo) {
    f.append('redo', new Blob([redo.audio], { type: 'audio/mpeg' }));
    f.append('redoTicket', redo.ticket);
    f.append('redoCheck', redo.check);
  }
  return f;
};
r = await accept.POST(as(NATE, { method: 'POST', body: acceptForm(randomBytes(5000), ticket, t1.check) }));
check('A. a file that isn\'t the converted speech is refused', r.status === 400);
r = await accept.POST(as(NATE, { method: 'POST', body: acceptForm(converted, ticket, t2.check) }));
check('A. another file\'s check is refused', r.status === 400);
r = await accept.POST(as(NATE, { method: 'POST', body: acceptForm(converted, redoTicket, t1.check) }));
check('A. a sentence record can\'t be accepted as a whole take', r.status === 400);
check('A. nothing is stored before Accept', (await sql`select count(*)::int n from studio.voice_drafts`)[0].n === 0);
r = await accept.POST(as(NATE, { method: 'POST', body: acceptForm(converted, ticket, t1.check, { audio: redoAudio, ticket: redoTicket, check: t2.check }) }));
const acc = (await r.json()) as { id: string; recipe: Record<string, unknown>; error?: string };
if (!acc.id) console.log('  accept said:', r.status, acc.error);
check('A. accept keeps a private draft', r.status === 200 && /^[0-9a-f-]{36}$/.test(acc.id));
const [d] = await sql`select * from studio.voice_drafts where id = ${acc.id}`;
const rec = d.recipe as { provider: string; closedModel: boolean; model: string; settings: { stability: number }; transcribeModel: string; preset: { id: string; candidate: number; generatedVoiceId: string; voiceId: string | null; designModel: string; invented: boolean; standIn: boolean }; takes: { role: string; takeSha256: string; convertedSha256: string; historyDeleted: boolean; sentence?: number }[]; check: { unmatched: number[]; matched: number; sentences: number }; consent: { sha256: string; perRecording: boolean }; speech: { source: { block: string } } };
check('A. the recipe names ElevenLabs, a closed model, the model and its settings', rec.provider === 'ElevenLabs' && rec.closedModel && rec.model === 'eleven_multilingual_sts_v2' && rec.settings.stability === 0.5 && rec.transcribeModel === VOICE.models.transcribe);
check('A. ... the voice: the picked preset, its saved voice and Voice Design recipe, marked invented', rec.preset.id === 'ephelion-light-russian' && rec.preset.candidate === 1 && rec.preset.generatedVoiceId === 'fdoGbz5eU4VUde5iMQYV' && rec.preset.voiceId === 'fdoGbz5eU4VUde5iMQYV' && rec.preset.designModel === 'eleven_ttv_v3' && rec.preset.invented && !rec.preset.standIn);
check('A. ... the sha256 of each raw take, and of each converted file', rec.takes.length === 2 && rec.takes[0].takeSha256 === sha(take) && rec.takes[0].convertedSha256 === sha(converted) && rec.takes[1].takeSha256 === sha(redoTake) && rec.takes[1].sentence === 3 && rec.takes.every((t) => t.historyDeleted));
check('A. ... the word check: every sentence matches once sentence 4 is redone', rec.check.unmatched.length === 0 && rec.check.matched === rec.check.sentences);
check('A. ... the consent\'s wording and that it was given for each recording', rec.consent.sha256 === wording.sha256 && rec.consent.perRecording);
check('A. ... and the speech\'s source', rec.speech.source.block === 'c13-b64');
const audioRows = await sql`select n, role, sentence, replaces_start::float8 s, replaces_end::float8 e, sha256, storage_key, bytes from studio.voice_draft_audio where draft_id = ${acc.id} order by n`;
check('A. the audio kept: the converted take, then the redone sentence with where it goes', audioRows.length === 2 && audioRows[0].role === 'take' && audioRows[0].sha256 === sha(converted) && audioRows[1].role === 'redo' && audioRows[1].sentence === 3 && audioRows[1].e > audioRows[1].s);
check('A. the audio is in private storage under voice-drafts/<draft>/, not in the database', audioRows.every((a) => a.storage_key === `voice-drafts/${acc.id}/${a.n}-${a.sha256}.mp3` && existsSync(path.join(STORE, a.storage_key))) && audioRows[0].bytes === converted.length && !(await sql`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'voice_draft_audio' and data_type = 'bytea'`).length);
check('A. the stored files are the converted audio, byte for byte', sha(new Uint8Array(readFileSync(path.join(STORE, audioRows[0].storage_key)))) === sha(converted) && sha(new Uint8Array(readFileSync(path.join(STORE, audioRows[1].storage_key)))) === sha(redoAudio));
check('A. the store is the private one: the R2 code uses R2_PRIVATE_BUCKET only, and never a public address', (() => { const t = readFileSync(path.join(ROOT, 'src/lib/voice/store.ts'), 'utf8'); return /R2_PRIVATE_BUCKET/.test(t) && !/process\.env\.R2_BUCKET\b|R2_PUBLIC_URL|R2_IMAGES_PUBLIC_URL|media\.snowmoon|pictures\.snowmoon/.test(t); })());
{
  const dump = JSON.stringify(await sql`select * from studio.voice_drafts`) + JSON.stringify(await sql`select * from studio.voice_draft_audio`) + storeFiles().map((f) => readFileSync(path.join(STORE, f)).toString('hex')).join('');
  const costs = JSON.stringify(await sql`select * from studio.voice_costs`);
  const takeHex = take.subarray(0, 32).toString('hex');
  const redoHex = redoTake.subarray(0, 32).toString('hex');
  check('A. no raw take is anywhere in the drafts, the stored audio or the costs (bytes, hex or base64)', [dump, costs].every((s) => !s.includes(takeHex) && !s.includes(redoHex) && !s.includes(take.subarray(0, 30).toString('base64'))));
}
r = await accept.POST(as(GARANCE, { method: 'POST', body: acceptForm(converted, ticket, t1.check) }));
check('A. another person can\'t accept someone\'s conversion', r.status === 400);

// D. Drafts are their own person's.
const { resetPurgeClock } = await import('../src/lib/voice/costs');
const ctx = { params: Promise.resolve({ id: acc.id, n: '0' }) };
r = await draftAudioRoute.GET(as(NATE), ctx);
check('D. a draft\'s audio plays for its person', r.status === 200 && sha(new Uint8Array(await r.arrayBuffer())) === sha(converted));
r = await draftAudioRoute.GET(as(GARANCE), { params: Promise.resolve({ id: acc.id, n: '0' }) });
check('D. ... and reads as missing for anyone else, even an admin', r.status === 404);
const st = (await (await status.GET(as(NATE))).json()) as { drafts: { id: string }[] };
const stG = (await (await status.GET(as(GARANCE))).json()) as { drafts: { id: string }[] };
check('D. the status lists the draft for its person only', st.drafts.some((x) => x.id === acc.id) && !stG.drafts.some((x) => x.id === acc.id));

// B. Slice 2: the storyboard (2026-11-21).
{
  const [dr] = await sql`select recipe from studio.voice_drafts where id = ${acc.id}`;
  const tl = (dr.recipe as { timeline: { seconds: number; words: { text: string; start: number; end: number }[]; sentences: { n: number; start: number; end: number }[] } }).timeline;
  check('B. Accept keeps the strip: the joined take\'s word timings and each sentence\'s span', tl && tl.words.length > 300 && tl.sentences.length === speech.sentences.length && tl.seconds > 30 && tl.sentences.every((x, i) => x.end >= x.start && (i === 0 || x.start >= tl.sentences[i - 1].start - 0.01)));
  check('B. ... and the strip is never shorter than its last word', tl.seconds >= tl.words.at(-1)!.end);
  const j = board.joinTimeline({ words: [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 2, end: 3 }, { text: 'c', start: 4, end: 5 }], seconds: 6 }, [{ start: 2, end: 3.5, seconds: 3, words: [{ text: 'B', start: 0.2, end: 2.8 }] }]);
  check('B. a redone sentence moves everything after it by the difference in length', j.seconds === 7.5 && j.words.map((w) => w.text).join('') === 'aBc' && j.words[2].start === 5.5, JSON.stringify(j));
  const get = (fid: number) => boards.GET(as(fid, {}, `http://localhost/api/voice/boards?draft=${acc.id}`));
  check('B. someone else\'s storyboard reads as missing, even for an admin', (await get(GARANCE)).status === 404);
  r = await get(NATE);
  const b0 = (await r.json()) as { board: { cuts: number[]; shots: Shot[]; proposed: number[]; fromProposal: boolean }; notes: { kind: string; text: string }[]; sheets: { styles: { id: string; title: string }[]; characters: { id: string; title: string }[] } };
  const ends = tl.sentences.map((x) => Math.round(x.end * 100) / 100);
  check('B. the first board is the automatic cuts, every one at a sentence end', r.status === 200 && b0.board.fromProposal && b0.board.cuts.length > 1 && b0.board.cuts.every((c) => ends.includes(c)) && b0.board.shots.length === b0.board.cuts.length + 1);
  check('B. ... and no shot has words written for it (P2): every description is empty', b0.board.shots.every((x) => x.description === '' && x.angle === '' && x.kept === null));
  check('B. the notes are rule checks that name no content (P2)', b0.notes.length > 0 && b0.notes.every((n) => /^Shot|^Shots/.test(n.text) && !/should show|try showing|describe/i.test(n.text)));
  check('B. the published sheets are offered', b0.sheets.styles.some((x) => x.title === 'Ink and wash') && b0.sheets.characters.some((x) => x.title === 'Ephelion'));
  // The person moves a cut, adds one, removes one, writes shot 1, picks a camera and the sheets, saves.
  const cuts = [...b0.board.cuts];
  cuts.splice(1, 1);
  cuts.push(board.snapToWordEnd(tl as never, 5));
  const mine = 'Ephelion\'s letter glows on a cracked screen in a dim tunnel; a commuter stops to read it.';
  const style = b0.sheets.styles[0].id;
  const eph = b0.sheets.characters[0].id;
  const shots0 = board.shotsFromCuts(tl as never, cuts.sort((a, b) => a - b), b0.board.shots).map((x, i) => (i === 0 ? { ...x, description: mine, angle: 'low' as const, styleId: style, characterIds: [eph] } : x));
  const save = (c: number[], sh: Shot[]) => boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts: c, shots: sh }) }));
  r = await save(cuts, shots0);
  const s1 = (await r.json()) as { version: number; shots: Shot[] };
  check('B. a save is version 1; the description is kept word for word; the shots follow the cuts', r.status === 200 && s1.version === 1 && s1.shots[0].description === mine && s1.shots.length === cuts.length + 1);
  r = await save(cuts, s1.shots.map((x, i) => (i === 0 ? { ...x, kept: 'f'.repeat(64) } : x)));
  const s2 = (await r.json()) as { version: number; shots: Shot[] };
  check('B. the next save is version 2 (earlier ones stay), and a picture that was never kept can\'t be claimed', s2.version === 2 && s2.shots[0].kept === null && (await sql`select count(*)::int n from studio.voice_boards where draft_id = ${acc.id}`)[0].n === 2);
  // A picture for shot 1 (a stand-in card: no model, no cost).
  const callsBefore = stub.calls.length;
  const pic = (body: Record<string, unknown>, fid = NATE) => boardPicture.POST(as(fid, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: s2.shots[0].key, shotNo: 1, attempt: 1, ...body }) }));
  check('B. no picture without the person\'s own description (400)', (await pic({ description: '  ', angle: 'low' })).status === 400);
  check('B. ... or without a camera angle (400)', (await pic({ description: mine, angle: '' })).status === 400);
  check('B. ... or with a sheet that isn\'t published (400)', (await pic({ description: mine, angle: 'low', styleId: '00000009-0000-4000-8000-999999999999' })).status === 400);
  r = await pic({ description: mine, angle: 'low', styleId: style, characterIds: [eph] });
  const p1 = (await r.json()) as { image: string; sha256: string; ticket: string; recipe: { model: string; prompt: string; costUsd: number; standIn: boolean; description: string } };
  const png = Buffer.from(p1.image.split(',')[1], 'base64');
  check('B. a stand-in picture comes back in the picture flow\'s shape: PNG, sha256, signed record, recipe', r.status === 200 && png.subarray(1, 4).toString() === 'PNG' && sha(png) === p1.sha256 && p1.ticket.includes('.') && p1.recipe.model === 'stand-in' && p1.recipe.standIn && p1.recipe.costUsd === 0);
  check('B. its prompt is the person\'s words first, word for word, then the camera and the sheets\' own texts', p1.recipe.prompt.startsWith(mine) && /Camera: a low-angle shot/.test(p1.recipe.prompt) && /Lord Ephelion: a tall man/.test(p1.recipe.prompt) && /Style: Ink and wash: loose/.test(p1.recipe.prompt) && p1.recipe.description === mine);
  check('B. no model was called and nothing was spent (no ElevenLabs or image host call)', stub.calls.length === callsBefore);
  check('B. nothing is stored before Keep', (await sql`select count(*)::int n from studio.voice_board_pictures`)[0].n === 0);
  const keep = (ticket: string, image: string, fid = NATE) => boardKeep.POST(as(fid, { method: 'POST', body: JSON.stringify({ ticket, image }) }));
  const p2 = (await (await pic({ description: mine, angle: 'low', attempt: 2 })).json()) as { image: string; sha256: string; ticket: string };
  check('B. a retry makes a different picture', p2.sha256 !== p1.sha256);
  check('B. Keep refuses another picture\'s bytes, and another person', (await keep(p1.ticket, p2.image)).status === 400 && (await keep(p1.ticket, p1.image, GARANCE)).status === 400);
  r = await keep(p1.ticket, p1.image);
  const keyP = `voice-boards/${acc.id}/${s2.shots[0].key}-${p1.sha256}.png`;
  check('B. Keep stores it privately, under voice-boards/<draft>/, with its recipe', r.status === 200 && existsSync(path.join(STORE, keyP)) && (await sql`select recipe from studio.voice_board_pictures where storage_key = ${keyP}`)[0]?.recipe.prompt === p1.recipe.prompt);
  r = await save(cuts, s2.shots.map((x, i) => (i === 0 ? { ...x, kept: p1.sha256 } : x)));
  const s3 = (await r.json()) as { version: number; shots: Shot[]; notes: { kind: string; shot: string }[] };
  check('B. the kept picture is on the board now (version 3), and its note is gone', s3.version === 3 && s3.shots[0].kept === p1.sha256 && !s3.notes.some((n) => n.kind === 'no-picture' && n.shot === s3.shots[0].key));
  const pget = (fid: number) => boardPicture.GET(as(fid, {}, `http://localhost/api/voice/boards/picture?draft=${acc.id}&shot=${s2.shots[0].key}&sha=${p1.sha256}`));
  r = await pget(NATE);
  check('B. the kept picture plays for its person', r.status === 200 && sha(new Uint8Array(await r.arrayBuffer())) === p1.sha256);
  check('B. ... and reads as missing for anyone else', (await pget(GARANCE)).status === 404);
  const same = board.boardNotes(s3.shots.map((x) => ({ ...x, angle: 'wide' as const })));
  check('B. notes: three shots in a row from the same angle are flagged', same.some((n) => n.kind === 'same-angle'));
  check('B. P2, by reading the code: nothing in the board fills a description', !/description:\s*['"`][^'"`]/.test(readFileSync(path.join(ROOT, 'src/lib/voice/board.ts'), 'utf8').replace(/description: ''/g, '')) && !/description\s*=\s*['"`]/.test(readFileSync(path.join(ROOT, 'src/app/api/voice/boards/route.ts'), 'utf8')));
}

// X. Removing a draft (Nate, 2026-11-20 morning).
{
  const before = storeFiles().length;
  let r2 = await draftRoute.DELETE(as(GARANCE, { method: 'DELETE' }), { params: Promise.resolve({ id: acc.id }) });
  check('X. someone else can\'t remove a draft (404), and nothing is deleted', r2.status === 404 && storeFiles().length === before && (await sql`select count(*)::int n from studio.voice_draft_audio where draft_id = ${acc.id}`)[0].n === 2);
  // A second draft, published by hand (the publish slice will set published_at), can't be removed.
  r2 = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(8000), { sentence: '2', seconds: '5' }) }));
  check('X. (setup) a sentence conversion for a second draft', r2.status === 200);
  const pubId = (await sql`insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe, published_at) values (${NATE}, 'reading', ${speech.id}, 'ephelion-sincere', ${sql.json({ provider: 'ElevenLabs', model: 'm' })}, now()) returning id`)[0].id;
  r2 = await draftRoute.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: pubId }) });
  check('X. a published draft can\'t be removed (404)', r2.status === 404 && (await sql`select count(*)::int n from studio.voice_drafts where id = ${pubId}`)[0].n === 1);
  await sql`delete from studio.voice_drafts where id = ${pubId}`;
  r2 = await draftRoute.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: acc.id }) });
  const left = storeFiles().filter((f) => f.startsWith(`voice-drafts/${acc.id}/`));
  check('X. its person removes it: the rows and both audio files are gone', r2.status === 200 && left.length === 0 && (await sql`select count(*)::int n from studio.voice_drafts where id = ${acc.id}`)[0].n === 0 && (await sql`select count(*)::int n from studio.voice_draft_audio where draft_id = ${acc.id}`)[0].n === 0);
  check('X. ... and so are its storyboard\'s versions, its kept picture and that file', storeFiles().every((f) => !f.startsWith(`voice-boards/${acc.id}/`)) && (await sql`select count(*)::int n from studio.voice_boards where draft_id = ${acc.id}`)[0].n === 0 && (await sql`select count(*)::int n from studio.voice_board_pictures where draft_id = ${acc.id}`)[0].n === 0);
  r2 = await draftAudioRoute.GET(as(NATE), { params: Promise.resolve({ id: acc.id, n: '0' }) });
  check('X. ... and its audio route reads as missing', r2.status === 404);
  check('X. the day\'s cost totals stay (they name no one)', (await sql`select count(*)::int n from studio.voice_costs where kind = 'convert'`)[0].n > 0);
  r2 = await draftRoute.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: acc.id }) });
  check('X. removing it again reads as missing', r2.status === 404);
}

// R. The ready-made reading.
const readingBody = (extra: Record<string, unknown> = {}) => JSON.stringify({ speechId: speech.id, presetId: 'ephelion-warm-lecturer', candidate: 1, ...extra });
r = await reading.POST(as(GARANCE, { method: 'POST', body: readingBody() }));
const rd = (await r.json()) as { id: string; recipe: { model: string; textSha256: string; preset: { id: string } } };
const tts = stub.calls.filter((c) => c.path.startsWith('/v1/text-to-speech/'));
check('R. the reading is made from the speech\'s written words, in the preset, with the reading model', r.status === 200 && tts.length === 1 && (tts[0].json as { text: string; model_id: string }).text === speech.paragraphs.join('\n\n') && (tts[0].json as { model_id: string }).model_id === VOICE.models.reading && /GJNXe6evoJS9rblaWDwx/.test(tts[0].path));
check('R. ... kept with its recipe', rd.recipe.model === 'eleven_multilingual_v2' && rd.recipe.preset.id === 'ephelion-warm-lecturer' && rd.recipe.textSha256 === sha(new TextEncoder().encode(speech.paragraphs.join('\n\n'))));
r = await reading.POST(as(NATE, { method: 'POST', body: readingBody() }));
check('R. made once per speech and voice (a second is refused unless asked)', r.status === 409);
r = await reading.GET(as(NATE, {}, `http://localhost/api/voice/reading?speech=${speech.id}&preset=ephelion-warm-lecturer`));
check('R. anyone let in can play it', r.status === 200 && (await r.arrayBuffer()).byteLength > 1000);

// $. Costs and caps.
const rows = await sql`select kind, funded, verdict, calls, credits, estimated_credits, cost_usd::float8 usd from studio.voice_costs order by kind, verdict`;
const by = (k: string, v = 'ok') => rows.filter((x) => x.kind === k && x.verdict === v);
check('$. each call is counted: 3 conversions, 2 transcriptions, 1 reading, no failed ones (refusals count nothing; admins: funded admin)', by('convert')[0]?.calls === 3 && by('transcribe')[0]?.calls === 2 && !by('transcribe', 'failed').length && by('reading')[0]?.calls === 1 && rows.every((x) => x.funded === 'admin'), JSON.stringify(rows));
check('$. the holds were all given back', rows.filter((x) => x.kind === 'reserved').every((x) => x.calls === 0 && x.estimated_credits === 0 && Math.abs(x.usd) < 1e-6));
check('$. credits are the stub\'s own (header), estimated beside them', by('convert')[0].credits === 444 + 56 + 23 && by('convert')[0].estimated_credits > 0, JSON.stringify(by('convert')));
check('$. the cost table has no person, request or time of day', !rows.some((x) => 'fid' in x || 'request_id' in x || 'at' in x));
// The per-person limit: 3 whole takes a day (two used now: the refused 'nope' never counted).
const asks = (await sql`select count(*)::int n from studio.voice_asks where fid = ${NATE}`)[0].n;
check('$. one ask counted per whole-take conversion, none for a sentence', asks === 1, String(asks));
await sql`insert into studio.voice_asks (fid) values (${NATE}), (${NATE})`;
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(8000)) }));
check('$. a fourth whole take in a day is refused (429)', r.status === 429 && /3 whole takes/.test(String(((await r.json()) as { error: string }).error)));
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(8000), { sentence: '5', seconds: '5' }) }));
check('$. ... while a sentence can still be redone', r.status === 200);
// The 20%-over-estimate stop (Garance agrees to the screen first: without it, convert stops at the consent).
await consent.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ sha256: wording.sha256 }) }));
await sql`insert into studio.voice_costs (kind, model, funded, verdict, calls, credits, estimated_credits, cost_usd) values ('reading', 'x-over', 'admin', 'ok', 1, 9000, 3000, 0)`;
r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { sentence: '5', seconds: '5' }) }));
check('$. once today\'s calls cost over 20% more than estimated, the next is refused', r.status === 429 && /20% over/.test(String(((await r.json()) as { error: string }).error)));
await sql`delete from studio.voice_costs where model = 'x-over'`;
// The daily cap.
await sql`insert into studio.voice_costs (kind, model, funded, verdict, calls, credits, estimated_credits, cost_usd) values ('convert', 'x-cap', 'admin', 'ok', 1, ${VOICE.caps.adminDailyCredits}, ${VOICE.caps.adminDailyCredits}, 0)`;
r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { sentence: '5', seconds: '5' }) }));
check('$. past the day\'s credits, calls are refused until midnight UTC', r.status === 429 && /allowance/.test(String(((await r.json()) as { error: string }).error)));
await sql`delete from studio.voice_costs where model = 'x-cap'`;
// A failed conversion: counted as failed, the hold given back, and the provider's words (which quote the input) not passed on.
stub.setFail(true);
r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { sentence: '5', seconds: '5' }) }));
const failText = await r.text();
stub.setFail(false);
check('$. a failed conversion answers plainly, without the provider\'s text', r.status === 502 && !/quotes the input/.test(failText) && /not kept/.test(failText));
check('$. ... and is counted as failed, with its hold given back', (await sql`select calls from studio.voice_costs where kind = 'convert' and verdict = 'failed'`)[0]?.calls === 1 && (await sql`select coalesce(sum(calls),0)::int n from studio.voice_costs where kind = 'reserved'`)[0].n === 0);
// The daily counts are kept for the day: older rows are purged (at most hourly), today's stay.
await sql`insert into studio.voice_asks (fid, at) values (${NATE}, now() - interval '2 days'), (${GARANCE}, now() - interval '1 day')`;
const todayAsks = (await sql`select count(*)::int n from studio.voice_asks where (at at time zone 'utc')::date >= (now() at time zone 'utc')::date`)[0].n;
resetPurgeClock();
await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(8000), { sentence: '5', seconds: '5' }) }));
check('$. voice_asks from before today are purged; today\'s stay', (await sql`select count(*)::int n from studio.voice_asks where (at at time zone 'utc')::date < (now() at time zone 'utc')::date`)[0].n === 0 && (await sql`select count(*)::int n from studio.voice_asks`)[0].n === todayAsks);
check('$. the caps are placeholders in config, in credits and dollars', VOICE.caps.dailyCredits > 0 && VOICE.caps.dailyUsd > 0 && VOICE.caps.adminDailyCredits > 0 && VOICE.caps.perPersonConversions === 3 && VOICE.caps.overEstimate === 1.2);

// M. The allowlist.
const models = JSON.parse(readFileSync(path.join(ROOT, 'config/models.json'), 'utf8')).models as { id: string; maker?: string; open_weights: boolean; keeps?: string; hosted?: { endpoints: Record<string, null> } }[];
for (const id of Object.values(VOICE.models)) {
  const m = models.find((x) => x.hosted?.endpoints && id in x.hosted.endpoints);
  check(`M. ${id} is on the allowlist: closed, by ElevenLabs, with what it keeps`, Boolean(m) && m!.open_weights === false && m!.maker === 'ElevenLabs' && (m!.keeps?.length ?? 0) > 50);
}

// P. P1h.
const proof = await voiceProof(ROOT);
check('P. P1h: the real take flow and convert route keep no recording', proof.real.length === 0, proof.real.join('; '));
check(`P. P1h: all ${VOICE_PLANTS.length} planted violations are caught`, proof.missed.length === 0, proof.missed.join('; '));

rmSync(STORE, { recursive: true, force: true });
await sql.end();
await stub.close();
await pgServer.stop();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
