import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { resolveQuote } from '~/lib/quote';

/**
 * A quote card: 1200×800 (3:2, the shape Farcaster uses for embeds). The image,
 * if any, fills the card; the quote and its place in the book sit over a fade.
 * Lettering is drawn here in code, never by an image model (brief Milestone 5).
 * The URL fully determines the card, so it is cached for a year. Served as
 * JPEG: as PNG, a card with an illustration is about 2 MB.
 */
export const runtime = 'nodejs';

const W = 1200;
const H = 800;
const FONT_DIR = path.join(process.cwd(), 'node_modules/@fontsource');
const font = (pkg: string, file: string) => readFileSync(path.join(FONT_DIR, pkg, 'files', file));
let fonts: { name: string; data: Buffer; weight: 400 | 500; style: 'normal' | 'italic' }[] | null = null;
function loadFonts() {
  fonts ??= [
    { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-400-italic.woff'), weight: 400, style: 'italic' },
    { name: 'Crimson Pro', data: font('crimson-pro', 'crimson-pro-latin-500-normal.woff'), weight: 500, style: 'normal' },
    { name: 'DM Mono', data: font('dm-mono', 'dm-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
  ];
  return fonts;
}

const ACCENT: Record<string, { light: string; dark: string }> = {
  veridia: { light: '#2E5A3A', dark: '#8DB58A' },
  dzego: { light: '#B3306E', dark: '#F08DB8' },
};

/** Bigger type for shorter quotes. */
function quoteSize(len: number, withImage: boolean): number {
  if (withImage) return len < 70 ? 46 : len < 130 ? 40 : len < 200 ? 34 : 30;
  return len < 90 ? 60 : len < 160 ? 50 : len < 260 ? 42 : 36;
}

/** Curly quotes and apostrophes; wrap in quotation marks unless the text already starts with one (dialogue). */
function typeset(text: string): string {
  let open = true;
  const t = text
    .replace(/(\w)'(\w)/g, '$1\u2019$2')
    .replace(/'/g, '\u2019')
    .replace(/"/g, () => ((open = !open) ? '\u201D' : '\u201C'));
  return /^[\u201C\u2018]/.test(t) ? t : `\u201C${t}\u201D`;
}

/** Image cards have less room: shorten at a word boundary. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '\u2026';
}

const IMAGE_H = 470; // the illustration's band; the quote sits below on a dark panel

export async function GET(request: Request, { params }: { params: Promise<{ n: string; range: string }> }) {
  const { n, range } = await params;
  const sp = new URL(request.url).searchParams;
  const quote = resolveQuote(Number(n), range, sp.get('q'), sp.get('img'));
  if (!quote) return new Response('No such quote in the book', { status: 404 });

  const withImage = !!quote.image;
  const accent = (quote.setting && ACCENT[quote.setting]) || { light: '#1D1D1B', dark: '#E7E4DD' };
  const text = typeset(withImage ? fit(quote.text, 230) : quote.text);
  const ink = withImage ? '#F4F2ED' : '#1D1D1B';
  const muted = withImage ? '#A39F96' : '#6A675F';
  const rule = withImage ? accent.dark : accent.light;
  const size = quoteSize(text.length, withImage);
  const label = `SNOWMOON · CHAPTER ${quote.chapter} · ${quote.label}`;

  const words = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ width: 5, background: rule, marginRight: 26, borderRadius: 2, display: 'flex' }} />
        <div style={{ display: 'flex', flex: 1, fontSize: size, lineHeight: 1.26, color: ink, fontStyle: 'italic' }}>{text}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: withImage ? 22 : 34, fontFamily: 'DM Mono', fontSize: withImage ? 19 : 22, color: muted, letterSpacing: 1 }}>
        <div style={{ display: 'flex' }}>{label}</div>
        <div style={{ display: 'flex' }}>VITALIK BUTERIN · GPL-3.0</div>
      </div>
    </div>
  );

  const png = new ImageResponse(
    quote.image ? (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#161614', fontFamily: 'Crimson Pro' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={quote.image.url} width={W} height={IMAGE_H} style={{ width: W, height: IMAGE_H, objectFit: 'cover' }} alt="" />
        <div style={{ display: 'flex', flex: 1, padding: '28px 64px 30px' }}>{words}</div>
      </div>
    ) : (
      <div style={{ width: W, height: H, display: 'flex', background: '#F4F2ED', fontFamily: 'Crimson Pro', padding: '72px' }}>{words}</div>
    ),
    {
      width: W,
      height: H,
      fonts: loadFonts(),
    },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable' },
  });
}
