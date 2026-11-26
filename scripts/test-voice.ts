/**
 * The Ephelion voice slice 1 (DRAFT, branch ephelion-voice). One check per point:
 *  S. the switch: off in the committed config; every route 401 signed out, 404 to anyone not let in; on Vercel the
 *     local test switch and the stub address are ignored; a real ElevenLabs call is refused in the local tests;
 *  W. the speech: c13-b64 word for word, cut into sentences; the word check (case, punctuation, dashes, numbers);
 *  C. the consent: own-voice-v2 (current), agreed once, and a tick for each recording;
 *  V. convert: the take goes to ElevenLabs once, its history item is deleted, nothing of it is stored; a whole take's
 *     conversion is kept as its person's private draft as soon as it comes back (converted audio only);
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
 * In-memory Postgres (PGlite, every migration, 0044_ephelion_voice included); ElevenLabs is the local stub
 * (scripts/lib/elevenlabs-stub.ts). No network, no spending.
 */
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { startStub } from './lib/elevenlabs-stub';
import { voiceProof, VOICE_PLANTS, VOICE_ROUTE_PLANTS } from './lib/voice-proof';

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
// Published sheets to choose from (slice 2): one style, two characters (a second look for guide-fixes' fix 1).
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const SHEET_BODY = (title: string, text: string, front?: { url: string; sha256: string }) => JSON.stringify({ title, text, samples: [], views: front ? { front } : {}, by_name: 'naaate', by_name_source: 'relay', assist: null, role: null, style: null });
await pg.query(`insert into studio.entities (id, work_id, kind, name) values ('00000001-0000-4000-8000-000000000101','snowmoon','style','Ink and wash'), ('00000001-0000-4000-8000-000000000102','snowmoon','character','Ephelion'), ('00000001-0000-4000-8000-000000000103','snowmoon','character','Test second look')`);
await pg.query(`insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000008-0000-4000-8000-000000000101','snowmoon','design',6786,'00000001-0000-4000-8000-000000000101','published'), ('00000008-0000-4000-8000-000000000102','snowmoon','design',6786,'00000001-0000-4000-8000-000000000102','published'), ('00000008-0000-4000-8000-000000000103','snowmoon','design',6786,'00000001-0000-4000-8000-000000000103','published')`);
await pg.query(`insert into studio.element_versions (id, element_id, version_no, body) values ('00000009-0000-4000-8000-000000000101','00000008-0000-4000-8000-000000000101',1,$1), ('00000009-0000-4000-8000-000000000102','00000008-0000-4000-8000-000000000102',1,$2), ('00000009-0000-4000-8000-000000000103','00000008-0000-4000-8000-000000000103',1,$3)`, [
  SHEET_BODY('Ink and wash', 'Ink and wash: loose black ink lines, grey washes, paper texture.'),
  // A front view, as every published look has (the stand-in picture deps never fetch it).
  SHEET_BODY('Ephelion', 'Lord Ephelion: a tall man in a dark coat with a high collar.', { url: 'https://pictures.snowmoon.party/images/readers/test-ephelion.jpg', sha256: 'f'.repeat(64) }),
  SHEET_BODY('Test second look', '(test script\'s words) A second look, for the look-change test.', { url: 'https://pictures.snowmoon.party/images/readers/test-second-look.jpg', sha256: 'e'.repeat(64) }),
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

const { IMAGES, VOICE } = await import('../src/lib/config');
const { voiceAllowed, voiceTestOn, elevenLabsBase } = await import('../src/lib/voice/flag');
type Shot = import('../src/lib/voice/board').Shot;
const { speeches, speechById } = await import('../src/lib/voice/speech');
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
const sharpPng = async () => (await import('sharp')).default({ create: { width: 400, height: 600, channels: 3, background: '#b8b4ac' } }).png().toBuffer();

// E. The voice pages' own miniapp embeds (Nate, 2026-11-22; button titles reread word for word).
{
  const { recordEmbed, spokenEmbed, RECORD_BUTTON, SPOKEN_BUTTON } = await import('../src/lib/voice/embeds');
  const r = JSON.parse(recordEmbed());
  const sp = JSON.parse(spokenEmbed('11111111-2222-4333-8444-555555555555'));
  check('E. /ephelion opens itself: launch_frame, "Record a speech" (fix 6, Nate 2026-11-24: the new address)', RECORD_BUTTON === 'Record a speech' && r.button.title === RECORD_BUTTON && r.button.action.type === 'launch_frame' && r.button.action.url.endsWith('/ephelion'));
  check('E. fix 6: /storyboard/record redirects permanently to /ephelion', /permanentRedirect\('\/ephelion'\)/.test(readFileSync(path.join(ROOT, 'src/app/storyboard/record/page.tsx'), 'utf8')) && !existsSync(path.join(ROOT, 'src/app/storyboard/record/not-found.tsx')) && existsSync(path.join(ROOT, 'src/app/ephelion/page.tsx')));
  {
    // The guide on a phone (Nate, 2026-11-24): the ask box is pinned to the bottom only on wide screens (on a phone it hid
    // the guide's card), and the looks are whole cards that wrap, never sliding sideways inside the card.
    const css = readFileSync(path.join(ROOT, 'src/styles/voice.css'), 'utf8');
    const composer = css.slice(css.indexOf('.vg-composer {'), css.indexOf('}', css.indexOf('.vg-composer {')));
    check('E. on a phone the ask box isn\'t pinned over the guide\'s card; on a wide screen it is', !/position: sticky/.test(composer) && /@media \(min-width: 700px\) \{ \.vg-composer \{ position: sticky; bottom: 0; \} \}/.test(css));
    check('E. ... and his looks are whole cards that wrap in the guide\'s card', /\.vb-look\.vg-choice \{ width: 104px; display: flex; flex-direction: column;/.test(css) && /\.vg-turn \.vb-look-row \{ flex-wrap: wrap; overflow: visible; flex-shrink: 0; \}/.test(css));
  }
  {
    // Signed out at /ephelion (Nate, 2026-11-24, reread): one line and the sign-in, in the page; a signed-in person the
    // switch doesn't let in still gets the not-found.
    const nf = readFileSync(path.join(ROOT, 'src/app/ephelion/page.tsx'), 'utf8');
    const si = readFileSync(path.join(ROOT, 'src/components/ephelion-sign-in.tsx'), 'utf8');
    const vr = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
    const { EPHELION_SIGN_IN_LINE } = await import('../src/lib/voice/ephelion-sign-in-line');
    check('E. signed out, /ephelion shows "Sign in to try the Lord Ephelion challenge." with the sign-in, in the page; signed in and not let in, the not-found', EPHELION_SIGN_IN_LINE === 'Sign in to try the Lord Ephelion challenge.' && /<SignInChoices\b/.test(si) && /EPHELION_SIGN_IN_LINE/.test(si) && /signedOut=\{<EphelionSignIn \/>\}/.test(nf) && /fallback=\{<NotFound \/>\}/.test(nf) && vr.indexOf("auth.kind === 'signed-out' && signedOut") > 0 && vr.indexOf("auth.kind === 'signed-out' && signedOut") < vr.indexOf("if (!admin || status === 'none') return <>{fallback}</>;"));
    // Nate, 2026-11-25: /ephelion answers 200 (link previews and casts load), never the page-level notFound(); the four
    // sign-in buttons carry the site's own sign-in style (the full size, menu-signin); "Draft wording" over the consent only
    // while the version shown has no reread on record.
    check('E. /ephelion answers 200: its page draws the landing, with no notFound() and no not-found.tsx', !/notFound\(\)/.test(nf) && /<EphelionLanding fallback=\{<NotFound \/>\} signedOut=\{<EphelionSignIn \/>\}/.test(nf) && !existsSync(path.join(ROOT, 'src/app/ephelion/not-found.tsx')));
    // Nate, 2026-11-25 (recording only; plan v3, PR 1): the landing, and "Record your own" at /ephelion/record, behind the
    // same gate. Nothing on the landing links the guided storyboard.
    const rec = readFileSync(path.join(ROOT, 'src/app/ephelion/record/page.tsx'), 'utf8');
    const land = readFileSync(path.join(ROOT, 'src/components/ephelion-landing.tsx'), 'utf8');
    const landCss = readFileSync(path.join(ROOT, 'src/styles/ephelion.css'), 'utf8');
    check('E. /ephelion/record draws the four-step recorder behind the same gate and sign-in, answering 200', /<EphelionRecorder fallback=\{<NotFound \/>\} signedOut=\{<EphelionSignIn \/>\}/.test(rec) && !/notFound\(\)/.test(rec));
    // The four-step recorder (Nate, 2026-11-26; plan v3, PR 2).
    const er = readFileSync(path.join(ROOT, 'src/components/ephelion-recorder.tsx'), 'utf8');
    const erCode = er.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const words = readFileSync(path.join(ROOT, 'src/lib/voice/device-words.ts'), 'utf8');
    const shell = readFileSync(path.join(ROOT, 'src/components/app-shell.tsx'), 'utf8');
    const shellCss = readFileSync(path.join(ROOT, 'src/styles/shell.css'), 'utf8');
    const samplesRoute = readFileSync(path.join(ROOT, 'src/app/api/voice/samples/route.ts'), 'utf8');
    const { RECORDER } = await import('../src/lib/voice/recorder-wording');
    check('E. recorder: steps 1 Speech, 2 Voice, 3 Record, 4 Listen, each a button greyed until reached (2: a speech; 3: and a voice; 4: and a take)', RECORDER.steps.join() === 'Speech,Voice,Record,Listen' && /const reached = \[true, Boolean\(speech\), Boolean\(speech && picked\), Boolean\(speech && picked && take\)\];/.test(er) && /disabled=\{!can\}/.test(er) && /const can = reached\[i\]/.test(er));
    check('E. ... ?speech= picks that speech and opens step 2 (step 3 when this device kept a voice for it)', /get\('speech'\)/.test(er) && /setSpeechId\(id\);\s*setViewing\(id\);\s*const v = keptVoice\(id\);\s*if \(v\) setVoiceKey\(v\);\s*setStep\(v \? 3 : 2\);/.test(er));
    check('E. ... changing the speech with a take asks first, then removes the take from the device; another voice keeps it', RECORDER.changeSpeech('X') === 'Change the speech? Your take of “X” is removed from this device.' && /if \(speechId && id !== speechId && take\) return setConfirmSpeech\(id\);/.test(er) && /await removeTake\(fid, speechId\)/.test(er) && /\/\/ Another voice keeps the take/.test(er));
    check('E. ... edited words are kept in this browser (localStorage, under the person and the speech) and no request carries them', /localStorage\.setItem\(key\(fid, speechId\)/.test(words) && /snowmoon\.ephelion\.words\.\$\{fid\}\.\$\{speechId\}/.test(words) && !erCode.split('\n').some((l) => /(authFetch|FormData|form\.set|f\.set|f\.append|JSON\.stringify)/.test(l) && /(editedWords|draftWords)/.test(l)));
    check('E. ... the highlight is timed (no speech recognition): on or off, the size, Back a line / Forward a line, tap a sentence, scrolling pauses it with Resume', !/SpeechRecognition|webkitSpeechRecognition/.test(er) && /onWheel=\{byHand\}/.test(er) && /onTouchMove=\{byHand\}/.test(er) && /W\.paused/.test(er) && /W\.resume/.test(er) && /W\.backLine/.test(er) && /W\.forwardLine/.test(er) && /onClick=\{\(\) => recording && hl && moveTo\(i\)\}/.test(er) && /W\.smaller/.test(er) && /W\.bigger/.test(er));
    check('E. ... a 3-second countdown, then Countdown, Recording and Stopped as their own labelled states; stopping keeps the take on the device', /const COUNTDOWN = 3;/.test(er) && /er-badge-count/.test(er) && /er-badge-rec/.test(er) && /er-badge-stop/.test(er) && /await saveTake\(fid, speech\.id, out\.blob, out\.seconds\)/.test(er));
    check('E. ... both saves: your recording from the device\'s own copy, the converted take from your draft', /saveBlob\(take\.blob,/.test(er) && /saveBlob\(converted\.blob,/.test(er) && /\/api\/voice\/drafts\/\$\{keptFromTake\.id\}\/0/.test(er));
    check('E. ... no Enter, Share, scene or payment on the recorder', !/Enter the challenge|>Share<|Choose his scene|USDC/.test(erCode));
    check('E. ... the site\'s rail, top bar and assistant panel are hidden on /ephelion/record (shell-bare)', /const bare = path === '\/ephelion\/record';/.test(shell) && /\$\{bare \? ' shell-bare' : ''\}/.test(shell) && /\.shell-bare > \.topbar, \.shell-bare > \.rail/.test(shellCss));
    check('E. ... voice samples: gated like every voice route; only an admin makes them (testers: not found); kept in the private store', /voicePerson\(request\)/.test(samplesRoute) && /if \(!isAdmin\(who\.fid\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(samplesRoute) && /voice-samples\//.test(readFileSync(path.join(ROOT, 'src/lib/voice/store.ts'), 'utf8')));
    {
      const { PRIVACY, LEGAL, legalKey } = await import('../src/lib/legal');
      const p3 = PRIVACY.sections.find((x) => x.n === 3)!.body.flat().join(' ');
      check('E. ... Privacy §3 carries the edited words, as Nate reread it on 2026-11-26 (the reread record matches these words)', p3.includes('a speech you record, and its words if you edit them, until you remove them or record again, or your browser clears them (the recording is sent to us only to be converted, and we keep only its fingerprint, never the recording; words you edit are never sent)') && LEGAL.ownerReread.privacy?.words === legalKey(PRIVACY) && LEGAL.ownerReread.privacy?.on === '2026-11-26');
    }
    check('E. the landing asks the gated status route, draws the not-found for anyone it doesn\'t let in, and links no storyboard', /authFetch\('\/api\/voice\/status'/.test(land) && /status === 'none'\) return <>\{fallback\}<\/>/.test(land) && !/storyboard/i.test(land.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
    check('E. ... two equal buttons on one line each ("Record your own", "Listen to his speeches"), a card per speech with its own "Record your own" at step 2', /\.eph-two \{ display: grid; grid-template-columns: 1fr 1fr;/.test(landCss) && /white-space: nowrap/.test(landCss) && /status\.speeches\.map\(\(s\) =>/.test(land) && /\/ephelion\/record\?speech=\$\{encodeURIComponent\(s\.id\)\}/.test(land));
    check('E. ... two panes from 760 px of page (Nate, 2026-11-26: the 1440 screen with the assistant panel open), by container query, not the window', /\.eph-wrap \{ container: page \/ inline-size; \}/.test(landCss) && /@container page \(min-width: 760px\) \{\s*\.eph \{ flex-direction: row;/.test(landCss) && /@container page \(min-width: 1100px\)/.test(landCss) && !/@media/.test(landCss));
    check('E. ... its sign-in uses the full size, styled by the site (menu-signin)', /<SignInChoices note=\{false\} wallet=/.test(si) && !/size="small"/.test(si));
    {
      const own = JSON.parse(readFileSync(path.join(ROOT, 'config/consent-own-voice.json'), 'utf8'));
      check('E. ... and "Draft wording" sits over the consent only while the version shown has no reread on record', own.reread?.['own-voice-v4'] === '2026-11-24' && vr.includes("s.consent.reread ? s.consent.version : `Draft wording · ${s.consent.version}`") && !vr.includes('<p className="vr-kicker">Draft wording · {s.consent.version}</p>'));
    }
  }
  check('E. a published storyboard opens itself: launch_frame, "Watch this storyboard"', SPOKEN_BUTTON === 'Watch this storyboard' && sp.button.title === SPOKEN_BUTTON && sp.button.action.type === 'launch_frame' && sp.button.action.url.endsWith('/storyboard/spoken/11111111-2222-4333-8444-555555555555'));
  const layout = readFileSync(path.join(ROOT, 'src/app/ephelion/layout.tsx'), 'utf8');
  const spoken = readFileSync(path.join(ROOT, 'src/app/storyboard/spoken/[id]/page.tsx'), 'utf8');
  check('E. both stay noindex, and the spoken embed is set only for a live publication, never a hidden one', /robots: \{ index: false, follow: false \}, other: embedMeta\(recordEmbed\(\)\)/.test(layout) && /return pub && !pub\.hidden \? \{ robots, other: embedMeta\(spokenEmbed\(pub\.id\)\) \} : \{ robots \}/.test(spoken) && /if \(!publishOn\(\)\) return \{ robots \}/.test(spoken));
  {
    // React #418 (2026-11-23): the published page read MediaRecorder while rendering, so the server (none) wrote "This
    // browser can't record a video." and the browser didn't. The capability is read only after the page has loaded.
    const vs = readFileSync(path.join(ROOT, 'src/components/voice-spoken.tsx'), 'utf8');
    const calls = vs.split('\n').filter((l) => /videoType\(\)/.test(l) && !/^\s*(\/\/|\*)/.test(l));
    check('E. the published page reads the video capability after loading, never while rendering (React #418)', calls.length === 1 && /useEffect\(\(\) => setCanVideo\(Boolean\(videoType\(\)\)\), \[\]\)/.test(calls[0]) && /canVideo === false && ' This browser can’t record a video\.'/.test(vs));
  }
}

// S. The switch.
check('S. committed: the admins\' trial on, the open switch off, real pictures for admins only (Nate, 2026-11-21)', VOICE.adminTrial === true && VOICE.open === false && VOICE.realPictures === 'admins');
check('S. the local test switch is on here', voiceTestOn());
for (const [k, v] of [['VERCEL', '1'], ['VERCEL_ENV', 'production'], ['VERCEL_ENV', 'preview']] as const) {
  process.env[k] = v;
  check(`S. with ${k}=${v} the test switch is off, only admins are let in (the trial), and the stub address is ignored`, !voiceTestOn() && voiceAllowed(NATE) && voiceAllowed(GARANCE) && !voiceAllowed(STRANGER) && elevenLabsBase() === 'https://api.elevenlabs.io');
  delete process.env[k];
}
check('S. a non-admin is not let in during the admin trial', !voiceAllowed(STRANGER) && voiceAllowed(NATE) && voiceAllowed(GARANCE));
const routeFiles = ['status', 'consent', 'convert', 'transcribe', 'accept', 'reading', 'drafts/[id]/[n]', 'drafts/[id]', 'drafts/[id]/check', 'boards', 'boards/picture', 'boards/keep', 'boards/closing', 'publish', 'publish/[id]', 'guide'];
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
// With the trial switched off again (as before this merge), the test sign-in isn't honoured (401) and no admin is let in.
(VOICE as { adminTrial: boolean }).adminTrial = false;
check('S. with the switch off, an admin isn\'t let in either', !voiceAllowed(NATE) && [401, 404].includes((await status.GET(as(NATE))).status));
(VOICE as { adminTrial: boolean }).adminTrial = true;
process.env.VOICE_TEST_ON = '1';
for (const f of ['src/app/ephelion/page.tsx']) check(`S. ${f} answers 200 for everyone (Nate, 2026-11-25), with the site's usual not-found screen drawn for anyone signed in and not let in`, ((t) => !/notFound\(\);/.test(t) && /fallback=\{<NotFound \/>\}/.test(t))(readFileSync(path.join(ROOT, f), 'utf8')));
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
check('W. it is from the book, block c13-b64, with its own label "Book", and no longer a stand-in (Nate, 2026-11-22)', !speech.standIn && speech.source.kind === 'book' && (speech.source as { block: string }).block === 'c13-b64' && speech.label.kind === 'book' && speech.label.text === 'Book');
// The top of the page (Nate, 2026-11-22; reread word for word): the title, the intro, the picker's lines, Learn more.
{
  const page = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
  // The intro is drawn by EphelionIntro (src/components/ephelion-intro.tsx, 2026-11-24), word for word as reread.
  const introFile = readFileSync(path.join(ROOT, 'src/components/ephelion-intro.tsx'), 'utf8');
  check('W. the page is "The Ephelion challenge", with no "Admin trial · Draft" and no label row or "Stand-in … speeches arrive"', page.includes('<h1>The Ephelion challenge</h1>') && !/Admin trial · Draft/.test(page) && !/vr-labels/.test(page) && !/until the team&rsquo;s speeches arrive/.test(page));
  const intro = 'Lord Ephelion is the Arctic Empire&apos;s consul to Veridia <Cite b="c3-b5" />. In the book his messages reach Veridians everywhere: on a poster in a tunnel <Cite b="c3-b4" />, in a live debate <Cite b="c8-b17" />, on a restaurant screen that cuts into a Helisport game <Cite b="c13-b62" />. As one character puts it, &quot;Ephelion&apos;s goal is to inspire people inside Veridia to join the Arctic cause.&quot; <Cite b="c21-b76" />';
  check('W. the intro, word for word, each citation linked to its block, drawn on the page', /<EphelionIntro \/>/.test(page) && introFile.includes(intro) && introFile.includes('<p>Give one of his speeches a voice: perform it yourself, or start from a ready-made reading, then storyboard it.</p>'));
  check('W. ... and its quotation is the book\'s, word for word (c21-b76)', readFileSync(path.join(ROOT, 'content/snowmoon/text/chapter-21.json'), 'utf8').includes("Ephelion's goal is to inspire people inside Veridia to join the Arctic cause."));
  check('W. each speech\'s one line, word for word', page.includes("`From the book, word for word (${x.label.block}). In the book it is a written message; reading it aloud is this edition's idea.`") && page.includes('`${x.label.text} · ${x.credit} · version ${x.version}`'));
  const { EPHELION_LEARN_MORE: E, WHERE_HE_SPEAKS_FROM: W } = await import('../src/lib/voice/learn-more');
  const { LEARN_MORE } = await import('../src/lib/challenge/learn-more');
  check('W. Learn more about Lord Ephelion: the approved texts of /challenge/ephelion, the same object', E === LEARN_MORE.ephelion && E.approved === true);
  const said = W.map((x) => ('text' in x ? x.text : 'cite' in x ? `(${x.cite})` : '')).join('');
  check('W. ... with "Where he speaks from" second in room to invent, approved with Nate\'s change (2026-11-23), word for word', E.invent[1] === W && said === 'Where he speaks from: the book never says. His messages reach Veridians as a poster in a tunnel (c3-b3–b4), a live debate on a hand device (c8-b17) and a broadcast on a restaurant screen (c13-b62); the book places him in Northglade, in the province of Northshore, at the time of the Arctic invasion (c20-b8).' && /His face/.test(JSON.stringify(E.invent[0])), said);
  check('W. ... its citations are blocks that exist and say so: the tunnel and poster, the debate, the screen, Northglade', (() => {
    const t = (c: number, b: number) => (JSON.parse(readFileSync(path.join(ROOT, `content/snowmoon/text/chapter-${c}.json`), 'utf8')) as { blocks: { idx: number; content: string }[] }).blocks.find((x) => x.idx === b)?.content ?? '';
    return /tunnel/.test(t(3, 3)) && /poster/.test(t(3, 4)) && /Live debate/.test(t(8, 17)) && /Helisport game cut out/.test(t(13, 62)) && /Lord Ephelion, Arctic consul to Veridia, was in Northglade/.test(t(20, 8));
  })());
}
// The citations as book icons (Nate, 2026-11-24): the intro and Learn more about Lord Ephelion show no block code; each
// citation is a book icon linking to its block, named "In the book: chapter N"; the words are unchanged.
{
  const { execFileSync } = await import('node:child_process');
  const { learnMoreView } = await import('../src/lib/challenge/learn-more-view');
  const { EPHELION_LEARN_MORE } = await import('../src/lib/voice/learn-more');
  const { introCiteProblems, learnMoreCiteProblems } = await import('./lib/book-cites');
  const view = learnMoreView('ephelion', 'Lord Ephelion', EPHELION_LEARN_MORE);
  const out = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'scripts/lib/render-learn-more.tsx')], { input: JSON.stringify({ views: { ephelion: view } }), encoding: 'utf8', cwd: ROOT, maxBuffer: 64 << 20 })) as { views: { ephelion: string }; intro: string };
  const pi = introCiteProblems(out.intro);
  check('W. the intro as drawn: no block code; five book icons, one per citation, each linking to its block ("In the book: chapter N"); its words the reread text minus the codes; its quotation cited', pi.length === 0, pi.join('; '));
  check('W. ... e.g. c21-b76 after the quotation: /chapter/21#c21-b76, "In the book: chapter 21"', /&quot; <a class="book-cite" data-block="c21-b76" aria-label="In the book: chapter 21" title="In the book: chapter 21" href="\/chapter\/21#c21-b76"><svg/.test(out.intro), out.intro.slice(-400));
  const pl = learnMoreCiteProblems(view, out.views.ephelion, 'Learn more about Lord Ephelion');
  check('W. Learn more about Lord Ephelion as drawn: no block code; one book icon per citation (a range links to its first block); every quote cites its block; the words are the texts\' own', pl.length === 0 && out.views.ephelion.includes('data-block="c3-b3–b4"') && out.views.ephelion.includes('href="/chapter/3#c3-b3"'), pl.join('; '));
  check('W. proof: the intro\'s quotation with no citation link fails', introCiteProblems(out.intro.replace(/<a class="book-cite"[^>]*data-block="c21-b76"[^]*?<\/a>/, '')).some((x) => /a quote with no citation link/.test(x)));
  check('W. proof: the intro with a block code shown again fails', introCiteProblems(out.intro.replace(/(<a class="book-cite"[^>]*data-block="c3-b5"[^>]*>)<svg[^]*?<\/svg>/, '$1c3-b5')).some((x) => /block code is shown as text/.test(x)));
  check('W. proof: the intro with one word changed fails', introCiteProblems(out.intro.replace('everywhere', 'anywhere')).some((x) => /the words changed/.test(x)));
}
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

// I. The team's three invented speeches (Nate, 2026-11-22), beside c13-b64.
{
  const all = speeches();
  const inv = all.filter((x) => x.label.kind === 'invented');
  const file = JSON.parse(readFileSync(path.join(ROOT, 'config/voice-speeches.json'), 'utf8')) as { source: { googleDocId: string }; speeches: { id: string; title: string; paragraphs: string[] }[] };
  check('I. c13-b64 stays first and unchanged; the three invented speeches follow', all[0].id === 'ephelion-c13-b64' && all[0].label.kind === 'book' && inv.map((x) => x.id).join() === 'doing-fine-v2,natural-way-v2,last-five-years-v2,last-five-years-v3');
  check('I. each is labelled "Invented, not from the book", versioned (v2; the last five years also v3), from its source doc', inv.every((x) => x.label.text === 'Invented, not from the book' && x.version === (x.id === 'last-five-years-v3' ? 3 : 2) && x.source.kind === 'edition' && x.source.doc === file.source.googleDocId && x.label.kind === 'invented'));
  check('I. each version\'s aiHelp is set in the file (true for v2, set by Nate) and its credit follows from it, word for word', (file as unknown as { speeches: { aiHelp: unknown }[] }).speeches.every((x) => x.aiHelp === true) && inv.every((x) => x.aiHelp === true && x.credit === 'Words by the Snowmoon team, drafted with AI help (Claude, by Anthropic)' && x.label.kind === 'invented' && x.label.writers[0] === x.credit));
  check('I. ... the credit for a version without AI help is "Words by the Snowmoon team"', (JSON.parse(readFileSync(path.join(ROOT, 'config/voice-speeches.json'), 'utf8')) as { credits: { noAiHelp: string } }).credits.noAiHelp === 'Words by the Snowmoon team');
  check('I. the picker shows each invented speech\'s credit beside "Invented, not from the book", with its version', /\$\{x\.label\.text\} · \$\{x\.credit\} · version \$\{x\.version\}/.test((readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'))));
  check('I. the spoken text is the paragraphs only: ending "With regards.", no title, no notes', inv.every((x) => x.paragraphs.at(-1) === 'With regards.' && x.sentences.at(-1)!.text === 'With regards.' && !x.paragraphs.some((p) => p === x.title || /Still open|\(worth\)|\(death\)|\(stagnation\)/.test(p))));
  check('I. the speeches are word for word the file\'s (sentence by sentence)', inv.every((x) => x.sentences.map((y) => y.text).join(' ') === file.speeches.find((f) => f.id === x.id)!.paragraphs.join(' ')));
  check('I. each has its own names: "Veridia" for the last five years, none for the other two', inv.filter((x) => x.id.startsWith('last-five-years')).every((x) => x.names.join() === 'Veridia') && inv.filter((x) => !x.id.startsWith('last-five-years')).every((x) => x.names.length === 0));
  // Speech 3, version 3 (Nate, 2026-11-22): one sentence order changed; v2 stays on file, retired, for its recordings.
  {
    const v2 = inv.find((x) => x.id === 'last-five-years-v2')!;
    const v3 = inv.find((x) => x.id === 'last-five-years-v3')!;
    const was = 'The future has never been built by everyone. It is built by the few who can. The rest still receive the benefits.';
    const now = 'The future has never been built by everyone. The rest still receive the benefits, but it is built by the few who can.';
    check('I. the last five years v3: Nate\'s sentence, word for word, in place of v2\'s; everything else as v2', v3.version === 3 && v3.paragraphs.join('\n').includes(now) && !v3.paragraphs.join('\n').includes(was) && v2.paragraphs.join('\n').includes(was) && v3.paragraphs.join('\n') === v2.paragraphs.join('\n').replace(was, now) && v3.title === v2.title);
    check('I. ... v2 is retired: still found by its id (its recordings), not offered; v3 is offered', v2.retired === true && !v3.retired && speechById('last-five-years-v2')?.id === 'last-five-years-v2');
  }
  const five = inv.find((x) => x.id === 'last-five-years-v3')!;
  const s3 = five.sentences.find((x) => x.text.startsWith('Veridia'))!;
  const heard = (text: string) => text.split(' ').map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const byS = checkSpeech([s3], heard(s3.text.replace('Veridia', 'Varidia')), five.names);
  check('I. the word check, sentence by sentence: "Veridia" heard as "Varidia" passes by sound, and is listed', byS[0].ok && byS[0].bySound.length === 1, JSON.stringify(byS[0]));
  check('I. ... a different word still fails ("Venice"), and the numbers compare as words', !checkSpeech([s3], heard(s3.text.replace('Veridia', 'Venice')), five.names)[0].ok && checkSpeech([s3], heard(s3.text.replace('twenty', '20').replace('forty', '40')), five.names)[0].ok);
  const st = (await (await status.GET(as(NATE))).json()) as { speeches: { id: string; label: { text: string }; version: number }[]; readings: { speechId: string }[] };
  check('I. the status lists every offered speech (not the retired v2), with its label and version, and readings by speech', st.speeches.length === 4 && st.speeches.map((x) => x.id).join() === 'ephelion-c13-b64,doing-fine-v2,natural-way-v2,last-five-years-v3' && st.speeches[1].label.text === 'Invented, not from the book' && st.speeches[1].version === 2 && st.speeches[3].version === 3 && st.readings.every((x) => typeof x.speechId === 'string'));
  check('I. publishing the invented speeches is off until Nate says', VOICE.publishInvented === false);
}

// C. The consent.
const wording = voiceConsentWording();
const own = JSON.parse(readFileSync(path.join(ROOT, 'config/consent-own-voice.json'), 'utf8'));
check('C. the page shows own-voice-v4 (improvising, reread 2026-11-24), v3\'s reread points 2 and 5 unchanged', wording.version === 'own-voice-v4' && wording.text[1] === "We never publish or keep your recording. It stays on your device, in this browser's storage, until you remove it or record again; your browser may also clear it. It is sent to be converted only when you press Convert." && wording.text[4].startsWith('We keep each converted speech as your draft as soon as it comes back, until you remove it. Once you publish it,') && wording.text[0] === 'You record a speech, word for word or improvised around its theme in your own words. Your recording is converted into a character\'s voice, and only the converted speech can be published.' && /an improvised take\'s transcript becomes its storyboard\'s words, which you can correct/.test(wording.text[3]));
check('C. own-voice-v4 is the file\'s current (reread by Nate 2026-11-24, point 4 ending "Either way, the transcript is kept with your draft."), with no draft; v1, v2 and v3 stay on file, retired', own.current === 'own-voice-v4' && !('draft' in own) && own.versions['own-voice-v4'].text[3].endsWith('which you can correct. Either way, the transcript is kept with your draft.') && Boolean(own.versions['own-voice-v1']) && Boolean(own.versions['own-voice-v2']) && Boolean(own.versions['own-voice-v3']));
check('C. the training line stands without brackets (Nate turned training off, 2026-11-21)', wording.text.some((t) => t.includes('Our account is set so it doesn\'t use them to train its models.')) && !wording.text.join(' ').includes('['));
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
const whole = (await r.json()) as { draftId: string; ticket: string; check: string | null; checks: { n: number; ok: boolean; missing: string[]; extra: string[] }[] | null; error?: string };
const ticket = whole.ticket ?? '';
const autoId = whole.draftId;
check('V. the whole take is converted and kept at once: its draft\'s id, its signed record and its word check come back', r.status === 200 && /^[0-9a-f-]{36}$/.test(autoId) && ticket.includes('.') && r.headers.get('x-voice-ticket') === ticket && typeof whole.check === 'string' && (whole.checks?.length ?? 0) > 0, `${r.status} ${whole.error ?? ''}`);
const converted = new Uint8Array(await (await draftAudioRoute.GET(as(NATE), { params: Promise.resolve({ id: autoId, n: '0' }) })).arrayBuffer());
check('V. the kept draft plays the converted speech for its person', converted.length > 1000);
{
  const [kd] = await sql`select fid, kind, published_at, recipe from studio.voice_drafts where id = ${autoId}`;
  const kr = kd?.recipe as { kept: string; takes: { takeSha256: string; convertedSha256: string }[]; check: { sentences: number } | null; timeline: unknown } | undefined;
  check('V. ... a private draft of its person, kept automatically, with the take\'s sha256 only and its word check and strip', Number(kd?.fid) === NATE && kd.kind === 'performance' && kd.published_at === null && kr?.kept === 'automatically, when the conversion came back' && kr.takes.length === 1 && kr.takes[0].takeSha256 === sha(take) && kr.takes[0].convertedSha256 === sha(converted) && kr.check?.sentences === speech.sentences.length && kr.timeline !== null, JSON.stringify({ fid: kd?.fid, kind: kd?.kind, pub: kd?.published_at, kept: kr?.kept, takes: kr?.takes?.length, check: kr?.check?.sentences, tl: Boolean(kr?.timeline) }));
  const rows = await sql`select storage_key, sha256 from studio.voice_draft_audio where draft_id = ${autoId}`;
  check('V. ... its storage holds the converted audio only, byte for byte', rows.length === 1 && rows[0].sha256 === sha(converted) && sha(new Uint8Array(readFileSync(path.join(STORE, rows[0].storage_key)))) === sha(converted) && !storeFiles().some((f) => sha(new Uint8Array(readFileSync(path.join(STORE, f)))) === sha(take)));
  const stG0 = (await (await status.GET(as(GARANCE))).json()) as { drafts: { id: string }[] };
  check('V. ... and nobody else sees it, even an admin', !stG0.drafts.some((x) => x.id === autoId) && (await draftAudioRoute.GET(as(GARANCE), { params: Promise.resolve({ id: autoId, n: '0' }) })).status === 404);
}
{
  // Fix 7's server side (Nate, 2026-11-24: "not optional"): the same recording is converted again only with "Convert
  // again" (again=1). Refused before anything is sent or counted: no ElevenLabs call, no take counted, no hold left.
  const { CONVERTED_ALREADY } = await import('../src/lib/voice/take-flow');
  const calls0 = stub.calls.filter((c) => c.path.startsWith('/v1/speech-to-speech')).length;
  const asks0 = (await sql`select count(*)::int n from studio.voice_asks where fid = ${NATE}`)[0].n;
  const rr = await convert.POST(as(NATE, { method: 'POST', body: takeForm(new Uint8Array(take)) }));
  const jj = (await rr.json()) as { error?: string };
  const held = (await sql`select coalesce(sum(calls),0)::int n from studio.voice_costs where kind = 'reserved'`)[0].n;
  check('V. fix 7: converting the same recording again without "Convert again" is refused (409), before anything is sent or counted', rr.status === 409 && jj.error === CONVERTED_ALREADY && stub.calls.filter((c) => c.path.startsWith('/v1/speech-to-speech')).length === calls0 && (await sql`select count(*)::int n from studio.voice_asks where fid = ${NATE}`)[0].n === asks0 && held === 0, `${rr.status} ${jj.error} held ${held}`);
  const src = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
  check('V. fix 7: the page sends again=1 only from "Convert again"', /if \(convertAgain\) form\.set\('again', '1'\);/.test(src) && /convert\(blob, seconds, null, take\.speechId, again === 'yes'\)/.test(src) && (src.match(/form\.set\('again'/g) ?? []).length === 1);
}
{
  // The keeping refuses the raw take itself (a planted bug that handed it the take would be stopped here too).
  const { keepPerformance } = await import('../src/lib/voice/keep-converted');
  const { readConvertTicket } = await import('../src/lib/voice/take-flow');
  const { verifyTicket } = await import('../src/lib/voice/ticket');
  const parsed = readConvertTicket({ verify: (x: string) => verifyTicket<never>(x), now: () => Date.now() }, ticket, NATE);
  const n0 = (await sql`select count(*)::int n from studio.voice_drafts`)[0].n;
  let refused = false;
  try {
    await keepPerformance(sql, NATE, { ticket: parsed, audio: new Uint8Array(take), check: null });
  } catch {
    refused = true;
  }
  check('V. keeping refuses the raw take\'s bytes, and stores nothing', refused && (await sql`select count(*)::int n from studio.voice_drafts`)[0].n === n0);
}
const sts = stub.calls.slice(before).filter((c) => c.path.startsWith('/v1/speech-to-speech/'));
check('V. ElevenLabs got the take once, into the preview\'s voice, with the model and settings', sts.length === 1 && sts[0].files[0]?.sha256 === sha(take) && /fdoGbz5eU4VUde5iMQYV/.test(sts[0].path) && sts[0].fields.model_id === VOICE.models.convert && JSON.parse(sts[0].fields.voice_settings).stability === 0.5);
check('V. the conversion\'s history item was deleted at ElevenLabs right after', stub.deleted.length === 1 && stub.deleted[0] === 'stubhist1');
check('V. the reply is not the take', sha(converted) !== sha(take) && !JSON.stringify(whole).includes(take.subarray(0, 30).toString('base64')));
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
check('T. the transcript ElevenLabs keeps is deleted right after (ElevenLabs keeps one per transcription, 2026-11-21)', stub.deletedTranscripts.length >= 1 && stub.kept().length === 0, `deleted ${stub.deletedTranscripts.length}, still kept ${stub.kept().length}`);
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
check('A. before "Use this one", the only draft is the one kept when the conversion came back', (await sql`select count(*)::int n from studio.voice_drafts`)[0].n === 1);
r = await accept.POST(as(NATE, { method: 'POST', body: acceptForm(converted, ticket, t1.check, { audio: redoAudio, ticket: redoTicket, check: t2.check }) }));
const acc = (await r.json()) as { id: string; recipe: Record<string, unknown>; error?: string };
{
  const takes = ((acc.recipe?.takes ?? []) as { transcriptDeleted?: boolean }[]);
  check('A. the accepted recipe says each take\'s and redo\'s transcript was deleted at ElevenLabs', takes.length >= 2 && takes.every((t) => t.transcriptDeleted === true), JSON.stringify(takes));
}
if (!acc.id) console.log('  accept said:', r.status, acc.error);
check('A. accept keeps a private draft', r.status === 200 && /^[0-9a-f-]{36}$/.test(acc.id));
const [d] = await sql`select * from studio.voice_drafts where id = ${acc.id}`;
const rec = d.recipe as { provider: string; closedModel: boolean; model: string; settings: { stability: number }; transcribeModel: string; preset: { id: string; candidate: number; generatedVoiceId: string; voiceId: string | null; designModel: string; invented: boolean; standIn: boolean }; takes: { role: string; takeSha256: string; convertedSha256: string; historyDeleted: boolean; sentence?: number }[]; check: { unmatched: number[]; matched: number; sentences: number }; consent: { sha256: string; perRecording: boolean }; speech: { source: { block: string } } };
check('A. the recipe names ElevenLabs, a closed model, the model and its settings', rec.provider === 'ElevenLabs' && rec.closedModel && rec.model === 'eleven_multilingual_sts_v2' && rec.settings.stability === 0.5 && rec.transcribeModel === VOICE.models.transcribe);
check('A. ... the voice: the picked preset, its saved voice and Voice Design recipe, marked invented', rec.preset.id === 'ephelion-light-russian' && rec.preset.candidate === 1 && rec.preset.generatedVoiceId === 'fdoGbz5eU4VUde5iMQYV' && rec.preset.voiceId === 'fdoGbz5eU4VUde5iMQYV' && rec.preset.designModel === 'eleven_ttv_v3' && rec.preset.invented && !rec.preset.standIn);
check('A. ... the sha256 of each raw take, and of each converted file', rec.takes.length === 2 && rec.takes[0].takeSha256 === sha(take) && rec.takes[0].convertedSha256 === sha(converted) && rec.takes[1].takeSha256 === sha(redoTake) && rec.takes[1].sentence === 3 && rec.takes.every((t) => t.historyDeleted));
check('A. ... the word check: every sentence matches once sentence 4 is redone', rec.check.unmatched.length === 0 && rec.check.matched === rec.check.sentences);
check('A. ... the consent\'s wording and that it was given for each recording', rec.consent.sha256 === wording.sha256 && rec.consent.perRecording);
check('A. ... and the speech\'s source and label', rec.speech.source.block === 'c13-b64' && (rec.speech as unknown as { label: { text: string } }).label.text === 'Book');
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
  check('B. the board sends the speech\'s own sentences (its text, not the transcription) for the shots and the play-through', JSON.stringify((b0 as unknown as { draft: { sentences: { n: number; text: string }[] } }).draft.sentences) === JSON.stringify(speech.sentences.map((x) => ({ n: x.n, text: x.text }))));
  {
    const want = board.coverageAngles(b0.board.shots);
    check('B. ... and no shot has words written for it (P2): every description is empty; the cameras are the default coverage, set by the rule (Nate, 2026-11-22)', b0.board.shots.every((x, i) => x.description === '' && x.kept === null && x.angle === want[i] && x.angleBy === 'rule' && !x.insert) && b0.board.shots[0].angle === 'wide', b0.board.shots.map((x) => x.angle).join());
  }
  check('B. the notes are rule checks that name no content (P2)', b0.notes.length > 0 && b0.notes.every((n) => /^Shot|^Shots|^The scene/.test(n.text) && !/should show|try showing|describe/i.test(n.text)));
  check('B. the kept pictures and the picture-making settings are separate fields (neither hides the other)', Array.isArray((b0 as unknown as { pictures: unknown }).pictures) && typeof (b0 as unknown as { making: unknown }).making === 'object');
  check('B. the published sheets are offered', b0.sheets.styles.some((x) => x.title === 'Ink and wash') && b0.sheets.characters.some((x) => x.title === 'Ephelion'));
  // The person moves a cut, adds one, removes one, writes shot 1, picks a camera and the sheets, saves.
  const cuts = [...b0.board.cuts];
  cuts.splice(1, 1);
  cuts.push(board.snapToWordEnd(tl as never, 5));
  const mine = 'Ephelion\'s letter glows on a cracked screen in a dim tunnel; a commuter stops to read it.';
  const style = b0.sheets.styles[0].id;
  const eph = b0.sheets.characters.find((x) => x.title === 'Ephelion')!.id;
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
  const pic = (body: Record<string, unknown>, fid = NATE) => boardPicture.POST(as(fid, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: s2.shots[0].key, ...body }) }));
  check('B. the board offers the challenge\'s models, with its default, says these are stand-ins here, and that real pictures are on for this admin', (b0 as unknown as { making: { models: { id: string }[]; standIn: boolean; real: boolean } }).making.models.length >= 1 && (b0 as unknown as { making: { standIn: boolean } }).making.standIn && (b0 as unknown as { making: { real: boolean } }).making.real === true);
  check('B. a shot that isn\'t on the saved storyboard gets no picture (400)', (await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: 'zz9', description: mine, angle: 'low' }) }))).status === 400);
  check('B. no picture without the person\'s own description (400)', (await pic({ description: '  ', angle: 'low' })).status === 400);
  check('B. ... or without a camera angle (400)', (await pic({ description: mine, angle: '' })).status === 400);
  check('B. ... or with a sheet that isn\'t published (400)', (await pic({ description: mine, angle: 'low', styleId: '00000009-0000-4000-8000-999999999999' })).status === 400);
  // The scene (Nate, 2026-11-22): every shot in the scene needs it kept first.
  r = await pic({ description: mine, angle: 'low', styleId: style, characterIds: [eph] });
  check('S2. a shot in the scene gets no picture before the scene is kept (400), and nothing is counted', r.status === 400 && ((await r.json()) as { reason?: string }).reason === 'no-scene' && (await sql`select count(*)::int n from studio.voice_board_asks where draft_id = ${acc.id}`)[0].n === 0);
  const setting = '(test script\'s words) A tall window over a grey harbour, early light, a lectern of dark wood.';
  r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: 'scene', description: setting, angle: 'low', styleId: style, characterIds: [eph] }) }));
  const sc = (await r.json()) as { image: string; sha256: string; ticket: string; recipe: { kind: string; prompt: string; angle: string; references: { role: string }[]; setting: { text: string } } };
  check('S2. the scene: the person\'s setting first, word for word, always the wide master (a sent camera is ignored), his look its one reference', r.status === 200 && sc.recipe.kind === 'storyboard-scene' && sc.recipe.prompt.startsWith(setting) && sc.recipe.angle === 'wide' && /Camera: a wide shot/.test(sc.recipe.prompt) && sc.recipe.references.map((x) => x.role).join() === 'anchor-look' && sc.recipe.setting.text === setting && !/The same place, light/.test(sc.recipe.prompt), JSON.stringify({ s: r.status, kind: sc.recipe?.kind, angle: sc.recipe?.angle, refs: sc.recipe?.references?.map((x) => x.role), start: sc.recipe?.prompt?.slice(0, 60) }));
  check('S2. ... one look a picture: two characters are refused (400)', (await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: 'scene', description: setting, characterIds: [eph, eph] }) }))).status === 400);
  check('S2. ... kept like a shot\'s picture', (await boardKeep.POST(as(NATE, { method: 'POST', body: JSON.stringify({ ticket: sc.ticket, image: sc.image }) }))).status === 200);
  r = await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts, shots: s2.shots, scene: { setting, kept: sc.sha256 } }) }));
  const sSc = (await r.json()) as { version: number; scene: { setting: string; kept: string | null }; notes: { kind: string }[] };
  check('S2. the board saves the scene: the setting word for word, and the kept picture', r.status === 200 && sSc.scene.setting === setting && sSc.scene.kept === sc.sha256 && !sSc.notes.some((n) => n.kind === 'no-scene'));
  r = await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts, shots: s2.shots, scene: { setting, kept: 'e'.repeat(64) } }) }));
  check('S2. ... a scene picture that was never kept can\'t be claimed', ((await r.json()) as { scene: { kept: string | null } }).scene.kept === null);
  r = await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts, shots: s2.shots, scene: { setting, kept: sc.sha256 } }) }));
  r = await pic({ description: mine, angle: 'low', styleId: style, characterIds: [eph] });
  const p1 = (await r.json()) as { image: string; sha256: string; ticket: string; triesLeft: number; recipe: { model: { id: string }; prompt: string; costUsd: number; standIn: boolean; description: string } };
  const png = Buffer.from(p1.image.split(',')[1], 'base64');
  check('B. a stand-in picture comes back in the picture flow\'s shape: PNG, sha256, signed record, recipe', r.status === 200 && png.subarray(1, 4).toString() === 'PNG' && sha(png) === p1.sha256 && p1.ticket.includes('.') && p1.recipe.model.id === 'stand-in' && p1.recipe.standIn && p1.recipe.costUsd === 0 && p1.triesLeft === 2);
  check('B. its prompt is the person\'s words first, word for word, then the camera, the sheets\' own texts and the site\'s rules', p1.recipe.prompt.startsWith(mine) && /Camera: a low-angle shot/.test(p1.recipe.prompt) && /Lord Ephelion: a tall man/.test(p1.recipe.prompt) && /Style: Ink and wash: loose/.test(p1.recipe.prompt) && p1.recipe.description === mine);
  check('B. no model was called and nothing was spent (no ElevenLabs or image host call)', stub.calls.length === callsBefore);
  check('B. nothing is stored before Keep (only the try is counted; the scene is the one kept picture so far)', (await sql`select count(*)::int n from studio.voice_board_pictures where shot_key <> 'scene'`)[0].n === 0 && (await sql`select count(*)::int n from studio.voice_board_asks where draft_id = ${acc.id} and shot_key <> 'scene'`)[0].n === 1);
  {
    const rr = p1.recipe as unknown as { references: { role: string; sha256: string }[]; prompt: string; scene: { sha256: string; setting: string }; camera: { angle: string; by: string }; coverage: { name: string }; insert: boolean; continuity: string | null };
    check('S2. shot 1 sends the scene and his look as anchors, in that order, and no previous shot', rr.references.map((x) => x.role).join() === 'anchor-scene,anchor-look' && rr.references[0].sha256 === sc.sha256 && rr.continuity === null, JSON.stringify({ refs: rr.references.map((x) => x.role), c: rr.continuity }));
    check('S2. ... its prompt adds the one same-scene line; its recipe names the scene, the camera and who set it, the coverage rule, not an insert', /The same place, light, clothes and person as the first reference pictures\./.test(rr.prompt) && rr.scene.sha256 === sc.sha256 && rr.scene.setting === setting && rr.camera.angle === 'low' && rr.coverage.name === 'scene-coverage' && rr.insert === false);
  }
  const keep = (ticket: string, image: string, fid = NATE) => boardKeep.POST(as(fid, { method: 'POST', body: JSON.stringify({ ticket, image }) }));
  const p2 = (await (await pic({ description: mine, angle: 'low' })).json()) as { image: string; sha256: string; ticket: string };
  check('B. a retry makes a different picture', p2.sha256 !== p1.sha256);
  await pic({ description: mine, angle: 'low' });
  r = await pic({ description: mine, angle: 'low' });
  check('B. at most 3 pictures a shot: the fourth is refused (429)', r.status === 429 && ((await r.json()) as { reason?: string }).reason === 'tries');
  {
    const { makeShotPicture, realPicturesFor } = await import('../src/lib/voice/shot-picture');
    let made = false;
    let pool: string | undefined;
    const realDeps = {
      // The look's sheet picture: a plain picture (the board's look is sent with every shot in the scene, fix 1).
      real: true, consented: async () => true, reference: async () => sharpPng(), paid: (async (_s: unknown, _f: unknown, _r: unknown, job: { spend: { pool?: string } }) => { made = true; pool = job.spend.pool; return { ok: false, status: 429, error: 'stopped by the test', extra: {} }; }) as never, make: async () => { throw new Error('no'); },
    };
    const body = { draftId: acc.id, shotKey: s2.shots[1].key, description: mine, angle: 'low' };
    const stranger = await makeShotPicture(sql, STRANGER, new Request('http://localhost/x'), body, { country: null, region: null } as never, realDeps);
    check('B. real pictures for admins only: anyone else is refused before any call (403)', stranger.status === 403 && !made && !realPicturesFor(STRANGER) && realPicturesFor(NATE) && realPicturesFor(GARANCE));
    const admin = await makeShotPicture(sql, NATE, new Request('http://localhost/x'), body, { country: null, region: null } as never, realDeps);
    check('B. ... an admin reaches the paid step, on the admins\' pool (its daily cap)', made && pool === 'admin' && admin.status === 429, `${admin.status} ${pool}`);
  }
  {
    const many = Array.from({ length: 12 }, (_, i) => Math.round((tl.seconds / 13) * (i + 1) * 100) / 100);
    r = await save(many, s2.shots);
    check('B. at most 12 shots: a 13th is refused when saving', r.status === 400);
  }
  check('B. the automatic cuts never make more than 12 shots, even for a long speech', board.proposeCuts({ seconds: 600, words: [], sentences: Array.from({ length: 200 }, (_, i) => ({ n: i, start: i * 3, end: i * 3 + 3 })) }).length <= 11);
  check('B. Keep refuses another picture\'s bytes, and another person', (await keep(p1.ticket, p2.image)).status === 400 && (await keep(p1.ticket, p1.image, GARANCE)).status === 400);
  r = await keep(p1.ticket, p1.image);
  const keyP = `voice-boards/${acc.id}/${NATE}/${s2.shots[0].key}-${p1.sha256}.png`;
  check('B. Keep stores it privately, under voice-boards/<draft>/<owner>/, with its recipe', r.status === 200 && existsSync(path.join(STORE, keyP)) && (await sql`select recipe from studio.voice_board_pictures where storage_key = ${keyP}`)[0]?.recipe.prompt === p1.recipe.prompt);
  r = await save(cuts, s2.shots.map((x, i) => (i === 0 ? { ...x, kept: p1.sha256 } : x)));
  const s3 = (await r.json()) as { version: number; shots: Shot[]; notes: { kind: string; shot: string }[] };
  check('B. the kept picture is on the board now (version 6, after the scene\'s three saves), and its note is gone', s3.version === 6 && s3.shots[0].kept === p1.sha256 && !s3.notes.some((n) => n.kind === 'no-picture' && n.shot === s3.shots[0].key));
  const pget = (fid: number) => boardPicture.GET(as(fid, {}, `http://localhost/api/voice/boards/picture?draft=${acc.id}&shot=${s2.shots[0].key}&sha=${p1.sha256}`));
  r = await pget(NATE);
  check('B. the kept picture plays for its person', r.status === 200 && sha(new Uint8Array(await r.arrayBuffer())) === p1.sha256);
  check('B. ... and reads as missing for anyone else', (await pget(GARANCE)).status === 404);
  const same = board.boardNotes(s3.shots.map((x) => ({ ...x, angle: 'wide' as const })));
  check('B. notes: three shots in a row from the same angle are flagged', same.some((n) => n.kind === 'same-angle'));
  check('B. P2, by reading the code: nothing in the board fills a description', !/description:\s*['"`][^'"`]/.test(readFileSync(path.join(ROOT, 'src/lib/voice/board.ts'), 'utf8').replace(/description: ''/g, '')) && !/description\s*=\s*['"`]/.test(readFileSync(path.join(ROOT, 'src/app/api/voice/boards/route.ts'), 'utf8')));

  // K. Slice 4: the closing card, publishing, the take-down (2026-11-21; stand-ins only).
  const closingLib = await import('../src/lib/voice/closing');
  const { closingCard, closingSvg, CARD } = await import('../src/lib/voice/closing-card');
  const { publication, publishPreview } = await import('../src/lib/voice/publish');
  const { publishOn } = await import('../src/lib/voice/publish-deps');
  const sharp = (await import('sharp')).default;
  const publishRoute = await route('publish');
  const takeDownRoute = await route('publish/[id]');
  const closingRoute = await route('boards/closing');
  const publicRoute = await route('public/[...key]');
  {
    const credits = closingLib.closingCredits({ speech: { title: 'The letter', block: 'c13-b64' }, performer: 'naaate', preset: 'Warm, measured (American)', voiceModel: { name: 'ElevenLabs Voice Changer', maker: 'ElevenLabs' }, transcribeModel: { name: 'ElevenLabs Scribe v3', maker: 'ElevenLabs' }, pictures: [{ id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', maker: 'OpenAI', open: false }, { id: 'flux', name: 'FLUX.2', maker: 'Black Forest Labs', open: true }, { id: 'stand-in', name: 'Stand-in', maker: 'x', open: true }], shots: 7 });
    const text = credits.map((c) => c.text).join('\n');
    check('K. the credits name the book\'s block, the performer, the voice, and say which are people and which are AI', /c13-b64/.test(text) && /@naaate/.test(text) && /Warm, measured/.test(text) && credits.some((c) => c.who === 'people') && credits.some((c) => c.who === 'ai') && credits.some((c) => c.who === 'book'));
    check('K. ... every model by name and maker, closed or open, and the stand-ins counted', /ElevenLabs Voice Changer by ElevenLabs \(closed model\)/.test(text) && /GPT Image 2.5 Sunburst by OpenAI \(closed model\)/.test(text) && /FLUX\.2 by Black Forest Labs \(open model\)/.test(text) && /1 stand-in card in place/.test(text));
    check('K. ... and always the not-affiliated line and "No AI video"', credits.at(-1)!.text === closingLib.CLOSING.notAffiliated && /not affiliated with or endorsed by the author/i.test(credits.at(-1)!.text) && /AI did the voice conversion, the word check and the pictures\. No AI video/.test(text));
    const anon = closingLib.closingCredits({ speech: { title: 'T', block: null }, performer: null, preset: 'p', voiceModel: { name: 'v', maker: 'm' }, transcribeModel: { name: 't', maker: 'm' }, pictures: [], shots: 1 });
    check('K. with stand-ins only, the card doesn\'t say AI made the pictures, and the stand-in line isn\'t tagged AI', /AI did the voice conversion and the word check\. No AI video/.test(anon.map((c) => c.text).join(' ')) && credits.find((c) => /stand-in card/.test(c.text))?.who === 'site');
    const credit = 'Words by the Snowmoon team, drafted with AI help (Claude, by Anthropic)';
    const inv = closingLib.closingCredits({ speech: { title: 'Doing fine', block: null, invented: { version: 2, credit } }, performer: null, preset: 'p', voiceModel: { name: 'v', maker: 'm' }, transcribeModel: { name: 't', maker: 'm' }, pictures: [], shots: 1 });
    check('K. an invented speech on the card: "Invented, not from the book", its version and its credit, no book block', inv[0].who === 'invented' && inv[0].text === `Speech: “Doing fine” (version 2). Invented, not from the book. ${credit}.` && !/c13-b|from Snowmoon by/.test(inv[0].text), inv[0].text);
    check('K. ... and the not-affiliated line wherever Vitalik is named (the card names him in it)', inv.at(-1)!.text === closingLib.CLOSING.notAffiliated && /Vitalik Buterin/.test(inv.at(-1)!.text));
    check('K. ... and publishing one waits for Nate\'s word', closingLib.publishProblems({ unmatched: [], sentences: 1, shots: [], keptShots: new Set(), closing: { description: 'x', styleId: null, kept: 'b'.repeat(64) }, closingKept: true, standIns: 0, standInsAllowed: true, inventedHeld: true }).some((x) => /invented speeches can’t be published yet/.test(x)) && VOICE.publishInvented === false);
    check('K. not named: "a reader", and no name anywhere', anon.every((c) => !/@/.test(c.text)) && anon.some((c) => /a reader/.test(c.text)));
    const svg = closingSvg('The letter', credits);
    const flat = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    check('K. the card draws the site\'s own text: every credit\'s words and the snowmoon.party mark', credits.every((c) => closingLib.wrapLines(c.text, 200).join(' ').split(' ').every((w) => flat.includes(w.replace(/&/g, '&amp;').replace(/</g, '&lt;')))) && flat.includes('snowmoon.party'));
    const meta = await sharp(await closingCard(null, 'The letter', credits)).metadata();
    check('K. the card is a 1536 × 864 PNG, even with no background', meta.format === 'png' && meta.width === CARD.width && meta.height === CARD.height);
    const facts = { unmatched: [3], sentences: 20, shots: [{ key: 's1', start: 0, end: 5, description: 'x', angle: 'wide' as const, styleId: null, characterIds: [], kept: 'a'.repeat(64) }], keptShots: new Set([`s1:${'a'.repeat(64)}`]), closing: { description: 'snow', styleId: null, kept: 'b'.repeat(64) }, closingKept: true, standIns: 2, standInsAllowed: false };
    const probs = closingLib.publishProblems(facts);
    check('K. the publish rule: an unmatched sentence stops publishing (accepting it was allowed)', probs.some((x) => /Sentence 4 doesn’t match/.test(x)));
    check('K. ... and stand-in cards can\'t be published off a local test copy', probs.some((x) => /Stand-in cards can’t be published/.test(x)) && !closingLib.publishProblems({ ...facts, unmatched: [], standInsAllowed: true }).length);
    check('K. publishing is off in the committed config, and off on Vercel even with the test switch', VOICE.publish === false && (() => { process.env.VERCEL = '1'; const on = publishOn(); delete process.env.VERCEL; return !on; })() && publishOn());
  }
  {
    const named = 'named=no';
    const preview = async (fid = NATE) => publishRoute.GET(as(fid, {}, `http://localhost/api/voice/publish?draft=${acc.id}&${named}`));
    let pv = (await (await preview()).json()) as { on: boolean; problems: string[]; version: number };
    check('K. before the shots have pictures, the check lists what is missing', pv.on && pv.problems.some((x) => /has no picture kept/.test(x)) && pv.problems.some((x) => /closing card has no background/.test(x)));
    check('K. someone else\'s draft reads as missing (404)', (await preview(GARANCE)).status === 404);
    // Every shot: the person's words (the test script's, marked so), a camera, a stand-in picture, kept.
    let cur = s3.shots;
    for (const [i, sh] of cur.entries()) {
      if (i === 0) continue;
      const words = `(test script's words) shot ${i + 1}: the tunnel, then the street.`;
      cur = cur.map((x) => (x.key === sh.key ? { ...x, description: words, angle: 'medium' as const } : x));
    }
    let sv = (await (await save(cuts, cur)).json()) as { version: number; shots: Shot[] };
    for (const sh of sv.shots.slice(1)) {
      const made = (await (await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: sh.key, description: sh.description, angle: sh.angle }) }))).json()) as { ticket: string; image: string; sha256: string };
      await keep(made.ticket, made.image);
      cur = sv.shots.map((x) => (x.key === sh.key ? { ...x, kept: made.sha256 } : x));
      sv = { ...sv, shots: cur };
    }
    {
      const rows = await sql`select shot_key, recipe from studio.voice_board_pictures where draft_id = ${acc.id} and fid = ${NATE}`;
      const r2 = rows.find((x) => x.shot_key === sv.shots[1].key)?.recipe as { references: { role: string; shotKey?: string }[]; continuity: string | null } | undefined;
      const r3 = rows.find((x) => x.shot_key === sv.shots[2]?.key)?.recipe as { continuity: string | null } | undefined;
      check('S2. shot 2 sends the scene, the board\'s look (fix 1), then shot 1 as kept (continuity); shot 3 follows the last kept shot on the saved board', r2?.references.map((x) => x.role).join() === 'anchor-scene,anchor-look,continuity' && r2.continuity === sv.shots[0].key && r2.references[2].shotKey === sv.shots[0].key && (sv.shots.length < 3 || [sv.shots[0].key, sv.shots[1].key].includes(r3?.continuity ?? '')), JSON.stringify(r2?.references));
    }
    const look = "(test script's words) Snow falling over a dark harbour, the lamps out.";
    r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, shotKey: 'end', description: look }) }));
    const bg = (await r.json()) as { ticket: string; image: string; sha256: string; recipe: { kind: string; prompt: string; angle: unknown; assist: { text: string } } };
    check('K. the closing background goes through the picture flow, with no camera: the person\'s words first', r.status === 200 && bg.recipe.kind === 'storyboard-closing' && bg.recipe.prompt.startsWith(look) && bg.recipe.angle === null && /set by the site/.test(bg.recipe.assist.text));
    check('K. ... it is a stand-in here, labelled as the closing card', Buffer.from(bg.image.split(',')[1], 'base64').length > 1000);
    check('K. ... and keeping it stores it privately like a shot\'s', (await keep(bg.ticket, bg.image)).status === 200 && existsSync(path.join(STORE, `voice-boards/${acc.id}/${NATE}/end-${bg.sha256}.png`)));
    r = await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts, shots: cur, closing: { description: look, styleId: null, kept: bg.sha256 } }) }));
    const sv2 = (await r.json()) as { version: number; closing: { description: string; kept: string | null } };
    check('K. the board keeps the closing card\'s choices on its version (the words as given)', r.status === 200 && sv2.closing.description === look && sv2.closing.kept === bg.sha256);
    r = await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts, shots: cur, closing: { description: look, kept: 'c'.repeat(64) } }) }));
    check('K. ... and a background that was never kept can\'t be claimed', ((await r.json()) as { closing: { kept: string | null } }).closing.kept === null);
    r = await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, cuts, shots: cur, closing: { description: look, styleId: null, kept: bg.sha256 } }) }));
    const version = ((await r.json()) as { version: number }).version;
    r = await closingRoute.GET(as(NATE, {}, `http://localhost/api/voice/boards/closing?draft=${acc.id}&${named}`));
    const cardMeta = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
    check('K. the closing card preview, for its person: the background with the site\'s text', r.status === 200 && cardMeta.width === CARD.width);
    check('K. ... and missing for anyone else', (await closingRoute.GET(as(GARANCE, {}, `http://localhost/api/voice/boards/closing?draft=${acc.id}&${named}`))).status === 404);
    // The word check: with an unmatched sentence the draft can't be published; with none, it can.
    const [{ recipe: rec0 }] = await sql`select recipe from studio.voice_drafts where id = ${acc.id}`;
    const realUnmatched = (rec0 as { check: { unmatched: number[] } }).check.unmatched;
    await pg.query(`update studio.voice_drafts set recipe = jsonb_set(recipe, '{check,unmatched}', '[2]') where id = $1`, [acc.id]);
    pv = (await (await preview()).json()) as typeof pv;
    check('K. an unmatched sentence is the one thing left, and it stops publishing', pv.problems.length === 1 && /Sentence 3 doesn’t match/.test(pv.problems[0]), JSON.stringify(pv.problems));
    r = await publishRoute.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, version, named: false }) }));
    check('K. ... the publish route refuses it (400) and makes nothing public', r.status === 400 && !existsSync(path.join(STORE, 'public')));
    await pg.query(`update studio.voice_drafts set recipe = jsonb_set(recipe, '{check,unmatched}', '[]') where id = $1`, [acc.id]);
    pv = (await (await preview()).json()) as typeof pv;
    check('K. every sentence matching, every shot kept, the card\'s background kept: ready', pv.problems.length === 0, JSON.stringify(pv.problems));
    check('K. publishing someone else\'s draft: 404; a stale version: 409', (await publishRoute.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, version, named: false }) }))).status === 404 && (await publishRoute.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, version: version - 1, named: false }) }))).status === 409);
    check('K. a stand-in can\'t be published where stand-ins aren\'t allowed', ((await publishPreview(sql, NATE, acc.id, { standInsAllowed: false }, null))?.problems ?? []).some((x) => /Stand-in/.test(x)));
    const callsBefore = stub.calls.length;
    r = await publishRoute.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, version, named: false }) }));
    const pub = (await r.json()) as { id: string; url: string };
    check('K. published: its page is /storyboard/spoken/<id>, and no model was called', r.status === 200 && pub.url === `/storyboard/spoken/${pub.id}` && stub.calls.length === callsBefore);
    const files = storeFiles().filter((f) => f.startsWith(`public/storyboards/${pub.id}/`));
    const [row] = await sql`select recipe, files, named from studio.voice_publications where id = ${pub.id}`;
    const pf = row.files as { role: string; key: string; sha256: string }[];
    check('K. public copies: every audio piece, every shot\'s picture, the background and the composed card', files.length === pf.length && pf.filter((f) => f.role === 'audio').length === 2 && pf.filter((f) => f.role === 'shot').length === cur.length && pf.some((f) => f.role === 'background') && pf.some((f) => f.role === 'closing'));
    check('K. ... byte for byte (each public file\'s sha256 is its record\'s)', pf.every((f) => sha(readFileSync(path.join(STORE, 'public', f.key))) === f.sha256));
    const takes = ((row.recipe as { voice: { takes: { takeSha256: string }[] } }).voice.takes ?? []).map((t) => t.takeSha256);
    check('K. the raw take is never published: the recipe has only its sha256, and no public file is it', takes.length >= 1 && takes.every((h) => /^[0-9a-f]{64}$/.test(h)) && pf.every((f) => !takes.includes(f.sha256)));
    const pr = row.recipe as { performer: { named: boolean; fid?: number }; shots: { description: string; picture: { madeBy: unknown } }[]; closing: { credits: { text: string }[]; description: string }; noAiVideo: boolean; ai: string[]; people: string[] };
    check('K. the full recipe: each shot\'s words and picture recipe, the closing card\'s words and credits, who did what', pr.shots.length === cur.length && pr.shots[0].description === mine && pr.closing.description === look && pr.closing.credits.length >= 5 && pr.noAiVideo && pr.ai.length > 0 && pr.people.length > 0);
    check('K. not named: no FID or name in the public recipe', row.named === false && !('fid' in pr.performer) && !JSON.stringify(row.recipe).includes(`"fid":${NATE}`));
    const live = await publication(sql, pub.id);
    check('K. the public page\'s data: the live publication with its files\' addresses', Boolean(live) && live!.fid === null && live!.files.every((f) => f.url === `/api/voice/public/${f.key}`));
    const one = pf.find((f) => f.role === 'closing')!;
    r = await publicRoute.GET(new Request(`http://localhost${live!.files.find((f) => f.key === one.key)!.url}`), { params: Promise.resolve({ key: one.key.split('/') }) });
    check('K. the local public route serves its files (test copy only)', r.status === 200 && sha(new Uint8Array(await r.arrayBuffer())) === one.sha256);
    check('K. a published draft is no longer a draft: its board reads as missing, and the check gives the link', (await boards.GET(as(NATE, {}, `http://localhost/api/voice/boards?draft=${acc.id}`))).status === 404 && ((await (await preview()).json()) as { published?: { url: string } }).published?.url === pub.url);
    check('K. ... it can\'t be removed while published, nor published twice', (await draftRoute.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: acc.id }) })).status === 404 && (await publishRoute.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: acc.id, version, named: false }) }))).status === 404);
    check('K. someone else can\'t take it down', (await takeDownRoute.DELETE(as(GARANCE, { method: 'DELETE' }), { params: Promise.resolve({ id: pub.id }) })).status === 404 && existsSync(path.join(STORE, 'public', one.key)));
    // M. Reporting and hiding a published storyboard (Nate, 2026-11-23): the images' rules; a reversible hide.
    {
      const M = await import('../src/lib/voice/moderation');
      const { moderationDeps } = await import('../src/lib/voice/publish-deps');
      const deps = moderationDeps();
      const reportRoute = await route('publications/[id]/report');
      const modQueue = (await import(path.join(ROOT, 'src/app/api/moderate/route.ts'))) as { GET: (r: Request) => Promise<Response> };
      const rep = (fid: number | null, body: unknown) => reportRoute.POST(as(fid, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: pub.id }) });
      const mine = async (fid: number) => (await (await reportRoute.GET(as(fid, {}), { params: Promise.resolve({ id: pub.id }) })).json()) as { mine: boolean; hiddenReason?: string | null };
      const publicN = () => storeFiles().filter((f) => f.startsWith(`public/storyboards/${pub.id}/`)).length;
      const privateN = () => storeFiles().filter((f) => f.startsWith(`voice-hidden/storyboards/${pub.id}/`)).length;
      const logOf = async () => (await sql`select step, role, reason, by_fid from studio.voice_publication_log where publication_id = ${pub.id} order by at, step`).map((x) => `${x.step}:${x.role}`);
      check('M. reporting: 401 signed out, 400 for its own maker, 400 without a known reason', (await rep(null, { reason: 'spam' })).status === 401 && (await rep(NATE, { reason: 'spam' })).status === 400 && (await rep(GARANCE, { reason: 'nope' })).status === 400);
      check('M. ... its maker learns it is theirs from the server; nobody else does (an unnamed storyboard stays unnamed)', (await mine(NATE)).mine === true && (await mine(GARANCE)).mine === false);
      let r = await rep(GARANCE, { reason: 'spam', note: 'Looks like spam to me.' });
      let j = (await r.json()) as { reported?: boolean; hidden?: boolean };
      check('M. a report is kept with its reason and note; the storyboard stays up', r.status === 200 && j.reported === true && j.hidden === false && publicN() === pf.length && (await publication(sql, pub.id))?.hidden === null);
      check('M. ... once per person', (await rep(GARANCE, { reason: 'other' })).status === 200 && (await sql`select count(*)::int n from studio.voice_publication_log where publication_id = ${pub.id} and step = 'reported' and by_fid = ${GARANCE}`)[0].n === 1);
      let q = await M.storyboardQueue(sql);
      const item = q.find((x) => x.id === pub.id);
      check('M. the admins\' queue: its reasons with counts, how many reported, the notes, never who', Boolean(item) && item!.reporters === 1 && item!.reasons[0]?.reason === 'spam' && item!.notes[0] === 'Looks like spam to me.' && !JSON.stringify(q).includes(String(GARANCE)) && item!.maker === null, JSON.stringify(item));
      check('M. ... it is counted in the moderators\' push', (await M.storyboardReportsWaiting(sql)) >= 1);
      check('M. ... it is in the one moderator queue (/moderate, with the images\'), closed to anyone else', (await modQueue.GET(as(STRANGER, {}))).status !== 200 && (await modQueue.GET(as(null, {}))).status === 401 && /storyboardQueue\(sql\)/.test(readFileSync(path.join(ROOT, 'src/app/api/moderate/route.ts'), 'utf8')) && /<ModerateStoryboards \/>/.test(readFileSync(path.join(ROOT, 'src/app/moderate/page.tsx'), 'utf8')) && !existsSync(path.join(ROOT, 'src/app/api/admin/storyboards')) && !/storyboard/.test(readFileSync(path.join(ROOT, 'src/app/api/admin/hide/route.ts'), 'utf8')));
      // A second publication on the same draft (someone else's, made here by hand), for the limit and the "minor" rule.
      const other = randomUUID();
      await pg.query(`insert into studio.voice_publications (id, draft_id, fid, board_version, recipe, files) values ($1, $2, 555, 1, '{"voice":{},"shots":[],"closing":{}}', $3::jsonb)`, [other, acc.id, JSON.stringify([{ key: `storyboards/${other}/a-${'1'.repeat(64)}.mp3`, sha256: '1'.repeat(64) }, { key: `storyboards/${other}/b-${'2'.repeat(64)}.png`, sha256: '2'.repeat(64) }])]);
      for (let i = 0; i < IMAGES.reportsPerDay; i++) await pg.query(`insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason) values ($1, 'reported', 901, 'reader', 'spam')`, [other]);
      const capped = await M.reportStoryboard(sql, 901, pub.id, { reason: 'spam' }, deps);
      check('M. the daily report limit is shared with images (20 a day)', capped.status === 429 && (await M.reportsToday(sql, 901)) === IMAGES.reportsPerDay);
      const minor = await M.reportStoryboard(sql, 905, other, { reason: 'minor' }, deps);
      const [oh] = await sql`select hidden_role from studio.voice_publications where id = ${other}`;
      check('M. one "minor" report hides it at once (a stated rule), with no other report', minor.json.hidden === true && oh.hidden_role === 'rule');
      // Three different reporters hide it at once: the second reporter leaves it up, the third hides it.
      const second = await M.reportStoryboard(sql, 902, pub.id, { reason: 'other' }, deps);
      check('M. two reporters: still up', second.json.hidden === false && (await publication(sql, pub.id))?.hidden === null && publicN() === pf.length);
      r = await rep(STRANGER, { reason: 'violence' });
      j = (await r.json()) as { reported?: boolean; hidden?: boolean };
      const hid = await publication(sql, pub.id);
      check('M. a third reporter hides it at once: the page has no files', j.hidden === true && Boolean(hid?.hidden) && hid!.files.length === 0);
      check('M. ... every public file is gone from the public store, each kept privately byte for byte', publicN() === 0 && privateN() === pf.length && pf.every((f) => sha(readFileSync(path.join(STORE, 'voice-hidden', f.key))) === f.sha256));
      check('M. ... its maker sees why; the page\'s own data never names them', (await mine(NATE)).hiddenReason === 'violence' && hid!.fid === null && !('makerFid' in hid!));
      check('M. ... logged: the reports, the rule\'s hide, the move (rows in one instant may share a time, so as a set)', JSON.stringify((await logOf()).sort()) === JSON.stringify(['reported:reader', 'reported:reader', 'reported:reader', 'hidden:rule', 'moved_private:rule'].sort()), JSON.stringify(await logOf()));
      check('M. ... a rule\'s hide stays in the queue until a moderator looks; the hidden list says who hid it', (await M.storyboardQueue(sql)).some((x) => x.id === pub.id && x.hidden?.role === 'rule') && (await M.hiddenStoryboards(sql)).some((x) => x.id === pub.id && x.hiddenBy === 'a stated rule' && x.reason === 'violence'));
      // A moderator unhides it (the reports were wrong): every file back in public, byte for byte.
      const u = await M.unhideStoryboard(sql, pub.id, GARANCE, 'moderator', deps);
      check('M. unhide: shown again, every file back in the public store byte for byte, the private copies removed', u.shown && u.restored === pf.length && u.failed === 0 && publicN() === pf.length && privateN() === 0 && pf.every((f) => sha(readFileSync(path.join(STORE, 'public', f.key))) === f.sha256) && (await publication(sql, pub.id))!.files.length === pf.length);
      check('M. ... and it leaves the queue', !(await M.storyboardQueue(sql)).some((x) => x.id === pub.id));
      check('M. dismiss: logged, it stays out of the queue, and stays as it is', (await M.dismissStoryboard(sql, pub.id, GARANCE)) && !(await M.storyboardQueue(sql)).some((x) => x.id === pub.id) && publicN() === pf.length && (await logOf()).at(-1) === 'dismissed:moderator');
      // Reporters are counted since the last dismissal (Nate, 2026-11-23; storyboards only): two new ones leave it up.
      await new Promise((res) => setTimeout(res, 20));
      const n1 = await M.reportStoryboard(sql, 906, pub.id, { reason: 'spam' }, deps);
      const n2 = await M.reportStoryboard(sql, 907, pub.id, { reason: 'spam' }, deps);
      check('M. after a dismissal, earlier reporters don\'t count: two new reporters leave it up', n1.json.hidden === false && n2.json.hidden === false && (await publication(sql, pub.id))?.hidden === null && (await M.storyboardQueue(sql)).find((x) => x.id === pub.id)?.reporters === 2);
      const n3 = await M.reportStoryboard(sql, 908, pub.id, { reason: 'other' }, deps);
      check('M. ... a third new reporter hides it', n3.json.hidden === true && publicN() === 0);
      // Unhide puts back exactly what its maker published: a changed private copy is not put back.
      const victim = pf.find((f) => f.role === 'shot')!;
      const asPublished = readFileSync(path.join(STORE, 'voice-hidden', victim.key));
      writeFileSync(path.join(STORE, 'voice-hidden', victim.key), randomBytes(64));
      const bad = await M.unhideStoryboard(sql, pub.id, GARANCE, 'moderator', deps);
      check('M. unhide puts back exactly what its maker published: a changed private copy is refused, the rest restored', bad.shown && bad.failed === 1 && bad.restored === pf.length - 1 && !existsSync(path.join(STORE, 'public', victim.key)));
      // (Put the test's own file back, as published, for the steps below.)
      writeFileSync(path.join(STORE, 'public', victim.key), asPublished);
      rmSync(path.join(STORE, 'voice-hidden', victim.key), { force: true });
      await M.dismissStoryboard(sql, pub.id, GARANCE);
      // A moderator's own hide, then its maker takes it down: the private copies go too.
      const h = await M.hideStoryboard(sql, pub.id, GARANCE, 'moderator', null, null, deps);
      check('M. a moderator\'s hide: hidden, files moved; a second hide changes nothing', h.hidden && h.moved === pf.length && !(await M.hideStoryboard(sql, pub.id, GARANCE, 'moderator', null, null, deps)).hidden && privateN() === pf.length);
      await pg.query(`delete from studio.voice_publication_log where publication_id = $1`, [other]);
      await pg.query(`delete from studio.voice_publications where id = $1`, [other]);
    }
    r = await takeDownRoute.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: pub.id }) });
    check('K. its person takes it down: every public file is deleted, the page is gone, it is a draft again', r.status === 200 && storeFiles().every((f) => !f.startsWith(`public/storyboards/${pub.id}/`)) && (await publication(sql, pub.id)) === null && (await boards.GET(as(NATE, {}, `http://localhost/api/voice/boards?draft=${acc.id}`))).status === 200);
    check('M. ... a hidden storyboard taken down by its maker: its private copies are deleted too', storeFiles().every((f) => !f.startsWith(`voice-hidden/storyboards/${pub.id}/`)));
    check('K. ... the private draft files are untouched', existsSync(path.join(STORE, `voice-boards/${acc.id}/${NATE}/end-${bg.sha256}.png`)) && storeFiles().filter((f) => f.startsWith(`voice-drafts/${acc.id}/`)).length === 2);
    await pg.query(`update studio.voice_drafts set recipe = jsonb_set(recipe, '{check,unmatched}', $2::jsonb) where id = $1`, [acc.id, JSON.stringify(realUnmatched)]);
    check('K. P2, by reading the code: no closing text comes from the request, and nothing writes a description', !/description\s*[:=]\s*['"`][^'"`]/.test(readFileSync(path.join(ROOT, 'src/lib/voice/closing.ts'), 'utf8')) && !/body\.|request\./.test(readFileSync(path.join(ROOT, 'src/lib/voice/closing-card.ts'), 'utf8')));
    check('K. public copies have their own store file, under storyboards/ only; the draft store stays private', /R2_BUCKET/.test(readFileSync(path.join(ROOT, 'src/lib/voice/public-store.ts'), 'utf8')) && /\^storyboards/.test(readFileSync(path.join(ROOT, 'src/lib/voice/public-store.ts'), 'utf8')) && !/R2_PRIVATE_BUCKET/.test(readFileSync(path.join(ROOT, 'src/lib/voice/public-store.ts'), 'utf8')));
  check('K. "Save as a video" is in the browser only: no server route records, uploads or calls a video model', !existsSync(path.join(ROOT, 'src/app/api/voice/video')) && !/fetch\([^)]*(upload|api\/)/.test(readFileSync(path.join(ROOT, 'src/lib/voice/video.ts'), 'utf8')) && /MediaRecorder/.test(readFileSync(path.join(ROOT, 'src/lib/voice/video.ts'), 'utf8')));
  }
}

