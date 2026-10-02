/**
 * Parse one Snowmoon chapter page into ordered text blocks.
 *
 * Mapping from the source HTML (children of `.document-page`):
 *   h1                         -> heading   (Markdown "# ...")
 *   div.dateline.chapter-open  -> dateline  (Markdown "**place** · date")
 *   div.dateline.scene-break   -> break, then dateline
 *   hr                         -> break
 *   p                          -> paragraph (Markdown, speaker colour spans kept as <span data-hue>)
 *   blockquote                 -> quote     (Markdown "> ...")
 *   center (Dzegoban card)     -> quote     (HTML, which is valid inside Markdown)
 *   div.device-view with <svg> -> figure    (HTML: boards, maps, diagrams; SVG exported separately)
 *   div.device-view            -> screen    (HTML: hand-device screens, messages)
 *   nav, br                    -> skipped (navigation and spacing only)
 *
 * screen and figure blocks carry `data` (see screen-data.ts).
 *
 * Anything else throws, so a change in the source format fails loudly instead
 * of silently dropping text.
 */
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { createHash } from 'node:crypto';
import { extractFields, inferDevice, settingOfDateline, type Evidence, type ScreenData } from './screen-data';

export type BlockKind = 'heading' | 'dateline' | 'paragraph' | 'quote' | 'screen' | 'figure' | 'break';

export interface Block {
  idx: number;
  kind: BlockKind;
  content: string;
  sha256: string;
  data?: ScreenData;
}

export interface Figure {
  file: string; // e.g. c4-b115.svg
  svg: string;
}

/** Exported SVG name: c{chapter}-b{idx}.svg, with -{k} only if a block ever holds several. */
export const figureFile = (chapter: number, idx: number, k: number, count: number) =>
  `c${chapter}-b${idx}${count > 1 ? `-${k}` : ''}.svg`;

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

type $T = cheerio.CheerioAPI;

/** Escape characters that Markdown would otherwise interpret. */
function escapeMd(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([*_`[\]<>])/g, '\\$1')
    .replace(/&(?=[#a-zA-Z0-9]+;)/g, '&amp;');
}

/** Escape block-level Markdown syntax at the very start of a block. */
function escapeLineStart(md: string): string {
  return md
    .replace(/^(\s*)([#+-])(?=\s|$)/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s)/, '$1\\$2');
}

const HUE_RE = /^color:\s*oklch\(\s*0\.7\s+0\.15\s+([\d.]+)\s*\)\s*;?$/;

function hueOf(style: string): string {
  const m = style.match(HUE_RE);
  if (!m) throw new Error(`Unexpected span style: ${style}`);
  // Two decimals is stable and plenty to tell voices apart.
  return String(Math.round(Number(m[1]) * 100) / 100);
}

/** Inline HTML -> Markdown. Throws on tags it has not been taught. */
function inlineMd($: $T, nodes: AnyNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += escapeMd((node as unknown as { data: string }).data.replace(/\s+/g, ' '));
      continue;
    }
    if (node.type === 'comment') continue;
    if (node.type !== 'tag') throw new Error(`Unexpected inline node type: ${node.type}`);
    const el = node as Element;
    const inner = () => inlineMd($, el.children);
    switch (el.tagName) {
      case 'em':
      case 'i':
        out += wrap('*', inner());
        break;
      case 'b':
      case 'strong':
        out += wrap('**', inner());
        break;
      case 'code':
        out += '`' + $(el).text().replace(/`/g, '\\`') + '`';
        break;
      case 'sub':
      case 'sup':
        out += `<${el.tagName}>${inner()}</${el.tagName}>`;
        break;
      case 'br':
        out += '\\\n';
        break;
      case 'span': {
        const style = $(el).attr('style');
        if (!style) {
          out += inner();
          break;
        }
        out += `<span data-hue="${hueOf(style)}">${inner()}</span>`;
        break;
      }
      default:
        throw new Error(`Unexpected inline tag <${el.tagName}>: ${$.html(el).slice(0, 120)}`);
    }
  }
  return out;
}

