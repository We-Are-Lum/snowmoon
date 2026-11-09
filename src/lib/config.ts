import { REHEARSAL_BASE_IDS, REHEARSAL_DEFAULT_LOOKS, rehearsalChallenge, rehearsalOn, rehearsalOnInBrowser } from './challenge/rehearsal-switch';
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

/**
 * Admins (owner, 2026-10-29, the next-version plan; principle 5 reread the same day): the owner and @garance. The one
 * list every admin power reads (owner, 2026-10-29: "ADMINS replaces the scattered owner lists"): hiding seeded and
 * readers' images in the reader, the review pages, the illustration check, hiding remix frames and scene versions, the
 * storage check, and the admin caps on "Make an image" (IMAGES.admin). They may pick one image per moment or glossary
 * item to show first, always labelled "Picked by @…", with the reader's switch beside it (P5b, P5d, P5e).
 * SYSTEM_FID stays the account system work is credited to; it grants nothing.
 */
export const ADMINS: readonly number[] = [6786, 193912];

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

/**
 * Who may ask the assistant (step 1 of "the assistant for any account", owner 2026-11-05;
 * docs/proposals/assistant-any-account.md; the gate is src/lib/chat/gate.ts).
 * `anyAccount` turns on the owner's one rule (2026-11-05: "Farcaster accounts must pass Neynar too, the same as Lens and
 * Bluesky pass theirs"): everyone who asks passes their own network's check, the same stored decision images use (the
 * Neynar score for a FID, the Lens score, the Bluesky check), looked up at a question only when there is no current
 * decision; a Lens or Bluesky account not linked to a FID then asks under its own number, with the same free daily
 * limit. OFF (today): any FID (or account linked to one) asks with no check, and no one else can.
 * It is one switch because the Neynar check, like the Lens and Bluesky ones, may start only when Privacy says so: it
 * was OFF until the owner's reread of docs/legal/assistant-any-account-step1.md, and check:principles P6ab refuses it
 * ON until Privacy §5 no longer counts questions only under a Farcaster ID and §7 says Neynar, Lens and Bluesky are
 * asked when someone asks the assistant. Wallet-only sign-ins can't ask either way (no payments for questions yet).
 */
export const ASSISTANT = {
  // ON (2026-11-05): the owner's approval of docs/legal/assistant-any-account-step1.md, "reviewed by the coordinator,
  // approved by the owner"; its words are in Privacy (uxou8g), the notice (1ijrpib) and About in this release.
  anyAccount: true as boolean,
};

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

/**
 * Wallet ↔ Farcaster links as a regular feature (owner, 2026-10-22: "After you are signed in with a wallet you can
 * have an offer to sign in with Farcaster to associate the account with this wallet. If we can't just use neynar to
 * find out if the wallet is already associated."). Kept in studio.wallet_links (migration 0026_wallet_links.sql,
 * which seeds the two LINKED_WALLETS entries). Until that table exists, LINKED_WALLETS above is what getPerson reads;
 * after, it is read only for a wallet the table has never had a link for. src/lib/wallet/links.ts. The Privacy and
 * Terms lines that describe all of this were reread by the owner on 2026-10-22 (src/lib/legal.ts).
 */
export const WALLET_LINKS = {
  /**
   * The offer: a wallet person signs in with Farcaster in the same session, sees who it will link to, and confirms
   * ('signed'). Both proofs are checked on our server; no new outside service. On. Without the table it answers
   * "not available yet" and links nothing.
   */
  offer: true as boolean,
  /**
   * The automatic link ('verified'), on a wallet's signed-in request: its address is sent to Neynar (user by custody
   * or verified address, since 2026-11-04), and a wallet that is the custody address of, or verified by, exactly one
   * Farcaster account is linked to it. A linked wallet is looked
   * up again at most once a day, and a verified link ends if that FID no longer verifies the address; a tapped link
   * isn't affected; a wallet the person unlinked isn't looked up again (owner, 2026-10-22). ON, in the same deploy
   * as the Privacy line that says so (section 7, reread by the owner on 2026-10-22) and migration 0026, which the
   * owner applies before the merge. Without the table it does nothing.
   */
  lookUp: true as boolean,
  /** How long a lookup's answer (the FIDs found, possibly none) is kept before Neynar is asked again: "at most once a day". */
  lookupCacheHours: 24,
  /**
   * A linked wallet's earlier work shows under its Farcaster name (owner, 2026-10-22, replacing "don't reassign"):
   * bylines, the profile, the You page and Hide read it as the FID's. Shown, not rewritten: the records keep the
   * wallet account as the maker, and an unlink shows it as the wallet's again (src/lib/wallet/credit.ts). On.
   */
  creditEarlierWork: true as boolean,
  /**
   * The 30-day note in the wallet panel and on the You page (owner, 2026-10-22), shown through this UTC day and then
   * gone with no further deploy: 30 days from the deploy. Set at merge: 2026-11-21, or the merge day + 30 if later.
   */
  announceUntil: '2026-11-21',
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
    // The production test account for agent play (wallet 0xE869…f973, account -23) was here from 2026-11-01 until the
    // leak fix passed in production; removed at the owner's word, 2026-11-01.
    wallets: [] as readonly string[],
    /**
     * Lens and Bluesky accounts whose sign-in gets in (signin-lens-bluesky): 'lens:<account address, lowercase>' or
     * 'bluesky:<DID>'. Empty: the owner names them. A Lens or Bluesky account linked to a Farcaster account in the
     * list gets in as that account.
     */
    social: [] as readonly string[],
  },
  /** Public pages (agents.md, /p): off while agents are for the owner only. Kept work stays private on /you. */
  public: false,
  /**
   * Approved spending: per person per UTC day, and a video test's estimate per second (LongCat 480p on fal). The length
   * is what fal actually makes: we send no num_frames, so its default 162 frames, billed at 15 fps, is 10.8 s, about
   * $0.054 (measured in the real test, owner 2026-10-24). A 5-second length waits for the queue test.
   */
  spend: { framesPerDay: 20, videosPerDay: 5, dailyCapUsd: 2, videoModel: 'fal-ai/longcat-video/distilled/image-to-video/480p', videoUsdPerSecond: 0.005, videoSeconds: 10.8 },
  /** What an agent may be given. The person sees every one before agreeing. */
  scopes: ['read', 'drafts', 'images', 'notes'] as const,
  /**
   * The "play" scope (Minpentai agent play): start matches against the site computer, see only your side, submit
   * moves. Switched on 2026-11-01 for these people only (owner: "switched on for me only, FID 6786"), with 0032 applied
   * and Terms §6d / Privacy §4 live. Anyone else: the scope isn't granted, its tools aren't listed or run, and a match
   * link opens nothing. The local tests add their own people (MINPENTAI_PLAY_TEST, never on Vercel).
   */
  // 6786 the owner. Switched off 2026-11-01 for a timing leak at level 3 (#89); back on 2026-11-01 for the owner only,
  // after the fix (#90, a quiet time on every call) passed check:minpentai-agent-live in production at levels 1 to 3.
  // drafts: who may start a draft ruleset by name (agent-play/solo.ts DRAFTS), book-3 (owner, 2026-11-01: "make book-3
  // available to me in agent play once it's back on, so I can judge it by playing").
  minpentaiPlay: { people: [6786] as readonly number[], drafts: [6786] as readonly number[] },
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

