import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { loadFonts } from '~/lib/card-type';
import { world } from '~/lib/minpentai/play-game/game';
import { fullBoard } from '~/lib/minpentai/play-server/match';
import { LEVELS, RULE_SHORT, decChallenge, outcome, splitChallenge } from '~/lib/minpentai/snap/challenge';
import { boardPng } from '~/lib/minpentai/snap/run';
import { verified } from '~/lib/minpentai/snap/state';
import { settings, versionOf } from '~/lib/minpentai/snap/versions';

/**
 * A Minpentai challenge's link preview (owner, 2026-10-22: "for X"), drawn from its signed link each
 * time (src/lib/minpentai/snap/challenge.ts): the result shared and the start it was played from.
 * Nothing is stored. ?shape=embed is Farcaster's 3:2 (1200×800); otherwise 1200×630. Lettering drawn
 * in code, no image model.
 */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const x = splitChallenge(q.get('c') ?? '');
  const c = x && verified(x.body, x.sig) ? decChallenge(x.body) : null;
  if (!c) return new Response('No such challenge', { status: 404 });
  const W = 1200, H = q.get('shape') === 'embed' ? 800 : 630;
  const set = settings(c.rule, versionOf(c.ver), c.rule);
  const board = await boardPng(fullBoard(world()), set.R, 520);
  const said = outcome(c.res);
  const head = said[0].toUpperCase() + said.slice(1);

  const png = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#060608', color: '#F4F2ED', fontFamily: 'Crimson Pro', padding: H > 700 ? '64px 72px' : '48px 64px' }}>
        <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 26, letterSpacing: 3, color: '#A7A49B' }}>MINPENTAI · A CHALLENGE</div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 36 }}>
            <div style={{ display: 'flex', fontSize: 72, lineHeight: 1.04 }}>{head}</div>
            <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 28, letterSpacing: 1, marginTop: 22, color: '#E6E3DA' }}>
              AGAINST {LEVELS[c.lvl].toUpperCase()} · {c.res.taps} TAPS
            </div>
            <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 24, marginTop: 12, color: '#A7A49B' }}>EXTRA RULE: {RULE_SHORT[set.rule].toUpperCase()}</div>
            <div style={{ display: 'flex', fontSize: 40, marginTop: 30 }}>Same start. Can you beat it?</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${board.toString('base64')}`} width={520} height={293} alt="" />
        </div>
        <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 20, color: '#6A675F', letterSpacing: 1 }}>
          SNOWMOON PARTY · RULES INVENTED FOR THIS EDITION · PRACTICE, NOTHING RECORDED
        </div>
      </div>
    ),
    { width: W, height: H, fonts: loadFonts() },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
