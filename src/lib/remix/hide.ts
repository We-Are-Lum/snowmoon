import 'server-only';
import type postgres from 'postgres';
import { actsFor } from '../wallet/credit';
import { isAdmin } from '../admins';
import { frameById, frameRow, hideFile, unhideFile, type Frame } from './frames';
import { boardById, boardRow, type Storyboard } from './storyboards';

/**
 * Hiding a remix frame or a storyboard: by its maker, or by an admin (src/lib/admins.ts; owner, 2026-10-29: "ADMINS
 * replaces the scattered owner lists"). Kept apart from the listing code so the admin check sits only beside hiding
 * (P5b: admin code hides and picks, nothing else).
 */
type Sql = postgres.Sql;

/**
 * Hide or unhide. The maker hides their own; an admin hides anything (the role is still recorded as 'maintainer'). A maker's hide
 * is undone by the maker; an admin's only by an admin.
 */
export async function setHidden(sql: Sql, person: number, id: string, hide: boolean): Promise<{ ok: true; frame: Frame } | { ok: false; status: number; error: string }> {
  const f = await frameById(sql, id);
  if (!f) return { ok: false, status: 404, error: 'No such frame' };
  // A linked wallet's earlier frames are its FID's (owner, 2026-10-22; src/lib/wallet/credit.ts).
  const maker = await actsFor(sql, person, f.person);
  const maint = isAdmin(person);
  if (!maker && !maint) return { ok: false, status: 403, error: 'Only the person who made this frame can hide it.' };
  if (hide) {
    if (f.hidden) return { ok: true, frame: f };
    const role = maker ? 'maker' : 'maintainer';
    const [r] = await sql`update studio.remix_frames set hidden = true, hidden_by = ${person}, hidden_role = ${role}, hidden_at = now() where id = ${id} returning *`;
    await hideFile(f.imageSha256);
    return { ok: true, frame: frameRow(r) };
  }
  if (!f.hidden) return { ok: true, frame: f };
  if (f.hiddenRole === 'maintainer' && !maint) return { ok: false, status: 403, error: 'This was hidden by the maintainer; only the maintainer can bring it back.' };
  if (f.hiddenRole === 'maker' && !maker) return { ok: false, status: 403, error: 'Only its maker can bring this back.' };
  await unhideFile(f.imageSha256);
  const [r] = await sql`update studio.remix_frames set hidden = false, hidden_by = null, hidden_role = null, hidden_at = null where id = ${id} returning *`;
  return { ok: true, frame: frameRow(r) };
}

export async function setBoardHidden(sql: Sql, person: number, id: string, hide: boolean): Promise<{ ok: true; board: Storyboard } | { ok: false; status: number; error: string }> {
  const b = await boardById(sql, id);
  if (!b) return { ok: false, status: 404, error: 'No such storyboard' };
  const maker = await actsFor(sql, person, b.person);
  const maint = isAdmin(person);
  if (!maker && !maint) return { ok: false, status: 403, error: 'Only the person who made this storyboard can hide it.' };
  if (hide) {
    if (b.hidden) return { ok: true, board: b };
    const [r] = await sql`update studio.storyboards set hidden = true, hidden_by = ${person}, hidden_role = ${maker ? 'maker' : 'maintainer'}, hidden_at = now() where id = ${id} returning *`;
    return { ok: true, board: boardRow(r) };
  }
  if (!b.hidden) return { ok: true, board: b };
  if (b.hiddenRole === 'maintainer' ? !maint : !maker) return { ok: false, status: 403, error: 'Only whoever hid it can bring it back.' };
  const [r] = await sql`update studio.storyboards set hidden = false, hidden_by = null, hidden_role = null, hidden_at = null where id = ${id} returning *`;
  return { ok: true, board: boardRow(r) };
}
