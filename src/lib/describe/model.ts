import 'server-only';
import { CHAT } from '../config';
import { BUSY_RETRY_MS, directKey, ModelUnavailable } from '../chat/model';
import { providerOptions, servedBy, servedByPinned } from '../chat/provider';
import type { DescribeRequest } from './shot';

/**
 * "Describe the shot"'s one model call: the assistant's model and route (CHAT: Groq directly with the
 * project's key, then Vercel AI Gateway pinned to Groq with zero data retention when Groq is busy),
 * with a single tool the model must call. Only the tool's arguments are used; the words are never
 * logged or stored.
 *
 * DESCRIBE_TEST_FAKES=1 stands in for the model and for Farcaster sign-in, for the local tests only
 * (scripts/test-describe-shot.ts): it is refused on Vercel, and nothing it does costs anything.
 */
export const describeFakes = () => !process.env.VERCEL && process.env.DESCRIBE_TEST_FAKES === '1';

export interface ToolReply {
  args: unknown;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  provider: string | null;
}

/** The most a call may spend, reserved against the assistant's daily spend cap before it is made. */
export const MAX_TOKENS = 2000;
export const worstCaseUsd = (inputTokens = 6000) => {
  const p = CHAT.prices[CHAT.model];
  return inputTokens * p.input + MAX_TOKENS * p.output;
};

type Messages = { role: 'system' | 'user'; content: string }[];
const BUSY = [429, 498, 503];

interface Reply {
  id?: string;
  model?: string;
  choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

function read(j: Reply, provider: string | null): ToolReply {
  const call = j.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === 'set_shot');
  let args: unknown = null;
  try {
    args = call?.function?.arguments ? JSON.parse(call.function.arguments) : null;
  } catch {
    args = null;
  }
  const promptTokens = j.usage?.prompt_tokens ?? 0;
  const completionTokens = j.usage?.completion_tokens ?? 0;
  const price = CHAT.prices[CHAT.model];
  const costUsd = typeof j.usage?.cost === 'number' ? j.usage.cost : promptTokens * price.input + completionTokens * price.output;
  return { args, promptTokens, completionTokens, costUsd, provider };
}

export async function callTool(gatewayToken: string | null, messages: Messages, tool: unknown): Promise<ToolReply> {
  const body = {
    model: CHAT.model,
    messages,
    tools: [tool],
    tool_choice: { type: 'function', function: { name: 'set_shot' } },
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    reasoning_effort: 'low',
  };
  const key = directKey();
  if (key) {
    const res = await fetch(CHAT.direct.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return read((await res.json().catch(() => ({}))) as Reply, CHAT.provider);
    if (!CHAT.gatewayFallback || !gatewayToken) throw new ModelUnavailable(`direct ${res.status}`);
  }
  if (!gatewayToken) throw new ModelUnavailable('no route to the model');
  const send = () =>
    fetch(CHAT.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gatewayToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, providerOptions: providerOptions() }),
    });
  let res = await send();
  for (const wait of BUSY_RETRY_MS) {
    if (!BUSY.includes(res.status)) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as Reply;
  if (!res.ok) throw new ModelUnavailable(`gateway ${res.status}`);
  const provider = servedBy(j);
  if (!servedByPinned(provider)) throw new ModelUnavailable(`served by ${provider}, not the chosen provider`);
  return read(j, provider);
}

/** The tests' stand-in for the model: a fixed answer for a few test phrases, else lower and tighter. */
export function fakeTool(req: DescribeRequest): ToolReply {
  const w = req.words.toLowerCase();
  const first = Object.keys(req.camera.people)[0];
  let args: unknown;
  if (w.includes('test: beyond')) args = { cam: [999, 50, -999], fov: 500, ...(first ? { people: { [first]: { face: 725, at: [-500, 3] } } } : {}) };
  else if (w.includes('test: unknown person')) args = { people: { Q: { at: [0, 0] } } };
  else if (w.includes('test: unknown field')) args = { fov: 30, zoom: 2 };
  else if (w.includes('test: no tool')) args = null;
  else {
    const c = req.camera;
    args = { cam: [c.cam[0], Math.max(0.3, c.cam[1] - 0.5), c.cam[2]], fov: Math.max(10, c.fov - 10), ...(first ? { people: { [first]: { face: (c.people[first].face + 30) % 360 } } } : {}) };
  }
  return { args, promptTokens: 0, completionTokens: 0, costUsd: 0, provider: 'test' };
}
