import 'server-only';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { hiddenKeyFor } from './store';
import { moderationDeps } from './publish-deps';
import type { ModerationDeps } from './moderation';

/**
 * A picture hidden by moderation reaches the takes that copied it (Nate, 2026-11-26; NEXT_voice_takes.sql): each live
 * take whose picture is one of the element's versions is hidden with it (studio.hide_takes_using_picture), and its files
 * move to the private bucket as any hidden publication's do. Unhiding the picture brings back only the takes hidden
 * because of it (studio.unhide_takes_using_picture: not those hidden or reported for themselves), each file put back
 * only if its private copy is byte for byte the published file (principle 5).
 */
type Sql = postgres.Sql;

async function versionsOf(sql: Sql, elementId: string): Promise<string[]> {
  return (await sql<{ id: string }[]>`select id::text from studio.element_versions where element_id = ${elementId}`).map((r) => r.id);
}

export async function hideReachesTakes(sql: Sql, elementId: string, by: number, role: 'moderator' | 'maintainer' | 'rule', deps: ModerationDeps = moderationDeps()) {
  let takes = 0;
  for (const v of await versionsOf(sql, elementId)) {
    const rows = await sql<{ publication_id: string; key: string }[]>`select publication_id::text, key from studio.hide_takes_using_picture(${v}::uuid, ${by}::bigint, ${role})`;
    const byTake = new Map<string, string[]>();
    for (const r of rows) byTake.set(r.publication_id, [...(byTake.get(r.publication_id) ?? []), r.key]);
    for (const [id, keys] of byTake) {
      let failed = 0;
      for (const k of keys) {
        try {
          const bytes = await deps.getPublic(k);
          if (bytes) await deps.putPrivate(hiddenKeyFor(k), bytes);
          await deps.deletePublic(k);
        } catch {
          failed++;
        }
      }
      await sql`insert into studio.voice_publication_log ${sql({ publication_id: id, step: 'moved_private', by_fid: by, role, note: failed ? `${failed} of ${keys.length} files not moved` : 'its picture was hidden' })}`;
      takes++;
    }
  }
  return { takes };
}

export async function unhideReachesTakes(sql: Sql, elementId: string, by: number, role: 'moderator' | 'maintainer', deps: ModerationDeps = moderationDeps()) {
  let takes = 0;
  for (const v of await versionsOf(sql, elementId)) {
    const rows = await sql<{ publication_id: string; key: string }[]>`select publication_id::text, key from studio.unhide_takes_using_picture(${v}::uuid, ${by}::bigint, ${role})`;
    const byTake = new Map<string, string[]>();
    for (const r of rows) byTake.set(r.publication_id, [...(byTake.get(r.publication_id) ?? []), r.key]);
    for (const [id, keys] of byTake) {
      let failed = 0;
      for (const k of keys) {
        try {
          const bytes = await deps.getPrivate(hiddenKeyFor(k));
          if (!bytes || createHash('sha256').update(bytes).digest('hex') !== /-([0-9a-f]{64})\.[a-z0-9]+$/.exec(k)?.[1]) throw new Error('not the published file');
          await deps.putPublic(k, bytes);
          await deps.deletePrivate(hiddenKeyFor(k));
        } catch {
          failed++;
        }
      }
      await sql`insert into studio.voice_publication_log ${sql({ publication_id: id, step: 'restored_public', by_fid: by, role, note: failed ? `${failed} of ${keys.length} files not restored` : 'its picture was restored' })}`;
      takes++;
    }
  }
  return { takes };
}
