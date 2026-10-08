/**
 * The podcast feed (src/lib/podcast.ts). Fails (exit 1) on any problem.
 *
 *   npm run check:podcast -- --url=https://snowmoon.party
 *
 * - The feed is well-formed XML, RSS 2.0, with the itunes and podcast namespaces,
 *   and has the channel tags Apple and Spotify require: title, link, description,
 *   language, itunes:author, itunes:category Fiction › Science Fiction,
 *   itunes:explicit, itunes:type serial, itunes:owner with the contact email in
 *   config/podcast.json, and itunes:image (PNG or JPEG, sent with Last-Modified),
 *   on the channel and on every episode.
 * - One episode per chapter, 1–32 in order, each with a unique guid, pubDate,
 *   title, description, itunes:duration, itunes:episode, and an enclosure
 *   (url, type audio/mpeg, length). Every enclosure answers a HEAD with that
 *   length and a byte-range request with 206.
 * - Every episode carries the disclosure: model and voice, not affiliated, GPL,
 *   a link to the chapter in the reader and to its recipe.
 * - --plant=… breaks a copy of the feed in one way; the check must fail.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import podcastConfig from '../config/podcast.json';

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const BASE = (arg('url') ?? 'http://localhost:3000').replace(/\/$/, '');
const PLANT = arg('plant');
const failures: string[] = [];
const notes: string[] = [];
const fail = (m: string) => failures.push(m);
/** What every episode description must carry (owner, 2026-10-07; Apple guideline 1.11 on synthetic voices). */
const DISCLOSURE_RES: [string, RegExp][] = [
  ['the model (Kokoro-82M)', /Kokoro-82M/],
  ['the voice (af_heart)', /af_heart/],
  ['"synthetic voice"', /synthetic voice/],
  ['"not affiliated with the author"', /not affiliated with the author/],
  ['the GPL notice', /GPL v3/],
  ['a link to the chapter in the reader', /href="https:\/\/snowmoon\.party\/chapter\/\d+"/],
  ['a link to its recipe', /href="https:\/\/github\.com\/We-Are-Lum\/snowmoon\/blob\/main\/content\/snowmoon\/recipes\/podcast\/chapter-\d+\.json"/],
];

let xml = await (await fetch(`${BASE}/podcast.xml`)).text();
if (PLANT === 'enclosure') xml = xml.replace(/<enclosure [^>]*\/>/, '');
if (PLANT === 'disclosure') xml = xml.replace('read by a synthetic voice (Kokoro-82M, stock voice af_heart)', 'read aloud');
if (PLANT === 'invalid') xml = xml.replace('</channel>', '');
if (PLANT === 'cover') xml = xml.replace(/<itunes:image [^>]*\/>/g, '');
if (PLANT === 'owner') xml = xml.replace(/<itunes:owner>[\s\S]*?<\/itunes:owner>/, '');

