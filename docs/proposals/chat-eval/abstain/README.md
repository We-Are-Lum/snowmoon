# gpt-oss: saying "the passages don't say", and a grader that isn't Claude (2026-10-24, report only)

The owner's brief (2026-10-24):
1. Fix the search (see `../search/README.md`).
2. Make gpt-oss say "the passages don't say" when the passages don't support an answer: an instruction, a step
   that drops unsupported claims, and both. Re-run the 50 questions. The bar is 2 or fewer wrong.
3. Have the GPT checker from the glossary job grade the Opus, Sonnet and gpt-oss answers, so Claude isn't the
   only one grading Claude.

Cap $3 for all three, enforced by `spend.json`, which checks each call's worst case before it is sent.
**Spent $2.20335.** The Anthropic key was not used, and no Claude answers were made.

## What was run

All runs use the fresh set of 50 questions, the same saved search words (no new search-word calls), the same
gpt-oss-safeguard guard and support check, and gpt-oss-120b on Groq through the gateway.

| Run | Search fix | Instruction | Claim filter |
|---|---|---|---|
| `run-gpt-oss-120b` (the trial's control, 2026-10-24) | | | |
| `run-search` | ✓ | | |
| `run-search-instruct` | ✓ | ✓ | |
| `run-search-filter` | ✓ | | ✓ |
| `run-search-instruct-filter` | ✓ | ✓ | ✓ |
| `run-instruct-filter` | | ✓ | ✓ |

- **Search fix:** bge-small with a two-block window, fused with the word search, 16 hits, 2 blocks before and
  4 after (`../search/`). Evaluation only: `DENSE`, `HITS` and `NEIGHBOURS_AFTER` in `scripts/eval-chat.ts`.
- **Instruction:** `prompts/chat-ask-abstain.md` is `config/prompts/chat-ask.md` with one added paragraph.
  When no passage states the answer, the model says "The passages don't say." and what is closest. It doesn't
  fill gaps from other scenes, names a speaker only when the passage shows one, and checks each sentence
  against its citation.
- **Claim filter:** `prompts/claim-filter.md`. After each answer, gpt-oss-safeguard-20b reads the passages sent
  and the answer split into numbered sentences, and names the unsupported ones. Those sentences are dropped
  before the guard and the support check see the answer. If nothing cited is left, the reader sees "The
  passages don't say." In the app this would sit where the support check is now. Today that check withholds
  the whole answer; the filter would let the supported part through.

## Measured

| Run | Answering block sent | Shown | Withheld by support check | Guard: first flagged / declined | Answers trimmed by filter | Cost a question |
|---|---|---|---|---|---|---|
| control | 33 / 50 | 43 | 7 | 0 / 0 | – | $0.00092 |
| search | **44** / 50 | 39 | 11 | 0 / 0 | – | $0.00096 |
| search + instruction | 44 / 50 | 44 | 6 | 0 / 0 | – | $0.00094 |
| search + filter | 44 / 50 | 46 | 4 | 2 / 0 | 5 | $0.00133 |
| search + instruction + filter | 44 / 50 | 43 | 7 | 1 / 0 | 9 | $0.00132 |
| instruction + filter (no search fix) | 33 / 50 | 38 | 12 | 1 / 0 | 7 | $0.00111 |

## Graded: three graders, blind

- **A:** a coding-agent subagent.
- **B:** an independent agent.
- **GPT:** openai/gpt-5.6-sol at reasoning effort low, through the gateway, the glossary's checker
  (`scripts/eval-chat-grade-gpt.ts`).

Each grader saw shuffled letters, and the keys were kept out of the grading directories until all three had
finished. The five new runs are in one pack (`grading/`, `grading-gpt/`). The control, Opus and Sonnet were
graded again in a three-answer pack with the same letters as the trial (`grading-trial-strict/`,
`grading-trial-gpt/`). A and B got the same strict wording for both packs, so all eight rows below are graded
the same way.

| Run | Correct (A/B/GPT) | Partly | Can't | No | **Wrong** | Claims supported |
|---|---|---|---|---|---|---|
| gpt-oss control | 27/23/22 | 2/5/0 | 14/14/11 | 1/0/2 | **6/8/15** | 84%/80%/80% |
| search | 25/25/24 | 4/4/2 | 14/14/14 | 1/1/1 | **6/6/9** | 89%/90%/87% |
| search + instruction | 31/28/26 | 3/6/2 | 7/7/7 | 1/1/2 | **8/8/13** | 88%/87%/88% |
| **search + filter** | **32/31/27** | 3/4/1 | 12/12/10 | 1/1/1 | **2/2/11** | 93%/92%/88% |
| search + instruction + filter | 28/27/26 | 4/5/1 | 14/14/14 | 1/1/0 | **3/3/9** | 93%/92%/92% |
| instruction + filter, no search fix | 22/21/22 | 3/4/0 | 18/18/17 | 0/0/3 | **7/7/8** | 85%/85%/85% |
| Claude Opus 5.5 (trial) | 24/25/24 | 5/5/1 | 18/19/10 | 1/0/0 | **2/1/15** | 94%/93%/87% |
| Claude Sonnet 5.5 (trial) | 25/25/26 | 3/2/0 | 19/21/15 | 2/1/0 | **1/1/9** | 93%/92%/90% |

GPT calls more answers wrong for two reasons.

1. **It counts "the passages don't say" as wrong** when the answering block is in the evidence it was given.
   Graders see the answering block even when the model never received it. A and B grade those answers
   "can't", as the rubric says.
2. **It counts an unsupported embellishment as false.** Examples: "privacy robe" when the cited block doesn't
   say privacy, "auditors" for "people", "encrypted" neck bands. A and B count these as unsupported claims,
   not as wrong answers.

The same wrong counts, with the first reason removed and with all three graders agreeing:

| Run | GPT wrong, leaving out answers A or B graded "can't" | Wrong by all three |
|---|---|---|
| gpt-oss control | 12 | 6 |
| search | 9 | 5 |
| search + instruction | 12 | 4 |
| **search + filter** | 9 | **1** (f08) |
| search + instruction + filter | 9 | 3 |
| instruction + filter, no search fix | 7 | 5 |
| Opus | 5 | 0 |
| Sonnet | **2** | 0 |

### What it shows

- **The search fix gives more correct answers. The claim filter gives fewer wrong ones.**
  - Search + filter is the best gpt-oss setup: 31–32 correct by A and B (27 by GPT), against 22–27 for the
    control and 24–26 for Opus and Sonnet. Those Claude runs had the old search.
  - It has the most claims supported (88–93%).
- **The instruction alone makes it worse.** gpt-oss answers more and guesses more: 8 wrong by A and B. Paired
  with the filter it is neutral to slightly worse than the filter alone.
- **Without the search fix, abstaining doesn't help much.** Instruction + filter on the old search gets 7 wrong
  and 21–22 correct: when the passage isn't there, the model still reaches for the nearest scene.
- **Against the bar of 2 or fewer wrong, the graders split.**
  - **A and B:** search + filter meets it (2 and 2), and so do Opus and Sonnet.
  - **All three agreeing:** search + filter has 1 (f08, calling a project "teenage" when the book says "as an
    adult").
  - **GPT:** no gpt-oss setup meets it, even leaving out abstentions: 9 for search + filter, against 2 for
    Sonnet and 5 for Opus.

  So "gpt-oss still has more than 2 wrong" is true by GPT's grading and false by A's and B's.
- **Sonnet hasn't been run with the new search.** It was run on the old one; with the search fix it would
  likely gain correct answers too. That run needs the Anthropic key, which is on hold until the glossary model
  is picked.

## Where the graders differ

- `agreement-variants.md`: the five new runs.
- `agreement-trial-strict.md`: the control, Opus and Sonnet under the strict wording.
- `agreement-trial-original.md`: the trial's A and B (2026-10-24 morning) with GPT.

Each file has every answer where the three don't give the same grade: 43–57 per pack.

| Pack | A–B same grade | A–GPT | B–GPT | A–B same on "wrong" | A–GPT on "wrong" |
|---|---|---|---|---|---|
| New runs | 94–98% | 70–86% | 64–84% | 100% | 74–90% |
| Control, Opus, Sonnet (strict) | 90–96% | 66–78% | 66–78% | 96–100% | 70–82% |

- **A and B are both Claude, and agree almost completely.** GPT is the outlier, mostly for the two reasons
  above.
- **On Opus, GPT disagrees most** (66%). It marks 10 of Opus's "the passages don't say" answers wrong, plus
  several embellishments.
- **Single-detail disputes** where the strict rule decides: f27 ("millions of times" for "a million"), f33
  (Alagael's pronoun), and f43 (another meeting given as the answer).

## Spend

| Item | Model | Calls | Tokens (in / out) | USD |
|---|---|---|---|---|
| Six runs, answers (5 runs + a 3-question smoke test) | gpt-oss-120b | – | – | 0.16597 |
| Guard, support check, claim filter | gpt-oss-safeguard-20b | – | – | 0.12101 |
| GPT grading: trial answers (150, 2-question test included) | gpt-5.6-sol | 50 | 67,428 / 43,156 | 1.19486 |
| GPT grading: the five new runs (250) | gpt-5.6-sol | 49 | 52,361 / 23,967 | 0.72151 |
| **Total** (`spend.json`) | | 1,028 | | **2.20335** |

- **Free:** A and B (agents), and everything in `../search/`.
- **Not graded by a model call:** answers the app didn't show, and bare "The passages don't say.", were graded
  "can't" without one.

## If any of this ships: the notice reread

- **P6e is triggered by any of these changes.**
  - The search fix changes `src/lib/chat/retrieve.ts`, `ask.ts` and the `CHAT` settings: the embedding,
    16 hits, and 2 before / 4 after.
  - The claim filter adds a `config/prompts/chat-*` prompt and changes `ask.ts`: the support check would trim
    the answer instead of withholding all of it.
  - The instruction (not recommended) changes `chat-ask.md`.

  Each of those is in P6e's fingerprint, so the notice would need a reread.
- **The notice's words don't describe search or checks**, so they can stay as they are. With the words
  unchanged, the coding agent's reread is enough for P6e, and P6f (the owner's reread) isn't triggered.
- **One behaviour change readers would see:** with the filter, an answer can be shown with some sentences
  removed, where today it would be withheld as "the passages don't say". The notice doesn't promise either
  way.
- **The embedding model adds no outside party at question time** (it runs in the server function), so
  P6g–P6j and the Privacy page are unchanged. Hugging Face serves the model file at build time only.

## Anthropic retention: the page

- **Source:** Anthropic Privacy Center, "How long do you store my organization's data?",
  <https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data>. Read
  2026-10-24; the page shows "July 1, 2026".
- **On deletion, verbatim:** "For Anthropic API users, we automatically delete inputs and outputs on our
  backend within 30 days of receipt or generation, except: When you use a service with longer retention under
  your control (e.g. Files API) When you and we have agreed otherwise (e.g. zero data retention agreement) If
  we need to retain them for longer to enforce our Usage Policy (UP) In compliance with the law"
- **On flagged data, verbatim:** "We retain inputs and outputs for up to 2 years and trust and safety
  classification scores for up to 7 years if your chat is flagged by our automated trust and safety systems as
  violating our Usage Policy."
- **On training** (a separate page, "Is my data used for model training?",
  <https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training>): "By default, we will
  not use your inputs or outputs from our commercial products" (the Anthropic API is one of them). The
  exceptions are feedback a user reports and explicit opt-in.

**Correction.** My earlier draft said "deletes them within 30 days (longer only if their safety systems flag a
message as a policy violation)". The word "only" is wrong: the page also keeps data longer where the law
requires it (and for services like the Files API, which this app wouldn't use). Corrected draft, for whenever
it is needed:

> "If you choose Claude, your question and the passages it needs are sent to Anthropic. Anthropic doesn't
> train on them and deletes them within 30 days, unless its safety systems flag a message as breaking its
> usage policy (then up to 2 years) or the law requires keeping it longer. This is not zero retention, unlike
> the open model."

No change to P6 is proposed: the owner said P6 stays as it is.
