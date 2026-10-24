# The search fix and the claim filter in the live chat (branch chat-search-live, not merged)

Owner, 2026-10-24: "Build the search fix and the claim filter into the live chat on a branch; don't merge. The
question's embedding must run on our own server, with no new provider. If that isn't possible, stop and tell me,
because it would change the notice."

## Does the embedding run on our own server? Yes

| | Measured |
|---|---|
| Where | The chat's own server function (`/api/chat/ask`): Transformers.js 4.3.1 and onnxruntime-node 1.30.0 |
| Model | bge-small-en-v1.5 (BAAI, MIT), int8 ONNX, 34.7 MB in 5 files, fixed by sha256 (`src/lib/chat/embed.ts`) |
| Model source | media.snowmoon.party/models/bge-small-en-v1.5-q8/2c93ef54aaf3/ (our R2 bucket; Cloudflare is already on the Privacy page). Never Hugging Face: the library's remote fetch is off. |
| Function size | 83 MB traced (`next build`, route.js.nft.json), of the 250 MB limit. Only the Linux x64 ONNX runtime (46 MB) ships; the other platforms' binaries and the browser runtime are excluded. |
| Memory | about 345 MB resident with the model loaded (local); the function has 2 GB |
| Cold start | about 2 s to load the model, plus fetching 34.7 MB from our media once per instance (local measurement, macOS) |
| Per question | about 6 ms to embed |
| If it fails | The question is answered by the word search alone, as today (no error to the reader) |

Not yet verified on Vercel itself: the Linux binary can't run on this Mac, and the model isn't uploaded. The first
preview deploy after the upload is the check.

## What changed in the app

- **Search** (`retrieve.ts`, `config.ts`): the question's vector finds the 50 nearest blocks in
  `studio.block_vectors`; they are fused with the word search; 16 hits, 2 blocks before and 4 after.
- **Claim filter** (`ask.ts`, `config/prompts/chat-claim-filter.md`): it runs after the support check, on every
  answer. Dropped sentences are never shown.
  - Supported answer: shown, minus any sentence the filter drops.
  - Failed answer: shown trimmed only if the trimmed answer passes the support check again. Otherwise the reader
    sees "the passages don't say", as today.
- **Spend cap's worst case** (`ask.ts` `WORST_CASE`): 48,000 input tokens and 10 guard-model calls, up from
  24,000 and 6.
- **Database:** `supabase/migrations/NEXT_chat_block_vectors.sql` adds pgvector (Supabase's `extensions`
  schema) and `studio.block_vectors`, readable by studio_writer only. Paste files are in iCloud
  `snowmoon-takes/overnight-2026-10-21/migrations/`: `NEXT_chat_block_vectors.sql`, its `.DRY-RUN.sql` and
  `READ-BACK-chat_block_vectors.sql`.
- **The book's vectors** are computed on this machine with the same code: `scripts/embed-blocks.ts`, 4,105
  blocks in 113 s, written to `private/` (gitignored). They are loaded with `--load` after the migration.
- **Allowlist:** `config/models.json` lists the model, with its license line, pending the owner's approval.
- **Tests:** every PGlite test harness now loads pgvector, because the migration needs it.

## Cost a question

| | Worst case reserved against the daily cap | Measured average (fresh set, 50 questions) |
|---|---|---|
| Before (12 hits, ±2) | $0.00990 | $0.00092 (`../claude-trial/run-gpt-oss-120b.json`) |
| Now (16 hits, 2 before / 4 after, claim filter) | $0.01710 | **$0.00140** (`run-fresh-live.json`; range $0.00081–$0.00244) |

At the $2 daily cap, the worst case reserves 116 questions a day, against 202 before. The measured average
allows about 1,400.

## A difference from what was measured in #50

The best setup measured in #50 ran the filter **before** the support check. That way the support check saw
trimmed answers: 46 shown and 4 withheld.

Built as asked (filter **after** the support check), the same fresh set gives 38 shown and 12 withheld
(`run-fresh-live.json`). The support check now fails whole answers that the filter would have trimmed first,
and the filter keeps most of those whole. Retrieval is unchanged (44/50).

Wrong answers in this order haven't been graded. The 50 new questions will measure them. Switching the order is
a few lines in `ask.ts`, if the owner prefers the measured one.

## What the owner needs to do before this can go live

1. **OK the upload** of the model files to media.snowmoon.party:
   `npx tsx --env-file=.env.local scripts/publish-chat-embed.ts`. The dry run passes; nothing is uploaded yet.
2. **Apply the migration** (dry run, then real, then the read-back), then load the vectors:
   `STUDIO_DATABASE_URL=… npx tsx scripts/embed-blocks.ts --load`.
3. **Approve the model's allowlist entry** (P3).
4. **Notice reread (P6e):** the check fails, as it should, until the notice is reread for these changes. The new
   fingerprint is `d44ebd6e2c776b9b`. The notice's words don't change: it says nothing about search or the
   checks, and no service is added. So `NOTICE_REVIEW.reviewedFor` can be stamped after the reread; the stamp
   is left to the coordinator and the owner. P6f isn't triggered.
