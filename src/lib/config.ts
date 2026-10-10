/**
 * One source of truth for constants (Build Brief rule 7).
 * Caps, thresholds, moderator FIDs, and model names live here as they are added.
 */
export const WORK_ID = 'snowmoon';

export const WORK = {
  id: WORK_ID,
  title: 'Snowmoon',
  author: 'Vitalik Buterin',
  license: 'GPL-3.0',
  sourceUrl: 'https://vitalik.eth.limo/snowmoon/',
  chapters: 32,
} as const;

export const APP_NAME = 'Snowmoon Living Edition';
export const REPO_URL = 'https://github.com/We-Are-Lum/snowmoon';
/** Where the podcast is listed. Spotify: the show the owner added through Spotify for Creators (2026-10-09). */
export const PODCAST_LINKS = { feed: '/podcast.xml', spotify: 'https://open.spotify.com/show/0J9O3tKC3BI4buQ8Hry3YN' } as const;

/**
 * FID credited for system generations (narration, digests, analysis): the
 * project owner's account until the project has its own (brief §5, owner's
 * decision Oct 5, 2026). Recorded permanently on append-only rows.
 */
export const SYSTEM_FID = 6786;

/** Saved quote cards per FID per day (spam limit; saving costs nothing). */
export const CARD_SAVES_PER_DAY = 50;

/**
 * The reading assistant, slice 1: ask about the book (docs/proposals/chat.md).
 * Models are on config/models.json; the host is named in the first-time notice.
 */
export const CHAT = {
  /** Answers. Open weights, Apache-2.0. */
  model: 'openai/gpt-oss-120b',
  modelName: 'gpt-oss-120b',
  /** Checks every answer against config/prompts/chat-guard.md. Open weights, Apache-2.0. */
  guardModel: 'openai/gpt-oss-safeguard-20b',
  /** Who receives the messages first, as the notice names it. */
  host: 'Vercel AI Gateway',
  /**
   * The one inference provider behind the gateway (its gateway slug), and its name for
   * the notice. Owner's condition for principle 6 (Oct 7, 2026): one pinned provider,
   * zero data retention, both hops named. Empty until the owner picks one; while it is
   * empty the assistant reports itself unavailable. Candidates: docs/proposals/chat-providers.md.
   */
  provider: 'groq' as string | null,
  providerName: 'Groq' as string | null,
  /** Every request asks the gateway for providers with zero data retention only. */
  zeroDataRetention: true,
  /**
   * Shows the "Testing" label on the assistant (answers can be wrong; check the quotes).
   * Owner (2026-10-07): it stays until a fresh 50-question check has at most 2 wrong answers.
   */
  testing: true,
  endpoint: 'https://ai-gateway.vercel.sh/v1/chat/completions',
  /**
   * The provider called directly with the project's own key (GROQ_API_KEY), first.
   * Groq's standard tier queues when busy instead of failing (the gateway's shared
   * Groq access answered 498, "at capacity", too often). With no key set, the gateway is used.
   * Zero data retention on this route is a setting in the owner's Groq console (Data
   * Controls), not something each request asks for. The owner confirmed it in the
   * console on 2026-10-08: organization "Lum", Global ZDR and Inference APIs ZDR
   * enabled, Batch and Fine-tuning storage off. Nothing in the app or in Groq's
   * replies shows it, so it is rechecked by hand.
   */
  direct: { endpoint: 'https://api.groq.com/openai/v1/chat/completions', keyEnv: 'GROQ_API_KEY' },
  /**
   * When the direct call fails (busy, rate-limited, down), try the gateway route
   * (CHAT.host to the same provider, zero data retention). While true, the notice
   * names the gateway as the route used when the provider is busy. Owner, 2026-10-08.
   */
  gatewayFallback: true,
  /** How the notice names the route: the provider, and the gateway only while the fallback is on. */
  get route(): string {
    return this.gatewayFallback ? `${this.providerName}, or through ${this.host} when ${this.providerName} is busy` : `${this.providerName}`;
  },
  /** USD per token on Groq, from the gateway's published list (2026-10-07). The gateway's own per-request cost is used when it gives one. */
  prices: {
    'openai/gpt-oss-120b': { input: 0.15e-6, output: 0.6e-6 },
    'openai/gpt-oss-safeguard-20b': { input: 0.075e-6, output: 0.3e-6 },
  } as Record<string, { input: number; output: number }>,
  /** Answers per FID per UTC day (refusals and held-back answers count). */
  messagesPerDay: 30,
  /** Total spend per UTC day across everyone, in USD. Test cap: $2 (owner instruction, Oct 7, 2026). */
  dailySpendCapUsd: 2,
  /** Search hits sent to the model, each with the blocks around it (see neighbours). */
  passages: 12,
  neighbours: { before: 2, after: 2 },
  /**
   * Before searching, the model lists words the answering passage is likely to use
   * (config/prompts/chat-search-terms.md); they are searched with the question. Never
   * shown or stored. 30 → 36 of 50 test questions found (docs/proposals/chat-eval/).
   */
  searchTerms: true,
  /** Turns of the thread sent back with each question. */
  historyTurns: 6,
  questionMaxChars: 600,
} as const;

