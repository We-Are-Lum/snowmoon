import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { glossaryTerm } from '~/lib/glossary';
import { loadFonts, typeset } from '~/lib/card-type';

/**
 * A glossary word's share card: 1200×800 (3:2, Farcaster's embed shape). The word, then the
 * book's first sentence that uses it, with its place. Nothing else defines the word (P2e): the
 * sentence is from the chapter where the word first appears, so the card shows no later chapter.
 * Lettering drawn in code, no image model. Cached for a day: a rebuilt glossary may change it.
 */
export const runtime = 'nodejs';

const W = 1200;
const H = 800;

export async function GET(_request: Request, { params }: { params: Promise<{ term: string }> }) {
  const t = glossaryTerm((await params).term);
  if (!t) return new Response('No such word in the glossary', { status: 404 });

  const quote = typeset(t.firstSentence.text);
  const size = quote.length < 90 ? 46 : quote.length < 160 ? 40 : quote.length < 260 ? 34 : 30;
  const label = `SNOWMOON · CHAPTER ${t.firstSentence.chapter} · ${t.firstSentence.label} · GPL-3.0`;
  const muted = '#6A675F';

  const png = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#F4F2ED', fontFamily: 'Crimson Pro', padding: '64px 72px', color: '#1D1D1B' }}>
        <div style={{ display: 'flex', fontFamily: 'DM Mono', fontSize: 24, letterSpacing: 2, color: muted }}>GLOSSARY</div>
        <div style={{ display: 'flex', fontSize: t.term.length > 14 ? 96 : 128, fontWeight: 500, lineHeight: 1.05, marginTop: 18 }}>{t.term}</div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 5, background: '#1D1D1B', marginRight: 26, borderRadius: 2, display: 'flex' }} />
            <div style={{ display: 'flex', flex: 1, fontSize: size, lineHeight: 1.26, fontStyle: 'italic' }}>{quote}</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'DM Mono', fontSize: 22, color: muted, letterSpacing: 1 }}>
          <div style={{ display: 'flex' }}>{label}</div>
          <div style={{ display: 'flex' }}>WORDS: VITALIK BUTERIN</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: loadFonts() },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