const valid = XMLValidator.validate(xml);
if (valid !== true) {
  fail(`not well-formed XML: ${valid.err.msg} (line ${valid.err.line})`);
} else {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: '#cdata', parseTagValue: false, parseAttributeValue: false, isArray: (n) => n === 'item' || n === 'itunes:category' }).parse(xml);
  const rss = doc.rss;
  if (rss?.['@version'] !== '2.0') fail('not RSS 2.0');
  if (rss?.['@xmlns:itunes'] !== 'http://www.itunes.com/dtds/podcast-1.0.dtd') fail('itunes namespace missing');
  if (rss?.['@xmlns:podcast'] !== 'https://podcastindex.org/namespace/1.0') fail('podcast namespace missing');
  const ch = rss?.channel ?? {};
  for (const tag of ['title', 'link', 'description', 'language', 'itunes:author', 'itunes:explicit', 'itunes:type'])
    if (!ch[tag]) fail(`channel: no <${tag}>`);
  if (ch['itunes:type'] !== 'serial') fail('channel: itunes:type is not serial');
  if (!['true', 'false'].includes(String(ch['itunes:explicit']))) fail('channel: itunes:explicit is not true or false');
  const cat = ch['itunes:category']?.[0];
  if (cat?.['@text'] !== 'Fiction' || cat?.['itunes:category']?.[0]?.['@text'] !== 'Science Fiction') fail('channel: category is not Fiction › Science Fiction');
  if (!/not affiliated with the author/.test(ch.description ?? '') || !/synthetic voice/.test(ch.description ?? '')) fail('channel: the description lacks the disclosure');
  const ownerTag = [ch['itunes:owner']].flat()[0] as Record<string, unknown> | undefined;
  const ownerEmail = String([ownerTag?.['itunes:email']].flat()[0] ?? '');
  if (ownerEmail !== podcastConfig.owner.email) fail(`channel: itunes:owner email is "${ownerEmail}", not the contact in config/podcast.json`);
  const cover = (ch['itunes:image'] as Record<string, string> | undefined)?.['@href'];
  if (!cover) fail('channel: no itunes:image (cover art), which Apple and Spotify require');
  else {
    const head = await fetch(cover, { method: 'HEAD' });
    if (!head.ok) fail(`cover art: HEAD ${head.status}`);
    else if (!/^image\/(png|jpeg)$/.test(head.headers.get('content-type') ?? '')) fail(`cover art is ${head.headers.get('content-type')}, not PNG or JPEG`);
    if (!head.headers.get('last-modified')) fail('cover art: the server sends no Last-Modified (Apple requires it)');
  }

  const items: Record<string, unknown>[] = ch.item ?? [];
  if (items.length !== 32) fail(`${items.length} episodes, not 32`);
  const guids = new Set<string>();
  for (const [i, it] of items.entries()) {
    const n = i + 1;
    const at = `episode ${n}`;
    const text = (k: string) => {
      const v = it[k] as unknown;
      return typeof v === 'object' && v ? String((v as Record<string, unknown>)['#text'] ?? (v as Record<string, unknown>)['#cdata'] ?? '') : String(v ?? '');
    };
    if (Number(it['itunes:episode']) !== n) fail(`${at}: itunes:episode is ${it['itunes:episode']}, not ${n} (book order)`);
    for (const k of ['title', 'pubDate', 'itunes:duration']) if (!text(k)) fail(`${at}: no <${k}>`);
    const guid = text('guid');
    if (!guid) fail(`${at}: no guid`);
    else if (guids.has(guid)) fail(`${at}: guid ${guid} repeats`);
    guids.add(guid);
    if (Number.isNaN(Date.parse(text('pubDate')))) fail(`${at}: pubDate is not a date`);
    const desc = text('description');
    const d = DISCLOSURE_RES.filter(([, re]) => !re.test(desc)).map(([what]) => what);
    if (d.length) fail(`${at}: the description lacks ${d.join(', ')}`);
    if ((it['itunes:image'] as Record<string, string> | undefined)?.['@href'] !== cover) fail(`${at}: no itunes:image, or not the show's cover`);
    const enc = it.enclosure as Record<string, string> | undefined;
    if (!enc?.['@url'] || !enc['@length'] || enc['@type'] !== 'audio/mpeg') {
      fail(`${at}: enclosure missing or incomplete`);
      continue;
    }
    const head = await fetch(enc['@url'], { method: 'HEAD' });
    if (!head.ok) fail(`${at}: enclosure HEAD ${head.status}`);
    else if (head.headers.get('content-length') !== enc['@length']) fail(`${at}: enclosure is ${head.headers.get('content-length')} bytes, the feed says ${enc['@length']}`);
    const range = await fetch(enc['@url'], { headers: { Range: 'bytes=0-1023' } });
    if (range.status !== 206) fail(`${at}: byte-range request answered ${range.status}, not 206`);
    await range.arrayBuffer().catch(() => {});
  }
}

if (notes.length) console.log(`notes:\n- ${notes.join('\n- ')}`);
if (failures.length) {
  console.error(`PODCAST CHECK FAILED (${failures.length}):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log(`podcast check passed: ${BASE}/podcast.xml, 32 episodes, every enclosure answers HEAD and byte ranges`);

