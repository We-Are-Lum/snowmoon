# Readers' images: test spending

Owner, 2026-10-08: cap test spending at $1. Enforced in code as `IMAGES.totalSpendCapUsd` (all
days together) in `src/lib/config.ts`, on top of `IMAGES.dailySpendCapUsd` ($2 a day). The totals
live in `studio.image_costs` (daily, no person). Every paid call made while building or trying the
trial is listed here.

| Date | What | Calls | Cost (USD) | Running total |
|---|---|---|---|---|
| 2026-10-08 | Building slice 1: no paid call (tests use stand-ins; fal.ai and Groq not called) | 0 | 0.0000 | 0.0000 |
