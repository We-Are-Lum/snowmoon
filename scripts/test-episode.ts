/**
 * Episode 1: the opening (branch episode1-opening, 2026-11-24), its rules and its server code.
 *
 *   npm run test:episode
 *
 * - the dates: 1 Dec 00:00 Pacific in, 14 Dec 23:59 in, 15 Dec 00:00 out; nothing opens while EPISODE.public is off;
 *   no wording file writes a date itself;
 * - readOutline: what Submit takes and what it refuses (counts, empty halves, lengths, the line, pictures, the sample
 *   deck's words, with a planted sample);
 * - the AI comment's reply check (owner, answer 5): quoted new wording of six words or more is held back; the person's own
 *   words quoted back, and short quotes, are not; a planted check that lets everything through fails;
 * - on PGlite with every migration and NEXT_episode_outlines.sql, as studio_writer: Submit (three live each, the
 *   account check's decisions, pictures published or not), Withdraw, Hide, the list newest first without withdrawn
 *   or hidden ones, a person's own, the picture picker;
 * - P5g and P5i over the challenge's code (Episode 1's files included), with a planted shuffle of a part of the
 *   outlines that must fail; the list of challenges in date order; no character can be named "episode-1" or "remix".
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { CHALLENGE, EPISODE } from '../src/lib/config';
import { episodePhase, moveCard, quotesNewWording, readOutline, submissionsOpen, type Outline } from '../src/lib/challenge/episode/rules';
import { challengeItems, showChallengeList } from '../src/lib/challenge/episode/challenges';
import { CHALLENGE_FILES, P5I_FILES, p5gProblems, p5iProblems } from './lib/p5g';
import { p6aeProblems } from './lib/episode';
import { PRIVACY, TERMS } from '../src/lib/legal';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) passed++;
  else failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

// Dates.
const wall = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
check('opens Tue 1 Dec 2026, 00:00 Pacific', wall(EPISODE.dates.opens) === '01/12/2026, 00:00', wall(EPISODE.dates.opens));
check('closes after 14 Dec: 15 Dec 2026, 00:00 Pacific is the first instant out', wall(EPISODE.dates.closes) === '15/12/2026, 00:00', wall(EPISODE.dates.closes));
const at = (s: string) => new Date(s);
check('phase: 30 Nov 23:59 PT is before', episodePhase(at('2026-12-01T07:59:00Z')) === 'before');
check('phase: 1 Dec 00:00 PT is open', episodePhase(at('2026-12-01T08:00:00Z')) === 'open');
check('phase: 14 Dec 23:59 PT is open', episodePhase(at('2026-12-15T07:59:00Z')) === 'open');
check('phase: 15 Dec 00:00 PT is closed', episodePhase(at('2026-12-15T08:00:00Z')) === 'closed');
check('Submit is closed in the window while the switch is off', !submissionsOpen(at('2026-12-05T12:00:00Z'), false));
check('Submit is open in the window with the switch on', submissionsOpen(at('2026-12-05T12:00:00Z'), true));
check('the switch is off on this branch (the owner turns it on)', EPISODE.public === false);
const DATE_WORDS = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b20\d\d-\d\d-\d\d/;
for (const f of ['src/lib/challenge/episode/wording.ts', 'src/components/challenge-episode-views.tsx', 'src/components/challenge-episode-make.tsx', 'src/components/challenge-list.tsx']) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  check(`${f} writes no date itself (they come from EPISODE.dates)`, !DATE_WORDS.test(code), code.match(DATE_WORDS)?.[0]);
}
check('the sample deck is empty until the owner writes it', EPISODE.sampleDeck.length === 0);

// readOutline.
const C = (happens: string, does: string, picture: string | null = null) => ({ happens, does, picture });
const ok = readOutline({ title: '  My  opening ', cards: [C('Zei laughs off the drone', 'we like him straight away'), C('b', 'c')], minuteAfter: 1 });
check('a good outline is taken, its spaces tidied', ok.ok && ok.outline.title === 'My opening' && ok.outline.cards.length === 2 && ok.outline.minuteAfter === 1);
const why = (x: unknown) => {
  const r = readOutline(x);
  return r.ok ? '' : r.problems.map((p) => p.why).join(' | ');
};
check('refused: no cards', /at least one/.test(why({ cards: [], minuteAfter: 0 })));
check('refused: eleven cards', /Up to 10/.test(why({ cards: Array.from({ length: 11 }, () => C('a', 'b')), minuteAfter: 1 })));
check('refused: an empty half', /both halves/.test(why({ cards: [C('a', '  ')], minuteAfter: 1 })));
check('refused: 121 characters', /120/.test(why({ cards: [C('x'.repeat(121), 'b')], minuteAfter: 1 })));
check('taken: 120 characters', why({ cards: [C('x'.repeat(120), 'b')], minuteAfter: 1 }) === '');
check('refused: a title over 80', /title/.test(why({ title: 'x'.repeat(81), cards: [C('a', 'b')], minuteAfter: 1 })));
check('refused: the line past the last card', /line/.test(why({ cards: [C('a', 'b')], minuteAfter: 2 })));
check('refused: no line given', /line/.test(why({ cards: [C('a', 'b')] })));
check('taken: the line before card 1', why({ cards: [C('a', 'b')], minuteAfter: 0 }) === '');
check('refused: a picture that is not a version id', /picture/.test(why({ cards: [C('a', 'b', 'nope')], minuteAfter: 1 })));
const sample = [{ happens: 'A sample card, what happens', does: 'A sample card, what it does' }];
const s1 = readOutline({ cards: [C('a sample card what happens!', 'mine')], minuteAfter: 1 }, sample);
check("refused: a card still holding the sample deck's words (case and punctuation aside)", !s1.ok && /sample/.test(s1.problems[0].why));
const s2 = readOutline({ cards: [C('A sample card, what happens next', 'mine')], minuteAfter: 1 }, sample);
check('taken: words of ones own that start like the sample', s2.ok);
const plantedSample = readOutline({ cards: [C('A sample card, what happens', 'x')], minuteAfter: 1 }, []);
check('proof: without the sample deck, the same card is taken (the rule reads the deck)', plantedSample.ok);
const m = moveCard({ title: '', cards: [C('1', 'a'), C('2', 'b'), C('3', 'c')], minuteAfter: 1 }, 0, 2);
check('moveCard: card 1 to the end; the line stays after the first card', m.cards.map((c) => c.happens).join('') === '231' && m.minuteAfter === 1);

// The reply check.
const outline: Outline = { title: 'Drone day', cards: [C('Zei laughs off the drone', 'we like him straight away'), C('The match starts', 'we lean in')], minuteAfter: 1 };
const blocked = (s: string) => quotesNewWording(s, outline) !== null;
check('held back: a quoted new card line of six words', blocked('Card 2 could be stronger. Try "Zei dives under the falling drone net" instead.'));
check('held back: curly quotes', blocked('Maybe “the crowd goes silent as Zei steps forward” would work.'));
check('held back: a label then new wording, no quotes', blocked('What happens: Zei hides the broken drone from his coach before the match'));
check('held back: "Try:" then new wording', blocked('- Try: open on the empty arena at dawn before anyone arrives'));
check('shown: the person\'s own card quoted back', !blocked('Card 1, "Zei laughs off the drone", is a strong start.'));
check('shown: their own words, case and punctuation aside', !blocked('I like "zei laughs off the drone!" as an opener.'));
check('shown: a short quote', !blocked('The word "lean" in card 2 is vague. What makes us lean in?'));
check('shown: a plain comment with questions', !blocked('The first minute is quick. Goal 3 looks weakest: who do we love by the end, and why? What does card 2 cost Zei?'));
const lenient = (s: string, o: Outline) => (s.length < 0 ? s : quotesNewWording(s, o, 99));
check('proof: a check that needs 99 words lets the quoted line through (so the threshold is what holds it back)', lenient('Try "Zei dives under the falling drone net" instead.', outline) === null);

// The list of challenges.
const items = challengeItems(at('2026-12-02T00:00:00Z'), { remix: true, episode: true });
check('the list: Episode 1 open, the remix challenge past', items.open.map((i) => i.id).join() === 'episode-1' && items.past.map((i) => i.id).join() === CHALLENGE.id);
const later = challengeItems(at('2026-12-20T00:00:00Z'), { remix: true, episode: true });
check('the list after both: past, the latest closed first', later.open.length === 0 && later.past.map((i) => i.id).join() === `episode-1,${CHALLENGE.id}`);
check('the list leaves out a challenge whose switch is off', challengeItems(at('2026-12-02T00:00:00Z'), { remix: true, episode: false }).open.length === 0);
check('/challenge stays the remix home until it closes, then the list', !showChallengeList(at('2026-11-30T07:59:00Z')) && showChallengeList(at('2026-11-30T08:00:00Z')));
check('no challenge character is named "episode-1" or "remix" (their pages are static folders under /challenge)', !CHALLENGE.characters.some((c) => c === 'episode-1' || c === 'remix'));

// P5g and P5i over the challenge's code.
const walk = (dir: string): string[] => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
const files = walk('src').filter((f) => /\.tsx?$/.test(f) && CHALLENGE_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
check("Episode 1's files are under P5g's watch", ['src/lib/challenge/episode/outlines.ts', 'src/components/challenge-episode-list.tsx', 'src/components/challenge-episode-make.tsx'].every((f) => files.some((x) => x.file === f)));
const p5g = p5gProblems(files);
check('P5g passes over the challenge code', p5g.length === 0, p5g.join('; '));
const plantedList = files.map((f) => (f.file === 'src/components/challenge-episode-list.tsx' ? { ...f, text: f.text.replace("import { ShuffledEntries } from './challenge-entries-list';", "import { ShuffledEntries } from './challenge-entries-list';\nimport { shuffleFresh } from '~/lib/challenge/shuffle';\nconst some = (all: unknown[]) => shuffleFresh(all.slice(0, 3));") } : f));
check('proof: a shuffle of part of the outlines, outside the entries list, fails P5g', p5gProblems(plantedList).length > 0);
check("Episode 1's list, views and pages are in P5i's files", ['src/components/challenge-episode-list.tsx', 'src/components/challenge-episode-views.tsx', 'src/app/challenge/episode-1/outlines/page.tsx', 'src/app/challenge/episode-1/o/[id]/page.tsx'].every((f) => P5I_FILES.includes(f)));
const p5iFiles = P5I_FILES.map((f) => ({ file: f, text: read(f) }));
const p5i = p5iProblems(p5iFiles);
check('P5i: no count on the outlines or the list', p5i.length === 0, p5i.join('; '));
const plantedCount = p5iFiles.map((f) => (f.file === 'src/components/challenge-episode-views.tsx' ? { ...f, text: f.text.replace('<p className="ep-more">', '<p className="ep-more">{o.likes} likes') } : f));
check('proof: a like count on an outline fails P5i', p5iProblems(plantedCount).length > 0);

// P6ae: public only once the legal texts describe it and the wording is approved.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const legal = () => ({ terms: clone(TERMS.sections) as { n: number | string; body: (string | string[])[] }[], privacy: clone(PRIVACY.sections) as { n: number | string; body: (string | string[])[] }[] });
check('P6ae: nothing to hold while EPISODE.public is off', p6aeProblems({ on: false, wordingApproved: false, ...legal() }).length === 0);
const today = p6aeProblems({ on: true, wordingApproved: true, ...legal() });
check("P6ae: on with today's texts fails (they don't describe Episode 1 yet)", today.length === 3, today.join('; '));
const drafted = legal();
const draftDoc = read('docs/legal/episode-1-draft.md');
const quoted = (head: string) => {
  const i = draftDoc.indexOf(head);
  const block = draftDoc.slice(i).split('\n').slice(1);
  const start = block.findIndex((l) => l.startsWith('> '));
  const lines: string[] = [];
  for (const l of block.slice(start)) {
    if (!l.startsWith('>')) break;
    lines.push(l.replace(/^> ?/, ''));
  }
  return lines.join(' ');
};
drafted.terms.push({ n: '6f', body: [quoted('## Terms §6f')] });
drafted.privacy.find((x) => String(x.n) === '4')!.body.push(quoted('## Privacy §4'));
drafted.privacy.find((x) => String(x.n) === '7')!.body.push(quoted('After:\n> Groq'));
check('P6ae: on with the drafted lines in place and the wording approved passes', p6aeProblems({ on: true, wordingApproved: true, ...drafted }).length === 0, p6aeProblems({ on: true, wordingApproved: true, ...drafted }).join('; '));
check('P6ae: the wording not approved still fails', p6aeProblems({ on: true, wordingApproved: false, ...drafted }).length === 1);

// The server code, on PGlite.
const pg = new PGlite();
await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await pg.exec(read(`supabase/migrations/${f}`));
const migText = read('supabase/migrations/NEXT_episode_outlines.sql');
const migPart = migText.slice(migText.indexOf('\n-- 2. '), migText.indexOf('\n-- 3. ')).split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
await pg.exec(migPart);
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await pg.exec(`
  insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing;
  insert into studio.entities (id, work_id, kind, name) values ('${U(1)}','snowmoon','character','Zei');
  insert into studio.recipes (id, source, params, created_by_fid) values ('${U(10)}', 'in_app', '{"by_name":"picmaker"}', 900001), ('${U(11)}', 'human_authored', '{}', 900001);
  insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values
    ('${U(20)}','snowmoon','image',900001,null,'published'),
    ('${U(21)}','snowmoon','image',900001,null,'hidden'),
    ('${U(22)}','snowmoon','design',900002,'${U(1)}','published'),
    ('${U(23)}','snowmoon','design',900002,'${U(1)}','published'),
    ('${U(24)}','snowmoon','image',900001,null,'published');
  insert into studio.element_versions (id, element_id, version_no, body, asset_url, recipe_id) values
    ('${U(30)}','${U(20)}',1,'{}','https://pictures.snowmoon.party/a.jpg','${U(10)}'),
    ('${U(31)}','${U(21)}',1,'{}','https://pictures.snowmoon.party/b.jpg','${U(10)}'),
    ('${U(32)}','${U(22)}',1,'{"title":"Zei","by_name":"sheetmaker","views":{"front":{"url":"https://pictures.snowmoon.party/f.jpg","recipe":{"model":"m"}}}}',null,null),
    ('${U(33)}','${U(23)}',1,'{"title":"Zei brought in","views":{"front":{"url":"https://pictures.snowmoon.party/g.jpg"}}}',null,null),
    ('${U(34)}','${U(24)}',1,'{}','https://pictures.snowmoon.party/c.jpg','${U(11)}');`);
const PORT = 54397;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: '127.0.0.1' });
await server.start();
const sql = postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
await sql`set role studio_writer`;
const O = await import('../src/lib/challenge/episode/outlines');
type Sql = Parameters<typeof O.listOutlines>[0];
const S = sql as unknown as Sql;
const OPEN = at('2026-12-05T20:00:00Z');
const passes = async () => ({ why: 'passed' as const, eligible: true, account: 'farcaster' as const });
const good: Outline = { title: 'One', cards: [C('a', 'b', U(30)), C('c', 'd')], minuteAfter: 1 };
const sub = (fid: number, o: Outline = good, opts: Partial<Parameters<typeof O.submitOutline>[4]> = {}) => O.submitOutline(S, fid, 'tester', o, { now: OPEN, pub: true, decide: passes, ...opts });

const pics = await O.picturesByVersion(S, [U(30), U(31), U(32), U(33), U(34)]);
check('pictures: a published picture made here, and a sheet whose front has a recipe, can be attached', pics.has(U(30)) && pics.has(U(32)) && pics.get(U(32))!.href === `/references/designs/${U(32)}` && pics.get(U(30))!.href === `/image/${U(30)}`);
check("pictures: a hidden one, a brought-in one and a sheet without a recipe can't", !pics.has(U(31)) && !pics.has(U(34)) && !pics.has(U(33)));
const r1 = await sub(901);
check('Submit: an outline is written', r1.ok && r1.left === 2, JSON.stringify(r1));
check('Submit: refused while the switch is off', !(await sub(901, good, { pub: false })).ok);
check('Submit: refused before the window', !(await sub(901, good, { now: at('2026-11-30T12:00:00Z') })).ok);
check('Submit: refused after the window', !(await sub(901, good, { now: at('2026-12-15T08:00:00Z') })).ok);
const hiddenPic = await sub(901, { ...good, cards: [C('a', 'b', U(31))] });
check('Submit: refused with a hidden picture', !hiddenPic.ok && hiddenPic.status === 400);
const below = await sub(902, good, { decide: async () => ({ why: 'below' as const, eligible: false, account: 'farcaster' as const }) });
check("Submit: refused when the account didn't pass, and nothing kept", !below.ok && below.status === 403 && (await sql`select count(*)::int as n from studio.challenge_outlines where fid = 902`)[0].n === 0);
const unchecked = await sub(902, good, { decide: async () => ({ why: 'unchecked' as const, eligible: false, account: 'farcaster' as const }) });
check("Submit: the check couldn't be reached is 503", !unchecked.ok && unchecked.status === 503);
const none = await sub(-5, good, { decide: async () => null });
check('Submit: an account that can never be checked is refused', !none.ok && none.status === 403);
const admin = await sub(6786, good, { decide: async () => ({ why: 'admin' as const, eligible: false, account: 'farcaster' as const }) });
check('Submit: an admin may submit, marked as admin', admin.ok && (await O.listOutlines(S)).some((o) => o.byFid === 6786 && o.admin));
await sub(901);
await sub(901);
const fourth = await sub(901);
check('Submit: a fourth live outline is refused', !fourth.ok && fourth.status === 409);
const mine = await O.myOutlines(S, 901);
check('mine: three live, none left', mine.ids.length === 3 && mine.left === 0);
const w = await O.withdrawOutline(S, 901, mine.ids[0], { now: OPEN, pub: true });
check('Withdraw: one of mine, one left again', w.ok && w.left === 1);
check('Withdraw: then another can be submitted', (await sub(901)).ok);
check("Withdraw: someone else's is not found", !(await O.withdrawOutline(S, 902, mine.ids[1], { now: OPEN, pub: true })).ok);
check('Withdraw: refused after the window', !(await O.withdrawOutline(S, 901, mine.ids[1], { now: at('2026-12-16T00:00:00Z'), pub: true })).ok);
const h = await O.hideOutline(S, 6786, mine.ids[1], OPEN);
check('Hide: a moderator hides one', h.ok);
const list = await O.listOutlines(S);
check('the list: no withdrawn or hidden outline', !list.some((o) => o.id === mine.ids[0] || o.id === mine.ids[1]));
check('the list: newest first', list.every((o, i) => i === 0 || Date.parse(list[i - 1].submittedAt) >= Date.parse(o.submittedAt)));
const one = await O.getOutline(S, r1.ok ? r1.id : '');
check('one outline: its cards, its line, its picture shown', one !== null && one.cards.length === 2 && one.minuteAfter === 1 && one.cards[0].pic?.versionId === U(30) && one.cards[1].pic === null);
check('one outline: a withdrawn one reads as withdrawn', (await O.getOutline(S, mine.ids[0]))?.withdrawn === true);
await pg.exec(`update studio.elements set status = 'hidden' where id = '${U(20)}'`);
check('a picture hidden after Submit: the card shows no picture, the outline stays', (await O.getOutline(S, r1.ok ? r1.id : ''))?.cards[0].pic === null);
const choices = await O.pictureChoices(S, 'mine', 900002);
check("the picker: 'mine' offers only what may be attached", choices.length === 1 && choices[0].versionId === U(32));
check("the picker: 'mine' signed out offers nothing", (await O.pictureChoices(S, 'mine', null)).length === 0);

await sql.end();
await server.stop();
console.log(`test:episode: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
process.exit(0);
