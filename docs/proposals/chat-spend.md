# Chat: test spending

Every paid model call made while proposing and building the assistant chat. The
cap for test spending is **$2.00** (owner instruction, 2026-10-07). Costs are
tokens × the gateway's published price; the gateway's own per-request cost was
recorded alongside and agreed to within rounding.

| Date | What | Model (via Vercel AI Gateway) | Calls | Cost (USD) |
|---|---|---|---|---|
| 2026-10-07 | No-writing red team, 30 prompts | openai/gpt-oss-120b | 30 | 0.00541 |
| 2026-10-07 | No-writing red team, 30 prompts | alibaba/qwen-3-32b | 30 | 0.00577 |
| 2026-10-07 | No-writing red team, 30 prompts | deepseek/deepseek-v3.1 | 30 | 0.01120 |
| 2026-10-07 | Output guard over 60 replies | openai/gpt-oss-safeguard-20b | 60 | 0.00479 |
| | **Running total** | | 150 | **0.02717** |
