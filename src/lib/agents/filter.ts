import 'server-only';
import { AGENTS } from '../config';
import { loadChapter } from '../book';
import { plainText } from '../book-search';
import { checkNoWriting } from '../make/no-writing';
import { ToolInputError } from '../agent/tools';

/**
 * What an agent's words must pass before anything is kept (owner, 2026-10-20; design §5).
 *
 * Story words (narration and dialogue) stay human (owner, 2026-10-20: the main goal; decision 6). An agent
 * places lines; it never writes them. A line is either:
 * - the book's, checked word for word against the block it cites ("…" marks a cut); or
 * - its person's, checked word for word against what the person typed or said to their agents.
 * AGENTS.storyWords = 'allowed' (off; only for testing the old path) would let an agent's own lines through,
 * labelled; never for AGENTS.humanWrittenOnly.
 */
export const storyWordsAllowed = (person: number) => AGENTS.storyWords === 'allowed' && !AGENTS.humanWrittenOnly.includes(person);

export interface Line {
  /** 'book' = a line from Snowmoon, cited by block; 'person' = the person's own words; 'agent' = the agent's (refused). */
  source: 'book' | 'person' | 'agent';
  block?: string;
  speaker?: string;
  text: string;
}

const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** A book line is in its block, word for word (cuts marked "…" or "..."), in order. */
export function bookLineOk(block: string, text: string): boolean {
  const m = block.match(/^c(\d{1,2})-b(\d{1,4})$/);
  if (!m) return false;
  const b = loadChapter(Number(m[1]))?.blocks.find((x) => x.idx === Number(m[2]));
  if (!b) return false;
  const source = norm(plainText(b.content));
  let from = 0;
  for (const part of norm(text).split(/\s*(?:…|\.\.\.)\s*/).filter(Boolean)) {
    const at = source.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return norm(text).length > 0;
}

/** A person's line is in something they typed or said to their agents, word for word ("…" for a cut). */
export function personLineOk(text: string, words: string[]): boolean {
  const parts = norm(text).split(/\s*(?:…|\.\.\.)\s*/).filter(Boolean);
  return parts.length > 0 && words.some((w) => {
    const src = norm(w);
    let from = 0;
    for (const part of parts) {
      const at = src.indexOf(part, from);
      if (at < 0) return false;
      from = at + part.length;
    }
    return true;
  });
}

/** Checks the lines an agent places; says whether any are the agent's own words (refused unless the old switch is on). */
export function checkLines(raw: unknown, person: number, words: string[] = []): { lines: Line[]; wordsByAgent: boolean; personWords: boolean } {
  if (raw === undefined || raw === null) return { lines: [], wordsByAgent: false, personWords: false };
  if (!Array.isArray(raw) || raw.length > 60) throw new ToolInputError('lines must be a list of at most 60');
  const lines: Line[] = raw.map((l, i) => {
    if (!l || typeof l !== 'object') throw new ToolInputError(`line ${i + 1} must be an object`);
    const o = l as Record<string, unknown>;
    const text = typeof o.text === 'string' ? o.text.trim() : '';
    if (!text || text.length > 600) throw new ToolInputError(`line ${i + 1}: text is required, at most 600 characters`);
    const speaker = typeof o.speaker === 'string' ? o.speaker.trim().slice(0, 40) : undefined;
    if (o.source === 'book') {
      const block = typeof o.block === 'string' ? o.block : '';
      if (!bookLineOk(block, text)) throw new ToolInputError(`line ${i + 1}: not in block ${block || '(none given)'} word for word. Book lines must be exact, with "…" for a cut, and cite their block (c<chapter>-b<block>).`);
      return { source: 'book', block, speaker, text };
    }
    if (o.source === 'person') {
      if (!personLineOk(text, words)) throw new ToolInputError(`line ${i + 1}: not in anything your person typed or said, word for word. Story words are theirs or the book's; ask them for the line (it comes back to you as a request).`);
      return { source: 'person', speaker, text };
    }
    if (o.source !== 'agent') throw new ToolInputError(`line ${i + 1}: source must be "person" (their words, exactly), or "book" (with its block)`);
    return { source: 'agent', speaker, text };
  });
  const wordsByAgent = lines.some((l) => l.source === 'agent');
  if (wordsByAgent && !storyWordsAllowed(person))
    throw new ToolInputError('Story words stay human: use your person’s own words (source "person", exactly as they said them) or the book’s (source "book", with the block). If a line is missing, leave it out and ask your person for it.');
  return { lines, wordsByAgent, personWords: lines.some((l) => l.source === 'person') };
}

/**
 * Free text (an idea, a note, a description). Plain text, a length limit, links only to this site.
 * If it carries written lines in disguise (a speaker line, a script, quoted dialogue of three words or
 * more), it counts as the agent's story words (shot directions and descriptions don't): refused where those are refused, and labelled where they're allowed.
 */
export function checkText(raw: unknown, what: string, max: number, person: number, own = ''): { text: string; wordsByAgent: boolean } {
  if (typeof raw !== 'string') throw new ToolInputError(`${what} is required`);
  const text = raw.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text || text.length > max) throw new ToolInputError(`${what}: 1 to ${max} characters`);
  for (const m of text.matchAll(/\bhttps?:\/\/([^/\s]+)/gi)) {
    const host = m[1].toLowerCase();
    if (host !== 'snowmoon.party' && !host.endsWith('.snowmoon.party')) throw new ToolInputError(`${what}: links only to snowmoon.party`);
  }
  // Story words are lines for the characters: quoted dialogue, a speaker line, a script. A shot direction or a
  // description ("Hold on the room", "We see her turn") is not, here: agents may describe and direct.
  const written = checkNoWriting(text, own).reasons.some((r) => r.reason === 'quoted' || r.reason === 'speaker' || r.reason === 'script');
  if (written && !storyWordsAllowed(person))
    throw new ToolInputError(`${what} reads like written story lines (dialogue, narration or a script). Story words stay human: describe what happens, quote your person's own words, or quote the book in lines with its block.`);
  return { text, wordsByAgent: written };
}

/** An image prompt or a short label: plain text, a length limit, links only to this site. Not story words. */
export function checkPlain(raw: unknown, what: string, max: number): string {
  if (typeof raw !== 'string') throw new ToolInputError(`${what} is required`);
  const text = raw.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text || text.length > max) throw new ToolInputError(`${what}: 1 to ${max} characters`);
  if (/\bhttps?:\/\/(?!(?:[a-z0-9-]+\.)?snowmoon\.party\b)/i.test(text)) throw new ToolInputError(`${what}: links only to snowmoon.party`);
  return text;
}
