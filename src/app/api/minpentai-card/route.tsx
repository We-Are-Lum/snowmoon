import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { loadFonts } from '~/lib/card-type';
import { parseResult } from '~/lib/minpentai/share-result';

/**
 * A shared Minpentai ladder win, drawn from its link each time (src/lib/minpentai/share-result.ts):
 * nothing is stored. ?shape=embed is Farcaster's 3:2 (1200×800); otherwise the link preview, 1200×630.
 * Lettering drawn in code, no image model.
 */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const x = parseResult(q.get('r'), q.get('s'));
  if (!x) return new Response('No such result', { status: 404 });
  const W = 1200, H = q.get('shape') === 'embed' ? 800 : 630;
  const muted = '#6A675F';
  const dots = [1, 2, 3, 4, 5];

  const png = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#060608', color: '#F4F2ED', fontFamily: 'Crimson Pro', padding: H > 700 ? '72px 80px' : '56px 72px' }}>
        <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 26, letterSpacing: 3, color: '#A7A49B' }}>MINPENTAI · THE LADDER</div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', fontSize: 104, lineHeight: 1.02 }}>Beat {x.name}</div>
          <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 34, letterSpacing: 2, marginTop: 22, color: '#E6E3DA' }}>
            RUNG {x.rung} OF 5 · IN {x.steps} STEPS
          </div>
          <div style={{ display: 'flex', marginTop: 34 }}>
            {dots.map((d) => (
              <div key={d} style={{ display: 'flex', width: 46, height: 46, marginRight: 14, border: '3px solid #E6E3DA', background: d <= x.rung ? '#E6E3DA' : 'transparent' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Mono', fontSize: 22, color: muted, letterSpacing: 1 }}>
          <div style={{ display: 'flex' }}>SNOWMOON PARTY · RULES INVENTED FOR THIS EDITION</div>
          <div style={{ display: 'flex' }}>NO RANKING</div>
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
