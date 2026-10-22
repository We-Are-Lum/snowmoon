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
 * Adaptations were out of view from 2026-10-08 (owner: image generation first). Back in view on
 * 2026-10-18 (owner: "adaptations isn't in the main menu or on the homepage yet"): `visible` puts
 * Adaptations in the rail and menu, opens /adaptations (Fifteen Days first, then the seed briefs)
 * and the home card. `inReader` stays off: no "cited in" marks or planning line in the reader, which
 * the owner hasn't asked back.
 */
export const ADAPTATIONS = { visible: true, inReader: false };

/**
 * Adaptation pages (/@<fname>/<id>, /@<fname>/<id>/v/<n>, /<id>; docs/proposals/adaptation-urls.md).
 * Off on production until the owner says "publish": there they say "Nothing here yet". Local builds
 * and preview deployments (behind Vercel Authentication) show them, so they can be checked.
 */
export const ADAPTATION_PAGES = { live: true };

/**
 * Remix in the shot editor (owner, 2026-10-18): Generate from any camera, through the Pictures
 * pipeline (Farcaster sign-in and its gate, 10 free a day, wallet accounts prepaid; the same
 * reference-picture model and price, IMAGES.editModel; the same prompt check, blocked names and
 * consent wording). Its own daily count and its own daily cap on free generations, apart from
 * Pictures'. Every generated frame is saved to the person's remix of the shot (studio.remix_frames,
 * migration 0013). REMIX_FREE=off in the environment stops free generations at once (prepaid
 * still works); REMIX_GENERATE=off stops every Generate.
 */
/**
 * The agent interface, read-only part (owner, 2026-10-19: "build only the read-only MCP/API now … switched off").
 * MCP at /api/mcp and the same tools at /api/agent/v1/<tool>. Open without sign-in at a low rate. Reads only what
 * the site already shows anyone: the book (GPL-3.0), published scenes, shots and recipes. SWITCHED OFF until the
 * owner's go, the Privacy line is reread and the draft migration 0018 (the rate counter) is applied.
 */
export const AGENT_API = {
  enabled: false,
  /** Requests a minute per address, without sign-in. */
  perMinute: 20,
  /** The most blocks one passage can return. */
  maxBlocks: 40,
  /** The most search hits one call can return. */
  maxHits: 20,
  /** How long a rate row is kept (minutes). */
  keepMinutes: 60,
  /** MCP protocol revisions answered, newest first. */
  protocolVersions: ['2025-06-18', '2025-03-26'] as const,
};

/**
 * Agents that act for a person (owner, 2026-10-20; design docs/agents/design.md; DRAFT migration 0019).
 * Three ways in, one result: an "agent of @handle" whose drafts its person publishes. SWITCHED OFF.
 */
/**
 * Wallets that sign in as a Farcaster account (owner, 2026-10-22: "associate that wallet also with his Farcaster
 * account too. Let him login both ways"): a sign-in with one of these addresses is that FID everywhere getPerson
 * is used (images, consent, agents, You), not a wallet account of its own. Each one is the owner's to add, and
 * only an address that the FID itself verified on Farcaster (checked when added). Lowercase addresses.
 * A linked wallet's prepaid balance, if any, stays on its wallet account and isn't spent while it signs in as the FID.
 */
export const LINKED_WALLETS: Readonly<Record<string, number>> = {
  // m.luisotravez.eth, verified by @luisotravez (FID 6852) on Farcaster since 2023-08-31; resolved three ways, all agreeing.
  '0x003276c5c24cdaff1d804170ab5cbb914f51f78a': 6852,
  // garance.eth, verified by @garance (FID 193912) on Farcaster; resolved three ways, all agreeing (owner, 2026-10-22).
  '0x317a1ea96dc4b10c1ea60e3af59c472316d31303': 193912,
};

