# Chat: which provider to pin behind Vercel AI Gateway

**Status:** for the owner to decide (2026-10-07). Not pinned: `CHAT.provider` is empty in
`src/lib/config.ts`, and until it is set the assistant tells readers it is unavailable.
Compiled by the coding agent from the gateway's public listings and each provider's own
pages; anything not confirmed on the provider's page is marked unverified.

The owner's conditions (principle 6, ask-about-the-book only): one pinned provider, zero
data retention (ZDR) required, both hops named in the notice, no message text stored or
logged.

## Recommendation: Groq

- **ZDR and no training** (gateway flags), and it is one of only **two providers that also
  serve the guard** (gpt-oss-safeguard-20b), so one provider covers both calls. The other is
  Amazon Bedrock.
- **Output room:** 32,768 tokens per reply on 120b, against Bedrock's 8,192; gpt-oss counts
  its reasoning as output, so 8k can cut answers short.
- **Price:** $0.15 · $0.60 per million tokens on 120b (Bedrock the same); $0.075 · $0.30 on the
  guard (Bedrock $0.07 · $0.20). At the measured $0.0006 a question the difference is about
  a tenth of a cent a day per heavy reader.
- **Speed:** first token ≈250 ms against Bedrock's ≈410 ms over the hour sampled.
- **Where:** Groq says customer data is kept in Google Cloud buckets in the United States;
  its data centres are in the US, Canada, Finland, Saudi Arabia and Australia, and which one
  serves a request is unverified. The notice would read: Vercel AI Gateway, then Groq.

Second choice: **Amazon Bedrock** (a name readers know, lowest guard price), but the AWS
region the gateway uses is unverified and its 8k output cap is real. **Baseten** is the
cheapest on 120b and the only one that can be pinned to the US, but it does not serve the
guard, which would break "one provider".

## What pinning does

`providerOptions: { gateway: { only: ["groq"], zeroDataRetention: true } }` on every call
(`src/lib/chat/provider.ts`). If the pinned provider is down, the gateway returns an error
and does **not** fall back; the reader sees "The model did not answer. Try again in a
moment." The reply names the provider that served it
(`choices[0].message.provider_metadata.gateway.routing`); the app records it in
`studio.chat_calls.provider` and refuses any reply from another provider.

Checked on 2026-10-07 with `zeroDataRetention: true` and nothing pinned: the gateway's
routing note read "8 attempts → 7 ZDR attempts", i.e. Cerebras (no ZDR) was left out.

## All providers for gpt-oss-120b (8 on 2026-10-07)

Prices are gateway prices per 1M tokens, input · output. "ZDR" and "Trains on data" are the gateway's flags (`has_zdr`, `has_no_training`). The gateway says a provider's ZDR status reflects Vercel's own agreement with it, which may differ from the provider's default policy.

