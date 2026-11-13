import 'server-only';
import type postgres from 'postgres';
import { bookCharacter } from '../images/designs';
import { challengePictures } from '../challenge/pictures';
import { shownMoment } from '../challenge/moment-switch';
import { callNameOf } from '../challenge/names';
import { currentBackstory, type CurrentBackstory } from '../challenge/backstories';

/**
 * A published challenge picture as its maker's backstory and bounty routes need it (branch challenge-backstory-bounty):
 * who made it, its character's call name, its title (its moment's, only while the moments are shown; else none), its
 * stored picture (asset URL and sha256), and its backstory now. Null for anything that isn't a published challenge
 * picture (hidden ones included). Read-only.
 */
type Sql = postgres.Sql;

export interface MakerPicture {
  versionId: string;
  byFid: number;
  name: string;
  pictureTitle: string | null;
  imageUrl: string;
  imageSha256: string;
  body: unknown;
  backstory: CurrentBackstory | null;
}

export async function makerPicture(sql: Sql, versionId: string): Promise<MakerPicture | null> {
  if (!/^[0-9a-f-]{36}$/.test(versionId)) return null;
  const [p] = await challengePictures(sql, { versionId });
  if (!p || !p.thumb) return null;
  const [v] = await sql<{ body: unknown; asset_url: string | null; asset_sha256: string | null }[]>`select body, asset_url, asset_sha256 from studio.element_versions where id = ${versionId}`;
  if (!v?.asset_url || !v.asset_sha256) return null;
  return {
    versionId,
    byFid: p.byFid,
    name: callNameOf(bookCharacter(p.character)?.name ?? p.character),
    pictureTitle: shownMoment(p.moment)?.title ?? null,
    imageUrl: v.asset_url,
    imageSha256: v.asset_sha256,
    body: v.body,
    backstory: await currentBackstory(sql, versionId, v.body),
  };
}
