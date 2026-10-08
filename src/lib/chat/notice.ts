/**
 * "What the assistant does": the notice shown before the first question.
 *
 * Whenever how the chat works changes (where messages go, what is kept, what it
 * will and won't do), reread these items and fix any that are no longer true.
 * check:principles P6e fails until `reviewedFor` equals the chat's current
 * fingerprint, which it prints. A reader who ticked "Don't show this again" sees
 * the notice once more whenever its words change (noticeKey).
 */
export const NOTICE_REVIEW = {
  /** Fingerprint of the chat's code, prompts and settings when the items below were last reread. */
  reviewedFor: 'ffc2f43aac6c30bf',
  /** Who reread them, and when. */
  by:
    'model-drafted review, 2026-10-08, for the direct Groq route with the gateway as fallback. Items 1 and 2 match config/prompts/chat-ask.md. ' +
    'Item 3\'s "Neither keeps your messages" holds for the gateway route (zero retention asked on every request); on the direct route it rests on ' +
    'the owner\'s Groq console setting, reported on but not yet confirmed (docs/principles.md §6).',
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
