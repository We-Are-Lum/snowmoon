# Ephelion storyboard, slice 1: voice presets, record, convert, accept (DRAFT)

Review page for branch `ephelion-voice`, 2026-11-19, from Nate's brief of the same day. Written by the coding agent
(Claude, a closed model by Anthropic). DRAFT until Nate approves it. Design: `snowmoon-storyboard-challenge-proposal.md`
(LUM project). Nothing here ships before Nate's reread; nothing merges without his word.

## Where it stands

| Step | State |
|---|---|
| Go/no-go: microphone test page | PR #195 (only the test page). **Waiting for Nate's merge word**, then his phone. |
| A1 ElevenLabs facts | Done, below, with links (read 2026-11-19). |
| A2 The rule | Drafted in `docs/principles.md` ("Recorded exception: raw voice takes"). |
| A3 Consent own-voice-v2, P1h, P1i | Drafted: `config/consent-own-voice.json` (`draft`; `current` stays v1), `docs/principles.md`. |
| A4 Privacy and Terms | Drafted: `docs/legal/ephelion-voice-draft.md`. Not in `src/lib/legal.ts`. |
| B1 Voice presets | Four briefs, three previews each, made 2026-11-20 (2,878 credits). **Nate to listen and pick.** |
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

On Farcaster's web client the page says plainly that recording doesn't work there, and to open it in the Farcaster
phone app or a browser. Each run ends in one line to screenshot: `PASS`, `RECORDED BUT SILENT` or `FAIL`, with where, the length and the format.

