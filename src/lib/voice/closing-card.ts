import 'server-only';
import sharp from 'sharp';
import { CLOSING, wrapLines, type CreditLine } from './closing';

/**
 * The closing card as a picture (slice 4, DRAFT): the person's kept background (or a plain dark card), darkened, with
 * the site's own text drawn over it: the speech's title, the credits (closingCredits), the AI labels and the
 * snowmoon.party mark. The text is drawn here, never by a model, so it is always exactly the recipe's.
 */
export const CARD = { width: 1536, height: 864 } as const;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG: Record<CreditLine['who'], string> = { book: 'BOOK', invented: 'INVENTED', people: 'PEOPLE', ai: 'AI', site: '' };

export function closingSvg(title: string, lines: CreditLine[]): string {
  const { width: W, height: H } = CARD;
  let y = 96;
  const rows: string[] = [];
  for (const t of wrapLines(title, 46)) {
    y += 58;
    rows.push(`<text x="96" y="${y}" font-family="Georgia, serif" font-size="52" fill="#f4f2ed">${esc(t)}</text>`);
  }
  y += 36;
  for (const l of lines) {
    const wrapped = wrapLines(l.text, l.who === 'site' ? 92 : 78);
    y += l.who === 'site' ? 34 : 48;
    if (TAG[l.who]) rows.push(`<rect x="96" y="${y - 24}" width="${TAG[l.who].length * 13 + 22}" height="32" rx="6" fill="${l.who === 'ai' ? '#3d5a80' : l.who === 'book' ? '#6b4f2a' : l.who === 'invented' ? '#6a3d6b' : '#2f5d50'}"/><text x="107" y="${y - 1}" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="bold" fill="#fff" letter-spacing="1">${TAG[l.who]}</text>`);
    const x = TAG[l.who] ? 96 + TAG[l.who].length * 13 + 38 : 96;
    wrapped.forEach((w, i) => rows.push(`<text x="${x}" y="${y + i * (l.who === 'site' ? 32 : 38)}" font-family="Helvetica, Arial, sans-serif" font-size="${l.who === 'site' ? 24 : 30}" fill="${l.who === 'site' ? '#d8d5cd' : '#f4f2ed'}">${esc(w)}</text>`));
    y += (wrapped.length - 1) * (l.who === 'site' ? 32 : 38);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="rgba(10,12,18,0.8)"/>
  ${rows.join('\n  ')}
  <text x="${W - 96}" y="${H - 80}" text-anchor="end" font-family="Georgia, serif" font-size="56" fill="#ffffff">${CLOSING.mark}</text>
</svg>`;
}

export async function closingCard(background: Uint8Array | null, title: string, lines: CreditLine[]): Promise<Buffer> {
  const base = background
    ? // Blurred, so nothing written in the picture competes with the site's text (only its colours and shapes show).
      sharp(await sharp(Buffer.from(background)).resize(CARD.width, CARD.height, { fit: 'cover' }).blur(18).toBuffer())
    : sharp({ create: { width: CARD.width, height: CARD.height, channels: 3, background: '#1c2230' } });
  return base.composite([{ input: Buffer.from(closingSvg(title, lines)), top: 0, left: 0 }]).png({ compressionLevel: 9 }).toBuffer();
}
