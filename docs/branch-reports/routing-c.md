# Branch report: routing C on `agent-pictures`

DRAFT, by the coding agent (Anthropic's Claude Opus 5.5), overnight 2026-10-30/31, for the owner's item 4.
Not merged. No PR into main.

## What was built

**Make mode is OFF** (`CHAT.make.enabled: false`). While it is off, the chat works exactly as today:
- no routing call is made;
- nothing is sent to Baseten;
- the notice's words are unchanged.

Turning it on is one line, after the owner's reread (below).

### The routing call (`src/lib/chat/router.ts`)

- It uses trial 5 variant C's instructions and `route` tool, word for word.
- It runs on gpt-oss-120b over the chat's own route: Groq, or the gateway to Groq when Groq is busy.
- It sees exactly two messages: the instructions and the person's latest message.
- `tool_choice` forces `route`.
- An unreadable answer counts as a book question.
- Its cost is recorded with the chat's calls (kind `search`), so it counts against the chat's $2 cap.

### One turn (`src/lib/chat/turn.ts`)

- **Make mode off:** today's `ask()`.
- **A make conversation** (a valid make token for this FID): stays on Kimi K3, with no routing call.
  - This is the one change from the trial, which still routed every turn and ignored the result once in make mode.
    The outcome is the same, at $0.0001 less a turn.
- **Otherwise:**
  1. Check the chat's spend cap.
  2. Make the routing call.
  3. "Book" goes to `ask()`, with its 30-a-day count and $2 cap.
  4. "Make" goes to make mode.

### Make mode (`src/lib/chat/make.ts`)

- **Kimi K3** (`moonshotai/kimi-k3`) through Vercel AI Gateway, with `providerOptions.gateway = { only: ['baseten'], zeroDataRetention: true }`.
  - There is no `order` and no `models` list, and no retry to anything else.
- **A reply is refused (make-unavailable) when:**
  - the gateway gives a non-200;
  - the reply was served by any provider but `baseten`;
  - the reply lacks `enabledZeroDataRetention: true`.
- **The person is told plainly:** "The model that makes things can't be reached right now, and this conversation
  isn't sent anywhere else. Try again later."
- **Sticky make mode** uses a signed token kept on the device, with no table.
  - The token holds the FID, the UTC day and a random id.
  - It is an HMAC with a key derived from `IMAGES_TICKET_SECRET` (label `chat:make`).
  - Another FID's token, or a forged one, isn't honoured.
  - A token from an earlier day keeps the conversation on Kimi K3 and is counted again for the new day.
- **A tool loop:**
  - at most 12 model calls a turn;
  - it stops starting new calls after 180 s (the route has `maxDuration = 300`);
  - a tool's answer is cut to 12,000 characters.

### The caps, with no migration (`src/lib/chat/limits.ts`)

- **Make conversations per person (10 a day):** a `studio.chat_calls` row (FID, time, kind `ask`), with `model = 'moonshotai/kimi-k3'`.
  - `usedToday` (the 30 book questions) now leaves those rows out.
  - The row is written only after a conversation's first Kimi call is answered, so an outage costs nobody one of the ten.
- **Make spend ($3 a day site-wide):** `studio.chat_costs` rows with `model = 'moonshotai/kimi-k3'` (kind `answer`, provider `baseten`).
  - `spentToday` (the chat's $2) now leaves those rows out.
  - Before each Kimi call, the worst case (the input so far, plus 6,000 output tokens at $3/$15 per million) must fit under $3.
- **Why no migration:** both tables already take any model name. The constraints (`chat_calls.kind = 'ask'`; `chat_costs.kind` in search/answer/guard) don't need widening.
  - The cost of this choice: the routing call is labelled `search` in the daily totals.
  - If you'd rather have it labelled `route`, that is a small migration (an owner decision; not written).
- **Concurrency:** the same as the chat's $2 cap today. The check is under an advisory lock, but the cost is recorded after the call, so two parallel make calls can each pass. The cap can be overshot by at most one call's worst case each (about $0.10).

### Make mode's tools (`src/lib/chat/make-tools.ts`)

- **Offered:** `search_book`, `get_passage`, `get_glossary`, `get_sheet` and `get_references`, the agent interface's public reads.
- **Held to the thread's chapter limit**, because the agent tools aren't spoiler-limited:
  - hits past the limit are dropped;
  - a later chapter is refused;
  - the glossary reads only through the limit;
  - sheet facts past the limit are dropped;
  - the sheet's uncited summary is kept only for a thread that may read the whole book.
- **Not wired: the drafting tools** (`draft_picture`, `draft_sheet`, …). They act as the person's agent and need an agent row (`studio.agents.route` is oauth, wallet or key). The assistant as an agent isn't built: that is an owner decision, and probably a migration.
  - The make prompt says plainly that drafting isn't open. In the real trial Kimi said so in both turns.

### The prompt (`config/prompts/chat-make.md`)

- The first paragraph is trial 5's variant C system prompt, word for word.
- A final paragraph covers:
  - the chapter limit;
  - that drafting isn't open yet.

### The UI (`src/components/assistant.tsx`, `src/lib/chat/device.ts`)

- The thread keeps its make token.
- Make replies show as plain paragraphs, with "Assistant · making · N new left today".
- The footer names Kimi K3 · Baseten in a make thread.
- New replies for the make limit, the make cap and make-unavailable.
- All of this is hidden while make mode is off. Its wording is drafted by the coding agent.

### Status and notice

- **`/api/chat/status`** sends `make` (the names, plus the make conversations left today), only while make mode is on.
- **The notice** (`src/lib/chat/notice.ts`) has a make-mode version, `noticeItemsWithMake`, shown only when on.
  - Today's words are unchanged: P6f's key is still `1xrxl4h`.
  - The make-on key would be new, so P6f fails until the owner rereads it.

### Allowlist and checks

- **`config/models.json`:** a Kimi K3 entry (licence "Kimi K3 License", open weights, revision f831ab6…, checked 2026-10-31).
- **`check:principles` P3b** now checks `CHAT.make.model` against the allowlist.
- **"Baseten"** is on P6g–P6i's list of services, so naming it in the notice without Privacy and About fails.

### References

The trial 5 variant C reference files (`docs/trials/trial-5-hybrid-C.md`, `trial-5-script-C.mts`) were on `next-version`, not
on this branch. They are copied here unchanged.

## Baseten zero retention: the evidence

**Baseten, Security Practices** (https://www.baseten.co/security-practices/):
- "Baseten adheres to a Zero Data Retention posture across all inference products."
- "Baseten's Model APIs product adheres to a Zero Data Retention posture for all Customer Content."
- "'Zero Data Retention' means that Baseten shall not (a) log, record, or store Customer Content … (b) save Customer
  Content to persistent storage…"
- "Baseten does not use Customer Content for model training, fine-tuning, or improvement of any algorithms."
- The exception is async: "These model input requests can stay in queue for up to 72 hours before being processed
  and then deleted." Not used: the gateway's chat endpoint is synchronous.

**Baseten, Data Request Policy** (https://www.baseten.co/data-request-policy/), §4:
- "Baseten does not log, record, or save Customer Content contained in inference inputs or outputs … to persistent
  storage after real-time processing, subject to the limited exceptions described in the Security Practices."

**Vercel AI Gateway ZDR** (https://vercel.com/docs/ai-gateway/security-and-compliance/zdr):
- "Set `zeroDataRetention` to `true` to route the request only through providers that have zero data retention
  agreements with Vercel AI Gateway."
- "If no ZDR-compliant providers are available for the requested model, the request fails with an error".
- Baseten is in the table "The following providers currently offer ZDR on AI Gateway" (No prompt training ✓, ZDR ✓,
  policy "Security").

**Gateway listing** (https://ai-gateway.vercel.sh/v1/models/moonshotai/kimi-k3/endpoints): the Baseten endpoint for
Kimi K3 shows `has_zdr: true` and `has_no_training: true`, region US, at $3 input and $15 output per million tokens.

**Caveat:** Baseten's "Customer" is Vercel, whose system credentials the gateway uses. For us, zero retention rests on
Vercel's agreement and Baseten's posture, not on a contract between Lum and Baseten. Also, the quoted sentences were
read through a page-reading tool, which shortened two long sentences (marked …); the words quoted are exact.

## Tests

All logs are in the session scratchpad,
`/private/tmp/claude-501/-Users-nathan-snowmoon/b065ecb5-ae9b-5616-b62f-ffe127e10e19/scratchpad/`.

**`npm run test:chat-make`** (new): 21 checks passed (`routing-c-test-chat-make-*.log`).
- It uses stand-ins for every model and for the gateway's fetch, against PGlite with the real book seed.
- **Every rule catches its planted violation:**
  - **R1 routing:** two lines and the latest message only, forced, on gpt-oss-120b. Book goes to the book answer, make to Kimi, unreadable to book. Planted: the routing call also shown the history.
  - **R1b:** a make request is answered by Kimi.
  - **R2 sticky:** a later turn, even a question, stays on Kimi with no routing call. Another FID's token or a forged one is routed afresh. An earlier day's token is counted again.
  - **R3 pin:** every make request in the run asks for Kimi K3, `only: ['baseten']` and `zeroDataRetention: true`, with no `order` or `models`. Planted: an extra provider.
  - **R4 no fallback**, each case: make-unavailable after exactly one request, to Baseten only, not counted.
    - a Baseten 503;
    - no ZDR provider (400);
    - served by another provider;
    - ZDR missing;
    - ZDR false.
  - **R5 the $3 cap:** at the cap, a make request is refused and nothing is sent; book questions still work.
  - **R6 ten a person:** the eleventh is refused. A counted conversation goes on, another person is unaffected, and the 30 book questions are untouched.
  - **R7 which cap each side counts against:** a book question (and its routing call) counts against the $2, never the $3. A new make turn adds only its routing call to the $2, and its Kimi calls to the $3. A sticky make turn adds to the $3 only.
  - **R8 make off:** no routing or make call, today's answer, and `CHAT.make.enabled` off in the committed settings.
  - **R9 spoilers:** make mode's tools stay within the chapter limit.
- **Mutations of the real code**, not only planted observations, were also caught (`routing-c-mutation.log`; reverted afterwards):
  - dropping `only` from `makeProviderOptions` (R3, R4);
  - counting make rows in `usedToday` (R6);
  - changing the routing instructions (R1).

**Existing suites:**
- `npm run test:chat`: 91 checks passed.
- `npm run test:chat-route`: 9 checks passed.

**`npx tsc --noEmit -p .`:** passes.

**`npm run check:principles`** (static): 53 pass, 1 fail (P6d, the accepted open item), of 54. All 54 are proven to fail on a planted violation (`routing-c-principles-2.log`).

**`npm run check:ui`** on a fresh build (`next start -p 3320`, under the shared lock): passed, 59 pages, including 8 assistant states in light and dark (`routing-c-check-ui.log`, `routing-c-build.log`).
- P6e is restamped by the coding agent. The notice's words are unchanged while make mode is off, which CLAUDE.md's P6e note allows.

## The real trial

**Script:** `docs/trials/routing-c-trial.mts`. Output: `routing-c-trial.json` and `.log` in the scratchpad.
- It runs the site's own code against a throwaway PGlite, so nothing was written to production.
- The routing call went through the gateway, pinned to Groq. `GROQ_API_KEY` was removed from the process, so the site's Groq key was not used.

| # | Call | Served by | ZDR confirmed | Cost |
|---|---|---|---|---|
| 1 | route "What is a Keeper in the book?" → **book** | groq | true | $0.00007125 |
| 2 | route "I'd like to make a reference picture of Bai." → **make** | groq | true | $0.00006915 |
| 3 | Kimi K3, turn 2 (asked for a book tool) | **baseten** | **true** | $0.007062 |
| 4 | Kimi K3, turn 2 (answer) | **baseten** | **true** | $0.0147828 |
| 5 | Kimi K3, turn 3 (sticky, with the token; no routing call) | **baseten** | **true** | $0.0078918 |

- **Total: $0.029877** (the gateway's own per-request costs).
- **Every Kimi request** asked for `only: ["baseten"]` and `zeroDataRetention: true`.
- **One make conversation was counted.** The make spend recorded was $0.0297366.
- **Turn 1's book answer was not run**, only its routing: the book answer's code is unchanged.
- **What Kimi said, in both make turns:**
  - it gave Bai's book facts with block ids, and kept the edition's invented look apart;
  - it said plainly that it can't draft or save the picture.

## Migration

None. The caps live in existing tables (see above).

## Legal

The draft lines, before and after, are in `docs/legal/routing-c-draft.md`:
- Privacy §5;
- Privacy §7's Groq item, and a new Baseten item;
- the notice's four items;
- About;
- an optional Terms §8 sentence.

`legal.ts` and its reread record are untouched.

## For the owner to decide

1. **Reread** `docs/legal/routing-c-draft.md`. Then make mode can be switched on in the same release:
   - set `CHAT.make.enabled: true`;
   - put the Privacy and About lines in;
   - set `ownerReread` for the notice's new key.
2. **The assistant as your agent** (the drafting tools in make mode): not built. Today make mode only reads and plans. Do you want it built next? It needs:
   - an agent identity for the assistant (likely a new `studio.agents.route`, so a migration);
   - the reread pack's item 14 wording.
3. **Is make mode for everyone signed in, or only the agents allowlist** (FIDs 6786, 6852, 193912)? As built, it is for everyone signed in with Farcaster once switched on. Saying "allowlist" is a one-line change.
4. **No routing call on sticky make turns** (it saves $0.0001 a turn, with the same outcome): OK, or routing on every turn as literally specified?
5. **The routing call labelled `search`** in the daily totals: OK, or a small migration for a `route` label?

## Principles

| Principle | Status | Note |
|---|---|---|
| P3, open models | pass | Kimi K3 is open weights (Kimi K3 License), on the allowlist; P3b now covers it. |
| P6, privacy | pass while off | The pin and ZDR are on every make request and proven by tests. Nothing is stored beyond a count under the FID and the daily cost totals. Turning it on needs the owner's reread (P6e, P6f, P6g–P6i enforce it). P6d is the accepted open item. |
| P1, P2, story words human | pass | The make prompt keeps trial 5's rule: story lines are the book's or the person's, word for word. No drafting is possible yet. |
| P8, labels | pass | Make replies are labelled "Assistant · making", and the footer names Kimi K3 and Baseten. |

New tension:
- Make mode reads the book through the agent tools, which aren't spoiler-limited. I held them to the thread's limit.
- If the drafting tools come later, the scene tools (`get_scene`, `get_shot`) will need the same limit.
