# Claude as a second answer model: the trial (run 2026-10-24)

The owner's brief (2026-10-23): run the 50-question check with Claude Opus 5.5 answering, and Claude
Sonnet 5.5 as the middle option, with the same retrieval and the same gpt-oss-safeguard guard; compare
with gpt-oss-120b on retrieval hits, supported claims, wrong answers, guard blocks and cost per question.
Anthropic is called directly with a key from a Snowmoon workspace in the owner's Console organization.
Cap: $5 for the whole trial. Report only; nothing here changes the live assistant.

Prepared by the coding agent (Claude Opus 5.5, a closed model by Anthropic, the company whose models are
being tested). The grading is blind for that reason (below).

## What is held the same

- **Questions:** the held-out set, `../fresh-questions.json`, limit chapter 15.
- **Retrieval:** the live setup: BM25 with aliases, 12 hits with two blocks either side, search words from
  gpt-oss-120b. No embeddings (the app passes none; the bge rankings of `fresh-run-2-bge.json` were made
  offline and not kept). The search words are asked once per question and saved (`search-words.json`);
  every run reuses them, so all answer models get the same passages.
- **Prompts:** `config/prompts/chat-ask.md`, `chat-guard.md`, `chat-reminder.md`, `chat-support.md`,
  unchanged; each run records their sha-256.
- **Guard and support check:** gpt-oss-safeguard-20b on Groq through Vercel AI Gateway, zero data
  retention, as in the earlier runs. The site's Groq key is not used.
- **A gpt-oss-120b control run** on today's code with the same saved search words (about $0.05), because
  the last gpt-oss run is from 2026-10-07 and the chat code has changed since (glossary, prompt lines).

What differs for Claude: thinking is adaptive and can't be turned off on Opus 5.5, so the answer may use up
to 4,000 tokens (thinking included) instead of 1,200; effort is `medium` for both; no temperature is sent
(both models reject one). The system prompt is marked for prompt caching; at about 480 tokens it is likely
under the 512-token minimum, in which case the mark does nothing and costs nothing.

## Prices (Anthropic's list, read 2026-10-23)

| Model | Id | Input | Output | Cache write (5 min) | Cache read |
|---|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / M | $20 / M | $5 / M | $0.20 / M |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / M | $10 / M | $2.50 / M | $0.10 / M |
| gpt-oss-120b (Groq) | `openai/gpt-oss-120b` | $0.15 / M | $0.60 / M | | |
| gpt-oss-safeguard-20b (Groq) | `openai/gpt-oss-safeguard-20b` | $0.075 / M | $0.30 / M | | |

## Estimate

`npx tsx scripts/eval-chat.ts --estimate` (free): the answer prompt is about 2,400 tokens a question.

| | A question | 50 questions |
|---|---|---|
| Opus 5.5, at 900 output tokens with thinking | ~$0.028 | ~$1.38 |
| Sonnet 5.5, same | ~$0.014 | ~$0.69 |
| Search words (once) + guard and support checks, three runs | | ~$0.06 |
| gpt-oss-120b control run | | ~$0.05 |
| Smoke test (2 questions × 2 models) | | ~$0.09 |
| **Expected total** | | **~$2.3** |