// S. One scene, several cameras (Nate, 2026-11-22; proposal v2): the coverage rule, the references, the old-scene marks.
{
  const closingLib = await import('../src/lib/voice/closing');
  const mk = (len: number[], ins: number[] = []) => {
    return len.map((l, i) => ({ key: `s${i + 1}`, start: len.slice(0, i).reduce((a, b) => a + b, 0), end: len.slice(0, i + 1).reduce((a, b) => a + b, 0), description: '', angle: '' as const, styleId: null, characterIds: [], kept: null, insert: ins.includes(i) }));
  };
  check('S. coverage: 6 shots read A, B, C, D, C, A (wide, medium, close, left, close, wide)', board.coverageAngles(mk([8, 8, 8, 8, 8, 8])).join() === 'wide,medium,close,left,close,wide');
  check('S. ... 12 shots read A, B, C, D, C, E, B, C, D, C, E, A', board.coverageAngles(mk(Array(12).fill(8))).join() === 'wide,medium,close,left,close,low,medium,close,left,close,low,wide');
  check('S. ... a shot of 4 seconds or less is a close-up, and no camera comes twice in a row', board.coverageAngles(mk([8, 3, 8, 8, 8])).join() === 'wide,close,left,close,wide', board.coverageAngles(mk([8, 3, 8, 8, 8])).join());
  check('S. ... inserts are skipped: the cycle runs over the shots in the scene, and an insert gets no camera', board.coverageAngles(mk([8, 8, 8, 8, 8, 8], [2])).join() === 'wide,medium,,close,left,wide');
  check('S. ... the person\'s camera is kept; only the rule\'s are filled in', board.applyCoverage(mk([8, 8, 8]).map((x, i) => (i === 1 ? { ...x, angle: 'pov' as const, angleBy: 'person' as const } : x))).map((x) => x.angle).join() === 'wide,pov,wide');
  const kept = mk([8, 8, 8, 8]).map((x, i) => ({ ...x, kept: String(i).repeat(64), insert: i === 2 }));
  check('S. references: shot 1 has no previous shot; shot 2 follows shot 1; an insert sends no scene; shot 4 follows shot 2, not the insert', board.shotReferences(kept, 's1').continuity === null && board.shotReferences(kept, 's2').continuity === 's1' && board.shotReferences(kept, 's3').insert && !board.shotReferences(kept, 's3').scene && board.shotReferences(kept, 's4').continuity === 's2');
  const scene = { setting: 'x', kept: 'a'.repeat(64) };
  const made = { s1: 'a'.repeat(64), s2: 'b'.repeat(64), s3: null, s4: 'b'.repeat(64) };
  check('S. a shot made with an earlier scene is marked; an insert never is; keeping it with this scene clears the mark', board.oldSceneShots(kept, scene, made).join() === '1,3' && board.oldSceneShots(kept.map((x, i) => (i === 1 ? { ...x, sceneConfirmed: scene.kept } : x)), scene, made).join() === '3');
  check('S. ... and publishing waits for it, and for a kept scene', closingLib.publishProblems({ unmatched: [], sentences: 1, shots: kept, keptShots: new Set(kept.map((x) => `${x.key}:${x.kept}`)), closing: { description: 'x', styleId: null, kept: 'c'.repeat(64) }, closingKept: true, standIns: 0, standInsAllowed: true, sceneKept: true, oldScene: [1] }).some((x) => /Shot 2 was made with an earlier scene/.test(x)) && closingLib.publishProblems({ unmatched: [], sentences: 1, shots: kept, keptShots: new Set(kept.map((x) => `${x.key}:${x.kept}`)), closing: { description: 'x', styleId: null, kept: 'c'.repeat(64) }, closingKept: true, standIns: 0, standInsAllowed: true, sceneKept: false }).some((x) => /The scene has no picture kept/.test(x)));
  check('S. P2: the defaults write no words: a new shot\'s description is empty and it starts in the scene; the setting box starts empty', board.shotsFromCuts({ seconds: 20, words: [], sentences: [] } as never, [10]).every((x) => x.description === '' && x.insert === false) && board.emptyScene().setting === '');
  const { settingQuote } = await import('../src/lib/voice/speech');
  const q = settingQuote('ephelion-c13-b64');
  check('S. the book\'s words for where c13-b64 is shown: c13-b63, word for word; none for the invented speeches', q?.block === 'c13-b63' && q.text === 'An image of Lord Ephelion appeared on the left side of the screen, and a multi-paragraph message on the right side.' && settingQuote('doing-fine-v2') === null);
  const page = readFileSync(path.join(ROOT, 'src/components/voice-board.tsx'), 'utf8');
  check('S. the page: the scene first, the Book quote above an empty setting box, the insert switch, "Sent with"', /1\. The scene/.test(page) && /Where the book shows this speech/.test(page) && /Insert: outside the scene/.test(page) && /Sent with:/.test(page));
}