/**
 * The illustration check (owner, 2026-10-23: "Does each image show its scene?"; branch illustration-check). A vision
 * model checks each seeded key-moment image against its passage (scripts/check-illustrations.ts); the owner decides
 * keep, regenerate with a note, or drop on /you/illustrations. "Owner-only: nothing public until I've read it."
 */
export const ILLUSTRATION_CHECK = {
  /** Who may open the review page and decide: the admins (owner, 2026-10-29). */
  owners: ADMINS,
  /**
   * Shows "Reviewed by a person" under a reviewed image wherever it appears (the chapter and the listen view). Off
   * until the owner allows anything public; the mark reads the decision the redo writes into the job file.
   */
  reviewMarkPublic: false,
  /** The recommended checker on the Vercel AI Gateway (a closed model, Google's; named first wherever it is shown). */
  model: 'google/gemini-4-argon',
  modelName: 'Google Gemini 4 Argon',
} as const;

/** Moderation only: these FIDs may hide content or dismiss a report. They never promote or rank anything. Owner, 2026-10-08 (decision 20). Every admin is one; a moderator who isn't an admin would be added here. */
export const MODERATOR_FIDS: readonly number[] = [...ADMINS];

/**
 * The ways to sign in, in the order they are shown (owner, 2026-10-30: Farcaster and a wallet as equals, with room for
 * Lens and Bluesky, Bluesky right after Lens; X has no sign-in for now). Only entries that are `on` are shown: the site
 * describes what works today, so there are no "coming soon" buttons. Lens and Bluesky don't exist yet. Turning one on
 * also needs its sign-in built (src/components/sign-in-choices.tsx) and the legal texts that name its services.
 * The labels and the one line under each are in src/lib/sign-in-text.ts.
 *
 * Local test only: NEXT_PUBLIC_SIGN_IN_ALL_FOUR=1 shows all four, to check that the layout holds them. The build
 * refuses it on Vercel (next.config.ts), so it never reaches the site.
 */
export const SIGN_IN_METHODS = [
  { id: 'farcaster', on: true },
  { id: 'wallet', on: true },
  // On for the sign-in release (owner, 2026-11-05, after the reread: "reviewed by the coordinator, approved by the owner").
  { id: 'lens', on: true },
  { id: 'bluesky', on: true },
] as const satisfies readonly { id: string; on: boolean }[];
export type SignInMethod = (typeof SIGN_IN_METHODS)[number]['id'];
/** The local-only test of four entries (see SIGN_IN_METHODS). */
export const SIGN_IN_ALL_FOUR = process.env.NEXT_PUBLIC_SIGN_IN_ALL_FOUR === '1' && !process.env.NEXT_PUBLIC_VERCEL_ENV;

/**
 * Whether a way to sign in is open on this deployment: its SIGN_IN_METHODS entry is on, or the local-only test
 * (SIGN_IN_ALL_FOUR, refused on Vercel) is. The Lens and Bluesky routes answer 404 while it is false, so nothing
 * about a Lens or Bluesky account reaches us before the Privacy and Terms lines that describe it are live
 * (docs/legal/signin-lens-bluesky-draft.md; the owner's "reread" turns them on, in the same release).
 */
export const signInOpen = (id: SignInMethod): boolean => SIGN_IN_METHODS.some((m) => m.id === id && m.on) || SIGN_IN_ALL_FOUR;

