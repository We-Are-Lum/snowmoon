/**
 * Today's two "Published, not entered" numbers (2026-11-27), read-only: the admin list's count (/admin/bounty) and the
 * public section's (/challenge/entries), from the same functions the pages call (src/lib/challenge/entries.ts). For the
 * owner to run against the database he chooses, inside a read-only transaction rolled back at the end:
 *   STUDIO_DATABASE_URL=… npx tsx --conditions=react-server scripts/count-not-entered.ts
 * Prints only the two numbers; never the address.
 */
import postgres from 'postgres';

const url = process.env.STUDIO_DATABASE_URL;
if (!url) {
  console.error('count-not-entered: set STUDIO_DATABASE_URL to the database to read');
  process.exit(1);
}
const { notEnteredAll, notEnteredShown } = await import('../src/lib/challenge/entries');
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    await tx`set transaction read only`;
    const all = await notEnteredAll(tx as unknown as postgres.Sql);
    console.log(`admin list (Published, not entered): ${all.length}`);
    console.log(`public section (Published, not entered yet): ${notEnteredShown(all).length}`);
    throw Object.assign(new Error('rollback'), { rollback: true });
  });
} catch (e) {
  if (!(e as { rollback?: boolean }).rollback) throw e;
} finally {
  await sql.end();
}