// B2. The storyboard on a phone (Nate, 2026-11-21, after his iPhone test).
{
  const tl = { seconds: 30, words: [], sentences: [{ n: 0, start: 0, end: 9 }, { n: 1, start: 9, end: 17 }, { n: 2, start: 17, end: 30 }] };
  check('B2. the speech\'s sentences in a shot are placed by their middle, by number (the text is the speech\'s)', board.sentencesIn(tl, { start: 0, end: 17 }).join() === '0,1' && board.sentencesIn(tl, { start: 17, end: 30 }).join() === '2');
  {
    // Heard spans that overlap (a sentence heard starting before the last one ended): still placed by where it begins.
    const ov = { seconds: 40, words: [], sentences: [{ n: 0, start: 0, end: 10 }, { n: 1, start: 4, end: 30 }, { n: 2, start: 28, end: 40 }] };
    const sh = board.shotsFromCuts(ov, [10, 30]);
    check('B2. each sentence is in the shot that starts where it begins, even when heard spans overlap', sh.map((x) => board.sentencesIn(ov, x).join('|')).join(',') === '0,1,2', sh.map((x) => board.sentencesIn(ov, x).join('|')).join(','));
    const lens = [3, 6, 7, 8, 2, 9, 11, 5, 4, 6];
    let at0 = 0;
    const tl2 = { seconds: 61, words: [], sentences: lens.map((l, n) => { const x = { n, start: at0, end: at0 + l }; at0 += l; return x; }) };
    const cuts2 = [...board.proposeCuts(tl2), board.sentenceBoundaries(tl2)[1].at];
    const sh2 = board.shotsFromCuts(tl2, cuts2);
    const byList = tl2.sentences.map((_, i) => 1 + board.sentenceBoundaries(tl2).slice(0, i).filter((bb) => board.cutNear(cuts2, bb.at) !== null).length);
    const byShots = tl2.sentences.map((x) => sh2.findIndex((y) => board.sentencesIn(tl2, y).includes(x.n)) + 1);
    check('B2. the sentence list\'s shot numbers agree with the shots built from the cuts', byList.join() === byShots.join(), `${byList.join()} | ${byShots.join()}`);
  }
  check('B2. the sentence spoken at a time', board.sentenceAt(tl, 10) === 1 && board.sentenceAt(tl, 0) === 0 && board.sentenceAt(tl, 29) === 2);
  check('B2. "New shot starts here" sits between each pair of sentences, at the first one\'s end', board.sentenceBoundaries(tl).map((b) => `${b.after}-${b.before}@${b.at}`).join() === '0-1@9,1-2@17');
  check('B2. a cut moved on the strip still counts at its boundary (within a third of a second)', board.cutNear([9.2, 20], 9) === 9.2 && board.cutNear([9.5], 9) === null);
  const why = (o: Partial<Parameters<typeof board.pictureBlocked>[0]>) => board.pictureBlocked({ real: false, standIn: false, description: 'x', angle: 'wide', tries: 0, maxTries: 3, ...o });
  check('B2. why "Make the picture" is off, in one line: real pictures off, no tries left, no description (no camera line: every shot has one)', why({}) === 'Real pictures are off for now.' && /No tries left/.test(why({ standIn: true, tries: 3 }) ?? '') && /No description yet/.test(why({ standIn: true, description: ' ' }) ?? '') && why({ standIn: true }) === null && why({ standIn: true, angle: '' }) === null);
  const page = readFileSync(path.join(ROOT, 'src/components/voice-board.tsx'), 'utf8');
  check('B2. the page: one Style, Ephelion\'s look and Model for every picture; no per-shot style, characters list or model list', /Settings for every picture/.test(page) && /Ephelion&rsquo;s look/.test(page) && !/<ModelRow\b/.test(page) && !/Characters \(published sheets\)/.test(page) && !/name=\{`angle-/.test(page));
  check('B2. ... each shot keeps its own words and a camera dropdown; the cuts are a sentence list with "New shot starts here"', /What the shot shows \(your words\)/.test(page) && /<span className="vb-label">\s*Camera\b/.test(page) && !/Choose a camera/.test(page) && /New shot starts here/.test(page));
  check('B2. the play-through and the shot show the speech\'s own words (never wordsIn, the transcription\'s)', !/wordsIn\(/.test(page) && /sentenceText\(sentenceAt\(t, now\)\)/.test(page));
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
  const logBefore = (await sql`select count(*)::int n from studio.voice_publication_log`)[0].n;
  const orphansBefore = (await sql`select count(*)::int n from studio.voice_publication_log l where not exists (select 1 from studio.voice_publications p where p.id = l.publication_id)`)[0].n;
  const takenDownLog = (await sql`select count(*)::int n from studio.voice_publication_log l join studio.voice_publications p on p.id = l.publication_id where p.draft_id = ${acc.id}`)[0].n;
  r2 = await draftRoute.DELETE(as(NATE, { method: 'DELETE' }), { params: Promise.resolve({ id: acc.id }) });
  const left = storeFiles().filter((f) => f.startsWith(`voice-drafts/${acc.id}/`));
  check('X. removing a taken-down storyboard\'s draft leaves its moderation log in place (Nate, 2026-11-23: removing it can\'t erase a hide)', takenDownLog > 0 && (await sql`select count(*)::int n from studio.voice_publication_log`)[0].n === logBefore && (await sql`select count(*)::int n from studio.voice_publication_log l where not exists (select 1 from studio.voice_publications p where p.id = l.publication_id)`)[0].n === orphansBefore + takenDownLog, `${takenDownLog}`);
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
check('$. each call is counted: 3 conversions, 4 transcriptions (the whole take\'s, made when it is kept, and the reading\'s timing, made when it is made, among them), 1 reading, no failed ones (refusals count nothing; admins: funded admin)', by('convert')[0]?.calls === 3 && by('transcribe')[0]?.calls === 4 && !by('transcribe', 'failed').length && by('reading')[0]?.calls === 1 && rows.every((x) => x.funded === 'admin'), JSON.stringify(rows));
check('$. the holds were all given back', rows.filter((x) => x.kind === 'reserved').every((x) => x.calls === 0 && x.estimated_credits === 0 && Math.abs(x.usd) < 1e-6));
check('$. credits are the stub\'s own (header), estimated beside them', by('convert')[0].credits === 444 + 56 + 23 && by('convert')[0].estimated_credits > 0, JSON.stringify(by('convert')));
check('$. the cost table has no person, request or time of day', !rows.some((x) => 'fid' in x || 'request_id' in x || 'at' in x));
// The per-person limit: 2 whole takes a day (Nate, 2026-11-23; one used now: the refused 'nope' never counted).
const asks = (await sql`select count(*)::int n from studio.voice_asks where fid = ${NATE}`)[0].n;
check('$. one ask counted per whole-take conversion, none for a sentence', asks === 1, String(asks));
await sql`insert into studio.voice_asks (fid) values (${NATE})`;
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(8000)) }));
check('$. a third whole take in a day is refused (429; 2 a day, Nate 2026-11-23)', r.status === 429 && /2 whole takes/.test(String(((await r.json()) as { error: string }).error)));
// Fix 7: "Convert again" passes the once-only rule (here it then meets the day's take limit); without it, the rule refuses first.
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(new Uint8Array(take), { again: '1' }) }));
const againLimit = r.status === 429 && /2 whole takes/.test(String(((await r.json()) as { error: string }).error));
r = await convert.POST(as(NATE, { method: 'POST', body: takeForm(new Uint8Array(take)) }));
check('V. fix 7: with "Convert again" the same recording passes the once-only rule (and meets the day\'s limit here); without it, 409', againLimit && r.status === 409);
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
// Fix 7 (Nate, 2026-11-24: "it let me click convert again. Wasting a conversion"): the same recording converted twice
// is refused, before anything is counted, unless the page sends "Convert again".
{
  const { createHash } = await import('node:crypto');
  const twice = randomBytes(9000);
  const sha = createHash('sha256').update(twice).digest('hex');
  const asksOf = async () => (await sql`select count(*)::int n from studio.voice_asks where fid = ${GARANCE}`)[0].n;
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(twice, { takeSha256: sha }) }));
  check('$. fix 7: a recording converted once is kept as a draft', r.status === 200, String(r.status));
  const before = await asksOf();
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(twice, { takeSha256: sha }) }));
  const j7 = (await r.json()) as { error?: string; reason?: string };
  check('$. fix 7: the same recording again is refused (409), and nothing is counted', r.status === 409 && j7.reason === 'converted' && (await asksOf()) === before, `${r.status} ${JSON.stringify(j7)}`);
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(twice) }));
  check('$. fix 7: ... and refused on the recording itself when the page sends no fingerprint', r.status === 409, String(r.status));
  // (Garance's two takes today: set the day's count back, so the 2-a-day cap doesn't decide the next step)
  await sql`update studio.voice_asks set at = now() - interval '2 days' where fid = ${GARANCE}`;
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(twice, { takeSha256: sha, again: '1' }) }));
  check('$. fix 7: "Convert again" converts it once more', r.status === 200, String(r.status));
  // These test drafts go, so the counts below are as before.
  await sql`update studio.voice_asks set at = now() - interval '2 days' where fid = ${GARANCE}`;
}
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
{
  // Testers (Nate, 2026-11-24): the voice pages as admins have them, on the admins' pool, and nothing else of an admin's.
  const F = await import('../src/lib/voice/flag');
  const C2 = await import('../src/lib/voice/costs');
  const SP = await import('../src/lib/voice/shot-picture');
  const { isAdmin } = await import('../src/lib/admins');
  const testers = [...VOICE.testers];
  check('T. the testers are Luis (6852) and Freymon (665530), neither an admin', testers.join(',') === '6852,665530' && testers.every((f) => !isAdmin(f)));
  check('T. a tester may use the voice pages; someone else may not', testers.every((f) => F.voiceAllowed(f)) && !F.voiceAllowed(4242) && !F.voiceAllowed(null));
  check('T. a tester\'s takes and pictures come from the admins\' pool', testers.every((f) => C2.fundedFor(f) === 'admin' && SP.realPicturesFor(f)) && C2.fundedFor(4242) === 'free' && !SP.realPicturesFor(4242));
  const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
  check('T. ... and nothing else of an admin\'s: only the voice code reads VOICE.testers', execSync("git grep -l 'VOICE.testers\\|isVoiceTester\\|voiceInsider' -- src", { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').sort().join(',') === 'src/lib/voice/costs.ts,src/lib/voice/flag.ts,src/lib/voice/shot-picture.ts' && !/testers/.test(src('src/lib/admins.ts')));
}
check('$. the caps (Nate, 2026-11-23): 2 whole takes a person a day, 6,000 credits a day for everyone\'s takes, its dollars at the plan\'s rate', VOICE.caps.dailyCredits === 6000 && Math.abs(VOICE.caps.dailyUsd - (6000 * 22) / 121000) < 0.02 && VOICE.caps.adminDailyCredits > 0 && VOICE.caps.perPersonConversions === 2 && VOICE.caps.overEstimate === 1.2);
{
  // Ready-made readings don't count against everyone's budget (Nate, 2026-11-23): paid from the admins' pool.
  const C = await import('../src/lib/voice/costs');
  const someone = 4242;
  await sql`insert into studio.voice_costs (kind, model, funded, verdict, calls, credits, estimated_credits, cost_usd) values ('convert', 'x-free-full', 'free', 'ok', 1, ${VOICE.caps.dailyCredits}, ${VOICE.caps.dailyCredits}, 0)`;
  const own = await C.refusal(sql, someone, 100, false);
  const reading = await C.refusal(sql, someone, 100, false, C.READINGS_FUNDED);
  await sql`delete from studio.voice_costs where model = 'x-free-full'`;
  check('$. with everyone\'s budget used up, a take is refused but a reading\'s call is not (it is the admins\' pool)', C.fundedFor(someone) === 'free' && C.READINGS_FUNDED === 'admin' && /allowance/.test(own ?? '') && reading === null, `${own} / ${reading}`);
  const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
  check('$. ... the reading and its timing both charge READINGS_FUNDED, at the gate and at the hold', ['src/app/api/voice/reading/route.ts', 'src/lib/voice/reading-timing.ts'].every((f) => (src(f).match(/READINGS_FUNDED\)/g) ?? []).length === 2));
}

// G. Storyboards on the ready-made reading (Nate, 2026-11-21): timed once, then everyone's own boards on it.
{
  const timingRoute = await route('readings/[id]/timing');
  const publishRoute = await route('publish');
  const rdId = rd.id;
  const boardGet = (fid: number) => boards.GET(as(fid, {}, `http://localhost/api/voice/boards?draft=${rdId}`));
  // No "Time this reading" (Nate, 2026-11-24): the reading was timed when it was made, from the admins' pool.
  let g = await boardGet(NATE);
  check('G. the reading opens straight onto its storyboard: it was timed when it was made, with no button', g.status === 200 && Boolean(((await g.json()) as { draft?: { timeline?: unknown } }).draft?.timeline));
  check('G. timing is for people let in only (401 signed out, 404 to anyone else)', (await timingRoute.POST(as(null, { method: 'POST' }), { params: Promise.resolve({ id: rdId }) })).status === 401 && (await timingRoute.POST(as(STRANGER, { method: 'POST' }), { params: Promise.resolve({ id: rdId }) })).status === 404);
  const sttBefore = stub.calls.filter((c) => c.path === '/v1/speech-to-text').length;
  const readingStt = stub.calls.filter((c) => c.path === '/v1/speech-to-text' && c.files[0]?.sha256 === (rd.recipe as unknown as { audioSha256: string }).audioSha256);
  check('G. one transcription of the reading\'s own audio, when it was made, with the speech\'s names as key terms', readingStt.length === 1 && (readingStt[0].fields.keyterms ?? '').length > 0);
  const [trow] = await sql`select made_by, model, credits, transcript_deleted, timeline from studio.voice_reading_timings where draft_id = ${rdId}`;
  check('G. ... kept once, with who made it, the model and the credits, the transcript deleted at ElevenLabs', Boolean(trow) && trow.model === VOICE.models.transcribe && trow.transcript_deleted === true && (trow.timeline as { sentences: unknown[] }).sentences.length === speech.sentences.length && stub.kept().length === 0);
  g = await timingRoute.POST(as(GARANCE, { method: 'POST' }), { params: Promise.resolve({ id: rdId }) });
  check('G. timing again makes no second call', g.status === 200 && ((await g.json()) as { already?: boolean }).already === true && stub.calls.filter((c) => c.path === '/v1/speech-to-text').length === sttBefore);
  {
    // A reading made before readings were timed when made: timed on its first open, from the admins' pool, no button.
    await sql`delete from studio.voice_reading_timings where draft_id = ${rdId}`;
    const before = stub.calls.filter((c) => c.path === '/v1/speech-to-text').length;
    const first = await boardGet(GARANCE);
    const [again] = await sql`select made_by from studio.voice_reading_timings where draft_id = ${rdId}`;
    check('G. an older reading with no timings is timed on its first open (one transcription), and opens', first.status === 200 && Boolean(again) && stub.calls.filter((c) => c.path === '/v1/speech-to-text').length === before + 1);
  }
  // Two people's boards on the one reading: each their own versions, pictures and tries.
  const gb = (await (await boardGet(GARANCE)).json()) as { draft: { kind: string }; board: { version: number; cuts: number[]; shots: Shot[] } };
  const nb = (await (await boardGet(NATE)).json()) as { board: { version: number; cuts: number[]; shots: Shot[] } };
  check('G. anyone let in can make a board on the reading (it says it is the reading)', gb.draft.kind === 'reading' && gb.board.version === 0 && nb.board.version === 0);
  const saveOn = async (fid: number, shots: Shot[], cuts: number[]) => (await (await boards.POST(as(fid, { method: 'POST', body: JSON.stringify({ draftId: rdId, cuts, shots }) }))).json()) as { version: number; shots: Shot[] };
  const gWords = "(test script's words) Garance's board: the letter on a wall.";
  const gs = await saveOn(GARANCE, gb.board.shots.map((x, i) => (i === 0 ? { ...x, description: gWords, insert: true, angle: '' as const, angleBy: 'person' as const } : x)), gb.board.cuts);
  check('S3. an insert is the person\'s choice, kept on the board; the camera rule skips it', gs.shots[0].insert === true && gs.shots[0].angle === '' && gs.shots.slice(1).every((x) => !x.insert));
  {
    const inScene = await boardPicture.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ draftId: rdId, shotKey: gs.shots[1]?.key, description: gWords, angle: 'medium' }) }));
    check('S3. ... on a board with no scene kept, a shot in the scene is refused (400) but the insert is not', gs.shots.length < 2 || inScene.status === 400);
  }
  const ns = await saveOn(NATE, nb.board.shots, nb.board.cuts.slice(0, 1));
  check('G. each person\'s board is their own: both start at version 1', gs.version === 1 && ns.version === 1);
  const nb2 = (await (await boardGet(NATE)).json()) as { board: { shots: Shot[]; cuts: number[] } };
  check('G. ... and one person never sees another\'s words or cuts', nb2.board.shots.every((x) => x.description !== gWords) && nb2.board.cuts.length === 1);
  const gPic = (await (await boardPicture.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ draftId: rdId, shotKey: gs.shots[0].key, description: gWords, angle: '' }) }))).json()) as { ticket: string; image: string; sha256: string; recipe: { insert: boolean; references: unknown[]; prompt: string; scene?: unknown } };
  check('S3. an insert: no camera needed, no reference picture, no same-scene line, no scene; its recipe says it is an insert', gPic.recipe?.insert === true && gPic.recipe.references.length === 0 && !/The same place, light/.test(gPic.recipe.prompt) && gPic.recipe.scene === undefined);
  r = await boardKeep.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ ticket: gPic.ticket, image: gPic.image }) }));
  check('G. a picture kept on a reading goes under its owner\'s folder', r.status === 200 && existsSync(path.join(STORE, `voice-boards/${rdId}/${GARANCE}/${gs.shots[0].key}-${gPic.sha256}.png`)));
  const pg2 = (fid: number) => boardPicture.GET(as(fid, {}, `http://localhost/api/voice/boards/picture?draft=${rdId}&shot=${gs.shots[0].key}&sha=${gPic.sha256}`));
  check('G. ... and plays for its owner only', (await pg2(GARANCE)).status === 200 && (await pg2(NATE)).status === 404);
  check('G. tries are counted per person', ((await (await boardGet(NATE)).json()) as { making: { tries: Record<string, number> } }).making.tries[gs.shots[0].key] === undefined);
  check('G. the reading\'s audio plays for anyone let in, a performance\'s only for its person', (await draftAudioRoute.GET(as(NATE), { params: Promise.resolve({ id: rdId, n: '0' }) })).status === 200);
  // The card for a board on the reading: no performer; the reading by ElevenLabs.
  const pv = (await (await publishRoute.GET(as(GARANCE, {}, `http://localhost/api/voice/publish?draft=${rdId}&named=no`))).json()) as { credits: { who: string; text: string }[]; problems: string[] };
  const text = pv.credits.map((c) => c.text).join('\n');
  check('G. the card on a reading: a ready-made reading by ElevenLabs, no performer, and who made the storyboard', /ready-made reading by ElevenLabs text-to-speech \(Multilingual v2\) by ElevenLabs \(closed model\)/.test(text) && /No performer/.test(text) && !/Performed by/.test(text) && /Storyboard by/.test(text) && /AI did the reading( and|,) the word timings/.test(text), text);
  check('G. ... and a reading isn\'t held to the performance\'s word-for-word rule (it reads the written words)', !pv.problems.some((x) => /match the speech word for word/.test(x)));
  // Removing: the reading's maker can't while someone else has a board on it; each person removes their own board.
  r = await draftRoute.DELETE(as(GARANCE, { method: 'DELETE' }), { params: Promise.resolve({ id: rdId }) });
  check('G. the reading can\'t be removed while someone else has a board on it, and none of its files is touched', r.status === 404 && (await sql`select count(*)::int n from studio.voice_drafts where id = ${rdId}`)[0].n === 1 && storeFiles().some((f) => f.startsWith(`voice-drafts/${rdId}/`)) && storeFiles().some((f) => f.startsWith(`voice-boards/${rdId}/${GARANCE}/`)));
  // A taken-down publication of Nate's board on the reading, with a moderation log row: removing the board takes the
  // publication and leaves the log (Nate, 2026-11-23).
  const tdPub = randomUUID();
  await pg.query(`insert into studio.voice_publications (id, draft_id, fid, board_version, recipe, files, taken_down_at) values ($1, $2, $3, 1, '{"voice":{},"shots":[],"closing":{}}', $4::jsonb, now())`, [tdPub, rdId, NATE, JSON.stringify([{ key: `storyboards/${tdPub}/a-${'3'.repeat(64)}.mp3`, sha256: '3'.repeat(64) }, { key: `storyboards/${tdPub}/b-${'4'.repeat(64)}.png`, sha256: '4'.repeat(64) }])]);
  await pg.query(`insert into studio.voice_publication_log (publication_id, step, by_fid, role, reason) values ($1, 'reported', 909, 'reader', 'spam'), ($1, 'hidden', 0, 'rule', 'spam')`, [tdPub]);
  r = await boards.DELETE(as(NATE, { method: 'DELETE' }, `http://localhost/api/voice/boards?draft=${rdId}`));
  check('G. a person removes their own board on it, and only theirs', r.status === 200 && (await sql`select count(*)::int n from studio.voice_boards where draft_id = ${rdId} and fid = ${NATE}`)[0].n === 0 && (await sql`select count(*)::int n from studio.voice_boards where draft_id = ${rdId} and fid = ${GARANCE}`)[0].n === 1);
  check('G. ... its taken-down publication goes with the board, and its moderation log stays', (await sql`select count(*)::int n from studio.voice_publications where id = ${tdPub}`)[0].n === 0 && (await sql`select count(*)::int n from studio.voice_publication_log where publication_id = ${tdPub}`)[0].n === 2);
  {
    // Asked in the page, not window.confirm (Nate, 2026-11-23): removing one's own storyboard and removing a draft.
    const rm = readFileSync(path.join(ROOT, 'src/components/voice-remove.tsx'), 'utf8');
    const vb = readFileSync(path.join(ROOT, 'src/components/voice-board.tsx'), 'utf8');
    const vr = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
    check('G. removing a storyboard or a draft asks in the page, "Remove it" or "Keep it", never window.confirm', />\s*Remove it\s*</.test(rm) && />\s*Keep it\s*</.test(rm) && !/window\.confirm/.test(vb + vr) && /<VoiceRemove\s+label="Remove my storyboard"/.test(vb) && (vr.match(/<VoiceRemove /g) ?? []).length === 2);
  }
  r = await boards.DELETE(as(GARANCE, { method: 'DELETE' }, `http://localhost/api/voice/boards?draft=${rdId}`));
  check('G. ... its kept pictures\' files go too', r.status === 200 && storeFiles().every((f) => !f.startsWith(`voice-boards/${rdId}/${GARANCE}/`)));
  r = await draftRoute.DELETE(as(GARANCE, { method: 'DELETE' }), { params: Promise.resolve({ id: rdId }) });
  check('G. with no one else\'s board on it, its maker can remove the reading, timings and all', r.status === 200 && (await sql`select count(*)::int n from studio.voice_reading_timings where draft_id = ${rdId}`)[0].n === 0);
}

