/**
 * The reading assistant, slice 1 (docs/proposals/chat.md). Fails (exit 1) on any problem.
 *
 *   npm run test:chat
 *
 * Runs migrations 0001–0007 in an in-memory Postgres (PGlite), seeds all 4,322
 * blocks with the real seed script, and talks to it as studio_writer, the app's
 * role. The model is a stand-in that returns whatever each case needs, so no
 * paid call is made. Checks:
 * - The whole book (owner, 2026-11-17: "Spoilers no longer matter"): retrieval,
 *   glossary words and attached blocks use every chapter; no chapter limit is
 *   sent to the model.
 * - Reviewed notes (src/lib/chat/notes.ts): a chapter named adds its summary
 *   sections, a Learn more character named adds their whole text and glossary
 *   sentences, "where was I" uses the reader's chapter (or asks which, spending
 *   no message), the whole book uses every chapter's first section; an answer
 *   citing a note's source is kept and labelled; the support check sees the note.
 * - Citations that don't exist: dropped and never rendered; every quote shown
 *   is the stored text of a real block, never the model's words.
 * - The daily limit (30) and the spend cap.
 * - chat_calls is append-only for studio_writer and holds no message text.
 * - No cost record can be joined to a person (migration 0007): chat_costs has
 *   no FID, request id, time of day or row per call; chat_calls holds only
 *   questions, with no row number; a cost row written the old way is moved to
 *   the totals.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { ask, AskError, parseSupport, NOTES_TEMPERATURE, type Complete } from '../src/lib/chat/ask';
import { retrieve } from '../src/lib/chat/retrieve';
import { sanitizeAnswer, sanitizeReply } from '../src/lib/chat/sanitize';
import { glossaryWords } from '../src/lib/chat/glossary';
import { chaptersNamed, charactersNamed, countWords, fitWords, NOTE_WORDING, routeQuestion } from '../src/lib/chat/notes';
import { CHAT } from '../src/lib/config';
import { providerOptions, servedBy, servingAllowed } from '../src/lib/chat/provider';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));

// --- Database: the six migrations, then the real seed, as studio_writer ------
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of ['0001_core.sql', '0002_v5.sql', '0003_likes.sql', '0004_private_ratings_and_likes.sql', '0005_public_prompts_and_consent.sql', '0006_chat.sql', '0007_chat_costs_without_person.sql']) {
  try {
    await pg.exec(await readFile(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
  } catch (e) {
    console.error(`${f} failed to apply: ${(e as Error).message}`);
    process.exit(1);
  }
}
await pg.exec(`insert into studio.works values ('snowmoon', 'Snowmoon', 'GPL-3.0', 'x')`);
await pg.exec(`set role studio_writer`);
const PORT = 54331;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const URL = `postgres://studio_writer@127.0.0.1:${PORT}/postgres`;
await promisify(execFile)('npx', ['tsx', 'scripts/seed-text.ts'], { cwd: ROOT, env: { ...process.env, STUDIO_DATABASE_URL: URL } });
const sql = postgres(URL, { prepare: false, max: 1 });

try {
  // The seed's own connection can reset PGlite's single session; take the app's role again and prove it.
  await sql`set role studio_writer`;
  const [{ u }] = await sql`select current_user as u`;
  check('the tests run as studio_writer', u === 'studio_writer', String(u));

  const [{ n }] = await sql`select count(*)::int as n from studio.text_blocks`;
  check('seed loaded every block', n === 4322, String(n));

  // --- The whole book, at retrieval ----------------------------------------
  {
    // Deluin first appears in chapter 12: the search finds him there, with nothing held back.
    const r = await retrieve(sql, 'Deluin Redshire invaded');
    check('retrieval uses later chapters', r.passages.some((p) => p.chapter >= 12), JSON.stringify(r.passages.map((p) => p.id)));
    check('nothing is held back over the whole book', !r.heldBack);
    const r2 = await retrieve(sql, 'Gladias vote building sortition');
    check('a hit brings the block before it', r2.passages.some((p, i) => i > 0 && r2.passages[i - 1].chapter === p.chapter && r2.passages[i - 1].idx === p.idx - 1));
    const att = await retrieve(sql, 'x', ['c14-b97']);
    check('an attached block from any chapter is used', att.passages.some((p) => p.id === 'c14-b97'));
    // The image coach keeps its own draft range.
    const coach = await retrieve(sql, 'Deluin Redshire invaded', [], { upTo: 3 });
    check("the coach's range still holds (upTo)", coach.passages.every((p) => p.chapter <= 3) && coach.heldBack, JSON.stringify(coach.passages.map((p) => p.id)));
  }

  // --- Routing to reviewed notes (pure) -------------------------------------
  {
    const ch = (q: string) => chaptersNamed(q).join(',');
    check('chapters named: digits, words, ranges, "ch"', ch('Summarize chapter 5') === '5' && ch('ch 7?') === '7' && ch('chapters 3 to 4') === '3,4' && ch('chapter twenty-one') === '21' && ch('Chapter five') === '5' && ch('chapters 2-9') === '2,3,4', [ch('chapters 2-9'), ch('chapter twenty-one')].join(' | '));
    check('no chapter in an ordinary question', ch('How does voting on buildings work?') === '' && ch('Who chose 5 players?') === '');
    const who = (q: string) => charactersNamed(q).join(',');
    check('characters named in any case and through aliases', who('remind me about mu') === 'mu' && who('Who is Jahen?') === 'bai' && who('Who is Uncle Glad?') === 'gladias' && who('Lord Ephelion') === 'ephelion', [who('remind me about mu'), who('Who is Jahen?')].join(' | '));
    check('a name inside a word is not a character', who('Is a mule a horse? Is muzei a word?') === '');
    const r = (q: string, pos: number | null = null) => routeQuestion(q, pos);
    check('a chapter named adds its summary sections, at 180 words', r("what's chapter 5 about?").shape === 'summary' && r("what's chapter 5 about?").notes.every((n) => n.label.startsWith('summary c5')) && r('ch 7?').words === 180);
    check('a chapter named in any question adds its summary (not the verb)', r('Why does Zei go home in chapter 7?').notes.some((n) => n.label.startsWith('summary c7')) && r('Why does Zei go home in chapter 7?').words === 120);
    const bai = r('Who is Bai?');
    check('a Learn more character adds the whole text, the later part included, and glossary sentences', ['who', 'start', 'later', 'drives'].every((part) => bai.notes.some((n) => n.label === `learn-more bai ${part}`)) && bai.blocks.length > 0, JSON.stringify(bai.notes.map((n) => n.label)));
    check('a Learn more note cites real block ids', bai.notes.every((n) => n.sources.length > 0 && n.sources.every((id) => /^c\d+-b\d+$/.test(id))));
    check('"where was I" uses the current chapter and the two before', r('where was I?', 8).chapters.join(',') === '6,7,8' && r('where was I?', 1).chapters.join(',') === '1' && r('catch me up', 8).shape === 'where');
    check('"where was I" with no chapter asks which', r('where was I?').needsChapter && !r('where was I?', 4).needsChapter);
    check('"where was I, chapter 8" uses the chapter named', r("Where was I? I'm on chapter 8.").chapters.join(',') === '6,7,8');
    const book = r('What is the book about?');
    check('the whole book: the first section of every chapter, at 250 words', book.shape === 'book' && book.notes.length === 32 && book.notes.every((n) => / §1$/.test(n.label)) && book.words === 250 && r('Summarize the whole book').shape === 'book');
    check('an ordinary question has no notes, at 120 words', r('How does voting on buildings work in Veridia?').notes.length === 0 && r('How does voting on buildings work in Veridia?').words === 120);
  }

  // --- Citations, in the pure sanitizer --------------------------------------
  {
    const allowed = new Set(['c1-b20', 'c1-b21']);
    const s = sanitizeReply('He is chosen at random [c1-b20]. It was hard 【c1-b21】. Later he moves on (c19-b153) [c99-b1] [c1-b999].', allowed);
    check('allowed citations kept, in order', JSON.stringify(s.cites) === JSON.stringify(['c1-b20', 'c1-b21']), JSON.stringify(s.cites));
    check('citations not given are dropped', JSON.stringify(s.dropped) === JSON.stringify(['c19-b153', 'c99-b1', 'c1-b999']), JSON.stringify(s.dropped));
    check('no dropped id survives in the text', !s.parts.some((p) => p.type === 'text' && /c\d+-b\d+/.test(p.text)));
    const q = sanitizeReply('He says "the whole point of Dzegoban is that there are only 256 roots" here [c1-b20], and "Sure!" too.', allowed);
    check('a quoted span of six words or more is removed', q.quotesRemoved === 1 && !q.parts.some((p) => p.type === 'text' && p.text.includes('256 roots')));
    const r = sanitizeReply('Ranges count [c1-b20‑c1-b21] and 【c1-b20–b21】 too.', allowed);
    check('a cited range opens into its blocks', JSON.stringify(r.cites) === JSON.stringify(['c1-b20', 'c1-b21']) && r.dropped.length === 0, JSON.stringify(r));
    const far = sanitizeReply('Too wide [c1-b2–c1-b90].', allowed);
    check('a range too wide keeps only its ends, which must be allowed', far.cites.length === 0 && far.dropped.length === 2, JSON.stringify(far));
    check('a short quoted word stays', q.parts.some((p) => p.type === 'text' && p.text.includes('"Sure!"')));
    // gpt-oss sometimes writes ids with a non-breaking hyphen, in parentheses: (c1‑b20‑c1‑b21).
    const nb = sanitizeReply('A board game (c1\u2011b20\u2011c1\u2011b21). Later [c1\u2011b21].', allowed);
    check('an id written with another dash is still a citation', JSON.stringify(nb.cites) === JSON.stringify(['c1-b20', 'c1-b21']) && nb.dropped.length === 0, JSON.stringify(nb));
    // Note citations (owner, 2026-11-17): a label the model was given is a citation of that note; others are dropped.
    const notes = new Set(['summary c8 §2', 'learn-more bai who']);
    const n = sanitizeAnswer('The vote is tied [summary c8 §2]; then [Summary c8 s2]. Bai [learn-more Bai who] [summary c9 §1] [c1-b20].', allowed, { notes });
    check('a note label is a citation, in any spelling', JSON.stringify(n.notes) === JSON.stringify(['summary c8 §2', 'learn-more bai who']) && n.parts.filter((p) => p.type === 'note').length === 3, JSON.stringify(n.notes));
    check('a label not given is dropped; block ids still work beside labels', JSON.stringify(n.dropped) === JSON.stringify(['summary c9 §1']) && JSON.stringify(n.cites) === JSON.stringify(['c1-b20']), JSON.stringify(n));
    check('words in brackets that are not citations stay', sanitizeAnswer('He was (as ever) late [c1-b20].', allowed, { notes }).parts[0].type === 'text' && sanitizeAnswer('He was (as ever) late [c1-b20].', allowed, { notes }).parts.map((p) => (p.type === 'text' ? p.text : '')).join('').includes('(as ever)'));
    // Quotations, word for word against the blocks the sentence cites (a note brings its sources); no "…".
    const texts: Record<string, string> = { 'c1-b20': 'On a team, you have to be diplomatic, she said.', 'c1-b21': 'Mu raised a glass. "To our future, and to the future of all!"', 'c8-b97': 'It was ten to ten, exactly, in the hall.' };
    const qo = { notes, textOf: (id: string) => texts[id], sourcesOf: (l: string) => (l === 'summary c8 §2' ? ['c8-b97'] : []) };
    const shown = (t: string) => sanitizeAnswer(t, allowed, qo).parts.map((p) => (p.type === 'text' ? p.text : p.type === 'cite' ? `[${p.id}]` : `[${p.label}]`)).join('');
    check('a quotation that matches its cited block word for word stays', shown('She warns him, "on a team, you have to be diplomatic" [c1-b20].').includes('"on a team, you have to be diplomatic"'));
    check('a quotation matching nothing cited, in a later clause: the clause goes', shown('She warns him that tact matters, saying "be kind to all of your rivals" [c1-b20]. Then he plays [c1-b21].') === 'She warns him that tact matters. Then he plays [c1-b21].', shown('She warns him that tact matters, saying "be kind to all of your rivals" [c1-b20]. Then he plays [c1-b21].'));
    check('a quotation matching nothing cited, in the first clause: the sentence goes', shown('Mu toasts "Dzego will rise again and again" [c1-b21]. Zei wins [c1-b21].') === 'Zei wins [c1-b21].', shown('Mu toasts "Dzego will rise again and again" [c1-b21]. Zei wins [c1-b21].'));
    check('a quotation is checked against the cited note\'s blocks', shown('The chairman says "it was ten to ten, exactly" [summary c8 §2].').includes('"it was ten to ten, exactly"') && shown('The chairman says "it was ten to eleven, sadly" [summary c8 §2].') === '');
    check('one or two quoted words are a term and stay', shown('The "no head" rule [c1-b21].').includes('"no head"'));
    check('a quoted phrase under six words stays unchecked (owner, 2026-11-18)', shown('Mu calls it "a test of the realm" [c1-b21].').includes('"a test of the realm"'));
    check('a quotation of six words that matches nothing cited still goes', shown('Mu calls it "a test of the whole realm" [c1-b21]. Zei wins [c1-b21].') === 'Zei wins [c1-b21].');
    check('citations after a narrow no-break space stay with their sentence', shown('Mu raised a glass and said "to our future, and to the future" here.\u202f [c1-b21] Then [c1-b20].').includes('"to our future, and to the future"'), shown('Mu raised a glass and said "to our future, and to the future" here.\u202f [c1-b21] Then [c1-b20].'));
    check('the recap cut keeps citations after a narrow no-break space', fitWords('Chapter 6 – One.\u202f [c6-b1] Two two two.', 3, 1) === 'Chapter 6 – One.\u202f [c6-b1]', fitWords('Chapter 6 – One.\u202f [c6-b1] Two two two.', 3, 1));
    check('a comma inside a list is not a clause boundary: the clause goes from its linking word', shown('Bai won thrice, while Zei’s quick, clever play made Den say "he had nearly reinvented all of cryptography" once [c1-b20]. Next [c1-b21].') === 'Bai won thrice. Next [c1-b21].', shown('Bai won thrice, while Zei’s quick, clever play made Den say "he had nearly reinvented all of cryptography" once [c1-b20]. Next [c1-b21].'));
    check('a dash aside with an unmatched quotation goes', shown('He gave Bai the turn – he tells her "now is your chance to shine" – and won [c1-b21].') === 'He gave Bai the turn and won [c1-b21].', shown('He gave Bai the turn – he tells her "now is your chance to shine" – and won [c1-b21].'));
    check('with no clause boundary before it, the sentence goes', shown('Zei’s quick, clever play made Den say "he had nearly reinvented all of cryptography" [c1-b20]. Next [c1-b21].') === 'Next [c1-b21].');
    check('dropping keeps paragraphs', shown('One [c1-b20].\n\nTwo says "not in any block at all" here. Three [c1-b21].') === 'One [c1-b20].\n\nThree [c1-b21].', JSON.stringify(shown('One [c1-b20].\n\nTwo says "not in any block at all" here. Three [c1-b21].')));
  }

  // --- Glossary words in the question ---------------------------------------
  {
    // Minpentai first appears in chapter 2; "minpetai" is one letter off and not a word of the book.
    const g = await glossaryWords(sql, 'everything about the game of minpetai');
    check('a misspelled glossary word is corrected', g.corrected.endsWith('game of Minpentai'), JSON.stringify(g));
    check('the corrected word is pointed to in the glossary', JSON.stringify(g.links) === JSON.stringify([{ slug: 'minpentai', term: 'Minpentai' }]), JSON.stringify(g.links));
    const named = await glossaryWords(sql, 'Why did gladias go to Redshire, and who is Pafogai Du?');
    check('people and places are not pointed to; a longer name wins over the shorter one inside it', named.links.map((l) => l.slug).join(',') === 'pafogai-du', JSON.stringify(named.links));
    const lower = await glossaryWords(sql, 'who is pafogai du, and how is minpentai played?');
    check('glossary words are found in any case, in the order asked', lower.links.map((l) => l.slug).join(',') === 'pafogai-du,minpentai', JSON.stringify(lower.links));
    const plain = await glossaryWords(sql, 'What is the theme of Snowmoon? Is a fin a min? Which menu number does he order?');
    check("the book's title, short lower-case words and an alias in lower case are not glossary links", plain.links.map((l) => l.slug).join(',') === '', JSON.stringify(plain.links));
    const book = await glossaryWords(sql, 'what does the herald say');
    check('a word the book uses is not corrected', book.corrected === 'what does the herald say', JSON.stringify(book));
  }

  // --- Whole questions, with a stand-in model --------------------------------
  const calls: { model: string; user: string }[] = [];
  let answerText = '';
  let guardText = 'OK commentary only';
  /** Guard verdicts to give before falling back to guardText (one per guard call). */
  let guardQueue: string[] = [];
  /** What the stand-in returns for the search-words call. */
  let searchText = '';
  /** Verdicts for the support check, one per call (default SUPPORTED), and what it was shown. */
  let supportQueue: string[] = [];
  const supportSeen: string[] = [];
  const complete: Complete = async (model, messages) => {
    calls.push({ model, user: messages[messages.length - 1].content });
    const text =
      messages[0].content === 'SUPPORT' ? (supportQueue.shift() ?? 'SUPPORTED') : model === CHAT.guardModel ? (guardQueue.shift() ?? guardText) : messages[0].content === 'SEARCH' ? searchText : answerText;
    if (messages[0].content === 'SUPPORT') supportSeen.push(messages[1].content);
    return { text, promptTokens: 1000, completionTokens: 200, costUsd: 0.0002, requestId: 'test', provider: 'test', model };
  };
  const deps = (fid: number) => ({ sql, fid, complete, systemPrompt: 'SYSTEM about {{WORDS}} words', guardPolicy: 'POLICY', reminder: 'REMINDER: {{REASON}}', searchPrompt: 'SEARCH', supportPolicy: 'SUPPORT' });

  {
    calls.length = 0;
    const r1 = await retrieve(sql, 'Why is Gladias asked to rate a building?');
    const real = r1.passages[0].id;
    // The model cites a real passage, a block that does not exist, and one it wasn't given, and quotes the book itself.
    answerText = `He is chosen at random [${real}]. "As a citizen of Veridia, he had been randomly selected by cryptographic sortition" [c1-b9999]. Much later [c30-b47].`;
    const res = await ask(deps(101), { question: 'Why is Gladias asked to rate a building?' });
    check('ask returns an answer', res.state === 'answer', res.state);
    if (res.state === 'answer') {
      // The quotation matches no block its sentence cites, and is in the sentence's first clause: the sentence goes, its
      // citation with it. The other citation, not given, is dropped.
      check('the not-given citation is dropped', res.dropped === 1, String(res.dropped));
      check('a sentence whose quotation matches no cited block is dropped whole, with no "…"', !res.parts.some((p) => p.type === 'text' && (p.text.includes('…') || p.text.includes('citizen'))));
      check('an answer with no reviewed note carries no notes line', !res.notes);
      check('only real, allowed blocks are quoted', res.quotes.length === 1 && res.quotes[0].id === real, JSON.stringify(res.quotes.map((q) => q.id)));
      const [{ content }] = await sql`select content from studio.text_blocks where chapter = ${Number(real.slice(1, real.indexOf('-')))} and idx = ${Number(real.split('-b')[1])}`;
      const plain = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\*/g, '').trim();
      check("the quote is the stored text, not the model's words", plain(res.quotes[0].html) === plain(content as string), `${plain(res.quotes[0].html).slice(0, 60)} | ${plain(content as string).slice(0, 60)}`);
      check('the quote carries its ¶ label', typeof res.quotes[0].label === 'number');
      check("the model's own quotation of the book is removed", !res.parts.some((p) => p.type === 'text' && p.text.includes('cryptographic sortition')));
    }
    const sent = calls.find((c) => c.model === CHAT.model && c.user !== 'Why is Gladias asked to rate a building?')!.user;
    check('no chapter limit is sent to the model', !/chapters 1[–-]\d/.test(sent) && sent.includes('Passages from the book:'), sent.slice(0, 60));
    check('a Learn more character in any question brings their notes (Gladias)', sent.startsWith('Reviewed notes') && sent.includes('[learn-more gladias who]'));
    check('every answer is checked by the guard', calls.some((c) => c.model === CHAT.guardModel));
  }
  {
    // A chapter named: its summary sections go to the model as reviewed notes; an answer citing their sources is kept.
    calls.length = 0;
    const src = routeQuestion('What happens in chapter 5?', null).notes[0].sources;
    answerText = `Zei's class is moved and a bomb hits [summary c5 §1]. Later he wonders why [Summary c5 s1].`;
    const res = await ask(deps(102), { question: 'What happens in chapter 5?' });
    const call = calls.find((c) => c.model === CHAT.model && c.user.startsWith('Reviewed notes'));
    check('a chapter summary is sent as a reviewed note, by its label', Boolean(call?.user.includes('[summary c5 §1]')), call?.user.slice(0, 120));
    const notesPart = call?.user.slice(0, call.user.indexOf('Passages from the book:')) ?? '';
    check('notes are sent without block ids (owner, 2026-11-17: the model cites the note)', notesPart.length > 0 && !/c\d+-b\d+/.test(notesPart), notesPart.slice(0, 120));
    check('an answer citing a note by its label is kept, the label in any spelling', res.state === 'answer' && res.dropped === 0 && res.parts.filter((p) => p.type === 'note').length === 2, JSON.stringify(res).slice(0, 200));
    check('a note citation shows the blocks the note rests on', res.state === 'answer' && res.noteCites?.[0]?.label === 'summary c5 §1' && src.every((id) => res.quotes.some((q) => q.id === id)) && res.noteCites[0].sources.length === src.length, res.state === 'answer' ? JSON.stringify(res.noteCites) : '');
    check('it carries the summary notes line', res.state === 'answer' && JSON.stringify(res.notes) === JSON.stringify([NOTE_WORDING.summary]), res.state === 'answer' ? JSON.stringify(res.notes) : res.state);
    const seen = supportSeen[supportSeen.length - 1] ?? '';
    check('the support check sees the cited note, and no passage for it', seen.includes('CITED NOTES') && seen.includes('[summary c5 §1]') && /CITED PASSAGES:\n\(none\)/.test(seen), seen.slice(0, 200));
  }
  {
    // A Learn more character: the whole text goes, the later part included; the notes line names it.
    calls.length = 0;
    const later = routeQuestion('Who is Bai?', null).notes.find((n) => n.label === 'learn-more bai later')!;
    answerText = `Later she leaves [learn-more bai later].`;
    const res = await ask(deps(114), { question: 'Who is Bai?' });
    const call = calls.find((c) => c.model === CHAT.model && c.user.startsWith('Reviewed notes'))!;
    check('a Learn more character\'s later part is sent', call.user.includes('[learn-more bai later]') && later.sources.length > 0);
    check('the Learn more notes line names the character', res.state === 'answer' && res.notes?.[0] === NOTE_WORDING.learnMore('Bai', false), res.state === 'answer' ? JSON.stringify(res.notes) : res.state);
  }
  {
    // "Where was I" with no chapter known: which chapter? No message is spent, no model is called.
    calls.length = 0;
    const before = (await sql`select count(*)::int as n from studio.chat_calls where fid = 115`)[0].n;
    const res = await ask(deps(115), { question: 'where was I?' });
    const after = (await sql`select count(*)::int as n from studio.chat_calls where fid = 115`)[0].n;
    check('"where was I" with no chapter asks which, spending nothing', res.state === 'which' && before === after && calls.length === 0, res.state);
    answerText = 'Commentary.';
    await ask(deps(115), { question: 'where was I?', position: 8 });
    const call = calls.find((c) => c.model === CHAT.model && c.user.startsWith('Reviewed notes'))!;
    check('"where was I" at chapter 8 sends chapters 6 to 8', ['c6', 'c7', 'c8'].every((c) => call.user.includes(`[summary ${c} §1]`)) && !call.user.includes('[summary c9'));
  }
  {
    // The whole book (owner, 2026-11-17): each chapter's first summary section as written, no model, no message used.
    calls.length = 0;
    const before = (await sql`select count(*)::int as n from studio.chat_calls where fid = 116`)[0].n;
    const res = await ask(deps(116), { question: 'What is the book about?' });
    const after = (await sql`select count(*)::int as n from studio.chat_calls where fid = 116`)[0].n;
    check('the whole book is answered with every chapter\'s first summary section', res.state === 'book' && res.chapters.length === 32 && res.chapters.every((c, i) => c.n === i + 1 && c.text.length > 40), res.state);
    check('the whole book points to the passages each summary rests on', res.state === 'book' && res.chapters.every((c) => c.sources.slice(0, 2).some((id) => res.quotes.some((q) => q.id === id))), res.state === 'book' ? `${res.quotes.length} quotes` : '');
    check('the whole book calls no model and uses no message', calls.length === 0 && before === after, `${calls.length} calls`);
    const again = await ask(deps(116), { question: 'Summarize the whole book' });
    check('"summarize the whole book" is the same answer', again.state === 'book');
  }
  {
    // Answers with and without reviewed notes run at 0.4 (owner, 2026-11-17: back to 0.4 after the 0.2 trial).
    const temps: number[] = [];
    const spy: Complete = async (model, messages, opts) => {
      if (model === CHAT.model && messages[messages.length - 1].content.includes('Question:')) temps.push(opts.temperature);
      return complete(model, messages, opts);
    };
    answerText = 'Commentary.';
    await ask({ ...deps(117), complete: spy }, { question: 'What happens in chapter 3?' });
    await ask({ ...deps(117), complete: spy }, { question: 'How does voting on buildings work in Veridia?' });
    check('answers run at 0.4, with notes or without', NOTES_TEMPERATURE === 0.4 && temps[0] === 0.4 && temps[1] === 0.4, JSON.stringify(temps));
  }
  {
    // "Where was I" (owner, 2026-11-17): one sentence for each earlier chapter, a paragraph for the current one, 180 words.
    const para = (n: number) => `Chapter ${n} – ${'word '.repeat(40)}first [c${n}-b1]. ${'more '.repeat(40)}second [c${n}-b2]. ${'last '.repeat(20)}third.`;
    const raw = [6, 7, 8].map(para).join('\n\n');
    const fit = fitWords(raw, 180, 3);
    const ps = fit.split('\n\n');
    check('a recap is held to 180 words', countWords(raw) > 180 && countWords(fit) <= 180, `${countWords(raw)} -> ${countWords(fit)}`);
    check('each earlier chapter keeps one sentence, with its citation', ps.length === 3 && [0, 1].every((i) => ps[i].endsWith(`first [c${6 + i}-b1].`)), ps.slice(0, 2).join(' | ').slice(0, 120));
    check('the current chapter keeps more than one sentence', ps[2]?.includes('first [c8-b1].') && ps[2].includes('second [c8-b2].'), ps[2]?.slice(0, 80));
    check('a recap in another shape is cut to an equal share', countWords(fitWords(raw.replace(/\n\n/g, ' '), 180, 3)) <= 180);
    const runOn = [6, 7].map((n) => `Chapter ${n} – ${'long '.repeat(75)}only [c${n}-b1].`).concat(`Chapter 8 – ${'now '.repeat(60)}here [c8-b1]. ${'then '.repeat(20)}after.`).join('\n\n');
    const tight = fitWords(runOn, 180, 3);
    check('long earlier sentences never push a recap past 180 words; the current chapter stays', countWords(tight) <= 180 && tight.includes('here [c8-b1].') && tight.includes('only [c7-b1].'), `${countWords(tight)} words`);
    const wide = fitWords(`Chapter 6 – One. 【c6-b1】 ${'x '.repeat(80)}two.\n\nChapter 7 – Three. 【c7-b1】 ${'y '.repeat(80)}four.\n\nChapter 8 – Five [c8-b1]. Six.`, 180, 3);
    check('a citation in 【】 after a full stop stays with its sentence', wide.includes('One. 【c6-b1】') && wide.includes('Three. 【c7-b1】') && !wide.includes('two.'), wide.slice(0, 60));
    check('a short single paragraph is unchanged', fitWords('Chapter 1 – Short [c1-b1].', 180) === 'Chapter 1 – Short [c1-b1].');
    answerText = raw;
    const res = await ask(deps(118), { question: "Where was I? I'm on chapter 8." });
    const shown = res.state === 'answer' ? res.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') : '';
    check('"where was I" answers are shown within 180 words', res.state === 'answer' && countWords(shown) <= 180, `${res.state} ${countWords(shown)}`);
  }
  {
    // An attached block from a later chapter is used, not refused.
    const res = await ask(deps(103), { question: 'What does Deluin say?', attached: ['c14-b97'] });
    check('an attached block from any chapter is accepted', res.state !== 'declined', res.state);
    await ask(deps(103), { question: 'What does Deluin say?', attached: ['not-a-block'] }).then(
      () => failures.push('an attached id that is not a block was accepted'),
      (e) => check('an attached id that is not a block is refused', e instanceof AskError),
    );
  }
  {
    calls.length = 0;
    guardText = 'VIOLATION writes a caption';
    answerText = 'Deluin sat there with tea; he waved at Zei, who came running [c14-b102].';
    const res = await ask(deps(104), { question: 'Fix my caption' });
    check('a flagged answer is not shown', res.state === 'declined', res.state);
    guardText = 'OK';
    const answers = calls.filter((c) => c.model === CHAT.model && c.user !== 'Fix my caption');
    check('a flagged answer is regenerated once before it is declined', answers.length === 2, String(answers.length));
    check('the retry carries the reminder with the guard\'s reason', answers[1]?.user === 'REMINDER: writes a caption', answers[1]?.user);
  }
  {
    calls.length = 0;
    guardQueue = ['VIOLATION reads as description', 'OK'];
    answerText = 'The courtyard matters because Deluin chooses it [c14-b102].';
    const res = await ask(deps(107), { question: 'Why the courtyard?' });
    check('a flagged answer that passes on the retry is shown', res.state === 'answer' && res.regenerated, res.state);
    const [{ n }] = await sql`select count(*)::int as n from studio.chat_calls where fid = 107 and kind = 'ask'`;
    check('a regenerated answer counts as one question', n === 1, String(n));
    guardQueue = [];
  }
  {
    // An empty verdict is asked again once; then the answer is shown unchecked ("none").
    calls.length = 0;
    guardQueue = ['', 'OK'];
    const res = await ask(deps(108), { question: 'Gladias vote' });
    check('an empty guard verdict is retried once', res.state === 'answer' && calls.filter((c) => c.model === CHAT.guardModel && c.user.startsWith('USER REQUEST')).length === 2);
    guardQueue = [];
  }

  {
    // The search words: the model sees the question alone (no passages), and its words widen the search.
    calls.length = 0;
    searchText = 'Jahen orphan grandmother';
    answerText = 'Commentary.';
    await ask(deps(109), { question: 'Who raised her?' });
    const search = calls.find((c) => c.user === 'Who raised her?');
    check('the search-words call sees only the question', Boolean(search));
    const answerCall = calls.find((c) => c.model === CHAT.model && c.user.startsWith('Passages'))!;
    check('the search words widen what is sent', /Jahen/.test(answerCall.user));
    const [{ n }] = await sql`select coalesce(sum(calls), 0)::int as n from studio.chat_costs where kind = 'search'`;
    check('the search-words call is counted in the cost totals', n >= 1, String(n));
    searchText = '';
  }

  {
    // A misspelled glossary word: searched and asked about as the book spells it, and its entry pointed to.
    calls.length = 0;
    answerText = 'Commentary.';
    const res = await ask(deps(113), { question: 'tell me about minpetai' });
    const answerCall = calls.find((c) => c.model === CHAT.model && c.user.startsWith('Passages'))!;
    check('the model is asked about the word as the book spells it', answerCall.user.endsWith('Question: tell me about Minpentai'), answerCall.user.slice(-60));
    check('the passages sent mention it', /Minpentai/.test(answerCall.user.split('Question:')[0]));
    check('the reply points to its glossary entry', res.state === 'answer' && res.glossary?.[0]?.slug === 'minpentai', JSON.stringify(res).slice(0, 200));
  }

  {
    // The second guard question: an unsupported answer becomes "the passages don't say".
    const r1 = await retrieve(sql, 'Why is Gladias asked to rate a building?');
    const real = r1.passages[0].id;
    answerText = `He is chosen because he is the emperor [${real}].`;
    supportQueue = ['UNSUPPORTED the emperor claim'];
    const res = await ask(deps(110), { question: 'Why is Gladias asked to rate a building?' });
    check('an unsupported answer is not shown', res.state === 'unsupported', res.state);
    const [{ content }] = await sql`select content from studio.text_blocks where chapter = ${Number(real.slice(1, real.indexOf('-')))} and idx = ${Number(real.split('-b')[1])}`;
    const seen = supportSeen[supportSeen.length - 1] ?? '';
    check('the support check sees the stored text of the cited block', seen.includes(String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)));
    supportQueue = ['', ''];
    const res2 = await ask(deps(111), { question: 'Why is Gladias asked to rate a building?' });
    check('no verdict from the support check fails closed', res2.state === 'unsupported', res2.state);
    supportQueue = [];
    const res3 = await ask(deps(112), { question: 'Why is Gladias asked to rate a building?' });
    check('a supported answer is shown', res3.state === 'answer', res3.state);

    // Sentence by sentence (owner, 2026-11-18): only the sentences that fail are left out, if two remain and the first
    // still answers the question.
    const other = r1.passages[1].id;
    answerText = `He is chosen at random [${real}]. He is the emperor [${other}]. He looks at the building [${real}].`;
    supportQueue = ['1 SUPPORTED\n2 UNSUPPORTED: the emperor claim\n3 SUPPORTED\nFIRST ANSWERS: YES'];
    const cut = await ask(deps(114), { question: 'Why is Gladias asked to rate a building?' });
    const said = cut.state === 'answer' ? cut.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') : '';
    check('an unsupported sentence is left out and the rest shown', cut.state === 'answer' && cut.cut === 1 && !said.includes('emperor') && said.includes('at random') && said.includes('looks at'), JSON.stringify(cut).slice(0, 300));
    check("the left-out sentence's citation goes with it", cut.state === 'answer' && !cut.parts.some((p) => p.type === 'cite' && p.id === other) && !cut.quotes.some((q) => q.id === other));
    check('the support check is shown the sentences numbered', /\n1\. He is chosen at random/.test(supportSeen[supportSeen.length - 1] ?? '') && /\n3\. He looks/.test(supportSeen[supportSeen.length - 1] ?? ''));
    supportQueue = ['1 UNSUPPORTED: x\n2 SUPPORTED\n3 SUPPORTED\nFIRST ANSWERS: NO'];
    check('the first sentence unsupported: not shown', (await ask(deps(115), { question: 'Why is Gladias asked to rate a building?' })).state === 'unsupported');
    supportQueue = ['1 SUPPORTED\n2 UNSUPPORTED: x\n3 UNSUPPORTED: y\nFIRST ANSWERS: YES'];
    check('only one sentence left: not shown', (await ask(deps(116), { question: 'Why is Gladias asked to rate a building?' })).state === 'unsupported');
    supportQueue = ['1 SUPPORTED\n2 UNSUPPORTED: x\n3 SUPPORTED\nFIRST ANSWERS: NO'];
    check('the first sentence no longer answers the question: not shown', (await ask(deps(117), { question: 'Why is Gladias asked to rate a building?' })).state === 'unsupported');
    supportQueue = ['1 SUPPORTED\n3 SUPPORTED\nFIRST ANSWERS: YES'];
    const gap = await ask(deps(118), { question: 'Why is Gladias asked to rate a building?' });
    check('a sentence with no verdict line counts as unsupported', gap.state === 'answer' && gap.cut === 1);
    supportQueue = ['1 SUPPORTED\n2 SUPPORTED\n3 SUPPORTED\nFIRST ANSWERS: YES'];
    const all = await ask(deps(119), { question: 'Why is Gladias asked to rate a building?' });
    check('every sentence supported: shown whole, nothing cut', all.state === 'answer' && !all.cut);
    check('reply forms: "2. **UNSUPPORTED**" and a bare SUPPORTED', parseSupport('1. SUPPORTED\n2. **UNSUPPORTED** — x\nFIRST ANSWERS: YES', 2)?.unsupported.has(1) === true && parseSupport('SUPPORTED', 3)?.unsupported.size === 0 && parseSupport('', 2) === null);
    supportQueue = [];
  }

  // --- No answer, safety-check or search cost can be joined to a person ------
  {
    const columns = async (t: string) =>
      (await sql`select column_name, data_type, column_default, is_identity from information_schema.columns where table_schema = 'studio' and table_name = ${t}`) as unknown as {
        column_name: string; data_type: string; column_default: string | null; is_identity: string;
      }[];
    const costs = await columns('chat_costs');
    const names = costs.map((c) => c.column_name);
    check('chat_costs has no column naming a person or a request', !names.some((c) => /fid|person|user|account|request|thread/.test(c)), names.join(', '));
    check('chat_costs has no time finer than a date', costs.every((c) => !/time/.test(c.data_type)) && costs.find((c) => c.column_name === 'day')?.data_type === 'date', costs.map((c) => `${c.column_name}:${c.data_type}`).join(', '));
    const numbered = (cs: typeof costs) => cs.filter((c) => c.is_identity === 'YES' || /nextval/.test(c.column_default ?? '')).map((c) => c.column_name);
    check('chat_costs has no row number', numbered(costs).length === 0, numbered(costs).join(', '));
    const calls = await columns('chat_calls');
    check('chat_calls has no row number to order costs against', numbered(calls).length === 0, numbered(calls).join(', '));

    // Two people ask the same question on the same day: the totals grow, the rows don't.
    const rowsBefore = (await sql`select count(*)::int as n from studio.chat_costs`)[0].n;
    const callsBefore = (await sql`select coalesce(sum(calls), 0)::int as n from studio.chat_costs`)[0].n;
    answerText = 'Commentary.';
    await ask(deps(201), { question: 'Gladias vote' });
    const rowsMid = (await sql`select count(*)::int as n from studio.chat_costs`)[0].n;
    await ask(deps(202), { question: 'Gladias vote' });
    const rowsAfter = (await sql`select count(*)::int as n from studio.chat_costs`)[0].n;
    const callsAfter = (await sql`select coalesce(sum(calls), 0)::int as n from studio.chat_costs`)[0].n;
    check('a second person\'s question adds to the totals without adding a row', rowsAfter === rowsMid && callsAfter > callsBefore, `rows ${rowsBefore}→${rowsMid}→${rowsAfter}, calls ${callsBefore}→${callsAfter}`);

    const kinds = (await sql`select distinct kind from studio.chat_calls`).map((r) => r.kind as string);
    check('chat_calls holds only questions', kinds.length === 1 && kinds[0] === 'ask', kinds.join(', '));

    // Code from before 0007 wrote cost rows into chat_calls under the FID: they go to the totals instead.
    const spentBefore = (await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs`)[0].usd;
    await sql`insert into studio.chat_calls (fid, kind, model, provider, request_id, prompt_tokens, completion_tokens, cost_usd, guard)
              values (203, 'answer', ${CHAT.model}, 'groq', 'req_old', 10, 5, 0.001, 'flagged')`;
    const [{ n: kept }] = await sql`select count(*)::int as n from studio.chat_calls where fid = 203`;
    const spentAfter = (await sql`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.chat_costs`)[0].usd;
    check('a cost row written the old way is not kept under the FID', kept === 0, String(kept));
    check('a cost row written the old way is added to the totals', Math.abs(spentAfter - spentBefore - 0.001) < 1e-9, `${spentBefore} → ${spentAfter}`);
    await sql`insert into studio.chat_calls (fid, kind, model, request_id) values (204, 'ask', ${CHAT.model}, 'req_old')`.then(
      () => failures.push('a question row with a request id was accepted'),
      () => check('a question row cannot carry a request id', true),
    );
  }

  // --- Limits ----------------------------------------------------------------
  {
    answerText = 'Commentary.';
    const fid = 105;
    let last = '';
    for (let i = 0; i < CHAT.messagesPerDay + 1; i++) last = (await ask(deps(fid), { question: 'Gladias vote' })).state;
    check(`message ${CHAT.messagesPerDay + 1} in a day is refused`, last === 'limit', last);
    const [{ n }] = await sql`select count(*)::int as n from studio.chat_calls where fid = ${fid} and kind = 'ask'`;
    check(`exactly ${CHAT.messagesPerDay} questions counted`, n === CHAT.messagesPerDay, String(n));
  }
  {
    // Lens and Bluesky accounts' own numbers (src/lib/people.ts: at most -1,000,000,000; step 1 of "the assistant for
    // any account", 2026-11-05): chat_calls (0006, rebuilt in 0007) has no check on fid's sign, fid is bigint, the
    // index is (fid, at), and the limit counts `where fid = $1`, so they are counted as they are, each apart. No migration.
    answerText = 'Commentary.';
    const lens = -1_000_000_007;
    const bsky = -1_000_000_008;
    let last = '';
    for (let i = 0; i < CHAT.messagesPerDay + 1; i++) last = (await ask(deps(lens), { question: 'Gladias vote' })).state;
    check(`a Lens account's message ${CHAT.messagesPerDay + 1} in a day is refused`, last === 'limit', last);
    const [{ n }] = await sql`select count(*)::int as n from studio.chat_calls where fid = ${lens} and kind = 'ask'`;
    check(`exactly ${CHAT.messagesPerDay} of the Lens account's questions counted, under its own number`, n === CHAT.messagesPerDay, String(n));
    const other = await ask(deps(bsky), { question: 'Gladias vote' });
    check('a Bluesky account is counted apart from the Lens account', other.state !== 'limit', other.state);
    await sql`insert into studio.chat_calls (fid, kind, model) values (${'-9223372036854775807'}::bigint, 'ask', ${CHAT.model})`.then(
      () => check('chat_calls takes the smallest bigint (no sign check on fid)', true),
      (e) => failures.push(`chat_calls refused a very negative number: ${(e as Error).message}`),
    );
  }
  {
    // Spend is shared by everyone: fill the day close to the cap with one big recorded call.
    await sql`insert into studio.chat_costs (kind, model, provider, calls, cost_usd) values ('answer', 'spend-test', '', 1, ${CHAT.dailySpendCapUsd - 0.0001})`;
    const res = await ask(deps(106), { question: 'Gladias vote' });
    check('the spend cap stops new questions', res.state === 'spend', res.state);
  }

  // --- What the table holds, and who may change it ---------------------------
  {
    const cols = (await sql`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'chat_calls'`).map((r) => r.column_name as string);
    check('chat_calls has no column for message text', !cols.some((c) => /question|reply|text|content|message|block/.test(c)), cols.join(', '));
  }

} finally {
  await sql.end();
  await server.stop();
}

