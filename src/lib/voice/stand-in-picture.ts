import 'server-only';
import sharp from 'sharp';

/**
 * A stand-in picture for a shot (slice 2, overnight 2026-11-21: "no picture spending"): a plain card that says what the
 * shot asks for, drawn on our server, no model and no cost. It has the picture flow's shape (bytes, sha256, a signed
 * record, a recipe), so a real model can take its place later without changing the page. Labelled STAND-IN on the card
 * and in the recipe.
 */
export const STAND_IN = { model: 'stand-in', maker: 'this edition (no model; a placeholder card)', width: 1536, height: 864 } as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > width) {
      out.push(line.trim());
      line = w;
      if (out.length === lines) break;
    } else line = `${line} ${w}`;
  }
  if (out.length < lines && line.trim()) out.push(line.trim());
  if (out.length === lines && text.length > out.join(' ').length) out[lines - 1] = `${out[lines - 1].replace(/.{0,2}$/, '')}…`;
  return out;
}
const HUES: Record<string, number> = { wide: 205, medium: 160, close: 15, detail: 40, over: 270, low: 330, high: 190, pov: 95 };

export async function standInPicture(o: { shotNo: number; attempt: number; description: string; angleLabel: string; angleId: string; style: string | null; characters: string[] }): Promise<Buffer> {
  const hue = (HUES[o.angleId] ?? 0) + o.attempt * 23;
  const lines = wrap(o.description, 52, 5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STAND_IN.width}" height="${STAND_IN.height}">
  <rect width="100%" height="100%" fill="hsl(${hue % 360} 25% 22%)"/>
  <rect x="48" y="48" width="${STAND_IN.width - 96}" height="${STAND_IN.height - 96}" fill="none" stroke="hsl(${hue % 360} 30% 70%)" stroke-width="3" stroke-dasharray="18 12"/>
  <text x="96" y="140" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#f4f2ed" letter-spacing="4">STAND-IN · ${o.angleLabel === 'Closing card background' ? 'CLOSING CARD' : `SHOT ${o.shotNo}`} · TRY ${o.attempt}</text>
  <text x="96" y="210" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#f4f2ed" font-weight="bold">${esc(o.angleLabel)}</text>
  ${lines.map((l, i) => `<text x="96" y="${300 + i * 62}" font-family="Georgia, serif" font-size="46" fill="#ece9e2">${esc(l)}</text>`).join('\n  ')}
  <text x="96" y="${STAND_IN.height - 110}" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#cfccc4">${esc([o.style ? `Style: ${o.style}` : 'No style', o.characters.length ? `With: ${o.characters.join(', ')}` : ''].filter(Boolean).join('   ·   '))}</text>
  <text x="96" y="${STAND_IN.height - 70}" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#b4b3ba">A placeholder card, not a picture: no model was called.</text>
</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