// R. Checking the words again on a draft kept without its check (Nate, 2026-11-22, the no-SQL version).
{
  const checkRoute = await route('drafts/[id]/check');
  const post = (fid: number, id: string) => checkRoute.POST(as(fid, { method: 'POST' }), { params: Promise.resolve({ id }) });
  stub.setFailTranscribe(true);
  r = await convert.POST(as(GARANCE, { method: 'POST', body: takeForm(randomBytes(160_000)) }));
  stub.setFailTranscribe(false);
  const w = (await r.json()) as { draftId: string; checks: unknown };
  const [old] = await sql`select recipe from studio.voice_drafts where id = ${w.draftId}`;
  const oldRecipe = old?.recipe as { check: unknown; timeline: unknown; takes: { takeSha256: string; convertedSha256: string }[] } | undefined;
  check('R. a whole take whose transcription failed is kept all the same, with no check and no strip', r.status === 200 && w.checks === null && oldRecipe?.check === null && oldRecipe.timeline === null);
  check('R. ... so it can\'t be storyboarded yet', (await boards.GET(as(GARANCE, {}, `http://localhost/api/voice/boards?draft=${w.draftId}`))).status === 409);
  check('R. checking someone else\'s draft reads as missing (404), even for an admin, and nothing is called', (await post(NATE, w.draftId)).status === 404);
  const sttBefore = stub.calls.filter((c) => c.path === '/v1/speech-to-text').length;
  const tdBefore = stub.deletedTranscripts.length;
  r = await post(GARANCE, w.draftId);
  const j = (await r.json()) as { id: string; replaced: string; oldRemoved: boolean; matched: number; sentences: number; check: string; transcriptDeleted: boolean; error?: string };
  const stt = stub.calls.filter((c) => c.path === '/v1/speech-to-text');
  check('R. "Check the words": one transcription of the draft\'s own converted audio, never the take', r.status === 200 && stt.length === sttBefore + 1 && stt.at(-1)!.files[0].sha256 === oldRecipe!.takes[0].convertedSha256 && stt.at(-1)!.files[0].sha256 !== oldRecipe!.takes[0].takeSha256, `${r.status} ${j.error ?? ''}`);
  check('R. ... its transcript deleted at ElevenLabs right after', j.transcriptDeleted === true && stub.deletedTranscripts.length === tdBefore + 1 && stub.kept().length === 0);
  const [nd] = await sql`select fid, kind, speech_id, preset_id, published_at, recipe from studio.voice_drafts where id = ${j.id}`;
  const nr = nd?.recipe as { check: { sentences: number; matched: number } | null; timeline: { sentences: unknown[] } | null; kept: string; checkedAgain: { from: string }; takes: { takeSha256: string; convertedSha256: string; transcriptDeleted: boolean }[] } | undefined;
  check('R. ... kept again under a new id, with its check, its strip and where it came from', Boolean(nd) && j.id !== w.draftId && Number(nd.fid) === GARANCE && nd.published_at === null && nr!.check?.sentences === speech.sentences.length && (nr!.timeline?.sentences.length ?? 0) > 0 && (nr as unknown as { spoken?: { kind: string; sentences?: unknown[] } }).spoken?.kind !== undefined && ((nr as unknown as { spoken: { kind: string; sentences?: unknown[] } }).spoken.kind === 'word-for-word' ? nr!.timeline?.sentences.length === speech.sentences.length : nr!.timeline?.sentences.length === (nr as unknown as { spoken: { sentences: unknown[] } }).spoken.sentences.length) && nr!.checkedAgain.from === w.draftId && /checked again/.test(nr!.kept) && nr!.takes[0].takeSha256 === oldRecipe!.takes[0].takeSha256 && nr!.takes[0].transcriptDeleted === true);
  const rows = await sql`select storage_key, sha256 from studio.voice_draft_audio where draft_id = ${j.id}`;
  check('R. ... with the same converted audio, copied, byte for byte', rows.length === 1 && rows[0].sha256 === oldRecipe!.takes[0].convertedSha256 && sha(new Uint8Array(readFileSync(path.join(STORE, rows[0].storage_key)))) === rows[0].sha256);
  check('R. the draft without a check is removed, rows and audio', j.oldRemoved && (await sql`select count(*)::int n from studio.voice_drafts where id = ${w.draftId}`)[0].n === 0 && storeFiles().every((f) => !f.startsWith(`voice-drafts/${w.draftId}/`)));
  check('R. the new draft can be storyboarded', (await boards.GET(as(GARANCE, {}, `http://localhost/api/voice/boards?draft=${j.id}`))).status === 200);
  check('R. a signed check record comes back, for a page still holding the take (redone sentences)', typeof j.check === 'string' && j.check.includes('.'));
  check('R. a draft that has its check can\'t be checked again (409), and nothing is called', (await post(GARANCE, j.id)).status === 409 && stub.calls.filter((c) => c.path === '/v1/speech-to-text').length === sttBefore + 1);
  check('R. ... nor a draft id that isn\'t one (404)', (await post(GARANCE, 'nope')).status === 404);
  check('R. the cost is counted as a transcription, measured against its estimate', (await sql`select coalesce(sum(calls),0)::int n from studio.voice_costs where kind = 'transcribe' and verdict = 'ok'`)[0].n >= 1);
}

