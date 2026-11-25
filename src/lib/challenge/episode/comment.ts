import type postgres from 'postgres';
import { CHAT } from '../../config';
import { record, reserve, worstCaseUsd } from '../../chat/limits';
import { quotesNewWording, type Outline } from './rules';
import { EPISODE_WORDING as W } from './wording';

/**
 * Episode 1's AI comment (owner, 2026-11-24: "an AI may comment on the outline if asked, never write cards"). Only when
 * the person asks. The outline's words go to the assistant's own model and route (CHAT.model; Groq, or Vercel AI
 * Gateway when Groq is busy; both set to keep nothing), with config/prompts/episode-comment.md. It takes one of the
 * person's assistant questions for the day and counts toward the assistant's daily spend cap (src/lib/chat/limits.ts);
 * only the call's cost is kept, in the day's totals, with no person and no text. Neither the outline nor the comment is
 * kept or logged.
 *
 * The reply check (owner, 2026-11-24, answer 5): a reply that quotes new wording at length (quotesNewWording) is held
 * back; the model is asked once more with a reminder, and if that reply quotes new wording too, nothing is shown.
 */
type Complete = (model: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[], opts: { maxTokens: number; temperature: number }) => Promise<{ text: string; promptTokens: number; completionTokens: number; costUsd: number; provider: string | null; model: string }>;
export type CommentDeps = { sql: postgres.Sql; fid: number; complete: Complete; systemPrompt: string };
export type CommentResult = { state: 'comment'; text: string; label: string; left: number } | { state: 'withheld'; left: number } | { state: 'limit' } | { state: 'spend' };

const MAX_TOKENS = 700;
const MAKERS: Record<string, string> = { openai: 'OpenAI', google: 'Google', meta: 'Meta', qwen: 'Qwen', mistral: 'Mistral AI' };
export const commentLabel = () => W.commentLabel(CHAT.modelName, MAKERS[CHAT.model.split('/')[0]] ?? CHAT.model.split('/')[0]);

/** The outline as the model reads it: numbered cards, the first-minute line in its place, the title. */
export function outlineText(o: Pick<Outline, 'title' | 'cards' | 'minuteAfter'>): string {
  const lines = [`Title: ${o.title ?? '(none)'}`, ''];
  if (o.minuteAfter === 0) lines.push('--- first minute ends ---');
  o.cards.forEach((c, i) => {
    lines.push(`Card ${i + 1}. What happens: ${c.happens || '(empty)'}`, `Card ${i + 1}. What it does for the viewer: ${c.does || '(empty)'}`);
    if (o.minuteAfter === i + 1) lines.push('--- first minute ends ---');
  });
  return lines.join('\n');
}

const REMINDER = 'Your comment suggested new wording. Comment again without writing, rewriting or quoting any new words for a card: refer to cards by number and ask questions instead.';

export async function commentOn(deps: CommentDeps, o: Outline): Promise<CommentResult> {
  const slot = await reserve(deps.sql, deps.fid, worstCaseUsd(2 * MAX_TOKENS, 0, 2 * 4000));
  if (!slot.ok) return { state: slot.reason };
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: deps.systemPrompt },
    { role: 'user', content: outlineText(o) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await deps.complete(CHAT.model, messages, { maxTokens: MAX_TOKENS, temperature: 0.4 });
    await record(deps.sql, { kind: 'answer', model: r.model, provider: r.provider, promptTokens: r.promptTokens, completionTokens: r.completionTokens, costUsd: r.costUsd });
    const text = r.text.trim();
    if (text && !quotesNewWording(text, o)) return { state: 'comment', text, label: commentLabel(), left: slot.left };
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: REMINDER });
  }
  return { state: 'withheld', left: slot.left };
}
