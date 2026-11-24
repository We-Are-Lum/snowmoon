import 'server-only';
import type postgres from 'postgres';

/**
 * Whether this person already has a draft converted from the recording with this sha256 (fix 7, Nate 2026-11-24): the
 * draft's recipe keeps only the take's fingerprint (takes[0].takeSha256), never the take. A removed draft no longer
 * counts.
 */
export async function convertedBefore(sql: postgres.Sql, fid: number, takeSha256: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(takeSha256)) return false;
  const [r] = await sql`select 1 from studio.voice_drafts where fid = ${fid} and kind = 'performance' and recipe -> 'takes' -> 0 ->> 'takeSha256' = ${takeSha256} limit 1`;
  return Boolean(r);
}
