/**
 * X's own character count for a post (twitter-text v3's weighting, as X documents it): most Latin, Greek, Cyrillic and
 * general punctuation counts 1; everything else counts 2 (CJK, most symbols); an emoji counts 2 however many code points
 * it has; every link counts 23, whatever its length. X also turns a bare domain ("snowmoon.party") into a link, so it
 * counts and is priced as one. Pure: no network.
 */

const LINK_WEIGHT = 23;
/** Code point ranges that weigh 1 (twitter-text v3 config). */
const LIGHT: [number, number][] = [
  [0x0000, 0x10ff],
  [0x2000, 0x200d],
  [0x2010, 0x201f],
  [0x2032, 0x2037],
];
/** Domains X links by itself: a dotted name ending in a common top-level domain, or anything starting http(s)://. */
const TLDS = 'com|org|net|io|co|xyz|party|app|dev|eth|limo|ai|me|so|gg|fm|tv|info|social|art|blog|news|link|page|site|world|us|uk|ca|de|fr|jp|eu';
const LINK_RE = new RegExp(`https?:\\/\\/[^\\s]+|\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})\\b(?:\\/[^\\s]*)?`, 'gi');
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

function weightOf(text: string): number {
  let n = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (EMOJI.test(segment)) {
      n += 2;
      continue;
    }
    for (const ch of segment) {
      const cp = ch.codePointAt(0)!;
      n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
  }
  return n;
}

/** The links X will see in a post (explicit or bare domains). */
export function linksIn(text: string): string[] {
  return [...text.normalize('NFC').matchAll(LINK_RE)].map((m) => m[0]);
}

/** X's weighted length of the post as it will go out. */
export function xLength(text: string): number {
  const t = text.normalize('NFC');
  let n = 0;
  let last = 0;
  for (const m of t.matchAll(LINK_RE)) {
    n += weightOf(t.slice(last, m.index)) + LINK_WEIGHT;
    last = m.index! + m[0].length;
  }
  return n + weightOf(t.slice(last));
}

/** The post as sent: the text, then the link (if any) on its own after a space. */
export const postText = (body: string, link: string | null) => (link ? `${body.trim()} ${link}` : body.trim());

/** @names in the text that X would turn into mentions (1–15 letters, digits or _, not inside a word or an email). */
export function mentionsIn(text: string): string[] {
  return [...text.matchAll(/(?:^|[^\w@.])@(\w{1,15})\b/g)].map((m) => m[1]);
}
