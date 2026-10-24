/**
 * The support check's request and call, shared by scripts/glossary-support-check.ts and the fix pass's re-check
 * (scripts/glossary-fix.ts). The checker (CHECK_MODEL, through the Vercel AI Gateway) reads an entry's sentences
 * with the text of every block they cite, optionally each with the block before it (marked CONTEXT, only to see who
 * is speaking), and gives one verdict per sentence.
 */
import { CHECK_MODEL, GATEWAY, blockBefore, blocksOf, seenText, type Price, type Sentence } from './glossary-explain';

export interface Verdict {
  n: number;
  supported: boolean;
  why: string;
}

/** The checker's request: the sentences numbered as given (`n`), then every cited passage once. */
export function checkRequest(root: string, term: string, sentences: (Pick<Sentence, 'text' | 'cites'> & { n: number })[], context: boolean): string {
  const blocks = blocksOf(root);
  const cited = [...new Set(sentences.flatMap((s) => s.cites))].filter((c) => blocks.has(c));
  return [
    `ENTRY: ${term}`,
    '',
    'SENTENCES:',
    ...sentences.map((s) => `${s.n}. ${s.text}\n   cites: ${s.cites.join(', ')}`),
    '',
    'PASSAGES:',
    ...cited.map((c) => {
      const before = context ? blockBefore(root, c) : null;
      return (before ? `CONTEXT (the passage before ${c}) [${before}] ${seenText(blocks.get(before)!)}\n` : '') + `[${c}] ${seenText(blocks.get(c)!)}`;
    }),
  ].join('\n');
}

export function parseVerdicts(text: string): Verdict[] {
  const raw = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return (JSON.parse(raw).verdicts as { n: number; verdict: string; why?: string }[]).map((v) => ({ n: Number(v.n), supported: /^SUPPORTED$/i.test(String(v.verdict).trim()), why: v.why ?? '' }));
}

/** One checker call through the gateway. Busy or briefly down (429, 5xx): the same provider again after 20, 60, 120 s. */
export async function callChecker(key: string, p: Price, system: string, user: string, maxTokens: number) {
  const send = () =>
    fetch(`${GATEWAY}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHECK_MODEL.id,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: maxTokens,
        reasoning: { effort: CHECK_MODEL.effort },
        providerOptions: { gateway: { only: [CHECK_MODEL.provider] } },
      }),
    });
  let res = await send();
  for (const wait of [20_000, 60_000, 120_000]) {
    if (res.status !== 429 && res.status < 500) break;
    console.log(`${CHECK_MODEL.id}: ${res.status}, trying again in ${wait / 1000} s`);
    await new Promise((r) => setTimeout(r, wait));
    res = await send();
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string; model?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
  if (!res.ok) throw new Error(`${CHECK_MODEL.id}: gateway ${res.status}`);
  const u = j.usage ?? {};
  const cost = typeof u.cost === 'number' ? u.cost : (u.prompt_tokens ?? 0) * p.input + (u.completion_tokens ?? 0) * p.output;
  return { verdicts: parseVerdicts(j.choices?.[0]?.message?.content ?? ''), cost, requestId: j.id ?? null, model: j.model ?? CHECK_MODEL.id };
}