/**
 * Lens and Bluesky sign-in (branch signin-lens-bluesky, owner's item 5 of 2026-10-31). Off until the owner turns them
 * on in SIGN_IN_METHODS after rereading the legal drafts.
 *
 * Lens: Lens's own authentication (lens.xyz/docs/protocol/authentication): our server asks the Lens API for a
 * challenge for the account and the wallet that owns or manages it, the wallet signs it in the browser, and Lens
 * answers with an ID token (RS256, checked against Lens's JWKS) naming the account. We keep none of Lens's tokens.
 *
 * Bluesky: AT Protocol OAuth (atproto.com/specs/oauth) as a public client with PKCE, PAR and DPoP. Locally a loopback
 * client (client_id http://localhost?…, redirect to 127.0.0.1); on the site the client metadata JSON served at
 * `bluesky.metadataPath`. Scope 'atproto' only: it proves the DID and nothing more. The tokens are used once, to learn
 * the DID, and never kept.
 */
export const SOCIAL_SIGN_IN = {
  /** A Lens or Bluesky sign-in lasts this long (like a wallet's). */
  sessionHours: 24,
  /**
   * Owner, 2026-11-04 (3a, with the 30-day sentence): "An account you unlink can be linked to a different account
   * only after 30 days." Linking it again to the same account is allowed at any time (src/lib/social/accounts.ts).
   */
  relinkWaitDays: 30,
  lens: {
    api: 'https://api.lens.xyz/graphql',
    jwks: 'https://api.lens.xyz/.well-known/jwks.json',
    issuer: 'https://api.lens.xyz',
    /**
     * The Lens App the sign-in is for (the challenge's `app`, the ID token's `aud`): this site's own App on Lens Chain,
     * "Snowmoon Party", registered by the owner at /admin/lens-app on 2026-11-05 (UTC) and verified read-only
     * (docs/lens-app-registration.md, "Verified"; `npm run verify:lens-app`). Lens sign-in still opens only with the
     * sign-in release (SIGN_IN_METHODS). If this is ever emptied, Lens sign-in refuses (the challenge answers 503 and
     * no ID token is accepted). The tests stand in Lens's own Test App (0x8A5Cc31180c37078e1EbA2A23c861Acf351a97cE).
     */
    app: '0x3CD3dF83e3F74e855d7c4104a8ed9EBa23FaaE47' as '' | `0x${string}`, // ours, registered 2026-11-05 UTC, tx 0x7001522f7cad6c9ebd58204998e62af93cdd62ff627b05a2584ca58ae524e576
    /**
     * THE ONE PLACE the Lens score threshold lives (Lens's "Account Score", lens.xyz/docs/protocol/accounts/fetch;
     * 0 to about 10000 in the sample in docs/branch-reports/signin-lens-bluesky.md). Owner, 2026-11-04: "1,000 to
     * start". A Lens account (not linked) whose score is at least this gets the same free daily count as a Farcaster
     * account. Null would turn Lens's free counts off.
     */
    minScore: 1000 as number | null,
    /*
     * Owner, 2026-11-04 (variant B, and "store the decision, not the score"): the score is looked up only at Generate,
     * the same moment as Neynar's, and only when there is no current decision. Only the decision is kept (passed or
     * not, when, and the rule 'lens-score>=<minScore>'), in the shared store (src/lib/checks/decisions.ts, network
     * 'lens', keyed by the Lens address; CHECKS.passDays and CHECKS.failHours). The score is never stored, logged or
     * sent to the page (src/lib/social/lens-check.ts).
     */
    timeoutMs: 5000,
  },
  bluesky: {
    scope: 'atproto',
    /** Where the browser comes back to (a page, which finishes the sign-in with what it kept in this tab). */
    redirectPath: '/sign-in/bluesky',
    /** The client metadata document on the site; its URL is the client_id. */
    metadataPath: '/oauth/bluesky/client-metadata.json',
    plcDirectory: 'https://plc.directory',
    /**
     * Where "Sign in with Bluesky" starts when no handle is typed (2026-11-05): Bluesky's entryway authorization server.
     * The finish still checks the account through its own DID document and PDS (src/lib/social/atproto.ts).
     */
    entryway: 'https://bsky.social',
    /** A sign-in started must finish within this. */
    startMinutes: 10,
    timeoutMs: 5000,
    /**
     * The Bluesky check (owner, 2026-11-04): a Bluesky account that isn't linked to a Farcaster or Lens account gets
     * the free daily counts, and can remix and enter the remix challenge, only if it passes, the same way a Farcaster
     * account passes Neynar's score (src/lib/social/bluesky-check.ts). Two signals, from Bluesky's public AppView
     * (app.bsky.actor.getProfile and app.bsky.feed.getAuthorFeed; no key), asked with the account's DID only:
     * 1. the account is at least `minAgeDays` days old when it is checked, so new accounts can't be made for it (a
     *    rolling rule, owner, 2026-11-04: it replaced a fixed cut-off of 6 Nov 2026, which would have shut out every
     *    Bluesky account made after it for good);
     * 2. it posted at least `minRecentPosts` times (its own posts and replies, not reposts) in the last `recentDays`
     *    days, by Bluesky's own clock (each post's indexedAt) as well as the post's, so old idle accounts can't
     *    drain the daily cap.
     * Only whether it passed, when, and the rule used are kept, in the shared decision store (studio.check_decisions,
     * network 'bluesky', the DID; owner, 2026-11-04: one store, the decision, not the numbers): a pass for
     * CHECKS.passDays, a fail asked again no sooner than CHECKS.failHours later, or at once if the rule changes. Never
     * the dates or counts. If Bluesky can't be reached, refused, as for
     * Neynar. Off (`on: false`) until the owner's reread of its Privacy and Terms lines, and only matters once Bluesky
     * sign-in is on.
     */
    check: {
      // On for the sign-in release (owner, 2026-11-05, after the reread of its Privacy lines L12 and L16).
      on: true as boolean,
      appView: 'https://public.api.bsky.app',
      minAgeDays: 30,
      recentDays: 30,
      minRecentPosts: 5,
      /** How many of the newest feed items are read (one request); enough to find minRecentPosts among reposts. */
      feedLimit: 50,
    },
  },
} as const;

