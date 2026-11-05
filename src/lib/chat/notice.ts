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
  reviewedFor: '70a28a9c8ee48471',
  /** Who did that reread: the coding agent, or the owner. */
  by: 'owner (FID 6786)',
  on: '2026-11-05',
  note:
    'Reread by the owner (FID 6786) on 2026-11-05, "reviewed by the coordinator, approved by the owner", for branch ' +
    'assistant-any-account (step 1; docs/legal/assistant-any-account-step1.md, N1, with the owner\'s last sentence "Cost ' +
    'records aren\'t linked to your account."): item 4 now says questions are recorded with your account, since with ' +
    'ASSISTANT.anyAccount on a Lens or Bluesky account not linked to a FID asks under its own account, and every account ' +
    'passes its network\'s check (src/lib/chat/gate.ts). No new service receives questions. ' +
    'Before that: reread by the coding agent on 2026-11-05 (fingerprint 40720350e2e80a2b, words unchanged) for the gate with the switch off. ' +
    'Previous reread: Reread by the owner (FID 6786) on 2026-10-24 ("#36: stamp it"), words unchanged, for #36: the chat routes now take a ' +
    'wallet linked to a FID as that FID (getPerson) and answer an unlinked wallet 403. The notice still holds: questions are ' +
    'counted "under your Farcaster ID", which for a linked wallet is the FID it is linked to; nothing new is sent or kept. ' +
    'Previous reread: Reread by the owner (FID 6786) on 2026-10-14 ("Stamp it"), words unchanged, for the glossary pointers ' +
    '(src/lib/chat/glossary.ts), citation ids written with other dashes (sanitize.ts) and two added lines in ' +
    'config/prompts/chat-ask.md: no new service receives questions and nothing new is kept. The coding agent ' +
    'reread /about and the private box too; they still hold. Previous reread (owner, 2026-10-08): ' +
    'Reread for migration 0007 (cost records without a person) and the owner\'s new words for items 3 and 4. Items 1 and 2 match ' +
    'config/prompts/chat-ask.md. Item 3: both routes keep nothing (gateway: zero retention asked per request; Groq: Global ZDR and ' +
    'Inference APIs ZDR enabled in the "Lum" organization, confirmed by the owner in the console on 2026-10-08). Item 4: chat_calls ' +
    'keeps only questions (FID, time, model); chat_costs keeps daily totals with no FID, request id or time of day; true once 0007 is applied. ' +
    '/about ("only a count and the cost"), the private box and the signed-out screen (owner\'s words on main) still hold. ' +
    'Also covers main\'s device.ts change (chapters opened, kept on the device only). ' +
    'The owner (FID 6786) reread and approved all four items as worded here on 2026-10-08, after applying 0007.',
  /** The words (noticeKey of the items as shown now) the owner last reread, and when. */
  // 2026-10-15: item 3's heading "(not the Grok of X)", the owner's addition, reread as shown ("ok good").
  // 2026-11-05: item 4's new words (N1 of docs/legal/assistant-any-account-step1.md, with the owner's last sentence),
  // "reviewed by the coordinator, approved by the owner". The words before were 1xrxl4h.
  ownerReread: { words: '1ijrpib', on: '2026-11-05' },
};

export function noticeItems({ host, provider, model }: { host: string | null; provider: string | null; model: string }): [string, string][] {
  return [
    ['It helps you read', 'Ask about the book. Answers point to the passages they rest on, with chapter and ¶, and show the book’s own words.'],
    ['It won’t write for you', 'No dialogue, narration or description. It gives context and commentary only.'],
    [
      // Owner, 2026-10-14: "(this is groq, not the grok of X)".
      `Your messages go to ${provider}${provider === 'Groq' ? ' (not the Grok of X)' : ''}`,
      host
        ? `${provider} runs ${model}, an open-weights model. When ${provider} is busy, a message goes through ${host} to ${provider} instead. Both are set to keep nothing, and this app keeps no copy of your messages.`
        : `${provider} runs ${model}, an open-weights model, and is set to keep nothing. This app keeps no copy of your messages.`,
    ],
    [
      'Your questions are saved only on this device',
      `They are sent to ${provider}${host ? ` (or through ${host} when ${provider} is busy)` : ''} to be answered, and never published. Another device won’t have them. ` +
        'The app records only how many you ask and when, with your account, to count the daily limit. Cost records aren’t linked to your account.',
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
