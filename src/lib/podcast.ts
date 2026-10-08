import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import podcast from '../../config/podcast.json';
import { REPO_URL } from './config';

/**
 * The house narration as a podcast (config/podcast.json): RSS 2.0 with the iTunes
 * and Podcast Index namespaces, one episode per chapter in book order. The show
 * and episode words are the owner's, used exactly; this file only fills in
 * {n}, {chapter link} and {recipe link}. Audio and recipes come from
 * scripts/podcast-audio.py and scripts/publish-podcast.ts.
 */
const SITE = 'https://snowmoon.party';
const RECIPES = path.join(process.cwd(), 'content/snowmoon/recipes/podcast');

export interface Episode {
  n: number;
  title: string;
  guid: string;
  pubDate: string;
  url: string;
  bytes: number;
  seconds: number;
  chapterUrl: string;
  recipeUrl: string;
  description: string;
}

export const DISCLOSURE = {
  model: 'Kokoro-82M',
  voice: 'af_heart',
  notAffiliated: 'not affiliated with the author',
  licence: 'GPL v3',
};

/** Podcast Index guid: UUIDv5 of the feed URL without its scheme. */
export function podcastGuid(feedUrl: string): string {
  const ns = Buffer.from('ead4c236bf5858c6a2c6a6b28d128cb6', 'hex');
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(feedUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''))])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export function episodes(): Episode[] {
  const base = Date.parse(podcast.published);
  const out: Episode[] = [];
  for (let n = 1; n <= 32; n++) {
    const file = path.join(RECIPES, `chapter-${n}.json`);
    if (!existsSync(file)) continue;
    const r = JSON.parse(readFileSync(file, 'utf8')) as { file: { url?: string; bytes: number; duration_ms: number } };
    if (!r.file.url) continue;
    const chapterUrl = `${SITE}/chapter/${n}`;
    const recipeUrl = `${REPO_URL}/blob/main/content/snowmoon/recipes/podcast/chapter-${n}.json`;
    out.push({
      n,
      title: `Chapter ${n}`,
      // Stable for good: never derived from the audio, so a re-encode is the same episode.
      guid: `snowmoon-party-chapter-${n}`,
      // Book order by date, one minute apart, for apps that sort by date.
      pubDate: new Date(base + n * 60_000).toUTCString(),
      url: r.file.url,
      bytes: r.file.bytes,
      seconds: Math.round(r.file.duration_ms / 1000),
      chapterUrl,
      recipeUrl,
      description: podcast.words.episode_description_template
        .replace('{n}', String(n))
        .replace('{chapter link}', chapterUrl)
        .replace('{recipe link}', recipeUrl),
    });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Links in the episode description, as HTML inside CDATA (plain text stays plain). */
function descriptionHtml(e: Episode): string {
  const linked = esc(e.description).replace(esc(e.chapterUrl), `<a href="${e.chapterUrl}">${e.chapterUrl}</a>`).replace(esc(e.recipeUrl), `<a href="${e.recipeUrl}">${e.recipeUrl}</a>`);
  return `<![CDATA[<p>${linked}</p>]]>`;
}

export function feedXml(coverUrl: string | null): string {
  const w = podcast.words;
  const feed = podcast.feed_url;
  const items = episodes()
    .map(
      (e) => `    <item>
      <title>${esc(e.title)}</title>
      <itunes:title>${esc(e.title)}</itunes:title>
      <itunes:episode>${e.n}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <guid isPermaLink="false">${e.guid}</guid>
      <pubDate>${e.pubDate}</pubDate>
      <link>${e.chapterUrl}</link>
      <description>${descriptionHtml(e)}</description>
      <itunes:summary>${esc(e.description)}</itunes:summary>
      <enclosure url="${esc(e.url)}" length="${e.bytes}" type="audio/mpeg"/>
      <itunes:duration>${e.seconds}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <podcast:txt purpose="ai-content">true</podcast:txt>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(w.show_title)}</title>
    <link>${SITE}</link>
    <atom:link href="${feed}" rel="self" type="application/rss+xml"/>
    <description>${esc(w.show_description)}</description>
    <itunes:summary>${esc(w.show_description)}</itunes:summary>
    <language>${podcast.language}</language>
    <copyright>Text: Snowmoon by Vitalik Buterin, GPL-3.0. Audio: GPL-3.0, ${esc(podcast.publisher)}.</copyright>
    <itunes:author>${esc(podcast.publisher)}</itunes:author>
    <itunes:owner><itunes:name>${esc(podcast.publisher)}</itunes:name></itunes:owner>
    <itunes:type>${podcast.type}</itunes:type>
    <itunes:category text="${esc(podcast.category[0])}"><itunes:category text="${esc(podcast.category[1])}"/></itunes:category>
    <itunes:explicit>${podcast.explicit ? 'true' : 'false'}</itunes:explicit>${coverUrl ? `\n    <itunes:image href="${esc(coverUrl)}"/>\n    <image><url>${esc(coverUrl)}</url><title>${esc(w.show_title)}</title><link>${SITE}</link></image>` : ''}
    <podcast:guid>${podcastGuid(feed)}</podcast:guid>
    <podcast:license url="https://www.gnu.org/licenses/gpl-3.0.html">GPL-3.0</podcast:license>
    <podcast:medium>podcast</podcast:medium>
    <podcast:txt purpose="ai-content">true</podcast:txt>
${items}
  </channel>
</rss>
`;
}
