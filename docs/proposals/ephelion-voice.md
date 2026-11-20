# Ephelion storyboard, slice 1: voice presets, record, convert, accept (DRAFT)

Review page for branch `ephelion-voice`, 2026-11-19, from Nate's brief of the same day. Written by the coding agent
(Claude, a closed model by Anthropic). DRAFT until Nate approves it. Design: `snowmoon-storyboard-challenge-proposal.md`
(LUM project). Nothing here ships before Nate's reread; nothing merges without his word.

## Where it stands

| Step | State |
|---|---|
| Go/no-go: microphone test page | Built: `/admin/mic-test` (admins only; records into the tab, sends nothing). **Needs Nate's phone**, see below. |
| A1 ElevenLabs facts | Done, below, with links (read 2026-11-19). |
| A2 The rule | Drafted in `docs/principles.md` ("Recorded exception: raw voice takes"). |
| A3 Consent own-voice-v2, P1h, P1i | Drafted: `config/consent-own-voice.json` (`draft`; `current` stays v1), `docs/principles.md`. |
| A4 Privacy and Terms | Drafted: `docs/legal/ephelion-voice-draft.md`. Not in `src/lib/legal.ts`. |
| B1 Voice presets | Four briefs written (`config/voice-presets.json`). **No voice made: waiting for Nate's word on the cost.** |
| B2–B6 Build | Not started: waiting for the go/no-go. |
| B7 Costs | Migration drafted: `supabase/migrations/NEXT_voice_costs.sql` (tested in PGlite, twice, plus a planted fault). Cap proposed below. |

## Go/no-go: the microphone

