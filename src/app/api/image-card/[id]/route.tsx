import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { db } from '~/lib/db';
import { imageByVersion } from '~/lib/images/data';
import { passageLabel } from '~/lib/images/passage';

/**
 * A reader's image as a share card, like quote cards: 1200×800, the image above, and below it
 * what it is (AI-generated, by whom, not by the author) and where it belongs in the book. Words
 * drawn in code. Only published images; cached for minutes, so a hidden image's card stops too.
 */
export const runtime = 'nodejs';

const W = 1200;
const H = 800;
const IMG_H = 675;
const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource');
const font = (pkg: string, file: string) => readFileSync(path.join(FONT_DIR, pkg, 'files', file));

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = db();
  const im = sql ? await imageByVersion(sql, (await params).id).catch(() => null) : null;
  if (!im) return new Response('No such image', { status: 404 });
  const where = [`SNOWMOON · CHAPTER ${im.chapter}`, passageLabel(im.chapter, im.start, im.end)].filter(Boolean).join(' · ');
  const png = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#161614', fontFamily: 'DM Mono' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={im.url} width={W} height={IMG_H} style={{ width: W, height: IMG_H, objectFit: 'cover' }} alt="" />
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', fontSize: 22, color: '#A39F96', letterSpacing: 1 }}>
          <div style={{ display: 'flex' }}>{`AI-GENERATED IMAGE · BY FID ${im.byFid} · NOT BY THE AUTHOR`}</div>
          <div style={{ display: 'flex' }}>{where}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: [{ name: 'DM Mono', data: font('dm-mono', 'dm-mono-latin-400-normal.woff'), weight: 400, style: 'normal' }] },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300' } });
}
