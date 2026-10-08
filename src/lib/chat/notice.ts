import { CHAT } from '../config';

/**
 * "What the assistant does": the notice shown before the first question.
 *
 * Two checks keep it true (check:principles):
 * - P6e: whenever how the chat works changes (its code, routes, prompts or CHAT
 *   settings), the notice must be reread and `reviewedFor` set to the fingerprint
 *   the check prints. If the words are unchanged, the coding agent's reread is enough.
 * - P6f: the words themselves must be ones the owner (FID 6786) has reread.
 *   `ownerReread` is set only on the owner's word, never by an agent on its own.
 *   A change to the words always needs the owner's reread.
 * A reader who ticked "Don't show this again" sees the notice once more whenever
 * its words change (noticeKey).
 */
export const NOTICE_REVIEW: {
  reviewedFor: string;
  by: 'agent' | 'owner (FID 6786)';
  on: string;
  note: string;
  ownerReread: { words: string; on: string } | null;
} = {
  /** Fingerprint of the chat's code, prompts and settings when the notice was last reread. */
  reviewedFor: 'ffc2f43aac6c30bf',
  /** Who did that reread: the coding agent, or the owner. */
  by: 'agent',
  on: '2026-10-08',
  note:
    'For the direct Groq route with the gateway as fallback. Items 1 and 2 match config/prompts/chat-ask.md. ' +
    'Item 3\'s "Neither keeps your messages" holds for the gateway route (zero retention asked on every request) and for the direct route ' +
    '(Groq organization "Lum": Global ZDR and Inference APIs ZDR enabled, confirmed by the owner in the Groq console on 2026-10-08). ' +
    'Reread again (agent, session snowmoon-ae) after device.ts began keeping the chapters opened, on the device only: all four items still held.',
  /** The words (noticeKey of the items as shown now) the owner last reread, and when. Not yet: the words changed on 2026-10-08. */
  ownerReread: null,
};

export function noticeItems({ host, provider, model }: { host: string | null; provider: string | null; model: string }): [string, string][] {
  return [
    ['It helps you read', 'Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show the book’s own words.'],
    ['It won’t write for you', 'No dialogue, narration or description. It gives context and commentary only.'],
    [
      `Your messages go to ${provider}`,
      host
        ? `${provider} runs ${model}, an open-weights model. When ${provider} is busy, a message goes through ${host} to ${provider} instead. Neither keeps your messages, and this app keeps no copy.`
        : `${provider} runs ${model}, an open-weights model, and keeps no messages. This app keeps no copy.`,
    ],
    [
      'Your questions are saved only on this device',
      `They are sent to ${provider}${host ? ` (or through ${host} when it is busy)` : ''} to be answered, and never published. Another device won’t have them.`,
    ],
  ];
}

/** A short key for the notice's exact words: a reader who dismissed one wording sees a changed one. */
export function noticeKey(items: [string, string][]): string {
  let h = 5381;
  for (const ch of items.flat().join('\n')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** The items as readers see them now: the same values /api/chat/status sends. */
export function currentNoticeItems(): [string, string][] {
  return noticeItems({ host: CHAT.gatewayFallback ? CHAT.host : null, provider: CHAT.providerName, model: CHAT.modelName });
}