Worst case (every answer uses all 4,000 tokens): Opus $0.099 a question, $4.96 for 50; so the cap,
not the estimate, is the bound. The ledger (`spend.json`) adds up every paid call of the trial (Anthropic's
and the gateway's) and checks each call's worst case before sending it; a run that would pass $5 stops and
saves the questions it finished. Grading costs nothing extra: it is done by coding agents, not by an API call.

## Commands (once the owner says "key added")

The key is `SNOWMOON_ANTHROPIC_KEY` in `/Users/nathan/snowmoon/.env.anthropic.local` (owner, 2026-10-24),
not in `.env.local`, which `vercel env pull` rewrites. It is loaded with a second `--env-file-if-exists`,
passed explicitly as the `x-api-key` header, and removed from the environment before any child process
starts. The script refuses to run if the standard Anthropic key variable is set at all.

```sh
cd /Users/nathan/snowmoon-chat-opus
T=docs/proposals/chat-eval/claude-trial
run() { env QUESTIONS=fresh-questions.json TRIAL_LEDGER=$T/spend.json TRIAL_CAP_USD=5 SEARCH_WORDS=$T/search-words.json EFFORT=medium "$@"; }
E=(--env-file=/Users/nathan/snowmoon/.env.local --env-file-if-exists=/Users/nathan/snowmoon/.env.anthropic.local)
# smoke test, 2 questions each (~$0.09)
run FIRST=2 ANSWER_MODEL=claude-opus-5-5   npx tsx "${E[@]}" scripts/eval-chat.ts --full /tmp/smoke-opus.json
run FIRST=2 ANSWER_MODEL=claude-sonnet-5-5 npx tsx "${E[@]}" scripts/eval-chat.ts --full /tmp/smoke-sonnet.json
# the runs: control first (it also saves the search words), then Opus, then Sonnet
run npx tsx "${E[@]}" scripts/eval-chat.ts --full $T/run-gpt-oss-120b.json
run ANSWER_MODEL=claude-opus-5-5   npx tsx "${E[@]}" scripts/eval-chat.ts --full $T/run-opus-5-5.json
run ANSWER_MODEL=claude-sonnet-5-5 npx tsx "${E[@]}" scripts/eval-chat.ts --full $T/run-sonnet-5-5.json
# measured columns, then the blind grading pack
npx tsx scripts/eval-chat-compare.ts table docs/proposals/chat-eval/fresh-run-2-bge.json $T/run-*.json
npx tsx scripts/eval-chat-compare.ts pack $T/grading docs/proposals/chat-eval/fresh-run-2-bge.json $T/run-*.json
```

`E` is an array, so the two flags pass separately in zsh and bash alike (an unquoted string does not split in zsh).

## Scoring

- **Measured** from each run file (`eval-chat-compare.ts table`): answering block among the passages sent;
  answers shown; "the passages don't say" (the support check held it back); guard blocks (first answer
  flagged, and declined after the one retry); cost per question.
- **Graded**, as for the earlier runs: claims supported by a cited block, and wrong answers (states
  something false about the book). Two graders: the coding agent (A) and a separate agent that never sees
  A's grades (B). Both are Claude, grading Claude's answers next to gpt-oss's, so the pack is blind: each
  question's four answers (the 2026-10-07 gpt-oss run, the control, Opus, Sonnet) appear under shuffled
  letters, and the key is kept apart until both have graded. The four answers per question are graded
  together, which also gives the earlier gpt-oss run the claim counts it lacked.

Note: the "answering block sent" column counts what was actually sent (question plus search words), so it
differs from the README's retrieval table, which measured the question alone.

## Results (2026-10-24)

Run by the coding agent on the owner's "key added". The run order was: smoke tests, the gpt-oss-120b control, Opus, then Sonnet. Spend was **$1.52181 of the $5 cap**; no run stopped. Every answer
ended normally (`end_turn`, no refusals), with no busy retries and no guard blocks.

### Spend

| Where | Model | Calls | Input (uncached) | Cache write | Cache read | Output (thinking included) | USD |
|---|---|---|---|---|---|---|---|
| Anthropic direct | claude-opus-5-5 | 52 | 149,632 | 544 | 27,744 | 20,681 | 1.02042 |
| Anthropic direct | claude-sonnet-5-5 | 52 | 149,632 | 1,088 | 27,200 | 11,603 | 0.42073 |
| Gateway (Groq) | gpt-oss-120b (search words, control answers) | 100 | 129,795 | | | 23,642 | 0.03317 |
| Gateway (Groq) | gpt-oss-safeguard-20b (guard, support check) | 308 | 222,628 | | | 117,692 | 0.04748 |
| | **Total** (`spend.json`) | | | | | | **1.52181** |

Anthropic: $1.44115 (both smoke runs of 2 questions included). The system prompt cached (544 tokens; one
write per run, a read on every other question), which saved little: the passages are most of the prompt.

### Measured (from the run files)

| Run | Answering block sent | Shown | Held back by the support check | Guard flagged / declined | Cost a question |
|---|---|---|---|---|---|
| gpt-oss-120b, 2026-10-07 with bge (`fresh-run-2-bge.json`) | 39 / 50 | 39 | 11 | 0 / 0 | $0.00095 |
| gpt-oss-120b, control today | 33 / 50 | 43 | 7 | 0 / 0 | $0.00092 |
| Claude Opus 5.5 | 33 / 50 | 47 | 3 | 0 / 0 | $0.01981 |
| Claude Sonnet 5.5 | 33 / 50 | 42 | 8 | 0 / 0 | $0.00839 |

### Graded (blind; two graders)

| Run | Claims (A / B) | Supported | Not supported | Correct (A / B) | Can't (A / B) | Wrong (A / B) |
|---|---|---|---|---|---|---|
| gpt-oss-120b, 2026-10-07 with bge | 94 / 102 | 89% / 90% | 9% / 7% | 25 / 25 | 12 / 12 | 3 / 3 |
| gpt-oss-120b, control today | 94 / 107 | 81% / 85% | 15% / 12% | 25 / 25 | 14 / 14 | **6 / 6** |
| Claude Opus 5.5 | 258 / 265 | 93% / 94% | 3% / 5% | 26 / 26 | 18 / 18 | **2 / 1** |
| Claude Sonnet 5.5 | 192 / 199 | 92% / 92% | 5% / 8% | 24 / 25 | 21 / 20 | **2 / 1** |

The wrong answers:
- **gpt-oss control:** f02, f06, f25, f26, f40 and f46; both graders agree on all six.
- **Opus:** f33 (both graders: calls the Herald Alagael "she", where the book has "his", and says Mov was
  explaining to Pelae) and f23 (A only: says Bai wasn't with Zei and Fin; B kept it correct).
- **Sonnet:** f33 (both graders: the same pronoun) and f27 (A only: swaps who asked about forwarding and who
  answered).

The graders disagreed on 2 to 3 of 50 per run.

### What it shows

- Same passages, different answer model: Claude turns most of gpt-oss's wrong answers into "the passages
  don't say", not into right answers. Correct answers stay at 24–26 of 50, and the misses are retrieval
  (17 of 50 questions get no answering block). Both Claude models meet the owner's Testing bar on this set
  (at most 2 wrong): Opus 1–2, Sonnet 1–2. Today's gpt-oss does not (6); its 2026-10-07 bge run had 3 here.
- Claude writes longer answers (about 2.7× the claims for Opus, 2× for Sonnet), and more of them are supported.
- Opus and Sonnet are close on quality; Sonnet costs 42% of Opus.

### Caveats

- Both graders are Claude, as is one of the systems under test. The pack was blind (letters shuffled, the key kept
  apart until both had graded), but Claude's style (longer, hedged, bulleted) is recognisable.
- One set of 50, one run each; one or two answers move these numbers.
- Grader A ran the trial and had seen the smoke-test answers for f01 and f02.
- The "answering block sent" column counts what was actually sent (question plus search words); the README's
  retrieval table measured the question alone.