/** Put emphasis markers outside surrounding whitespace so Markdown still parses them. */
function wrap(marker: string, s: string): string {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (!m[2]) return s;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

function paragraphMd($: $T, el: Element): string {
  return escapeLineStart(inlineMd($, el.children).trim());
}

/** Blockquote: bare text runs and <p> children each become a quoted paragraph. */
function blockquoteMd($: $T, el: Element): string {
  const paras: string[] = [];
  let run: AnyNode[] = [];
  const flush = () => {
    const md = inlineMd($, run).trim();
    if (md) paras.push(escapeLineStart(md));
    run = [];
  };
  for (const child of el.children) {
    if (child.type === 'tag' && (child as Element).tagName === 'p') {
      flush();
      const md = paragraphMd($, child as Element);
      if (md) paras.push(md);
    } else if (child.type === 'tag' && (child as Element).tagName === 'ul') {
      flush();
      const items = $(child)
        .children('li')
        .map((_, li) => '- ' + inlineMd($, (li as Element).children).trim())
        .get();
      paras.push(items.join('\n'));
    } else {
      run.push(child);
    }
  }
  flush();
  return paras.map((p) => p.split('\n').map((l) => `> ${l}`).join('\n')).join('\n>\n');
}

function datelineMd($: $T, el: Element): string {
  const txt = $(el).children('.txt');
  if (txt.length !== 1) throw new Error(`Dateline without .txt: ${$.html(el)}`);
  // The date is sometimes in a .date span and sometimes bare text after the separator.
  const place = txt.children('.place').text().trim();
  const rest = txt.clone();
  rest.children('.place, .sep').remove();
  const date = rest.text().replace(/\s+/g, ' ').trim();
  return [place && `**${escapeMd(place)}**`, date && escapeMd(date)].filter(Boolean).join(' · ');
}

/** Keep embedded HTML verbatim, minus anything executable. */
function safeHtml($: $T, el: Element): string {
  const c = $(el).clone();
  c.find('script').remove();
  c.find('*').addBack().each((_, e) => {
    for (const name of Object.keys((e as Element).attribs ?? {})) {
      if (/^on/i.test(name)) $(e).removeAttr(name);
    }
  });
  c.find('input, button').attr('disabled', '');
  return $.html(c).trim();
}

export function parseChapter(html: string, chapter: number): { blocks: Block[]; figures: Figure[] } {
  const $ = cheerio.load(html);
  const page = $('.document-page');
  if (page.length !== 1) throw new Error(`Chapter ${chapter}: expected one .document-page, found ${page.length}`);

  const blocks: Block[] = [];
  const figures: Figure[] = [];
  let setting: { name: string | null; evidence: Evidence | null } = { name: null, evidence: null };

  const push = (kind: BlockKind, content: string, data?: ScreenData) => {
    const b: Block = { idx: blocks.length, kind, content, sha256: sha256(content) };
    if (data) b.data = data;
    blocks.push(b);
    return b;
  };

  const pushDevice = (el: Element, cls: string[]) => {
    const idx = blocks.length;
    const svgs = $(el).find('svg').filter((_, s) => $(s).parents('svg').length === 0);
    const kind: BlockKind = svgs.length ? 'figure' : 'screen';
    svgs.each((k, s) => {
      figures.push({ file: figureFile(chapter, idx, k + 1, svgs.length), svg: $.html(s).trim() + '\n' });
    });
    const { device, evidence } = inferDevice(blocks);
    const data: ScreenData = {
      setting: setting.name,
      setting_evidence: setting.evidence,
      device,
      device_evidence: evidence,
      device_provisional: true,
      frame: {
        width: cls.includes('narrow-device-view') ? 'narrow' : 'wide',
        align: cls.includes('device-view-left') ? 'left' : 'center',
        style: $(el).attr('style')?.trim() || null,
      },
      fields: extractFields($, el, (k) => `docs/source-figures/${figureFile(chapter, idx, k, svgs.length)}`),
    };
    push(kind, safeHtml($, el), data);
  };

  page.children().each((_, node) => {
    const el = node as Element;
    const cls = ($(el).attr('class') ?? '').split(/\s+/);
    switch (el.tagName) {
      case 'nav':
      case 'br':
        return;
      case 'h1':
        push('heading', `# ${escapeMd($(el).text().trim())}`);
        return;
      case 'hr':
        push('break', '---');
        return;
      case 'p': {
        const md = paragraphMd($, el);
        if (md) push('paragraph', md);
        return;
      }
      case 'blockquote':
        push('quote', blockquoteMd($, el));
        return;
      case 'center':
        if ($(el).children('.dz-card').length !== 1) {
          throw new Error(`Chapter ${chapter}: <center> without a .dz-card: ${$.html(el).slice(0, 200)}`);
        }
        push('quote', safeHtml($, el));
        return;
      case 'div':
        if (cls.includes('dateline')) {
          if (cls.includes('scene-break')) push('break', '---');
          else if (!cls.includes('chapter-open')) throw new Error(`Unknown dateline: ${cls.join(' ')}`);
          const d = push('dateline', datelineMd($, el));
          const name = settingOfDateline(d.content);
          if (name) setting = { name, evidence: { idx: d.idx, quote: d.content.match(/^\*\*(.+?)\*\*/)![1] } };
          return;
        }
        if (cls.includes('device-view')) {
          pushDevice(el, cls);
          return;
        }
        break;
    }
    throw new Error(`Chapter ${chapter}: unexpected block <${el.tagName} class="${cls.join(' ')}">`);
  });

  return { blocks, figures };
}
