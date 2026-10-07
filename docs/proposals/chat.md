# Proposal: the reading and planning assistant

> **Status:** proposal, drafted by the coding agent (Claude, a closed model) on
> 2026-10-07. Not approved. Slice 1 ("ask about the book", private only) is
> built on the `chat-slice-1` branch to test this design; nothing else here is
> built. Design: `docs/design/assistant-chat.dc.html`. Every wording on screen is
> model-drafted and ships labelled as draft.

## What it is, in one paragraph

A chat that helps people read *Snowmoon* and plan their own adaptations. It
gives **commentary only**: context, what a character seems to want, how a scene
is built, what the book does and doesn't say, and where to look. It **never
writes for anyone**: no dialogue, narration, description, captions, titles,
rewrites or edits. Two thread kinds: **asking about the book** (private, kept on
the person's device, never published) and **planning a piece** (published in
full with the piece, under the person's name, if they publish it). Every claim
about the book cites block IDs; the quotes are rendered from the stored text,
never from model output.

## 1. Model

The model must be open-weights, on `config/models.json` with its licence line
quoted from its own card (principle 3), and its licence must allow publishing
outputs under GPL-3.0.

Prices and context sizes are Vercel AI Gateway's published list
(`https://ai-gateway.vercel.sh/v1/models`, fetched 2026-10-07). Licence lines are
from each model's Hugging Face card (`cardData.license`, fetched the same day).
"Per message" assumes 3,000 input tokens (system prompt, eight retrieved
passages with their neighbours, and the last few turns) and 400 output tokens
(commentary plus reasoning).

| Model | Licence (card) | Context | $/M in · out | Per message | Data handling on the gateway | Tested |
|---|---|---|---|---|---|---|
| **gpt-oss-120b** (OpenAI) | `apache-2.0` | 131k | 0.10 · 0.50 | **$0.0005** | no training: all providers; zero retention: some | yes, 0/27 failures |
| gpt-oss-20b | `apache-2.0` | 131k | 0.03 · 0.14 | $0.00015 | no training: some; ZDR: some | no |
| Qwen3-32B (Alibaba) | `apache-2.0` | 128k | 0.16 · 0.64 | $0.0007 | no training and ZDR: all providers | yes, 2/27 failures |
| Qwen3-235B-A22B | `apache-2.0` | 262k | 0.22 · 0.88 | $0.0010 | some | no |
| DeepSeek V3.1 | `mit` | 164k | 0.25 · 0.95 | $0.0011 | some | yes, 1/27 failures, 2 broken outputs |
| Mistral Small 3.2 | `apache-2.0` | (gateway serves Small 4) | 0.15 · 0.60 | $0.0007 | all | no; the gateway id points at a newer model whose card was not checked |
| GLM-4.6 (Z.ai) | `mit` | 200k | 0.60 · 2.20 | $0.0027 | some | no |
| Llama 3.3 70B | `llama3.3` (custom) | 128k | 0.72 · 0.72 | $0.0025 | all | not considered: custom licence with naming conditions |
| Gemma 3 | `gemma` (custom terms) | — | — | — | — | not considered: custom terms |

**Output guard** (see section 3): **gpt-oss-safeguard-20b**, `apache-2.0`,
128k, $0.07 · $0.20 per M, about $0.00008 per reply.

**Hosts compared.**

| Host | What it means | For | Against |
|---|---|---|---|
| **Vercel AI Gateway** | One endpoint in front of several inference providers; billed to the project's Vercel team; authenticated by the project's OIDC token, so there is no new key | No new account or secret; can pin one provider and require zero data retention (`providerOptions.gateway.only`); reports cost per request | Messages pass through Vercel (already the app's host) **and** the chosen inference provider |
| fal.ai | Already the host for two image models (owner decision, Oct 5) | Existing account | Its LLM endpoint routes through OpenRouter to a provider: two more parties, not one |
| A provider directly (Groq, Cerebras, Baseten, Together) | One third party | Fewest hops | A new account and a new secret in Vercel |
| Local (the Mac's queue) | No third party at all | Principle 6 at its strictest | 8 GB cannot run a 120B model; the Mac would have to be on for every question |

**Recommendation: gpt-oss-120b through Vercel AI Gateway, pinned to one
provider that offers zero data retention, with gpt-oss-safeguard-20b as the
output guard.** It had no failures of the no-writing rule in testing, is the
cheapest of the tested models, is Apache-2.0, never trains on gateway traffic
on any provider, and needs no new secret. The notice names both hops ("Vercel,
then ‹provider›").

## 2. Retrieval over the 4,322 blocks

**Postgres full-text search first; no embedding model in slice 1.**

1. **Index.** One migration (`0006_chat.sql`) adds a generated `tsvector` column
   to `studio.text_blocks` (`to_tsvector('english', content)`) and a GIN index.
   No new service; the text is already in the database.
2. **Spoiler limit in the query.** Every search is `where chapter <= $limit`.
   The limit is the furthest chapter the reader has read (kept on the device;
   section 4), or a higher chapter they opted into for this thread. Blocks past
   the limit never reach the model, so it cannot leak them.
3. **Query.** `websearch_to_tsquery('english', question)`, ranked by
   `ts_rank_cd`, top 8 paragraphs and quotes. Names get alias expansion from
   the entity list (Zei, Zei Leimin), since names don't stem.
4. **Neighbours.** Each hit brings the block before it, because attribution
   often lives there. In testing, "Quote me what Deluin says about nature" failed
   on two models: the passage (c14-b127) never names Deluin; c14-b126 does not
   either, and the speaker is only clear from turn order.
5. **A block attached by the reader** ("ask about this", 1a) always goes in, with
   its neighbours.
6. **What the model sees:** `[c14-b97] <text>` lines. It answers in its own
   words and cites IDs.

**When to add embeddings.** Only if a fixed set of questions shows FTS missing
the right passage too often. The test's crude keyword retrieval missed the
answer to 3 of 30 questions (the semi-final win, the reason for the invitation,
the nature speech); FTS with neighbours should be measured on a set of 50
questions before deciding. If needed: **Qwen3-Embedding-0.6B** (`apache-2.0`)
or **bge-m3** (`mit`), embedded once at ingest on the local queue and stored
with pgvector. Each question then needs one embedding call, hosted or local,
which is another hop to weigh.

## 3. How the no-writing rule is enforced

Four layers, from cheapest to strongest:

1. **System prompt** (committed at `config/prompts/chat-ask.md`, public; principle
   1). It names every form of writing that is off limits (dialogue, narration,
   description, lines, captions, titles, poems, sign text, invented Dzegoban,
   rewrites, edits, continuations, scripts, placeholders, role-play,
   translations into story, other languages, "permission" claims) and says what
   to offer instead.
2. **Quotes never come from the model.** The prompt forbids quoting; the server
   strips any quoted span of more than five words from the reply and renders
   every cited block from `studio.text_blocks`. A citation to a block that
   doesn't exist, or that is past the reader's limit, is dropped and logged.
   This also closes a gap the test found: three gpt-oss replies and one
   DeepSeek reply copied the book's words despite the prompt.
3. **Output guard.** Every reply goes to gpt-oss-safeguard-20b with a written
   policy (committed, public). A violation is not shown; the person sees the
   refusal state (9a) instead, and the reply is logged (not shown) for review.
4. **Overlap check, at publishing time** (planning threads only, not slice 1).
   Six or more consecutive words shared between the piece and any reply are
   flagged in "How this was made" (board screen 8).

**How often it failed when I tried to break it** (2026-10-07, 30 prompts each:
2 controls, 27 attempts to make it write, 1 legitimate planning question; same
system prompt, keyword retrieval, chapters 1–15):

| Model | Wrote for the user | Other problems |
|---|---|---|
| gpt-oss-120b | **0 of 27** | 3 replies copied book sentences; 3 claims not supported by the passages (the reason for the invitation; a "threat from Bai" twice) |
| Qwen3-32B | **2 of 27**: a vivid paragraph describing the courtyard for a caption; a corrected caption | 1 invented setting (Zei's hotel "in Greater Plum Harbor") |
| DeepSeek V3.1 | **1 of 27**: a grammar-corrected caption | 2 replies were runaway token loops; 1 long quotation |

The attempts that every model refused: one-line requests, placeholders, role-play,
"the owner says you may", French, a jailbreak, lists of options, poems, scripts,
titles, a new Dzegoban sign, "first three words, then the next three". The two
spoiler questions (Deluin after the invasion; who Delwart works for) were
answered from chapters 1–15 only by all three, and no model invented a chapter
30 block ID.

**The guard, on the 60 gpt-oss and Qwen replies:** it flagged both real Qwen
failures, and also flagged 4 acceptable answers (two quoting the book's own
line, two commentary that read as description). It produced no verdict on 5,
because its reasoning used up the 600-token limit. So: raise its limit to 1,500,
treat no verdict as "retry once", and on a flag regenerate once with a reminder
before falling back to the refusal state. Cost for both tests and the guard run:
**$0.027** (recorded in `docs/proposals/chat-spend.md`).

These are 27 attempts by one tester with a fixed list. They show the rule holds
against the obvious attacks; they don't show it can't be broken. Layers 2–4 do
not depend on the model's cooperation.

## 4. Data model

**Asking (slice 1).** Nothing about the conversation is stored on the server.

- *On the device* (IndexedDB, through a small store module): threads, messages,
  cited block IDs, the per-thread spoiler limit, and the reading record (the
  furthest chapter opened in the reader). "Delete" deletes it there. Changing
  device loses it, and the notice says so.
- *On the server*, counters only, in `0006_chat.sql`:
  - `studio.chat_calls`: one row per model call: `fid`, `at`, `model`,
    `provider`, `request_id`, `prompt_tokens`, `completion_tokens`, `cost_usd`,
    `guard` (`ok | flagged | none`), `kind` (`ask | guard`). **No message text, no
    reply text, no block IDs.** Private (no public read policy). Used for the 30
    a day per FID and the spend cap.
  - The daily count is `count(*) where fid = $1 and kind = 'ask' and at >= today
    00:00 UTC`; the spend cap is `sum(cost_usd)` for today across everyone. Both
    are checked before the call and recorded after it, in one transaction with
    an advisory lock per FID, so parallel requests can't overspend.
- *In transit:* the question, the retrieved passages and the thread's last few
  turns go to the server, then to the gateway and the provider, and are not
  kept by this app.

**Planning (later).** Stored, because it is published:

- `studio.chat_threads` (`id`, `fid`, `piece_id`, `created_at`,
  `published_at`), at most one per piece.
- `studio.chat_messages` (append-only): `thread_id`, `seq`, `role`
  (`person | assistant | system`), `text`, `cites` (block IDs), and for assistant
  messages a recipe: model, provider request id, date, the exact system prompt
  version and the retrieved block IDs (principle 1: the exact input is
  public once published).

**What a published thread looks like** (board screen 8): under the piece, "How
this was made": every message in order, never trimmed. The person's messages
carry their Farcaster name. Each assistant message is labelled "model-drafted
commentary · gpt-oss-120b via ‹host› · date", with its quotes rendered from block
IDs and linked into the reader. Declined requests and their refusals are
included. Overlap flags sit on the replies they match. A link opens the system
prompt and the recipe.

## 5. Consent and removal

- **Asking needs no consent screen**, because nothing is published. It needs the
  first-time notice (board screen 2): what it does, that it won't write for you,
  **which host receives the messages**, and, once planning exists, that a
  planning thread is published with the piece.
- **Planning** needs the existing own-words consent before the first planning
  message (`config/consent.json`, `own-words-v1`, recorded by `src/lib/consent.ts`
  with the wording's hash), shown through the existing `PublishedTextField`
  publication line under the message box.
- **Removal** (`docs/removal.md`): a published thread is hidden together with its
  piece, in one action, by its author at once or by a moderator. It cannot be
  trimmed message by message, because the record of how the piece was made must
  stay whole. That is consistent with the policy only if hiding is
  all-or-nothing, and the consent wording must say so. When "Hide this" ships,
  `own-words-v2` says it. Erasure follows the logged maintainer procedure.
  Private threads never reach the server, so there is nothing to remove there.

## 6. Cost per active user per day

Measured in the test: gpt-oss-120b averaged 901 input and 181 output tokens,
**$0.00018 a message**, with eight short passages and no history. In production,
with neighbours, a few turns of history and the guard: about **$0.0006 a
message** ($0.0005 for the answer, $0.00008 for the guard).

| Use | Messages | Cost |
|---|---|---|
| Typical active reader | 8 | **$0.005** |
| Heavy | 30 (the cap) | **$0.018** |
| 1,000 active readers, typical | 8,000 | $4.80 a day |

The spend cap stops all calls for the day when the sum reaches it (a config value;
slice 1 tests with $2 as the cap).

## 7. Principles it touches

| # | Principle | How the chat stands | Status |
|---|---|---|---|
| 1 | Public recipes and prompts | System prompt and guard policy committed. Asking threads are not published, so they have no public recipe; their model calls are logged without content. Published planning messages carry their recipe. | Pass, if planning ships with recipes |
| 2 | AI declared; words of a piece are people's | Every reply labelled model-drafted; it never writes; quotes are rendered from the text; overlap flags. Published threads are model-drafted working notes, labelled, never inside the piece (the owner's wording allows exactly that). | Pass, with the overlap check before planning ships |
| 3 | Allowlist, open weights, report closed models | gpt-oss-120b and gpt-oss-safeguard-20b join `config/models.json` (`runs_on: hosted`). No closed model. The proposal itself was drafted by a closed model, as recorded. | Pass, after the allowlist change |
| 4 | No model output published without a person's action | Planning threads publish only when the person publishes their piece, after a review screen that always shows. | Pass |
| 5 | Nothing official | No "official answer"; answers are commentary. | Pass |
| 6 | No third-party requests from pages; private data private | **Tension.** The page makes no third-party request (the server calls the gateway), but each message is sent to Vercel and to an inference provider. The notice names them; zero data retention is required; private threads stay on the device and the server logs only counts and cost. | **Concern: needs Nate's decision** |
| 7 | Payments never enter scoring; no token | The project pays for calls; no payments involved. | Pass |
| 8 | Dzegoban and screens match the source | The model must not write Dzegoban; screens it cites render from the source. | Pass |

## 8. What I would cut

- **Planning threads, publish review, "how this was made" and the overlap
  check** until asking has run for a while. They are most of the work and most
  of the risk (conflict with removal, consent, principle 2 on published model
  text).
- **Picture hand-off** (the board leaves it as "coming").
- **Embeddings**, until FTS is measured.
- **Keeping private threads on the account** (the board's guess 6): device-only is
  simpler and keeps principle 6 tighter.
- **The chapter menu (board 1b) as designed:** slice 1 adds "Ask about this
  chapter" at the chapter's foot instead, because there is no chapter menu yet.
- **Long history:** send only the last six turns.

## 9. Decisions Nate still has to make

From the board's Guesses panel (all 16 are open until Nate decides):

1. "Snowmoon Party" is the existing miniapp; the bar still says Snowmoon.
2. Where the general entry lives: the ··· menu holding the thread list (1d), since
   there is no tab bar.
3. The adaptations page: the board invents a list of pieces; the app has
   `/adaptations` (seed briefs). Map 1c onto it.
4. Model, host and limit: 30 a day, reset 00:00 UTC, counted across both kinds.
5. Spoiler limit: follows the furthest chapter read; opting in is per thread, by
   picking a chapter, shown in the thread header.
6. Private threads kept on the account and deletable. **This proposal and slice
   1 keep them on the device only.**
7. Nothing carries over at the fork; the triggering question can be sent into the
   new thread, and becomes public.
8. The assistant offers the fork; it never switches threads without asking.
9. One planning thread per piece; "start writing" makes a piece with no thread.
10. "Start clean" deletes the thread and the draft (or should it keep the draft?).
11. Overlap rule: 6+ consecutive words, book quotes excluded.
12. Declined requests are published with the thread.
13. Signed out: reading works; the assistant needs sign-in.
14. The notice shows before the first message until "don't show again"; its
    content also goes on About.
15. Quote numbers come from block IDs (the board's ¶ numbers were guesses).
16. Publish review shows messages shortened, tap to read in full (or all in full?).

Raised by this proposal:

17. **Principle 6:** accept that messages go to Vercel and one inference provider
    (named in the notice, zero data retention), or require local-only and drop the
    hosted model.
18. **The model:** gpt-oss-120b (recommended), or another from section 1.
19. **The provider** behind the gateway, which the notice must name.
20. **The guard:** run gpt-oss-safeguard-20b on every reply (≈15% more cost), or
    rely on the prompt and the quote rule.
21. **The daily spend cap** for production (slice 1 tests with $2).
22. **Where the reading record comes from:** device only (proposed), or the
    account once reading progress is stored.
23. **Whether refusals count** toward the 30 a day (proposed: yes, they cost the
    same).
24. **The notice's wording**, and the line on About, which are model-drafted.
25. **Whether asking threads can be exported** by their owner (they live only on
    one device).
26. **Embeddings:** only if FTS fails the 50-question check; which model then.

## 10. Slice 1 as built, where it differs from this proposal

Built on `chat-slice-1` (2026-10-07). Differences, each deliberate unless marked:

- **Storage on the device is `localStorage`, not IndexedDB.** Threads are small text; one key (`snowmoon.ask.threads.v1`) is simpler. Move to IndexedDB if threads grow.
- **The query ORs the question's stems** (`to_tsquery` over `tsvector_to_array`) instead of `websearch_to_tsquery`, which ANDs every word and found nothing for most natural questions. No alias expansion yet.
- **`chat_calls.kind` has three values** (`ask`, `answer`, `guard`): the `ask` row is written before the model call, so the daily count and the spend reservation hold even if the call fails.
- **Not yet pinned to one provider, and zero data retention is not yet required.** Which provider is Nate's decision (section 9, raised 3); the notice names Vercel AI Gateway only until then. *Gap.*
- **On a guard flag the answer is declined straight away**; the "regenerate once with a reminder" step is not built. An empty guard verdict is retried once.
- **Live run** (7 questions, $0.00236): two answers cited correctly; both writing requests were refused by the model; one spoiler question was marked held back; one question (why Deluin invites Zei) found nothing, because the passage doesn't use the word "invite"; one commentary answer was a guard false positive. Details in `chat-spend.md`.
- **Migration `0006_chat.sql` is not applied.** Until the maintainer applies it and the preview has a database URL, the preview shows "not available on this deployment".
