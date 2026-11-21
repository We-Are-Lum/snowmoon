import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '~/lib/db';
import { noStore, voicePerson } from '~/lib/voice/server';
import { listDesigns } from '~/lib/images/designs';
import { angleById, shotPrompt } from '~/lib/voice/board';
import { ownPerformance, pictureBytes } from '~/lib/voice/board-store';
import { STAND_IN, standInPicture } from '~/lib/voice/stand-in-picture';
import { signTicket } from '~/lib/voice/ticket';
import { VOICE } from '~/lib/config';

/**
 * POST: make a picture for one shot, in the picture flow's shape (bytes, sha256, a signed record, the recipe with the
 * exact prompt). Tonight a stand-in card (no model, no cost); a real model takes its place later. Nothing is stored
 * until Keep. The description is the person's own words: required, used word for word, never written for them.
 * GET ?draft=&shot=&sha=: a kept picture, to its draft's own person only.
 */
export async function POST(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const b = (await request.json().catch(() => ({}))) as { draftId?: string; shotKey?: string; shotNo?: number; description?: string; angle?: string; styleId?: string | null; characterIds?: string[]; attempt?: number };
  const draft = await ownPerformance(sql, who.fid, String(b.draftId ?? ''));
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const description = String(b.description ?? '').trim();
  if (!description) return NextResponse.json({ error: 'Write what the shot shows first' }, { status: 400 });
  if (description.length > 600) return NextResponse.json({ error: 'At most 600 characters' }, { status: 400 });
  const angle = angleById(String(b.angle ?? ''));
  if (!angle) return NextResponse.json({ error: 'Pick a camera angle' }, { status: 400 });
  if (!/^[a-z0-9]{1,16}$/.test(String(b.shotKey ?? ''))) return NextResponse.json({ error: 'No such shot' }, { status: 400 });
  const [styles, characters] = await Promise.all([listDesigns(sql, 'style').catch(() => []), listDesigns(sql, 'character').catch(() => [])]);
  const style = b.styleId ? (styles.find((s) => s.versionId === b.styleId) ?? null) : null;
  if (b.styleId && !style) return NextResponse.json({ error: 'That style is not a published sheet' }, { status: 400 });
  const chars = (b.characterIds ?? []).slice(0, 6).map((id) => characters.find((c) => c.versionId === id));
  if (chars.some((c) => !c)) return NextResponse.json({ error: 'A character is not a published sheet' }, { status: 400 });
  const attempt = Math.max(1, Math.min(50, Number(b.attempt) || 1));
  const prompt = shotPrompt({ description, angle: angle.id }, style, chars as { title: string; text: string }[]);
  const png = await standInPicture({ shotNo: Number(b.shotNo) || 1, attempt, description, angleLabel: angle.label, angleId: angle.id, style: style?.title ?? null, characters: chars.map((c) => c!.title) });
  const sha256 = createHash('sha256').update(png).digest('hex');
  const recipe = {
    model: STAND_IN.model,
    maker: STAND_IN.maker,
    standIn: true,
    prompt,
    description,
    angle: angle.id,
    style: style ? { versionId: style.versionId, title: style.title } : null,
    characters: chars.map((c) => ({ versionId: c!.versionId, title: c!.title })),
    attempt,
    width: STAND_IN.width,
    height: STAND_IN.height,
    sha256,
    costUsd: 0,
  };
  const now = Date.now();
  const ticket = signTicket({ v: 1, kind: 'picture', fid: who.fid, draftId: draft.id, shotKey: b.shotKey, sha256, recipe, issuedAt: now, expiresAt: now + VOICE.ticketMinutes * 60_000 });
  return NextResponse.json({ image: `data:image/png;base64,${png.toString('base64')}`, sha256, recipe, ticket }, { headers: noStore });
}

export async function GET(request: Request) {
  const who = await voicePerson(request);
  if (who instanceof NextResponse) return who;
  const sql = db();
  if (!sql) return NextResponse.json({ error: 'Not available right now' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const draft = await ownPerformance(sql, who.fid, String(q.get('draft') ?? ''));
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const bytes = await pictureBytes(sql, draft.id, String(q.get('shot') ?? ''), String(q.get('sha') ?? ''));
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'image/png', ...noStore } });
}
