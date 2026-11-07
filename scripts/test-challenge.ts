/**
 * The remix challenge (owner, 2026-10-31; docs/proposals/remix-challenge-plan.md, branch remix-challenge). Stand-ins
 * only: no network (every network call goes to a recording stand-in), no paid call, no production database (an
 * in-memory Postgres, PGlite, with every migration including 0033_remix_challenge.sql). Fails (exit 1) on any problem.
 *
 *   npm run test:challenge
 *
 * Each rule is also proven to fail on a planted violation ("proof: …" lines): the check is run on a bad input and
 * must report it.
 * - Eligibility (decided once at publish and stored; pages never ask Neynar): invited, or a Neynar score at or above the
 *   threshold; refused: below it, no score, a wallet account, admins. The spend cap ($15 in the window, $2 outside),
 *   sheets opening only in the window and once Privacy says so, the rules copy (forks only, three entrants, no bounty,
 *   the mint as a plan), and the count of distinct entrants per character.
 * - Submit (owner, 2026-11-04): a remix is an entry only once its maker submits it, with a post link (checked as "Add
 *   where you posted it" checks it); up to three per person across all characters, the 4th refused under a lock;
 *   withdraw until entries close, which doesn't give back that day's submission (0038_challenge_daily.sql); the minimum is three different people who
 *   submitted (three by one person count once); the equal share is per person.
 * - Free remixes (owner, 2026-11-04): three a day for an account that passes the check, counted as remixes (a sheet's
 *   three views, up to six pictures, so a failed view is made again inside it), not pictures; a closed remix counts
 *   three; admins and invited makers keep counting pictures (0037_remix_count.sql; without it, as before).
 * - The window's edges, in Pacific time, from CHALLENGE.dates; every date shown is built from it, and no page or
 *   wording file writes a date itself.
 * - The post address: the exact host allow-list; look-alike hosts, sub-domains, IPs, other schemes, ports and user
 *   name tricks are refused.
 * - The server never fetches the pasted address: every request goes to an API host, and a request elsewhere is refused.
 * - A post that doesn't link to the version's page is refused.
 * - "Posted on" holds no image, avatar, embed or script.
 * - The three bases (owner, 2026-11-03): a fork of each base counts, a fork of an entry counts, a sheet from scratch
 *   and a fork of a sheet that isn't a base don't; nothing breaks while the bases are empty (as before).
 * - The migration (0033, applied 2026-11-01, with 0038_challenge_daily): RLS, privileges, no score; submissions and
 *   posts work; without the tables, nothing breaks.
 */
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { ADMINS, CHALLENGE, IMAGES } from '../src/lib/config';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
/** A proof: the rule, run on a planted violation, must report it. */
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted violation was not caught');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) ? [`${dir}/${d.name}`] : []));
}

const R = await import('../src/lib/challenge/rules');
const L = await import('../src/lib/challenge/post-links');
// Entries as pictures are on as committed (owner's reread, 2026-11-06); scripts/test-challenge-moments.ts tests them.
// This file tests the contest's sheet path, which stays in the code for when the switch is off, so it turns it off.
check('committed: entries are pictures (CHALLENGE.pictureEntries on, after the owner\'s reread of 2026-11-06)', CHALLENGE.pictureEntries === true);
CHALLENGE.pictureEntries = false;

