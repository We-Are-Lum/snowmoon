import { NextResponse } from 'next/server';
import { getFid } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { generationsLeft, publishesLeft } from '~/lib/images/limits';
import { RULES, styleText } from '~/lib/images/rules';
import { loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { storageReady } from '~/lib/images/store';

/** What the composer needs before Generate: may this person generate, and how many are left today. */
export async function GET(request: Request) {
  const fid = await getFid(request);
  const sql = db();
  const ready = Boolean(IMAGES.enabled && sql && process.env.FAL_KEY && process.env.IMAGES_TICKET_SECRET && storageReady());
  // The style's full text for this passage's setting: shown in full, since it becomes part of the public prompt (decision 7).
  const q = new URL(request.url).searchParams;
  const ch = loadChapter(Number(q.get('chapter')));
  const i = ch ? ch.blocks.findIndex((b) => b.idx === Number(q.get('start'))) : -1;
  const setting = ch && i >= 0 ? (blockFacts(ch.blocks)[i]?.setting ?? null) : null;
  const styles = [{ id: 'techno-vistas', name: 'Techno vistas', text: styleText('techno-vistas', setting) }];
  const base = { label: IMAGES.label, model: IMAGES.model, rules: RULES, perDay: IMAGES.generationsPerDay, publishesPerDay: IMAGES.publishesPerDay, maxBlocks: IMAGES.maxBlocks, styles, ready };
  if (fid === null) return NextResponse.json({ ...base, signedIn: false }, { headers: { 'Cache-Control': 'no-store' } });
  const invited = IMAGES.invited.includes(fid);
  if (!sql || !invited) return NextResponse.json({ ...base, signedIn: true, fid, invited }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [consented, left, publishes] = await Promise.all([hasConsented(fid), generationsLeft(sql, fid), publishesLeft(sql, fid)]);
    return NextResponse.json({ ...base, signedIn: true, fid, invited, consented, left, publishesLeft: publishes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('images status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, ready: false, signedIn: true, fid, invited }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
