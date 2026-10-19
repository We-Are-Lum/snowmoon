# DRAFT: "Record your own takes" v1, self-hosted (option c): host, terms, Privacy and consent lines

Branch `record-takes`, 2026-10-19. Drafted by the coding agent for the owner's reread. Nothing here is in
`src/lib/legal.ts` or `config/consent.json`. The feature is switched off (`TAKES.enabled = false`). Migration 0016 is
a draft and hasn't been applied.

**Owner's decision (2026-10-19):** option (c), "Run Chatterbox ourselves on a serverless GPU host whose terms forbid
using our data … Raw audio never stored." fal.ai is no longer used for takes.

## The host: Modal

**Why Modal:** its current terms forbid training on what customers send.

Quoted from modal.com/legal/terms ("Effective May 2026"; earlier versions are from October 2025 and March 2024):
- **§5.5:** "Modal will not, except with Customer's prior written consent: (i) train any AI model using Customer Data, or (ii) export Customer Data into, or cause Customer Data to be ingested by, large language models."
- **§1.8:** "Customer Data" shall mean "any data, information or other material provided, uploaded, or submitted by Customer to the Service in the course of using the Service."
- **§1.11 and Schedule 2:** Modal "may collect and use Service Metrics for its own business purposes", used "in an aggregate and/or permanently anonymized manner", and collected "only in aggregate, de-identified form which is not linked specifically to Customer or any individual". These are usage metrics, not the recordings.
- **The Data Processing Addendum's Schedule 1** lists personal data in requests as a category it processes, so recordings fall under the DPA.

**The other hosts considered:**

| Host | Training terms | Why not chosen |
|---|---|---|
| Replicate | Its privacy policy reportedly promises inputs and outputs aren't used to train its models. | Only third-party summaries were found; the primary text wasn't checked. |
| RunPod | No contractual no-training clause found; a 2024 sales sheet says "no data usage", but that isn't a term. | No contractual promise found. |
| fal.ai | Its terms allow "Usage Data" derived from inputs to be used for its models. | That's why (c) was chosen. |

**Price:** Modal's T4 GPU is $0.000164 a second, and the Starter plan includes $30 a month free.
- A warm 15 s take is about 3–6 s of GPU, about **$0.001**.
- A cold start (the model loads) adds about 30–40 s, about **$0.007**.
- We reserve $0.01 per take. The free cap is $2 a day across everyone, so at least 200 takes a day.
- These timings are estimates. The first real run will measure them.

## How it runs

- `modal/chatterbox_vc.py` is one POST endpoint, on a T4, scaled to zero after 2 minutes idle. Our server is the only
  caller, with a shared key.
- The model is Chatterbox voice conversion (ResembleAI/chatterbox, MIT), with its weights baked into the image at
  build time.
- **Our server sends:** the person's recording, and the character's voice as already published with the version (read
  from this deployment's own files).
- **It returns:** the converted take, and the GPU seconds it took.
- **The recording on Modal:** it's held in memory and, because the model reads files, in the container's temporary
  directory for the seconds the conversion takes. Both files are deleted before the answer is sent. Nothing is logged,
  kept in a volume, or sent anywhere else.
- **On our side:** the recording is never written to storage, the database or a log. Only its sha256 goes into the
  take's recipe, marked `kept: false`. test:takes checks this with a marker and fails if it's stored.
- **Watermark:** every converted take carries Resemble AI's Perth implicit watermark, applied by Chatterbox's own code.
  The recipe says so.

## To switch it on (owner's steps, one at a time)

1. Create a Modal account on the Starter plan, then log in on this Mac (`modal token new` opens the browser).
2. The coding agent runs two commands:
   - `modal secret create snowmoon-takes SNOWMOON_TAKES_KEY=<random>`
   - `modal deploy modal/chatterbox_vc.py`

   It then runs one real test conversion of a published take (about $0.01) and measures cold and warm times.
3. Set `MODAL_TAKES_URL` and `MODAL_TAKES_KEY` in Vercel production.
4. Reread the lines below. Apply migration 0016 (dry run first). Set `TAKES.enabled = true`.

**To check at deploy:** the `chatterbox-tts` version pinned in the Modal image (0.1.2). Confirm it, or pin it to the
revision the cut used (config/models.json), before the first deploy.

## Privacy (src/lib/legal.ts), drafted

**§4, kept when you sign in:**
> Takes you record and convert: the converted take, in the character's voice, with the line it belongs to, your name, its recipe and when you made it; and how many you make each day, to count the daily limit. Your own recording is not kept: only a fingerprint (a sha256) of it, in the take's recipe.

**§6, what you publish:**
> A take you convert is public at once, at its link and with its line, in the character's voice, with your name, labelled as AI-converted.

**§7, a new item:**
> Modal, where we run the open-weight voice model ourselves, receives your recording and the character's published voice when you convert a take, and returns the take. The recording is held only for the seconds the conversion takes and then deleted; Modal's terms forbid it to train any AI model on what we send.

**§9:** add "takes" to the work you can hide yourself, once hiding takes is built (D-takes-2, still open).

## Consent own-words-v5, the takes paragraph

> If you record a take, your recording is converted into the character's voice by an open-weight model we run ourselves on Modal, which may not train on it. Only the converted take is kept: public at once, with your name, labelled as AI-converted, under the same licence as your words. Your recording itself is never kept or published.

## Still open
- **D-takes-2:** hiding takes in v1.
- **D-takes-3:** whether takes use the Farcaster score bar, the same gate as Pictures and Remix (as built).
- **D-takes-4:** should one recording be convertible into more than one character's voice? (As built, it's always the
  line's own speaker.)