export const AGENTS = {
  /**
   * On, for the owner's account only (owner, 2026-10-20: "Ship agents-connect for my account only (FID 6786 and
   * my wallet), behind an allowlist."; then "FID 6786 only for now"). Everyone else sees nothing new."). Anyone not in `people` gets 404s from
   * every agent route and page, can't connect an agent, and sees no new section anywhere.
   */
  enabled: true,
  people: {
    // 6852 is @luisotravez and 193912 is @garance (owner, 2026-10-22: Claude connector access; checked with Farcaster's API).
    fids: [6786, 6852, 193912] as readonly number[],
    /**
     * Wallets (lowercase addresses) whose sign-in gets in. Empty for now (owner, 2026-10-20: "FID 6786 only for
     * now … I'll add my sign-in wallet later"). The payment address is not a sign-in wallet.
     */
    wallets: [] as readonly string[],
  },
  /** Public pages (agents.md, /p): off while agents are for the owner only. Kept work stays private on /you. */
  public: false,
  /** Approved spending: per person per UTC day, and a video test's estimate per second (LongCat 480p on fal). */
  spend: { framesPerDay: 20, videosPerDay: 5, dailyCapUsd: 2, videoModel: 'fal-ai/longcat-video/distilled/image-to-video/480p', videoUsdPerSecond: 0.005, videoSeconds: 5 },
  /** What an agent may be given. The person sees every one before agreeing. */
  scopes: ['read', 'drafts', 'images', 'notes'] as const,
  /** At most this many live agents per person (also a database trigger). */
  perPerson: 3,
  /**
   * A personal agent key (owner, 2026-10-20), made on /you for a client that sends a key in a header (Muse):
   * drafts only (no images), a spend cap the person sets, 30 days, shown once, revoked in one tap. Only its
   * sha256 is stored.
   */
  key: { days: 30, scopes: ['read', 'drafts', 'notes'] as const, capUsd: { default: 1, max: 10 }, header: 'X-Snowmoon-Key' },
  /** An access token lasts an hour; a refresh token 30 days and is replaced each time it is used. */
  accessMinutes: 60,
  refreshDays: 30,
  /** An agent's link ends after 90 days unless renewed; the person can end it at once from /you. */
  linkDays: 90,
  /** Per agent, per UTC day (and a short-term brake). */
  limits: { drafts: 50, notes: 20, images: 50, imagesPerMinute: 5, readsPerMinute: 60 },
  /** Higher daily counts for these people's agents (owner, 2026-10-21: "Raise my own agent's daily limits"); everyone else keeps `limits`. The per-minute brakes stay. */
  limitsFor: { 6786: { drafts: 500, notes: 200, images: 150 } } as Record<number, { drafts: number; notes: number; images: number }>,
  /** All of one person's agents together, per UTC day. */
  perPersonImages: 150,
  /** Everyone's agents together, per UTC day: a brake. */
  siteImagesPerDay: 1000,
  /**
   * Story words (narration or dialogue) stay human (owner, 2026-10-20, the main goal; decision 6 settled).
   * An agent may place only the book's lines (checked word for word) and its person's own words (checked
   * against what the person typed or said). 'allowed' is kept only so the old path can be tested; never
   * switch it on without the owner. A brought-in piece that declares AI-written words is labelled, and
   * those words never count as the person's.
   */
  storyWords: 'refused' as 'allowed' | 'refused',
  /** Speaking counts as writing: a spoken idea or note is transcribed, shown to the person to check, and kept as their words. */
  /**
   * Speaking to your agent: OFF until the owner has confirmed Groq's audio retention in the Groq console (owner,
   * 2026-10-20). The local tests turn it on (AGENTS_TEST, never on Vercel). Off, the Speak button isn't shown.
   */
  transcription: { on: false, model: 'whisper-large-v3-turbo', host: 'Groq', maxSeconds: 120, maxBytes: 4 * 1024 * 1024 },
  /** People whose agents never write story words, whatever storyWords says (the owner: "my versions stay human-written"). */
  humanWrittenOnly: [6786] as readonly number[],
  /** A brought-in image: PNG or JPEG, at most 3 MB, about 16:9, re-encoded to JPEG at most 1920 wide, all metadata removed. */
  image: { maxBytes: 3 * 1024 * 1024, maxSide: 1920, aspect: 16 / 9, aspectTolerance: 0.03 },
  /**
   * The scan every brought-in image passes before it is stored (docs/agents/research-scanning.md).
   * 'none' = bringing in images is closed. A vendor must be configured, the reporting procedure written,
   * and the owner's go given before this changes. 'test' exists only off Vercel, for the local tests.
   */
  scanner: 'none' as 'none' | 'arachnid' | 'test',
  /** Where the site lives, for OAuth (the issuer) and the connector's address. */
  resourcePath: '/mcp',
};

