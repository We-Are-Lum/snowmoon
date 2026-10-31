import { CHAT } from '../config';

/**
 * Routing C (owner, 2026-10-30). Before a turn, one forced call on the chat's model: it sees only these two lines
 * of instructions and the person's latest message, and must call `route` with "question about the book" or
 * "make something" (it can't answer instead). The instructions and the tool are trial 5's variant C, word for word
 * (docs/trials/trial-5-script-C.mts on next-version; all 12 conversations routed right, and 10 of 10 in its routing
 * test). Anything unreadable counts as a book question, as in the trial: the book side is the one with today's
 * guards, and it costs least.
 */
export const ROUTE_SYS =
  'Classify the person\'s message. "question about the book": they ask what something in the book means, who someone is, what happens, or anything they want explained or answered. "make something": they ask you to create, draft, draw, change or plan a picture, sheet, place, style, storyboard, comic, video, song or a change to a shot.';

export const ROUTE_TOOL = {
  type: 'function',
  function: {
    name: 'route',
    description: 'Classify the message.',
    parameters: { type: 'object', properties: { kind: { enum: ['question about the book', 'make something'] } }, required: ['kind'], additionalProperties: false },
  },
} as const;

export const ROUTE_CHOICE = { type: 'function', function: { name: 'route' } } as const;

export type Route = 'book' | 'make';

export type RouteComplete = (
  model: string,
  messages: { role: 'system' | 'user'; content: string }[],
  opts: { maxTokens: number; temperature: number; tools: unknown[]; toolChoice: unknown },
) => Promise<{ toolCalls?: { name: string; arguments: string }[]; promptTokens: number; completionTokens: number; costUsd: number; provider: string | null; model: string }>;

/** What the routing call is sent: exactly two messages, its instructions and the latest message. Nothing else. */
export function routeMessages(latest: string): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: ROUTE_SYS },
    { role: 'user', content: latest },
  ];
}

export function readRoute(toolCalls: { name: string; arguments: string }[] | undefined): Route {
  const call = toolCalls?.find((c) => c.name === 'route');
  try {
    return (JSON.parse(call?.arguments ?? '{}') as { kind?: string }).kind === 'make something' ? 'make' : 'book';
  } catch {
    return 'book';
  }
}

/** Worst case of one routing call, for the chat's spend check: about 300 tokens in, CHAT.router.maxTokens out. */
export function routeWorstUsd(latest: string): number {
  const p = CHAT.prices[CHAT.model];
  return (ROUTE_SYS.length + latest.length + 400) / 3 * p.input + CHAT.router.maxTokens * p.output;
}

export async function routeMessage(complete: RouteComplete, latest: string) {
  const r = await complete(CHAT.model, routeMessages(latest), { maxTokens: CHAT.router.maxTokens, temperature: 0, tools: [ROUTE_TOOL], toolChoice: ROUTE_CHOICE });
  return { route: readRoute(r.toolCalls), reply: r };
}
