/**
 * P5b, what admin and moderator code may do (owner, reread 2026-10-29: hide, and write a labelled pick, nothing else),
 * as a pure function so scripts/test-admin-activity.ts can prove its exception is narrow. check:principles runs it on
 * the files under src/.
 *
 * - Code that checks MODERATOR_FIDS, ADMINS or isAdmin may not publish (set a status to published or draft).
 * - It may not order or sort either, with one exception (owner, 2026-11-05: "admin-only pages may sort by time or
 *   counts; P5 is about public steering"): a file that holds the admin gate itself, answering 404 to everyone else
 *   (`if (!isAdmin(…)) return …404…`), may sort, because nobody else ever sees what it sorts. A public page that only
 *   checks isAdmin (to show an admin a button, say) and sorts still fails.
 * - The one write beyond hiding: a pick, in studio.admin_picks.
 */
export interface SrcFile { file: string; text: string }

const ADMIN_CODE = /MODERATOR_FIDS|\bADMINS\b|\bisAdmin\(/;
/** The admin gate, answering 404 to non-admins, in the file itself. */
export const ADMIN_404_GATE = /if\s*\(\s*!isAdmin\([^)]*\)\s*\)\s*return\b[^;\n]*\b404\b/;
// Publishing is a write: a status set in SQL (`set status = 'published'`), given in a row or object (`status: 'published'`),
// or assigned in code (`x.status = 'published';`). A read that filters on it (`where e.status = 'published'`) is not.
const PUBLISHES = /status\s*:\s*['"](published|draft)['"]|set\s+status\s*=\s*'(published|draft)'|^\s*[A-Za-z_$][\w$.]*\.status\s*=\s*['"](published|draft)['"]\s*;/im;
const ORDERS = /order by|\.sort\(/i;

export function p5bProblems(files: SrcFile[]): string[] {
  return files
    .filter((f) => ADMIN_CODE.test(f.text) && !f.file.endsWith('config.ts') && !f.file.endsWith('src/lib/admins.ts'))
    .map((f) => ({ ...f, text: f.text.replace(/(insert into|update|delete from)\s+studio\.admin_picks\b[^`]*`/gi, '') }))
    .flatMap((f) => {
      if (PUBLISHES.test(f.text)) return [`${f.file}: moderator or admin code publishes`];
      if (ORDERS.test(f.text) && !ADMIN_404_GATE.test(f.text)) return [`${f.file}: moderator or admin code orders or sorts, and isn't an admin-only page (404 to everyone else)`];
      return [];
    });
}

/** The planted faults the tests use: each must be caught. */
export const P5B_PLANTS: Record<string, SrcFile> = {
  publish: { file: 'src/planted.ts', text: "if (ADMINS.includes(fid)) await sql`update studio.elements set status = 'published'`" },
  publicSort: { file: 'src/app/planted/page.tsx', text: "const admin = isAdmin(fid);\nconst rows = images.sort((a, b) => b.likes - a.likes);" },
  assignPublish: { file: 'src/lib/planted-assign.ts', text: "if (MODERATOR_FIDS.includes(fid)) {\n  item.status = 'published';\n}" },
  gatedPublish: { file: 'src/lib/planted-admin.ts', text: "if (!isAdmin(fid)) return { status: 404 };\nawait sql`update studio.elements set status = 'published'`;" },
};

/**
 * P5j (owner's ruling for principle 5, 2026-11-18, reread by the owner 2026-11-19): "An admin may replace a picture in the site's own
 * edition of a chapter. The change is public at once, shows who made it and when, and can be undone. This covers only
 * the edition's own pictures, never the order or prominence of people's published work." So the code that changes what
 * a chapter shows (any file that writes a chapter-picture table) must hold the admin check itself, may write nothing
 * but the chapter-picture tables, never updates or deletes them (every change is a new row, so it can be undone), and is
 * one file (src/lib/chapter-pictures/admin.ts).
 */
export const CHAPTER_PICTURE_TABLE = /^chapter_picture_(versions|decisions|looks)$/;
export const CHAPTER_PICTURE_WRITER = 'src/lib/chapter-pictures/admin.ts';
const WRITES = /\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+studio\.([a-z_]+)/gi;
export function p5jProblems(files: SrcFile[]): string[] {
  const p: string[] = [];
  const writers: string[] = [];
  for (const f of files) {
    const writes = [...f.text.matchAll(WRITES)].map((m) => ({ verb: m[1].toLowerCase().split(/\s+/)[0], table: m[2] }));
    if (!writes.some((w) => CHAPTER_PICTURE_TABLE.test(w.table))) continue;
    writers.push(f.file);
    if (!/\bisAdmin\(/.test(f.text)) p.push(`${f.file}: writes the chapter pictures without the admin check in the same file`);
    const other = [...new Set(writes.filter((w) => !CHAPTER_PICTURE_TABLE.test(w.table)).map((w) => w.table))];
    if (other.length) p.push(`${f.file}: admin publishing code also writes ${other.map((t) => `studio.${t}`).join(', ')}; it may write only the edition's chapter pictures`);
    if (writes.some((w) => CHAPTER_PICTURE_TABLE.test(w.table) && w.verb !== 'insert')) p.push(`${f.file}: updates or deletes a chapter-picture row; every change must be a new row, so it can be undone`);
    if (PUBLISHES.test(f.text)) p.push(`${f.file}: admin publishing code sets a published status on something`);
  }
  for (const w of writers) if (w !== CHAPTER_PICTURE_WRITER) p.push(`${w}: only ${CHAPTER_PICTURE_WRITER} may write the chapter pictures`);
  return p;
}
/** The planted faults for P5j: each must be caught. */
export const P5J_PLANTS: Record<string, SrcFile> = {
  otherTable: { file: CHAPTER_PICTURE_WRITER, text: "if (!isAdmin(fid)) throw 0;\nawait sql`insert into studio.chapter_picture_decisions ${sql(d)}`;\nawait sql`update studio.elements set entity_id = ${e}`;" },
  noGate: { file: CHAPTER_PICTURE_WRITER, text: 'await sql`insert into studio.chapter_picture_decisions ${sql(d)}`;' },
  inPlace: { file: CHAPTER_PICTURE_WRITER, text: "if (!isAdmin(fid)) throw 0;\nawait sql`update studio.chapter_picture_decisions set version_id = ${v}`;" },
  elsewhere: { file: 'src/app/api/planted/route.ts', text: "if (!isAdmin(fid)) return 404;\nawait sql`insert into studio.chapter_picture_decisions ${sql(d)}`;" },
};