// GF. The guided storyboard's fixes for the testers (Nate, 2026-11-24), read from the pages' code.
{
  const vg = readFileSync(path.join(ROOT, 'src/components/voice-guide.tsx'), 'utf8');
  const vr = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
  check('GF. fix 3: "Make it" until a picture is made on this page, then "Try again"; the leftover count of tries never decides it', /madeHere \? 'Try again' : 'Make it'/.test(vg) && /const madeHere = \(tries\[key\] \?\? \[\]\)\.length > 0/.test(vg) && !/triesMade\[[^\]]+\] \?\? 0\) \? 'Try again'/.test(vg));
  check('GF. fix 3: while it works, "Making shot 2… about N seconds"; if it fails, it says so where it was asked', /Making \{label\}… \{about\(\)\}/.test(vg) && /role="status">Making/.test(vg) && /failed\?\.key === key && <p className="vr-warn" role="alert">/.test(vg) && /The picture could not be made: /.test(vg) && /makeButton\(shot\.key, `shot \$\{current \+ 1\}`/.test(vg));
  check('GF. fix 4: the guide can be asked at every step (Send waits only for words and a free moment), says what it is for, with examples', /disabled=\{!ask\.trim\(\) \|\| busy !== null\}>/.test(vg) && !/stage === 'scene'\}>/.test(vg) && /'make him lean in'/.test(vg) && /'a close-up on his hands'/.test(vg) && (vg.match(/^    (setting|clothing|plan|shot|fix): 'Tell the guide/gm) ?? []).length === 5 && /className="vg-example"/.test(vg));
  check('GF. fix 5: a conversation: the guide\'s turn is a bubble in the dialogue, with its choices as cards', /<section className="vg-dialogue"[\s\S]*className="vg-msg vg-guide vg-turn"[\s\S]*<\/section>\s*\{\/\* Ask the guide/.test(vg) && (vg.match(/className="vg-choice/g) ?? []).length >= 6 && /'Plan it for me'\)\}>Plan it for me</.test(vg));
  check('GF. fix 5: every text box is still a PublishedTextField (P1f), and no bare textarea', !/<textarea/.test(vg) && (vg.match(/<PublishedTextField/g) ?? []).length >= 3);
  check('GF. fix 1: the guide page leaves out a stale kept shot (another look, or before this scene), and locks the scene and his look on', /staleShots\(shots, scene, look, made\)/.test(vg) && /keptKeys = shots\.filter\(\(s\) => s\.kept && !stale\.includes\(s\.key\)\)/.test(vg) && /locked: true/.test(vg) && /disabled=\{c\.locked/.test(vg));
  check('GF. fix 7: one tap converts once (a guard, not React state), and a converted recording is converted again only when asked', /if \(converting\.current\) return;\s*converting\.current = true;/.test(vr) && /finally \{\s*converting\.current = false;/.test(vr) && /\(keptFromTake \|\| convertedFor === take\.url\) && again !== 'yes'/.test(vr) && /\(!\(keptFromTake \|\| convertedFor === take\.url\) \|\| again === 'yes'\) && \(/.test(vr));
  const { CONVERT_AGAIN } = await import('../src/lib/voice/convert-again');
  check('GF. fix 7: the words, with today\'s take count from the cap', CONVERT_AGAIN.line === `Not happy with it? Convert this recording again: it uses one of today's ${VOICE.caps.perPersonConversions} takes.` && CONVERT_AGAIN.again === 'Convert again' && CONVERT_AGAIN.keep === 'Keep this one');
}

// GU. The guide (Nate, 2026-11-22/23; P2's "Storyboard pictures" ruling): a dialogue on a stand-in guide (no model).
{
  const guideRoute = await route('guide');
  const g = await import('../src/lib/voice/guide');
  const B = await import('../src/lib/voice/board');
  // A performance draft of Nate's with a timeline (the speech's sentences, 3 s each), as a kept take has.
  const per = 3;
  const tlG = { seconds: speech.sentences.length * per, words: speech.sentences.flatMap((x, i) => x.words.map((w, k) => ({ text: w, start: i * per + (k * per) / x.words.length, end: i * per + ((k + 0.8) * per) / x.words.length }))), sentences: speech.sentences.map((x, i) => ({ n: x.n, start: i * per, end: (i + 1) * per - 0.1 })) };
  const [{ id: gd }] = await sql`insert into studio.voice_drafts (fid, kind, speech_id, preset_id, recipe) values (${NATE}, 'performance', ${speech.id}, 'ephelion-light-russian', ${sql.json({ provider: 'ElevenLabs', model: 'eleven_multilingual_sts_v2', takes: [{ role: 'take', takeSha256: 'a'.repeat(64), convertedSha256: 'e'.repeat(64) }], speech: { id: speech.id, title: speech.title, label: speech.label, source: speech.source }, timeline: tlG, check: { sentences: speech.sentences.length, matched: speech.sentences.length, unmatched: [] }, preset: { name: 'Light' } } as never)}) returning id`;
  const gpost = (body: Record<string, unknown>, fid = NATE) => guideRoute.POST(as(fid, { method: 'POST', body: JSON.stringify({ draftId: gd, ...body }) }));
  const gget = async (fid = NATE) => (await guideRoute.GET(as(fid, {}, `http://localhost/api/voice/guide?draft=${gd}`))).json() as Promise<{ messages: { id: string; n: number; role: string; text: string; draft: unknown; model: string | null }[]; model: string }>;
  const bget = async () => (await (await boards.GET(as(NATE, {}, `http://localhost/api/voice/boards?draft=${gd}`))).json()) as { board: { cuts: number[]; shots: Shot[] }; sheets: { styles: { id: string }[]; characters: { id: string; title: string; text: string }[] } };
  const b0 = await bget();
  const lookG = b0.sheets.characters.find((x) => x.title === 'Ephelion')!;
  const styleG = b0.sheets.styles[0].id;
  const lookArg = { id: lookG.id, title: lookG.title, text: lookG.text };
  check('GU. the dialogue starts empty, and names its model (a stand-in on a local copy: no model is called)', (await gget()).messages.length === 0 && /stand-in/.test((await gget()).model));
  check('GU. someone else\'s draft reads as missing (404)', (await gpost({ step: 'setting', text: 'x' }, GARANCE)).status === 404);
  const asked = '(test script\'s words) An empty lecture hall in the Arctic, cold blue morning light, he stands at a lectern.';
  let r = await gpost({ step: 'setting', text: asked, look: lookArg });
  let j = (await r.json()) as { person: { id: string; text: string }; guide: { id: string; draft: { setting: string }; model: string } };
  check('GU. 1. the scene: the person\'s message is kept word for word, and the guide drafts a setting, named with its model', r.status === 200 && j.person.text === asked && typeof j.guide.draft.setting === 'string' && j.guide.draft.setting.length > 0 && /stand-in/.test(j.guide.model));
  const settingMsg = j.guide.id;
  const leak = `(test) ${speech.sentences[2].text}`;
  r = await gpost({ step: 'setting', text: leak });
  const leakJ = (await r.json()) as { error?: string };
  const persons = (await gget()).messages.filter((m) => m.role === 'person').length;
  check('GU. a draft that repeats the speech\'s words is refused (P2: the guide never writes them), and the person\'s message is kept', r.status === 422 && /speech's words/.test(leakJ.error ?? '') && persons === 2, `${r.status} ${leakJ.error} persons ${persons}`);
  const wear = '(test script\'s words) A long grey coat over his usual clothes.';
  r = await gpost({ step: 'clothing', text: wear, look: lookArg });
  j = (await r.json()) as typeof j;
  const clothingMsg = j.guide.id;
  const clothingText = (j.guide.draft as unknown as { clothing: string }).clothing;
  const save = async (shots: Shot[], cuts: number[], scene: Record<string, unknown>) => (await (await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, cuts, shots: shots.map((x) => ({ ...x, styleId: styleG, characterIds: x.insert ? x.characterIds : [lookG.id] })), scene }) }))).json()) as { shots: Shot[]; cuts: number[]; scene: { setting: string; clothing?: string; kept: string | null; settingFrom?: string; clothingFrom?: string } };
  const settingText = ((await gget()).messages.find((m) => m.id === settingMsg)!.draft as { setting: string }).setting;
  let sv = await save(b0.board.shots, b0.board.cuts, { setting: settingText, clothing: clothingText, settingFrom: settingMsg, clothingFrom: clothingMsg });
  check('GU. 2. his clothing becomes part of the scene; the board keeps which guide messages they came from', sv.scene.clothing === clothingText && sv.scene.settingFrom === settingMsg && sv.scene.clothingFrom === clothingMsg);
  // The scene picture, from the guide's drafts.
  r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: 'scene', description: B.sceneWords(sv.scene), styleId: styleG, characterIds: [lookG.id], guide: { messageId: settingMsg, clothingId: clothingMsg } }) }));
  const scP = (await r.json()) as { image: string; ticket: string; sha256: string; recipe: { guided: import('../src/lib/voice/guide').GuideRecipe; prompt: string } };
  check('GU. the scene picture\'s recipe keeps the person\'s request word for word, the guide\'s model and draft, and no edits', r.status === 200 && scP.recipe.guided.request?.text === asked && /stand-in/.test(scP.recipe.guided.guide?.model ?? '') && scP.recipe.guided.prompt.by === 'guide' && scP.recipe.guided.edits.length === 0 && g.guideRecipeProblems(scP.recipe.guided).length === 0, JSON.stringify(scP.recipe.guided).slice(0, 300));
  {
    // Fix 2 (Nate, 2026-11-24): with clothes described, the look goes as the face only (a head crop, recorded with its
    // box and the sheet picture it came from), and the clothes lead the prompt.
    const lr = (scP.recipe as unknown as { references: { role: string; sha256: string; crop?: { kind: string; from: string; box: { width: number; height: number } } }[]; prompt: string }).references.find((x) => x.role === 'anchor-look');
    const pr = (scP.recipe as unknown as { prompt: string }).prompt;
    check('GU. fix 2: the scene sends his look as the face only: a head crop, with its box and the sheet picture it came from', Boolean(lr?.crop) && lr!.crop!.kind === 'head' && /^[0-9a-f]{64}$/.test(lr!.crop!.from) && lr!.crop!.from !== lr!.sha256 && lr!.crop!.box.width > 0 && lr!.crop!.box.height <= lr!.crop!.box.width, JSON.stringify(lr));
    check('GU. fix 2: ... and the clothes come first in the prompt, then the setting, not repeated; the look\'s text is for the face only', pr.startsWith(`Clothes: ${clothingText}\n`) && pr.split(clothingText).length === 2 && /Characters \(the face only; the clothes as above\)/.test(pr), pr.slice(0, 300));
  }
  await boardKeep.POST(as(NATE, { method: 'POST', body: JSON.stringify({ ticket: scP.ticket, image: scP.image }) }));
  sv = await save(sv.shots, sv.cuts, { ...sv.scene, kept: scP.sha256 });
  // 3. The plan, from the speech's numbered sentences.
  r = await gpost({ step: 'plan', text: '(test script\'s words) Plan it: start wide, end wide, a close-up in the middle.', look: lookArg });
  const pj = (await r.json()) as { guide: { draft: { plan: import('../src/lib/voice/board').PlanShot[] } } };
  const planG = pj.guide.draft.plan;
  check('GU. 3. the plan covers every sentence once, in order, by number only (never the words)', r.status === 200 && B.planProblems(tlG as never, planG).length === 0 && !JSON.stringify(planG).includes(speech.sentences[1].text.slice(0, 30)));
  const applied = B.planToBoard(tlG as never, planG, sv.shots);
  sv = await save(applied.shots, applied.cuts, sv.scene);
  check('GU. ... applied: a cut at each group\'s sentence end, the guide\'s cameras kept (angleBy guide)', sv.shots.length === planG.length && sv.shots.every((x, i) => x.angle === planG[i].camera && x.angleBy === 'guide') && sv.cuts.every((c) => tlG.sentences.some((x) => Math.abs(x.end - c) < 0.02)));
  // 4. Shot 1: the guide writes its prompt and picks its references; the person edits the prompt, then makes it.
  const k1 = sv.shots[0].key;
  const ask1 = '(test script\'s words) Seen from the back of the hall, small at the lectern.';
  r = await gpost({ step: 'shot', text: ask1, shotKey: k1, look: lookArg });
  const s1 = (await r.json()) as { guide: { id: string; draft: { prompt: string; references: import('../src/lib/voice/guide').GuideRef[] } } };
  check('GU. 4. shot 1: the guide\'s prompt from the person\'s words, and its references with why (the scene and his look)', r.status === 200 && s1.guide.draft.references.map((x) => x.ref).join() === `scene,${lookG.id}` && s1.guide.draft.references.every((x) => x.why), JSON.stringify(s1.guide?.draft?.references));
  const edited = `${s1.guide.draft.prompt} (edited by the test)`;
  r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: k1, description: edited, angle: sv.shots[0].angle, styleId: styleG, characterIds: [lookG.id], guide: { messageId: s1.guide.id, references: s1.guide.draft.references.map((x) => ({ role: x.role, ref: x.ref })) } }) }));
  const p1G = (await r.json()) as { image: string; ticket: string; sha256: string; recipe: { guided: import('../src/lib/voice/guide').GuideRecipe; references: { role: string }[] } };
  check('GU. ... its recipe: the request word for word, the guide\'s draft, the prompt as sent, the person\'s edit, each reference chosen by the guide with why', r.status === 200 && p1G.recipe.guided.request?.text === ask1 && p1G.recipe.guided.prompt.draft === s1.guide.draft.prompt && p1G.recipe.guided.prompt.text === edited && p1G.recipe.guided.prompt.by === 'person' && p1G.recipe.guided.edits.some((x) => x.what === 'prompt' && x.after === edited) && p1G.recipe.guided.references.every((x) => x.chosenBy === 'guide' && x.why) && g.guideRecipeProblems(p1G.recipe.guided).length === 0, JSON.stringify(p1G.recipe.guided).slice(0, 400));
  await boardKeep.POST(as(NATE, { method: 'POST', body: JSON.stringify({ ticket: p1G.ticket, image: p1G.image }) }));
  sv = await save(sv.shots.map((x, i) => (i === 0 ? { ...x, kept: p1G.sha256, description: edited, guideFrom: s1.guide.id } : x)), sv.cuts, sv.scene);
  // Shot 2: the guide adds shot 1 as continuity; the person drops his look, recorded as an edit of the references.
  const k2 = sv.shots[1].key;
  r = await gpost({ step: 'shot', text: '(test script\'s words) Closer, his hands on the lectern.', shotKey: k2, look: lookArg });
  const s2 = (await r.json()) as typeof s1;
  check('GU. shot 2: the guide adds the last kept shot in the scene as continuity', s2.guide.draft.references.map((x) => x.ref).join() === `scene,${lookG.id},${k1}`);
  const mine = s2.guide.draft.references.filter((x) => x.ref !== lookG.id).map((x) => ({ role: x.role, ref: x.ref }));
  r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: k2, description: s2.guide.draft.prompt, angle: sv.shots[1].angle, styleId: styleG, characterIds: [lookG.id], guide: { messageId: s2.guide.id, references: mine } }) }));
  const p2G = (await r.json()) as typeof p1G;
  check('GU. ... the person\'s change to the references is an edit, the prompt stays the guide\'s, and the site puts his look back (every shot in the scene is made with it; Nate 2026-11-24)', r.status === 200 && p2G.recipe.guided.prompt.by === 'guide' && p2G.recipe.guided.edits.some((x) => x.what === 'references') && p2G.recipe.references.map((x) => x.role).join() === 'anchor-scene,anchor-look,continuity' && p2G.recipe.guided.references.find((x) => x.role === 'anchor-look')?.chosenBy === 'site', JSON.stringify(p2G.recipe?.references));
  // Fix 1 (Nate, 2026-11-24): a shot kept with another look (or before this scene) is not this scene's. Here the board's
  // look changes after shot 1 was kept: shot 2's draft still names the old look and shot 1 as continuity; the picture is
  // made with the new look and the scene only.
  {
    const look2 = b0.sheets.characters.find((c) => c.id !== lookG.id);
    check('GU. fix 1: the test sheets have a second look', Boolean(look2));
    if (look2) {
      const cur = (await bget()).board as unknown as { cuts: number[]; shots: Shot[]; scene: Record<string, unknown> };
      await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, cuts: cur.cuts, shots: cur.shots.map((x) => ({ ...x, styleId: styleG, characterIds: x.insert ? x.characterIds : [look2.id] })), scene: cur.scene }) }));
      r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: k2, description: s2.guide.draft.prompt, angle: sv.shots[1].angle, styleId: styleG, characterIds: [lookG.id], guide: { messageId: s2.guide.id, references: s2.guide.draft.references.map((x) => ({ role: x.role, ref: x.ref })) } }) }));
      const p2b = (await r.json()) as { recipe: { references: { role: string; versionId?: string; shotKey?: string }[]; characters: { versionId: string }[]; guided: import('../src/lib/voice/guide').GuideRecipe } };
      check('GU. fix 1: after the look changes, shot 2 is made with the board\'s look and the kept scene, never the old look or shot 1 kept with it', r.status === 200 && p2b.recipe.references.map((x) => x.role).join() === 'anchor-scene,anchor-look' && p2b.recipe.references[1].versionId === look2.id && p2b.recipe.characters[0]?.versionId === look2.id && !p2b.recipe.references.some((x) => x.shotKey === k1 || x.versionId === lookG.id), JSON.stringify(p2b.recipe?.references));
      // Back to his look, as the rest of the section expects.
      await boards.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, cuts: cur.cuts, shots: cur.shots.map((x) => ({ ...x, styleId: styleG, characterIds: x.insert ? x.characterIds : [lookG.id] })), scene: cur.scene }) }));
    }
    const sh = (key: string, kept: string | null, extra: Partial<Shot> = {}) => ({ key, start: 0, end: 1, description: '', angle: 'wide' as const, styleId: null, characterIds: ['C'], kept, ...extra });
    const shots4 = [sh('s1', 'k1'), sh('s2', 'k2'), sh('s3', 'k3', { insert: true }), sh('s4', 'k4', { sceneConfirmed: 'S' })];
    const made4 = { s1: { scene: '', look: 'B' }, s2: { scene: 'S', look: 'C' }, s3: { scene: '', look: 'B' }, s4: { scene: 'old', look: 'C' } };
    check('GU. fix 1: staleShots: a shot kept before any scene with another look (Nate\'s shot 1) is stale; one made with this scene and look is not; an insert never is; a confirmed one is not', B.staleShots(shots4, { setting: 'x', kept: 'S' }, 'C', made4).join() === 's1' && B.staleShots(shots4, { setting: 'x', kept: 'S' }, 'B', made4).join() === 's1,s2' && B.madeWithOf({ scene: { sha256: 'S' }, characters: [{ versionId: 'C' }] }).look === 'C' && B.madeWithOf({ characters: [] }).scene === '');
  }
  // 5. A fix by asking.
  const fix = '(test script\'s words) Make him lean in.';
  r = await gpost({ step: 'fix', text: fix, shotKey: k2, look: lookArg });
  const f2 = (await r.json()) as typeof s1;
  check('GU. 5. a fix by asking: the guide\'s changed prompt for that shot, the request kept word for word', r.status === 200 && f2.guide.draft.prompt.includes('lean in') && (await gget()).messages.some((m) => m.role === 'person' && m.text === fix));
  // An insert: the guide never sends it the scene or a shot of the scene, and the route refuses them.
  sv = await save(sv.shots.map((x, i) => (i === 2 ? { ...x, insert: true, angle: '' as const, characterIds: [] } : x)), sv.cuts, sv.scene);
  if (sv.shots[2]) {
    r = await gpost({ step: 'shot', text: '(test script\'s words) A family at dinner, the screen behind them.', shotKey: sv.shots[2].key });
    const i3 = (await r.json()) as typeof s1;
    check('GU. an insert: the guide sends no scene and no previous shot', r.status === 200 && !i3.guide.draft.references.some((x) => x.ref === 'scene' || x.role === 'continuity'));
    r = await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: sv.shots[2].key, description: i3.guide.draft.prompt, styleId: styleG, characterIds: [], guide: { messageId: i3.guide.id, references: [{ role: 'anchor-scene', ref: 'scene' }] } }) }));
    check('GU. ... and the route refuses an insert sent with the scene (400)', r.status === 400);
  }
  check('GU. more than 3 references are refused (400)', (await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: k2, description: 'x', angle: 'wide', styleId: styleG, characterIds: [lookG.id], guide: { messageId: s2.guide.id, references: [{ role: 'anchor-scene', ref: 'scene' }, { role: 'anchor-look', ref: lookG.id }, { role: 'continuity', ref: k1 }, { role: 'other', ref: k1 }] } }) }))).status === 400);
  check('GU. a draft of another person\'s dialogue can\'t be claimed (400)', (await boardPicture.POST(as(NATE, { method: 'POST', body: JSON.stringify({ draftId: gd, shotKey: k2, description: 'x', angle: 'wide', guide: { messageId: '00000000-0000-4000-8000-000000000000', references: [] } }) }))).status === 400);
  // P2u's planted faults: a recipe missing the person's request, the guide's model, or the person's edit.
  const good = p1G.recipe.guided;
  const plants: [string, unknown][] = [
    ['the request removed', { ...good, request: null }],
    ["the guide's model removed", { ...good, guide: { ...good.guide!, model: '' } }],
    ['the edit dropped', { ...good, edits: [] }],
    ["a reference's reason removed", { ...good, references: good.references.map((x) => ({ ...x, why: '' })) }],
  ];
  check('GU. P2u: the real recipes pass', g.guideRecipeProblems(good).length === 0 && g.guideRecipeProblems(p2G.recipe.guided).length === 0);
  check(`GU. P2u: all ${plants.length} planted faults are caught (a missing request first)`, plants.every(([, x]) => g.guideRecipeProblems(x as never).length > 0), plants.filter(([, x]) => !g.guideRecipeProblems(x as never).length).map(([n]) => n).join());
  // Removing the board removes its dialogue (0049_storyboard_guide.sql's delete_voice_board).
  r = await boards.DELETE(as(NATE, { method: 'DELETE' }, `http://localhost/api/voice/boards?draft=${gd}`));
  check('GU. removing the storyboard removes its dialogue', r.status === 200 && (await gget()).messages.length === 0);
}

