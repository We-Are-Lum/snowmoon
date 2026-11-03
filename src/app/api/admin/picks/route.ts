import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { isAdmin } from '~/lib/admins';
import { addPick, currentPicks, MOMENT, TERM, type Pick, type PickImageKind } from '~/lib/picks';
import { momentOptions, termOptions, type PickOption } from '~/lib/pick-options';

/**
 * Admin picks (owner, 2026-10-29; principle 5). GET, for every reader: the moments of a chapter (?chapter=n) or the
 * glossary terms (?terms=1) that have a pick, each with the pick ("Picked by @…") and the images the reader's switch
 * can show instead (Most liked, Newest, Liked by me). Nothing else is ordered here: the switch orders on the device.
 * POST, admins only: pick an image for a moment or a term, or clear the pick (imageKind "none"): a new row each time.
 */
const noStore = { 'Cache-Control': 'no-store' };
type Shown = { target: string; pick: Pick; options: PickOption[] };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const sql = db();
  if (!sql) return NextResponse.json({ picks: [] }, { headers: noStore });
  const chapter = Number(q.get('chapter'));
  const out: Shown[] = [];
  if (Number.isInteger(chapter) && chapter > 0) {
    const picks = await currentPicks(sql, { chapter });
    if (picks.length) {
      const options = await momentOptions(chapter);
      for (const p of picks) {
        const idx = Number(MOMENT.exec(p.target)?.[2]);
        const opts = options.get(idx) ?? [];
        // A pick of an image that is gone (hidden, or no longer at this moment) isn't shown.
        if (opts.some((o) => o.key === p.imageRef)) out.push({ target: p.target, pick: p, options: opts });
      }
    }
  } else if (q.get('terms') === '1') {
    for (const p of await currentPicks(sql, { terms: true })) {
      const opts = await termOptions(p.target);
      if (opts.some((o) => o.key === p.imageRef)) out.push({ target: p.target, pick: p, options: opts });
    }
  } else return NextResponse.json({ error: 'Ask for ?chapter=n or ?terms=1' }, { status: 400 });
  return NextResponse.json({ picks: out }, { headers: noStore });
}

export async function POST(request: Request) {
  const fid = await getFid(request);
  if (fid === null) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  if (!isAdmin(fid)) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available here' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { targetKind?: unknown; target?: unknown; imageKind?: unknown; imageRef?: unknown };
  const targetKind = b.targetKind === 'moment' || b.targetKind === 'term' ? b.targetKind : null;
  const target = typeof b.target === 'string' ? b.target : '';
  if (!targetKind || !(targetKind === 'moment' ? MOMENT : TERM).test(target)) return NextResponse.json({ error: 'A moment (c<chapter>-b<block>) or a glossary term' }, { status: 400 });
  const imageKind = b.imageKind === 'seeded' || b.imageKind === 'reader' || b.imageKind === 'none' ? (b.imageKind as PickImageKind | 'none') : null;
  if (!imageKind) return NextResponse.json({ error: 'imageKind is seeded, reader or none' }, { status: 400 });
  const imageRef = imageKind === 'none' ? null : typeof b.imageRef === 'string' ? b.imageRef : null;
  if (imageKind !== 'none') {
    // Only an image this target can show (the same list the reader's switch gets).
    const m = MOMENT.exec(target);
    const opts = targetKind === 'moment' ? ((await momentOptions(Number(m![1]))).get(Number(m![2])) ?? []) : await termOptions(target);
    if (!opts.some((o) => o.key === imageRef && o.kind === imageKind)) return NextResponse.json({ error: 'That image isn\'t one this moment or term shows' }, { status: 400 });
  }
  try {
    await addPick(sql, { targetKind, target, imageKind, imageRef, byFid: fid });
  } catch (e) {
    console.error('pick: admin_picks not ready', (e as Error).name);
    return NextResponse.json({ error: 'Picks need the admin_picks migration first.' }, { status: 503 });
  }
  if (targetKind === 'moment') revalidatePath(`/chapter/${MOMENT.exec(target)![1]}`);
  else revalidatePath('/references', 'layout');
  return NextResponse.json({ done: imageKind === 'none' ? 'cleared' : 'picked' });
}
