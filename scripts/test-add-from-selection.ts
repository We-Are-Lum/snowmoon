/**
 * "Add an image" from the reader goes to the right place (owner, 2026-11-20): for an admin, #196's "Add a picture
 * here" sheet with the passage set; for anyone else, the readers' composer, exactly as before.
 *  D. the decision (src/lib/images/add-entry.ts) on both sides, and two planted faults that must fail;
 *  E. every entry point (the selection menu, the player, the two "+ Add an image" buttons) goes through it, and none
 *     calls the composer directly any more;
 *  S. the admins' sheet renders nothing for anyone not an admin, and keeps a passage end that has no paragraph number.
 * The browser side (each entry point, as an admin and as a reader) is run on a local build by the review's shots script.
 *
 *   npm run test:add-from-selection
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { addEntry, addEntryProblems, ADMIN_ADD_LABEL } from '../src/lib/images/add-entry';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures.push(what);
};
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

// D. The decision.
check('D. the rule holds for addEntry', addEntryProblems(addEntry).length === 0, addEntryProblems(addEntry).join('; '));
check('D. an admin\'s selection 18–12 opens the sheet for 12–18, placed after 18', JSON.stringify(addEntry(true, 3, 18, 12)) === JSON.stringify({ kind: 'admin', chapter: 3, start: 12, end: 18, after: 18 }));
check('D. a reader\'s selection opens the composer with exactly what it asked', JSON.stringify(addEntry(false, 3, 18, 12)) === JSON.stringify({ kind: 'composer', chapter: 3, start: 18, end: 12 }));
check('D. planted: a non-admin reaching the admin sheet fails', addEntryProblems((_admin, c, s, e) => ({ kind: 'admin', chapter: c, start: Math.min(s, e), end: Math.max(s, e), after: Math.max(s, e) })).length > 0);
check('D. planted: an admin sent to the composer fails', addEntryProblems((_admin, c, s, e) => ({ kind: 'composer', chapter: c, start: s, end: e })).length > 0);
check('D. the admins\' button says "Add a picture here"', ADMIN_ADD_LABEL === 'Add a picture here');

// E. Every entry point goes through it.
const entries: [string, RegExp][] = [
  ['src/components/quote-share.tsx', /add\.open\(selection\.from, selection\.to\)/],
  ['src/components/chapter-player.tsx', /add\.open\(current\.idx, current\.idx\)/],
  ['src/components/reader-images.tsx', /add\.open\(top\.start, top\.end\)/],
  ['src/components/reader-images.tsx', /add\.open\(start, end\)/],
];
for (const [f, re] of entries) check(`E. ${f}: ${re.source.replace(/\\/g, '')}`, re.test(read(f)) && /useAddImageEntry\(chapter\)/.test(read(f)) && /\{add\.sheet\}/.test(read(f)));
for (const f of ['src/components/quote-share.tsx', 'src/components/chapter-player.tsx', 'src/components/reader-images.tsx']) check(`E. ${f} no longer calls the composer directly`, !/openComposer\(/.test(read(f)));
const hook = read('src/components/add-image-entry.tsx');
check('E. the hook decides by isAdmin and sends everyone else to openComposer, unchanged', /const admin = auth\.kind === 'signed-in' && isAdmin\(auth\.fid\);/.test(hook) && /else openComposer\(\{ chapter: e\.chapter, start: e\.start, end: e\.end \}\);/.test(hook));
check('E. the readers\' gate is unchanged (signed in, image making on)', /return IMAGES\.enabled && auth\.kind === 'signed-in';/.test(read('src/lib/images/can-add.ts')));

// S. The sheet.
const sheet = read('src/components/reader-picture-admin.tsx');
check('S. the admins\' sheet renders nothing for anyone not an admin', /export function AdminAddSheet[\s\S]{0,400}if \(auth\.kind !== 'signed-in' \|\| !isAdmin\(auth\.fid\)\) return null;/.test(sheet));
check('S. it is #196\'s sheet (AddSheet), not a second one', /return <AddSheet chapter=\{chapter\} after=\{after\} label=\{null\} start=\{start\} end=\{end\} onClose=\{onClose\} \/>;/.test(sheet) && (sheet.match(/function AddSheet\(/g) ?? []).length === 1);
check('S. a passage end without a paragraph number is kept and said', /data-unlabelled=/.test(sheet) && /unlabelled: \(blocks: number\[\]\)/.test(sheet));

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
