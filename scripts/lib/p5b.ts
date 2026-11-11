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
