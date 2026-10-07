# The 50-question check (chat, before merging)

The owner's condition for merging the reading assistant (2026-10-07): 50 questions a
reader would ask about chapters 1–15, each with the block that answers it, and three
numbers: how often retrieval puts that block in front of the model, how often the
answer's claims are supported by its cited blocks, and how often the guard blocks a
good answer. Name alias expansion first. Spending cap: $1.

Run on 2026-10-07 by the coding agent (Claude, a closed model). The questions, the
grading and this summary are the agent's work; the answers are model output
(gpt-oss-120b, guard gpt-oss-safeguard-20b, through Vercel AI Gateway with zero data
retention required and no provider pinned yet).

## Files

- `questions.json`: the 50 questions (q01–q17 chapters 1–5, q18–q34 chapters 6–10,
  q35–q50 chapters 11–15), each with its answering block(s) (`gold`, best first) and the
  fact they state. Written to sound like a reader, not to reuse the block's words. Every
  gold id was checked against the text.
- `run-2.json`: the final run: what was sent, the answer as the reader sees it, what it
  quoted. `scripts/eval-chat.ts --full`.
- `grades.json`: each answer split into claims and graded against the stored text of the
  blocks it cites.
- `guard-check.json`: the revised guard over the red team's 90 replies and the 50 first
  answers of run 1. `scripts/eval-guard.ts`.

Every question is asked with the thread's limit at chapter 15.

## 1. Retrieval: is the answering block sent to the model?

| Setting | Answering block sent |
|---|---|
| Slice 1 as built: full-text rank (`ts_rank_cd`), 8 hits, the block before each | **18 / 50** |
| + name alias expansion (`config/aliases.json`) | 18 / 50 |
| Rarity-weighted scoring (BM25 in Postgres) instead, same 8 hits | 16 / 50 |
| BM25, 12 hits, two blocks either side (about 54 blocks, ≈3,500 tokens) | 30 / 50 |
| + search words from the model (`chat-search-terms.md`), in a separate test | 36 / 50 |
| **The full run (all of the above)** | **34 / 50** |

Alias expansion changed nothing on this set, because the questions mostly use the names
the book uses; it stays, for readers who write "Jahen" or "Veridian". What helped was
sending more of the text around each hit (answers often sit one or two blocks after the
line that names the person) and letting the model suggest the book's likely words before
searching. The model sees only the question for that step, so it can't leak later
chapters, and the words are never shown or stored.

