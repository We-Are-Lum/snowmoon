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
  reviewedFor: '1bcced19c99b50f0',
  /** Who did that reread: the coding agent, or the owner. */
  by: 'agent',
  on: '2026-10-31',
  note:
    'Reread by the coding agent (Anthropic\'s Claude) on 2026-10-31, words unchanged, for routing C on agent-pictures: the ' +
    'routing call (router.ts), make mode (make.ts, make-tools.ts, turn.ts, config/prompts/chat-make.md), the make caps in ' +
    'limits.ts and CHAT.router/CHAT.make. CHAT.make.enabled is false, so no routing call is made and nothing goes to Baseten: ' +
    'items 1–4 still hold as worded, and /about and the private box are unchanged. Switching make mode on changes CHAT (P6e ' +
    'fails again) and shows noticeItemsWithMake (P6f fails until the owner rereads docs/legal/routing-c-draft.md). ' +
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
  ownerReread: { words: '1xrxl4h', on: '2026-10-15' },
};

/** Make mode as the notice names it (routing C), or null while it is off. */
export type NoticeMake = { provider: string; model: string; maker: string; host: string; perDay: number } | null;

export function noticeItems({ host, provider, model, make = null }: { host: string | null; provider: string | null; model: string; make?: NoticeMake }): [string, string][] {
  if (make) return noticeItemsWithMake({ host, provider, model, make });
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
        'The app records only how many you ask and when, under your Farcaster ID, to count the daily limit. Cost records are kept without your ID.',
    ],
  ];
}

/**
 * The notice with make mode on (routing C). DRAFT wording by the coding agent (Anthropic's Claude), 2026-10-31, from the
 * reread pack's items 12 and 14 (next-version, docs/reread-pack-2026-10-30.md), cut to what make mode does today: it
 * reads and plans, it doesn't draft. Not shown until CHAT.make.enabled, which waits for the owner's reread
 * (docs/legal/routing-c-draft.md); P6f then fails until ownerReread names these words.
 */
function noticeItemsWithMake({ host, provider, model, make }: { host: string | null; provider: string | null; model: string; make: NonNullable<NoticeMake> }): [string, string][] {
  return [
    ['It helps you read and plan', 'Ask about the book, or say what you’d like to make. Answers point to the passages they rest on and show the book’s own words. It can plan something with you from the book, but it can’t draft or make anything yet.'],
    ['It won’t write the story for you', 'No dialogue or narration: lines it plans with you are the book’s own words or yours, exactly. When you make something, it may describe what a picture should show.'],
    [
      `Your messages go to ${provider}${provider === 'Groq' ? ' (not the Grok of X)' : ''}, or to ${make.provider} when you make something`,
      `Questions about the book go to ${provider}, which runs ${model}, an open-weights model${host ? `; when ${provider} is busy, through ${host} instead` : ''}. ` +
        `Until you ask to make something, ${model} first reads each message on its own, to tell a question from a request to make something. ` +
        `From then on, the conversation goes through ${make.host} to ${make.provider}, which runs ${make.model}, an open-weights model by ${make.maker}; ` +
        `if ${make.provider} isn’t available, making is paused rather than sent elsewhere. All are set to keep nothing, and this app keeps no copy of your messages.`,
    ],
    [
      'Your questions are saved only on this device',
      `They are sent to ${provider} (or, when you make something, to ${make.provider}) to be answered, and never published. Another device won’t have them. ` +
        `The app records only how many you ask, and how many times you start making something (${make.perDay} a day), and when, under your Farcaster ID, to count the daily limits. Cost records are kept without your ID.`,
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
  return noticeItems({ host: CHAT.gatewayFallback ? CHAT.host : null, provider: CHAT.providerName, model: CHAT.modelName, make: currentNoticeMake() });
}

/** Make mode as the notice names it, while CHAT.make.enabled (the same value /api/chat/status sends). */
export function currentNoticeMake(): NoticeMake {
  const m = CHAT.make;
  return m.enabled ? { provider: m.providerName, model: m.modelName, maker: m.maker, host: m.host, perDay: m.conversationsPerDay } : null;
}
