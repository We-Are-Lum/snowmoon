import 'server-only';
import { AGENTS } from '../config';
import { loadChapter } from '../book';
import { plainText } from '../book-search';
import { checkNoWriting } from '../make/no-writing';
import { ToolInputError } from '../agent/tools';

/**
 * What an agent's words must pass before anything is kept (owner, 2026-10-20; design §5).
 *
 * Story words (narration and dialogue) are the owner's decision 6. One switch, AGENTS.storyWords:
 * - 'allowed' (the default unless the owner says otherwise): an agent may write lines; each version
 *   that has them is marked words_by_agent and labelled "words by @x's agent" wherever it appears,
 *   and "human-written only" filters it out;
 * - 'refused': an agent may use only the book's lines, word for word with their block.
 * People in AGENTS.humanWrittenOnly (the owner) never get agent-written lines, whatever the switch.
 * A line from the book is always checked word for word against the block it cites; "…" marks a cut.
 */
export const storyWordsAllowed = (person: number) => AGENTS.storyWords === 'allowed' && !AGENTS.humanWrittenOnly.includes(person);

export interface Line {
  /** 'book' = a line from Snowmoon, cited by block; 'agent' = written by the agent. */
  source: 'book' | 'agent';
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

/** Checks the lines an agent drafts; says whether any are the agent's own words. */
export function checkLines(raw: unknown, person: number): { lines: Line[]; wordsByAgent: boolean } {
  if (raw === undefined || raw === null) return { lines: [], wordsByAgent: false };
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
    if (o.source !== 'agent') throw new ToolInputError(`line ${i + 1}: source must be "book" (with its block) or "agent"`);
    return { source: 'agent', speaker, text };
  });
  const wordsByAgent = lines.some((l) => l.source === 'agent');
  if (wordsByAgent && !storyWordsAllowed(person))
    throw new ToolInputError(
      AGENTS.humanWrittenOnly.includes(person)
        ? 'Your person keeps their story words human-written: use the book’s lines (source "book", with the block), or leave lines out for them to write.'
        : 'Agents may not write story words here: use the book’s lines (source "book", with the block), or leave lines out for your person to write.',
    );
  return { lines, wordsByAgent };
}

/**
 * Free text (an idea, a note, a description). Plain text, a length limit, links only to this site.
 * If it carries written lines in disguise (a speaker line, a script, quoted dialogue), it counts as
 * the agent's story words: refused where those are refused, and labelled where they're allowed.
 */
export function checkText(raw: unknown, what: string, max: number, person: number, own = ''): { text: string; wordsByAgent: boolean } {
  if (typeof raw !== 'string') throw new ToolInputError(`${what} is required`);
  const text = raw.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!text || text.length > max) throw new ToolInputError(`${what}: 1 to ${max} characters`);
  for (const m of text.matchAll(/\bhttps?:\/\/([^/\s]+)/gi)) {
    const host = m[1].toLowerCase();
    if (host !== 'snowmoon.party' && !host.endsWith('.snowmoon.party')) throw new ToolInputError(`${what}: links only to snowmoon.party`);
  }
  const written = !checkNoWriting(text, own).ok;
  if (written && !storyWordsAllowed(person))
    throw new ToolInputError(`${what} reads like written story lines (dialogue, narration or a script). Agents may not write those for this person; describe the idea instead, or quote the book with its block.`);
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