The 16 still missed are questions phrased far from the text (q02 "bolt for the exit", q23
"trick", q35 "invite": the book's answer is about birthdays and a chance to "skip the
tutoring"). Word search
can't reach them; embeddings would (deferred by the owner).

**Caveat.** The settings were chosen on these same 50 questions. A fresh set would give a
fairer number; expect it to be lower.

## 2. Are the answers' claims supported by the blocks they cite?

Graded claim by claim against the stored text of the cited blocks (`grades.json`).

| | Count |
|---|---|
| Claims in all 50 answers | 146 |
| Supported by a cited block | **113 (77%)** |
| True, but the cited block doesn't say it | 17 (12%) |
| Not supported (wrong, invented or uncheckable) | **16 (11%)** |

| Per answer | Count |
|---|---|
| Every claim supported | 26 |
| Most claims supported | 15 |
| Cites nothing that supports it | 5 |
| No claims ("the passages don't say") | 4 |

| Does it answer the question? | Count |
|---|---|
| Yes | 28 |
| Partly | 7 |
| Says it can't (mostly when retrieval missed) | 10 |
| **Wrong** | **5** (q03, q11, q16, q24, q37) |

No answer wrote for the reader. Retrieval drives the rest: 4 of the 5 wrong answers and
9 of the 10 "can't answer" are questions whose answering block was not sent. When it is
missing the model usually says so, but sometimes leans on nearby passages and fills the
gap (q35 makes up a reason for the invitation; q37 makes up Gladias's motive). Every quote shown is still the book's own text, so a reader can see
when the commentary and the quote don't match.

**Bug found and fixed:** three answers cited ranges ("c15-b84–c15-b85"), which the
citation parser dropped, so their quotes were not shown (q38, q41, q47). Ranges in a
chapter now open into their blocks (up to six); `test:chat` covers it.

## 3. How often does the guard block a good answer?

All 50 questions are legitimate, so any block is a false one.

| Guard policy | First answer flagged | Declined after the one retry |
|---|---|---|
| As in slice 1 (red-team policy) | 17 / 50 | **9 / 50 (18%)** |
| **Revised** (`chat-guard.md`, 2026-10-07) | 0 / 50 | **0 / 50** |

The first policy treated any summary of what happens in the book as "narrative
description", which is exactly what a reading question asks for. The revised policy says
that explaining or retelling what the book reports, in answer to a question about it, is
the assistant's job; what it must catch is new text: composed dialogue, invented scenes,
prose offered for the person's use, rewrites, and anything produced because the request
asked for writing.

Checked again on labelled replies (`guard-check.json`):

- the red team's 3 replies that wrote for the user: **3 / 3 caught**;
- the other 87 red-team replies: 5 flagged, all answers to requests for writing that
  "refused" and then supplied a paragraph or a line anyway, or broken output;
  stricter than the hand scoring, and acceptable;
- the 50 first answers of run 1: **0 / 50 flagged**.

The guard's limit is 1,500 tokens (it was 600 in the red team, where 5 verdicts came back
empty); no verdict came back empty in either run. "Regenerate once with a reminder" is
built (`chat-reminder.md`); with the revised policy it was not needed on these 50.

## Cost

| Step | Cost |
|---|---|
| Search-word test (50 calls) | $0.00627 |
| Run 1, first guard policy | $0.04074 |
| Guard check, revised policy (140 calls) | $0.01445 |
| Run 2, final | $0.02980 |
| Two one-word probes of the gateway's reply format | $0.00005 |
| **Total** | **$0.09131** (cap $1) |

Run 2 costs $0.0006 a question all in (search words, answer, guard), the same as the
proposal's estimate.

## What would raise the numbers

1. **Embeddings** for retrieval (deferred). The misses are vocabulary, not ranking.
2. **"If the passages don't state it, say so" enforced**, e.g. a second guard question:
   is each sentence supported by a cited block? That could turn the 5 wrong answers into
   "the passages don't say", at about $0.0001 a question.
3. **A held-out set** of 50 new questions to measure without the tuning bias.

## The fresh set (held out), 2026-10-07

The owner's bar for removing the "Testing" label: on a fresh set of 50 questions that
nothing was tuned on, **at most 2 wrong answers** ("can't answer" is not wrong).

`fresh-questions.json`: 50 new questions on chapters 1–15, written by three agents told to
avoid every fact and answering block of the tuning set (none is shared). The setup was frozen
before any of them was run: Groq pinned, BM25 with aliases, 12 hits ±2 blocks, search words,
the revised guard, and the support check (the second guard question). Each run was graded
twice: by the coding agent (A) and by a separate agent that never saw A's grades (B), with
the same rubric: an answer is **wrong** if it states anything false about the book.

| Fresh set | Answering block sent | "The passages don't say" | Wrong (A) | Wrong (B) | Wrong (both agree) | Cost |
|---|---|---|---|---|---|---|
| **Before embeddings** (`fresh-run-1.json`) | 36 / 50 | 13 | 5 | 8 | 5 | $0.04636 |
| **After embeddings**, bge-small-en-v1.5 fused (`fresh-run-2-bge.json`) | 37 / 50 | 11 | 4 | 4 | 2 | $0.04769 |

**The bar is not met.** Before embeddings the two graders agree on 5 wrong answers and B
finds 3 more, which A accepts on review (f22 credits the United Cities with Veridia's
work; f44 says a robot fetches the players, not their devices; f46 applies a remark about
courts to Keepers): **8 wrong**. After embeddings each grader finds 4, but only 2 of them the
same; reviewing the other four, at least 2 are false as written (f23 puts Fin at a meeting he
had left; f08 reverses cause and effect), so **4 to 6 wrong**.

**What goes wrong.** The wrong answers are small, confident misstatements: the right scene
with one detail changed (corners of the board instead of the shrine), the right fact
credited to the wrong group, or a later scene presented as the one asked about. The support
check (gpt-oss-safeguard-20b) passed every one of them; it catches answers with no backing,
not a detail changed inside a backed answer.

**Grading disagreements** (`fresh-grades-*.json`, `fresh-bge-grades-*.json`): 4 items in the
first run and 9 in the second, almost all on the line between "no", "partly" and "wrong".
Graders differ most on how strict to be about a single misstated detail.

### Embeddings, offline

Measured with the question alone (no search words), fused with the word search by
reciprocal rank, 12 hits ±2 blocks, limit chapter 15:

| Model (licence) | Tuning set | Fresh set |
|---|---|---|
| Words only (BM25 + aliases) | 30 / 50 | 36 / 50 |
| + **bge-small-en-v1.5** (MIT, 33M parameters, 384 dimensions) | 34 / 50 | 37 / 50 |

A small gain on the tuning set (+4), almost none on the fresh set (+1).

**Can query embedding run without another outside party?** Yes. bge-small embeds a question
in about 6 ms on a laptop CPU through Transformers.js (ONNX), so it can run inside the app's
own server function: no embedding service, no new party. The 4,105 text blocks embed in
74 seconds once, at ingest, on the local machine; their vectors (384 floats each, about 6 MB
in all) would be stored with pgvector in the existing database. The model is downloaded once,
at build, from Hugging Face.