export const REMIX = {
  /** Across everyone, per UTC day, for free generations (owner: "$10/day to start"). */
  dailyFreeCapUsd: 10,
  generationsPerDay: 10,
  /** Their words: the same length as a Pictures prompt. */
  ownWordsMaxChars: 600,
  /** The live layout as sent: a PNG of the shot camera's view, at most this size. */
  layout: { width: 1024, height: 576, maxBytes: 3_000_000 },
  /**
   * The pictures sent, in the order the version's own frames were sent theirs: the live layout as a
   * depth map, the shot's cast cards, then its plate. The edit model takes up to 4.
   */
  maxPictures: 4,
  /** The exact prompt sent: the shot's own prompt from the version's recipe, the plate's line and their words. */
  promptMaxChars: 6000,
  /**
   * Tokens for the prompt check on a Remix prompt (the shot's own prompt and the person's words, up to
   * 4,400 characters). At Pictures' 400 the check sometimes spent them all reasoning and gave no
   * answer, which counts as a refusal: 6 of 78 plain prompts in the real check of 2026-10-18. Only the
   * tokens used are billed (about 200 to 400).
   */
  guardMaxTokens: 1200,
  /** The worst case reserved before a Generate: every picture and the output rounded up to 1 MP, plus the prompt check. */
  reserveUsd: (pictures: number) => (1 + pictures) * 0.01 + 0.0015,
  /** Storyboards: frames per board and each frame's length (seconds). */
  storyboard: { maxItems: 200, minSeconds: 0.5, maxSeconds: 20, titleMaxChars: 80 },
} as const;
export const remixFreeOn = () => process.env.REMIX_FREE !== 'off';
export const remixGenerateOn = () => IMAGES.enabled && process.env.REMIX_GENERATE !== 'off';
export function adaptationPagesShown(): boolean {
  return ADAPTATION_PAGES.live || process.env.VERCEL_ENV !== 'production';
}

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
  /**
   * Who may generate (decision 11, owner 2026-10-09): any signed-in Farcaster account whose Neynar
   * user score is at least neynarMinScore, looked up at Generate with only the FID (NEYNAR_API_KEY)
   * and kept a day per FID (studio.image_scores, migration 0010). If Neynar can't be reached, no one
   * outside the invited list may generate. Invited FIDs skip the lookup.
   */
  // 6852 is @luisotravez (owner, 2026-10-15).
  invited: [6786, 6852] as readonly number[],
  /** The one place the threshold lives. */
  neynarMinScore: 0.7,
  /** How long a looked-up Neynar user value is kept before it is asked again. */
  scoreCacheHours: 24,
  /** Report alerts (ntfy, SNOWMOON_ALERT_URL): at most one per this many minutes, across every server. */
  alertEveryMinutes: 60,
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
  /** A higher daily Generate count for these FIDs (owner, 2026-10-13); the daily spend cap still applies to them. */
  perDayFor: { 6786: 300 } as Readonly<Record<number, number>>,
  publishesPerDay: 3,
  /** Across everyone, per UTC day (decision 10), kept apart from the assistant's. */
  dailySpendCapUsd: 2,
  /**
   * Wallet sign-in and prepaid generations (owner, 2026-10-13). A wallet account has no free daily
   * count and no Neynar gate: each Generate is paid from its balance at the estimated cost (the
   * worst case reserved for it) plus `markup`. Paid in USDC or ETH on Base to `payTo`; the app reads
   * the payment onchain and credits it once. Prepaid spend has its own daily cap, apart from the free one.
   * Off until `payTo` is set.
   */
  prepaid: {
    enabled: true,
    /** The owner's receiving wallet on Base (owner, 2026-10-13). */
    payTo: '0x4FEA94B8947926DdD3c02f4e133357B547F74FfA' as `0x${string}` | null,
    markup: 0.3,
    /** Suggested amounts in USD; any amount of at least minUsd is credited. */
    packsUsd: [1, 5, 20] as readonly number[],
    minUsd: 0.5,
    dailyCapUsd: 25,
    chainId: 8453,
    /** Base's own public endpoint unless BASE_RPC_URL is set. */
    rpcUrl: 'https://mainnet.base.org',
    /** Circle's USDC on Base (6 decimals) and Chainlink's ETH/USD feed on Base (8 decimals), checked onchain 2026-10-13. */
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
    ethUsdFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70' as `0x${string}`,
    confirmations: 3,
    /** A payment older than this is not credited (ask the owner instead). */
    maxAgeDays: 7,
    /** A wallet sign-in lasts this long. */
    sessionHours: 24,
    /**
     * Credit back a Generate that failed (the prompt check or the image model didn't answer), to the balance only
     * (owner, 2026-10-21: "credit the balance for anything charged but not made"). OFF until migration 0022 is
     * applied and Terms 6a is reread and changed in the same deploy (docs/legal/credits-draft.md): while off, the
     * code never reads studio.wallet_credits and a failed Generate stays charged, as the Terms say today.
     */
    creditBack: false as boolean,
  },
  /** A draft's signed record is good for this long; after that, generate again. */
  ticketHours: 24,
  /** Readers' images: one report hides at once for these reasons; otherwise this many distinct reporters (decision 17). */
  hideAtOnce: ['minor'] as readonly string[],
  hideAfterReporters: 3,
  reportsPerDay: 20,
  /** Public copies are cached briefly, so a hidden image leaves the cache within minutes (decision 21). */
  cacheSeconds: 300,
  /**
   * Reference pictures (step 4, docs/proposals/style-guides-and-sheets.md): FLUX.2 [klein] 4B edit
   * on fal.ai, on the allowlist (config/models.json, flux2-klein-4b). Used for a character sheet's
   * side and back views (made from its front view) and, when the person asks, for an image made
   * with a picked sheet's views as references. Same caps, prompt check and safety checker.
   */
  editModel: { id: 'flux2-klein-4b-edit', name: 'FLUX.2 [klein] 4B', licence: 'Apache-2.0', endpoint: 'fal-ai/flux-2/klein/4b/edit', host: 'fal.ai' },
  /**
   * USD per megapixel for the edit endpoint: "$0.01 per megapixel" on fal's model page
   * (fal.ai/models/fal-ai/flux-2/klein/4b/edit, read 2026-10-08). The page doesn't say whether the
   * input pictures count, so the cost is taken as (output MP + every input's MP) x this price.
   */
  editPricePerMp: 0.01,
  /** At most this many reference pictures go to the edit model (the model takes up to 4). */
  maxReferences: 3,
  /** Worst case reserved before an edit: every picture rounded up to 1 MP, plus the prompt check. */
  editReserveUsd: (inputs: number) => (1 + inputs) * 0.01 + 0.0015,
  /** A sheet's views are portrait (Design 5a: about 0.77:1). */
  viewSize: { width: 576, height: 768 },
  /** Styles and character sheets (step 4). Text added to every prompt that uses them, shown in full. */
  designs: {
    nameMaxChars: 60,
    textMaxChars: 600,
    /** A style needs at least this many sample pictures, made with its text (Design 4b). */
    samplesMin: 2,
    samplesMax: 4,
    /** A sheet needs its front view; side and back are optional. */
    publishesPerDay: 3,
    /** At most this many picked characters' sheets are added to one image. */
    maxCharacters: 3,
  },
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
