import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { db } from '~/lib/db';
import { bookCharacters, designByVersion } from '~/lib/images/designs';
import { designByline } from '~/lib/images/byline';
import { isChallengeCharacter } from '~/lib/challenge/open-sheets';
import { CARD_SIZE, LANDING_WORDING as L, isLanding, landingPicture } from '~/lib/challenge/landing';

/**
 * A remix page's link preview picture (owner, 2026-11-04): the sheet's front view, whole (padded, never cropped), on
 * the dark paper, with its words drawn in code: the challenge, the character, the maker, and that the picture is
 * AI-generated, not by the author. ?shape=og is 1200×630 (Open Graph: Bluesky, Lens, X); otherwise 1200×800, the 3:2
 * Farcaster's mini app embed needs (600×400 to 3000×2000, under 10 MB; PNG, as its sharing guide recommends).
 * Only a published version of a challenge character's sheet with a front view: anything else, hidden or unpublished
 * included, answers 404 and is not cached, so a hidden version's card stops within the 5 minutes it is cached for.
 */
export const runtime = 'nodejs';

const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource');
const font = (pkg: string, file: string) => readFileSync(path.join(FONT_DIR, pkg, 'files', file));
const none = () => new Response('No such picture', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = db();
  const d = sql ? await designByVersion(sql, (await params).id).catch(() => null) : null;
  if (!d || !isLanding({ kind: d.kind, challengeCharacter: isChallengeCharacter(d.entity), body: d.shown.body })) return none();
  const front = landingPicture(d.shown.body)!;
  const { width: W, height: H } = new URL(request.url).searchParams.get('shape') === 'og' ? CARD_SIZE.og : CARD_SIZE.embed;
  // The front view (576×768 at the time of writing) fills the card's height; its own proportions are kept.
  const ratio = front.recipe.width > 0 && front.recipe.height > 0 ? front.recipe.width / front.recipe.height : 3 / 4;
  const picW = Math.min(Math.round(H * ratio), Math.round(W * 0.55));
  const picH = Math.round(picW / ratio);
  const character = bookCharacters().find((c) => c.name === d.entity);
  const name = character?.name ?? d.entity;
  const by = designByline(d.byName, d.byFid, d.byRole);
  const title = d.shown.body.title.trim();
  const png = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', background: '#161614', fontFamily: 'DM Mono' }}>
        <div style={{ width: picW, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0E0E0D' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={front.url} width={picW} height={picH} style={{ width: picW, height: picH }} alt="" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 52px' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 2, color: '#A39F96' }}>{L.cardTop}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'Crimson Pro', fontSize: 92, lineHeight: 1, color: '#F4F2ED' }}>{name}</div>
            {title && <div style={{ display: 'flex', fontFamily: 'Crimson Pro', fontSize: 40, marginTop: 16, color: '#D9D5CC' }}>{title.slice(0, 60)}</div>}
            <div style={{ display: 'flex', fontSize: 26, marginTop: 28, color: '#D9D5CC' }}>{(d.remixedFrom ? L.remixOf(by) : L.maker(by)).slice(0, 48)}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 18, letterSpacing: 1, color: '#A39F96' }}>{L.cardAi}</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: 'DM Mono', data: font('dm-mono', 'dm-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
        { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-500-normal.woff'), weight: 500, style: 'normal' },
      ],
    },
  );
  const body = new Uint8Array(await png.arrayBuffer());
  return new Response(body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, immutable, no-transform, max-age=300' } });
}