/** Moderation only: these FIDs may hide content. They never promote or rank anything. */
/**
 * Adaptations are out of view (owner, 2026-10-08: image generation first). Off: no Adaptations in
 * the rail, menu, intro or About; no "cited in" marks in the reader; /adaptations and its pages say
 * nothing is published yet. Every file stays in the repo; set to true to bring them back.
 */
export const ADAPTATIONS = { visible: false };

/** Moderation only: these FIDs may hide content or dismiss a report. They never promote or rank anything. Owner, 2026-10-08 (decision 20). */
export const MODERATOR_FIDS: readonly number[] = [6786];

/** The public contact for Snowmoon Party: legal, copyright and reports from readers who are signed out (owner, 2026-10-08). */
export const CONTACT_EMAIL = 'snowmoon@wearelum.xyz';

/**
 * Readers add an image to a passage: slice 1, labelled "Trial" (docs/proposals/add-an-image.md;
 * the owner's decisions of 2026-10-08, all as recommended except 11, 12, 18, 20 and 24).
 * Each number below is one of those decisions.
 */
export const IMAGES = {
  /** The off switch: false stops every generation at once (decision 10). */
  enabled: true,
  label: 'Trial',
  /** Who may generate (decision 11): invited FIDs only, starting with the owner. No Neynar key. */
  invited: [6786] as readonly number[],
  /** One model, settings fixed (decisions 3 and 6). On the allowlist in config/models.json. */
  model: { id: 'z-image-turbo', name: 'Z-Image Turbo', licence: 'Apache-2.0', endpoint: 'fal-ai/z-image/turbo', host: 'fal.ai' },
  size: { width: 1024, height: 576 },
  steps: 8,
  /** Sent with every prompt: the model is never asked for words (section 7). */
  suffix: 'No text, no lettering, no signs with words.',
  /** USD per megapixel on fal.ai (fetched 2026-10-08); fal may round up to 1 MP, so 0.005 is reserved. */
  pricePerMp: 0.005,
  /** Worst case reserved before each Generate: the image, the prompt check, margin (section 4). */
  reserveUsd: 0.0065,
  /** The prompt check (decision 14): open weights, Apache-2.0, on Groq like the assistant. */
  guardModel: 'openai/gpt-oss-safeguard-20b',
  promptMaxChars: 600,
  /** A passage of 1 to 8 consecutive blocks in one chapter (decision 5). */
  maxBlocks: 8,
  /** Per person per UTC day; blocked attempts count (decisions 10 and 16). */
  generationsPerDay: 10,
  publishesPerDay: 3,
  /** Across everyone, per UTC day (decision 10), kept apart from the assistant's. */
  dailySpendCapUsd: 2,
  /** Test spending while the trial is built and tried: $1 in all, every day together (owner, 2026-10-08). */
  totalSpendCapUsd: 1,
  /** A draft's signed record is good for this long; after that, generate again. */
  ticketHours: 24,
  /** Readers' images: one report hides at once for these reasons; otherwise this many distinct reporters (decision 17). */
  hideAtOnce: ['minor'] as readonly string[],
  hideAfterReporters: 3,
  reportsPerDay: 20,
  /** Public copies are cached briefly, so a hidden image leaves the cache within minutes (decision 21). */
  cacheSeconds: 300,
} as const;

/** Minpentai Play's limits and retention (owner, 2026-10-09). Every /api/minpentai/* request counts. */
export const MINPENTAI_PLAY = {
  /** Per person (FID): requests per minute and per UTC day; over either is 429 with retryAfterMs. */
  perMinute: 60,
  perDay: 3000,
  /** The server answers a person's match view at most this often, and their lobby view (ms). */
  matchViewEveryMs: 1000,
  lobbyViewEveryMs: 2000,
  /** Across everyone, per UTC day; over is 503 (practice and free play run in the browser). */
  sitewidePerDay: 200_000,
  /** Cleanup: at most once per this many ms per server instance, at most this many rows per table. */
  cleanupEveryMs: 10 * 60_000,
  cleanupBatch: 500,
  /** Challenges and lobby rows are deleted this long after they ended (ms). */
  challengeKeepMs: 3600_000,
  lobbyKeepMs: 3600_000,
  /** A match nobody has polled for this long ends as abandoned, with no result (ms). */
  abandonAfterMs: 24 * 3600_000,
  /** Matches are deleted this many days after they ended; daily totals after this many days. */
  matchKeepDays: 30,
  dailyKeepDays: 90,
} as const;

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}