// --- The owner's switch (owner, 2026-11-04: "/challenge is admin-only for now"; nothing opens by date alone) ------
// With CHALLENGE.public off (as committed) and the clock inside the window, nothing the dates used to switch on is on:
// entries, open sheets, the $15 cap, the challenge share text; and only admins may see the challenge.
{
  const C = await import('../src/lib/config');
  const O = await import('../src/lib/challenge/open-sheets');
  const { PRIVACY } = await import('../src/lib/legal');
  const V = await import('../src/lib/challenge/visibility');
  const inside = new Date(Date.parse(CHALLENGE.dates.opens) + 3600_000);
  check('switch: CHALLENGE.public is off as committed (the owner opens it)', CHALLENGE.public === false);
  check('switch: the dates are kept (opens Fri 6 Nov, 09:00 Pacific; owner, 2026-11-05 evening)', CHALLENGE.dates.opens === '2026-11-06T17:00:00Z');
  check('switch off, inside the window: the free cap stays $2, not $15', C.imagesDailySpendCapUsd(inside) === IMAGES.dailySpendCapUsd && IMAGES.dailySpendCapUsd === 2);
  check('switch off, inside the window: sheets stay invited-only (Privacy describes the challenge)', O.privacyDescribesChallenge(PRIVACY) && !O.challengeSheetsOpen(inside, PRIVACY));
  check('switch off, inside the window: entries are not taken', !R.entriesOpen(inside) && !R.challengeOpenNow(inside));
  check('switch off: only admins may see the challenge', !V.challengeVisibleTo(null) && !V.challengeVisibleTo(501) && !V.challengeVisibleTo(6852) && ADMINS.every((a) => V.challengeVisibleTo(a)));
  check('switch on, inside the window: the same functions open (so the switch is what holds them)', R.challengeOpenNow(inside, true) && R.entriesOpen(inside, true) && O.challengeSheetsOpen(inside, PRIVACY, true) && V.challengeVisibleTo(501, true));
  proof('a cap that rises by date alone is caught', ((t: Date) => (t.getTime() >= Date.parse(CHALLENGE.dates.opens) && t.getTime() < Date.parse(CHALLENGE.dates.closes) ? 15 : 2))(inside) !== C.imagesDailySpendCapUsd(inside));
  proof('sheets that open by date alone are caught', ((t: Date) => CHALLENGE.openSheets && R.phase(t) === 'open' && O.privacyDescribesChallenge(PRIVACY))(inside) !== O.challengeSheetsOpen(inside, PRIVACY));
  proof('entries that open by date alone are caught', ((t: Date) => CHALLENGE.entries && R.phase(t) === 'open')(inside) !== R.entriesOpen(inside));
  // Every way in: the page and the APIs answer 404 to everyone but an admin; the menu, the home row, the sheet page's
  // lines, "Posted on" and the share text wait for the switch.
  const gated: [string, RegExp][] = [
    ['src/app/challenge/page.tsx', /if \(!CHALLENGE\.public\) notFound\(\);/],
    ['src/app/challenge/page.tsx', /if \(!CHALLENGE\.public\) return \{ robots: \{ index: false, follow: false \} \};/],
    ['src/app/api/challenge/submit/route.ts', /const hidden = \(fid: number \| null\) => \(challengeVisibleTo\(fid\) \? null : NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)\);/],
    ['src/app/challenge/rules/page.tsx', /if \(!CHALLENGE\.public\) notFound\(\);/],
    ['src/app/challenge/remixes/page.tsx', /if \(!CHALLENGE\.public\) notFound\(\);/],
    ['src/app/challenge/entries/page.tsx', /if \(!CHALLENGE\.public\) notFound\(\);/],
    ['src/app/challenge/entries/page.tsx', /if \(!CHALLENGE\.public\) return \{ robots: \{ index: false, follow: false \} \};/],
    ['src/app/challenge/rules/page.tsx', /if \(!CHALLENGE\.public\) return \{ robots: \{ index: false, follow: false \} \};/],
    ['src/app/challenge/remixes/page.tsx', /if \(!CHALLENGE\.public\) return \{ robots: \{ index: false, follow: false \} \};/],
    ['src/app/api/challenge/view/route.ts', /if \(!challengeVisibleTo\(fid\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/],
    ['src/app/api/challenge/standing/route.ts', /if \(!challengeVisibleTo\(fid\)\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/],
    ['src/app/page.tsx', /\.\.\.\(CHALLENGE\.public \? \[\{ href: '\/challenge'/],
    ['src/components/app-shell.tsx', /navItems\(last, adaptations, CHALLENGE\.public \|\| \(auth\.kind === 'signed-in' && isAdmin\(auth\.fid\)\)\)/],
    ['src/app/references/designs/[id]/page.tsx', /const ch = CHALLENGE\.public \? await sheetChallenge\(/],
    ['src/app/references/designs/[id]/page.tsx', /posts=\{CHALLENGE\.public && CHALLENGE\.posts\}/],
    ['src/app/references/designs/[id]/page.tsx', /isChallengeCharacter\(d\.entity\) && challengeOpenNow\(\) \? CW\.shareTextOpen\(callName\)/],
  ];
  // Admins see /challenge/rules and /challenge/remixes too, exactly like /challenge (owner, 2026-11-04).
  for (const d of ['rules', 'remixes']) gated.push([`src/app/challenge/${d}/not-found.tsx`, new RegExp(`<ChallengeAdmin fallback=\\{<NotFound />\\} page="${d}" />`)]);
  gated.push(['src/app/api/challenge/view/route.ts', /page === 'rules' \? await rulesView\(sql\) : page === 'remixes' \? await remixesView\(sql, /]);
  const ungated = gated.filter(([f, re]) => !re.test(read(f))).map(([f]) => f);
  check('switch: every way in is gated (page, APIs, menu, home row, sheet lines, "Posted on", share text)', ungated.length === 0, ungated.join());
  const posts = read('src/app/api/challenge/posts/route.ts');
  const submitRoute = read('src/app/api/challenge/submit/route.ts');
  check('switch: /api/challenge/submit answers 404 to non-admins for GET, POST and DELETE', (submitRoute.match(/const no404 = hidden\(fid\);\s*if \(no404\) return no404;/g) ?? []).length === 3);
  proof('a Submit route that lets a non-admin in is caught', (submitRoute.replace(/const no404 = hidden\(fid\);\s*if \(no404\) return no404;/, '').match(/const no404 = hidden\(fid\);\s*if \(no404\) return no404;/g) ?? []).length !== 3);
  check('switch: /api/challenge/posts answers 404 to non-admins for GET, POST and DELETE', (posts.match(/const no404 = hidden\(person\);\s*if \(no404\) return no404;/g) ?? []).length === 3 && /challengeVisibleTo\(person\) \? null : NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/.test(posts));
  proof('a page that shows the challenge to everyone is caught', !gated[0][1].test(read('src/app/challenge/page.tsx').replace('if (!CHALLENGE.public) notFound();', '')));
  const { navItems } = await import('../src/lib/nav');
  check('switch: the menu has no challenge item unless told to show it', !navItems(1, 0).some((i) => i.href === '/challenge') && navItems(1, 0, true).some((i) => i.href === '/challenge'));
  // Scripts everyone is served carry no challenge words: the share buttons, "Posted on", Submit, the fork form.
  const clientFiles = ['src/components/challenge-share.tsx', 'src/components/posted-on.tsx', 'src/components/challenge-submit.tsx', 'src/components/design-form.tsx', 'src/components/challenge-admin.tsx', 'src/components/challenge-admin-sheet.tsx', 'src/components/challenge-body.tsx', 'src/components/challenge-lines.tsx', 'src/components/challenge-card.tsx', 'src/components/challenge-remix-card.tsx', 'src/components/challenge-entries-list.tsx', 'src/components/challenge-rules-body.tsx', 'src/components/challenge-remixes-body.tsx'];
  const wordy = clientFiles.filter((f) => /challenge\/(landing-)?wording'/.test(read(f)));
  check('switch: no script served to everyone imports the challenge\'s words', wordy.length === 0, wordy.join());
}
// The committed ids (the owner's publish run, 2026-11-06) are checked here. The rest of the suite builds its own bases in
// PGlite, where those ids don't exist, so the lists are cleared for it (it sets its own where it needs them).
{
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const B = CHALLENGE.bases as Record<string, string[]>;
  const F = CHALLENGE.firstRemixes as Record<string, string[]>;
  const D = CHALLENGE.defaultLooks as Record<string, string | null>;
  check('committed bases: one per base slot for each character, each a version id', CHALLENGE.characters.every((c) => B[c].length === CHALLENGE.baseCount[c] && B[c].every((id) => uuid.test(id))), JSON.stringify(B));
  check('committed default looks: each character\'s first base (its current default)', CHALLENGE.characters.every((c) => D[c] === B[c][0]), JSON.stringify(D));
  check('committed first remixes: version ids, never a base', CHALLENGE.characters.every((c) => F[c].every((id) => uuid.test(id) && !B[c].includes(id))), JSON.stringify(F));
  check('committed first remixes: within the limit (firstRemixesProblems finds nothing)', R.firstRemixesProblems().length === 0, R.firstRemixesProblems().join('; '));
  for (const c of CHALLENGE.characters) { B[c] = []; F[c] = []; D[c] = null; }
}
// The tests below are the challenge once the owner has opened it.
(CHALLENGE as { public: boolean }).public = true;

// --- Eligibility -------------------------------------------------------------------------------------------------
const lists = { admins: [6786, 193912], invited: [6786, 6852] };
const el = (maker: number, passed: boolean | null) => R.eligibility({ maker, passed }, lists);
check('an invited FID is eligible without a check', el(6852, null).eligible && el(6852, null).why === 'invited');
check('a passed check is eligible', el(500, true).eligible && el(500, true).why === 'passed');
check('refused: a check below the threshold', !el(500, false).eligible && el(500, false).why === 'below');
check('refused: no decision (Neynar did not answer at publish)', !el(500, null).eligible && el(500, null).why === 'unchecked');
check('refused: a wallet account, even passed (wallets can’t make sheets yet; owner, 2026-10-31)', !el(-7, true).eligible && el(-7, true).why === 'not-a-farcaster-account');
check('refused: an admin, even invited (6786)', !el(6786, true).eligible && el(6786, true).why === 'admin');
check('refused: an admin who passed (193912)', !el(193912, true).eligible && el(193912, true).why === 'admin');
check('the real lists: every admin is refused', ADMINS.every((a) => R.eligibility({ maker: a, passed: true }).why === 'admin'));
check('the challenge\'s own threshold, fixed at 0.7 (CHALLENGE.neynarMinScore), is the one the publish check asks under', CHALLENGE.neynarMinScore === 0.7 && /checkNeynar\(sql, fid, CHALLENGE_LISTS\.min\)/.test(read('src/lib/challenge/record.ts')));
check('the challenge threshold does not follow IMAGES.neynarMinScore', /min: CHALLENGE\.neynarMinScore/.test(read('src/lib/challenge/who.ts')) && !/IMAGES\.neynarMinScore/.test(read('src/lib/challenge/who.ts')));
proof('a threshold read from IMAGES (which may change) is caught', /IMAGES\.neynarMinScore/.test(read('src/lib/challenge/who.ts').replace('CHALLENGE.neynarMinScore', 'IMAGES.neynarMinScore')));
check('a stored decision is read back with the lists applied again (an admin never, invited always, else as decided)', R.fromDecision(193912, 'passed').why === 'admin' && R.fromDecision(6852, null).eligible && R.fromDecision(500, 'passed').eligible && !R.fromDecision(500, 'below').eligible && !R.fromDecision(500, null).eligible);
proof('an admin let through is caught', R.eligibility({ maker: 77, passed: true }, { ...lists, admins: [77] }).why === 'admin' && R.eligibility({ maker: 77, passed: true }, { ...lists, admins: [] }).eligible);
proof('a wallet path let back in is caught', R.eligibility({ maker: -7, passed: true }, lists).eligible === false && el(-7, true).why !== 'passed');

// --- The window, in Pacific time ---------------------------------------------------------------------------------
const D0 = CHALLENGE.dates;
check('opens Fri 6 Nov 2026, 09:00 Pacific', R.pacificWallTime(D0.opens) === '2026-11-06 09:00', R.pacificWallTime(D0.opens));
check('the last minute is Sun 22 Nov 2026, 23:59 Pacific', R.pacificWallTime(new Date(Date.parse(D0.closes) - 60_000).toISOString()) === '2026-11-22 23:59');
const at = (iso: string, deltaMs: number) => new Date(Date.parse(iso) + deltaMs);
check('the opening instant is in', R.inWindow(at(D0.opens, 0)));
check('a millisecond before opening is out', !R.inWindow(at(D0.opens, -1)));
check('23:59:59.999 Pacific on the last day is in', R.inWindow(at(D0.closes, -1)));
check('midnight Pacific after the last day is out', !R.inWindow(at(D0.closes, 0)));
check('the window crosses no clock change (PST throughout): 23:59 Pacific is 07:59 UTC the next day', new Date(Date.parse(D0.closes) - 60_000).toISOString() === '2026-11-23T07:59:00.000Z');
check('dateText builds the deadline from the config', R.dateText('closes', { time: true }) === 'Sunday 22 November, 23:59 Pacific', R.dateText('closes', { time: true }));
check('windowText spans the window', R.windowText() === '6 to 22 November', R.windowText());
// The free spend cap: $15 inside the window, $2 outside, by itself (owner, 2026-10-31).
{
  const C = await import('../src/lib/config');
  check('spend cap: $2 a millisecond before the window opens', C.imagesDailySpendCapUsd(at(D0.opens, -1)) === 2);
  check('spend cap: $15 at the opening instant', C.imagesDailySpendCapUsd(at(D0.opens, 0)) === 15);
  check('spend cap: $15 at 23:59:59.999 Pacific on the last day', C.imagesDailySpendCapUsd(at(D0.closes, -1)) === 15);
  check('spend cap: back to $2 at the close', C.imagesDailySpendCapUsd(at(D0.closes, 0)) === 2);
  check('spend cap: $2 today (before the launch)', C.imagesDailySpendCapUsd(new Date('2026-10-31T20:00:00Z')) === 2);
  check('the base caps are unchanged ($2 outside; IMAGES.invited unchanged)', IMAGES.dailySpendCapUsd === 2 && CHALLENGE.dailySpendCapUsd === 15 && IMAGES.invited.join() === '6786,6852');
  const limits = read('src/lib/images/limits.ts');
  // Three reads: a picture's, a remix's view (owner, 2026-11-04: the cap unchanged for remixes) and the words check's.
  check('the spend check reads the cap through imagesDailySpendCapUsd()', (limits.match(/imagesDailySpendCapUsd\(\)/g) ?? []).length === 3 && !/IMAGES\.dailySpendCapUsd/.test(limits));
  proof('a cap read straight from IMAGES (never $15) is caught', /IMAGES\.dailySpendCapUsd/.test(limits.replace('imagesDailySpendCapUsd()', 'IMAGES.dailySpendCapUsd')));
  proof('a cap that stays at $15 after the close is caught', ((t: Date) => (t.getTime() >= Date.parse(D0.opens) ? 15 : 2))(at(D0.closes, 0)) !== C.imagesDailySpendCapUsd(at(D0.closes, 0)));
}
check('a date moved in the config moves in the text', R.dateText('closes', { time: true }, { ...D0, closes: '2026-11-18T08:00:00Z' }) === 'Tuesday 17 November, 23:59 Pacific');
check('phase: before, open, closed', R.phase(at(D0.opens, -1)) === 'before' && R.phase(at(D0.opens, 0)) === 'open' && R.phase(at(D0.closes, 0)) === 'closed');
proof('a window ending at 23:59 (losing its last minute) is caught', !R.inWindow(at(D0.closes, -1), { opens: D0.opens, closes: new Date(Date.parse(D0.closes) - 60_000).toISOString() }));

// --- No date written into a page or wording file (owner, 2026-10-31) ---------------------------------------------
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const DATE_IN_COPY = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b|\\b${MONTH}\\s+\\d{1,2}\\b|\\b20\\d\\d-\\d\\d-\\d\\d\\b|\\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\\s+\\d`, 'i');
const COPY_FILES = /^src\/app\/challenge\/|^src\/lib\/challenge\/(?!rules\.ts$)|^src\/components\/(challenge-[a-z-]+|posted-on|post-link-field)\.tsx$/;
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function hardCodedDates(files: { file: string; text: string }[]): string[] {
  return files.filter((f) => COPY_FILES.test(f.file)).flatMap((f) => {
    const m = stripComments(f.text).match(DATE_IN_COPY);
    return m ? [`${f.file}: "${m[0]}"`] : [];
  });
}
const copyFiles = walk('src').filter((f) => COPY_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
check('the page and wording files exist', copyFiles.some((f) => f.file === 'src/app/challenge/page.tsx') && copyFiles.some((f) => f.file === 'src/lib/challenge/wording.ts'));
const dated = hardCodedDates(copyFiles);
check('no page or wording file writes a challenge date itself (all from CHALLENGE.dates)', dated.length === 0, dated.join('; '));
proof('a date written into the rules is caught', hardCodedDates([{ file: 'src/lib/challenge/wording.ts', text: "export const X = 'From 6 to 17 November, make your own version';" }]).length === 1);
proof('a weekday-and-date line is caught', hardCodedDates([{ file: 'src/app/challenge/page.tsx', text: '<p>On Friday 20 November we show them</p>' }]).length === 1);
proof('an ISO date in a component is caught', hardCodedDates([{ file: 'src/components/challenge-share.tsx', text: "const until = '2026-11-17';" }]).length === 1);

// --- Submit (owner, 2026-11-04): an entry only when its maker submits it; three per person; three people per character ---
const inW = (min: number) => at(D0.opens, min * 60_000).toISOString();
const cand = (versionId: string, person: number, character: string, minutes: number, forked = true) => ({ versionId, elementId: `e-${versionId}`, character, person, createdAt: inW(minutes), forked });
const sub = (versionId: string, person: number, character: string, minutes = 0) => ({ versionId, person, character, at: inW(minutes) });
const cs = [cand('a1', 500, 'bai', 10), cand('a2', 500, 'bai', 20), cand('a3', 500, 'zei', 5), cand('b1', 501, 'bai', 15), cand('c1', 502, 'bai', 30), cand('o1', 503, 'bai', -1), cand('n1', 504, 'bai', 40, false)];
const ok = (p: number) => p !== 502;
check('S1 nothing is an entry until its maker submits it (publishing alone is not entering)', R.chooseEntries(cs, [], ok).length === 0);
const subs = [sub('a1', 500, 'bai'), sub('a2', 500, 'bai'), sub('b1', 501, 'bai'), sub('c1', 502, 'bai'), sub('o1', 503, 'bai'), sub('n1', 504, 'bai')];
const chosen = R.chooseEntries(cs, subs, ok);
check('S1 a submitted remix is an entry; two of one character by one person are both entries', chosen.map((c) => c.versionId).sort().join() === 'a1,a2,b1', chosen.map((c) => c.versionId).join());
check('S1 an unsubmitted version is not an entry', !chosen.some((c) => c.versionId === 'a3'));
check('S1 entries are newest first', chosen.map((c) => c.versionId).join() === 'a2,b1,a1');
check("S1 a submission of someone else's version is ignored", R.chooseEntries(cs, [sub('b1', 500, 'bai')], ok).length === 0);
check('S1 versions made before the window are not entries, even submitted', !chosen.some((c) => c.versionId === 'o1'));
check('S1 a new sheet that is not a fork is not an entry, even submitted', !chosen.some((c) => c.versionId === 'n1'));
check('S1 an ineligible person has no entry, even submitted', !chosen.some((c) => c.person === 502));
proof('S1 an entry chosen without a submission (the old "latest counts") is caught', ((list: typeof cs) => list.filter((c) => R.isCandidate(c) && ok(c.person)))(cs).length !== R.chooseEntries(cs, [], ok).length);
// The daily rule (branch contest, 2026-11-04, replacing "three in total"): one submission per person per Pacific day, any
// character, no total cap; a withdrawn one still uses its day; each version once while it stands.
{
  const pt = (day: number, hhmm: string) => new Date(`2026-11-${String(day).padStart(2, '0')}T${hhmm}:00-08:00`);
  const at1 = (v: string, person: number, when: Date, withdrawnAt: string | null = null) => ({ versionId: v, person, character: 'bai', at: when.toISOString(), withdrawnAt });
  const d10 = [at1('x1', 700, pt(10, '09:00'))];
  check('S2 one a day: a second the same Pacific day is refused', R.submitRefusal({ person: 700, versionId: 'x2' }, d10, pt(10, '23:59')) === 'today');
  check('S2 the next Pacific day it is allowed (midnight Pacific, not UTC)', R.submitRefusal({ person: 700, versionId: 'x2' }, d10, pt(11, '00:00')) === null && R.submitRefusal({ person: 700, versionId: 'x2' }, [at1('x1', 700, pt(10, '15:00'))], pt(10, '17:30')) === 'today');
  proof('S2 a day counted in UTC is caught', ((now: Date) => d10.filter((x) => x.at.slice(0, 10) === now.toISOString().slice(0, 10)).length)(pt(10, '17:30')) !== R.submittedToday(d10, pt(10, '17:30')));
  const w = [at1('x1', 700, pt(12, '08:00'), pt(12, '08:30').toISOString())];
  check('S2 withdrawing doesn\'t give back that day\'s submission', R.submitRefusal({ person: 700, versionId: 'x2' }, w, pt(12, '20:00')) === 'today');
  proof('S2 a count that leaves out withdrawn submissions is caught', ((theirs: typeof w) => theirs.filter((x) => !x.withdrawnAt).length)(w) !== R.submittedToday(w, pt(12, '20:00')));
  check('S2 a withdrawn version may be submitted again on another day', R.submitRefusal({ person: 700, versionId: 'x1' }, w, pt(13, '10:00')) === null);
  check('S2 a version that stands submitted can\'t be submitted again', R.submitRefusal({ person: 700, versionId: 'x1' }, d10, pt(14, '10:00')) === 'already');
  const many = Array.from({ length: 12 }, (_, k) => at1(`m${k}`, 701, pt(6 + k, '12:00')));
  check('S2 no total cap: twelve days, twelve submissions, and a thirteenth day still allowed', R.submitRefusal({ person: 701, versionId: 'm12' }, many, pt(18, '12:00')) === null && R.distinctSubmissions(many).length === 12);
  check('S2 other people\'s submissions don\'t use your day', R.submitRefusal({ person: 702, versionId: 'z1' }, d10, pt(10, '12:00')) === null);
  check('S2 one a day is the config\'s (CHALLENGE.submissionsPerDay)', CHALLENGE.submissionsPerDay === 1 && !('submissionsPerPerson' in CHALLENGE));
  proof('S2 a planted two-a-day is caught', R.submitRefusal({ person: 700, versionId: 'x2' }, d10, pt(10, '12:00'), 2) !== R.submitRefusal({ person: 700, versionId: 'x2' }, d10, pt(10, '12:00')));
  check('S2 a withdrawn submission is never an entry', R.chooseEntries([cand('x1', 700, 'bai', 1)], w, () => true).length === 0);
}
// The minimum: three different people who submitted for a character; three submissions by one person count once.
const one = R.chooseEntries([cand('p1', 800, 'seila', 1), cand('p2', 800, 'seila', 2), cand('p3', 800, 'seila', 3)], [sub('p1', 800, 'seila'), sub('p2', 800, 'seila'), sub('p3', 800, 'seila')], () => true);
check('S3 three submissions by one person are three entries but one entrant, not enough', one.length === 3 && R.entrantCounts(one).get('seila') === 1 && !R.enoughEntrants(R.entrantCounts(one).get('seila')!));
const people = R.chooseEntries([cand('q1', 810, 'seila', 1), cand('q2', 811, 'seila', 2), cand('q3', 812, 'seila', 3)], [sub('q1', 810, 'seila'), sub('q2', 811, 'seila'), sub('q3', 812, 'seila')], () => true);
check('S3 three different people who submitted are enough', R.entrantCounts(people).get('seila') === 3 && R.enoughEntrants(3));
check('S3 two people and an extra entry by one of them are not enough', !R.enoughEntrants(R.entrantCounts([...people.slice(0, 2), { ...people[0], versionId: 'q1b' }]).get('seila')!));
proof('S3 a minimum counted in submissions (3 by one person passing) is caught', R.enoughEntrants(one.length) !== R.enoughEntrants(R.entrantCounts(one).get('seila')!));
// The equal share is per person, not per submission (owner, 2026-11-04): the data says who, once each.
check('S4 the equal share\'s people: each entrant once, however many entries', [...R.equalSharePeople([...one, ...people])].sort().join() === '800,810,811,812');
proof('S4 a share counted per submission is caught', [...one, ...people].length !== R.equalSharePeople([...one, ...people]).length);

// --- Free remixes (owner, 2026-11-04): count remixes, not pictures; a closed remix counts three -----------------------
{
  const X = await import('../src/lib/images/remixes');
  const lim = { perDay: 3, perRemix: 6 };
  check('F1 the config: 3 remixes a day, 6 pictures a remix, a closed remix counts 3', IMAGES.designs.remixesPerDay === 3 && IMAGES.designs.picturesPerRemix === 6 && IMAGES.designs.closedRemixUnits === 3);
  check('F1 an open remix uses one, a closed remix three (the hook for remix-model-choice)', X.remixUnits({ open: true }) === 1 && X.remixUnits({ open: false }) === 3);
  check('F1 who counts remixes: a passing account, not an admin (perDayFor) or an invited maker, not a wallet', X.countsRemixes(999001) && !X.countsRemixes(ADMINS[0]) && !X.countsRemixes(6852) && !X.countsRemixes(-4));
  // A Bluesky (or Lens) account's number, at or below -1,000,000,000 (owner, 2026-11-04): it counts remixes and is not a wallet.
  check('F1b a Bluesky account counts remixes; a wallet never does', X.countsRemixes(-1_000_000_001) && X.countsRemixes(-1_000_000_000) && !X.countsRemixes(-999_999_999) && !X.countsRemixes(0));
  check('F1b only a wallet number is a wallet', X.isWalletNumber(-4) && X.isWalletNumber(-999_999_999) && !X.isWalletNumber(-1_000_000_000) && !X.isWalletNumber(-1_000_000_001) && !X.isWalletNumber(5));
  {
    const Lm0 = await import('../src/lib/images/limits');
    check('F1b a Bluesky account is not prepaid; a wallet is', Lm0.fundedBy(-1_000_000_001) === 'free' && Lm0.fundedBy(-4) === 'prepaid' && Lm0.fundedBy(500) === 'free');
    const lim0 = read('src/lib/images/limits.ts');
    const walletOnly = (src: string) => /if \(isWalletNumber\(fid\)\) \{\s*const t = tx as unknown as Sql;/.test(src) && !/if \(fid < 0\)/.test(src);
    check('F1b reserve sends only a wallet number to the prepaid path', walletOnly(lim0));
    proof('F1b a reserve that sends every number below zero to the prepaid path is caught', !walletOnly(lim0.replace('if (isWalletNumber(fid)) {', 'if (fid < 0) {')));
  }
  check('F1 admins keep their own picture limit (IMAGES.perDayFor)', ADMINS.every((a) => IMAGES.perDayFor[a] === 300 && !X.countsRemixes(a)));
  check('F2 three open remixes start; the 4th is refused', [0, 1, 2].every((used) => X.remixRefusal({ starts: true, units: 1, used, tries: 0 }, lim) === null) && X.remixRefusal({ starts: true, units: 1, used: 3, tries: 0 }, lim) === 'remix-limit');
  check('F2 a closed remix counts three: alone it fits, after one open remix it is refused', X.remixRefusal({ starts: true, units: 3, used: 0, tries: 0 }, lim) === null && X.remixRefusal({ starts: true, units: 3, used: 1, tries: 0 }, lim) === 'remix-limit');
  check('F2 after a closed remix, no open one starts the same day', X.remixRefusal({ starts: true, units: 1, used: 3, tries: 0 }, lim) === 'remix-limit');
  check('F3 a remix\'s other views, and a view made again after a failure, use no other remix, up to 6 pictures', [1, 2, 3, 4, 5].every((tries) => X.remixRefusal({ starts: false, units: 1, used: 3, tries }, lim) === null) && X.remixRefusal({ starts: false, units: 1, used: 3, tries: 6 }, lim) === 'remix-used');
  check('F3 a remix never started can\'t be continued', X.remixRefusal({ starts: false, units: 1, used: 0, tries: 0 }, lim) === 'remix-used');
  const rows = [
    { remix: 'r1', units: 1, at: '2026-11-07T01:00:00Z' }, { remix: 'r1', units: 1, at: '2026-11-07T01:01:00Z' }, { remix: 'r1', units: 1, at: '2026-11-07T01:02:00Z' },
    { remix: 'r2', units: 3, at: '2026-11-07T02:00:00Z' }, { remix: 'r0', units: 1, at: '2026-11-06T23:00:00Z' }, { remix: 'r0', units: 1, at: '2026-11-07T00:10:00Z' },
  ];
  check('F4 remixes are counted, not pictures: three views of one remix count once; a closed one three; yesterday\'s remix not today', X.remixesUsed(rows, new Date('2026-11-07T00:00:00Z')) === 4);
  proof('F4 a count of pictures (not remixes) is caught', rows.filter((r) => Date.parse(r.at) >= Date.parse('2026-11-07T00:00:00Z')).length !== X.remixesUsed(rows, new Date('2026-11-07T00:00:00Z')));
  proof('F2 a planted 4th remix is caught', X.remixRefusal({ starts: true, units: 1, used: X.remixesUsed([...rows.slice(0, 3), { remix: 'r3', units: 1, at: '2026-11-07T03:00:00Z' }, { remix: 'r4', units: 1, at: '2026-11-07T03:30:00Z' }], new Date('2026-11-07T00:00:00Z')), tries: 0 }, lim) === 'remix-limit');
  proof('F2 a closed remix counted as one is caught', X.remixRefusal({ starts: true, units: 1, used: 1, tries: 0 }, lim) !== X.remixRefusal({ starts: true, units: X.remixUnits({ open: false }), used: 1, tries: 0 }, lim));
  // The sample route passes the model's openness to remixUnits, and every view of a sheet goes through the remix path.
  const route = read('src/app/api/designs/sample/route.ts');
  const hooked = (src: string) => /const units = remixUnits\(\{ open: [^}]+\}\);/.test(src) && /if \(slot !== 'sample' && countsRemixes\(fid\)\)/.test(src) && /spend: remix \? \{ \.\.\.spend, remix \}/.test(src);
  check('F5 the sample route counts a sheet\'s views as remixes through remixUnits (the model-choice hook)', hooked(route));
  proof('F5 a route that skips the remix count is caught', !hooked(route.replace('spend: remix ? { ...spend, remix }', 'spend: edit ? spend')));
  const lim2 = read('src/lib/images/limits.ts');
  const underLock = (src: string) => /pg_advisory_xact_lock\(hashtext\('snowmoon\.images\.fid'\), \$\{fid\}::int\)[\s\S]*if \(spend\.remix && countsRemixes\(fid\) && \(await remixTable\(t\)\)\)/.test(src);
  check('F5 the remix count is checked under the person\'s lock, with the spend cap', underLock(lim2) && /imagesDailySpendCapUsd\(\)\) return \{ ok: false as const, refusal: 'spend' as const \};\s*await tx`insert into studio\.sheet_remix_asks/.test(lim2));
  proof('F5 a remix count outside the lock is caught', !underLock(lim2.replace("hashtext('snowmoon.images.fid')", "hashtext('elsewhere')")));
  // What happens when a remix's views partly fail: the failed answer carries the remix, so making it again stays inside it.
  const keeps = (src: string) => src.includes("if (!paid.ok) return no(paid.error, paid.status, { ...paid.extra, ...(remixTicket && !String(paid.extra.reason ?? '').startsWith('remix') ? { remix: remixTicket } : {}) });");
  check('F6 a view that fails answers with its remix, so it is made again inside the same remix', keeps(route));
  proof('F6 a failure that drops the remix is caught', !keeps(route.replace('...(remixTicket && ', '...(false && ')) || !keeps(route.replace(/if \(!paid\.ok\) return no\(paid\.error, paid\.status, \{[^\n]*\n/, 'if (!paid.ok) return no(paid.error, paid.status, paid.extra);\n')));
}

// --- The bases (owner, 2026-11-03: three; 2026-11-04 after the restart: one per character) -----------------------
{
  const committedMax = CHALLENGE.maxBases;
  check('committed: three bases for Deluin and Gladias, one for the rest, three at most (owner, 2026-11-04)', committedMax === 3 && CHALLENGE.characters.map((c) => `${c}:${R.baseCountOf(c)}`).join() === 'zei:1,gladias:3,bai:1,seila:1,deluin:3,mu:1', CHALLENGE.characters.map((c) => `${c}:${R.baseCountOf(c)}`).join());
  check('committed: at most one base is used for Zei, three for Deluin', R.basesOf('zei', { zei: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] }).length === 1 && R.basesOf('deluin', { deluin: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'] }).length === 3);
  proof('a second base for a one-base character is caught', R.basesProblems({ ...Object.fromEntries(CHALLENGE.characters.map((c) => [c, []])), mu: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] }).length === 1);
  check('no look is called canonical or official (the word is "current default")', !/\b(canonical|official)\b/i.test(read('src/lib/config.ts')) && !/\b(canonical|official)\b/i.test(read('src/lib/challenge/landing-wording.ts')));
  // The rule itself works for any number; the checks below exercise it with three.
  CHALLENGE.maxBases = 3;
  const countsWere = { ...CHALLENGE.baseCount }; // the rule with three bases for any character
  for (const c of CHALLENGE.characters) CHALLENGE.baseCount[c] = 3;
  const B1 = '11111111-1111-4111-8111-111111111111', B2 = '22222222-2222-4222-8222-222222222222', B3 = '33333333-3333-4333-8333-333333333333';
  const bases = { zei: [B1, B2, B3], bai: [] as string[] };
  const step = (elementId: string, versionId = `${elementId.slice(0, 8)}-0000-4000-8000-000000000000`) => ({ elementId, versionId });
  check('the committed bases: a list for each of the six characters, each empty or up to CHALLENGE.maxBases design ids', R.basesProblems().length === 0 && CHALLENGE.characters.every((c) => Array.isArray(CHALLENGE.bases[c]) && CHALLENGE.bases[c].length <= committedMax), R.basesProblems().join('; '));
  check('a fork of each base counts (by its element id)', [B1, B2, B3].every((b) => R.remixOfBase('zei', [step(b)], bases)));
  check('a fork of a base counts when the base is named by one version\'s id', R.remixOfBase('zei', [{ elementId: 'aaaaaaaa-0000-4000-8000-000000000000', versionId: B2 }], { zei: [B2] }));
  check('a fork of an entry (a remix of a base) counts', R.remixOfBase('zei', [step('eeeeeeee-0000-4000-8000-00000000000e'), step(B3)], bases));
  check('a fork of a remix of a remix of a base counts', R.remixOfBase('zei', [step('eeeeeeee-0000-4000-8000-00000000000e'), step('dddddddd-0000-4000-8000-00000000000d'), step(B1)], bases));
  check('a new sheet made from scratch does not count', !R.remixOfBase('zei', [], bases));
  check('a fork of a sheet that is not a base does not count, once the bases are picked', !R.remixOfBase('zei', [step('99999999-9999-4999-8999-999999999999')], bases));
  check('a base of another character does not make a fork count', !R.remixOfBase('bai', [step('99999999-9999-4999-8999-999999999999')], { zei: [B1], bai: ['44444444-4444-4444-8444-444444444444'] }) && !R.remixOfBase('bai', [step(B1)], { zei: [B1], bai: ['44444444-4444-4444-8444-444444444444'] }));
  check('while a character\'s bases are empty, any fork counts (as before) and a sheet from scratch still does not', R.remixOfBase('bai', [step('99999999-9999-4999-8999-999999999999')], bases) && !R.remixOfBase('bai', [], bases));
  check('at most three bases are used', R.basesOf('zei', { zei: [B1, B2, B3, '44444444-4444-4444-8444-444444444444'] }).length === 3);
  proof('a fourth base is caught', R.basesProblems({ ...Object.fromEntries(CHALLENGE.characters.map((c) => [c, []])), zei: [B1, B2, B3, '44444444-4444-4444-8444-444444444444'] }).length === 1);
  proof('a base that is not a design id (a slug) is caught', R.basesProblems({ ...Object.fromEntries(CHALLENGE.characters.map((c) => [c, []])), zei: ['zei-starting-point'] }).length === 1);
  proof('a missing character list is caught', R.basesProblems({ zei: [] }).length === 5);
  const otherLine = [step('99999999-9999-4999-8999-999999999999')];
  const anyFork = (line: { elementId: string; versionId: string }[]) => line.length > 0; // the rule before the bases
  proof('the old rule (any fork), used once the bases are picked, is caught', anyFork(otherLine) !== R.remixOfBase('zei', otherLine, bases));
  CHALLENGE.maxBases = committedMax;
  for (const c of CHALLENGE.characters) CHALLENGE.baseCount[c] = countsWere[c];
}

// --- The owner's first remixes beside each base (owner, 2026-11-04) -------------------------------------------------
{
  const F1 = '11111111-1111-4111-8111-111111111111', F2 = '22222222-2222-4222-8222-222222222222', F3 = '33333333-3333-4333-8333-333333333333';
  const empty = Object.fromEntries(CHALLENGE.characters.map((c) => [c, [] as string[]]));
  check('two first remixes shown per character; the cleared lists are valid', CHALLENGE.firstRemixesShown === 2 && R.firstRemixesProblems().length === 0 && CHALLENGE.characters.every((c) => CHALLENGE.firstRemixes[c].length === 0), R.firstRemixesProblems().join('; '));
  check('first remixes: at most two are used, in the order given', R.firstRemixesOf('zei', { zei: [F2, F1, F3] }).join() === [F2, F1].join());
  proof('a third first remix is caught', R.firstRemixesProblems({ ...empty, zei: [F1, F2, F3] }).length === 1);
  proof('a first remix that is not a design id is caught', R.firstRemixesProblems({ ...empty, zei: ['zei-remix'] }).length === 1);
  proof('a missing character list is caught', R.firstRemixesProblems({ zei: [] }).length === 5);
}

// --- Bases by closed models, the bases' style order, and P5g's one exception (owner, 2026-11-04) --------------------
{
  const BA = await import('../src/lib/challenge/bases');
  const { p5gProblems, CHALLENGE_FILES } = await import('./lib/p5g');
  const recipe = (model: string) => ({ prompt: 'p', model, endpoint: 'e', host: 'h', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.05, made_at: '2026-11-04T00:00:00.000Z', width: 576, height: 768, checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' as const }, host_safety_checker: 'not run' as const }, assist: null });
  const body = (...models: string[]) => ({ samples: [], views: Object.fromEntries(models.map((m, i) => [(['front', 'side', 'back'] as const)[i], { url: 'u', sha256: 'a'.repeat(64), recipe: recipe(m) }])) });
  // The owner reread the closed-model lines (2026-11-04, the 2026-11-05 fixes); they are in legal.ts for the launch.
  check('committed: closed-model bases are allowed for the launch (CHALLENGE.closedBasesAllowed, with Privacy naming OpenAI and Google)', CHALLENGE.closedBasesAllowed === true);
  check('committed: the bases\' style order is empty until the owner picks the styles', Array.isArray(CHALLENGE.baseStyles) && CHALLENGE.baseStyles.length === 0);
  check('a base made by open models is never refused', BA.closedBaseRefusal(body('flux2-klein-4b-edit', 'flux2-klein-4b-edit'), false) === null && BA.closedBaseRefusal(body('z-image-turbo'), true) === null);
  const gpt = BA.closedBaseRefusal(body('gpt-image-2.5-sunburst'), false) ?? '';
  check('a base whose front was made by a closed model is refused while closedBasesAllowed is false, naming the model and its maker', gpt.includes('GPT Image 2.5 Sunburst, a closed model by OpenAI') && gpt.includes('CHALLENGE.closedBasesAllowed'), gpt);
  check('a closed model in a side view alone is enough to refuse it', BA.closedBaseRefusal(body('flux2-klein-4b-edit', 'gemini-3.1-flash-image'), false)?.includes('Gemini 3.1 Flash Image, a closed model by Google') === true);
  check('once closedBasesAllowed is true, a closed-model base (OpenAI, Google) is accepted', BA.closedBaseRefusal(body('gpt-image-2.5-sunburst'), true) === null && BA.closedBaseRefusal(body('gemini-3.1-flash-image'), true) === null);
  check('a model not on config/models.json is refused even when closed bases are allowed', /not on the model list/.test(BA.closedBaseRefusal(body('some-new-model'), true) ?? ''));
  proof('a closed-model base let through before the reread is caught', BA.closedBaseRefusal(body('gpt-image-2.5-sunburst'), false) !== null && BA.closedBaseRefusal(body('gpt-image-2.5-sunburst'), true) === null);
  const B1 = '11111111-1111-4111-8111-111111111111', B2 = '22222222-2222-4222-8222-222222222222';
  const step = (elementId: string) => ({ elementId, versionId: `${elementId.slice(0, 8)}-0000-4000-8000-000000000000` });
  check('a fork of a refused base does not count, and the character\'s bases stay picked (a fork of any sheet does not count instead)', !R.remixOfBase('zei', [step(B2)], { zei: [B1, B2] }, new Set([B2])) && R.remixOfBase('zei', [step(B1)], { zei: [B1, B2] }, new Set([B2])) && !R.remixOfBase('zei', [step('99999999-9999-4999-8999-999999999999')], { zei: [B2] }, new Set([B2])));
  // The style order.
  const saved = CHALLENGE.baseStyles;
  CHALLENGE.baseStyles = ['Bolder', 'Printed', 'Mood'];
  const sheets = (styles: (string | null)[]) => styles.map((style, i) => ({ style, createdAt: new Date(Date.UTC(2026, 10, 1, i)).toISOString(), versionId: `${style}-${i}` }));
  const zeiOrder = sheets(['Mood', 'Bolder', null, 'Printed']).sort(R.newestFirst).sort(R.baseStyleOrder).map((x) => x.style);
  const baiOrder = sheets(['Printed', 'Mood', 'Bolder']).sort(R.newestFirst).sort(R.baseStyleOrder).map((x) => x.style);
  check('the bases follow CHALLENGE.baseStyles, the same order for every character (an unlisted style after)', zeiOrder.join() === 'Bolder,Printed,Mood,' && baiOrder.join() === 'Bolder,Printed,Mood', `${zeiOrder.join()} / ${baiOrder.join()}`);
  check('the style order ignores case', R.baseStyleOrder({ style: 'bolder' }, { style: 'Mood' }) < 0);
  const ties = sheets(['Mood', 'Mood']).sort(R.newestFirst).sort(R.baseStyleOrder).map((x) => x.versionId);
  check('two bases of one style stay newest first', ties.join() === 'Mood-1,Mood-0', ties.join());
  CHALLENGE.baseStyles = [];
  check('with no styles set, the order is newest first', sheets(['Mood', 'Bolder']).sort(R.newestFirst).sort(R.baseStyleOrder).map((x) => x.versionId).join() === 'Bolder-1,Mood-0');
  CHALLENGE.baseStyles = saved;
  // P5g: the committed code passes, and the exception reaches only "Bases to start from".
  const files = walk('src').filter((f) => CHALLENGE_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
  const p5g = p5gProblems(files);
  check('P5g passes on the committed challenge code, with "Bases to start from" in style order', p5g.length === 0, p5g.join('; '));
  check('"Bases to start from" really is ordered by style (startingSheets sorts by baseStyleOrder)', /sort\(newestFirst\)\.sort\(baseStyleOrder\)/.test(read('src/lib/challenge/entries.ts')));
  const plantIn = (file: string, f: (t: string) => string) => files.map((x) => (x.file === file ? { ...x, text: f(x.text) } : x));
  proof('P5g: an entries list ordered by style fails (standing)', p5gProblems(plantIn('src/lib/challenge/entries.ts', (t) => t.replace('const entries = chooseEntries(', 'const entries = [...chooseEntries(').replace(', submissions, () => true);\n  const byAdmins', ', submissions, () => true)].sort(baseStyleOrder);\n  const byAdmins'))).some((p) => /orders by style outside/.test(p)));
  proof('P5g: an entries list ordered by style fails (a new top-level list in entries.ts)', p5gProblems(plantIn('src/lib/challenge/entries.ts', (t) => t.replace('export async function standing(', 'export const planted = (e: { style: string | null }[]) => e.sort(baseStyleOrder);\nexport async function standing('))).length === 1);
  proof('P5g: the challenge page re-sorting by style fails', p5gProblems(plantIn('src/app/challenge/page.tsx', (t) => `${t}\nexport const planted = (e: { style: string | null }[]) => e.sort(baseStyleOrder);`)).length === 1);
  proof('P5g: "Posted on" ordered by style fails', p5gProblems([...files, { file: 'src/components/posted-on.tsx', text: 'export const p = (x) => x.sort(baseStyleOrder);' }]).length >= 1);
  proof('P5g: a style order that reads something else (likes) fails', p5gProblems(plantIn('src/lib/challenge/rules.ts', (t) => t.replace('return at(a.style) - at(b.style);', 'return at(a.style) - at(b.style) || b.likes - a.likes;'))).length === 1);
  proof('P5g: a style order that reads another setting fails', p5gProblems(plantIn('src/lib/challenge/rules.ts', (t) => t.replace('return at(a.style) - at(b.style);', 'return at(a.style) - at(b.style) || CHALLENGE.minEntrants;'))).length === 1);
  proof('P5g: entries ordered by built-on counts still fail', p5gProblems([...files, { file: 'src/lib/challenge/planted.ts', text: 'export const top = (e) => e.sort((a, b) => b.builtOn - a.builtOn);' }]).length === 1);
}

// --- /challenge as a landing page (owner, 2026-11-04): the random selection (P5g's second exception) and P5i -------
{
  const { shuffleFresh } = await import('../src/lib/challenge/shuffle');
  const { p5gProblems, p5iProblems, CHALLENGE_FILES, P5I_FILES } = await import('./lib/p5g');
  // Uniform: over many shuffles of four items, each item lands in each place about a quarter of the time, and all 24
  // orders appear. A seeded generator, so the test never flakes.
  let s = 12345;
  // mulberry32: a small seeded generator with good low bits.
  const seeded = () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
  const uniformity = (shuffle: (xs: readonly number[]) => number[], n = 48_000) => {
    const at = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    const orders = new Set<string>();
    for (let k = 0; k < n; k++) {
      const o = shuffle([0, 1, 2, 3]);
      o.forEach((x, i) => at[x][i]++);
      orders.add(o.join());
    }
    const worst = Math.max(...at.flat().map((c) => Math.abs(c / n - 0.25)));
    return { worst, orders: orders.size };
  };
  const u = uniformity((xs) => shuffleFresh(xs, seeded));
  check('the random selection is unweighted: every remix lands in every place about equally, and every order appears', u.worst < 0.01 && u.orders === 24, `worst ${u.worst.toFixed(4)}, ${u.orders} orders`);
  const real = uniformity((xs) => shuffleFresh(xs), 24_000);
  check('the default (crypto) shuffle is unweighted too', real.worst < 0.015 && real.orders === 24, `worst ${real.worst.toFixed(4)}`);
  // A planted weighted shuffle (the first item, "most liked", kept on top half the time) must fail the same test.
  const weighted = (xs: readonly number[]) => (seeded() < 0.5 ? [xs[0], ...shuffleFresh(xs.slice(1), seeded)] : shuffleFresh(xs, seeded));
  proof('a weighted shuffle fails the uniformity test', uniformity(weighted).worst >= 0.01);
  const input = [1, 2, 3, 4, 5];
  const out = shuffleFresh(input);
  check('the shuffle keeps every remix once and leaves the list as it was', out.slice().sort().join() === '1,2,3,4,5' && input.join() === '1,2,3,4,5');
  // P5g on the code: the exception holds, and every way past it fails.
  const files = walk('src').filter((f) => CHALLENGE_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
  const plantIn = (file: string, f: (x: string) => string) => files.map((x) => (x.file === file ? { ...x, text: f(x.text) } : x));
  check('P5g passes with the cards\' shuffles (shuffle.ts, on each card\'s whole lists)', p5gProblems(files).length === 0, p5gProblems(files).join('; '));
  // The hub's cards (owner, 2026-11-05, answers 8 and 9): each card shuffles its whole lists of bases and remixes in the
  // browser; the page's data hands every card all of its character's remixes.
  const card = read('src/components/challenge-card.tsx');
  check('a card shuffles its bases and its remixes afresh in the browser, the whole lists (owner, 2026-11-05)', /setBases\(c\.bases\.length > 1 \? shuffleFresh\(c\.bases\) : c\.bases\)/.test(card) && /setRemixes\(shuffleFresh\(c\.remixes\)\)/.test(card) && /'use client'/.test(card) && /await (remixes|challengePictures)\(sql\)/.test(read('src/lib/challenge/view.ts')));
  check('a card shows a random three of its remixes, then more on "Show more"', /const FIRST = 3;/.test(card) && /remixes\.slice\(0, shown\)/.test(card) && /setShown\(\(n\) => n \+ MORE\)/.test(card));
  proof('P5g: shuffling only some of the bases fails', p5gProblems(plantIn('src/components/challenge-card.tsx', (x) => x.replace('shuffleFresh(c.bases)', 'shuffleFresh(c.bases.slice(1))'))).length > 0);
  proof('P5g: bases put in a fixed order by the page fails', p5gProblems(plantIn('src/components/challenge-card.tsx', (x) => x.replace('shuffleFresh(c.bases)', '[...c.bases].sort((a, b) => a.title.localeCompare(b.title))'))).length > 0);
  proof('P5g: a weighted shuffle (it reads likes) fails', p5gProblems(plantIn('src/lib/challenge/shuffle.ts', (x) => x.replace('export function shuffleFresh<T>(items: readonly T[]', 'export function shuffleFresh<T extends { likes: number }>(items: readonly T[]').replace('const j = below(i + 1, random);', 'const j = below(Math.min(i + 1, 1 + out[i].likes), random);'))).length > 0);
  proof('P5g: a shuffle with weights fails', p5gProblems(plantIn('src/lib/challenge/shuffle.ts', (x) => x.replace('const j = below(i + 1, random);', 'const j = below(i + 1, () => random() ** weight);'))).length > 0);
  proof('P5g: a sort by chance on the page (outside the shuffle) fails', p5gProblems(plantIn('src/app/challenge/page.tsx', (x) => `${x}\nexport const planted = (e: number[]) => e.sort(() => Math.random() - 0.5);`)).length > 0);
  proof('P5g: shuffling only some remixes (a featured few) fails', p5gProblems(plantIn('src/components/challenge-card.tsx', (x) => x.replace('shuffleFresh(c.remixes)', 'shuffleFresh(c.remixes.slice(0, 6))'))).length > 0);
  proof('P5g: the cards\' remixes drawn from a limited list fails', p5gProblems(plantIn('src/lib/challenge/view.ts', (x) => x.replace('await challengePictures(sql)', 'await challengePictures(sql, { limit: 12 })'))).length > 0);
  proof('P5g: a shuffle elsewhere (the feed) fails', p5gProblems([...files, { file: 'src/app/challenge/remixes/page.tsx', text: `${read('src/app/challenge/remixes/page.tsx')}\nconst x = shuffleFresh(cards);` }].filter((f, i, a) => a.findIndex((y) => y.file === f.file) === i || f.text.includes('const x = shuffleFresh'))).length > 0);
  // P5i: no counts on cards, no "most remixed" sort.
  const p5i = P5I_FILES.map((f) => ({ file: f, text: read(f) }));
  const plant5i = (file: string, f: (x: string) => string) => p5i.map((x) => (x.file === file ? { ...x, text: f(x.text) } : x));
  check('P5i passes: no remix, like or built-on count on the cards, no "most remixed" sort', p5iProblems(p5i).length === 0, p5iProblems(p5i).join('; '));
  proof('P5i: a like count on a card fails', p5iProblems(plant5i('src/components/challenge-remix-card.tsx', (x) => x.replace('<span className="ch-card-by">', '<span>{r.likes} likes</span><span className="ch-card-by">'))).length > 0);
  proof('P5i: a remix count read for the feed fails', p5iProblems(plant5i('src/lib/challenge/remixes.ts', (x) => x.replace('select e.id as element_id,', 'select (select count(*) from studio.links) as remix_count, e.id as element_id,'))).length > 0);
  proof('P5i: a "most remixed" sort on the feed fails', p5iProblems(plant5i('src/app/challenge/remixes/page.tsx', (x) => x.replace("type Props = { searchParams: Promise<{ character?: string; before?: string }> };", "type Props = { searchParams: Promise<{ character?: string; before?: string; sort?: string }> };\nconst mostRemixedFirst = (s?: string) => s === 'most-remixed';"))).length > 0);
}

// --- The post address: the host allow-list ----------------------------------------------------------------------
const good: [string, string][] = [
  ['https://farcaster.xyz/naaate/0x0a1b2c3d', 'farcaster'],
  ['https://warpcast.com/naaate/0x0a1b2c3d', 'farcaster'],
  ['https://bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h', 'bluesky'],
  ['https://bsky.app/profile/did:plc:z72i7hdynmk6r22z27h6tvur/post/3mz6hon3w6c2h', 'bluesky'],
  ['https://hey.xyz/posts/1q4tkta5f47sz8032wm', 'lens'],
  ['  https://hey.xyz/posts/1q4tkta5f47sz8032wm/  ', 'lens'],
  ['https://BSKY.APP/profile/someone.bsky.social/post/3mz6hon3w6c2h', 'bluesky'],
];
for (const [u, n] of good) {
  const r = L.readPostAddress(u);
  check(`accepted: ${u.trim()}`, r.ok && r.ref.network === n, JSON.stringify(r));
}
const bad = [
  'http://farcaster.xyz/naaate/0x0a1b2c3d',
  'https://farcaster.xyz.evil.com/naaate/0x0a1b2c3d',
  'https://evilfarcaster.xyz/naaate/0x0a1b2c3d',
  'https://www.bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h',
  'https://bsky.app.evil.com/profile/someone.bsky.social/post/3mz6hon3w6c2h',
  'https://staging.bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h',
  'https://hey.xyz.co/posts/1q4tkta5f47sz8032wm',
  'https://heẏ.xyz/posts/1q4tkta5f47sz8032wm',
  'https://xn--hey-xyz.com/posts/abc',
  'https://1.2.3.4/posts/1q4tkta5f47sz8032wm',
  'https://127.0.0.1/naaate/0x0a1b2c3d',
  'https://[::1]/posts/abc',
  'https://2130706433/posts/abc',
  'https://0x7f000001/posts/abc',
  'https://localhost/posts/abc',
  'javascript:alert(1)//hey.xyz/posts/abc',
  'ftp://hey.xyz/posts/abc',
  'data:text/html,hey.xyz/posts/abc',
  'file:///etc/passwd',
  'https://hey.xyz@evil.com/posts/abc',
  'https://evil.com@hey.xyz/posts/abc',
  'https://user:pass@hey.xyz/posts/abc',
  'https://hey.xyz:8443/posts/abc',
  'https://evil.com\\@hey.xyz/posts/abc',
  'https://evil.com\\hey.xyz/posts/abc',
  'https://hey.xyz/posts/abc def',
  'https://hey.xyz/posts/../../admin',
  'https://hey.xyz/u/someone',
  'https://bsky.app/profile/someone.bsky.social',
  'https://farcaster.xyz/~/compose?text=x',
  'hey.xyz/posts/abc',
  '//hey.xyz/posts/abc',
  `https://hey.xyz/posts/${'a'.repeat(400)}`,
  '',
];
for (const u of bad) {
  const r = L.readPostAddress(u);
  check(`refused: ${JSON.stringify(u).slice(0, 80)}`, !r.ok, JSON.stringify(r));
}
check('refused: not a string', !L.readPostAddress(42).ok && !L.readPostAddress(null).ok);
check('a cast hash from composeCast is read only as a full hash', L.castFromHash(`0x${'a'.repeat(40)}`).ok && !L.castFromHash('0xabc').ok && !L.castFromHash('https://evil.com').ok);
{
  // Proof: a looser host rule (ends with the network's host) would let a look-alike through; the real rule doesn't.
  const loose = (u: string) => ['farcaster.xyz', 'bsky.app', 'hey.xyz'].some((h) => new URL(u).hostname.endsWith(h));
  proof('a suffix match lets "evilfarcaster.xyz" through, and the real allow-list refuses it', loose('https://evilfarcaster.xyz/a/0x0a1b2c3d') && !L.readPostAddress('https://evilfarcaster.xyz/a/0x0a1b2c3d').ok);
}

// --- The server never fetches the pasted address ----------------------------------------------------------------
process.env.NEYNAR_API_KEY = 'test-key-not-real';
const P = await import('../src/lib/challenge/posts');
const VERSION = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const page = `https://snowmoon.party/references/designs/${VERSION}`;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const DID = 'did:plc:abcdefghijklmnopqrstuvwx';
function standIn(link: string) {
  const asked: string[] = [];
  const f = async (url: string, init?: RequestInit) => {
    asked.push(url);
    const u = new URL(url);
    if (u.hostname === 'api.neynar.com') {
      if ((init?.headers as Record<string, string>)?.['x-api-key'] !== 'test-key-not-real') return json({}, 401);
      return json({ cast: { hash: `0x0a1b2c3d${'e'.repeat(32)}`, author: { fid: 500, username: 'naaate', pfp_url: 'https://imagedelivery.net/avatar.png', display_name: 'Nate' }, text: `my Bai ${link}`, timestamp: '2026-11-07T10:00:00Z', embeds: [{ url: link }], reactions: { likes_count: 9 } } });
    }
    if (u.pathname.endsWith('resolveHandle')) return json({ did: DID });
    if (u.pathname.endsWith('getPosts')) return json({ posts: [{ uri: `at://${DID}/app.bsky.feed.post/3mz6hon3w6c2h`, author: { handle: 'someone.bsky.social', avatar: 'https://cdn.bsky.app/avatar.jpg', labels: [] }, record: { text: `Zei! ${link}`, createdAt: '2026-11-08T10:00:00Z', facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: link }] }] }, indexedAt: '2026-11-08T10:00:01Z', labels: [], likeCount: 3 }] });
    if (u.hostname === 'api.lens.xyz') return json({ data: { post: { __typename: 'Post', id: '2537194911', slug: '1q4tkta5f47sz8032wm', timestamp: '2026-11-09T10:00:00Z', author: { address: '0xAbCdEf0000000000000000000000000000c0de04', username: { localName: 'someone' } }, metadata: { __typename: 'TextOnlyMetadata', content: `Bai ${link}` } } } });
    return json({}, 404);
  };
  return { asked, f: f as (url: string, init?: RequestInit) => Promise<Response> };
}
const pasted = ['https://warpcast.com/naaate/0x0a1b2c3d', 'https://bsky.app/profile/someone.bsky.social/post/3mz6hon3w6c2h', 'https://hey.xyz/posts/1q4tkta5f47sz8032wm'];
for (const addr of pasted) {
  const s = standIn(page);
  const r = L.readPostAddress(addr);
  const got = r.ok ? await P.verifiedPost(r.ref, VERSION, s.f) : null;
  check(`${addr}: read from its network's API and listed`, Boolean(got?.ok), JSON.stringify(got));
  check(`${addr}: every request went to an API host`, s.asked.length > 0 && s.asked.every((u) => (L.API_HOSTS as readonly string[]).includes(new URL(u).hostname)), s.asked.join(' '));
  check(`${addr}: the pasted address was never requested`, s.asked.every((u) => u !== addr && new URL(u).hostname !== new URL(addr).hostname), s.asked.join(' '));
  if (got?.ok) {
    check(`${addr}: the kept post has no avatar, name, picture, counts or words`, Object.keys(got.post).sort().join() === 'at,handle,id,links,network,url,writer' && !/avatar|pfp|imagedelivery|likes/.test(JSON.stringify({ ...got.post, links: [] })));
    check(`${addr}: the address shown is rebuilt on the network's own host`, ['farcaster.xyz', 'bsky.app', 'hey.xyz'].includes(new URL(got.post.url).hostname));
  }
}
{
  const s = standIn(page);
  const got = await P.verifiedPost(L.castFromHash(`0x0a1b2c3d${'e'.repeat(32)}`).ok ? (L.castFromHash(`0x0a1b2c3d${'e'.repeat(32)}`) as { ok: true; ref: never }).ref : (null as never), VERSION, s.f);
  check("the Farcaster app's new cast (composeCast's hash) is read by hash from Neynar", got.ok && s.asked.length === 1 && s.asked[0].includes('type=hash'), s.asked.join(' '));
}
{
  // Proof: an API address pointed at the network's own site (as if fetching the pasted page) is refused before any request.
  const keep = L.POST_APIS.lensGraphql;
  L.POST_APIS.lensGraphql = 'https://hey.xyz/posts/1q4tkta5f47sz8032wm';
  const s = standIn(page);
  const r = await P.fetchPost({ network: 'lens', slug: '1q4tkta5f47sz8032wm' }, s.f);
  L.POST_APIS.lensGraphql = keep;
  proof('a request to the pasted host (hey.xyz) is refused and never sent', !r.ok && s.asked.length === 0);
}
{
  const s = standIn(page);
  const keep = process.env.NEYNAR_API_KEY;
  delete process.env.NEYNAR_API_KEY;
  const r = await P.fetchPost({ network: 'farcaster', username: 'naaate', hash: '0x0a1b2c3d' }, s.f);
  process.env.NEYNAR_API_KEY = keep;
  check('without a Neynar key, Farcaster posts are not read (and nothing is asked)', !r.ok && s.asked.length === 0);
}

// --- A post that doesn't link to the page is refused -------------------------------------------------------------
for (const [label, link] of [
  ['another version', `https://snowmoon.party/references/designs/${OTHER}`],
  ['the site home', 'https://snowmoon.party/'],
  ['a look-alike host with the same path', `https://snowmoon.party.evil.com/references/designs/${VERSION}`],
  ['an evil host with our host as user name', `https://snowmoon.party@evil.com/references/designs/${VERSION}`],
  ['a longer path', `https://snowmoon.party/references/designs/${VERSION}/x`],
] as const) {
  const s = standIn(link);
  const r = await P.verifiedPost({ network: 'lens', slug: '1q4tkta5f47sz8032wm' }, VERSION, s.f);
  check(`refused: a post linking to ${label}`, !r.ok && r.why === P.POSTS_WORDING.noLink, JSON.stringify(r));
}
check('a link with www., a trailing slash or in capitals counts', L.linksToVersion({ links: [`www.snowmoon.party/references/designs/${VERSION.toUpperCase()}/`] }, VERSION));
proof('a matcher that only checks the path would take the look-alike host', `https://snowmoon.party.evil.com/references/designs/${VERSION}`.includes(`/references/designs/${VERSION}`) && !L.linksToVersion({ links: [`https://snowmoon.party.evil.com/references/designs/${VERSION}`] }, VERSION));
{
  const labelled = { posts: [{ uri: `at://${DID}/app.bsky.feed.post/3mz6hon3w6c2h`, author: { handle: 'someone.bsky.social', labels: [{ val: '!no-unauthenticated' }] }, record: { text: page, createdAt: '2026-11-08T10:00:00Z' }, indexedAt: '2026-11-08T10:00:01Z', labels: [] }] };
  check('a Bluesky post whose author asked not to be shown off Bluesky is refused', L.parseBskyPosts(labelled, '3mz6hon3w6c2h') === 'labelled');
}

// --- Submit: the post must be the submitter's own (owner, 2026-11-04, answer 9.4) -------------------------------
{
  const read3 = async (addr: string) => {
    const r = L.readPostAddress(addr);
    const got = r.ok ? await P.verifiedPost(r.ref, VERSION, standIn(page).f) : null;
    return got?.ok ? got.post : null;
  };
  const [fc, sky, lens] = [await read3(pasted[0]), await read3(pasted[1]), await read3(pasted[2])];
  check('9.4 a cast\'s writer is its author FID, from Neynar', JSON.stringify(fc?.writer) === '{"fid":500}');
  check('9.4 a Bluesky post\'s writer is the DID in its at:// address', JSON.stringify(sky?.writer) === JSON.stringify({ did: DID }));
  check('9.4 a Lens post\'s writer is its author account, from Lens', lens !== null && lens.writer !== null && 'lens' in lens.writer && /^0x[0-9a-f]{40}$/.test(lens.writer.lens));
  const LENS_AUTHOR = lens?.writer && 'lens' in lens.writer ? lens.writer.lens : '';
  const me = (fid: number, blueskyDids: string[] = [], lensAccounts: string[] = []) => ({ fid, blueskyDids, lensAccounts });
  check('9.4 Farcaster: your own cast is accepted', L.writerCheck(fc!, me(500)) === 'ok');
  check('9.4 Farcaster: someone else\'s cast is refused', L.writerCheck(fc!, me(501)) === 'not-yours');
  check('9.4 Farcaster: a cast whose author Neynar didn\'t name is refused', L.writerCheck({ network: 'farcaster', writer: null }, me(500)) === 'not-yours');
  check('9.4 Farcaster: a wallet account (below zero) never matches', L.writerCheck({ network: 'farcaster', writer: { fid: -500 } }, me(-500)) === 'not-yours');
  check('9.4 Bluesky: refused unless signed in with that Bluesky account (no linking yet)', L.writerCheck(sky!, me(500)) === 'unknown');
  check('9.4 Bluesky: your known DID is accepted, another\'s refused', L.writerCheck(sky!, me(500, [DID])) === 'ok' && L.writerCheck(sky!, me(500, ['did:plc:zzzzzzzzzzzzzzzzzzzzzzzz'])) === 'not-yours');
  check('9.4 Lens: refused unless signed in with that Lens account (no linking yet)', L.writerCheck(lens!, me(501)) === 'unknown');
  check('9.4 Lens: the signed-in Lens account\'s own post is accepted (any capitals), another account\'s refused', L.writerCheck(lens!, me(0, [], [LENS_AUTHOR.toUpperCase().replace('0X', '0x')])) === 'ok' && L.writerCheck(lens!, me(0, [], ['0x' + '9'.repeat(40)])) === 'not-yours');
  proof('9.4 a Lens check that ignored the author would take someone else\'s post', L.writerCheck({ network: 'lens', writer: { lens: '0x' + '8'.repeat(40) } }, me(0, [], [LENS_AUTHOR])) !== 'ok');
  proof('9.4 a check that only compares handles would take someone else\'s cast', fc!.handle === 'naaate' && L.writerCheck(fc!, me(501)) !== 'ok');
  const SW = (await import('../src/lib/challenge/entries')).SUBMIT_WORDING;
  check('9.4 the refusals are short and say what to do', SW.notYourPost === 'That post isn’t from your account. Submit a post you wrote.' && /Sign in with that Bluesky account/.test(SW.blueskyUnknown) && /Sign in with that Lens account/.test(SW.lensUnknown));
  const route = read('src/app/api/challenge/submit/route.ts');
  const checked = (src: string) => /if \(!got\.ok\) return no\(got\.why, got\.status\);[\s\S]{0,700}const mine = writerCheck\(got\.post, \{\s*fid: farcaster \?\? 0,\s*blueskyDids: social\?\.kind === 'bluesky' \? \[social\.subject\] : \[\],\s*lensAccounts: social\?\.kind === 'lens' \? \[social\.subject\] : \[\],\s*\}\);\s*if \(mine === 'not-yours'\) return no\(SUBMIT_WORDING\.notYourPost, 403\);\s*if \(mine === 'unknown'\) return no\(got\.post\.network === 'lens' \? SUBMIT_WORDING\.lensUnknown : SUBMIT_WORDING\.blueskyUnknown, 403\);\s*const r = await submitEntry\(/.test(src);
  check('9.4 the Submit route checks the writer before it keeps anything', checked(route));
  proof('9.4 a route that skips the check is caught', !checked(route.replace("if (mine === 'not-yours') return no(SUBMIT_WORDING.notYourPost, 403);", '')));
}

// --- "Posted on": text and a link only -------------------------------------------------------------------------
const MEDIA = /<(img|picture|video|audio|iframe|embed|object|source|svg|image|script|link|style)\b|background(-image)?\s*:|url\(|srcset=/i;
const items = [
  { id: '2', network: 'bluesky' as const, handle: 'someone.bsky.social', at: '2026-11-08T10:00:00.000Z', url: `https://bsky.app/profile/${DID}/post/3mz6hon3w6c2h` },
  { id: '1', network: 'farcaster' as const, handle: 'naaate', at: '2026-11-07T10:00:00.000Z', url: 'https://farcaster.xyz/naaate/0x0a1b2c3d' },
];
// Rendered in a separate process (scripts/lib/render-challenge.ts: react-dom/server isn't available under react-server).
const rendered = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'scripts/lib/render-challenge.ts')], { input: JSON.stringify({ versionId: VERSION, posts: items }), encoding: 'utf8', cwd: ROOT })) as { postedOn: string; share: string };
const html = rendered.postedOn;
check('"Posted on" renders', /Posted on/.test(html) && /Bluesky · @someone\.bsky\.social · 2026-11-08/.test(html) && /href="https:\/\/farcaster\.xyz\/naaate\/0x0a1b2c3d"/.test(html), html.slice(0, 300));
check('"Posted on" has no image, avatar, embed, script or style', !MEDIA.test(html), (html.match(MEDIA) ?? [''])[0]);
check('"Posted on" keeps the server\'s order (newest first)', html.indexOf('someone.bsky.social') < html.indexOf('naaate'));
check('"Posted on" links only to the networks\' own hosts', [...html.matchAll(/href="([^"]+)"/g)].every((m) => ['farcaster.xyz', 'bsky.app', 'hey.xyz'].includes(new URL(m[1]).hostname)));
proof('an avatar planted in "Posted on" is caught', MEDIA.test(html.replace('</li>', '<img src="https://cdn.bsky.app/avatar.jpg" alt=""></li>')));
const share = rendered.share;
check('the share buttons are plain links, no outside script or picture', !MEDIA.test(share) && /bsky\.app\/intent\/compose/.test(share) && /hey\.xyz\/\?text=/.test(share) && /farcaster\.xyz\/~\/compose/.test(share), share.slice(0, 300));
check('the share links carry the page link', share.includes(encodeURIComponent(`/references/designs/${VERSION}`)) || share.includes(`%2Freferences%2Fdesigns%2F${VERSION}`));
check('the guidance line is shown', share.includes('If you’re remixing someone’s post, quote or reply to it on the same network. Always include your version’s link.'));

// --- The rules copy (owner's decisions, 2026-10-31) -------------------------------------------------------------
const W = (await import('../src/lib/challenge/wording')).CHALLENGE_WORDING;
const copy = [W.intro(), W.next(), ...W.rules(), W.adminsLine].join(' ');
// Owner, 2026-11-05 evening: no prize for now; how the final version is chosen, and any prize, come later.
const NO_PRIZE = 'There is no prize for now.';
const LATER = 'How the final version is chosen, and any prize, are added to the rules before entries close.';
const MINT_PLAN = NO_PRIZE;
const PROMISES = /\b(mint(ed|s|ing)?|rewards?|reward pot|credit test|deep fund\w*|payouts?|split on|token for you|you will (get|receive)|guaranteed?|\$\s?\d|\d+\s?(ETH|USDC|dollars))\b|\bwallet\b/i;
const NO_BOUNTY = /\bbount(y|ies)\b|\bpoidh\b/i;
function copyProblems(t: string): string[] {
  const p: string[] = [];
  if (!t.includes(NO_PRIZE) || !t.includes(LATER)) p.push('the rules don\'t say there is no prize for now, and that how the final version is chosen comes before entries close');
  const m = t.match(PROMISES);
  if (m) p.push(`promises or a wallet path: "${m[0]}"`);
  if (!/(A new sheet|A picture) made from scratch isn’t an entry/.test(t)) p.push('it does not say only remixes count');
  // No bounties at all (owner, 2026-11-04): no bounty, no poidh, anywhere in the challenge's words.
  if (NO_BOUNTY.test(t)) p.push(`a bounty is back: "${t.match(NO_BOUNTY)![0]}"`);
  return p;
}
check('the rules copy: no prize for now, the final version and any prize decided before entries close, remixes only, no bounty, no promises (mint, rewards, payouts), no wallet path', copyProblems(copy).length === 0, copyProblems(copy).join('; '));
check('the rules name the six characters most named in the book first (owner, 2026-11-04)', W.intro().includes('Zei, Gladias, Bai, Seila, Deluin or Mu'));
proof('a promised mint is caught', copyProblems(`${copy} Each version is then minted as an open edition in Snowmoon WIP.`).length > 0);
proof('rules without "no prize for now" are caught', copyProblems(copy.replaceAll(NO_PRIZE, '')).length > 0);
proof('a reward pot is caught', copyProblems(`${copy} Plus an extra reward pot.`).length > 0);
proof('a wallet path back in the rules is caught', copyProblems(`${copy} Or a wallet linked to one.`).length > 0);
proof('a bounty back in the rules (the old per-character rule) is caught', copyProblems(`${copy} There is one poidh bounty for each character.`).length > 0);
{
  // No bounty anywhere in the challenge (owner, 2026-11-04): not in the config, not in any of its words, not on its pages.
  const words = Object.values(W).flatMap((v) => (typeof v === 'function' ? [String((v as (...a: string[]) => unknown)('Zei', 'Zei'))] : Array.isArray(v) ? v.map(String) : [String(v)])).join(' ');
  const pages = ['src/app/challenge', 'src/lib/challenge'].flatMap((d) => readdirSync(path.join(ROOT, d), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(path.join(ROOT, d, f), 'utf8'))).join('\n');
  check('no bounty: none in the config, the wording or the challenge\'s pages', !('bounties' in CHALLENGE) && !('bountyAmount' in CHALLENGE) && !NO_BOUNTY.test(words) && !NO_BOUNTY.test(pages), (words.match(NO_BOUNTY) ?? pages.match(NO_BOUNTY) ?? [''])[0]);
  proof('a bounty planted in a page is caught', NO_BOUNTY.test(`${pages}\n<p>The poidh bounty</p>`));
}
proof('rules without "forks only" are caught', copyProblems(copy.replace('A new sheet made from scratch isn’t an entry.', '')).length > 0);

// --- Sheets open to everyone only inside the window, and only once Privacy says so -------------------------------
{
  const O = await import('../src/lib/challenge/open-sheets');
  const { PRIVACY } = await import('../src/lib/legal');
  const said = structuredClone(PRIVACY);
  (said.sections.find((x) => x.n === 4)!.body[1] as string[]).push('If you take part in the remix challenge: …');
  check('openSheets is on in the config (owner, 2026-10-31)', CHALLENGE.openSheets === true);
  check('sheets are not open before the window, even with the Privacy words', !O.challengeSheetsOpen(at(D0.opens, -1), said));
  check('sheets open at the opening instant, once Privacy describes the challenge', O.challengeSheetsOpen(at(D0.opens, 0), said));
  check('sheets are open at 23:59:59.999 Pacific on the last day', O.challengeSheetsOpen(at(D0.closes, -1), said));
  check('sheets close again at the close', !O.challengeSheetsOpen(at(D0.closes, 0), said));
  const unsaid = structuredClone(PRIVACY);
  const s4 = unsaid.sections.find((x) => x.n === 4)!;
  s4.body = s4.body.map((b) => (Array.isArray(b) ? b.filter((i) => !/remix challenge/i.test(i)) : b));
  check('the Privacy page now describes the challenge (reread 2026-11-01), so sheets open in the window', O.privacyDescribesChallenge() && O.challengeSheetsOpen(at(D0.opens, 0)));
  check('without those words, sheets stay invited-only even in the window', !O.challengeSheetsOpen(at(D0.opens, 0), unsaid));
  proof('an opening that ignores the window is caught', ((t: Date) => CHALLENGE.openSheets && O.privacyDescribesChallenge(said))(at(D0.closes, 0)) !== O.challengeSheetsOpen(at(D0.closes, 0), said));
}

// --- The database: the migration, its read-back, marks, posts, and life without the tables ------------------------
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
for (const f of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await db.exec(read(`supabase/migrations/${f}`));
await db.exec(`insert into studio.works values ('snowmoon','Snowmoon','GPL-3.0','x') on conflict do nothing`);
await db.exec(read('supabase/migrations/0033_remix_challenge.sql'));
// 0033 run again revokes update on marks; 0038_challenge_daily (one a day, withdraw keeps the row) runs after it, as it
// would on production.
await db.exec(read('supabase/migrations/0038_challenge_daily.sql'));
await db.exec(read('supabase/migrations/0038_challenge_daily.sql'));
check('the migrations are safe to run twice (0033, 0038_challenge_daily)', true);
// What the owner's read-back (a) checked on production (2026-11-01, 17 of 17 true), here on PGlite: RLS on, the
// privileges as written, no public access, only studio_writer's policies, and no score column.
const PRIVS = `select c.what, c.ok from (
  select 'rls on all three' as what, (select bool_and(relrowsecurity) from pg_class where oid in ('studio.challenge_marks'::regclass, 'studio.version_posts'::regclass, 'studio.challenge_eligibility'::regclass)) as ok
  union all select 'marks and eligibility: select and insert, no update of the whole row', bool_and(has_table_privilege('studio_writer', t::regclass, 'SELECT') and has_table_privilege('studio_writer', t::regclass, 'INSERT') and not has_table_privilege('studio_writer', t::regclass, 'UPDATE')) from unnest(array['studio.challenge_marks', 'studio.challenge_eligibility']) t
  union all select 'eligibility and marks: no delete; marks: update of withdrawn_at only (0038_challenge_daily)', not has_table_privilege('studio_writer', 'studio.challenge_eligibility', 'DELETE') and not has_table_privilege('studio_writer', 'studio.challenge_marks', 'DELETE') and has_column_privilege('studio_writer', 'studio.challenge_marks', 'withdrawn_at', 'UPDATE') and not has_column_privilege('studio_writer', 'studio.challenge_marks', 'version_id', 'UPDATE')
  union all select 'posts: select, insert, delete, no update', has_table_privilege('studio_writer', 'studio.version_posts', 'DELETE') and not has_table_privilege('studio_writer', 'studio.version_posts', 'UPDATE')
  union all select 'no public access', not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['studio.challenge_marks', 'studio.version_posts', 'studio.challenge_eligibility']) t, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p where has_table_privilege(r, t::regclass, p))
  union all select 'only studio_writer policies', not exists (select 1 from pg_policies where schemaname = 'studio' and tablename in ('challenge_marks', 'version_posts', 'challenge_eligibility') and roles <> '{studio_writer}'::name[])
  union all select 'no score column', not exists (select 1 from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility' and column_name = 'score')
) c`;
const privs = await db.query<{ what: string; ok: boolean }>(PRIVS);
check('0033 (with 0038_challenge_daily): RLS, privileges, no public access, no score column (as the owner read back)', privs.rows.length === 7 && privs.rows.every((r) => r.ok === true), JSON.stringify(privs.rows.filter((r) => !r.ok)));
{
  await db.exec(`grant update on studio.challenge_marks to studio_writer`);
  const r2 = await db.query<{ ok: boolean }>(PRIVS);
  await db.exec(`revoke update on studio.challenge_marks from studio_writer`);
  proof('a planted update grant on marks is caught', r2.rows.some((r) => r.ok === false));
  await db.exec(`alter table studio.challenge_eligibility add column score numeric`);
  const r3 = await db.query<{ what: string; ok: boolean }>(PRIVS);
  await db.exec(`alter table studio.challenge_eligibility drop column score`);
  proof('a planted score column is caught', r3.rows.some((r) => r.ok === false && /score/.test(r.what)));
  let refused = false;
  await db.exec(`insert into studio.entities (id, work_id, kind, name) values ('00000000-0000-0000-0000-00000000e0e0','snowmoon','style','Test style');
    insert into studio.elements (id, work_id, element_type, created_by_fid, entity_id, status) values ('00000000-0000-0000-0000-00000000b0b0','snowmoon','design',6786,'00000000-0000-0000-0000-00000000e0e0','published');
    insert into studio.element_versions (id, element_id, version_no) values ('00000000-0000-0000-0000-00000000f0f0','00000000-0000-0000-0000-00000000b0b0',1);`);
  try {
    await db.exec(`insert into studio.challenge_eligibility (version_id, challenge, fid, decision, eligible) values ('00000000-0000-0000-0000-00000000f0f0', 'remix-2026-11', 500, 'below', true)`);
  } catch {
    refused = true;
  }
  check('a decision that contradicts itself (below, marked eligible) is refused', refused);
}

const PORT = 54377;
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
const connect = () => postgres(`postgres://postgres@127.0.0.1:${PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
let sql = connect();
/**
 * After a statement that fails on purpose, a new connection: PGlite's socket server (one connection at a time) can
 * hand the next statement's answer to the wrong query after an error, a stand-in quirk seen 2026-10-31. Production
 * Postgres answers each statement with its own result.
 */
async function reconnect() {
  await sql.end();
  sql = connect();
  S = sql as unknown as Sql;
}
const DS = await import('../src/lib/images/designs');
type Sql = Parameters<typeof DS.listDesigns>[0];
let S = sql as unknown as Sql;
const pic = (n: number) => ({ url: `https://pictures.example/${n}.jpg`, sha256: String(n).repeat(64).slice(0, 64), recipe: { prompt: 'p', model: 'z-image-turbo', endpoint: 'e', host: 'fal.ai', settings: {}, seed: 1, request_id: 'r', cost_usd: 0.003, made_at: new Date().toISOString(), width: 576, height: 768, checks: { prompt: { model: 'g', verdict: 'ok' as const }, host_safety_checker: 'passed' as const }, assist: null } });
const sheet = (text: string, n: number) => ({ title: '', text, samples: [], views: { front: pic(n) }, by_name: 'x', by_name_source: 'relay' as const, assist: null, role: null, style: null });
const bai = DS.bookCharacter('bai')!;
const zeiC = DS.bookCharacter('zei')!;
// Before the window: the starting sheets.
const baiStart = await DS.makeDesign(S, { fid: 6786, mode: 'create', kind: 'character', character: bai, body: sheet('Eighteen, sharp eyes', 1) });
const zeiStart = await DS.makeDesign(S, { fid: 6852, mode: 'create', kind: 'character', character: zeiC, body: sheet('Eighteen, slight', 2) });
// The challenge, in a window around now (the config is the one place dates live; the test moves it here).
const E = await import('../src/lib/challenge/entries');
const realDates = { ...CHALLENGE.dates };
await new Promise((r) => setTimeout(r, 20));
CHALLENGE.dates.opens = new Date().toISOString();
CHALLENGE.dates.closes = new Date(Date.now() + 3_600_000).toISOString();
CHALLENGE.entries = true;
// Stored check decisions (owner, 2026-11-04): 500 passed, 501 did not; no score is kept anywhere.
await sql`insert into studio.check_decisions (network, account, threshold, passed) values ('farcaster', '500', 'neynar-score>=0.7', true), ('farcaster', '501', 'neynar-score>=0.7', false)`;
const Rec = await import('../src/lib/challenge/record');
// Every outside call is recorded (and answered "unavailable"): publishing may ask Neynar once; viewing never may.
const realFetch = globalThis.fetch;
const calls: string[] = [];
globalThis.fetch = (async (u: string | URL | Request) => {
  calls.push(String(u instanceof Request ? u.url : u));
  return new Response('{}', { status: 503 });
}) as typeof fetch;
process.env.NEYNAR_API_KEY = 'test-key-not-real';
/** Publish as the route does: the version, then its eligibility, decided once and stored. */
const { PRIVACY: P0 } = await import('../src/lib/legal');
const privacySaid = structuredClone(P0);
(privacySaid.sections.find((x) => x.n === 4)!.body[1] as string[]).push('If you take part in the remix challenge: …');
async function publish(m: Parameters<typeof DS.makeDesign>[1]) {
  const out = await DS.makeDesign(S, m);
  await Rec.recordEligibility(S, out.versionId, m.fid, new Date(), privacySaid);
  return out;
}
const f500a = await publish({ fid: 500, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai, older', 3) });
const f500b = await publish({ fid: 500, mode: 'version', kind: 'character', fromVersionId: f500a.versionId, body: sheet('Bai, older, scar', 4) });
const f501 = await publish({ fid: 501, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai, low score', 5) });
const fAdmin = await publish({ fid: 193912, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet('Zei, by an admin', 6) });
const f6852 = await publish({ fid: 6852, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet('Zei, invited', 7) });
const fOfEntry = await publish({ fid: 6852, mode: 'fork', kind: 'character', fromVersionId: f500a.versionId, body: sheet('Bai, from an entry', 8) });
const f502 = await publish({ fid: 502, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet('Zei, Neynar down', 9) });
const fScratch = await publish({ fid: 503, mode: 'create', kind: 'character', character: zeiC, body: sheet('Zei from scratch', 10) });
check('publishing asked Neynar only for the one maker it had no stored decision for (502), once', calls.length === 1 && calls[0].includes('api.neynar.com') && calls[0].includes('502'), calls.join(' '));
const stored = await sql<{ version_id: string; decision: string; eligible: boolean }[]>`select version_id, decision, eligible from studio.challenge_eligibility`;
const cols = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'challenge_eligibility'`;
check('the stored decision keeps no score (owner, 2026-11-01)', !cols.some((c) => /score/.test(c.column_name)), cols.map((c) => c.column_name).join());
const dec = (v: string) => stored.find((r) => r.version_id === v);
check('stored at publish: passed (from the stored check decision), eligible', dec(f500a.versionId)?.decision === 'passed' && dec(f500a.versionId)?.eligible === true);
check('stored at publish: below (from the stored check decision), not eligible', dec(f501.versionId)?.decision === 'below' && dec(f501.versionId)?.eligible === false);
check('stored at publish: an admin', dec(fAdmin.versionId)?.decision === 'admin' && dec(fAdmin.versionId)?.eligible === false);
check('stored at publish: invited, no score asked', dec(f6852.versionId)?.decision === 'invited');
check('stored at publish: Neynar down means unchecked (not eligible)', dec(f502.versionId)?.decision === 'unchecked' && dec(f502.versionId)?.eligible === false);
check('a sheet made from scratch gets no decision (not an entry)', !dec(fScratch.versionId));
{
  // The Lens check at publish (overnight run 2026-11-05, item 4): a Lens account's remix gets its decision from the
  // shared store (network 'lens', rule 'lens-score>=1000'), or Lens is asked once and only the decision is kept.
  const { lensRule } = await import('../src/lib/social/lens-check');
  const SSI = (await import('../src/lib/config')).SOCIAL_SIGN_IN;
  const rule = lensRule(SSI.lens.minScore ?? 1000);
  const mk = async (addr: string) => (await sql<{ id: number }[]>`insert into studio.social_accounts (kind, subject, handle) values ('lens', ${addr}, 'lens/madeup') returning id`)[0].id;
  const [aPass, aFail, aNew] = ['0x' + 'a1'.repeat(20), '0x' + 'b2'.repeat(20), '0x' + 'c3'.repeat(20)];
  const [pPass, pFail, pNew] = [await mk(aPass), await mk(aFail), await mk(aNew)].map((id) => -(1_000_000_000 + Number(id)));
  await sql`insert into studio.check_decisions (network, account, threshold, passed) values ('lens', ${aPass}, ${rule}, true), ('lens', ${aFail}, ${rule}, false)`;
  let asked = 0;
  const score = async () => (asked++, 1500);
  const pub = async (fid: number, n: number) => {
    const out = await DS.makeDesign(S, { fid, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet(`Bai, by a Lens account ${n}`, 20 + n) });
    const r = await Rec.recordEligibility(S, out.versionId, fid, new Date(), privacySaid, undefined, score);
    const [row] = await sql<{ decision: string; eligible: boolean; account: string }[]>`select decision, eligible, account from studio.challenge_eligibility where version_id = ${out.versionId}`;
    return { r, row };
  };
  const yes = await pub(pPass, 1);
  const no = await pub(pFail, 2);
  check('Lens at publish: a stored pass is eligible (account lens), without asking Lens', yes.r === 'stored' && yes.row?.decision === 'passed' && yes.row.eligible && yes.row.account === 'lens' && asked === 0, JSON.stringify(yes));
  check('Lens at publish: a stored fail is below, not eligible', no.row?.decision === 'below' && no.row.eligible === false, JSON.stringify(no));
  const fresh = await pub(pNew, 3);
  const [kept] = await sql<{ passed: boolean; threshold: string }[]>`select passed, threshold from studio.check_decisions where network = 'lens' and account = ${aNew}`;
  check('Lens at publish: no decision yet, Lens asked once; only the decision is kept, under lens-score>=1000', asked === 1 && fresh.row?.decision === 'passed' && kept?.passed === true && kept.threshold === 'lens-score>=1000', JSON.stringify({ asked, fresh, kept }));
  proof('Lens at publish: a recorder that ignored the stored fail would make it eligible', no.row?.eligible !== true);
}
{
  const extra = await DS.makeDesign(S, { fid: 504, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai, before the reread', 11) });
  const unsaid = structuredClone(P0);
  const u4 = unsaid.sections.find((x) => x.n === 4)!;
  u4.body = u4.body.map((b) => (Array.isArray(b) ? b.filter((i) => !/remix challenge/i.test(i)) : b));
  const r = await Rec.recordEligibility(S, extra.versionId, 504, new Date(), unsaid);
  const [row] = await sql`select 1 from studio.challenge_eligibility where version_id = ${extra.versionId}`;
  check('nothing is stored about a maker while the Privacy page does not describe the challenge', r === 'not-stored' && !row);
  proof('a recorder that ignores the Privacy words would store it', (await Rec.recordEligibility(S, extra.versionId, 504, new Date(), privacySaid)) === 'stored');
}
calls.length = 0;
// Submit (owner, 2026-11-04): a stand-in post that links to the version's page (the route reads and checks the real one).
const spost = (versionId: string, n: number) => ({ network: 'lens' as const, id: `s${n}`, handle: 'someone', at: new Date().toISOString(), url: `https://hey.xyz/posts/s${n}`, links: [`https://snowmoon.party/references/designs/${versionId}`], writer: null });
let sn = 0;
const submit = (fid: number, v: string, now?: Date) => E.submitEntry(S, fid, v, spost(v, ++sn), now);
const st0 = await E.standing(S);
check('S5 in the database: publishing alone makes no entry', st0.entries.length === 0 && [...st0.entrants.values()].every((n) => n === 0));
check('S5 Submit needs the post link', ((r) => !r.ok && r.why === E.SUBMIT_WORDING.needsPost)(await E.submitEntry(S, 500, f500b.versionId, null)));
proof('S5 a Submit without a post that went through would be caught', (await E.standing(S)).entries.length === 0);
check('S5 Submit: only your own version', ((r) => !r.ok && r.why === E.SUBMIT_WORDING.notYours)(await submit(501, f500a.versionId)));
check('S5 Submit: not a version below the check', ((r) => !r.ok && r.why === E.SUBMIT_WORDING.notEligible)(await submit(501, f501.versionId)));
check('S5 Submit: not an admin\'s version', !(await submit(193912, fAdmin.versionId)).ok);
check('S5 Submit: not a sheet made from scratch', !(await submit(503, fScratch.versionId)).ok);
// One a Pacific day: 6852's first submission is moved back a day (as if made yesterday) before the second.
const yesterday = (fid: number) => sql`update studio.challenge_marks set marked_at = marked_at - interval '1 day' where fid = ${fid}`;
check('S5 Submit: your remix, with its post', (await submit(500, f500b.versionId)).ok && (await submit(6852, f6852.versionId)).ok && Boolean(await yesterday(6852)) && (await submit(6852, fOfEntry.versionId)).ok);
check('S5 the post is listed on the version\'s page, as a post its maker added', (await P.postsFor(S, f500b.versionId)).some((x) => x.addedBy === 500));
check('S5 Submit: the same version twice is refused', ((r) => !r.ok && r.why === E.SUBMIT_WORDING.already)(await submit(500, f500b.versionId)));
const st = await E.standing(S);
const ids = st.entries.map((e) => e.versionId);
check('entries: the submitted remix of a person with a passing score', ids.includes(f500b.versionId) && !ids.includes(f500a.versionId));
check('entries: a fork of another entry counts', ids.includes(fOfEntry.versionId));
check('entries: an invited person', ids.includes(f6852.versionId));
check('entries: not a score below the threshold', !ids.includes(f501.versionId));
check('entries: not a version whose maker could not be checked', !ids.includes(f502.versionId));
check('entries: not a new sheet made from scratch (forks only)', !ids.includes(fScratch.versionId));
check('entries: not an admin; the admin is listed apart', !ids.includes(fAdmin.versionId) && st.byAdmins.some((v) => v.versionId === fAdmin.versionId));
check('entries: not the starting sheets made before the window', !ids.includes(baiStart.versionId) && !ids.includes(zeiStart.versionId));
check('entries: what was submitted, three', ids.length === 3, ids.join());
check('entrants per character: Bai 2 (500, 6852), Zei 1 (6852), others 0, in CHALLENGE order', [...st.entrants].map(([c, n]) => `${c}:${n}`).join() === 'zei:1,gladias:0,bai:2,seila:0,deluin:0,mu:0', [...st.entrants].map(([c, n]) => `${c}:${n}`).join());
{
  // The owner's first remixes (owner, 2026-11-04) are not entries: never in the entries or the admins' list, no Entry
  // badge or admin line on their page, no count. Here an eligible person's entry and the admin's version stand in.
  const FR = CHALLENGE.firstRemixes as Record<string, readonly string[]>;
  const was = { ...FR };
  FR.zei = [fAdmin.elementId];
  FR.bai = [f6852.versionId];
  const st2 = await E.standing(S);
  const ids2 = st2.entries.map((e) => e.versionId);
  check('first remixes: never an entry, never in the admins\' list', !ids2.includes(f6852.versionId) && !st2.byAdmins.some((v) => v.versionId === fAdmin.versionId) && ids2.includes(f500b.versionId), ids2.join());
  check('first remixes: no Entry badge or admin line on their page', (await E.versionStanding(S, f6852.versionId)) === null && (await E.versionStanding(S, fAdmin.versionId)) === null);
  check('first remixes: no count (the entrant they would have been is not counted)', [...st2.entrants].map(([c, n]) => `${c}:${n}`).join() !== [...st.entrants].map(([c, n]) => `${c}:${n}`).join());
  proof('a standing that ignores the first remixes is caught', ids.includes(f6852.versionId) && st.byAdmins.some((v) => v.versionId === fAdmin.versionId));
  check('first remixes: entries.ts leaves them out of every challenge version', /\.filter\(\(v\) => inWindow\(v\.createdAt\) && !isFirstRemix\(v\)\)/.test(read('src/lib/challenge/entries.ts')));
  for (const k of Object.keys(FR)) FR[k] = was[k];
}
{
  // The remixes on /challenge and its feed (owner, 2026-11-04): every published fork of a challenge character, newest
  // first, at its newest version; never a sheet made from scratch.
  const RX = await import('../src/lib/challenge/remixes');
  const all = await RX.remixes(S as never);
  const ids = all.map((r) => r.versionId);
  check('remixes: every fork of a challenge character, at its newest version (f500 at v2), and no sheet from scratch', ids.includes(f500b.versionId) && !ids.includes(f500a.versionId) && ids.includes(f501.versionId) && ids.includes(fAdmin.versionId) && !ids.includes(baiStart.versionId) && !ids.includes(zeiStart.versionId), ids.join());
  check('remixes: newest first (by when each remix was made)', all.every((r, i) => i === 0 || all[i - 1].createdAt >= r.createdAt));
  check('remixes: each names its character', all.find((r) => r.versionId === fAdmin.versionId)?.character === 'zei' && all.find((r) => r.versionId === f501.versionId)?.character === 'bai');
  const zei = await RX.remixes(S as never, { character: 'zei' });
  check('the feed\'s filter: Zei shows only Zei\'s remixes', zei.length > 0 && zei.every((r) => r.character === 'zei'), zei.map((r) => r.character).join());
  check('the feed\'s filter: a slug that isn\'t a challenge character shows nothing', (await RX.remixes(S as never, { character: 'nobody' })).length === 0);
  const first = await RX.remixes(S as never, { limit: 2 });
  const rest = await RX.remixes(S as never, { before: RX.parseCursor(RX.cursorOf(first[first.length - 1])) });
  check('the feed\'s pages: the next page starts after the last card, with no gap and no overlap', [...first, ...rest].map((r) => r.versionId).join() === ids.join(), `${[...first, ...rest].map((r) => r.versionId).join()} / ${ids.join()}`);
  const page = await RX.remixFeed(S as never, { before: 'not-a-cursor' });
  check('the feed: a bad cursor is ignored (the newest page)', page.cards.map((r) => r.versionId).join() === ids.slice(0, RX.FEED_PAGE).join() && page.next === null);
  const wrong = [...first, ...(await RX.remixes(S as never, { before: RX.parseCursor(RX.cursorOf(first[0])) }))].map((r) => r.versionId);
  proof('a page cut at the wrong card (an overlap) is caught', new Set(wrong).size !== wrong.length || wrong.join() !== ids.join());
}
check('three entrants are needed (CHALLENGE.minEntrants)', CHALLENGE.minEntrants === 3 && !R.enoughEntrants(2) && R.enoughEntrants(3));
proof('a count that adds one person twice is caught', R.entrantCounts([{ person: 1, character: 'bai' }, { person: 1, character: 'bai' }]).get('bai') === 1);
check('the version page: Entry once submitted, Submit offered on an unsubmitted remix, the admin line on the admin\'s', (await E.versionStanding(S, f500b.versionId))?.kind === 'entry' && (await E.versionStanding(S, f500a.versionId))?.kind === 'candidate' && (await E.versionStanding(S, fAdmin.versionId))?.kind === 'admin' && (await E.versionStanding(S, f501.versionId)) === null);
// One a day in the database: a 2nd the same Pacific day refused; the next day allowed; no total cap; Bai's count is
// people, not submissions. Days are made by moving a person's rows back a day (as if submitted yesterday).
{
  const f500c = await publish({ fid: 500, mode: 'version', kind: 'character', fromVersionId: f500b.versionId, body: sheet('Bai, older, scar, coat', 12) });
  const f500d = await publish({ fid: 500, mode: 'version', kind: 'character', fromVersionId: f500c.versionId, body: sheet('Bai, older, scar, hat', 13) });
  const again = await submit(500, f500a.versionId);
  check('S6 a 2nd submission the same Pacific day is refused in the database, saying why', !again.ok && again.why === E.SUBMIT_WORDING.today, JSON.stringify(again));
  const [n1] = await sql<{ n: number }[]>`select count(*)::int as n from studio.challenge_marks where fid = 500`;
  check('S6 and nothing was written for it', n1.n === 1, String(n1.n));
  check('S6 Submit answers how many are left today (none after one)', (await E.mySubmissions(S, 500)).left === 0);
  await yesterday(500);
  check('S6 the next day it goes through', (await submit(500, f500a.versionId)).ok);
  await yesterday(500);
  check('S6 and the day after, three of one character by one person (no total cap)', (await submit(500, f500c.versionId)).ok);
  const st6 = await E.standing(S);
  check('S6 three entries by one person count once for the minimum: Bai has 2 entrants', st6.entrants.get('bai') === 2 && st6.entries.filter((e) => e.person === 500).length === 3, String(st6.entrants.get('bai')));
  check('S6 the equal share is per person: 500 and 6852, once each', [...R.equalSharePeople(st6.entries)].sort().join() === '500,6852');
  // Two Submits at once can't both pass: the code takes a per-person lock before counting.
  const ent = read('src/lib/challenge/entries.ts');
  const locked = (src: string) => /pg_advisory_xact_lock\(hashtext\('snowmoon\.challenge\.submit'\), \$\{fid\}::int\)`;\s*\/\/[^\n]*\n\s*const theirs = await tx/.test(src);
  check('S6 the day is checked under a per-person lock, in the same transaction as the insert', locked(ent));
  proof('S6 a day checked without the lock is caught', !locked(ent.replace("hashtext('snowmoon.challenge.submit')", "hashtext('elsewhere')")));
  // Withdraw (0038_challenge_daily.sql): until entries close; the row stays (withdrawn_at), and so does that day's use.
  check('S7 withdraw: only your own', !(await E.withdrawEntry(S, 501, f500c.versionId)).ok);
  check('S7 withdraw: the submission is no longer an entry; its post stays listed', (await E.withdrawEntry(S, 500, f500c.versionId)).ok && (await E.versionStanding(S, f500c.versionId))?.kind === 'candidate' && (await P.postsFor(S, f500c.versionId)).length === 1);
  const [kept] = await sql<{ n: number }[]>`select count(*)::int as n from studio.challenge_marks where fid = 500 and version_id = ${f500c.versionId} and withdrawn_at is not null`;
  check('S7 the withdrawn submission stays on record (withdrawn_at set, nothing deleted)', kept.n === 1, String(kept.n));
  const sameDay = await submit(500, f500d.versionId);
  check('S7 withdrawing doesn\'t give back that day\'s submission', !sameDay.ok && sameDay.why === E.SUBMIT_WORDING.today, JSON.stringify(sameDay));
  check('S7 withdrawing twice changes nothing', !(await E.withdrawEntry(S, 500, f500c.versionId)).ok);
  await yesterday(500);
  check('S7 the next day another goes through', (await submit(500, f500d.versionId)).ok);
  check('S7 withdrawing after the close is refused', !(await E.withdrawEntry(S, 500, f500d.versionId, new Date(Date.parse(CHALLENGE.dates.closes)))).ok);
  await sql`revoke update (withdrawn_at) on studio.challenge_marks from studio_writer`;
  await sql`set role studio_writer`;
  const noGrant = await E.withdrawEntry(S, 500, f500d.versionId);
  // PGlite is one session behind its socket: the role stays until reset.
  await sql`reset role`;
  await reconnect();
  await sql`grant update (withdrawn_at) on studio.challenge_marks to studio_writer`;
  check('S7 before 0038_challenge_daily.sql is applied, withdrawing says "not available yet"', !noGrant.ok && noGrant.why === E.SUBMIT_WORDING.withdrawNotYet, JSON.stringify(noGrant));
  // Put 500's entries back as the checks below expect them: f500b only.
  await E.withdrawEntry(S, 500, f500a.versionId);
  await E.withdrawEntry(S, 500, f500d.versionId);
  await yesterday(500);
}
// The publish confirmation (owner, 2026-11-03; Submit, 2026-11-04): a remix that can be entered says to submit it; Neynar down says it can't.
{
  const e = await E.publishStanding(S, f500a.versionId);
  const u = await E.publishStanding(S, f502.versionId);
  check('e2 at publish, a remix that can be entered is told to submit it', e?.kind === 'candidate' && e.character === 'bai', JSON.stringify(e));
  check('i at publish, a version Neynar couldn\'t check is told it won\'t count', u?.kind === 'unchecked' && u.character === 'zei', JSON.stringify(u));
  check('at publish, a score below the check, an admin\'s and a new sheet get no line', (await E.publishStanding(S, f501.versionId)) === null && (await E.publishStanding(S, fAdmin.versionId)) === null && (await E.publishStanding(S, fScratch.versionId)) === null);
}
await E.startingSheets(S, 'bai');
check('viewing pages (the challenge, version pages, starting sheets) made no outside call at all', calls.length === 0, calls.join(' '));
{
  const Ny = await import('../src/lib/images/neynar');
  await Ny.checkNeynar(S, 777, 0.7);
  proof('a Neynar lookup during a page view would be caught', calls.some((u) => u.includes('api.neynar.com')));
  calls.length = 0;
  const pageCode = ['src/lib/challenge/entries.ts', 'src/lib/challenge/remixes.ts', 'src/app/challenge/page.tsx', 'src/app/challenge/rules/page.tsx', 'src/app/challenge/remixes/page.tsx', 'src/lib/challenge/rules-view.ts', 'src/lib/challenge/remixes-view.ts', 'src/app/references/designs/[id]/page.tsx'].map((f) => ({ f, t: read(f) }));
  const asks = (t: string) => /from '[^']*(images\/neynar|challenge\/record|checks\/decisions)'|\bcheckNeynar\(|\bdecide\(|recordEligibility\(/.test(t);
  check('no page-side code imports the Neynar lookup or the publish-time recorder', pageCode.every((x) => !asks(x.t)), pageCode.filter((x) => asks(x.t)).map((x) => x.f).join());
  proof('a page that imports the lookup is caught', asks("import { checkNeynar } from '../images/neynar';"));
}
const st2 = await E.standing(S);
check('Submit after the window closes is refused', !(await submit(500, f500a.versionId, new Date(Date.parse(CHALLENGE.dates.closes)))).ok);
{
  const early = await submit(500, f500a.versionId, new Date(Date.parse(CHALLENGE.dates.opens) - 1));
  const late = await submit(500, f500a.versionId, new Date(Date.parse(CHALLENGE.dates.closes)));
  check('h Submit before the open says when entries open, not "Entries are closed"', !early.ok && early.why === E.SUBMIT_WORDING.opens() && /^Entries open /.test(early.why) && !late.ok && late.why === E.SUBMIT_WORDING.closed, JSON.stringify(early));
  proof('h a refusal before the open that says "closed" is caught', ((w: string) => /^Entries open /.test(w))(E.SUBMIT_WORDING.closed) === false);
}
// The submit route needs a post address, read and checked as "Add where you posted it" does, before Submit.
{
  const route = read('src/app/api/challenge/submit/route.ts');
  const needs = (src: string) => /if \(body\.url === undefined && body\.castHash === undefined\) return no\(SUBMIT_WORDING\.needsPost, 400\);/.test(src) && /const got = await verifiedPost\(read\.ref, versionId\);\s*if \(!got\.ok\) return no\(got\.why, got\.status\);[\s\S]*?const r = await submitEntry\(sql, fid, versionId, got\.post\);/.test(src);
  check('S8 the submit route requires the post link and checks it links to the version (verifiedPost) before Submit', needs(route));
  proof('S8 a route that submits without checking the post is caught', !needs(route.replace('const got = await verifiedPost(read.ref, versionId);', 'const got = { ok: true as const, post: null as never };')));
}
check('the sheets to start from are those made before the window', (await E.startingSheets(S, 'bai')).map((s) => s.versionId).join() === baiStart.versionId);

// The three bases in the database: forks of each base count, a fork of an entry counts, a sheet from scratch and a
// fork of a sheet that isn't a base don't; the list to start from is the bases, in order. Then everything made here is
// hidden and the bases emptied again, so the checks below see what they saw before.
{
  const committedMax = CHALLENGE.maxBases;
  CHALLENGE.maxBases = 3; // the rule with three bases; one is committed (owner, 2026-11-04)
  const countsWere = { ...CHALLENGE.baseCount }; // the rule with three bases for any character
  for (const c of CHALLENGE.characters) CHALLENGE.baseCount[c] = 3;
  const made: string[] = [];
  // Each remix is submitted by its maker right after publishing (owner, 2026-11-04: only Submit makes an entry); a
  // version that can't be entered is refused, as on the site.
  const mk = async (m: Parameters<typeof DS.makeDesign>[1]) => { const o = await publish(m); made.push(o.elementId); if (m.mode === 'fork') await submit(m.fid, o.versionId); return o; };
  const b1 = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: sheet('Bai, base one', 21) });
  const b2 = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: sheet('Bai, base two', 22) });
  const b3 = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: sheet('Bai, base three', 23) });
  const b2v2 = await DS.makeDesign(S, { fid: 6786, mode: 'version', kind: 'character', fromVersionId: b2.versionId, body: sheet('Bai, base two, v2', 24) });
  CHALLENGE.bases.bai = [b1.elementId, b2.elementId, b3.versionId];
  await sql`insert into studio.check_decisions (network, account, threshold, passed) select 'farcaster', f::text, 'neynar-score>=0.7', true from generate_series(510, 516) f on conflict do nothing`;
  const calls0 = calls.length;
  const g1 = await mk({ fid: 510, mode: 'fork', kind: 'character', fromVersionId: b1.versionId, body: sheet('Bai from base one', 25) });
  const g2 = await mk({ fid: 511, mode: 'fork', kind: 'character', fromVersionId: b2v2.versionId, body: sheet('Bai from base two, v2', 26) });
  const g3 = await mk({ fid: 512, mode: 'fork', kind: 'character', fromVersionId: b3.versionId, body: sheet('Bai from base three', 27) });
  const gE = await mk({ fid: 513, mode: 'fork', kind: 'character', fromVersionId: g1.versionId, body: sheet('Bai from an entry', 28) });
  const gEE = await mk({ fid: 516, mode: 'fork', kind: 'character', fromVersionId: gE.versionId, body: sheet('Bai from a remix of an entry', 29) });
  const gScratch = await mk({ fid: 514, mode: 'create', kind: 'character', character: bai, body: sheet('Bai from scratch', 30) });
  const gOther = await mk({ fid: 515, mode: 'fork', kind: 'character', fromVersionId: baiStart.versionId, body: sheet('Bai from a sheet that is not a base', 31) });
  check('bases: publishing asked no one anything (the scores were known)', calls.length === calls0, calls.slice(calls0).join(' '));
  const st5 = await E.standing(S);
  const ids5 = st5.entries.map((e) => e.versionId);
  check('bases: a fork of each of the three bases counts (element id; a later version of a base; a version id)', [g1, g2, g3].every((g) => ids5.includes(g.versionId)));
  check('bases: a fork of an entry counts, and a fork of that', ids5.includes(gE.versionId) && ids5.includes(gEE.versionId));
  check('bases: a new sheet made from scratch still does not count', !ids5.includes(gScratch.versionId));
  check('bases: a fork of a sheet that is not one of the bases does not count', !ids5.includes(gOther.versionId) && !ids5.includes(f500a.versionId) && !ids5.includes(f500b.versionId));
  check('bases: nothing is stored for a version that does not count', !(await sql`select 1 from studio.challenge_eligibility where version_id in ${sql([gScratch.versionId, gOther.versionId])}`).length);
  check('bases: Bai\'s entrants are the five who started from a base or a remix of one (6852 forked an entry that is no longer from a base)', st5.entrants.get('bai') === 5, String(st5.entrants.get('bai')));
  check('bases: Zei, with no bases yet, counts as before', st5.entrants.get('zei') === 1);
  const starts = await E.startingSheets(S, 'bai');
  check('bases: the list to start from is the three bases, newest first, the element-id base at its newest version', starts.map((x) => x.versionId).join() === [b2v2.versionId, b3.versionId, b1.versionId].join(), starts.map((x) => x.versionId).join());
  CHALLENGE.bases.bai = [b1.elementId, zeiStart.elementId, '00000000-0000-4000-8000-000000000000'];
  check('bases: an id that is another character\'s sheet, or no sheet, is left out of the list', (await E.startingSheets(S, 'bai')).map((x) => x.versionId).join() === b1.versionId);
  CHALLENGE.bases.bai = [];
  check('bases: empty again, the list is the sheets made before the window, as before', (await E.startingSheets(S, 'bai')).map((x) => x.versionId).join() === baiStart.versionId);
  await sql`update studio.elements set status = 'hidden' where id in ${sql(made)}`;
  await sql`delete from studio.challenge_eligibility where version_id in (select v.id from studio.element_versions v where v.element_id in ${sql(made)})`;
  const st6 = await E.standing(S);
  check('bases: with the bases empty and the test sheets hidden, the entries are as before', st6.entries.map((e) => e.versionId).sort().join() === st2.entries.map((e) => e.versionId).sort().join());
  CHALLENGE.maxBases = committedMax;
  for (const c of CHALLENGE.characters) CHALLENGE.baseCount[c] = countsWere[c];
}

// Publish uses the stored check decision (owner, 2026-11-04): a current pass (up to 90 days old) is used with no
// lookup; once withdrawn (a report or hide), or after 90 days, publishing asks Neynar again. Everything made here is
// hidden and its decisions deleted afterwards, so the checks below see what they saw before.
{
  const CD = await import('../src/lib/checks/decisions');
  const made: string[] = [];
  const mk = async (fid: number, n: number) => { const o = await publish({ fid, mode: 'fork', kind: 'character', fromVersionId: zeiStart.versionId, body: sheet(`Zei, check ${n}`, 60 + n) }); made.push(o.elementId); return o; };
  const decisionOf = async (v: string) => (await sql`select decision from studio.challenge_eligibility where version_id = ${v}`)[0]?.decision;
  await sql`insert into studio.check_decisions (network, account, threshold, passed, decided_at) values ('farcaster', '530', 'neynar-score>=0.7', true, now() - interval '89 days 23 hours')`;
  calls.length = 0;
  const p1 = await mk(530, 1);
  check('publish: a pass 89 days 23 hours old is used, with no Neynar lookup', calls.length === 0 && (await decisionOf(p1.versionId)) === 'passed', `${calls.length} ${await decisionOf(p1.versionId)}`);
  await CD.markForRecheck(S, 'farcaster', 530);
  calls.length = 0;
  const p2 = await mk(530, 2);
  check('publish: after a report or hide withdrew the pass, Neynar is asked again (here it is down: unchecked)', calls.length === 1 && calls[0].includes('fids=530') && (await decisionOf(p2.versionId)) === 'unchecked', `${calls.join(' ')} ${await decisionOf(p2.versionId)}`);
  await sql`insert into studio.check_decisions (network, account, threshold, passed, decided_at) values ('farcaster', '531', 'neynar-score>=0.7', true, now() - interval '90 days 1 minute')`;
  calls.length = 0;
  await mk(531, 3);
  check('publish: a pass older than 90 days is not used; Neynar is asked', calls.length === 1 && calls[0].includes('fids=531'), calls.join(' '));
  await sql`insert into studio.check_decisions (network, account, threshold, passed) values ('farcaster', '532', 'neynar-score>=0.5', true)`;
  calls.length = 0;
  await mk(532, 4);
  check('publish: a pass under another threshold is not used; Neynar is asked', calls.length === 1 && calls[0].includes('fids=532'), calls.join(' '));
  await sql`insert into studio.check_decisions (network, account, threshold, passed, decided_at) values ('farcaster', '533', 'neynar-score>=0.7', false, now() - interval '23 hours')`;
  calls.length = 0;
  const p5 = await mk(533, 5);
  check('publish: a fail under 24 hours old is used (below), with no lookup', calls.length === 0 && (await decisionOf(p5.versionId)) === 'below');
  {
    // Planted: a recorder that asks Neynar itself instead of the stored decision.
    const rec = read('src/lib/challenge/record.ts');
    const uses = (t: string) => /await checkNeynar\(sql, fid, CHALLENGE_LISTS\.min\)/.test(t) && !/fetch\(|NEYNAR\.url/.test(t);
    check('the recorder asks only through the stored-decision check', uses(rec));
    proof('a recorder that fetches Neynar itself is caught', !uses(rec.replace('await checkNeynar(sql, fid, CHALLENGE_LISTS.min)', 'await fetch(NEYNAR.url)')));
    const ny = read('src/lib/images/neynar.ts');
    const first = (t: string) => t.indexOf('await keptDecision(sql, fid, min)') > 0 && t.indexOf('await keptDecision(sql, fid, min)') < t.indexOf('await askNeynar(fid)');
    check('the check reads the stored decision before it asks Neynar', first(ny));
    proof('a check that asks Neynar first is caught', !first(ny.replace('const kept = await keptDecision(sql, fid, min);', 'const kept = null as null | { passed: boolean; decidedAt: Date };')));
  }
  await sql`update studio.elements set status = 'hidden' where id in ${sql(made)}`;
  await sql`delete from studio.challenge_eligibility where version_id in (select v.id from studio.element_versions v where v.element_id in ${sql(made)})`;
  await sql`delete from studio.check_decisions where account in ('530', '531', '532', '533')`;
}

// Closed-model bases, the bases' style order and an admin's remix, in the database (owner, 2026-11-04). Everything made
// here is hidden and the settings put back afterwards, so the checks below see what they saw before.
{
  const committedMax2 = CHALLENGE.maxBases;
  CHALLENGE.maxBases = 3; // the rule with several bases; one is committed (owner, 2026-11-04)
  const countsWere = { ...CHALLENGE.baseCount }; // the rule with three bases for any character
  for (const c of CHALLENGE.characters) CHALLENGE.baseCount[c] = 3;
  const made: string[] = [];
  // Each remix is submitted by its maker right after publishing (owner, 2026-11-04: only Submit makes an entry); a
  // version that can't be entered is refused, as on the site.
  const mk = async (m: Parameters<typeof DS.makeDesign>[1]) => { const o = await publish(m); made.push(o.elementId); if (m.mode === 'fork') await submit(m.fid, o.versionId); return o; };
  const styled = (text: string, n: number, title: string) => ({ ...sheet(text, n), style: { version_id: '00000000-0000-4000-8000-0000000000aa', title } });
  const closedPic = (n: number) => ({ ...pic(n), recipe: { ...pic(n).recipe, model: 'gpt-image-2.5-sunburst', endpoint: 'openai/gpt-image-2.5-sunburst', host: 'Vercel AI Gateway', checks: { prompt: { model: IMAGES.guardModel, verdict: 'ok' as const }, host_safety_checker: 'not run' as const } } });
  const bA = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: styled('Bai, Printed', 41, 'Printed') });
  const bB = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: styled('Bai, Bolder', 42, 'Bolder') });
  const bC = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: styled('Bai, Mood', 43, 'Mood') });
  const bX = await mk({ fid: 6786, mode: 'create', kind: 'character', character: bai, body: { ...styled('Bai, closed concept', 44, 'Bolder'), views: { front: closedPic(44) } } });
  const zA = await mk({ fid: 6786, mode: 'create', kind: 'character', character: zeiC, body: styled('Zei, Mood', 45, 'Mood') });
  const zB = await mk({ fid: 6786, mode: 'create', kind: 'character', character: zeiC, body: styled('Zei, Printed', 46, 'Printed') });
  const zC = await mk({ fid: 6786, mode: 'create', kind: 'character', character: zeiC, body: styled('Zei, Bolder', 47, 'Bolder') });
  const [xr] = await sql`select body from studio.element_versions where id = ${bX.versionId}`;
  check('closed bases: the publish path accepts a sheet whose recipe names a closed model, as recorded', (xr?.body as { views: { front: { recipe: { model: string } } } })?.views.front.recipe.model === 'gpt-image-2.5-sunburst');
  CHALLENGE.bases.bai = [bA.elementId, bB.elementId, bC.elementId];
  CHALLENGE.bases.zei = [zA.elementId, zB.elementId, zC.elementId];
  const order = async (c: string) => (await E.startingSheets(S, c)).map((x) => x.style).join();
  check('style order: with CHALLENGE.baseStyles empty, the bases are newest first', (await order('bai')) === 'Mood,Bolder,Printed' && (await order('zei')) === 'Bolder,Printed,Mood', `${await order('bai')} / ${await order('zei')}`);
  CHALLENGE.baseStyles = ['Bolder', 'Printed', 'Mood'];
  check('style order: each character\'s bases follow CHALLENGE.baseStyles, the same for both, so the casts line up', (await order('bai')) === 'Bolder,Printed,Mood' && (await order('zei')) === 'Bolder,Printed,Mood', `${await order('bai')} / ${await order('zei')}`);
  await sql`insert into studio.check_decisions (network, account, threshold, passed) select 'farcaster', f::text, 'neynar-score>=0.7', true from generate_series(520, 523) f on conflict do nothing`;
  const eOld = await mk({ fid: 520, mode: 'fork', kind: 'character', fromVersionId: bB.versionId, body: styled('Bai from Bolder', 48, 'Mood') });
  await new Promise((r) => setTimeout(r, 15));
  const eNew = await mk({ fid: 521, mode: 'fork', kind: 'character', fromVersionId: bC.versionId, body: styled('Bai from Mood', 49, 'Bolder') });
  const ent = (await E.standing(S)).entries;
  check('style order: the entries stay newest first, whatever their style', ent.findIndex((e) => e.versionId === eNew.versionId) < ent.findIndex((e) => e.versionId === eOld.versionId) && ent.findIndex((e) => e.versionId === eOld.versionId) >= 0);
  // An admin's remix of a base isn't an entry, but it is "someone else's remix": a fork of it counts.
  const adm = await mk({ fid: 6786, mode: 'fork', kind: 'character', fromVersionId: bA.versionId, body: styled('Bai, the admin\'s remix', 50, 'Printed') });
  const fromAdm = await mk({ fid: 522, mode: 'fork', kind: 'character', fromVersionId: adm.versionId, body: styled('Bai from the admin\'s remix', 51, 'Printed') });
  const st7 = await E.standing(S);
  check('an admin\'s remix of a base is not an entry (shown as the admin\'s)', !st7.entries.some((e) => e.versionId === adm.versionId) && st7.byAdmins.some((e) => e.versionId === adm.versionId));
  check('a fork of an admin\'s remix of a base counts (someone else\'s remix need not be an entry)', st7.entries.some((e) => e.versionId === fromAdm.versionId));
  // A closed-model base, before and after CHALLENGE.closedBasesAllowed (on as committed for the launch; turned off here
  // to prove the switch still holds them back).
  const closedAsCommitted = CHALLENGE.closedBasesAllowed;
  CHALLENGE.closedBasesAllowed = false;
  CHALLENGE.bases.bai = [bA.elementId, bB.elementId, bX.elementId];
  const starts = async () => (await E.startingSheets(S, 'bai')).map((x) => x.versionId);
  check('closed bases: while not allowed, a closed-model base is left out of "Bases to start from"', !(await starts()).includes(bX.versionId) && (await starts()).length === 2);
  const fX = await mk({ fid: 523, mode: 'fork', kind: 'character', fromVersionId: bX.versionId, body: styled('Bai from the closed concept', 52, 'Bolder') });
  check('closed bases: while not allowed, a fork of a closed-model base is not an entry, and nothing is stored for it', !(await E.standing(S)).entries.some((e) => e.versionId === fX.versionId) && !(await sql`select 1 from studio.challenge_eligibility where version_id = ${fX.versionId}`).length);
  CHALLENGE.closedBasesAllowed = true;
  check('closed bases: once allowed, the closed-model base is listed, in its style\'s place (Bolder, newest first within it)', (await starts()).join() === [bX.versionId, bB.versionId, bA.versionId].join(), (await starts()).join());
  const BA = await import('../src/lib/challenge/bases');
  check('closed bases: once allowed, none is refused', (await BA.refusedBases(S as never)).size === 0);
  CHALLENGE.closedBasesAllowed = false;
  check('closed bases: the refusal names the base by its id and says why', ((await BA.refusedBases(S as never)).get(bX.elementId) ?? '').includes('a closed model by OpenAI'));
  CHALLENGE.bases.bai = [bA.elementId, bX.versionId];
  check('closed bases: a base named by its version id is refused the same way', (await BA.refusedBases(S as never)).has(bX.versionId) && !(await starts()).includes(bX.versionId));
  CHALLENGE.closedBasesAllowed = closedAsCommitted;
  CHALLENGE.bases.bai = [];
  CHALLENGE.bases.zei = [];
  CHALLENGE.baseStyles = [];
  await sql`update studio.elements set status = 'hidden' where id in ${sql(made)}`;
  await sql`delete from studio.challenge_eligibility where version_id in (select v.id from studio.element_versions v where v.element_id in ${sql(made)})`;
  const st8 = await E.standing(S);
  check('closed bases: afterwards, with the settings put back, the entries are as before', st8.entries.map((e) => e.versionId).sort().join() === st2.entries.map((e) => e.versionId).sort().join());
  CHALLENGE.maxBases = committedMax2;
  for (const c of CHALLENGE.characters) CHALLENGE.baseCount[c] = countsWere[c];
}

globalThis.fetch = realFetch;

// "Posted on" in the database.
CHALLENGE.posts = true;
const post = (id: string, at: string, network: 'farcaster' | 'lens' = 'lens') => ({ network, id, handle: 'someone', at, url: network === 'lens' ? `https://hey.xyz/posts/${id}` : `https://farcaster.xyz/someone/0x0a1b2c3d`, links: [], writer: null });
// Dated after now (pre-flight 2026-11-07): the submissions above added posts dated now to this version, so fixed dates
// started failing "newest first" once the clock passed them (10:00 UTC on 7 Nov 2026).
const later = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const atA = later(1);
check('a post is kept', (await P.addPost(S, { versionId: f500b.versionId, person: 500, post: post('aaa', atA) })).ok);
const again = await P.addPost(S, { versionId: f500b.versionId, person: 501, post: post('aaa', atA) });
check('the same post is kept once per version', again.ok && !again.added);
await P.addPost(S, { versionId: f500b.versionId, person: -3, post: post('bbb', later(3)) });
const listed = await P.postsFor(S, f500b.versionId);
check('posts are listed newest first', listed.map((p) => p.url.split('/').pop()).slice(0, 2).join() === 'bbb,aaa', listed.map((p) => p.url).join());
check('only the person who added it can remove it', !(await P.removeOwnPost(S, listed[0].id, 500)) && (await P.removeOwnPost(S, listed[0].id, -3)));
let wrongHost = '';
try {
  await sql`insert into studio.version_posts (version_id, network, post_id, handle, posted_at, url, fid) values (${f500b.versionId}, 'lens', 'x', 'someone', now(), 'https://evil.example/posts/x', 5)`;
} catch (e) {
  wrongHost = (e as { code?: string }).code ?? 'error';
}
await reconnect();
check('the table refuses an address on another host', wrongHost === '23514', wrongHost);
const keepLimit = CHALLENGE.postsPerPersonPerDay;
CHALLENGE.postsPerPersonPerDay = 1;
check('a daily limit per person', !(await P.addPost(S, { versionId: f500b.versionId, person: 500, post: post('ccc', '2026-11-10T10:00:00Z') })).ok);
CHALLENGE.postsPerPersonPerDay = keepLimit;

// Free remixes in the database (0037_remix_count.sql, loaded here like every migration): reserve() counts remixes, not
// pictures, under the person's lock; a closed remix counts three; admins and invited makers keep counting pictures.
{
  const Lm = await import('../src/lib/images/limits');
  const spend = (id: string, starts: boolean, units = 1, slot: 'front' | 'side' | 'back' = 'front') => ({ model: IMAGES.editModel, reserveUsd: IMAGES.editReserveUsd(1), remix: { id, units, starts, slot } });
  const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const fid = 900001;
  const r1 = await Lm.reserve(S, fid, spend(rid(1), true));
  const r1s = await Lm.reserve(S, fid, spend(rid(1), false, 1, 'side'));
  const r1b = await Lm.reserve(S, fid, spend(rid(1), false, 1, 'back'));
  check('F7 a remix\'s three views use one remix (2 left)', r1.ok && r1.left === 2 && r1s.ok && r1s.left === 2 && r1b.ok && r1b.left === 2, JSON.stringify([r1, r1s, r1b]));
  const again = await Lm.reserve(S, fid, spend(rid(1), false, 1, 'side'));
  check('F7 a view made again (after a failure) stays inside the remix: still 2 left', again.ok && again.left === 2);
  check('F7 2nd and 3rd remixes start; the 4th is refused', (await Lm.reserve(S, fid, spend(rid(2), true))).ok && (await Lm.reserve(S, fid, spend(rid(3), true))).ok && ((r) => !r.ok && r.refusal === 'remix-limit')(await Lm.reserve(S, fid, spend(rid(4), true))));
  check('F7 with none left to start, the remix being made can still be finished', (await Lm.reserve(S, fid, spend(rid(3), false, 1, 'side'))).ok);
  await Lm.reserve(S, fid, spend(rid(1), false, 1, 'back'));
  await Lm.reserve(S, fid, spend(rid(1), false, 1, 'front'));
  check('F7 a remix allows six pictures; the 7th is refused', ((r) => !r.ok && r.refusal === 'remix-used')(await Lm.reserve(S, fid, spend(rid(1), false, 1, 'side'))));
  {
    // A planted cap of four in the database: the 4th then passes, so F7's check would fail.
    const D = IMAGES.designs as { remixesPerDay: number };
    D.remixesPerDay = 4;
    const planted = await Lm.reserve(S, fid, spend(rid(5), true));
    D.remixesPerDay = 3;
    proof('F7 a planted 4th remix in the database is caught', planted.ok);
  }
  const [pics] = await sql<{ n: number }[]>`select count(*)::int as n from studio.image_asks where fid = ${fid}`;
  check('F7 a remixer\'s views are not counted as pictures (the 10 a day stay for passage images)', pics.n === 0 && (await Lm.generationsLeft(S, fid)) === IMAGES.generationsPerDay);
  check('F7 the form is told how many remixes are left', (await Lm.remixesLeftToday(S, fid)) === 0 && (await Lm.remixesLeftToday(S, 900002)) === 3);
  const closed = await Lm.reserve(S, 900002, spend(rid(10), true, 3));
  check('F8 a closed remix counts three: it starts, then no other starts that day', closed.ok && closed.left === 0 && ((r) => !r.ok && r.refusal === 'remix-limit')(await Lm.reserve(S, 900002, spend(rid(11), true))));
  check('F8 a closed remix after an open one is refused', (await Lm.reserve(S, 900003, spend(rid(12), true))).ok && ((r) => !r.ok && r.refusal === 'remix-limit')(await Lm.reserve(S, 900003, spend(rid(13), true, 3))));
  const adm = await Lm.reserve(S, ADMINS[0], spend(rid(20), true));
  const [admPics] = await sql<{ n: number }[]>`select count(*)::int as n from studio.image_asks where fid = ${ADMINS[0]}`;
  const [admRemix] = await sql<{ n: number }[]>`select count(*)::int as n from studio.sheet_remix_asks where fid = ${ADMINS[0]}`;
  check('F9 an admin keeps their own picture limit: their views count as pictures, not remixes', adm.ok && admPics.n === 1 && admRemix.n === 0 && (await Lm.remixesLeftToday(S, ADMINS[0])) === null);
  // A Bluesky account's remix (its number at or below -1,000,000,000) is counted as a remix, not charged as a wallet,
  // once it passes the Bluesky check (signin-lens-bluesky and bluesky-check merged in, 2026-11-05: a Bluesky account
  // that doesn't pass gets no free remixes, Terms §4). Made-up account; a pass planted in the decision store.
  const SSI = (await import('../src/lib/config')).SOCIAL_SIGN_IN as unknown as { bluesky: { check: { on: boolean } } };
  const wasOn = SSI.bluesky.check.on;
  SSI.bluesky.check.on = true;
  const { thresholdKey } = await import('../src/lib/social/bluesky-check');
  const [skyAcc] = await sql<{ id: number }[]>`insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:remixcountaaaaaaaaaa2345', 'remixcount.bsky.social') returning id`;
  const [idleAcc] = await sql<{ id: number }[]>`insert into studio.social_accounts (kind, subject, handle) values ('bluesky', 'did:plc:remixidleaaaaaaaaaaa2345', 'remixidle.bsky.social') returning id`;
  await sql`insert into studio.check_decisions (network, account, threshold, passed) values ('bluesky', 'did:plc:remixcountaaaaaaaaaa2345', ${thresholdKey()}, true), ('bluesky', 'did:plc:remixidleaaaaaaaaaaa2345', ${thresholdKey()}, false)`;
  const sky = -(1_000_000_000 + Number(skyAcc.id));
  const idle = -(1_000_000_000 + Number(idleAcc.id));
  const idleR = await Lm.reserve(S, idle, spend(rid(24), true));
  check('F9c a Bluesky account that didn\'t pass the Bluesky check gets no free remix', !idleR.ok && idleR.refusal === 'no-free', JSON.stringify(idleR));
  const skyR = await Lm.reserve(S, sky, spend(rid(22), true));
  SSI.bluesky.check.on = wasOn;
  const [skyRemix] = await sql<{ n: number }[]>`select count(*)::int as n from studio.sheet_remix_asks where fid = ${sky}`;
  check('F9b a Bluesky account that passes: its remix view counts as a remix (2 left), not a wallet\'s balance', skyR.ok && skyR.left === 2 && skyRemix.n === 1 && (await Lm.remixesLeftToday(S, sky)) === 2, JSON.stringify(skyR));
  const wal = await Lm.reserve(S, -4242, spend(rid(23), true));
  check('F9b a wallet account\'s view still goes to its balance (none here: refused)', !wal.ok && wal.refusal === 'balance', JSON.stringify(wal));
  const inv = await Lm.reserve(S, 6852, spend(rid(21), true));
  check('F9 an invited maker keeps counting pictures', inv.ok && (await Lm.remixesLeftToday(S, 6852)) === null && ((await sql`select 1 from studio.sheet_remix_asks where fid = 6852`).length === 0));
  const [costs] = await sql<{ usd: number }[]>`select coalesce(sum(cost_usd), 0)::float8 as usd from studio.image_costs where kind = 'reserved' and funded = 'free'`;
  check('F9 every remix view still reserves its worst case against the site-wide spend cap', costs.usd > 0);
  const remixCols = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'studio' and table_name = 'sheet_remix_asks' order by ordinal_position`;
  check('F9 the remix table keeps no prompt, picture or cost', remixCols.map((c) => c.column_name).join() === 'id,remix,fid,units,slot,at', remixCols.map((c) => c.column_name).join());
  let badUnits = '';
  try {
    await sql`insert into studio.sheet_remix_asks (remix, fid, units, slot) values (${rid(30)}, 900009, 2, 'front')`;
  } catch (e) {
    badUnits = (e as { code?: string }).code ?? 'error';
  }
  await reconnect();
  check('F9 the table refuses units other than 1 or 3', badUnits === '23514', badUnits);
  // Who (owner, 2026-11-04): an FID or a Bluesky account (at or below -1,000,000,000), never a wallet's number.
  const fidCode = async (fid: number) => {
    try {
      await sql`insert into studio.sheet_remix_asks (remix, fid, units, slot) values (${rid(31)}, ${fid}, 1, 'front')`;
      return 'ok';
    } catch (e) {
      await reconnect();
      return (e as { code?: string }).code ?? 'error';
    }
  };
  const fidCodes = [await fidCode(900010), await fidCode(-1_000_000_001), await fidCode(-1_000_000_000), await fidCode(-500), await fidCode(-999_999_999), await fidCode(0)];
  check('F9 the remix table takes an FID and a Bluesky account, and refuses a wallet\'s number and zero', fidCodes.join() === 'ok,ok,ok,23514,23514,23514', fidCodes.join());
  await sql`delete from studio.sheet_remix_asks where remix = ${rid(31)}`;
  // Without the table (before 0037_remix_count.sql is applied), views count as pictures, as before.
  await sql`alter table studio.sheet_remix_asks rename to sheet_remix_asks_away`;
  const before = await Lm.reserve(S, 900004, spend(rid(40), true));
  const [p4] = await sql<{ n: number }[]>`select count(*)::int as n from studio.image_asks where fid = 900004`;
  check('F10 without the table, a view counts as a picture, as before', before.ok && p4.n === 1 && (await Lm.remixesLeftToday(S, 900004)) === null);
  await sql`alter table studio.sheet_remix_asks_away rename to sheet_remix_asks`;
}

// Without the tables (before the owner applies the migration): nothing breaks.
await sql`drop table studio.challenge_eligibility`;
await reconnect();
const st4 = await E.standing(S);
await reconnect();
check('without the eligibility table, only invited makers\' submissions count (no score is ever looked up on a page)', st4.entries.length === 2 && st4.entries.every((e) => e.person === 6852), st4.entries.map((e) => `${e.person}:${e.title}`).join());
await sql`drop table studio.challenge_marks`;
await sql`drop table studio.version_posts`;
await reconnect();
const st3 = await E.standing(S);
await reconnect();
check('without the marks table, nothing is an entry', st3.entries.length === 0);
const nm = await submit(6852, f6852.versionId);
await reconnect();
check('without the marks table, Submit says "not available yet"', !nm.ok && nm.why === E.SUBMIT_WORDING.notYet, JSON.stringify(nm));
check('without the posts table, nothing is listed', (await P.postsFor(S, f500b.versionId)).length === 0);
await reconnect();
// A stand-in database without the table (PGlite's socket server can stall a connection after a run of failed
// statements, a stand-in quirk; production Postgres answers each with its error, as this stand-in does).
const missingTable = (() => Promise.reject(Object.assign(new Error('relation "studio.version_posts" does not exist'), { code: '42P01' }))) as unknown as Sql;
const np = await P.addPost(missingTable, { versionId: f500b.versionId, person: 500, post: post('ddd', '2026-11-10T10:00:00Z') });
check('without the posts table, adding says "not available yet"', !np.ok && np.why === P.POSTS_WORDING.notYet);

// Switched off (as shipped): nothing is shown or asked.
CHALLENGE.entries = false;
check('entries off: nothing listed, no badge', (await E.standing(S)).entries.length === 0 && (await E.versionStanding(S, f500b.versionId)) === null);
Object.assign(CHALLENGE.dates, realDates);
await sql.end();
await server.stop();

// As committed, the switches are off until the owner's reread.
const cfg = read('src/lib/config.ts');
check('as committed, CHALLENGE.entries, posts and openSheets are on (owner\'s reread 2026-11-01; openSheets still waits for the window)', /\n  entries: true as boolean,\n  posts: true as boolean,/.test(cfg) && /\n  openSheets: true as boolean,/.test(cfg));

// --- Launch rehearsal fixes (2026-11-02; docs/launch-rehearsal-2026-11.md) ----------------------------------------
{
  const page = read('src/app/references/designs/[id]/page.tsx');
  const IW = (await import('../src/lib/images/wording')).IMAGE_WORDING.designs.page;
  // R1: a starting sheet's page called it "the project's starting style".
  const draftedLine = (src: string) => /body\.assist && <p className="dz-meta dz-drafted">\{style \? W\.page\.drafted : W\.page\.draftedSheet\}<\/p>/.test(src);
  check('R1 a sheet drafted by the coding agent says "starting sheet", a style "starting style"', draftedLine(page) && /starting sheet/.test(IW.draftedSheet) && !/style/.test(IW.draftedSheet) && /starting style/.test(IW.drafted));
  proof('R1 the style line shown on every design is caught', !draftedLine(page.replace('{style ? W.page.drafted : W.page.draftedSheet}', '{W.page.drafted}')));
  // R2: signed out on a challenge sheet's fork form, the visitor read "open to invited readers only".
  const form = read('src/components/design-form.tsx');
  const IF = (await import('../src/lib/images/wording')).IMAGE_WORDING.designs.form;
  const signInLine = (src: string) => /<p>\{p\.challengeOpen \? W\.form\.signInChallenge : W\.form\.signIn\}<\/p>/.test(src);
  check('R2 signed out, a challenge sheet\'s fork form asks to sign in to remix it, not "invited readers only"', signInLine(form) && !/invited/i.test(IF.signInChallenge) && /remix/i.test(IF.signInChallenge));
  proof('R2 the invited-only line shown during the challenge is caught', !signInLine(form.replace('{p.challengeOpen ? W.form.signInChallenge : W.form.signIn}', '{W.form.signIn}')));
  // R3: the cap could be read through the site's own function only; the image status route now says it too.
  const status = read('src/app/api/images/status/route.ts');
  const capInStatus = (src: string) => /dailySpendCapUsd: imagesDailySpendCapUsd\(\)/.test(src) && !/IMAGES\.dailySpendCapUsd/.test(src);
  check('R3 the image status route gives the day\'s spend cap through imagesDailySpendCapUsd()', capInStatus(status));
  proof('R3 a status cap read straight from IMAGES (never $15) is caught', !capInStatus(status.replace('dailySpendCapUsd: imagesDailySpendCapUsd()', 'dailySpendCapUsd: IMAGES.dailySpendCapUsd')));
  // R4: an untitled entry's row read "Bai: Bai".
  const CW = (await import('../src/lib/challenge/wording')).CHALLENGE_WORDING;
  // The entries moved to the rules page with the short /challenge (owner, 2026-11-04).
  const chPage = read('src/lib/challenge/rules-view.ts');
  check('R4 an untitled entry\'s row is the character alone; a titled one adds its name', CW.entryLabel('Bai', '') === 'Bai' && CW.entryLabel('Bai', '  ') === 'Bai' && CW.entryLabel('Bai', 'Rain coat') === 'Bai: Rain coat');
  check('R4 /challenge/rules builds both lists\' rows with entryLabel', (chPage.match(/W\.entryLabel\(/g) ?? []).length === 2 && !/\|\| nameOf\(/.test(chPage));
  proof('R4 a row that repeats the name is caught', /\|\| nameOf\(/.test(chPage.replace('title: W.entryLabel(nameOf(e.character), e.title)', 'title: `${nameOf(e.character)}: ${e.title || nameOf(e.character)}`')));
  // R5: a newcomer on a starting sheet had no way to /challenge (only an entry's badge linked there).
  const lines = read('src/lib/challenge/sheet-lines.ts');
  const invite = (src: string) => /if \(invite && !standing\) lines\.push\(line\(\{ text: CW\.sheetInvite\(callName\), link: toChallenge \}\)\);/.test(src) && /const toChallenge = \{ href: '\/challenge'/.test(src);
  check('R5 a challenge character\'s sheet links to /challenge while the window is open', invite(lines) && /remix this sheet/.test(CW.sheetInvite('Zei')) && CW.sheetInvite('Zei').startsWith('Zei '));
  proof('R5 a sheet page without the link is caught', !invite(lines.replace("href: '/challenge'", "href: '/references'")));
  // R6: after "Mark as my entry" said "Marked as your entry.", the button stayed. Submit (2026-11-04): once submitted,
  // the Submit form goes and Withdraw shows instead.
  const markSrc = read('src/components/challenge-submit.tsx');
  const hides = (src: string) => /setDone\(method === 'POST'\);/.test(src) && /\{done \? \(\s*<p className="ch-mark">\s*<button type="button" className="ic-secondary" onClick=\{\(\) => send\('DELETE'\)\}/.test(src);
  check('R6 once submitted, the Submit form goes (Withdraw instead)', hides(markSrc));
  proof('R6 a Submit form that stays after submitting is caught', !hides(markSrc.replace("setDone(method === 'POST');", 'setDone(false);')));
  // R7: publishing a fork or version didn't refresh /challenge (marking did).
  const designsRoute = read('src/app/api/designs/route.ts');
  const refreshes = (src: string) => /await recordEligibility\(sql, out\.versionId, fid\);\s*\/\/[^\n]*\n\s*revalidatePath\('\/challenge'\);/.test(src);
  check('R7 publishing a challenge character\'s fork or version refreshes /challenge, as Submit and Withdraw do', refreshes(designsRoute) && (read('src/app/api/challenge/submit/route.ts').match(/revalidatePath\('\/challenge'\)/g) ?? []).length === 2);
  proof('R7 a publish that leaves /challenge stale is caught', !refreshes(designsRoute.replace("revalidatePath('/challenge');", '')));
  // R8: a fork's form chose no style, so every forker met "Choose a style first." with one style on offer.
  const newPage = read('src/app/references/designs/new/page.tsx');
  // Item 4 (owner, 2026-11-04): through remixDefaults, which keeps the source's style while it is still published.
  const RD = await import('../src/lib/images/remix-defaults');
  const preselect = (f: string, n: string) => /useState<string \| null>\(\(\) => remixDefaults\(p\.source \? \{ style: p\.source\.style \} : null, p\.styles\.map\(\(s\) => s\.versionId\)\)\.style\)/.test(f) && /style: src\.shown\.body\.style\?\.version_id \?\? null,/.test(n);
  check('R8 a fork or new version starts with its source\'s style chosen (when still published)', preselect(form, newPage) && RD.remixDefaults({ style: 'a' }, ['a', 'b']).style === 'a' && RD.remixDefaults({ style: 'gone' }, ['a', 'b']).style === null);
  proof('R8 a form that starts with no style is caught', !preselect(form.replace('remixDefaults(p.source ? { style: p.source.style } : null', 'remixDefaults(null'), newPage));
  // R9: after the close, a candidate's page still offered "Mark as my entry", which then said "Entries are closed."
  const vp = lines;
  const closedNoButton = (src: string) => /standing\?\.kind === 'candidate'\)\s*lines\.push\(open \? line\(\{ text: CW\.candidateNote\(callName\), muted: true, submit: submitWords\(false, callName\) \}\) : line\(\{ text: CW\.candidateClosedNote\(callName\), muted: true \}\)\);/.test(src) && /const open = challengeOpenNow\(now, pub\);/.test(src);
  check('R9 after the close a candidate shows the closed note and no Submit', closedNoButton(vp) && /Entries are closed/.test(CW.candidateClosedNote('Bai')) && /Bai/.test(CW.candidateClosedNote('Bai')));
  proof('R9 a Submit offered after the close is caught', !closedNoButton(vp.replace('const open = challengeOpenNow(now, pub);', 'const open = true;')) && !closedNoButton(vp.replace('line({ text: CW.candidateClosedNote(callName), muted: true })', 'line({ text: CW.candidateClosedNote(callName), muted: true, submit: submitWords(false) })')));
}

// --- Launch fixes (owner, 2026-11-03) -----------------------------------------------------------------------------
{
  const CW = (await import('../src/lib/challenge/wording')).CHALLENGE_WORDING;
  const IW = (await import('../src/lib/images/wording')).IMAGE_WORDING.designs;
  const { navItems } = await import('../src/lib/nav');
  // b. /challenge from the menu and the home page.
  check('b the menu links to /challenge, after the owner\'s order', navItems(1, 0, true).some((i) => i.href === '/challenge' && i.label === CW.title) && navItems(1, 0, true).at(-1)?.key === 'challenge');
  const home = read('src/app/page.tsx');
  const homeRow = (src: string) => /\{ href: '\/challenge', name: CW\.title, what: CW\.homeLine\(\), meta: '→', draft: true \}/.test(src) && /\{r\.draft && <span className="as-draft ic-draftline">\{CW\.draftShort\}<\/span>\}/.test(src);
  check('b the home page links to /challenge, its new line marked Draft wording', homeRow(home) && /remix/.test(CW.homeLine()) && CW.draftShort === 'Draft wording');
  proof('b a home page without the row is caught', !homeRow(home.replace("href: '/challenge'", "href: '/references'")));
  // c. Below 0.7: said up front, in the owner's words; the refusal beside Generate, scrolled into view; no new lookup.
  // Widened to Lens and Bluesky (owner, 2026-11-05 evening, via the accounts session; DRAFT wording, no threshold).
  const owner = 'Entering needs a Farcaster, Lens or Bluesky account that passes the site’s check; we check when you press Generate.';
  check('c the up-front line says who can enter (Farcaster, Lens or Bluesky)', CW.whoCanEnter() === owner, CW.whoCanEnter());
  // With the short /challenge (owner, 2026-11-04), it sits at the top of the rules page, under the deadline.
  const chBody = read('src/components/challenge-rules-body.tsx');
  check('c /challenge/rules says it up front, under the deadline', /<\/p>\s*\{\/\*[^*]*\*\/\}\s*\{v\.who && <p className="ch-who">\{v\.who\}<\/p>\}\s*<p className="ch-intro">/.test(chBody) && /who: ph !== 'closed' \? W\.whoCanEnter\(\) : null,/.test(read('src/lib/challenge/rules-view.ts')));
  const form = read('src/components/design-form.tsx');
  const beforeConsent = (src: string) => /<div className="ic-gate">\s*\{p\.challengeOpen && !status\.invited && p\.whoCanEnter && <p className="ch-who">\{p\.whoCanEnter\}<\/p>\}\s*<p>\{W\.form\.consentFirst\}<\/p>/.test(src);
  check('c a challenge fork form says it before the consent screen', beforeConsent(form) && /whoCanEnter=\{challengeOpen \? CW\.whoCanEnter\(\) : undefined\}/.test(read('src/app/references/designs/new/page.tsx')));
  proof('c a consent gate without the line is caught', !beforeConsent(form.replace('{p.challengeOpen && !status.invited && p.whoCanEnter && <p className="ch-who">{p.whoCanEnter}</p>}\n          <p>{W.form.consentFirst}</p>', '<p>{W.form.consentFirst}</p>')));
  const beside = (src: string) => /pictureFor\(k, i, views\[k\], p\.viewLines\[k\]\)\)\}\s*<\/ul>\s*\{note && \(\s*<p ref=\{noteRef\} className="ic-error dz-make-note" role="status">/.test(src) && /if \(note\) noteRef\.current\?\.scrollIntoView\(/.test(src) && (src.match(/\{note\}/g) ?? []).length === 1;
  check('c a refusal at Generate shows right under the Generate buttons, once, and is scrolled into view', beside(form));
  proof('c the refusal back under the rules is caught', !beside(form.replace('if (note) noteRef.current?.scrollIntoView(', 'if (note) void (')));
  const lookups = walk('src').filter((f) => /\bcheckNeynar\(/.test(read(f))).sort();
  // The assistant's gate (main, assistant step 1, approved 2026-11-05: Privacy §7 says Neynar is asked when you ask the assistant).
  check('c no new Neynar lookup: only the Generate gate, the assistant\'s gate and the publish recorder call it (and its own file)', lookups.join() === ['src/lib/challenge/record.ts', 'src/lib/chat/gate.ts', 'src/lib/images/gate.ts', 'src/lib/images/neynar.ts'].join(), lookups.join());
  // d. The rule says an account below the check can't remix.
  const rules = CW.rules().join(' ');
  check('d the rule says an account below the check can\'t remix', /can’t remix or enter/.test(rules) && !/To count as an entry, sign in/.test(rules));
  // e. Remix, not Fork; the entry line at publish; the share text in the window.
  check('e1 the button and the form\'s title say "Remix" (one wording, every style and sheet)', IW.page.fork === 'Remix' && IW.form.fork === 'Remix' && /\{W\.page\.fork\}/.test(read('src/components/design-bar.tsx')) && /W\.form\.fork/.test(read('src/app/references/designs/new/page.tsx')));
  check('e1 no "Fork" left in what people read', !walk('src').some((f) => /'[^']*\bFork\b[^']*'/.test(stripComments(read(f)))));
  // Submit (owner, 2026-11-04) replaces the owner's 2026-11-03 line "This is your entry for Bai." (a draft, for the owner).
  check('e2 the publish line says to submit it', CW.publishedCandidate('Bai') === 'To enter it for Bai, press Submit on its page, with the link to your post about it.');
  const route = read('src/app/api/designs/route.ts');
  check('e2 the publish route answers with the standing at publish', /const st = await publishStanding\(sql, out\.versionId\);/.test(route) && /page: `\/references\/designs\/\$\{out\.versionId\}`, challenge \}/.test(route));
  check('e2 the confirmation shows it', /\{entry\?\.kind === 'candidate' && `\$\{entry\.text\} `\}/.test(form) && /text: st\.kind === 'candidate' \? CW\.publishedCandidate\(name\) : CW\.publishedUnchecked\(name\)/.test(route));
  const share = read('src/components/challenge-share.tsx');
  const vp = read('src/app/references/designs/[id]/page.tsx');
  const shareSwitch = (s1: string, v1: string) => /export function ChallengeShare\(\{ versionId, text, posts \}/.test(s1) && /const shareText = d\.kind === 'character' && isChallengeCharacter\(d\.entity\) && challengeOpenNow\(\) \? CW\.shareTextOpen\(callName\) : CW\.shareText\(what\);/.test(v1) && /text=\{shareText\}/.test(v1);
  check('e3 in the window, a challenge sheet\'s share text is the owner\'s (2026-11-06: "My remix of {name}, for the Snowmoon Party remix challenge"); outside it, as before', shareSwitch(share, vp) && CW.shareTextOpen('Bai') === 'My remix of Bai, for the Snowmoon Party remix challenge' && CW.shareText('Bai: x') === 'Bai: x, made on Snowmoon Party');
  proof('e3 a share text that ignores the window is caught', !shareSwitch(share, vp.replace('challengeOpenNow() ?', 'true ?')));
  // h. Before the open, from CHALLENGE.dates.
  check('h "Entries open Fri 6 Nov, 09:00 PT", built from CHALLENGE.dates', E.SUBMIT_WORDING.opens() === 'Entries open Fri 6 Nov, 09:00 PT.' && R.shortDateText('opens', { ...CHALLENGE.dates, opens: '2026-11-13T17:00:00Z' }) === 'Fri 13 Nov, 09:00 PT', E.SUBMIT_WORDING.opens());
  // i. Neynar down: published, and told on the spot.
  check('i the unchecked line says it won\'t count, and why', /won’t count/.test(CW.publishedUnchecked('Zei')) && /Neynar/.test(CW.publishedUnchecked('Zei')) && /\{entry\?\.kind === 'unchecked' && \(\s*<p className="ic-error ch-unchecked" role="status">\s*\{entry\.text\}/.test(form));
  check('i the confirmation\'s new lines carry a Draft wording line', /\{entry && <p className="as-draft ic-draftline">\{IMAGE_WORDING\.draftLine\}<\/p>\}/.test(form));
}

// --- Remix defaults (owner, 2026-11-04, item 4) --------------------------------------------------------------------
{
  const RD = await import('../src/lib/images/remix-defaults');
  const src = { style: 's1', front: { url: 'https://pictures.example/f.jpg', sha256: 'a'.repeat(64) }, model: 'gpt-image-2.5-sunburst', moment: 'c9-b14' };
  const d = RD.remixDefaults(src, ['s1', 's2'], 's2');
  check('D1 a remix starts with the source\'s style, its front view as the reference picture, the open model and no moment', d.style === 's1' && d.reference?.sha256 === src.front.sha256 && d.model === RD.OPEN_DEFAULT_MODEL && d.moment === null, JSON.stringify(d));
  check('D1 a source style no longer published falls back to your own pick, then none', RD.remixDefaults({ ...src, style: 'gone' }, ['s1', 's2'], 's2').style === 's2' && RD.remixDefaults({ ...src, style: 'gone' }, ['s1'], null).style === null);
  check('D2 the model hook: open while model choice is off; the source\'s once it is on and offered', RD.modelFor(src, ['gpt-image-2.5-sunburst'], false) === 'open' && RD.modelFor(src, ['gpt-image-2.5-sunburst'], true) === 'gpt-image-2.5-sunburst' && RD.modelFor(src, [], true) === 'open');
  check('D2 model choice is still off (branch remix-model-choice), so nothing new is offered', !('modelChoice' in IMAGES.designs) || (IMAGES.designs as { modelChoice?: boolean }).modelChoice === false);
  check('D3 the moment hook shows nothing until moments ship', RD.momentFor(src) === null && RD.momentFor(src, true) === 'c9-b14');
  proof('D1 a remix that starts on the source\'s closed model while choice is off is caught', RD.modelFor(src, ['gpt-image-2.5-sunburst'], true) !== RD.remixDefaults(src, ['s1']).model);
  const sample = read('src/app/api/designs/sample/route.ts');
  const fromSource = (t: string) => /if \(slot === 'front' && typeof body\.source === 'string'\)/.test(t) && /const bytes = await referencePicture\(f\.url, f\.sha256\);/.test(t) && /const ref = front \?\? \(source \? \{ bytes: source\.bytes, sha256: source\.sha256 \} : null\);/.test(t) && /\.\.\.\(ref \? \{ references: \[\{ sha256: ref\.sha256 \}\] \} : \{\}\),/.test(t);
  check('D4 a remix\'s front view is made from the source\'s front view, sent as a reference picture and recorded', fromSource(sample));
  proof('D4 a front that ignores the source is caught', !fromSource(sample.replace('const ref = front ?? (source ? { bytes: source.bytes, sha256: source.sha256 } : null);', 'const ref = front;')));
  const pub = read('src/app/api/designs/route.ts');
  const enforced = (t: string) => /if \(srcFront && views\.front && !\(views\.front\.t\.source\?\.sha256 === srcFront\.sha256 && views\.front\.t\.references\?\.some\(\(r\) => r\.sha256 === srcFront\.sha256\)\)\)/.test(t);
  check('D4 publishing a remix refuses a front view not made from the source', enforced(pub));
  proof('D4 a publish route that skips the check is caught', !enforced(pub.replace('if (srcFront && views.front &&', 'if (false && srcFront && views.front &&')));
  const form = read('src/components/design-form.tsx');
  const minimal = (t: string) => /<details className="dz-section dz-options">[\s\S]{0,400}\{nameField\}\s*\{stylePicker\}\s*<\/details>/.test(t) && /onClick=\{remixAll\}/.test(t) && /\.\.\.\(remixing && slot === 'front' \? \{ source: p\.source!\.versionId \} : \{\}\)/.test(t);
  check('D5 the least is typing and pressing Remix: one Remix button; the style and name preselected under Options', minimal(form));
  proof('D5 a form with the options spread out again is caught', !minimal(form.replace('{nameField}\n                {stylePicker}\n              </details>', '</details>')));
}

// --- A remix page as a landing page (owner, 2026-11-04) ------------------------------------------------------------
{
  const L = await import('../src/lib/challenge/landing');
  const pic = (u: string) => ({ url: u, sha256: 'a'.repeat(64), recipe: { width: 576, height: 768 } }) as never;
  const views = { front: pic('f'), side: pic('s') };
  check('l1 the landing picture is the front view', L.landingPicture({ views })?.url === 'f');
  check('l1 no front view: no landing and no preview picture', L.landingPicture({ views: { side: pic('s') } }) === null && !L.isLanding({ kind: 'character', challengeCharacter: true, body: { views: { side: pic('s') } } }));
  proof('l1 a landing for a style or a character outside the challenge is caught', !L.isLanding({ kind: 'style', challengeCharacter: true, body: { views } }, true) && !L.isLanding({ kind: 'character', challengeCharacter: false, body: { views } }, true));
  check('l1 opened (CHALLENGE.public on): a challenge character\'s sheet with a front view is a landing', L.isLanding({ kind: 'character', challengeCharacter: true, body: { views } }, true));
  check('l1 admin-only (CHALLENGE.public off, as configured): no landing, no preview, no card', !L.isLanding({ kind: 'character', challengeCharacter: true, body: { views } }, false) && (CHALLENGE.public || !L.isLanding({ kind: 'character', challengeCharacter: true, body: { views } })));
  check('l1 the card route reads isLanding (so it answers 404 while admin-only)', /if \(!d \|\| !isLanding\(/.test(read('src/app/api/design-card/[id]/route.tsx')));
  check('l7 "Remixing opens" on the landing, "Entries open" on /challenge (owner, 2026-11-04, item 11.2)', L.LANDING_WORDING.opensLine().startsWith('Remixing opens ') && W.opensOn().startsWith('Entries open '));
  const open = L.landingAction('v1', 'open');
  check('l2 open: the Remix button opens that version\'s remix form', 'href' in open && open.href === '/references/designs/new?from=v1');
  check('l2 before and after: a line in its place, with the date from CHALLENGE.dates', ['before', 'closed'].every((ph) => { const a = L.landingAction('v1', ph as 'before'); return 'line' in a && /Pacific/.test(a.line); }) && (L.landingAction('v1', 'before') as { line: string }).line.includes(R.dateText('opens', { time: true })));
  check('l3 the signed-out line names the challenge and its dates', L.LANDING_WORDING.arrival('Zei', 'open').includes(R.windowText()) && /remix challenge/.test(L.LANDING_WORDING.arrival('Zei', 'before')));
  const meta = L.landingMetadata({ versionId: 'v1', name: 'Zei', title: '', by: '@a' });
  const embed = JSON.parse(String((meta.other as Record<string, string>)['fc:miniapp']));
  check('l4 the embed: version 1, a button of at most 32 characters opening the page, the 3:2 card', embed.version === '1' && embed.button.title.length <= 32 && embed.button.action.type === 'launch_frame' && embed.button.action.url.endsWith('/references/designs/v1') && embed.imageUrl.endsWith('/api/design-card/v1') && L.CARD_SIZE.embed.width * 2 === L.CARD_SIZE.embed.height * 3);
  check('l4 Open Graph and twitter:card for Bluesky and Lens', (meta.twitter as { card?: string })?.card === 'summary_large_image' && JSON.stringify(meta.openGraph).includes('/api/design-card/v1?shape=og'));
  check('l5 a hidden or unpublished version: no picture, and the site embed blanked', L.NO_PREVIEW.openGraph === null && L.NO_PREVIEW.twitter === null && Object.values(L.NO_PREVIEW.other ?? {}).every((v) => v === ''));
  check('l6 likes are off (planned 12 November): the slot renders nothing', L.likesOn() === false && /if \(!likesOn\(\)\) return null;/.test(read('src/components/challenge-like.tsx')));
  // Pre-flight 2026-11-07: inside the window with pictures as the entries (sheets invitation-only), a sheet's landing is
  // open, not "Remixing opens …": a base's Remix opens its remix screen, any other sheet's the character's card.
  const sp = read('src/app/references/designs/[id]/page.tsx');
  const inWindow = /const picturesOpen = !challengeOpen && CHALLENGE\.pictureEntries && [^\n]*challengeOpenNow\(\);/.test(sp) && /const landingPhase = challengeOpen \|\| picturesOpen \? 'open'/.test(sp);
  check('l8 inside the window with pictures as the entries, a sheet\'s landing is open, not "Remixing opens"', inWindow && sp.includes('phase={landingPhase} remixHref={remixHref}'));
  check('l8 a base\'s Remix opens its remix screen; another sheet\'s, the character\'s card', sp.includes('`/challenge/make?from=${d.shown.versionId}`') && (L.landingAction('v1', 'open', '/challenge/make?from=v1') as { href: string }).href === '/challenge/make?from=v1');
  proof('l8 the landing phase read from challengeSheetsOpen alone is caught', !/const landingPhase = challengeOpen \|\| picturesOpen \? 'open'/.test(sp.replace('challengeOpen || picturesOpen ?', 'challengeOpen ?')));
}

{
  // Pre-flight 2026-11-07: cast in Farcaster, /challenge and a picture's page open themselves (not the home page, the
  // site's default embed), a picture's page with its 3:2 card (/api/image-card) and "Remix this", as a sheet's landing.
  const hub = read('src/app/challenge/page.tsx');
  const pic = read('src/app/challenge/p/[id]/page.tsx');
  const opens = (t: string, path: string) => t.includes("'fc:miniapp': embed") && t.includes(`action: { type: 'launch_frame', name: APP_NAME, url: \`\${appUrl()}${path}`);
  check('E1 /challenge cast in Farcaster opens /challenge', opens(hub, '/challenge`'));
  check('E1 a picture\'s page cast in Farcaster opens that page, with its card and "Remix this"', opens(pic, '/challenge/p/${v.versionId}`') && pic.includes('/api/image-card/${v.versionId}') && pic.includes("title: 'Remix this'"));
  proof('E1 a picture\'s page embed that opens the home page is caught', !opens(pic.replace('/challenge/p/${v.versionId}`, splash', '`, splash'), '/challenge/p/${v.versionId}`'));
}

// --- Every submission, and no counts (branch contest, 2026-11-04) ---------------------------------------------------
{
  const page = read('src/app/challenge/entries/page.tsx');
  const list = read('src/components/challenge-entries-list.tsx');
  check('X1 /challenge/entries: the entries (standing), filtered by character, newest first as standing gives them', /const st = sql \? await standing\(sql\)/.test(page) && /\.filter\(\(e\) => !character \|\| e\.character === character\)/.test(page) && !/\.sort\(/.test(page));
  check('X1 the viewer\'s "Shuffled" order is the P5g shuffle on every entry shown, in the browser', /setShown\(shuffleFresh\(all\)\)/.test(list) && /'use client'/.test(list));
  const css = read('src/styles/designs.css');
  check('X1 the order buttons show which order is chosen (.ch-chip[aria-pressed=true]) and have no browser button face', /\.ch-chip\[aria-pressed='true'\] \{[^}]*background: var\(--btn\)/.test(css) && /button\.ch-chip \{ background: none;/.test(css));
  const { p5gProblems, p5iProblems, CHALLENGE_FILES, P5I_FILES } = await import('./lib/p5g');
  const files = walk('src').filter((f) => CHALLENGE_FILES.test(f)).map((f) => ({ file: f, text: read(f) }));
  check('X1 P5g passes with the entries list', p5gProblems(files).length === 0, p5gProblems(files).join('; '));
  proof('X1 entries shuffled only in part (a featured few) fail P5g', p5gProblems(files.map((x) => (x.file === 'src/components/challenge-entries-list.tsx' ? { ...x, text: x.text.replace('shuffleFresh(all)', 'shuffleFresh(all.slice(0, 6))') } : x))).length > 0);
  proof('X1 entries sorted by likes fail P5g', p5gProblems(files.map((x) => (x.file === 'src/app/challenge/entries/page.tsx' ? { ...x, text: x.text.replace('.filter((e) => !character', '.sort((a, b) => b.likes - a.likes).filter((e) => !character') } : x))).length > 0);
  const p5i = P5I_FILES.map((f) => ({ file: f, text: read(f) }));
  check('X2 no like, recast or reply count on the entries page, its list or "Posted on" (P5i)', P5I_FILES.includes('src/components/posted-on.tsx') && P5I_FILES.includes('src/app/challenge/entries/page.tsx') && p5iProblems(p5i).length === 0, p5iProblems(p5i).join('; '));
  proof('X2 a like count in "Posted on" is caught', p5iProblems(p5i.map((x) => (x.file === 'src/components/posted-on.tsx' ? { ...x, text: x.text.replace('{W.seeIt(NETWORK_NAME[p.network])}', '{p.likes} likes · {W.seeIt(NETWORK_NAME[p.network])}') } : x))).length > 0);
  const SW = (await import('../src/lib/challenge/share-wording')).SHARE_WORDING;
  check('X2 "Posted on" links read "See the conversation on Farcaster/Bluesky/Lens"', ['Farcaster', 'Bluesky', 'Lens'].every((n) => SW.seeIt(n) === `See the conversation on ${n}`));
  check('X2 counts are behind CHALLENGE.socialCounts, off', CHALLENGE.socialCounts === false);
}

{
  // Pre-flight 2026-11-07: the remix screen's Make (POST /api/challenge/make, getPerson) must get a Lens or Bluesky
  // sign-in from the browser, or a Lens or Bluesky person is answered "Sign in to make it" while signed in.
  const ca = read('src/lib/client-auth.ts');
  const routes = /const WALLET_ROUTES = \[([^\]]*)\]/.exec(ca)?.[1] ?? '';
  check('the browser sends a Lens or Bluesky sign-in to the remix screen\'s Make (/api/challenge/make)', routes.includes("'/api/challenge/make'"));
  proof('a WALLET_ROUTES without /api/challenge/make is caught', !routes.replace("'/api/challenge/make', ", '').includes("'/api/challenge/make'"));
  check('the make route takes a Lens or Bluesky person (getPerson)', /const fid = await getPerson\(request\);/.test(read('src/app/api/challenge/make/route.ts')));
}

console.log(`test:challenge: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
process.exit(0);
