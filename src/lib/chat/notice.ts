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
  reviewedFor: '59561780885037dd',
  /** Who did that reread: the coding agent, or the owner. */
  by: 'owner (FID 6786)',
  on: '2026-10-14',
  note:
    'Reread by the owner (FID 6786) on 2026-10-14 ("Reread."), for two settings: CHAT.messagesPerDayFor (FID 6786: 1,000 answers ' +
    'a day) and CHAT.dailySpendCapUsd raised from the $2 test cap to $5 for the launch. The words are unchanged: item 4 says the ' +
    'app counts "the daily limit" without naming a number, and no item names the spend cap. chat_calls still keeps only FID, time ' +
    'and model; chat_costs still keeps daily totals with no FID. /about, the private box and the signed-out screen are untouched. ' +
    'Earlier: the owner reread and approved all four items as worded here on 2026-10-08, after applying 0007.',
  /** The words (noticeKey of the items as shown now) the owner last reread, and when. */
  ownerReread: { words: '1x16ucc', on: '2026-10-14' },
};

export function noticeItems({ host, provider, model }: { host: string | null; provider: string | null; model: string }): [string, string][] {
  return [
    ['It helps you read', 'Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show the book’s own words.'],
    ['It won’t write for you', 'No dialogue, narration or description. It gives context and commentary only.'],
    [
      `Your messages go to ${provider}`,
      host
        ? `${provider} runs ${model}, an open-weights model. When ${provider} is busy, a message goes through ${host} to ${provider} instead. Both are set to keep nothing, and this app keeps no copy of your messages.`
        : `${provider} runs ${model}, an open-weights model, and is set to keep nothing. This app keeps no copy of your messages.`,
    ],
    [
      'Your questions are saved only on this device',
      `They are sent to ${provider}${host ? ` (or through ${host} when ${provider} is busy)` : ''} to be answered, and never published. Another device won’t have them. ` +
        'The app records only how many you ask and when, under your Farcaster ID, to count the daily limit. Cost records are kept without your ID.',
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
