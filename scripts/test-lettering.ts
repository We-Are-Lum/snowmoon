/**
 * Lettering, part C (owner's decisions of 2026-11-18 to 2026-11-22; branch lettering). One check per point:
 *  Q. the parser and the cap: double quotation marks only, straight or curly; 3 phrases, 8 words, 48 characters;
 *  B. book or own: an exact, case-sensitive whole-word match at a block (with the block), else own (with by_fid);
 *  G. the prompt check's policy: image-guard.md byte-identical to main's; the lettering variant differs only in the words
 *     line and the "Allowed lettering" line; the open model's check sends image-guard.md, a lettered one the variant;
 *  S. the prompt: the lettering line in place of the no-text line, never both; none quoted, the prompt as before;
 *  F. pad, not crop: a lettered closed picture is padded to 16:9 (the whole picture, its own corner colour), and the
 *     read-back reads the file as published;
 *  R. the read-back: its own maker reads it, blind; rule v1; a match makes the record, a mismatch or no answer keeps
 *     nothing and says what was read; its cost counts against the right cap (the challenge's closed cap, the admins' $20),
 *     and the reservation includes it;
 *  T. try again only: no ticket, no picture and no draft for a mismatch; the screen's mismatch has one button, Try again;
 *  O. the open model with quoted words is refused before anything is spent, naming the closed models offered (or only
 *     the line when none is);
 *  P. P8j: the record passes on a well-made picture, and each planted fault fails;
 *  C. a chapter picture's lettering redo, the three lettered edition pictures included.
 *
 *   npm run test:lettering
 *
 * In-memory Postgres (PGlite, every migration and 0047_challenge_lettering.sql), as studio_writer. No network, no model,
 * no bucket: the prompt check's model, the picture model and the reader are stand-ins (fetch is replaced; nothing leaves).
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};

// Nothing leaves this machine: every fetch is answered here, and recorded.
const realFetch = globalThis.fetch;
const sent: { url: string; body: string }[] = [];
let guardAnswer = '{"allow": true}';
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) return realFetch(input, init);
  sent.push({ url, body: String(init?.body ?? '') });
  const { CHAT } = await import('../src/lib/config');
  if (url === CHAT.endpoint) return new Response(JSON.stringify({ id: 'guard-stand-in', choices: [{ message: { content: guardAnswer, provider_metadata: { gateway: { routing: { finalProvider: CHAT.provider } } } }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 40 } }), { status: 200 });
  return new Response('test: outbound blocked', { status: 400 });
}) as typeof fetch;

const L = await import('../src/lib/images/lettering');
const { parseQuotes, phraseSource, compareRead, letteringLine, closingLine, fillPolicy, LETTERING_CAP, LETTERING_WORDING: W, READERS, readerFor, readWorstUsd, p8jProblems, bodyItems, READ_TEXT_INSTRUCTION } = L;
const { bookBlocks, letteringPolicy, readBack, readRequest, sourcesOf, letteringReady } = await import('../src/lib/images/readback');
const { IMAGES, CHAPTER_PICTURES } = await import('../src/lib/config');
const { remixPrompt, letteringWords } = await import('../src/lib/challenge/make');
const { challengeModel, modelRow, reserveUsd } = await import('../src/lib/challenge/models');
const { challengeSpend, readReserveUsd } = await import('../src/lib/challenge/make-model');
const { makeChallengeClosed, fitted } = await import('../src/lib/images/closed');
const { promptFile } = await import('../src/lib/chat/model');
const { guardWorstWithRetryUsd } = await import('../src/lib/images/guard');

// ---------------------------------------------------------------------------------------------------------------------
// Q. The parser and the cap.
// ---------------------------------------------------------------------------------------------------------------------
const phrases = (s: string) => {
  const p = parseQuotes(s);
  return p.ok ? p.phrases : p.error;
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
check('Q. straight quotes', eq(phrases('a sign "Night Market" here'), ['Night Market']));
check('Q. curly quotes', eq(phrases('a banner “Embrace the competition”'), ['Embrace the competition']));
check('Q. mixed straight and curly (autocorrect)', eq(phrases('a sign “Snow tonight"'), ['Snow tonight']));
check('Q. an apostrophe stays inside the words', eq(phrases('a mug "we don’t stop" and Zei\'s coat'), ['we don’t stop']));
check('Q. single quotes are not lettering', eq(phrases("a 'quiet' street"), []));
check('Q. no quotation marks, nothing to draw', eq(phrases('Zei in a red coat'), []));
check('Q. two phrases', eq(phrases('“the Path of Strength” and “Embrace the competition”'), ['the Path of Strength', 'Embrace the competition']));
check('Q. an unclosed quote is refused', phrases('a sign "OPEN') === W.notClosed);
check('Q. a closing quote never opened is refused', phrases('a sign OPEN” here') === W.notOpened);
check('Q. empty quotes are refused', phrases('a sign ""') === W.empty);
check('Q. 8 words pass', Array.isArray(phrases('"the first step is always the hardest one"')));
check('Q. 9 words are refused', phrases('"the first step is always the very hardest one"') === W.overCap);
check('Q. 48 characters pass', Array.isArray(phrases(`"${'A'.repeat(48)}"`)));
check('Q. 49 characters are refused', phrases(`"${'A'.repeat(24)} ${'B'.repeat(24)}"`) === W.overCap);
check('Q. 3 phrases pass', Array.isArray(phrases('"a" "b" "c"')));
check('Q. 4 phrases are refused', phrases('"a" "b" "c" "d"') === W.overCap);
check('Q. emoji are refused', phrases('"hi 🙂"') === W.characters);
check('Q. a newline inside the quotes is one space', eq(phrases('"Snow\n tonight"'), ['Snow tonight']));
check('Q. the cap is 3 phrases, 8 words, 48 characters', eq(LETTERING_CAP, { phrases: 3, words: 8, chars: 48 }));

// ---------------------------------------------------------------------------------------------------------------------
// B. Book or own.
// ---------------------------------------------------------------------------------------------------------------------
const blocks = bookBlocks();
check('B. the whole book is read (32 chapters)', new Set(blocks.map(([id]) => id.split('-')[0])).size === 32);
check('B. "Embrace the competition" is the book\'s, c13-b64', eq(phraseSource('Embrace the competition', blocks, 6786), { text: 'Embrace the competition', source: 'book', block: 'c13-b64', also_in: 0 }), JSON.stringify(phraseSource('Embrace the competition', blocks, 6786)));
check('B. "the Path of Strength" is the book\'s, c13-b64', (phraseSource('the Path of Strength', blocks, 6786) as { block?: string }).block === 'c13-b64');
check('B. "The Path of Strength" (capital T) is own', phraseSource('The Path of Strength', blocks, 6786).source === 'own');
check('B. "Night Market" is own, with by_fid', eq(phraseSource('Night Market', blocks, 6786), { text: 'Night Market', source: 'own', by_fid: 6786 }));
check('B. part of a word is not a match ("mbrace the competition")', phraseSource('mbrace the competition', blocks, 1).source === 'own');
check('B. sourcesOf keeps the order asked', eq(sourcesOf(['Night Market', 'Embrace the competition'], 9).map((p) => p.source), ['own', 'book']));
const dog = phraseSource('DOG', blocks, 1);
check('B. "DOG" (the chapter 30 signs) is recorded with where the book has it, or as own', dog.source === 'own' || /^c\d+-b\d+$/.test((dog as { block: string }).block));

// ---------------------------------------------------------------------------------------------------------------------
// G. The prompt check's policy.
// ---------------------------------------------------------------------------------------------------------------------
const base = read('config/prompts/image-guard.md');
const mainBase = execFileSync('git', ['show', 'origin/main:config/prompts/image-guard.md'], { cwd: ROOT, encoding: 'utf8' });
check('G. image-guard.md (the open model\'s policy) is byte-identical to main\'s', base === mainBase, createHash('sha256').update(base).digest('hex'));
const variant = promptFile('image-guard-lettering.md');
const baseBody = promptFile('image-guard.md');
const WORDS = '- **words**: asking for words, letters, captions, signs or speech bubbles in the image.';
const vLines = variant.split('\n'), bLines = baseBody.split('\n');
const onlyInVariant = vLines.filter((l) => !bLines.includes(l)).filter(Boolean);
const onlyInBase = bLines.filter((l) => !vLines.includes(l)).filter(Boolean);
check('G. the variant drops only the base\'s words line', eq(onlyInBase, [WORDS]), JSON.stringify(onlyInBase));
check('G. the variant adds only its words line and the "Allowed lettering" line', onlyInVariant.length === 2 && onlyInVariant[0].startsWith('- **words**: ') && onlyInVariant[1].startsWith('Allowed lettering (set by the site'), JSON.stringify(onlyInVariant));
check('G. every other category line is the base\'s, in the base\'s order', eq(bLines.filter((l) => l.startsWith('- **') && l !== WORDS), vLines.filter((l) => l.startsWith('- **') && !l.startsWith('- **words**'))));
check('G. the variant\'s words line still judges the quoted words by every other rule', /judge each of them by every other category/.test(onlyInVariant[0]) && /Any other words, letters or lettering asked for are not allowed/.test(onlyInVariant[0]));
const filled = letteringPolicy(['Night Market', 'Embrace the competition']);
check('G. the site puts the parsed phrases in, before the answer line', filled.includes('"Night Market"; "Embrace the competition"') && filled.indexOf('Night Market') < filled.indexOf('Answer with exactly one line of JSON'));
let threw = false;
try {
  fillPolicy(variant, ['a "quoted" injection']);
} catch {
  threw = true;
}
check('G. a phrase the parser wouldn\'t pass can\'t go into the policy', threw);

// ---------------------------------------------------------------------------------------------------------------------
// S. The prompt.
// ---------------------------------------------------------------------------------------------------------------------
const plain = remixPrompt({ words: 'Zei in a red coat', name: 'Zei', style: 'Comic book.' });
const lettered = remixPrompt({ words: 'Zei under a sign that says "Night Market"', name: 'Zei', style: 'Comic book.', closing: closingLine(['Night Market'], IMAGES.suffix) });
check('S. no quoted words: the prompt ends with the no-text line, as before', plain.endsWith(IMAGES.suffix) && !plain.includes('Draw exactly'));
check('S. quoted words: the prompt ends with the lettering line', lettered.endsWith(letteringLine(['Night Market'])));
check('S. ... and never carries the no-text line', !lettered.includes(IMAGES.suffix));
check('S. the lettering line names each phrase, and no other lettering', letteringLine(['A b', 'C']).includes('"A b" and "C"') && /no other lettering/.test(letteringLine(['x'])));
check('S. closingLine with no phrases is the suffix itself', closingLine([], IMAGES.suffix) === IMAGES.suffix);

// ---------------------------------------------------------------------------------------------------------------------
// F. Pad, not crop.
// ---------------------------------------------------------------------------------------------------------------------
const GPT = challengeModel('gpt-image-2.5-sunburst', { country: 'US', region: null })!;
const GEM = challengeModel('gemini-3.1-flash-image', { country: 'US', region: null })!;
// A stand-in 1536 x 1024 picture: a coloured corner, a white band at the bottom with "words" in the bottom 120 rows.
const png = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: { r: 30, g: 60, b: 90 } } })
  .composite([{ input: await sharp({ create: { width: 1536, height: 120, channels: 3, background: { r: 250, g: 250, b: 250 } } }).png().toBuffer(), top: 904, left: 0 }])
  .png()
  .toBuffer();
const mockSend = (async (url: string, init: RequestInit) => {
  sent.push({ url, body: String(init.body) });
  return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }], providerMetadata: { gateway: { cost: '0.0467', generationId: 'gen_mock' } } }), { status: 200 });
}) as unknown as typeof fetch;
const ref = await sharp({ create: { width: 1024, height: 576, channels: 3, background: { r: 200, g: 10, b: 10 } } }).jpeg().toBuffer();
const oidc = new Request('http://localhost/api/challenge/make', { method: 'POST', headers: { 'x-vercel-oidc-token': 'stand-in-not-a-key', 'x-vercel-ip-country': 'US' } });
const padded = await makeChallengeClosed(GPT, lettered, ref, oidc, 0.08, mockSend, 'pad');
const cropped = await makeChallengeClosed(GPT, plain, ref, oidc, 0.08, mockSend);
const pm = await sharp(padded.bytes).metadata();
const conv = padded.settings.converted as Record<string, unknown>;
check('F. a lettered picture is the site\'s size (1024 x 576)', pm.width === IMAGES.size.width && pm.height === IMAGES.size.height);
check('F. ... padded, never cropped (the recipe says so)', typeof conv.padded === 'string' && !('cropped' in conv) && !('crop' in conv), JSON.stringify(conv));
// The bottom band is kept whole: the padded picture's lowest rows of the picture area are the white band.
const { data: raw, info } = await sharp(padded.bytes).raw().toBuffer({ resolveWithObject: true });
const px = (x: number, y: number) => raw.slice((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3);
const mid = Math.floor(info.width / 2);
check('F. the words\' rows at the bottom survive (no crop)', px(mid, 570)[0] > 200, String([...px(mid, 570)]));
check('F. the sides are padded with the picture\'s own corner colour', Math.abs(px(5, 288)[0] - 30) < 12 && Math.abs(px(5, 288)[2] - 90) < 12, String([...px(5, 288)]));
check('F. a picture without words is cropped as before', typeof (cropped.settings.converted as Record<string, unknown>).crop === 'string');
const fp = await fitted(png, 'pad');
check('F. fitted(pad) is the existing pad path (toView, contain)', /contain/.test(String(fp.converted.fit)));

// ---------------------------------------------------------------------------------------------------------------------
// R. The read-back (stand-in readers), and its costs.
// ---------------------------------------------------------------------------------------------------------------------
check('R. GPT Image\'s pictures are read by OpenAI (GPT-6.1 Sol), Gemini\'s by Google (Gemini 3.8 Flash on Vertex)', readerFor('OpenAI')?.id === 'openai/gpt-6.1-sol' && readerFor('Google')?.id === 'google/gemini-3.8-flash' && readerFor('Google')?.provider === 'vertex');
const rq = readRequest(READERS.OpenAI, { bytes: padded.bytes, contentType: 'image/jpeg' });
const rqText = JSON.stringify(rq.body).replace(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/, 'data:…');
check('R. the read is blind: the instruction and the picture only, never the words asked for', !rqText.includes('Night Market') && rqText.includes(JSON.stringify(READ_TEXT_INSTRUCTION).slice(1, 60)));
check('R. the read pins its maker, with zero data retention and no prompt training', eq(rq.body.providerOptions.gateway, { only: ['openai'], zeroDataRetention: true, disallowPromptTraining: true }));
check('R. the read sends the picture as published (the padded file)', JSON.stringify(rq.body).includes(padded.bytes.toString('base64').slice(0, 80)));
check('R. rule v1: curly and straight apostrophes match', compareRead(['we don’t stop'], ["we don't stop"]).match);
check('R. rule v1: a line break inside a phrase matches', compareRead(['Snow tonight'], ['Snow\ntonight']).match);
check('R. rule v1: dashes are one', compareRead(['Lesson 4 – Gliders'], ['Lesson 4 - Gliders']).match);
check('R. rule v1: capitals differ: mismatch', !compareRead(['Embrace the competition'], ['Embrace the Competition']).match);
check('R. rule v1: drawn twice: mismatch', !compareRead(['Embrace the competition'], ['Embrace the competition', 'Embrace the competition']).match);
check('R. rule v1: extra lettering: mismatch', !compareRead(['Night Market'], ['Night Market', 'OPEN']).match);
check('R. rule v1: a trailing full stop: mismatch', !compareRead(['Snow tonight'], ['Snow tonight.']).match);
check('R. rule v1: nothing read: mismatch', !compareRead(['Night Market'], []).match);
check('R. rule v1: the same phrase asked twice, drawn twice: match', compareRead(['DOG', 'DOG'], ['DOG', 'DOG']).match);
const sha = createHash('sha256').update(padded.bytes).digest('hex');
const standIn = (texts: string[] | null, cost = 0.0037) => (async () => ({ texts: texts ?? [], costUsd: cost, provider: 'openai', requestId: 'read-stand-in', error: texts ? null : 'malformed answer' })) as Parameters<typeof readBack>[4];
const own = sourcesOf(['Night Market'], 6786);
const ok = await readBack({ bytes: padded.bytes, contentType: 'image/jpeg', sha256: sha }, 'OpenAI', own, oidc, standIn(['Night Market']), () => new Date('2026-11-22T10:00:00Z'));
check('R. a match makes the record: phrases, the line, the pad, the reader, the file read, "match"', ok.ok && ok.record.readback.verdict === 'match' && ok.record.readback.sha256 === sha && ok.record.fit === 'pad' && ok.record.line === letteringLine(['Night Market']) && ok.record.readback.reader === 'openai/gpt-6.1-sol' && ok.cost.verdict === 'ok');
const bad = await readBack({ bytes: padded.bytes, contentType: 'image/jpeg', sha256: sha }, 'OpenAI', own, oidc, standIn(['Night Markt']));
check('R. a mismatch says what was read, and makes no record', !bad.ok && bad.reason === 'lettering-mismatch' && eq(bad.read, ['Night Markt']) && eq(bad.asked, ['Night Market']) && !('record' in bad) && bad.cost.verdict === 'mismatch');
const none = await readBack({ bytes: padded.bytes, contentType: 'image/jpeg', sha256: sha }, 'Google', own, oidc, standIn(null, 0.001));
check('R. no answer: "unread", no record, its cost still counted', !none.ok && none.reason === 'lettering-unread' && none.cost.verdict === 'unread' && none.cost.costUsd === 0.001 && none.cost.model === 'google/gemini-3.8-flash');
// The reservation includes the read-back.
const spendPlain = challengeSpend(GPT, [{ width: 1024, height: 576 }]);
const spendLettered = challengeSpend(GPT, [{ width: 1024, height: 576 }], true);
check('R. the reserve includes the read-back (GPT: + GPT-6.1 Sol\'s worst case)', Math.abs(spendLettered.reserveUsd - spendPlain.reserveUsd - readWorstUsd(READERS.OpenAI)) < 1e-9 && readReserveUsd(GPT) > 0.01);
check('R. ... Gemini\'s, + Gemini 3.8 Flash\'s', Math.abs(challengeSpend(GEM, [{ width: 1024, height: 576 }], true).reserveUsd - challengeSpend(GEM, [{ width: 1024, height: 576 }]).reserveUsd - readWorstUsd(READERS.Google)) < 1e-9);
const policyChars = letteringPolicy(['Aaaaaaaa Bbbbbbbb Cccccccc Dddddddd', 'Eeee']).length;
check('R. the reserve\'s prompt-check share covers the longer lettering policy, twice', reserveUsd(GPT, IMAGES.size) - 0.08 >= guardWorstWithRetryUsd(IMAGES.promptMaxChars + 2000, undefined, policyChars), `${reserveUsd(GPT, IMAGES.size) - 0.08} vs ${guardWorstWithRetryUsd(IMAGES.promptMaxChars + 2000, undefined, policyChars)}`);

// Through paidPicture, on PGlite: a mismatch and a match, and where their costs go.
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(read(path.join('supabase/migrations', f)));
await pg.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
const PORT = 54377;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://studio_writer@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1 });
await sql`set role studio_writer`;
type Sql = Parameters<typeof letteringReady>[0];
const S = sql as unknown as Sql;
const { paidPicture } = await import('../src/lib/images/paid');
const { closedSpentToday, adminSpentToday } = await import('../src/lib/images/limits');
check('R. read-back costs can be counted once 0047_challenge_lettering.sql is applied', await letteringReady(S));
const NATE = 6786;
const made = async () => ({ ...padded });
const after = (texts: string[]) => (m: { bytes: Buffer; contentType: string }) => readBack({ ...m, sha256: createHash('sha256').update(m.bytes).digest('hex') }, 'OpenAI', own, oidc, standIn(texts));
sent.length = 0;
let p = await paidPicture(S, NATE, oidc, { checkText: lettered, spend: spendLettered, make: made, maker: 'OpenAI', guardPolicy: letteringPolicy(['Night Market']), after: after(['NIGHT MARKET']) });
const guardCall = sent.find((x) => x.url.includes('chat/completions'));
check('G. a lettered picture\'s prompt check sends the lettering policy, with its phrase', Boolean(guardCall) && JSON.parse(guardCall!.body).messages[0].content === letteringPolicy(['Night Market']));
check('T. a mismatch: refused (422), nothing returned to keep, what was read and asked', !p.ok && p.status === 422 && p.extra.reason === 'lettering-mismatch' && eq(p.extra.read, ['NIGHT MARKET']) && eq(p.extra.asked, ['Night Market']) && !('made' in p), JSON.stringify(p));
const rows = await sql<{ funded: string; kind: string; model: string; verdict: string; calls: number; cost_usd: string }[]>`select funded, kind, model, verdict, calls, cost_usd::text from studio.image_costs where kind = 'readback'`;
check('R. its read-back is counted: kind readback, verdict mismatch, free, the reader\'s id', rows.length === 1 && rows[0].funded === 'free' && rows[0].verdict === 'mismatch' && rows[0].model === 'openai/gpt-6.1-sol' && Number(rows[0].cost_usd) === 0.0037, JSON.stringify(rows));
const [reserved] = await sql<{ usd: number }[]>`select coalesce(sum(cost_usd), 0)::float8 usd from studio.image_costs where kind = 'reserved'`;
check('R. the reservation was settled (nothing left reserved)', Math.abs(reserved.usd) < 1e-9, String(reserved.usd));
const closed1 = await closedSpentToday(S);
check('R. the read-back counts against the challenge\'s closed cap', Math.abs(closed1 - (0.0467 + 0.0037)) < 1e-6, String(closed1));
sent.length = 0;
p = await paidPicture(S, NATE, oidc, { checkText: plain, spend: spendPlain, make: async () => ({ ...cropped }), maker: 'OpenAI' });
const plainGuard = sent.find((x) => x.url.includes('chat/completions'));
check('G. a picture without quoted words sends image-guard.md exactly, as before', Boolean(plainGuard) && JSON.parse(plainGuard!.body).messages[0].content === baseBody && p.ok && !p.lettering);
p = await paidPicture(S, NATE, oidc, { checkText: lettered, spend: spendLettered, make: made, maker: 'OpenAI', guardPolicy: letteringPolicy(['Night Market']), after: after(['Night Market']) });
check('R. a match: the picture and its record come back', p.ok && p.lettering?.readback.verdict === 'match' && p.lettering.phrases[0].source === 'own');
// The admins' pool: a chapter picture's read-back is funded 'admin', inside the $20, never the entrants' closed cap.
const before = await closedSpentToday(S);
p = await paidPicture(S, NATE, oidc, { checkText: lettered, spend: { ...spendLettered, pool: 'admin' }, make: made, maker: 'OpenAI', guardPolicy: letteringPolicy(['Night Market']), after: after(['Night Market']) });
const [adminRead] = await sql<{ n: number }[]>`select count(*)::int n from studio.image_costs where kind = 'readback' and funded = 'admin'`;
check('R. a chapter picture\'s read-back is the admins\' (funded admin)', p.ok && adminRead.n === 1 && (await closedSpentToday(S)) === before && (await adminSpentToday(S)) > 0.05);
// A reader that throws (the gateway down): unread, nothing kept.
p = await paidPicture(S, NATE, oidc, { checkText: lettered, spend: spendLettered, make: made, maker: 'OpenAI', guardPolicy: letteringPolicy(['Night Market']), after: async () => { throw new Error('down'); } });
check('R. a reader that fails: nothing kept, "couldn\'t be read back"', !p.ok && p.extra.reason === 'lettering-unread' && p.error === W.unread);
// A picture the safety check flags is never read back.
let readCalled = false;
p = await paidPicture(S, NATE, oidc, { checkText: lettered, spend: spendLettered, make: async () => ({ ...padded, nsfw: true }), maker: 'OpenAI', guardPolicy: letteringPolicy(['Night Market']), after: async (m) => { readCalled = true; return after(['Night Market'])(m); } });
check('R. a flagged picture is dropped and never read back', !p.ok && !readCalled);

// ---------------------------------------------------------------------------------------------------------------------
// T. Try again only.
// ---------------------------------------------------------------------------------------------------------------------
const route = read('src/app/api/challenge/make/route.ts');
check('T. the make route signs a ticket only after paidPicture succeeds (a mismatch returns before)', route.indexOf('if (!paid.ok) return no(paid.error, paid.status, paid.extra);') > 0 && route.indexOf('if (!paid.ok) return no(') < route.indexOf('signTicket('));
check('T. the ticket carries the record only from a matched read-back', /\.\.\.\(paid\.lettering \? \{ lettering: paid\.lettering \} : \{\}\)/.test(route));
const ui = read('src/components/lettering.tsx');
const mismatchUi = ui.slice(ui.indexOf('export function LetteringMismatch'), ui.indexOf('const sourceText'));
check('T. the mismatch screen has one button, Try again, and no keep', (mismatchUi.match(/<button/g) ?? []).length === 1 && /w\.tryAgain/.test(mismatchUi) && !/keep|publish/i.test(mismatchUi.replace(/mismatchKept/g, '')));
const make = read('src/components/challenge-make.tsx');
check('T. the remix screen shows the mismatch in place of Make it', /mismatch \? \(\s*\/\/ Option a[\s\S]*?<LetteringMismatch/.test(make));
const publish = read('src/app/api/images/publish/route.ts');
check('T. publish refuses a lettered draft whose read-back didn\'t match this file', /t\.lettering && \(t\.lettering\.readback\?\.verdict !== 'match' \|\| t\.lettering\.readback\.sha256 !== t\.sha256\)/.test(publish));
check('T. publish writes body.lettering drawn_by model and the record in the recipe', /lettering: t\.lettering \? bodyItems\(t\.lettering\) : \[\]/.test(publish) && /\.\.\.\(t\.lettering \? \{ lettering: t\.lettering \} : \{\}\)/.test(publish) && bodyItems(ok.ok ? ok.record : (null as never)).every((b) => b.drawn_by === 'model'));
check('T. the warning before Make it says words can come out wrong and a redo uses today\'s pictures (3 for a closed one)', /get words wrong/.test(W.warning) && W.warning.includes(`uses ${(await import('../src/lib/config')).CLOSED_IMAGES.countsAs} more of today’s pictures`));

// ---------------------------------------------------------------------------------------------------------------------
// O. The open model with quoted words.
// ---------------------------------------------------------------------------------------------------------------------
const US = { country: 'US', region: null }, NOWHERE = { country: null, region: null };
const usLine = letteringWords(modelRow(US)).openRefused;
check('O. the refusal names the closed models offered here', /GPT Image 2\.5 Sunburst/.test(usLine) && /Gemini 3\.1 Flash Image/.test(usLine) && usLine.startsWith(`${IMAGES.editModel.name} can’t draw words`), usLine);
const noneLine = letteringWords(modelRow(NOWHERE)).openRefused;
check('O. with none offered, only the line', !/GPT|Gemini/.test(noneLine) && /no model that can is offered where you are/.test(noneLine), noneLine);
const iRefuse = route.indexOf("reason: 'lettering-open'");
check('O. the make route refuses it before consent, the gate and any spend', iRefuse > 0 && iRefuse < route.indexOf('hasConsented(fid)') && iRefuse < route.indexOf('mayGenerate(') && iRefuse < route.indexOf('paidPicture('));
check('O. ... and a quote the parser refuses, before any spend', route.indexOf("reason: 'lettering' }") > 0 && route.indexOf("reason: 'lettering' }") < route.indexOf('paidPicture('));
check('O. ... and lettering before its migration', route.indexOf("reason: 'lettering-not-ready'") > 0 && route.indexOf("reason: 'lettering-not-ready'") < route.indexOf('paidPicture('));

// ---------------------------------------------------------------------------------------------------------------------
// P. P8j.
// ---------------------------------------------------------------------------------------------------------------------
const blockMap = new Map(blocks);
const goodRecord = ok.ok ? ok.record : (null as never);
const bookRec = { ...goodRecord, phrases: sourcesOf(['Embrace the competition'], 6786), line: letteringLine(['Embrace the competition']) };
const promptFor = (line: string) => `Zei under a banner\n\n${line}`;
const good: Parameters<typeof p8jProblems>[0] = [
  { where: 'own', sha256: sha, prompt: promptFor(goodRecord.line), body: bodyItems(goodRecord), record: goodRecord },
  { where: 'book', sha256: sha, prompt: promptFor(bookRec.line), body: bodyItems(bookRec), record: bookRec },
];
check('P. P8j passes on well-made records (own and book)', p8jProblems(good, blockMap, IMAGES.suffix).length === 0, p8jProblems(good, blockMap, IMAGES.suffix).join('; '));
const { P8J_PLANTS } = await import('./lib/p8j');
for (const [name, plant] of Object.entries(P8J_PLANTS)) {
  const got = p8jProblems(plant(good[1] as Parameters<typeof plant>[0], good[0] as Parameters<typeof plant>[1]), blockMap, IMAGES.suffix);
  check(`P. P8j catches the planted fault "${name}"`, got.length > 0, JSON.stringify(got));
}
const cp = read('scripts/check-principles.ts');
check('P. check:principles runs P8j', /id: 'P8j'/.test(cp) && /p8jProblems/.test(cp));
check('P. docs/principles.md names P8j', /`P8j`/.test(read('docs/principles.md')));

// ---------------------------------------------------------------------------------------------------------------------
// C. A chapter picture's lettering redo.
// ---------------------------------------------------------------------------------------------------------------------
const { redoPicture, addPicture, redoable } = await import('../src/lib/chapter-pictures/pictures');
const { checkJobs } = await import('../src/lib/illustration-check/jobs');
const { pictureHistory } = await import('../src/lib/chapter-pictures/read');
type Deps = Parameters<typeof redoPicture>[5];
const letteredJobs = checkJobs().filter((j) => j.lettering.length);
check('C. the three lettered edition pictures', eq(letteredJobs.map((j) => j.id), ['c2-b038-foil-classroom', 'c30-b041-sticking-patterns', 'c30-b048-drones-surge']));
check('C. ... are redoable now', letteredJobs.every((j) => redoable(j)));
const GARANCE = 193912;
const calls: { kind: string; prompt?: string; fit?: string; url?: string; worst?: number }[] = [];
let readTexts: string[] = ['DOG', 'DOG'];
const deps: Deps = {
  reference: async (url, s) => {
    calls.push({ kind: 'reference', url });
    return s ? ref : null;
  },
  makeOpen: async () => {
    throw new Error('the open model never draws words');
  },
  makeClosed: async (_m, prompt, _r, _q, worst, fit) => {
    calls.push({ kind: 'closed', prompt, fit, worst });
    return { ...padded, settings: { ...padded.settings, stand_in: true } };
  },
  putPublic: async (s) => `https://pictures.snowmoon.party/images/readers/${s.slice(0, 32)}.jpg`,
  storageReady: () => true,
  handleFor: async () => 'garance',
  paid: paidPicture,
  consented: async () => true,
  makeAdded: async (_m, prompt, _refs, _q, worst, fit) => {
    calls.push({ kind: 'added', prompt, fit, worst });
    return { ...padded };
  },
  sheets: async () => [],
  read: async () => ({ texts: readTexts, costUsd: 0.0037, provider: 'openai', requestId: 'r', error: null }),
};
const notice = { version: (await import('../src/lib/config')).CLOSED_PROVIDERS.OpenAI.noticeVersion, adult: true };
// The admins' look, so a redo can run.
await sql`insert into studio.chapter_picture_looks ${sql({ chapter: null, look: sql.json({ kind: 'line', text: 'Soft watercolour washes.' } as never), by_fid: GARANCE })}`;
const J = 'c30-b048-drones-surge';
const jobB048 = letteredJobs.find((j) => j.id === J)!;
let r = await redoPicture(S, GARANCE, oidc, { jobId: J, note: 'Keep the two signs: "DOG" "DOG"', model: 'flux2-klein-4b-edit' }, US, deps);
check('C. the open model with quoted words is refused before anything is spent, naming the closed ones', r.status === 400 && r.json.reason === 'lettering-open' && /GPT Image 2\.5 Sunburst/.test(String(r.json.error)) && !calls.some((c) => c.kind === 'closed'));
const spentBefore = await adminSpentToday(S);
readTexts = ['DOG', 'DOG'];
r = await redoPicture(S, GARANCE, oidc, { jobId: J, note: 'Keep the two signs: "DOG" "DOG"', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
const call = calls.filter((c) => c.kind === 'closed').pop();
check('C. a lettered edition picture is redone with the words in quotation marks', r.status === 200 && typeof r.json.versionId === 'string', JSON.stringify(r.json));
const pubB048 = (JSON.parse(read('content/snowmoon/illustrations/published.json')) as { images: { id: string; url: string; clean?: { url: string } }[] }).images.find((i) => i.id === J)!;
check('C. its redo starts from the clean render (the code-drawn words left out)', calls.some((c) => c.kind === 'reference' && c.url === pubB048.clean?.url) && jobB048.image!.url === pubB048.clean?.url && pubB048.url !== pubB048.clean?.url);
check('C. the prompt ends with the lettering line, without the no-text line', Boolean(call?.prompt?.endsWith(letteringLine(['DOG', 'DOG']))) && !call!.prompt!.includes(IMAGES.suffix));
check('C. padded, not cropped', call?.fit === 'pad');
const v = (await pictureHistory(S)).versions.get(J)?.[0];
check('C. the version\'s recipe has the lettering record, its parts the line and no suffix', v?.recipe.lettering?.readback.verdict === 'match' && v.recipe.parts.suffix === '' && v.recipe.parts.lettering === letteringLine(['DOG', 'DOG']));
const [adminReads] = await sql<{ n: number }[]>`select coalesce(sum(calls), 0)::int n from studio.image_costs where kind = 'readback' and funded = 'admin'`;
check('C. its read-back is paid from the admins\' $20', adminReads.n >= 2 && (await adminSpentToday(S)) > spentBefore);
check('C. P8j passes on it', p8jProblems([{ where: J, sha256: createHash('sha256').update(padded.bytes).digest('hex'), prompt: v!.prompt, body: null, record: v!.recipe.lettering }], blockMap, IMAGES.suffix).length === 0);
// A mismatch: nothing saved, what was read comes back.
const versionsBefore = (await pictureHistory(S)).versions.get(J)?.length ?? 0;
readTexts = ['DOG', 'D0G'];
r = await redoPicture(S, GARANCE, oidc, { jobId: J, note: 'Keep the two signs: "DOG" "DOG"', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
check('C. a mismatch saves no version and says what was read', r.status === 422 && r.json.reason === 'lettering-mismatch' && eq(r.json.read, ['DOG', 'D0G']) && ((await pictureHistory(S)).versions.get(J)?.length ?? 0) === versionsBefore);
// c30-b041: five "DOG" signs are over the 3-phrase cap; c2-b038's sign is 20 words, over the 8-word cap.
r = await redoPicture(S, GARANCE, oidc, { jobId: 'c30-b041-sticking-patterns', note: '"DOG" "DOG" "DOG" "DOG" "DOG"', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
check('C. c30-b041\'s five signs are over the cap: refused before any spend', r.status === 400 && r.json.reason === 'lettering' && r.json.error === W.overCap);
readTexts = ['DOG', 'DOG', 'DOG'];
r = await redoPicture(S, GARANCE, oidc, { jobId: 'c30-b041-sticking-patterns', note: 'Three of the signs: "DOG" "DOG" "DOG"', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
check('C. ... with three, it is redone', r.status === 200, JSON.stringify(r.json));
const c2 = letteredJobs[0].lettering[0].text.replace(/\s+/g, ' ');
r = await redoPicture(S, GARANCE, oidc, { jobId: 'c2-b038-foil-classroom', note: `The sign: "${c2}"`, model: 'gpt-image-2.5-sunburst', notice }, US, deps);
check('C. c2-b038\'s 20-word Dzegoban sign is over the cap: refused before any spend', r.status === 400 && r.json.error === W.overCap);
readTexts = ['pa jan li sun zo'];
r = await redoPicture(S, GARANCE, oidc, { jobId: 'c2-b038-foil-classroom', note: 'The sign\'s first line only: "pa jan li sun zo"', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
const c2v = (await pictureHistory(S)).versions.get('c2-b038-foil-classroom')?.[0];
check('C. ... its first line is redone, recorded as the book\'s at c2-b39 if the book has it there', r.status === 200 && c2v?.recipe.lettering?.phrases[0].source === 'book' && (c2v.recipe.lettering.phrases[0] as { block: string }).block === 'c2-b39', JSON.stringify(c2v?.recipe.lettering?.phrases));
// A redo without quoted words keeps the no-text line, as before.
r = await redoPicture(S, GARANCE, oidc, { jobId: J, note: 'Make the forest darker.', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
const plainCall = calls.filter((c) => c.kind === 'closed').pop();
check('C. a redo without quoted words: the no-text line and the crop, as before', r.status === 200 && plainCall!.prompt!.endsWith(IMAGES.suffix) && plainCall!.fit === 'crop');
// An added picture with quoted words.
readTexts = ['Snow tonight'];
r = await addPicture(S, GARANCE, oidc, { chapter: 1, after: 5, start: 5, end: 5, note: 'A sign by the road: "Snow tonight"', model: 'gpt-image-2.5-sunburst', notice }, US, deps);
const addCall = calls.filter((c) => c.kind === 'added').pop();
check('C. an added picture with quoted words: the lettering line, padded, recorded', r.status === 200 && addCall?.fit === 'pad' && addCall.prompt!.endsWith(letteringLine(['Snow tonight'])), JSON.stringify(r.json));
check('C. the reserve passed to the picture excludes the read-back\'s share', typeof call?.worst === 'number' && Math.abs(call!.worst! - reserveUsd(GPT, { width: 1024, height: 576 })) < 1e-9, String(call?.worst));
check('C. the admins\' cap is $20', CHAPTER_PICTURES.adminDailyCapUsd === 20);

await sql.end();
await server.stop();
globalThis.fetch = realFetch;
check('nothing left this machine except to stand-ins', sent.every((x) => x.url.startsWith('https://ai-gateway.vercel.sh/')));
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
