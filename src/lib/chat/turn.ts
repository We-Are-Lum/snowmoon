import { CHAT } from '../config';
import { ask, validate, type AskDeps, type AskInput, type AskResult } from './ask';
import { chatSpendOk, record } from './limits';
import { makeTurn, readMakeToken, type MakeDeps, type MakeResult } from './make';
import { routeMessage, routeWorstUsd, type RouteComplete } from './router';

/**
 * One turn of the assistant, routing C (owner, 2026-10-30):
 * - make mode off (CHAT.make.enabled false, or no `make` deps): exactly today's book answer; no routing call.
 * - a conversation already in make mode (a valid make token for this FID) stays on Kimi K3; no routing call.
 * - otherwise the forced routing call on gpt-oss-120b (src/lib/chat/router.ts), counted against the chat's own
 *   spend cap; "book" goes to the book answer (its own limits as before), "make" to make mode (its own limits).
 */
export type TurnInput = AskInput & { make?: unknown };
export type TurnResult = AskResult | MakeResult;

export interface TurnDeps {
  ask: AskDeps;
  /** The routing call, on the chat's own route (Groq, or the gateway to Groq when Groq is busy). */
  route: RouteComplete;
  /** Make mode, or null while it is off. */
  make: Omit<MakeDeps, 'sql' | 'fid'> | null;
}

export async function turn(deps: TurnDeps, raw: TurnInput): Promise<TurnResult> {
  if (!deps.make) return ask(deps.ask, raw);
  const input = validate(raw);
  const { sql, fid } = deps.ask;
  const makeInput = { question: input.question, limit: input.limit, history: input.history ?? [], make: raw.make };
  if (readMakeToken(raw.make, fid)) return makeTurn({ ...deps.make, sql, fid }, makeInput);

  if (!(await chatSpendOk(sql, routeWorstUsd(input.question)))) return { state: 'spend' };
  const { route, reply } = await routeMessage(deps.route, input.question);
  // Counted with the chat's calls, as a search call: it reads only the latest message, before the answer.
  await record(sql, { kind: 'search', model: reply.model, provider: reply.provider, promptTokens: reply.promptTokens, completionTokens: reply.completionTokens, costUsd: reply.costUsd });
  if (route === 'make') return makeTurn({ ...deps.make, sql, fid }, { ...makeInput, make: undefined });
  return ask(deps.ask, raw);
}

/** Make mode is on in this deployment: switched on, and the owner's conditions in the settings hold. */
export function makeSettingsOk(): boolean {
  const m = CHAT.make;
  return m.enabled && m.provider === 'baseten' && m.zeroDataRetention === true && m.model === 'moonshotai/kimi-k3';
}