What the documentation says (Farcaster Mini Apps, `sdk.actions.requestCameraAndMicrophoneAccess`,
https://miniapps.farcaster.xyz/docs/sdk/actions/request-camera-and-microphone-access):

- iOS: "Full support with domain-level permissions". Android: "Supported".
- **Web: "Camera and microphone access is not supported in web mini apps. The action will always reject on web
  platforms."** So the mini app opened from farcaster.xyz in a desktop or phone browser cannot record. The site itself
  (snowmoon.party in Safari or Chrome) is not affected.
- The SDK we ship (`@farcaster/miniapp-sdk` 0.3.0) has the action and the capability string
  `actions.requestCameraAndMicrophoneAccess`. The test page asks the app first, then opens the microphone.

Tested by the agent: headless Chromium (desktop) with a fake microphone records `audio/webm;codecs=opus`. Not tested:
every real device. That needs Nate (or Garance), on:

1. Farcaster app on iPhone, 2. Farcaster app on Android, 3. Safari on iPhone, 4. Chrome on Android, 5. Safari on Mac,
6. Chrome on desktop.

Each run ends in one line to screenshot: `PASS`, `RECORDED BUT SILENT` or `FAIL`, with where, the length and the format.

The page is on the branch only. To reach it from a phone, one of:
- **(Recommended)** merge a small PR with only the test page (`/admin/mic-test`: a "not found" for everyone but a
  signed-in admin; it sends and keeps nothing); or
- a preview with a Vercel shareable link Nate makes in the dashboard (the Farcaster app can't pass Vercel's sign-in).

## A1. ElevenLabs: what it keeps, trains on, allows

Read on 2026-11-19 from ElevenLabs' own pages. Quotes are short because of the reading tool: reread the live pages before
any is quoted in a legal text.

| Question | Answer | Source |
|---|---|---|
| What speech-to-speech and speech-to-text keep without Zero Retention Mode | Kept "in accordance with the Privacy Policy"; "Customers by default have history preservation enabled." Speech-to-speech results go into the account's history, which can be deleted by API (`DELETE /v1/history/{id}`), but "debugging and moderation logs may still retain data related to the generation." No period is stated: the privacy policy says "as long as necessary to provide you with our Services" and "We won't keep data we generate about your voice for longer than 3 years after your last interaction with us"; the DPA lets them delete self-serve content after 180 days of inactivity. | [Zero retention mode](https://elevenlabs.io/docs/resources/zero-retention-mode), [History list](https://elevenlabs.io/docs/api-reference/history/list), [History delete](https://elevenlabs.io/docs/api-reference/history/delete), [Privacy policy](https://elevenlabs.io/privacy-policy) (updated 9 Oct 2026), [DPA](https://elevenlabs.io/dpa) §9.2.2 (8 Apr 2026) |
| Is Zero Retention Mode Enterprise-only | Yes: "available to select enterprise customers"; `enable_logging=false` "may only be used by enterprise customers." | [Zero retention mode](https://elevenlabs.io/docs/resources/zero-retention-mode), [Speech-to-speech API](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert) |
| Do they train on it | Yes by default, on every plan but Enterprise: inputs and outputs are used to "research, build, train and improve our AI models". Opt-out on the account: "Improve the models for everyone"; "new data you submit to us won't be used to train our models." | [Privacy policy](https://elevenlabs.io/privacy-policy), [Help: is my data used](https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models) |
| Which plan allows this commercial use | Any paid plan: "All paid plans include a commercial license, provided you're not using Beta Services." The free plan "cannot be used for any commercial purpose." **The site's account is on Creator** (checked through the ElevenLabs connector: active, monthly). | [Help: can I publish](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform) |
| May we publish the converted audio under GPL-3.0 | Very likely yes (my reading, not a quote): "as between you and ElevenLabs, you retain all rights in and to your Output", usable "outside of the Services". ElevenLabs keeps a "perpetual and irrevocable" licence to it, and its use policy still applies. No term restricts output from Voice Design voices. | [Terms](https://elevenlabs.io/terms-of-use) (9 Oct 2026), [API terms](https://elevenlabs.io/elevenapi-terms) §4.1 |
| Where | "your personal information will be transferred to the United States for storage." Other regions are Enterprise-only. | [Privacy policy](https://elevenlabs.io/privacy-policy), [Data residency](https://elevenlabs.io/docs/overview/administration/data-residency) |
| Our duties as the app | "responsibility for compliance remains with you"; no end-user terms "more permissive than those that apply to you"; consent of anyone whose voice is in the input; 18+ for the account, and no recordings of anyone under 18. | [Use policy](https://elevenlabs.io/use-policy) (9 Oct 2026), [Creative terms](https://elevenlabs.io/creative-terms) §2, [Speech-to-text terms](https://elevenlabs.io/speech-to-text-terms) §3.1 |
| Limits | Speech-to-speech: under 50 MB and 5 minutes per request (the c13-b64 speech is about 2.5 min). Scribe: word-level `start` and `end` times. | [Voice changer](https://elevenlabs.io/docs/creative-platform/playground/voice-changer), [Speech-to-text API](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) |
| Input formats | Voice changer accepts M4A (what older iPhone Safari records) and WebM (listed under video); Safari 18.4+ and Chrome record WebM/Opus. Audio-only WebM to be confirmed with the first real call. | [Formats](https://elevenlabs.io/docs/help-center/product/core-capabilities/voice-changer/which-formats-can-be-used-as-the-input-audio-for-voice-changer), [WebKit 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) |

**What this changes in Nate's draft rule:** "ElevenLabs may keep it under its own privacy policy" is accurate, and needs
"in the United States". Two additions the facts allow: we delete each conversion from the history (true once built,
proven by P1h), and only the converted audio is transcribed. Training is the open point: **Nate can turn off "Improve
the models for everyone" in the account's Terms and Privacy → Data use.** Until he does, the consent can't say it isn't
trained on, and should say it may be.

## A2. The rule (in `docs/principles.md`, DRAFT)

> Raw recordings are never published or kept by the site. A performer's recording may be sent to ElevenLabs, only if
> they agree for that recording, to convert it into a character's voice. ElevenLabs may keep it under its own privacy
> policy, in the United States, and the performer is told so before recording. The site asks ElevenLabs to delete each
> conversion from its history right after, and only the converted audio, never the recording, is sent to be transcribed.

Changes from Nate's draft: "in the United States", and the last sentence. The Modal path stays in the repository, with
its proof running, but unused.

## A3. Consent own-voice-v2 (DRAFT)

Line: "Your converted voice is public and GPL-3.0. We never publish or keep your recording."

1. You record a speech from the book. Your recording is converted into a character's voice, and only the converted
   speech can be published.
2. We never publish or keep your recording. It stays in this tab until it is sent to be converted, once, and is gone
   when you leave or record again.
3. To convert it, we send your recording to ElevenLabs, only if you agree for that recording. ElevenLabs stores what it
   receives in the United States and may keep it under its own privacy policy (elevenlabs.io/privacy-policy). We ask it
   to delete each conversion from its history right away, though its own logs may still keep it. [Our account is set
   so it doesn't use them to train its models.]
4. The converted speech is then sent to ElevenLabs to be transcribed, so it can be checked word for word against the
   book.
5. If you accept it, we keep the converted speech as your draft. Once you publish it, it is public and permanent,
   licensed GPL-3.0 like everything in this edition. Anyone may copy, edit and adapt it, including converting it again
   into another voice.
6. Each converted speech's public recipe names the voice, the model, its settings, and a fingerprint (sha256) of your
   recording. The fingerprint shows which recording was used; your voice can't be recovered from it.
7. A converted speech can keep your timing, phrasing and delivery, though not your voice. You're credited as its
   performer by your name here, unless you ask not to be named.
8. You can hide a speech you published, like any other contribution. Copies others have already made may remain.
9. You must not perform a voice that imitates a real person.
10. Record only your own voice, never someone else's recording.
11. You must be at least 18 years old.

Kept from v1: public and GPL-3.0 (5), the sha256 recipe (6), credit (7), hiding (8), no real people (9), own voice
only (10), 18+ (11). Dropped: "stay on the device that recorded and converted them" and the Modal sentence (no longer
true). New: 2, 3, 4. Per recording: the "Convert" button carries the agreement for that recording (a box ticked each
time, unticked by default).

P1h and P1i (DRAFT): see `docs/principles.md`. P1h becomes a proof on our ElevenLabs route (no write, no log, history
deleted, transcription gets only the converted audio, planted violations caught); P1i says v2 is shown only by the
voice pages, only while P1h passes. The checks themselves are written in Part B.

## A4. Privacy and Terms

`docs/legal/ephelion-voice-draft.md`: Privacy sections 3, 4 and 7; Terms sections 5 and 8. Every line there is DRAFT.

## B1. Voice presets: four candidates, and their cost

`config/voice-presets.json`. All invented by this edition (the book gives only "Lord Ephelion, Arctic ambassador to
Veridia", c8-b17, and "Arctic Empire consul to Veridia", c13-b64). None American-accented, none imitating anyone:

| Preset | Brief, in short |
|---|---|
| Cold baritone | 50s, low smooth baritone, educated British; an unhurried diplomat, contempt in the pauses |
| Arctic, precise | 40s, light Scandinavian accent; flat, even, never raises his voice |
| Rally orator | 60s, slightly gravelly, Scottish; builds each sentence, drops to a near-whisper |
| Bright coach | late 30s, bright tenor, Australian; motivational warmth, hard edge on weakness |

Preview line: the first three paragraphs of c13-b64, word for word (378 characters).

**Cost to make them:** Voice Design is charged by the preview text's characters, and each call returns three
previews. Four calls × 378 characters ≈ **1,500 credits**, about 1% of the account's ~130,000 credits left this month
(153,004 limit, 23,019 used; resets 26 Nov). Saving the four picks uses 4 of the 11 free voice slots. In money, at
Creator's $22 for 121,000 credits, that is about **$0.27**. **Not spent: waiting for Nate's word.**

## B7. Costs and the daily cap (proposal)

Per call, on the Creator plan's credits (ElevenLabs' pages: speech-to-speech "1,000 characters per minute of processed
audio"; text-to-speech one credit per character on Multilingual v2; Scribe $0.20 an hour on the API):

| Call | For c13-b64 (≈2.5 min, ≈2,000 characters) | ≈ $ at $22 / 121k credits |
|---|---|---|
| Convert the whole take | ≈ 2,500 credits | $0.45 |
| Transcribe the converted take | ≈ 0.04 h | $0.01 |
| Redo one sentence (≈10 s) | ≈ 170 credits | $0.03 |
| Ready-made reading, per preset (made once, then kept) | ≈ 2,000 credits | $0.36 |

So one full try costs about $0.50, and the monthly allowance covers about 45 full takes after the presets and four
readings (≈ 9,500 credits). The overage price is not on ElevenLabs' pages.

**Proposed cap:** `VOICE.dailyCapUsd = 5` for everyone together (about ten full takes a day), plus 3 full conversions
per person per day; admins counted apart (`funded = 'admin'`) under their own `adminDailyCapUsd = 5`. Every call adds
its worst case to `reserved` first. Costs go in `studio.voice_costs` (no person, no request id, daily totals only).

## What Nate needs to do (one at a time)

1. Say how to reach the microphone test from a phone (merge the test-page PR, or a preview link), then run it on the
   six setups and send the six lines.
2. Say yes or no to spending ≈ 1,500 credits (≈ $0.27) on the four Voice Design candidates.
3. In ElevenLabs: Terms and Privacy → Data use → turn off "Improve the models for everyone" (or tell me to keep the
   consent saying it may be trained on).
4. Put the key in `.env.local` and in Vercel as `ELEVENLABS_API_KEY` (never in chat).
5. Reread: the rule, own-voice-v2, P1h/P1i, the Privacy and Terms lines.
6. The cap: $5 a day, 3 takes a person, or other numbers.

## Principles

- **P1 (recipes; the raw voice takes exception lives here):** touched. Pass so far: the drafted rule keeps the raw take
  out of everything published and kept; the recipe names preset, model, settings and the take's sha256. Tension, raised:
  P1h moves from a proof on our own code (Modal) to a proof on our route plus ElevenLabs' word about its side, which we
  can't check; and ElevenLabs trains on recordings by default unless Nate turns it off. Both are stated in the drafts.
- **P2 (AI declared; book text unaltered):** touched. The converted voice and the ready-made readings are AI-made and
  will be labelled so; the speech is the book's words, checked word for word; the presets and performing written texts
  aloud are this edition's inventions, marked so in `config/voice-presets.json`.
- **P3 (allowlist; closed models reported):** concern. ElevenLabs' models are closed. Nate chose them (2026-11-19).
  Before the build, `config/models.json` gets each model used (speech-to-speech, Scribe, text-to-speech, Voice Design),
  marked closed, by ElevenLabs; every recipe and label names it ("closed model"), and the switch opens only in the
  release whose Terms/Privacy name ElevenLabs (owner, 2026-10-18).
- **P4 (nothing published without a person's action):** pass by design: Accept keeps a private draft; publishing is a
  later step, the person's.
- **P6 (no third-party requests from pages):** to keep: every ElevenLabs call is from our server; preset previews and
  readings are served from our own media host, never from ElevenLabs' addresses.
- `check:principles` not run against a target: nothing live changed on this branch. New tension: none beyond the above.
