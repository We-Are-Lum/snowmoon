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
| B2–B7 Build | Built overnight 2026-11-20 against a stub ElevenLabs, switch off; morning changes (remove a draft, private storage, the purge). `npm run test:voice`: 101 checks pass. |
| Migration | `supabase/migrations/NEXT_ephelion_voice.sql`: costs, asks (purged daily), drafts, draft audio keys (audio in private storage), the remove function. Tested in PGlite on top of every migration, twice, plus planted faults. **Ready for the coordinator to test; not applied (Nate applies).** |

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

## Overnight build (2026-11-20, unattended)

Built on `ephelion-voice`, against a stub ElevenLabs (`scripts/lib/elevenlabs-stub.ts`). No ElevenLabs call was made and
nothing was spent: the key isn't there, and in the local tests a real call is refused by the code.

**Where it is:** `/storyboard/record`. It is the site's usual "not found" for everyone, admins included, until
`VOICE.adminTrial` (src/lib/config.ts) is turned on in a reviewed commit; `VOICE.open` (everyone) waits for the reread
Terms and Privacy. Locally, `VOICE_TEST_ON=1` turns the admin trial on, never on Vercel.

**What it does:**
1. **Consent:** the own-voice-v2 screen (DRAFT wording, with Nate's fixes), agreed once per wording; then a tick for each
   recording ("Send this recording to ElevenLabs, once…"), unticked by default.
2. **Pick a voice:** the twelve previews stand in, grouped by brief, each playing the letter's opening from our media
   host.
3. **Record:** the whole speech (c13-b64, title to sign-off), the words scrolling at a pace you set (90–190 words a
   minute), a level meter, up to 5 minutes. The recording is a Blob in the tab; it can be played back or deleted there.
4. **Convert, then check:** sent once (the tab drops it as it is sent), converted with speech-to-speech, the history
   item deleted at ElevenLabs, then the converted audio is transcribed with word timings and checked word for word.
   Mismatched sentences show what wasn't heard and what was heard instead.
5. **Redo one sentence:** record just that sentence, convert, check it alone; the player joins it into the take.
6. **Accept:** keeps a private draft (the converted take plus any redone sentences, with where each goes) and its
   recipe: provider, closed model, model, settings, output format, the preset and its Voice Design recipe, the sha256 of
   each raw take and each converted file, whether each history item was deleted, the word check, the consent's
   sha256. **Discard** is the default: leaving the page before Accept keeps nothing (the browser asks first).
7. **Ready-made reading:** text-to-speech of the speech's written words in the chosen preset, made once per speech and
   preset by an admin, then playable by anyone let in.
8. **Farcaster on the web:** the record step says "Recording doesn't work in Farcaster on the web. Open this page in
   the Farcaster app on your phone, or in a browser at snowmoon.party/storyboard/record." (as in #195).
9. **Costs:** every call reserves its worst case, then settles, in `studio.voice_costs` (daily totals, no person), in
   credits and dollars; the caps are placeholders in `VOICE.caps`. Nate's standing rule is enforced by the code too:
   once a day's measured credits are over 1.2× their estimates, every call is refused until the next UTC day.
10. **Models:** `config/models.json` lists speech-to-speech (`eleven_multilingual_sts_v2`), transcription
    (`scribe_v1`), text-to-speech (`eleven_multilingual_v2`) and Voice Design (`eleven_ttv_v3`): closed, by ElevenLabs,
    each with what ElevenLabs keeps. P3b now counts them as in use.

**Tests:** `npm run test:voice` (89 checks: the switch, the speech and word check, the consent, convert, transcribe,
redo, accept, forged and tampered files refused, no raw take anywhere in the database, drafts private to their person,
the reading, costs, caps, the per-person limit, the 20% stop, a failed call, the allowlist, P1h).
`npm run check:voice-proof`: P1h on its own: the real flow passes and all 8 planted violations are caught, each by the
run as well as statically (a log of the take, a storage write, a transcription of the take, a skipped history delete,
the take not zeroed, transcription without the converted-audio check, the take in the signed record, the take in a cost
entry). `check:principles --only=P1`: P1h and P1i pass, and their planted faults fail (P1c, P1e, P1g need a database;
P1d needs a running server).

**check:ui** (run once at the end, as asked, load 2.4, on this branch's local build with an empty throwaway database,
no sign-in): **did not pass.** It broke on `/references/designs?tab=characters` ("didn't go quiet": a prefetch of
/references/glossary still open after 30 s), and before that reported two problems: `/challenge/make` at 390 light and
1440 dark show no "Make it" button, and the build was one commit behind the checkout (the later commit changed only the
voice page and the stub). None of those pages is touched by this branch; an empty database with no challenge data and
no sign-in is the likely cause, but I haven't proven it. It needs a re-run against a preview with the real database
before any merge. The voice page itself isn't in check:ui (a 404 everywhere while the switch is off).

### Choices made overnight, and why

| # | Choice | Why |
|---|---|---|
| 1 | The page is `/storyboard/record`, not `/record` | It is the storyboard challenge's first step; `/record` was the old Modal plan. |
| 2 | Two switches, both off: `adminTrial` and `open` | "Off in production, admins only until Nate opens it": the admin trial is its own reviewed commit, so not even admins reach it before Nate's word; `open` waits for the legal texts. |
| 3 | Nothing stored before Accept: each step hands the tab a signed record (HMAC) | Matches "discard is the default if they leave", and Accept can't be handed a recipe we didn't make. It uses `VOICE_TICKET_SECRET`, or `IMAGES_TICKET_SECRET` under its own label, so Nate needn't add another key. **OK'd by Nate, 2026-11-20.** |
| 4 | ~~Accepted audio is stored in the database~~ Moved to private storage on Nate's word (2026-11-20 morning): see "Morning, 2026-11-20" | |
| 5 | A redone sentence is kept as its own file, with the time range it replaces; the browser joins them to play | No audio editing on the server (no encoder on Vercel); the recipe stays exact: each take's sha256, each converted file's. |
| 6 | Accept is allowed with sentences still not matching; they are listed in the recipe (`check.unmatched`) and the page warns | A transcription can mishear a correct reading; the person judges, and the recipe says so. **Kept, Nate 2026-11-20** (for the private draft; the publish rule is below). |
| 7 | The words scroll at a pace the performer sets, not by listening | Following the voice live would mean sending the take somewhere while recording. |
| 8 | Consent: the screen once per wording (`contributor_consents`, kind `voice_recording`); the per-recording tick is kept only in an accepted draft's recipe | "Only if they agree for that recording" without storing anything about a discarded attempt. |
| 9 | The speech is the whole block: title, letter and sign-off | Word for word means the whole text; the team's speeches replace it. |
| 10 | The reading is made by an admin, once per speech and preset | It is project content and costs credits; a remake needs `again`. |
| 11 | Credits measured from ElevenLabs' header when sent, else from the account's usage before and after (that read is free) | The 20% rule needs measured numbers; the header's name is unconfirmed until a real call. |
| 12 | A take's length for the estimate is never less than its size could hold at 320 kb/s | So a short claim can't slip past the cap. |
| 13 | The twelve previews play from the review page's R2 copies | No new public files tonight. When Nate has listened and the review page is deleted, the pick list goes quiet until his picks get their own files. |
| 14 | With the real API, a preview that isn't a saved voice can't be used | ElevenLabs converts into saved voices only; the stub takes the preview's id. |
| 15 | Transcription model `scribe_v1` | The price list names v2/v3; the id is confirmed at the first real call (one line in config). |
| 16 | Funding: admins' calls count as `admin`, apart from `free` | As the chapter pictures do. |

### Screenshots

**https://media.snowmoon.party/review/c3d18998cf958415bb32976341fb20b6/index.html**: 36 screenshots, nine steps, each
on phone (390 px) and desktop (1280 px), light and dark (a review page on R2, deleted once Nate has looked). Made
against this branch's local production build with the stub, a throwaway local database and Chromium's fake
microphone (a tone; the stub says one word of sentence 4 wrong, so the check and the redo show). Steps: consent; pick a
voice; the ready-made reading and Record; recording with the words scrolling; the take in the tab with its tick;
converted and checked; redo one sentence; redone, all matching; accepted, with the Recipe. Not shown: the Farcaster web
client's message (it needs the Farcaster web host to appear; its words are in #195 and in the page).

Found while taking them, and fixed: after a failed word check the page had no way to ask again ("Check the words
again" added); the stub's audio was larger than a real MP3 and hit the 4.5 MB request limit (the stub now answers
8 kHz audio).

### What's left

- **First real call** (after the key, the reread and Nate's word on spending): confirm the transcription model id, that
  speech-to-speech takes the browsers' WebM/Opus and MP4 audio, the `history-item-id` and credit headers, and
  measured credits against the estimates (the 20% rule).
- **Saving the picked voices** (after Nate picks): their `voiceId`s into `config/voice-presets.json`, and the picked
  previews' own files on the media host.
- **Deleting an accepted draft**: not possible yet (studio_writer can't delete, by design); a "remove" that hides it is
  the next small step if wanted.
- **P1h's text in docs/principles.md** matches the new checks; both wait for Nate's reread.
- Publishing a draft, the timeline and shots: later slices.

## Morning, 2026-11-20: Nate's notes, and what changed

**1. The publish rule (plan for the publish slice; nothing publishes yet).** A private draft may keep sentences that
don't match. A published entry must either match the speech word for word, or show plainly, on the entry itself, which
sentences differ (from its recipe's `check.unmatched`, with the speech's words beside what was heard). The publish
slice builds this; the recipe already records what it needs.

**2. The ticket secret under its own label:** OK (choice 3).

**3a. Removing a draft: proposed and built as a delete limited to the person's own unpublished draft, not a tombstone.**
- Why a delete: a draft is a recording of someone's voice performance that was never published. A tombstone would keep
  the audio after they asked for it gone; nothing needs the rows once it's removed (the day's cost totals have no person
  in them and stay).
- How: "Remove this draft" on the page (with a confirm) calls `DELETE /api/voice/drafts/<id>`. The server deletes the
  draft's audio files from private storage first, then the rows, through one database function,
  `studio.delete_voice_draft(id, fid)`, that removes a draft only if that person made it and it is unpublished
  (`published_at` is null; the publish slice sets it). studio_writer still can't delete voice rows any other way.
- What happens to the audio: deleted from the private bucket (every file under `voice-drafts/<draft id>/`). If a file
  delete fails, the rows stay and the page says to try again, so a retry finishes it; nothing is left half-removed.
- Tested: someone else's draft and a published draft can't be removed (404, nothing deleted); its person's removal
  leaves no row and no file; its audio route then reads as missing; a second removal reads as missing. The migration's
  read-back checks the same as studio_writer.

**3b. Draft audio moved out of the database into private storage.** The private R2 bucket (`R2_PRIVATE_BUCKET`, the one
hidden images already use, which has no public address), under `voice-drafts/<draft id>/<n>-<sha256>.mp3`. The
database keeps only the key, size and sha256 (no audio column at all). Served only through the signed-in route, to the
draft's own person (readings: to anyone the switch lets in). In the local tests a folder stands in.
Size per take, at the MP3 we ask for (128 kb/s, 16 KB a second): **1 minute ≈ 0.96 MB, 2 minutes ≈ 1.9 MB** (3 minutes
≈ 2.9 MB); a redone 10-second sentence adds ≈ 160 KB; a 2-minute reading ≈ 1.9 MB.
Assumption to confirm: production's `R2_PRIVATE_BUCKET` and its key are the ones hidden images use (names only; I
didn't look at Vercel's settings).

**3c. Privacy §4 (DRAFT, for reread):** the daily-counts line adds voice conversions, and says the count is deleted the
next day; the drafts item says a draft can be removed. Wording in `docs/legal/ephelion-voice-draft.md`. Built:
`voice_asks` rows from before today (UTC) are purged at most once an hour, when the voice page or a voice request is
next used, as Minpentai's daily counts are; studio_writer may delete only those rows (a row policy). Gap, as with
Minpentai: if nobody uses the voice pages for days, old rows wait for the next use.

**4. Migration:** `NEXT_ephelion_voice.sql` now has the storage keys (no audio bytes), `published_at`, the remove
function and the purge policy. Run locally on top of every migration, twice, cleanly; its read-back passes and catches
two planted faults (a remove without the owner check; a purge that takes today's rows). `npm run test:voice`: 101
checks pass. **Ready for the coordinator to test.**

**5. check:ui with the real database (planned, not run until Nate says).** A preview won't do: previews have no
database or session settings at all (found 2026-11-01), and check:ui has no way past Vercel's preview sign-in. So the
options are local, on this branch's production build, one run at load under 8, holding the heavy lock:
- **(a) Recommended: the production database through a read-only role.** A role that can only select (say
  `studio_ui_reader`: usage on `studio`, select on its tables, nothing else), made by Nate with a short SQL I'd draft
  (dry run, migration, read-back as usual), and its address put by Nate in a separate env file only this run reads (no
  other production setting). Read-only by the database itself: a session setting isn't enough, because the transaction
  pooler ignores settings sent at connect (src/lib/db.ts). Pages that write (consent, a like) fail there, which
  check:ui's signed-out run doesn't do.
- (b) The local rehearsal database (it holds Nate's own data and is never reset): no production access at all, but it
  may be out of date with production.
Either way, the voice page stays a 404 (switch off): the run checks that nothing else broke. It also breaks a house
rule ("no server on .env.local"), which is why (a) uses its own file with only the read-only address. Nate picks (a)
or (b) and says when.

**6. First real calls (when the key appears in `.env.local`):** one of each kind, with the shortest test clip, from a
local script (not the site), each measured against its estimate before the next:
- convert: a 3-second clip of my own making (a generated tone or a text-to-speech line of the book's words, never a
  person's voice), into a saved preset voice once Nate has picked; estimate 50 credits (1,000 a minute);
- transcribe: that call's converted audio; estimate: unknown in credits ($0.20 an hour, so ≈ 0 to 1 credit);
- reading: the shortest sentence of c13-b64 ("With regards,": 13 characters); estimate 13 credits.
Credits read from ElevenLabs' header when sent, else from the account's count before and after. If any call costs more
than 20% over its estimate, I stop before the next and report. Total ≈ 65 credits.

## What Nate needs to do (one at a time)

1. (Nate, this morning) The merge word for PR #195, then the iPhone and desktop tests; Android goes to Garance or Luis.
2. (Nate, this morning) Pick one preview per brief, or none (link under B1).
3. (Nate, this morning) ElevenLabs training off; say when it's done (the bracketed line stays until then).
4. (Nate, this morning) The key in `.env.local` and Vercel as `ELEVENLABS_API_KEY`; then I make the three test calls (6).
5. Reread: the rule, own-voice-v2, P1h/P1i, the Privacy and Terms lines.
6. Speech length and plan size, then the caps in credits (B7; the build has placeholders).
7. Apply `NEXT_ephelion_voice.sql` when the branch is ready to merge (the coordinator tests it first; it takes its number
   at merge).
8. Say when to run check:ui with the real database (5).

## Principles

- **P1 (recipes; raw voice takes):** pass on the build, with one concern raised. Every accepted draft's recipe names the
  provider, closed model, model, settings, preset (with its Voice Design recipe), and each raw take's sha256, never the
  take. P1h (DRAFT) passes on the real code, and its 8 planted violations are each caught; P1i passes. Concern,
  unchanged: the proof covers our server, not what ElevenLabs keeps; training stays on until Nate turns it off.
- **P2 (AI declared; text unaltered):** pass. Every voice on the page is labelled AI, with the model and "a closed model
  by ElevenLabs"; the speech is c13-b64 word for word (test W), marked Book, Stand-in and Invented (performing it).
- **P3 (allowlist; closed reported):** pass, reported. The four ElevenLabs models are on `config/models.json`, closed, by
  ElevenLabs, with what each keeps; P3b counts them as in use.
- **P4 (nothing published without a person's action):** pass. Accept keeps a private draft; nothing publishes.
- **P6 (no third-party requests from pages):** pass by design. The page calls only our API and our media host; every
  ElevenLabs call is from our server. (check:ui's request count on this page isn't run: the page is a 404 on any real
  server while the switch is off.)
- **P5, P7, P8:** not touched.
- New tension: the stand-in previews live on the review page's R2 copies; deleting that page (after Nate listens) silences
  the pick list until his picks get their own files.

