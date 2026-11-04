import 'server-only';
import { ToolInputError } from '../../agent/tools';
import { SoloError, type SoloMatch } from './solo';
import { load, save, StoreError } from './store';
import { planSoon, settle } from './quiet';

/**
 * Reading and changing one person's match, the same way for the connector's tools and the live page's Take turn
 * (owner, 2026-11-03: "same quiet-time rules as the tools").
 */
export const NOT_YOURS = 'no match of yours with that id (see minpentai_list_my_matches)';

/** One of the person's matches, after its quiet time (quiet.ts settle): a call's timing says nothing about planning. */
export async function mineFor(person: number, id: unknown) {
  if (typeof id !== 'string') throw new ToolInputError('match_id must be a match id');
  // Someone else's match, or none, is told so at once: its timing is not this person's to learn from.
  const peek = await load(id);
  if (!peek || peek.m.person !== person) throw new ToolInputError(NOT_YOURS);
  const r = await settle(id);
  if (!r) throw new ToolInputError(NOT_YOURS);
  return r;
}

/**
 * Runs a change on one of the person's matches and saves it; the engine's words come back as the error. A save that
 * meets another (the computer's plan being stored) is tried again on the fresh match, never shown. If the change opened
 * a new turn, the computer plans it just after this answer is sent.
 */
export async function changeFor<T>(person: number, id: unknown, f: (m: SoloMatch) => T): Promise<T> {
  let r = await mineFor(person, id);
  for (let i = 0; ; i++) {
    const { m, version } = r;
    const turn = m.turn, over = !!m.end;
    let out: T;
    try { out = f(m); } catch (e) { if (e instanceof SoloError) throw new ToolInputError(e.message); throw e; }
    try {
      await save(m, version);
      if (m.turn !== turn && !m.end && !over) planSoon(m.id);
      return out;
    } catch (e) {
      if (!(e instanceof StoreError) || i >= 4) throw e instanceof StoreError ? new ToolInputError('Something went wrong on our side. Try again in a moment.') : e;
      const again = await load(m.id);
      if (!again) throw new ToolInputError(NOT_YOURS);
      r = again;
    }
  }
}