/**
 * "Support this site" (owner, 2026-10-30): the one place the support address lives. Every page, QR code and wallet send
 * reads it from here (test:support checks that, and that it is checksummed). It is a Splits account (the owner's).
 * Live on Ethereum and Base only: eth_getCode on 2026-10-30, two public RPCs each, found its code (a 61-byte proxy)
 * on those two and none on Optimism, Arbitrum, Zora or Polygon. Nothing about a sender is recorded.
 */
export const SUPPORT = {
  address: '0x93eC36379bFEB4db21a2d49102A1e30fC43673a3' as const,
  /**
   * The footer and About link to /support: on since the owner's $1 test was confirmed among the address's incoming
   * transfers (0.000446 ETH on Base, 2026-10-31 06:26:19 UTC; owner, 2026-10-31).
   */
  linked: true as boolean,
  /**
   * "Send below" (owner, 2026-10-30, simplified page): Base or Ethereum, in ETH or USDC. USDC is Circle's native USDC on
   * each network, not the bridged USDbC.
   */
  networks: [
    { name: 'Base', chainId: 8453, explorer: 'https://basescan.org', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}` },
    { name: 'Ethereum', chainId: 1, explorer: 'https://etherscan.io', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}` },
  ],
} as const;
export type SupportNetwork = (typeof SUPPORT.networks)[number];

/** The public contact for Snowmoon Party: legal, copyright and reports from readers who are signed out (owner, 2026-10-08). */
export const CONTACT_EMAIL = 'snowmoon@wearelum.xyz';

/**
 * The remix challenge (owner, 2026-10-31; docs/proposals/remix-challenge-plan.md, branch remix-challenge). Every date
 * of the challenge lives in `dates` and nowhere else (owner, 2026-10-31: "Keep every challenge date in ONE config
 * entry"): the page, the rules text, the entry window and the tests read them from here, so changing a date is one
 * edit. Each is an instant (UTC, with the Pacific wall time beside it); `closes` is the first instant after the last
 * minute that counts (23:59 Pacific is in, midnight is out). scripts/test-challenge.ts checks each against its
 * Pacific wall time, and fails if a page or wording file writes a date itself.
 *
 * Switches (docs/legal/remix-challenge-draft.md; legal texts describe today; P6q checks it):
 * - `entries` (on since the owner's reread of 2026-11-01): entries listed on /challenge with each character's count of entrants, the
 *   "Entry" badge on version pages, and Submit (owner, 2026-11-04; one row of studio.challenge_marks per submission,
 *   with a post link). Eligibility is decided once, when a version is published, and stored
 *   (studio.challenge_eligibility; src/lib/challenge/record.ts); pages only read it and never ask Neynar (owner,
 *   2026-10-31). Without the tables, only invited makers count and Submit says "not available yet".
 * - `posts` (on since the owner's reread of 2026-11-01): "Add where you posted it" and "Posted on" (studio.version_posts). The
 *   server reads the pasted address, checks its host, and asks that network's own API (Neynar, Bluesky's public
 *   AppView, Lens's API); it never fetches the pasted address.
 * - `openSheets` (on): see below; it takes effect only in the window and once Privacy describes the challenge.
 * All three tables are in 0033_remix_challenge.sql (applied 2026-11-01).
 * Agent-drafted entries are not tracked (owner, 2026-10-31).
 */
