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
import { composerPicks, myPicks, startingStyleRetired, type MyPick } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';

/** A pick as the composer shows it: the text in full, since it becomes part of the public prompt (decision 7). */
const chip = (p: MyPick) => ({
  versionId: p.versionId, kind: p.kind, entity: p.entity, title: p.title, by: designByline(p.byName, p.byFid, p.byRole), versionNo: p.versionNo, text: p.text,
  views: (['front', 'side', 'back'] as const).filter((k) => p.views[k]).length, drafted: Boolean(p.assist),
});

/**
 * What the composer needs before Generate: may this person generate, and how many are left today.
 * Step 4: the person's own picks (private; only ever their own), offered as "for this image only".
 */
export async function GET(request: Request) {
  const fid = await getFid(request);
  const sql = db();
  const ready = Boolean(IMAGES.enabled && sql && process.env.FAL_KEY && process.env.IMAGES_TICKET_SECRET && storageReady());
  // The style's full text for this passage's setting: shown in full, since it becomes part of the public prompt (decision 7).
  const q = new URL(request.url).searchParams;
  const ch = loadChapter(Number(q.get('chapter')));
  const i = ch ? ch.blocks.findIndex((b) => b.idx === Number(q.get('start'))) : -1;
  const setting = ch && i >= 0 ? (blockFacts(ch.blocks)[i]?.setting ?? null) : null;
  // Decision 13: once "Techno vistas" is published as a design, the file option is retired; it is then a style like any other.
  const retired = sql ? await startingStyleRetired(sql).catch(() => false) : false;
  const styles = retired ? [] : [{ id: 'techno-vistas', name: 'Techno vistas', text: styleText('techno-vistas', setting) }];
  const editModel = { name: IMAGES.editModel.name, licence: IMAGES.editModel.licence, host: IMAGES.editModel.host };
  const base = { label: IMAGES.label, model: IMAGES.model, editModel, rules: RULES, perDay: IMAGES.generationsPerDay, publishesPerDay: IMAGES.publishesPerDay, maxBlocks: IMAGES.maxBlocks, styles, ready };
  if (fid === null) return NextResponse.json({ ...base, signedIn: false }, { headers: { 'Cache-Control': 'no-store' } });
  const invited = IMAGES.invited.includes(fid);
  if (!sql || !invited) return NextResponse.json({ ...base, signedIn: true, fid, invited }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [consented, left, publishes, picks] = await Promise.all([hasConsented(fid), generationsLeft(sql, fid), publishesLeft(sql, fid), myPicks(sql, fid)]);
    const offered = composerPicks(picks);
    // Every picked style, newest pick first; the composer starts with that one, for this image only (decision 3).
    const mine = { styles: offered.styles.map(chip), characters: offered.characters.map(chip) };
    return NextResponse.json({ ...base, signedIn: true, fid, invited, consented, left, publishesLeft: publishes, picks: mine }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('images status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, ready: false, signedIn: true, fid, invited }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
