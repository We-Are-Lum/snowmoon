# Search: why the answering passage doesn't reach the model (2026-10-24, report only)

Owner's brief: look at the 17 questions of the fresh set whose answering block is never sent to the model, say
why each was missed, propose fixes, and re-measure. Every number below is free. It runs on PGlite with the
book, reusing the search words saved by the Claude trial (`../claude-trial/search-words.json`), and
embeddings computed on this machine. No model was called.

- `scripts/eval-search.ts`: the variants, measured on all 50 questions so regressions show. It also writes the
  per-miss analysis: where the answering block ranks, the nearest hit, and the words they share.
- `scripts/eval-embed.py`: the embedding ranks (BAAI/bge-small-en-v1.5, MIT, 33M parameters, 384
  dimensions), run locally with the existing `.venv-image`.
- `search-variants.json`, `search-variants-w2.json`: the fresh set (plain embeddings, then embeddings with a
  two-block window). The `-tuning` files are the same on the tuning set `questions.json`, which has no saved
  search words, so its "live" row is the question alone.

## The 17 misses

The live search is the question plus up to 20 search words from gpt-oss-120b, BM25 with aliases, 12 hits
with 2 blocks either side, and limit chapter 15. "Rank" is the answering block's place in the BM25 ranking,
with and without the search words.

| Question | Reason | The specific cause |
|---|---|---|
| f08 | Search words, wording | Asked "interested in Steering"; the words drifted to ships ("navigation engine"). Rank 28 with the words, 109 without; the embedding ranks it 9. |
| f14 | Dialogue without names, wording | The answer is two short lines ("bring me along", "And my mom") with no name, and "apologizes" vs the book's "I'm sorry". Not in any ranking. |
| f18 | Wording | "Why let each player see the AI's thinking" vs the book's "make the game more realistic". BM25 rank 70; the embedding ranks it 1. |
| f19 | Neighbours, pronoun | A hit lands 3 blocks before the answer, one past the ±2 window. The answer says "he said", not "Nine". |
| f20 | Neighbours, wording | "Disguise" vs "pretend it's a game". The nearest hit is 4 blocks before the answer. |
| f25 | Wording | "His attack fell apart … come back" vs game mechanics ("factory", "sixteen strategies"). Rank 102 with the words. |
| f31 | Dialogue without names, search words | The answer (bake a cake, bring food to Hreda) names neither Lily nor Gladias, and the words guessed "cooked cleaned laundry". |
| f32 | Wording | "How does she really feel" vs "those tactics … were beautiful". Rank 36 with the words, unranked without. |
| f36 | Wording | "Not to hurry" vs "impatient … win quickly"; "patience" and "impatient" stem differently. Rank 141–267. |
| f37 | Search words, number of passages | Rank 15 with the question alone, 29 with the words; the embedding ranks it 1. |
| f39 | Number of passages | Rank 13 with the words, 10 without: just past 12 hits. |
| f40 | Search words, wording | "Interrupted" vs "the game cut out". Rank 8 with the question alone, 23 with the words ("crash door shout"). |
| f41 | Neighbours, search words | A hit 3 blocks away; the words drifted ("cold wind snow"). |
| f43 | Wording, number of passages | "Found out … after the overheard meeting" vs "only two more times after that". Rank 45; the embedding ranks it 13. |
| f44 | Wording, number of passages | "Keep from finding out" vs "sit here … without internet". Rank 17; the embedding ranks the other answering block 6. |
| f45 | Search words, number of passages | The words drifted to game jargon ("cooldown", "summon"). Rank 23 with the words; the embedding ranks it 3. |
| f46 | Wording | "Keep each other from knowing who they are" vs "hiding our faces … neck bands". The words guessed "masks oath veils". |

**By reason** (a miss can have more than one):

| Reason | Misses |
|---|---|
| Wording: the question is phrased far from the book's words | 11 |
| Search words that pulled the search away from the answer | 7 |
| Number of passages: ranked 13–45 | 5 |
| Neighbours: 3–4 blocks from a hit | 3 |
| Dialogue lines with no names in them | 3 |

The name aliases are not the problem: no miss is a name the aliases fail to expand.

The search words cut both ways. Dropping them gains 3 overall (33 → 36): it fixes f08, f25, f39 and f40 but
loses f21, and it ranks f43 and f45 lower. The words come from gpt-oss before it has seen anything, so they guess at
vocabulary.

## Fixes, measured on all 50

"Sent" means an answering block was among the passages sent. The tuning set has no saved search words, so
its rows measure the question alone.

| Variant | Fresh set | Tuning set | Lost vs live (fresh) | Passages a question (fresh) |
|---|---|---|---|---|
| **Live**: 12 hits, ±2, with search words | 33 | 30 | – | ~53 blocks, ~1,850 tokens |
| 16 hits | 34 | 31 | 0 | ~2,460 tokens |
| 20 hits | 37 | 33 | 0 | ~3,050 tokens |
| 24 hits | 41 | 35 | 0 | ~3,670 tokens |
| ±3 neighbours | 35 | 37 | 0 | ~2,520 tokens |
| 2 before, 4 after | 36 | 38 | 0 | ~2,610 tokens |
| The question alone (no search words) | 36 | 30 | 1 (f21) | ~1,770 tokens |
| Question and question + words searched separately, fused | 36 | 30 | – | ~1,830 tokens |
| + bge-small, one block each, fused | 40 | 34 | 3 | ~2,040 tokens |
| + bge-small, one block each, 16 hits, 2 before / 4 after | 41 | 42 | 0 | ~3,580 tokens |
| + bge-small, **two-block window**, fused | 40 | 39 | 3 | ~1,730 tokens |
| + bge-small, window, 2 before / 4 after | 43 | 42 | 1 (f06) | ~2,340 tokens |
| **+ bge-small, window, 16 hits, 2 before / 4 after** | **44** | **44** | **0** | ~79 blocks, ~3,000 tokens |

**Best: embeddings with a two-block window, fused with the word search, 16 hits, 2 blocks before and 4 after.**
It sends an answering block for 44 of 50 on the fresh set (from 33) and 44 of 50 on the tuning set (from 30
with the question alone), and loses no question the live search finds. That is the "search fix" item 2 uses.

**Without embeddings, the best is 2 blocks before and 4 after** (36 and 38, no losses), or 24 hits (41 and
35). Both are settings changes only.

**Still missed with the best fix:** f14, f25, f31, f39, f44 and f46. Three are wording no method here
reaches (f25, f44, f46), two are nameless dialogue (f14, f31), and f39 sits just past the cut.

### Where the embedding model would run, and what it costs

- **Questions:** bge-small embeds a question in about 3–6 ms on a laptop CPU. In the app it would run inside
  the server function through Transformers.js (ONNX): no embedding service and no new outside party at
  question time, so P6a and P6g–P6j are unchanged. No per-question cost beyond a few milliseconds of
  function time.
- **Blocks:** embedded once, at ingest, on the local machine. Chapters 1–15 took 32 s (72 s with the
  window); the whole book is about 4,100 blocks of 384 floats, about 6 MB. They would be stored with
  pgvector in the existing database, which needs a migration.
- **The model:** downloaded once, at build, from Hugging Face. That is a build-time request, not a reader's.
- **Prompt size:** the best fix sends about 1,150 more tokens a question, about $0.0002 more on gpt-oss.

**Caveat:** the variants were picked on these sets. The tuning set is a second check that the choice isn't
fitted to the fresh set alone, but a third, unseen set would be the fair test.