// M. The allowlist.
const models = JSON.parse(readFileSync(path.join(ROOT, 'config/models.json'), 'utf8')).models as { id: string; maker?: string; open_weights: boolean; keeps?: string; hosted?: { endpoints: Record<string, null> } }[];
for (const id of Object.values(VOICE.models)) {
  const m = models.find((x) => x.hosted?.endpoints && id in x.hosted.endpoints);
  check(`M. ${id} is on the allowlist: closed, by ElevenLabs, with what it keeps`, Boolean(m) && m!.open_weights === false && m!.maker === 'ElevenLabs' && (m!.keeps?.length ?? 0) > 50);
}

// H. The recording page never blocks Record on a host check (Nate, 2026-11-21).
{
  const page = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
  const code = page.replace(/\/\/.*$/gm, '');
  check('H. every host call on the recording page is raced (withTimeout): inMiniApp, context, capabilities, the app\'s prompt', /withTimeout\(inMiniApp\(\), HOST_CHECK_MS\)/.test(code) && /withTimeout\(sdk\.context, HOST_CHECK_MS\)/.test(code) && /withTimeout\(\(\) => sdk\.getCapabilities\(\), HOST_CHECK_MS\)/.test(code) && /withTimeout\(\(\) => sdk\.actions\.requestCameraAndMicrophoneAccess\(\), HOST_PROMPT_MS\)/.test(code));
  check('H. ... and none is awaited bare', !/await\s+(inMiniApp\(\)|sdk\.(context|getCapabilities|actions))/.test(code));
  check('H. an unknown host is "maybe the app", and a refusal shows the browser\'s own line (mic-help)', /inApp\.current !== false/.test(code) && /MIC_HELP\[micPlace\(navigator\.userAgent, inApp\.current === true\)\]/.test(code));
  check('H. Record\'s button waits on no host check', !/disabled=\{[^}]*(inApp|webClient|caps)/.test(page));
}

