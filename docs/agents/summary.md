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