export const CHALLENGE = {
  id: 'remix-2026-11',
  /**
   * The owner's switch (owner, 2026-11-04: "/challenge is admin-only for now"). While false:
   * - /challenge, /api/challenge/* and every way into them (the menu item, the home row, the challenge share text, and
   *   on sheet pages the Entry badge, "Mark as my entry", the challenge lines and "Posted on") are for admins only
   *   (ADMINS); everyone else gets "not found", as agent pages do while AGENTS.public is off;
   * - nothing the dates would switch on opens by itself: entries (eligibility recorded at publish, marking), open
   *   sheet-making (openSheets) and the challenge's free image cap (dailySpendCapUsd) all stay off, whatever the clock
   *   says. `dates` stay as they are, for when the owner opens it with a new open date.
   * Only the owner turns it on. check:principles P6u proves it: with this off and the clock past `dates.opens`, entries,
   * open sheets and the $15 cap are off and /challenge answers 404 to a non-admin.
   *
   * ON: PREPARED, NOT MERGED. Merge only on the owner's word, after #123 (challenge-config-ids) is live and checked.
   */
  public: true as boolean,
  /**
   * The six character cards on /challenge (src/lib/challenge/cards.ts: one line, three bullets, a fuller description
   * and "Where they appear"), drafted by the coding agent (owner, 2026-11-05, answer 2), and the moments' titles and
   * scene lines (src/lib/challenge/moments.ts), also drafted by it. They go to the owner in one pass (reviewed by the
   * coordinator first); until he approves them, these stay false, and check:principles P2m refuses CHALLENGE.public
   * on with either false. Only the owner sets them.
   */
  // Approved (owner, 2026-11-06; "reviewed by the coordinator, approved by the owner"): the cards with three changes, and the scene lines.
  cardsApproved: true as boolean,
  sceneLinesApproved: true as boolean,
  /**
   * Entries as pictures (owner, 2026-11-05; docs/proposals/challenge-moments.md, R2): one picture of a challenge
   * character (since 2026-11-08, with the moments off, remixed from any of that character's pictures on the challenge
   * pages, a base or any remix, its maker's own included; before, at one of the moments), counts as an entry
   * (src/lib/challenge/pictures.ts); sheet remixes stop counting and sheets go back to invitation only. Off until the
   * owner rereads the Terms §6e and Privacy lines that describe it (docs/legal/challenge-moments-draft.md): legal texts
   * describe today, so check:principles P6ac refuses it on while Terms and Privacy don't say so. While off, the moments
   * flow still makes and publishes pictures (the site's own image pipeline, as "Make an image"), but none is an entry,
   * and sheet remixes count as before. The rehearsal switch turns it on, on this machine only.
   */
  // On (owner, 2026-11-06): Terms §6e and Privacy were reread and say so ("reviewed by the coordinator, approved by the owner").
  pictureEntries: true as boolean,
  /**
   * The moments (owner, 2026-11-08, the simpler challenge): off. With it off, no page shows a moment (no chips, no
   * "Surprise me", no scene line or quote on the remix screen, the hub, a character's page, a picture's page, the
   * preview, the rules, the lists, or a share text), the remix screen takes no moment and its prompt carries no scene
   * and no other character, and a picture needs no moment to be a challenge picture or an entry. The moments' code and
   * data stay (src/lib/challenge/moments.ts); a picture made with one still shows, without it. Turning it back on brings
   * back the moments flow as it was (scripts/test-challenge-moments.ts runs it both ways).
   */
  moments: false as boolean,
  /** The characters, by their file in content/snowmoon/designs/characters, most named in the book first (owner, 2026-11-04; content/snowmoon/characters-by-mentions.json, checked by test:character-order and P5h). */
  characters: ['zei', 'gladias', 'bai', 'seila', 'deluin', 'mu'] as readonly string[],
  /**
   * Each character's bases (owner, 2026-11-04): published sheets to start from, at most CHALLENGE.baseCount for the
   * character (never more than CHALLENGE.maxBases). Deluin and Gladias have three each: their current default look,
   * recast a and recast b (drafts in branch challenge-styles, docs/starting-sheet-drafts/directions/*-recast-*.jpg);
   * the other four keep one for now (Zei's and Bai's MJ·GPT fronts, the others' Animated series fronts). No look is
   * set above the others (the word for the first is "current default", nothing stronger): /challenge shows a
   * character's bases in a fresh random order on each visit (the P5g shuffle), so none reads as the default. None is published yet, so every list stays empty. Each entry is
   * a design's id: its element id (any version of it) or one version's id (the id in /references/designs/<id>).
   * Designs have no slugs. An entry is a fork of any base, or of a remix of one (src/lib/challenge/rules.ts,
   * remixOfBase); while a character's list is empty, a fork of any of its sheets counts, as before, so nothing breaks
   * before the picks.
   */
  // Published by the owner's run of scripts/publish-bases.ts, 2026-11-06 (version ids; the current default first).
  bases: {
    zei: ['bffc7b6a-edc7-4fd7-8922-bcab5f8c4c2d'],
    gladias: ['68364375-0f33-46fd-9755-2fd2b551198a', '8a491b21-2d32-4673-946c-cff28728088b', 'd5b4c137-71d6-430d-84e1-9ec4044568dc'],
    bai: ['110d5973-31c2-4d96-9a88-5838d8a6d868'],
    seila: ['1f64f9f4-ede5-42a4-8f56-a8ecb7f29aba'],
    deluin: ['75a94420-df70-4f43-a3a6-4c2b571e72ab', 'a69718e0-89d9-465f-a783-d4b98aefbe85', '0a126522-d3d5-4e12-a674-18f49dbffbed'],
    mu: ['15a9af1d-9eef-4e25-be57-738d9823dd74'],
  } as Record<string, readonly string[]>,
  /**
   * Each character's current default look (owner, 2026-11-05, answer 10; the accounts session's note of that evening):
   * a published sheet's element id (at its newest version) or version id. Used only for the site's own pictures: the
   * other challenge characters in a moment are drawn from it, as reference pictures (src/lib/challenge/pictures.ts,
   * defaultLook). Deluin and Gladias: their look b; Zei, Bai, Seila and Mu: their current front (Bai's is the front made
   * from Garance's edit, challenge-styles bai-animated-gpt-garance.jpg). Null until that sheet is published here: then
   * the character's first base stands in. /challenge still shows the bases in a fresh random order (P5g); this sets no
   * base above the others there.
   */
  // 2026-11-06: each character's current-default base, as published (Deluin and Gladias: look b; Bai: the front from Garance's edit).
  // Each character's current default (launch-picks current_default; owner, 2026-11-06): look b for Gladias (gladias:b, front
  // sha256 b9b6c009…) and Deluin (deluin:b, the b4 recast, front 2b45d17d…); the one Animated series base for the others.
  defaultLooks: {
    zei: 'bffc7b6a-edc7-4fd7-8922-bcab5f8c4c2d',
    gladias: '68364375-0f33-46fd-9755-2fd2b551198a',
    bai: '110d5973-31c2-4d96-9a88-5838d8a6d868',
    seila: '1f64f9f4-ede5-42a4-8f56-a8ecb7f29aba',
    deluin: '75a94420-df70-4f43-a3a6-4c2b571e72ab',
    mu: '15a9af1d-9eef-4e25-be57-738d9823dd74',
  } as Record<string, string | null>,
  /** How many bases each character has (owner, 2026-11-04): three for Deluin and Gladias, one for the rest for now. */
  baseCount: { zei: 1, gladias: 3, bai: 1, seila: 1, deluin: 3, mu: 1 } as Record<string, number>,
  /** The most bases any character may have. */
  maxBases: 3,
  /**
   * The owner's first remixes (owner, 2026-11-04): up to CHALLENGE.firstRemixesShown per character, shown on
   * /challenge under the heading "First remixes by @naaate", below its bases, in the order given here. They are not
   * entries: no Entry badge, no count, never in an entry list (src/lib/challenge/entries.ts leaves them out). Each entry is a published design's id (element or version), an
   * admin's remix of that character's base, imported with its self-reported recipe (scripts/import-first-remixes.ts,
   * docs/proposals/challenge-first-remixes.md). Empty until they exist: /challenge shows empty slots. Chosen by the
   * owner, not by any count (P5g's third narrow exception, pending the owner's yes).
   */
  // Published by the owner's run of scripts/import-first-remixes.ts --launch, 2026-11-06. Deluin: the two the owner picked
  // on 2026-11-04 (hood and mug, the game board). The ink ledge (ced288e6-1c3f-4d58-bb4c-839ef774bb71) is published on its
  // own page but not listed: firstRemixesShown is 2, and firstRemixesProblems refuses a longer list.
  firstRemixes: {
    zei: ['70c0a8c3-41a5-43ae-83f4-4b0ddfa9ed51'],
    gladias: ['f07a2f79-9787-4f9d-bb90-5b7ea94ad117', 'd4d8bf9f-0ca9-4a62-871b-0aa10a1fbc25'],
    bai: [],
    seila: ['399836db-6cd9-49e3-9302-77686b2a1161', 'b9983b8c-cde4-40c1-8601-f3f4702d1742'],
    deluin: ['fb80b4b1-bd9f-4fd1-87ef-4e8003347aaf', '42588f48-6673-478e-ab54-8e30372743c0'],
    mu: ['2f29b048-0e82-4d87-8193-9cfffedc9123', 'bb08afdb-f77f-4e07-b451-756460922714'],
  } as Record<string, readonly string[]>,
  firstRemixesShown: 2,
  /**
   * Who else a base credits as its maker, by the base's version or element id (owner, 2026-11-07: "name everyone the page
   * credits as maker, so Bai's sheet, made from Garance's edit, credits Garance too"). Shown before the maker on the base's
   * landing ("Made by @garance and @naaate · maintainer") and named first in its share text by the @ rule. Bai's base: its front was made from Garance's
   * edit (the owner confirmed it, 2026-11-05; its recipe's credit: "Garance (the edit used as reference)"); @garance is
   * FID 193912 on Farcaster (ADMINS).
   */
  coMakers: {
    '110d5973-31c2-4d96-9a88-5838d8a6d868': [{ handle: 'garance', network: 'farcaster' }],
  } as Record<string, readonly { handle: string; network: 'farcaster' | 'bluesky' | 'lens' | null }[]>,
  /**
   * The bases' fixed style order (owner, 2026-11-04): within a character its bases are listed in this order, the same
   * for every character, so the casts line up. Each entry is a published style's name, as a sheet's views record it
   * (body.style.title). A base whose style isn't listed comes after, newest first. Empty until the owner picks the
   * styles; while empty, the bases are listed newest first. This is the only challenge list not in time order (P5g
   * allows it for "Bases to start from" only; entries and every other list stay newest first).
   */
  baseStyles: [] as readonly string[],
  /**
   * Bases and references may be made by several models, closed ones included, each labelled with its maker (owner,
   * 2026-11-04). A base whose pictures name a closed model is refused (src/lib/challenge/bases.ts) until this is true,
   * and it stays false until the owner rereads the Terms and Privacy lines that name the providers (OpenAI and Google;
   * docs/legal/closed-model-bases-draft.md, branch closed-model-bases). check:principles P6s fails if it is true while
   * the Privacy page doesn't name OpenAI and Google for it. Remixers keep the open models: the remix and fork form's
   * model choice is unchanged.
   */
  // On for the launch (2026-11-05): the owner reread the Terms and Privacy lines naming OpenAI and Google (P6s).
  closedBasesAllowed: true as boolean,
  /**
   * A character gets a final version, a credit test and a token only if at least this many different eligible people
   * enter it (owner, 2026-10-31). /challenge shows each character's count (a count, never a ranking).
   */
  minEntrants: 3,
  /**
   * Submit (owner, 2026-11-04): a remix becomes an entry only when its maker presses Submit on its page, with a link
   * to a post about it on Farcaster, Bluesky or Lens (checked as "Add where you posted it" checks it). At most this
   * many submissions per person per Pacific day (timeZone below), for any character, with no total cap (branch
   * contest, 2026-11-04, replacing "up to three in total"); checked on the server under a lock. minEntrants counts the
   * different people who submitted for a character. A submission can be withdrawn until entries close; withdrawing
   * doesn't give back that day's submission (it stays on record, withdrawn: needs 0038_challenge_daily.sql; until
   * then Submit and Withdraw answer "not available yet").
   */
  submissionsPerDay: 1,
  /**
   * The Neynar score an entrant's account must have when a version is published (owner, 2026-11-01). Fixed for the whole
   * challenge, whatever IMAGES.neynarMinScore becomes; only the decision (passed or below) is kept, never the score.
   */
  neynarMinScore: 0.7,
  /**
   * Real instants (UTC), each with its America/Los_Angeles wall time (all in PST: the clocks changed on 1 Nov 2026).
   * Owner, 2026-10-31 (second update). A closing instant is the first that no longer counts.
   */
  dates: {
    /**
     * Entries open Tue 17 Nov 2026, 00:00 Pacific (owner, 2026-11-08; it was Tue 10 Nov, 00:00, and before that Fri 6
     * Nov, 09:00). Nothing opens by date alone: /challenge stays hidden until the owner turns CHALLENGE.public on. From
     * the flip to this instant, anyone can remix (with the $15 site-wide cap), but pictures made then are for trying it
     * out and can't be entered.
     */
    opens: '2026-11-17T08:00:00Z',
    /** Entries close after Sun 29 Nov 2026, 23:59 Pacific (owner, 2026-11-08): this is 00:00 Pacific on 30 Nov, the first instant that no longer counts. */
    closes: '2026-11-30T08:00:00Z',
    // No shortlist, results or mint dates (owner, 2026-11-05 evening): how the final version is chosen, and any prize,
    // are added to the rules before entries close. No page shows a date for them.
  },
  /** The time zone every date is shown in. */
  timeZone: 'America/Los_Angeles',
  entries: true as boolean,
  posts: true as boolean,
  /**
   * Likes on a remix page (owner, 2026-11-04): planned for 12 November, off until then. While off, the landing's like
   * slot (src/components/challenge-like.tsx) renders nothing and nothing is stored or counted.
   */
  likes: false as boolean,
  /**
   * Like, recast and reply counts from Farcaster, Bluesky or Lens on remix pages (branch contest, 2026-11-04): off while
   * the challenge and the vote are open. While off, nothing reads or shows them: "Posted on" gives only "See the
   * conversation on <network>" links. Nothing reads them yet; turning this on needs the owner's decision and its own
   * Privacy line first.
   */
  socialCounts: false as boolean,
  /**
   * On (owner, 2026-10-31), but it takes effect only inside the entry window, computed from `dates`
   * (src/lib/challenge/open-sheets.ts), and only once Privacy describes the challenge (the owner's reread). Before the
   * open and after the close, sheets are invited-only again with no deploy.
   */
  openSheets: true as boolean,
  /** The site-wide free image spend cap from the owner's flip (CHALLENGE.public) until entries close (owner, 2026-11-07); IMAGES.dailySpendCapUsd otherwise. */
  dailySpendCapUsd: 15,
  /** "Posted on": at most this many shown per version, newest first; and how many one person may add per UTC day. */
  postsPerVersion: 30,
  postsPerPersonPerDay: 20,
};

