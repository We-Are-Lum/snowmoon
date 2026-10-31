import 'server-only';
import { toolByName, ToolInputError } from '../agent/tools';
import { WORK } from '../config';
import type { MakeTool } from './make';

/**
 * The tools make mode offers today: the agent interface's book tools (public reads, src/lib/agent/tools.ts), held to
 * the thread's chapter limit as the book side is. Agents aren't held to a reader's limit, but this is a reader's
 * thread. The drafting tools (draft_picture, draft_sheet, …) need the assistant to act as the person's agent, which
 * isn't built yet (an owner decision; docs/branch-reports/routing-c.md); until then the prompt says drafting isn't open.
 */
const BOOK_TOOLS = ['search_book', 'get_passage', 'get_glossary', 'get_sheet', 'get_references'] as const;

const chapterOfBlock = (id: unknown) => {
  const m = typeof id === 'string' ? id.match(/^c(\d+)-b\d+$/) : null;
  return m ? Number(m[1]) : null;
};

class ToolMessage extends Error {
  readonly toolMessage = true;
}

export function makeTools(limit: number): MakeTool[] {
  const past = (c: number | null) => c !== null && c > limit;
  const guard: Record<string, { before?: (a: Record<string, unknown>) => Record<string, unknown>; after?: (out: unknown) => unknown }> = {
    search_book: {
      after: (out) => {
        const o = out as { hits: { chapter: number }[] };
        const hits = o.hits.filter((h) => h.chapter <= limit);
        return { ...o, hits, ...(hits.length < o.hits.length ? { note: `Hits past chapter ${limit}, the furthest this reader allows, are left out.` } : {}) };
      },
    },
    get_passage: {
      before: (a) => {
        if (typeof a.chapter === 'number' && a.chapter > limit) throw new ToolMessage(`chapter ${a.chapter} is past chapter ${limit}, the furthest this reader allows`);
        return a;
      },
    },
    get_glossary: { before: (a) => ({ ...a, through: Math.min(typeof a.through === 'number' ? a.through : limit, limit) }) },
    get_sheet: {
      after: (out) => {
        const o = out as { book_facts: { block: string }[]; about: unknown };
        // The sheet's summary isn't cited by chapter: kept only for a thread that may read the whole book.
        return { ...o, about: limit >= WORK.chapters ? o.about : null, book_facts: o.book_facts.filter((f) => !past(chapterOfBlock(f.block))) };
      },
    },
    get_references: {
      after: (out) => {
        const o = out as { first_seen?: { block?: string }; pictures?: { block: string }[] };
        if (past(chapterOfBlock(o.first_seen?.block))) throw new ToolMessage(`that word comes after chapter ${limit}, the furthest this reader allows`);
        return { ...o, pictures: (o.pictures ?? []).filter((p) => !past(chapterOfBlock(p.block))) };
      },
    },
  };
  return BOOK_TOOLS.map((name) => {
    const t = toolByName(name)!;
    const g = guard[name];
    return {
      name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
      run: async (args) => {
        try {
          const out = await t.run(g.before ? g.before(args) : args);
          return g.after ? g.after(out) : out;
        } catch (e) {
          if (e instanceof ToolInputError) throw new ToolMessage(e.message);
          throw e;
        }
      },
    };
  });
}