The page is on the branch only. To reach it from a phone, one of:
- **(Chosen by Nate, 2026-11-20: PR #195)** merge a small PR with only the test page (`/admin/mic-test`: a "not found" for everyone but a
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

1. You record a speech. Your recording is converted into a character's voice, and only the converted
   speech can be published.
2. We never publish or keep your recording. It stays in this tab until it is sent to be converted, once, and is gone
   when you leave or record again.
3. To convert it, we send your recording to ElevenLabs, only if you agree for that recording. ElevenLabs stores what it
   receives in the United States and may keep it under its own privacy policy (elevenlabs.io/privacy-policy). We ask it
   to delete each conversion from its history right away, though its own logs may still keep it. [Our account is set
   so it doesn't use them to train its models.]
4. The converted speech is then sent to ElevenLabs to be transcribed, so it can be checked word for word against the
   speech.
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

**Made on 2026-11-20** (Nate's word: up to about 1,500 credits): one Voice Design call per brief, `eleven_ttv_v3`,
seed 1119, guidance 5, three previews each. **Listen and pick:**
https://media.snowmoon.party/review/e069b1fde988a10b4eaf26c984b6dac9/index.html (a review page on R2, deleted once Nate
has listened). Each preview's id and the sha256 of its mp3 are in `config/voice-presets.json`. Nothing is saved as a
voice until Nate picks: pick one per brief, or none.

**What it cost: more than estimated.** The account's credit count went from 23,019 (19 Nov) to 25,897 (20 Nov, right
after): **2,878 credits, about $0.52**, against the ≈1,500 (≈$0.27) I estimated and Nate allowed. That is about 720 a
call, nearly two credits per character of the 378-character line. If nothing else used the account between the two
readings, Voice Design on `eleven_ttv_v3` costs about twice what I assumed. I stopped there; no other call was made.

## B7. Costs and the daily cap, in credits (proposal)

ElevenLabs' own rates: speech-to-speech "1,000 characters per minute of processed audio" (credits, on our plan);
text-to-speech one credit per character (Multilingual v2). Scribe's cost in credits isn't on its pages ($0.20 an hour on
the API price list, so a few credits at most): it is measured on the first real call. Dollars below use Creator's $22
for 121,000 credits ($0.18 per 1,000).

**Per full take (convert the whole speech, then transcribe the converted audio):**

| Speech length | Credits (convert) | ≈ $ |
|---|---|---|
| 1 minute (≈ 150 words) | 1,000 | $0.18 |
| 2 minutes (≈ 300 words) | 2,000 | $0.36 |
| 3 minutes (≈ 450 words) | 3,000 | $0.55 |

**A redone sentence:** about 17 credits a second of the sentence: a 10-second sentence ≈ 170 credits ($0.03), plus its
transcription. Whether ElevenLabs rounds a short clip up (to a second, or more) is to be measured on the first call.

**Ready-made reading** (text-to-speech of a speech in a preset, made once per speech and preset, then kept): one credit
per character: a 1-, 2- or 3-minute speech is about 900, 1,800 or 2,700 credits per preset.

**How many full takes the credits cover:**

| Credits | 1-min takes | 2-min takes | 3-min takes |
|---|---|---|---|
| Rest of this month: 127,107 (153,004 − 25,897; resets 26 Nov) | 127 | 63 | 42 |
| A normal Creator month: 121,000 (pricing page; this month's 153,004 likely includes credits rolled over) | 121 | 60 | 40 |
| A Pro month: 600,000 ($99) | 600 | 300 | 200 |
| A Scale month: 1,800,000 ($299) | 1,800 | 900 | 600 |

Before the takes, subtract the readings: three speeches in four presets at 2 minutes ≈ 21,600 credits once.
Redone sentences and failed tries come out of the same pool. The overage price per 1,000 credits isn't on ElevenLabs'
pages.

**Proposed cap, in credits** (Nate decides after choosing speech length and plan): a daily pool for everyone
(`VOICE.dailyCapCredits`, for example 20,000 = ten 2-minute takes), 3 full conversions per person per day, admins
counted apart (`funded = 'admin'`) under their own pool. Every call adds its worst case to `reserved` first (the full
speech's length at 1,000 a minute). `studio.voice_costs` records credits and dollars as daily totals, with no person and
no request id.

## What Nate needs to do (one at a time)

1. Say how to reach the microphone test from a phone (merge the test-page PR, or a preview link), then run it on the
   six setups and send the six lines.
2. Listen to the twelve previews and pick one per brief, or none (link under B1).
3. In ElevenLabs: Terms and Privacy → Data use → turn off "Improve the models for everyone" (or tell me to keep the
   consent saying it may be trained on).
4. Put the key in `.env.local` and in Vercel as `ELEVENLABS_API_KEY` (never in chat).
5. Reread: the rule, own-voice-v2, P1h/P1i, the Privacy and Terms lines.
6. Speech length and plan size, then the daily pool in credits (B7).

## Principles

- **P1 (recipes; the raw voice takes exception lives here):** touched. Pass so far: the drafted rule keeps the raw take
  out of everything published and kept; the recipe names preset, model, settings and the take's sha256. Tension, raised:
  P1h moves from a proof on our own code (Modal) to a proof on our route plus ElevenLabs' word about its side, which we
  can't check; and ElevenLabs trains on recordings by default unless Nate turns it off. Both are stated in the drafts.
- **P2 (AI declared; book text unaltered):** touched. The converted voice and the ready-made readings are AI-made and
  will be labelled so; the speeches are the team's (c13-b64 stands in until they arrive), each take checked word for
  word against its speech; the presets and performing written texts aloud are this edition's inventions, marked so in `config/voice-presets.json`.
- **P3 (allowlist; closed models reported):** concern. ElevenLabs' models are closed. Nate chose them (2026-11-19).
  Before the build, `config/models.json` gets each model used (speech-to-speech, Scribe, text-to-speech, Voice Design),
  marked closed, by ElevenLabs; every recipe and label names it ("closed model"), and the switch opens only in the
  release whose Terms/Privacy name ElevenLabs (owner, 2026-10-18).
- **P4 (nothing published without a person's action):** pass by design: Accept keeps a private draft; publishing is a
  later step, the person's.
- **P6 (no third-party requests from pages):** to keep: every ElevenLabs call is from our server; preset previews and
  readings are served from our own media host, never from ElevenLabs' addresses.
- `check:principles` not run against a target: nothing live changed on this branch. New tension: none beyond the above.
