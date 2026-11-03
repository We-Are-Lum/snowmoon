import { NextResponse } from 'next/server';
import { isAdmin } from '~/lib/admins';
import { getPerson } from '~/lib/auth';
import { db } from '~/lib/db';
import { IMAGES } from '~/lib/config';
import { hasConsented } from '~/lib/consent';
import { generationsLeft, perDay, publishesLeft } from '~/lib/images/limits';
import { RULES, styleText } from '~/lib/images/rules';
import { loadChapter } from '~/lib/book';
import { blockFacts } from '~/lib/reading';
import { storageReady } from '~/lib/images/store';
import { keptValue } from '~/lib/images/neynar';
import { GATE_WORDING, openToEveryone } from '~/lib/images/gate';
import { IMAGE_WORDING } from '~/lib/images/wording';
import { balanceUsd, prepaidOpen, priceUsd } from '~/lib/wallet/credits';
import { generateReserveUsd } from '~/lib/images/price';
import { composerPicks, listDesigns, myPicks, startingStyleRetired, type MyPick } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';
import { inPassage, sheetCharacter, sheetPlace, shorthandLine } from '~/lib/images/sheets';

/** A pick as the composer shows it: the text in full, since it becomes part of the public prompt (decision 7). */
const chip = (p: MyPick) => ({
  versionId: p.versionId, kind: p.kind, entity: p.entity, title: p.title, by: designByline(p.byName, p.byFid, p.byRole), versionNo: p.versionNo, text: p.text,
  views: (['front', 'side', 'back'] as const).filter((k) => p.views[k]).length, drafted: Boolean(p.assist),
});
/** Every picked style, newest pick first (the composer starts with that one, for this image only; decision 3), and each picked sheet. */
const offer = (picks: MyPick[]) => {
  const o = composerPicks(picks);
  return { styles: o.styles.map(chip), characters: o.characters.map(chip), places: o.places.map(chip) };
};

/**
 * What the composer needs before Generate: may this person generate, and how many are left today.
 * Never asks Neynar (it is asked only at Generate): `eligible` is true for an invited FID, true or
 * false from a value kept in the last day, and null when none is kept (Generate will look it up).
 * Step 4: the person's own picks (private; only ever their own), offered as "for this image only".
 * Picks are open to everyone signed in, Farcaster accounts invited or not and wallet accounts (owner, 2026-10-19;
 * at Generate, 2026-10-23: "open picks to everyone at Generate, wallets too"); creating designs stays invited-only.
 * A wallet account gets the price of every Generate it can start: pricesUsd[n] with n reference pictures
 * (src/lib/images/price.ts), the same number reserve() charges.
 */
export async function GET(request: Request) {
  // A Farcaster FID, or minus a wallet account's number (prepaid; owner, 2026-10-13).
  const fid = await getPerson(request);
  const sql = db();
  const ready = Boolean(IMAGES.enabled && sql && process.env.FAL_KEY && process.env.IMAGES_TICKET_SECRET && storageReady());
  // The style's full text for this passage's setting: shown in full, since it becomes part of the public prompt (decision 7).
  const q = new URL(request.url).searchParams;
  const ch = loadChapter(Number(q.get('chapter')));
  const i = ch ? ch.blocks.findIndex((b) => b.idx === Number(q.get('start'))) : -1;
  const setting = ch && i >= 0 ? (blockFacts(ch.blocks)[i]?.setting ?? null) : null;
  // Decision 13: once "Techno vistas" is published as a design, the file option is retired; it is then a style like any other.
  const retired = sql ? await startingStyleRetired(sql).catch(() => false) : false;
  // Every image is made in a style (owner, 2026-10-14): the starting style while it is offered, then every published style,
  // the project's own first, each with its full text (it becomes part of the public prompt).
  const designs = sql ? await listDesigns(sql, 'style').catch(() => []) : [];
  const styles = [
    ...(retired ? [] : [{ id: 'techno-vistas', name: 'Techno vistas', text: styleText('techno-vistas', setting), by: null as string | null, drafted: true }]),
    ...[...designs.filter((d) => d.byRole === 'maintainer'), ...designs.filter((d) => d.byRole !== 'maintainer')].map((d) => ({
      id: d.versionId, name: d.title || d.entity, text: d.text, by: `${designByline(d.byName, d.byFid, d.byRole)} v${d.versionNo}`, drafted: Boolean(d.assist),
    })),
  ];
  // "In this passage" (2026-10-10): the characters it names and its scene's place, with the exact shorthand text Generate would add.
  const end = Number(q.get('end') ?? q.get('start'));
  const found = ch && i >= 0 && Number.isInteger(end) ? inPassage(ch.chapter, Number(q.get('start')), end) : { characters: [], place: null };
  const passageSheets = {
    passage: { chapter: ch?.chapter ?? 0, start: Number(q.get('start')), end },
    characters: found.characters.map((c) => ({ slug: c.slug, name: c.name, text: shorthandLine(sheetCharacter(c.slug)!) })),
    place: found.place ? { slug: found.place.slug, name: found.place.name, text: shorthandLine(sheetPlace(found.place.slug)!) } : null,
    maxCharacters: IMAGES.designs.maxCharacters,
  };
  const editModel = { name: IMAGES.editModel.name, licence: IMAGES.editModel.licence, host: IMAGES.editModel.host };
  const base = { label: IMAGES.label, model: IMAGES.model, editModel, rules: RULES, perDay: IMAGES.generationsPerDay, publishesPerDay: IMAGES.publishesPerDay, maxBlocks: isAdmin(fid) ? IMAGES.admin.maxBlocks : IMAGES.maxBlocks, styles, ready, inPassage: passageSheets, walletSignIn: prepaidOpen() };
  if (fid === null) return NextResponse.json({ ...base, signedIn: false }, { headers: { 'Cache-Control': 'no-store' } });
  const invited = IMAGES.invited.includes(fid);
  if (!sql) return NextResponse.json({ ...base, signedIn: true, fid, invited, eligible: invited ? true : null }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [consented, left, publishes, kept, picks] = await Promise.all([
      hasConsented(fid), generationsLeft(sql, fid), publishesLeft(sql, fid), invited || fid < 0 ? Promise.resolve(null) : keptValue(sql, fid), myPicks(sql, fid),
    ]);
    if (fid < 0) {
      // A wallet account: no daily count and no Neynar score; its balance pays (owner, 2026-10-13).
      const open = prepaidOpen() && openToEveryone().open;
      const prices = Array.from({ length: IMAGES.maxReferences + 1 }, (_, n) => priceUsd(generateReserveUsd(n)));
      const prepaid = { balanceUsd: await balanceUsd(sql, -fid), priceUsd: prices[0], pricesUsd: prices, markup: IMAGES.prepaid.markup };
      return NextResponse.json(
        { ...base, signedIn: true, fid, invited: false, eligible: open, refusal: open ? undefined : prepaidOpen() ? GATE_WORDING.notOpen : IMAGE_WORDING.prepaid.notOpen, consented, left, publishesLeft: publishes, picks: offer(picks), prepaid },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const eligible = invited ? true : kept === null ? null : kept >= IMAGES.neynarMinScore;
    const refusal = eligible === false && kept !== null ? GATE_WORDING.below(kept) : undefined;
    return NextResponse.json({ ...base, perDay: perDay(fid), signedIn: true, fid, invited, eligible, refusal, consented, left, publishesLeft: publishes, picks: offer(picks) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('images status failed', (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ ...base, ready: false, signedIn: true, fid, invited, eligible: invited ? true : null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
