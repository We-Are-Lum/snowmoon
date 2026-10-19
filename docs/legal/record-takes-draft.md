# DRAFT: "Record your own takes" v1: research, Privacy and consent lines

Branch `record-takes`, 2026-10-19. Drafted by the coding agent for the owner's reread. Nothing here
is in `src/lib/legal.ts` or `config/consent.json`. The feature is off (`TAKES.enabled = false`), and
migration 0016 is a draft that has not been applied.

## Where Chatterbox voice conversion can run on a server

| Host | Endpoint | Price (seen 2026-10-19) | Custom target voice | Notes |
|---|---|---|---|---|
| fal.ai | `fal-ai/chatterbox/speech-to-speech` | **$0.015 per minute** of audio | yes, `target_voice_audio_url` | **Chosen.** We already have a key and it's already named in Privacy §7. Tested once (below). |
| fal.ai | `resemble-ai/chatterboxhd/speech-to-speech` | $0.02 per minute | yes | Resemble's hosted "HD" version. Its weights aren't stated as open. |
| Replicate | (none found for voice conversion) | — | — | Only text-to-speech variants are listed. |
| Self-hosted (Modal or similar) | ChatterboxVC (MIT) | GPU time | yes | No third party sees the recording at all. More work, and an idle cost or a cold start. |

**Cost per take:** a take is at most 15 s, so 0.25 min × $0.015 = **$0.00375** at most. The real test call, 4.2 s, was billed in our estimate at $0.00105. We reserve $0.015 per take, a full minute, in case fal rounds up.
- Free takes: the cap is $2 a day across everyone, so at least 533 takes a day.
- Wallet accounts: cost plus 30%, as for pictures.

### fal's terms, quoted (fetched 2026-10-19)

**What fal keeps** (fal.ai/docs/model-apis/data-retention):
- "Request inputs and outputs are stored in the platform for 90 days by default."
- The `X-Fal-Store-IO: 0` header controls "request-history payload storage only".
- "When a model generates output files, they are uploaded to the fal CDN." The `X-Fal-Object-Lifecycle-Preference` header sets how long they stay, and "Expired files are permanently deleted and cannot be recovered."

**What we send to limit that:**
- The recording goes *inside the request* as a `data:` URI. Nothing is uploaded to fal's CDN, and fal fetches nothing from us except the published target voice.
- `X-Fal-Store-IO: 0`, so fal keeps no request history.
- The converted file on fal's CDN expires after 600 s. We copy it at once.

**Training** (fal.ai/legal/terms-of-service):
- "Customer hereby grants Company a non-exclusive, non-sublicensable, royalty-free license to reproduce, use, access, store, and otherwise process any Customer Input to provide the Services."
- **But also:** "Usage Data", defined as "anonymized or aggregated data" that "may include data based on or derived from Customer Input", may be used "to design, develop, and offer Company products, services, and AI models".
- fal's privacy policy has no sentence about training on inputs.

**⚠ Decision for the owner (D-takes-1): voice recordings are personal data.** fal's terms allow anonymised or aggregated data derived from them to be used for fal's own models. We can't truthfully say "fal doesn't train on your recording". The options:
- **a)** Use fal and say what's true, as in the lines below.
- **b)** Ask fal for a zero-retention or no-training agreement first.
- **c)** Self-host ChatterboxVC, so no third party gets the recording.

The build works with (a). Moving to (c) changes only `src/lib/takes/convert.ts`.

### The one real call (2026-10-19)
- **Sent:** no human recording. The source was a take *already published* with version 1 (Bai's b2-8, the `bai-v3b` take, 52,760 bytes, m4a). The target was Zei's published voice for b1-1.
- **Result:** HTTP 200 in 3.0 s. A 4.2 s WAV, 24 kHz mono, speech (mean −31 dB). Request 01a15519-f7ad-7840-ab1d-d8cec6df63a3.
- **Cost:** about $0.001 by our estimate. fal's own bill hasn't been checked.
- **Confirmed:** fal accepts the recording as a `data:` URI.

## What the feature keeps

- **Kept:** the converted take, public with the maker's name at its link and on the line's list, as Remix frames are. Its recipe holds the model, endpoint, target voice (by sha256), length and cost, plus the recording's **sha256 only**, marked `kept: false`.
- **Never kept:** the recording itself. Not in storage, not in the database, not in any log. test:takes checks this with a marker, and fails if the code is changed to store it.
- **Counts:** one row per conversion per person per day (`take_asks`), and costs as daily totals with no person (`take_costs`).
- **The target voice** is the character's converted voice already published with the version. The private voice-sheet recordings ("never published") are not used.

## Privacy (src/lib/legal.ts), drafted lines

**§4, kept when you sign in, one item:**
> Takes you record and convert: the converted take, in the character's voice, with the line it belongs to, your name, its recipe and when you made it; and how many you make each day, to count the daily limit. Your own recording is not kept: only a fingerprint (a sha256) of it, in the take's recipe.

**§6, what you publish, appended:**
> A take you convert is public at once, at its link and with its line, in the character's voice, with your name, labelled as AI-converted.

**§7, the fal.ai item, extended:**
> fal.ai receives … and, when you record a take, your recording and the character's published voice, and returns your take in that voice. Your recording is sent inside the request, so nothing is uploaded to its storage; it is asked to keep no copy of the request, and its copy of the converted take is deleted after ten minutes. Under its terms, fal may use anonymised or aggregated data derived from what it receives to develop its services and models.

(The last sentence is needed under option (a). Remove it under (b) or (c).)

**§9, keeping and deleting:** add "takes" to the list of your own work you can hide yourself at once. Hiding isn't built in v1, so this waits for it. **Decision D-takes-2:** ship hiding with v1, or ship without it.

## Consent own-words-v5, a paragraph for recording

> If you record a take, your recording is sent to fal.ai to be converted into the character's voice, and only the converted take is kept: public at once, with your name, labelled as AI-converted, under the same licence as your words. Your recording itself is never kept or published. Under fal.ai's terms, anonymised or aggregated data derived from it may be used to develop its services.

## Still open
- **D-takes-1:** fal (a), an agreement with fal (b), or self-hosting (c). See above.
- **D-takes-2:** hiding takes in v1.
- **D-takes-3:** do takes need the Neynar score bar for Farcaster accounts? As built, they use the Pictures gate, the same as Remix.
- **D-takes-4:** should one recording be sendable to more than one character's voice? As built, a take is always in the line's own speaker's voice.