/**
 * The rehearsal switch (src/lib/challenge/rehearsal-switch.ts): CHALLENGE_REHEARSAL=on, on this machine only, never on
 * any Vercel deployment and only with a database on this machine. When on, the challenge is `rehearsal-<yyyymmdd>`,
 * opens at the start of today (Pacific; every date moved by the same amount) and is public on that server, and
 * admins are eligible (src/lib/challenge/who.ts). check:principles P6w proves production ignores it.
 */
export const REHEARSAL = {
  on:
    typeof window === 'undefined'
      ? rehearsalOn(process.env)
      : rehearsalOnInBrowser(process.env.NEXT_PUBLIC_CHALLENGE_REHEARSAL, process.env.NEXT_PUBLIC_VERCEL_ENV, window.location.hostname),
};
if (REHEARSAL.on) {
  const r = rehearsalChallenge(CHALLENGE.dates, new Date(), CHALLENGE.timeZone);
  CHALLENGE.id = r.id;
  CHALLENGE.dates = r.dates;
  CHALLENGE.public = true;
  // The rehearsal database's stand-in bases (scripts/rehearsal-db.ts), never the real ones.
  CHALLENGE.bases = REHEARSAL_BASE_IDS;
  CHALLENGE.defaultLooks = REHEARSAL_DEFAULT_LOOKS;
  // Entries as pictures, on this machine only, for rehearsal 2 (branch challenge-moments): the legal lines that describe
  // them are drafts (docs/legal/challenge-moments-draft.md), so production keeps it off (P6ac, P6w).
  CHALLENGE.pictureEntries = true;
}