// The owner's conditions for the hosted model, and logging that can't carry message text.
{
  const o = providerOptions();
  check('every request requires zero data retention', o.gateway.zeroDataRetention === true);
  check('one provider is pinned (Groq, owner 2026-10-07), with no fallback', CHAT.provider === 'groq' && JSON.stringify((o.gateway as { only?: string[] }).only) === '["groq"]');
  check('the assistant serves readers only with the pin and zero retention in place', servingAllowed() === true);
  const reply = { choices: [{ message: { provider_metadata: { gateway: { routing: { resolvedProvider: 'groq', finalProvider: 'groq' } } } } }] };
  check('the serving provider is read from the gateway reply', servedBy(reply) === 'groq');
  for (const f of ['src/app/api/chat/ask/route.ts', 'src/app/api/chat/status/route.ts', 'src/lib/chat/ask.ts', 'src/lib/chat/retrieve.ts']) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    const raw = [...src.matchAll(/console\.\w+\(([^)]*)\)/g)].filter((m) => /\b(e|err|error|input|question|body|messages)\b(?!\s+as)/.test(m[1].replace(/\(e as [^)]*\)/g, '')));
    check(`${f} logs no raw error or message`, raw.length === 0, raw.map((m) => m[0]).join(' | '));
  }
}

// Who may change the table: on PGlite directly, as studio_writer (the socket's shared session can reset its role).
await pg.exec('reset role');
for (const [what, stmt] of [
  ['update chat_calls', 'update studio.chat_calls set model = \'x\''],
  ['delete from chat_calls', 'delete from studio.chat_calls'],
  ['truncate chat_calls', 'truncate studio.chat_calls'],
  ['delete from chat_costs', 'delete from studio.chat_costs'],
  ['truncate chat_costs', 'truncate studio.chat_costs'],
]) {
  await pg.exec('set role studio_writer');
  try {
    await pg.exec(stmt);
    failures.push(`studio_writer could ${what}`);
  } catch (e) {
    check(`studio_writer cannot ${what}`, /permission denied/.test((e as Error).message), (e as Error).message);
  } finally {
    await pg.exec('reset role');
  }
}

if (failures.length) {
  console.error(`chat tests FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`chat tests passed: ${passed} checks`);