| Provider (slug) | ZDR | Trains on data | $/M in · out | Context (max output) | Where it runs | Also serves safeguard-20b | Source |
|---|---|---|---|---|---|---|---|
| Baseten (`baseten`) | yes | no | $0.10 · $0.50 | 131,072 (131,072) | HQ San Francisco, US. Multi-cloud GPU pool, and the regions are not published. **Only 120b endpoint that supports gateway `inferenceRegion` (`us`)** at the same price | no | gateway endpoints JSON; [baseten.co/deployments/baseten-cloud](https://www.baseten.co/deployments/baseten-cloud) (HQ/DC: secondary sources, unverified on provider page) |
| Amazon Bedrock (`bedrock`) | yes | no | $0.15 · $0.60 | 128,000 (**8,192**) | HQ Seattle, US. AWS regions offering the model: us-east-1, us-east-2, us-west-2, eu-central-1, eu-north-1, eu-south-1, eu-west-1, eu-west-2, ap-northeast-1, ap-south-1, ap-southeast-2/3/4, sa-east-1, us-gov-west-1. **The AWS region the gateway uses is unverified** (no `inference_regions` on the endpoint) | **yes**: $0.07 · $0.20, 128k ctx, 16k out, ZDR yes | gateway JSON; [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-oss-120b.html) |
| Cerebras (`cerebras`) | **no** | no | $0.35 · $0.75 | 131,072 (131,000) | HQ Sunnyvale, US. DCs in Santa Clara, Stockton, Dallas, Minneapolis, Oklahoma City (US), Montreal (CA), with Europe planned | no | gateway JSON; [Cerebras press release](https://www.cerebras.ai/press-release/cerebras-announces-six-new-ai-datacenters-across-north-america-and-europe-to-deliver-industry-s) |
| Fireworks (`fireworks`) | yes | no | $0.15 · $0.60 | 128,000 (128,000) | HQ Redwood City, US. Infra in US, EU (Frankfurt, Iceland), APAC (Tokyo) per secondary source. Which one the gateway uses is unverified | no | gateway JSON; [docs.fireworks.ai/accounts/data-residency](https://docs.fireworks.ai/accounts/data-residency) (not read in full, so unverified) |
| Groq (`groq`) | yes | no | $0.15 · $0.60 | 131,072 (32,768) | HQ Mountain View, US (unverified on provider page). DCs in US, Canada, Finland, Saudi Arabia, Australia. Groq: "All customer data is retained in Google Cloud Platform (GCP) buckets located in the United States". Which DC runs inference is unverified | **yes**: $0.075 · $0.30, 131k ctx, 65k out, ZDR yes | gateway JSON; [console.groq.com/docs/your-data](https://console.groq.com/docs/your-data); [Groq community: regions](https://community.groq.com/t/what-geographic-regions-does-groqcloud-serve/833) |
| Nebius (`nebius`) | yes | no | $0.15 · $0.60 | 131,000 (131,000) | HQ Amsterdam, NL. Main DC Mäntsälä, Finland, plus other EU/US sites. The serving region is unverified | no | gateway JSON; [nebius.com newsroom](https://nebius.com/newsroom/nebius-to-triple-capacity-at-finland-data-center-to-75-mw) |
| Parasail (`parasail`) | yes | no | $0.10 · $0.75 | 131,072 (131,000) | HQ San Mateo, US. Aggregates GPUs from about 40 DCs in 15 countries, so location is **unclear** | no | gateway JSON; secondary sources only (unverified) |
| Together AI (`togetherai`) | yes | no | $0.15 · $0.60 | 128,000 (128,000) | HQ San Francisco, US (unverified). US DCs plus EU option for dedicated deployments. The serving region is unverified. 1-day uptime is 94.3%, the lowest | no | gateway JSON; [Together EU DCs](https://support.together.ai/articles/8079447813-eu-data-centers-and-dedicated-model-deployment) |

Notes:
- `gpt-oss-safeguard-20b` is served only by **Bedrock and Groq**, and both are ZDR yes and no-training.
- The model-level `regions: ["us"]` for 120b comes from Baseten alone. safeguard-20b has no `regions` field, so **a region cannot be pinned for the guard on any provider**.
- The quantization reported is fp4 for baseten, nebius, parasail and togetherai, and not stated for the others.
- Latency and throughput (gateway, last hour, 120b): Groq p50 252 ms TTFT at 471 tok/s. Bedrock 412 ms at 150 tok/s. Baseten 426 ms at 139 tok/s.

## Pinning and ZDR, from the docs

Field names come from the docs ([provider filtering](https://vercel.com/docs/ai-gateway/models-and-providers/provider-filtering-and-ordering), [ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr), [regional inference](https://vercel.com/docs/ai-gateway/security-and-compliance/regional-inference)). They go in the JSON body at top level as `providerOptions.gateway`. The docs say: "All options are set under `providerOptions.gateway` in the AI SDK, or under `providerOptions` in the REST API / OpenAI-compatible Chat Completions API". Every Chat Completions example uses `"providerOptions": { "gateway": { ... } }`.

```json
POST https://ai-gateway.vercel.sh/v1/chat/completions
{
  "model": "openai/gpt-oss-120b",
  "messages": [...],
  "providerOptions": {
    "gateway": {
      "only": ["groq"],
      "order": ["groq"],
      "zeroDataRetention": true
    }
  }
}
```

- `only` (`string[]`): "Restrict routing to only these provider slugs". `order` (`string[]`) sets priority, and with a single provider it is redundant.
- `zeroDataRetention: true` makes the gateway "route the request only through providers that have zero data retention agreements with Vercel AI Gateway". ZDR can also be turned on **team-wide** in the dashboard (Settings → Zero Data Retention). That costs $0.10 per 1,000 requests, while per-request ZDR is free. Both need the Pro or Enterprise plan. The two work as OR, so team-wide ZDR overrides `zeroDataRetention: false`.
- Optional: `"inferenceRegion": { "scope": "zone", "geoRegion": "us" }`. Only Baseten supports this today for 120b, and no provider supports it for safeguard-20b. If the region can't be honoured, the request fails with HTTP 400 `invalid_request_error`.
- Do **not** set `models` (model fallbacks) if the pin must hold.

**If the pinned provider is down, the gateway returns an error and does not fall back.** With `only`, the docs say "Only `bedrock` and `anthropic` will be considered for routing and fallbacks" and "If none of the specified providers are available for the model, the request fails with an error indicating the allowed providers." If ZDR leaves no provider, the docs show:
`{"error":"No ZDR (Zero Data Retention) providers available for model: ...","type":"no_providers_available","statusCode":400}`.
The exact status code for a runtime outage of the pinned provider (as opposed to a provider that was never eligible) is **unverified**. Treat any non-2xx as "unavailable" and show a retry message.

To verify which provider served a request, the response carries `provider_metadata.gateway` on each choice's message. Its `routing.finalProvider` field names the provider, and `routing.modelAttempts[].providerAttempts[]` holds each attempt, including `inferenceEndpoint.geoRegion` when a region was pinned. Log `finalProvider` to prove the pin held.

## Does Vercel keep the text?

- ZDR doc, "Vercel" section, quoted: "AI Gateway has a ZDR policy and does not retain prompts, outputs, or sensitive data. User data is immediately and permanently deleted after requests are completed. No action is needed on the user side." This holds by default and **covers Vercel's hop regardless of the ZDR flag**. The flag only filters providers.
- Request logs ([logs doc](https://vercel.com/docs/ai-gateway/observability-and-spend/logs)) hold metadata only: time, status, model, provider, token usage, cost, duration, auth key, inference region, a ZDR yes/no flag, and per-attempt routing. Routing details are kept 30 days, and the list goes back up to 36 days. No prompt or response text is listed among the fields. There is **no documented switch to turn the metadata logs off**, and none is needed for content.
- Trace drains ([doc](https://vercel.com/docs/ai-gateway/observability-and-spend/trace-drains)) are opt-in and paid. Quoted: "AI Gateway traces contain request metadata, but they don't include prompt or completion content." They do carry the `vercel.ai_gateway.user.id` and tags you attach, so avoid putting personal data in those.
- Location of Vercel's hop: quoted from the regional-inference doc, "your request can terminate and be processed in any Vercel region before AI Gateway forwards it to the provider. Region-pinned gateway hosts … are coming." So **Vercel's hop location cannot be pinned today**.
- Caveats: provider-side prompt caching "depends on the provider" whether it is ZDR-compliant. Providers may also keep requests flagged for abuse under their own policies, even with ZDR or a pinned region (regional-inference doc).
- Your own app's logging (Vercel Functions runtime logs) is separate from the gateway. Don't `console.log` prompts.