/**
 * Sign-in checks (owner, 2026-11-04: "look each account up as rarely as possible"): the Neynar score today, the Lens
 * score (branch signin-lens-bluesky) and the Bluesky check (branch bluesky-check) later. Only the decision is stored
 * (studio.check_decisions; src/lib/checks/decisions.ts): passed or not, when, and the rule it was decided under. Never
 * the score or the numbers behind it.
 */
export const CHECKS = {
  /** A pass is used for this many days without asking again. */
  passDays: 90,
  /** A fail is asked again no sooner than this many hours after it was decided. */
  failHours: 24,
  /**
   * Hides that withdraw the maker's pass early (they are asked again at their next Generate or publish): a moderator's,
   * an admin's or a rule's (three reporters, or one "minor" report). Every report does too. A maker hiding their own
   * picture does not, while this is false (the owner's call; see docs/legal/check-decisions-draft.md).
   */
  recheckOnOwnHide: false as boolean,
};

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
   * user score is at least neynarMinScore, looked up at Generate with only the FID (NEYNAR_API_KEY).
   * Only the decision is kept (passed or not, when, and under which threshold; studio.check_decisions,
   * CHECKS below), never the score. If Neynar can't be reached, no one outside the invited list may
   * generate. Invited FIDs skip the lookup.
   */
  // 6852 is @luisotravez (owner, 2026-10-15).
  invited: [6786, 6852] as readonly number[],
  /** The one place the threshold lives. */
  neynarMinScore: 0.7,
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
  /** A higher daily Generate count for these FIDs (owner, 2026-10-13; every admin since 2026-10-29); the daily spend cap still applies to them. */
  perDayFor: Object.fromEntries(ADMINS.map((f) => [f, 300])) as Readonly<Record<number, number>>,
  /**
   * Admin caps (owner, 2026-10-29: "Make an image from any selected text with admin caps"): an admin's passage may be
   * any run of blocks in one chapter, up to this many, and the gate (Neynar score) doesn't apply. The daily count is
   * perDayFor above; the spend cap for everyone still applies.
   */
  admin: { maxBlocks: 400 },
  publishesPerDay: 3,
  /**
   * Across everyone, per UTC day (decision 10), kept apart from the assistant's. Outside the remix challenge (switch off, or after the close);
   * from the owner's flip to the close, CHALLENGE.dailySpendCapUsd. Read through imagesDailySpendCapUsd(), never directly.
   */
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
     * Credit back every Generate that gives no picture (the check or the model didn't answer, the prompt was refused,
     * or the safety checker dropped the picture), to the balance only (owner, 2026-10-21: "credit the balance for
     * anything charged but not made"; reading B, 2026-10-22). ON since 2026-10-22, in the same deploy as Terms 6a and
     * Privacy 4 (reread by the owner, PR #35), after migrations 0022 and 0027. Off means no new credits only: credits
     * already given stay in the balance (owner, 2026-10-23), and the wallet panel's note goes back to `terms` and no
     * "added back" line is shown. Turning it off ALSO needs a Terms change and the owner's reread in the same deploy:
     * Terms 6a promises that a generation that gives no picture is added back, which would stop being true.
     */
    creditBack: true as boolean,
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
    /**
     * Tokens for the prompt check on a sheet's view prompt (the view line, the style's text and the sheet's text, up to
     * about 1,350 characters), as Remix's (REMIX.guardMaxTokens): at 400 the check can spend them all reasoning and
     * give no answer, which counts as a refusal (owner, 2026-11-03). Only the tokens used are billed; the worst case
     * still fits the prompt check's share of the reservation (scripts/test-designs.ts checks it).
     */
    guardMaxTokens: 1200,
    /** A style needs at least this many sample pictures, made with its text (Design 4b). */
    samplesMin: 2,
    samplesMax: 4,
    /** A sheet needs its front view; side and back are optional. */
    publishesPerDay: 3,
    /**
     * Free remixes (owner, 2026-11-04): for an account that passes the check (not an admin, not invited), a sheet's
     * views count as remixes, not pictures. A remix is one sheet's three views, started by its first view; each remix
     * allows `picturesPerRemix` pictures in all (its three views and three more tries, so a view that fails or is
     * dropped is made again inside the same remix), and `remixesPerDay` remixes start per UTC day. A remix on a closed
     * model counts `closedRemixUnits` (the hook for branch remix-model-choice: src/lib/images/remixes.ts, remixUnits).
     * Admins (IMAGES.perDayFor) and invited makers keep counting pictures, as before. The site-wide spend cap is
     * unchanged. Counted in studio.sheet_remix_asks (0037_remix_count.sql); until it is applied, views count as
     * pictures, as before.
     */
    remixesPerDay: 3,
    picturesPerRemix: 6,
    closedRemixUnits: 3,
    /** At most this many picked characters' sheets are added to one image. */
    maxCharacters: 3,
  },
} as const;

/** Minpentai Play's limits and retention (owner, 2026-10-09). Every /api/minpentai/* request counts. */
/**
 * The site-wide free image spend cap for a moment: CHALLENGE.dailySpendCapUsd from the owner's flip (CHALLENGE.public on)
 * until entries close (excluded), before the open date too, since remixing works from the flip (owner, 2026-11-07;
 * before, from the open date: owner, 2026-10-31); IMAGES.dailySpendCapUsd ($2) at every other time: with the switch off,
 * whatever the date, and after the close. It reverts by itself at the close, with no deploy. The cap is per UTC day; the
 * day's spend counted so far is compared with the cap now. The 3 free pictures a day per person don't change.
 */
export function imagesDailySpendCapUsd(now: Date = new Date()): number {
  const t = now.getTime();
  // Only the owner's switch raises it (never the dates alone), and the close ends it.
  return CHALLENGE.public && t < Date.parse(CHALLENGE.dates.closes) ? CHALLENGE.dailySpendCapUsd : IMAGES.dailySpendCapUsd;
}

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
