# Claude as a second answer model: the trial (prepared, not run)

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
E="--env-file=/Users/nathan/snowmoon/.env.local --env-file-if-exists=/Users/nathan/snowmoon/.env.anthropic.local"
# smoke test, 2 questions each (~$0.09)
run FIRST=2 ANSWER_MODEL=claude-opus-5-5   npx tsx $E scripts/eval-chat.ts --full /tmp/smoke-opus.json
run FIRST=2 ANSWER_MODEL=claude-sonnet-5-5 npx tsx $E scripts/eval-chat.ts --full /tmp/smoke-sonnet.json
# the runs: control first (it also saves the search words), then Opus, then Sonnet
run npx tsx $E scripts/eval-chat.ts --full $T/run-gpt-oss-120b.json
run ANSWER_MODEL=claude-opus-5-5   npx tsx $E scripts/eval-chat.ts --full $T/run-opus-5-5.json
run ANSWER_MODEL=claude-sonnet-5-5 npx tsx $E scripts/eval-chat.ts --full $T/run-sonnet-5-5.json
# measured columns, then the blind grading pack
npx tsx scripts/eval-chat-compare.ts table docs/proposals/chat-eval/fresh-run-2-bge.json $T/run-*.json
npx tsx scripts/eval-chat-compare.ts pack $T/grading docs/proposals/chat-eval/fresh-run-2-bge.json $T/run-*.json
```

`$E` is left unquoted on purpose, so it splits into the two flags.

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