// IM. Improvising, and timing without a button (Nate, 2026-11-24).
{
  const SP = await import('../src/lib/voice/spoken');
  const G = await import('../src/lib/voice/guide');
  const CL = await import('../src/lib/voice/closing');
  const fine = speeches().find((x) => x.id === 'doing-fine-v2')!;
  // The cap: 2 minutes a take (the book speech 3, for Nate to decide), refused by the server, with a second's grace.
  check('IM. a take is at most 2 minutes (the book speech 3 minutes, flagged for Nate)', VOICE.takeMaxSeconds === 120 && SP.takeMaxSeconds('doing-fine-v2') === 120 && SP.takeMaxSeconds('ephelion-c13-b64') === 180);
  const callsBefore = stub.calls.length;
  let rr = await convert.POST(as(NATE, { method: 'POST', body: takeForm(randomBytes(8000), { speechId: 'doing-fine-v2', seconds: '125' }) }));
  check('IM. ... a longer whole take is refused by the server (413), before any call to ElevenLabs', rr.status === 413 && /at most 2 minutes/.test(String(((await rr.json()) as { error: string }).error)) && stub.calls.length === callsBefore);
  const rec = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
  check('IM. ... and the page counts down on Stop and stops the recording at its limit', /rec\.start\(s!\.speech\.maxSeconds/.test(rec) && /IMPROV_WORDING\.left\(mmss\(Math\.max\(0, \(s\.speech\.maxSeconds/.test(rec) && /if \(t >= limitSeconds && r\.state === 'recording'\) r\.stop\(\)/.test(rec));
  {
    // Nate's review of #236 (2026-11-24): the bitrate, a too-large take said before it's sent, and a new take never "again".
    const vr = (readFileSync(path.join(ROOT, 'src/components/voice-record.tsx'), 'utf8') + readFileSync(path.join(ROOT, 'src/components/voice-recorder-core.tsx'), 'utf8'));
    const rw = vr.slice(vr.indexOf('async function recordWhole'), vr.indexOf('async function recordWhole') + 400);
    const cw = vr.slice(vr.indexOf('async function convertWhole'), vr.indexOf('async function convertWhole') + 900);
    check('IM. the recorder runs at 128 kb/s, so a 3:00 take is about 2.9 MB, under the 4 MB limit', /TAKE_BITS_PER_SECOND = 128_000/.test(vr) && /new MediaRecorder\(s, \{ \.\.\.\(type \? \{ mimeType: type \} : \{\}\), audioBitsPerSecond: TAKE_BITS_PER_SECOND \}\)/.test(vr) && (180 * 128_000) / 8 < VOICE.maxTakeBytes);
    check('IM. ... a take over the size limit is refused on the page, with its line, before anything is sent', cw.indexOf('blob.size > s!.limits.maxTakeBytes') > 0 && cw.indexOf('blob.size > s!.limits.maxTakeBytes') < cw.indexOf('await convert(') && /This recording is \$\{\(Math\.ceil\(bytes \/ 100_000\) \/ 10\)\.toFixed\(1\)\} MB, over the/.test(vr) && (Math.ceil(4_040_000 / 100_000) / 10).toFixed(1) === '4.1');
    check('IM. ... and a new take resets "Convert again", so a fresh take never goes out with again=1', /setAgain\('ask'\)/.test(rw));
  }
  // The transcript's sentences.
  const w = (t: string, a: number, b: number) => ({ text: t, start: a, end: b });
  const ts = SP.transcriptSentences([w('I', 0, 0.2), w('am', 0.3, 0.5), w('fine.', 0.6, 0.9), w('Really', 1, 1.2), w('truly', 1.3, 1.5), w('so', 2.6, 2.8)]);
  check('IM. a transcript splits into sentences at . ! ? and at a pause', ts.length === 3 && ts[0].text === 'I am fine.' && ts[1].text === 'Really truly' && ts[2].text === 'so', JSON.stringify(ts));
  // A kept take that isn't word for word: improvised, its strip the transcript's sentences.
  const [imp] = await sql`select id, recipe from studio.voice_drafts where fid = ${NATE} and kind = 'performance' and recipe->'spoken'->>'kind' = 'improvised' order by made_at desc limit 1`;
  const ir = imp?.recipe as { spoken: { kind: string; sentences: { n: number; text: string }[]; on: { title: string; version: number } }; timeline: { sentences: { n: number }[] } } | undefined;
  check('IM. a take that isn\'t word for word is kept as improvised: its words are the transcript, its strip the transcript\'s sentences', Boolean(ir) && ir!.spoken.sentences.length === ir!.timeline.sentences.length && ir!.spoken.sentences.every((x, i) => x.n === ir!.timeline.sentences[i].n && x.text.length > 0));
  // Labels and credits, both ways (Nate's words).
  const impRecipe = { spoken: SP.spokenFor(fine, false, [{ n: 0, text: 'My own words.' }], 'scribe_v3') };
  check('IM. the label: "word for word", or "improvised on \'Doing fine\' (version 2)"', SP.takeLabel({ spoken: { kind: 'word-for-word' } }) === 'word for word' && SP.takeLabel({}) === 'word for word' && SP.takeLabel(impRecipe) === "improvised on 'Doing fine' (version 2)");
  const credit = SP.improvisedCredit('naaate', { title: fine.title, credit: fine.credit, block: null });
  check('IM. the improvised credit: "Words by @name, improvising on \'Doing fine\' · [the speech\'s credit]"', credit === `Words by @naaate, improvising on 'Doing fine' · ${fine.credit}`, credit);
  const base = { speech: { title: fine.title, block: null, invented: { version: 2, credit: fine.credit } }, performer: 'naaate', preset: 'Warm lecturer', voiceModel: { name: 'v', maker: 'ElevenLabs' }, transcribeModel: { name: 't', maker: 'ElevenLabs' }, pictures: [], shots: 3 };
  const ww = CL.closingCredits(base);
  const im = CL.closingCredits({ ...base, improvised: credit });
  check('IM. ... word for word keeps today\'s credit; improvised leads with the performer\'s words and says "transcribed", not "checked word for word"', /^Speech: “Doing fine” \(version 2\)\. Invented, not from the book\./.test(ww[0].text) && im[0].text === `${credit}.` && im[0].who === 'people' && im.some((l) => /transcribed by/.test(l.text)) && !im.some((l) => /checked word for word/.test(l.text)));
  // Correcting one's own words: kept with its history, never by a model; only an improvised take, only before storyboarding.
  if (imp) {
    const words = await route('drafts/[id]/words');
    const [hasBoard] = await sql`select 1 from studio.voice_boards where draft_id = ${imp.id} limit 1`;
    let target = imp.id as string;
    let tr = ir!;
    if (hasBoard) {
      const bad = await words.POST(as(NATE, { method: 'POST', body: JSON.stringify({ sentences: ir!.spoken.sentences.map((x) => x.text) }) }), { params: Promise.resolve({ id: imp.id }) });
      check('IM. a take with a saved storyboard can\'t be corrected (409)', bad.status === 409);
      const [other] = await sql`select d.id, d.recipe from studio.voice_drafts d where d.fid = ${NATE} and d.kind = 'performance' and d.recipe->'spoken'->>'kind' = 'improvised' and not exists (select 1 from studio.voice_boards b where b.draft_id = d.id) order by made_at desc limit 1`;
      target = other?.id ?? '';
      tr = other?.recipe as typeof tr;
    }
    if (target) {
      const before = stub.calls.length;
      const texts = tr.spoken.sentences.map((x) => x.text);
      texts[0] = `${texts[0]} (as I meant it)`;
      const ok = await words.POST(as(NATE, { method: 'POST', body: JSON.stringify({ sentences: texts }) }), { params: Promise.resolve({ id: target }) });
      const oj = (await ok.json()) as { id?: string; replaced?: string; oldRemoved?: boolean };
      const [nd] = await sql`select recipe from studio.voice_drafts where id = ${oj.id ?? '00000000-0000-4000-8000-000000000000'}`;
      const ns = (nd?.recipe as { spoken?: { sentences: { text: string }[]; corrections: { byFid: number; sentences: { text: string }[] }[] } } | undefined)?.spoken;
      check('IM. the performer corrects their words: kept under a new id, with the correction (the words before, by whom) in its history, the old draft removed', ok.status === 200 && oj.replaced === target && oj.oldRemoved === true && ns?.sentences[0].text === texts[0] && ns?.corrections.length === 1 && ns.corrections[0].byFid === NATE && ns.corrections[0].sentences[0].text === tr.spoken.sentences[0].text);
      check('IM. ... and no model or service is called to make it', stub.calls.length === before);
      const empty = await words.POST(as(NATE, { method: 'POST', body: JSON.stringify({ sentences: texts.map(() => ' ') }) }), { params: Promise.resolve({ id: oj.id! }) });
      const other = await words.POST(as(GARANCE, { method: 'POST', body: JSON.stringify({ sentences: texts }) }), { params: Promise.resolve({ id: oj.id! }) });
      check('IM. ... an empty sentence is refused (400), and someone else\'s draft reads as missing (404)', empty.status === 400 && other.status === 404);
    } else check('IM. an improvised draft with no storyboard to correct', false, 'none found');
  } else check('IM. an improvised draft was kept in this run', false, 'none found');
  const [wfw] = await sql`select id from studio.voice_drafts where kind = 'performance' and (recipe->'spoken'->>'kind' = 'word-for-word') limit 1`;
  if (wfw) {
    const words = await route('drafts/[id]/words');
    const [owner] = await sql`select fid from studio.voice_drafts where id = ${wfw.id}`;
    const no = await words.POST(as(Number(owner.fid), { method: 'POST', body: JSON.stringify({ sentences: ['x'] }) }), { params: Promise.resolve({ id: wfw.id }) });
    check('IM. a word-for-word take has no words of its own to correct (409)', no.status === 409);
  }
  check('IM. corrected words that are the speech\'s, word for word, label the take word for word', SP.matchesSpeech(fine.sentences.map((x) => ({ n: x.n, text: x.text.toUpperCase() })), fine) && !SP.matchesSpeech([{ n: 0, text: 'My own words.' }], fine) && SP.takeLabel({ spoken: { ...(impRecipe.spoken as object), wordForWord: true } as never }) === 'word for word');
  // The guide: the performer's words are the board's sentences, and it writes neither theirs nor the speech's.
  const perf = [{ n: 0, text: 'The river runs cold under the old stone bridge tonight' }];
  const ctx = { timeline: { seconds: 10, words: [], sentences: [{ n: 0, start: 0, end: 10 }] }, sentences: perf, otherWords: fine.sentences.map((x) => ({ n: x.n, text: x.text })), shots: [], refs: { scene: false, looks: [], keptShots: [] }, maxShots: 12 };
  const mine = G.readGuideReply('setting', JSON.stringify({ say: 'Here.', draft: { setting: 'A room where the river runs cold under the old stone bridge' } }), ctx as never);
  const sixOfSpeech = fine.sentences.flatMap((x) => x.text.split(/\s+/)).slice(0, 8).join(' ');
  const theirs = G.readGuideReply('setting', JSON.stringify({ say: 'Here.', draft: { setting: `A room. ${sixOfSpeech}` } }), ctx as never);
  check('IM. the guide may write neither the performer\'s words nor the speech\'s into a draft', 'error' in mine && 'error' in theirs, JSON.stringify([mine, theirs]));
  const gs = readFileSync(path.join(ROOT, 'src/lib/voice/guide-server.ts'), 'utf8');
  check('IM. ... and receives the spoken sentences (the performer\'s, for an improvised take)', /sentences: spokenSentences\(draft\.recipe/.test(gs) && /otherWords: isImprovised\(/.test(gs));
  // Publishing and the published page.
  const pb = readFileSync(path.join(ROOT, 'src/lib/voice/publish.ts'), 'utf8');
  const spokenPage = readFileSync(path.join(ROOT, 'src/app/storyboard/spoken/[id]/page.tsx'), 'utf8');
  check('IM. an improvised take isn\'t held to the speech\'s words to publish; its words and label are in the published recipe, and shown', /unmatched: reading \|\| isImprovised\(r\) \? \[\]/.test(pb) && /spoken: p\.recipe\.spoken \?\? \{ kind: 'word-for-word' \}/.test(pb) && /const own = spokenSentences\(/.test(spokenPage));
  // No "Time this reading": timed when made, and on first open, from the admins' pool.
  const vb = readFileSync(path.join(ROOT, 'src/components/voice-board.tsx'), 'utf8');
  const rd = readFileSync(path.join(ROOT, 'src/app/api/voice/reading/route.ts'), 'utf8');
  const bd = readFileSync(path.join(ROOT, 'src/app/api/voice/boards/route.ts'), 'utf8');
  check('IM. "Time this reading" is gone: a reading is timed when made, and an older one on its first open', !/Time this reading|needs-timing/.test(vb + bd) && /await timeReadingNow\(sql, who\.fid, id\)/.test(rd) && /timeReadingNow\(sql, who\.fid, draft\.id\)/.test(bd));
}

check('T. every transcript made in this run was deleted at ElevenLabs (none left)', stub.kept().length === 0 && stub.deletedTranscripts.length >= 2, `kept ${stub.kept().length}`);
// P. P1h.
const proof = await voiceProof(ROOT);
check('P. P1h: the real take flow and convert route keep no recording', proof.real.length === 0, proof.real.join('; '));
check(`P. P1h: all ${VOICE_PLANTS.length + VOICE_ROUTE_PLANTS.length} planted violations are caught (the route's too)`, proof.missed.length === 0, proof.missed.join('; '));

rmSync(STORE, { recursive: true, force: true });
await sql.end();
await stub.close();
await pgServer.stop();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
