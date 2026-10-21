# Tonight (2026-10-20): agents for your account only, with edit tools (branch `agents-owner`)

**What's switched on after the merge:** agents, for an allowlist only: FID 6786 and one wallet (to confirm, see
below). Everyone else gets 404 from every agent route and sees nothing new; agents.md and /p stay off.

- **The connector:** https://snowmoon.party/mcp, a remote MCP server with OAuth, which you add as a custom
  connector in the Claude app (steps in `phone-steps.md`). Anyone may reach the consent page, but only
  the allowlist can tap Allow. Taking someone off the allowlist stops their agents on their next request.
- **Edit tools (drafts on your own versions only):**
  - `list_takes`;
  - `try_frame`, with your note;
  - `swap_take`;
  - `change_timing`;
  - `mark_speaking`;
  - `request_video_test`.
  Each one is a draft on /you, and you react with Keep, Try again or Say more. Keeping an edit does not
  change the published scene yet: putting kept edits into a new version is the editor rework, which
  waits.
- **Spending:** `try_frame` and `request_video_test` only draft. The cost shows on the button ("Make it
  (up to $0.05)", "Run the test (about $0.025)"), and nothing is spent until you tap it. Each approval
  runs once. The daily caps are 20 frames, 5 video tests and $2. A frame goes through Remix's own
  pipeline and your balance, and is kept privately. A video test uses LongCat-Video 480p on fal, is paid
  from the site's fal key and is kept privately. **The real fal video call has not been tried.** The
  tests use a stand-in.
- **`log_gap`:** when the agent can't do something, it records what you asked and what was missing.
  These show on /you under "What your agent couldn't do", which is your build list.
- **Speaking is off** (`AGENTS.transcription.on = false`) until you've confirmed Groq's audio retention.
  The Speak button doesn't show.
- **Tests:** `test:agents` passes 121 checks. The principle checks: 46 pass, none fail, and P6d isn't run
  (no Vercel CLI here).
- **Privacy and Terms:** drafts are in `docs/legal/agents-owner-draft.md`, for your reread.

---

# Overnight: agents that make things for people (summary)

Branch **`agents-connect`**: local, switched off, not pushed. Nothing deployed or published, and no
production database change. Money spent: **$0**: the test agents ran on your Claude subscription, and
there were no fal or gateway calls. InfiniteTalk: **skipped**, because Modal isn't set up on this Mac.

**Judged against your goal: people do the creative acts; AI does the work.**

## What works (locally, end to end, with two real Claude agents)

- **You say it; your agent makes it.** On /you, type or speak an idea. Your agent picks it up, makes
  something from it, and you react with **Keep**, **Try again** or **Say more**. No settings anywhere.
- **Speaking counts as writing.** A spoken idea or note is turned into text. You check the words and
  send them, and they're kept as yours. The recording is never kept.
- **The stamp.** Every piece shows what you did apart from what the AI did, for example **"Idea by @you ·
  feedback from @friend · made by Claude, agent of @you"**. Your own words, the idea and your notes, are
  shown as yours. An agent's note is credited to the agent, never to its person.
- **Story words stay human.** An agent can use your own words or the book's, each checked word for
  word, but never writes lines itself. A brought-in piece with AI-written words is labelled and never
  counts as anyone's stamp.
- **Feedback drives it.** A note on your draft, your piece or a moment of a scene goes to your agent as a
  request. Other people's notes on your piece reach your agent too, and they're credited in the stamp.
- **The machinery is one tap away.** Shot ids, timings, prompts and models sit behind "Recipe", still
  public.
- **Connecting.** "Add to Claude / ChatGPT" (with sign-in), snowmoon.party/agents.md, and wallet agents.
  "Disconnect" on /you stops an agent at once.
- **Tests:** `test:agents` passes 90 checks. The rest of the suite passes too, except one principle check
  (decision 3 below).

## Taps (measured in the demo)

- **Idea → first thing made: 5** when speaking (3 when typing): open You · Speak · Stop · Send ·
  tell your AI "go". Keeping it is 1 more.
- **Feedback → kept revision: 6** when speaking (4 when typing).
- **Down to 2–4:** if the agent watches your requests by itself (no "go"), and speaking stops on silence.

## Decisions for you

1. **Scanning before images open:** Arachnid Shield plus PhotoDNA (both free, both need an application),
   registering with NCMEC, and a written procedure with a lawyer. Until then, images stay closed.
2. **Speaking:** the transcription is Whisper large-v3-turbo (open weights) on Groq. Groq hears the
   recording; the Privacy line naming it is drafted (design §6). Not yet tried for real; the tests use a
   stand-in.
3. **Principle checks:** P4a now passes as you decided (2026-10-20): agent routes that only create
   drafts pass, and any that can publish or keep fails (design §8b). Principle 1 needs to allow
   declared recipes.
4. **ChatGPT:** custom connectors with write tools may need a Business plan. It needs a test on a real
   account.
5. **The editor:** redesign it as "say what you want, react", with Line and Voice up front and the rest
   behind Recipe. This is designed, not built (about 8–12 hours).
6. **Newcomers** (researched, not built): email codes plus $5 and $10 card packs, about $13 a month at
   100 users.
7. **Privacy and Terms:** the lines are drafted for your reread.

Screenshots and the transcript are in `docs/agents/demo/`. The full design is `docs/agents/design.md`.
