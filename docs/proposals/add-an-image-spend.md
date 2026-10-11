# Readers' images: test spending

> **Removed, owner 2026-10-09:** the $1 all-days cap (`IMAGES.totalSpendCapUsd`) is gone, with
> every use of it, when image making opened to everyone with a Neynar score of 0.7 or more. The
> $2 a day across everyone (`IMAGES.dailySpendCapUsd`) stays. The log below is kept as a record.

Owner, 2026-10-08: cap test spending at $1. Enforced in code as `IMAGES.totalSpendCapUsd` (all
days together) in `src/lib/config.ts`, on top of `IMAGES.dailySpendCapUsd` ($2 a day). The totals
live in `studio.image_costs` (daily, no person). Every paid call made while building or trying the
trial is listed here.

| Date | What | Calls | Cost (USD) | Running total |
|---|---|---|---|---|
| 2026-10-08 | Building slice 1: no paid call (tests use stand-ins; fal.ai and Groq not called) | 0 | 0.0000 | 0.0000 |
| 2026-10-08 | Local test of generation (step 4 prep), from a script on the build machine, not through the app: one Z-Image Turbo text-to-image (1024 × 576, request 01a11dfc-fb36-7c90-bbd6-ee77fd87e57b) | 1 | 0.0029 | 0.0029 |
| 2026-10-08 | Same test: one FLUX.2 [klein] 4B edit with that image as the reference picture (1024 × 576, request 01a11dfd-1810-7ca0-8baf-743a0242a1b3). fal lists $0.01 per megapixel; counted here on input and output, so at most | 1 | 0.0118 | 0.0147 |
