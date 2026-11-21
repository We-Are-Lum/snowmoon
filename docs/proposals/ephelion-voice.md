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

## Afternoon, 2026-11-20: the key, the first real calls, round 2 of the voices

**The key** is in `.env.local` and Vercel (restricted: Text to Speech, Speech to Speech, Speech to Text, Voices read,
History write, User; 100,000 credits per refresh period). Nothing the slice calls was refused: no permission missing.

**The first real calls** (`scripts/voice-first-calls.ts`, one each, measured before the next; a ready-made library
voice, "Roger" (premade), for testing only, never a preset, never published; the input a 1.6-second clip made on this
Mac with macOS's own text-to-speech reading "With regards, Lord Ephelion.", no one's voice):

| Call | Estimate | Measured (ElevenLabs' character-cost header) | Rate |
|---|---|---|---|
| Convert (`eleven_multilingual_sts_v2`), WebM/Opus in, MP3 out | 28 | **18 credits** for 1.625 s | **≈ 11.1 credits a second (≈ 665 a minute)** |
| Transcribe (`scribe_v1`), the converted MP3 | 1 | **0 credits** | 0 in credits; it sends a dollar-cost header instead |
| Reading (`eleven_multilingual_v2`), "With regards," | 13 | **6 credits** for 13 characters | **≈ 0.46 credits a character** |

None was over its estimate. History: each generation was deleted right after, and reading it back answered "A history
item with ID … was not found on the server", and it isn't in the account's recent history. Confirmed too: speech-to-speech
takes WebM/Opus as Chrome records it; the transcription model id `scribe_v1` works, with word timings (it heard "With
regards, Mortifelian": a name can be misheard, which is what the word check and "Redo this sentence" are for).
Caveat: one short sample each; convert may round per second or per clip. The code's estimates now use these rates
(`VOICE.rates`), and the 20% rule re-checks every call.

**Caps at the measured rates** (placeholders still, for Nate): a full take is about 665 credits a minute, so 1, 2 and 3
minutes cost ≈ 665, 1,330 and 1,995 credits (≈ $0.12, $0.24, $0.36). The placeholder daily pool of 20,000 credits is
about fifteen 2-minute takes; the key's 100,000 a period is about 75. A reading of c13-b64 (2,141 characters) ≈ 985
credits.

**Voices, round 2** (Nate's own four briefs; not British: American, or a light Russian accent; warm, professional,
persuasive because he sounds reasonable): made once each, `eleven_ttv_v3`, seed 2020, three previews each. Measured:
**1,512 credits, 378 a call** (one per character of the line; under the ≈ 720 estimate). **Listen:**
https://media.snowmoon.party/review/161f656a64a8e8f7c7ad4cb26b23703a/index.html. Round 1's page is deleted (Nate:
none chosen); its presets stay in `config/voice-presets.json` for the record, marked not-chosen, and are no longer
offered. Waiting for Nate's picks.

**#195** merged (f04cece1) after its build passed on the merge result; `/admin/mic-test` is live (a 404 to everyone but a
signed-in admin). Live checks: check:shipped, check:miniapp pass; check:principles 73 pass, only P6d (accepted).

**Fixed today:** the daily-count purge compared a timestamp with a bare date, which Postgres reads in the session's time
zone: west of UTC, between midnight UTC and local midnight, today's counts were purged as yesterday's. Production's
database runs in UTC, so it wouldn't have shown there, but it was wrong; dates are now compared as UTC dates on both
sides (migration, code, tests), and the migration passes in UTC and in Pacific time.

## Nate's iPhone Safari test (2026-11-20), and the plan for the recording page

Result: "FAIL: browser. NotAllowedError: The request is not allowed by the user agent or the platform in the current
context, possibly because the user denied permission." Production sends no Permissions-Policy or Feature-Policy header
for /admin/mic-test or the home page, none is set in next.config.ts, src/middleware.ts or vercel.json, and a header
set in Vercel's dashboard would show in the response: nothing of ours blocks the microphone. NotAllowedError on iPhone
Safari usually means the site's (or Safari's) microphone setting is Deny, or an earlier "Don't Allow".

The mic-test PR (branch mic-test-link) adds, DRAFT wording in `src/lib/mic-help.ts`: on NotAllowedError, one plain line
for the browser in use (iPhone Safari: "Tap aA in the address bar, then Website Settings, set Microphone to Allow, and
reload the page. If it's already set to Allow, check Settings › Apps › Safari › Microphone."; Mac Safari; Chrome; the
Farcaster app; any other browser), and the summary line says whether a permission prompt was shown, where the browser
reports the permission's state (before and after asking).

**Plan for /storyboard/record:** the recorder's refusal message becomes the same line from `src/lib/mic-help.ts` (once
the mic-test PR is on main and this branch merges main), shown under Record, with the same "prompt shown" detail kept
out of the page (it's a test aid) but logged nowhere.

## The picks (Nate, 2026-11-20) and the first full reading

**Picked:** Warm lecturer 1 (first choice, the default), Warm lecturer 3, Russian 1. Saved as voices in the account on
2026-11-21: **saving cost 0 credits** (the count didn't move) and took one voice slot each: **22 of 30 used, 8 left**.
The site's key can read all three. Their voice ids are their preview ids (GJNXe6evoJS9rblaWDwx, oO59DHjG1nW3K9foHiWR,
fdoGbz5eU4VUde5iMQYV).

**Presets** (`config/voice-presets.json`): only the three picks are offered now, in Nate's order, each with its recipe
(brief, model eleven_ttv_v3, seed 2020, the preview chosen, the saved voice). Rounds 1 and 2's unpicked previews stay in
the file for the record and are refused. Proposed names in the picker (no real people's names; Nate to change):
1. **Warm lecturer** (the default)
2. **Warm lecturer, second voice**
3. **Light Russian accent**

**The stand-in reading:** c13-b64 in Warm lecturer 1 only, all 2,141 characters, 2:24. Estimate 985 credits; measured
**942** (header); the history item was deleted and is confirmed gone. On the listening page:
https://media.snowmoon.party/review/161f656a64a8e8f7c7ad4cb26b23703a/index.html (its recipe in
`reading-warm-lecturer.recipe.json` beside the audio, kept privately). No readings in the other two until the team's
speeches exist. Made outside the site with `scripts/voice-reading-once.ts` (the site's reading route needs the
migration, not applied yet).

**The listening page** stays until Nate says Garance has heard the three; then the unpicked previews are deleted from
it.

## Rule for /storyboard/record: never block Record on a host check (Nate, 2026-11-21)

In one Farcaster host, `sdk.context` or `sdk.getCapabilities()` never answered, and the microphone test's Record stayed
disabled (fixed in #202: every host check gets 2 seconds; no answer is logged and treated as unknown). The recording page
has the same risk today: its recorder waits for `inMiniApp()` and `sdk.getCapabilities()` before getUserMedia, and the
Farcaster-web check waits for `sdk.context`. **Plan** (when this branch takes main in, to get `src/lib/host-timeout.ts`):
- every host call through `withTimeout` (2 s for checks; 10 s for the app's own microphone prompt);
- Record is never disabled by a host check: an unknown host is treated as "maybe the app";
- with the capability unknown inside the app, ask `requestCameraAndMicrophoneAccess()` if the SDK has it, then
  getUserMedia either way;
- on NotAllowedError, the line from `src/lib/mic-help.ts` (as planned above);
- the Farcaster-web message only when the host does answer `platformType: 'web'`.

## Overnight 2026-11-21 (unattended)

Spent: **127 of the 300 credits** (one conversion of a 10.3 s synthetic clip, 113; four transcriptions, 14). Synthetic
clips only (macOS's own text-to-speech reading the book's words), no one's voice. Nothing over its estimate.

### 1. Names in transcription

| Transcription of the same converted clip | Heard | Credits | Dollars (fiat header) |
|---|---|---|---|
| `scribe_v1` | "Dreadnought", "Lord Aphelion" | 3 | $0.00055 |
| `scribe_v2` | "Dreadnought", "Lord Aphelion" | 3 | $0.00055 |
| `scribe_v2` + keyterms | "Dreadknot", "Lord Ephelion" | 4 | $0.00073 |
| `scribe_v3` + keyterms | "Dreadknot", "Lord Ephelion" | 4 | $0.00073 |

- **Key terms are enough.** The site now uses `scribe_v3` (ElevenLabs' recommended model) with each speech's names as
  `keyterms` (c13-b64: Lord Ephelion, Ephelion, Dreadknot, Veridia, Arctic Empire). ElevenLabs prices key terms 20–25%
  higher (its two pages disagree: "an additional 20% surcharge" and $0.05 an hour on $0.20).
- **And a backstop in the word check:** the speech's listed names are matched by sound (a rough sound key, 1–2 sounds
  of difference allowed by length), so "Lord Aphelion", "Mortifelian" and "Dreadnought" count as the names, and each
  is listed on the page ("Names heard by sound: Aphelion as Ephelion") and in the recipe (`check.bySound`). Only listed
  names: an ordinary word still needs its spelling ("taxes" heard "Texas" fails), and a different word fails ("Lord
  Venice").
- **Forced Alignment** (not needed, not used): POST /v1/forced-alignment takes the audio and the text and returns each
  word's start and end; "Same rate as the Speech to Text API" ($0.20 an hour); up to 10 hours of audio. ElevenLabs' docs
  don't name the key permission it needs; the key's permission list (Text to Speech, Speech to Speech, Speech to Text,
  Voices read, History write, User) has no entry for it, so Nate would add whatever the dashboard calls it.
- **Transcription is billed in credits too**, on a longer clip: 3 credits for 10.3 s (the 1.6 s clip rounded to 0),
  with the same amount in dollars in a `fiat-cost-before-overages` header. Rate in config: 0.4 credits a second with
  key terms.

**Found and fixed: ElevenLabs writes a conversion's history item after it answers.** Tonight's immediate delete got
"not found"; the item, which also holds a transcript of the input, appeared a moment later in the account's history.
I deleted it (confirmed gone). The site now retries the delete while it isn't there yet (after 1, 3 and 6 seconds;
P1h has a new planted fault for dropping the retries, caught), and `scripts/voice-history-sweep.ts` lists and deletes
any of our conversions or readings left in the account's history (run tonight: none in 48 hours).

### 2. This morning's notes

Already built on 2026-11-20 (morning) and re-verified tonight: removing one's own unpublished draft (now with its
storyboard and kept pictures too, files included), draft audio in the private bucket served only through the signed-in
route, and the voice_asks purge with the DRAFT Privacy §4 line. The schema is in `NEXT_ephelion_voice.sql`; its local
tests pass on top of every migration, twice, in UTC and Pacific time, with planted faults caught.

### 3. Slice 2: the storyboard, against stand-ins

`/storyboard/board/<draft>`, from "Make the storyboard" on a performance draft. Admins only, behind the same switch.
- **Cuts:** the accepted take's word timings (the take with redone sentences spliced in) are a strip of sentences.
  Cuts are proposed at sentence ends about every 8 seconds, by a rule (no AI model). The person drags a cut, taps the
  strip to add one at the nearest word's end, or taps × to remove one; "Use the automatic cuts again" resets.
- **Shots, one at a time:** the speech's words in it (labelled Book), the person's own description (a
  PublishedTextField), a camera angle (8), a style and characters from the published sheets. "Make the picture", "Try
  again", "Keep this one", next.
- **Pictures:** stand-in cards tonight (no model, no cost), drawn on our server, in the picture flow's shape: bytes,
  sha256, a signed record, a recipe whose prompt is the person's words word for word, then the camera and the sheets'
  own texts. Nothing is stored until Keep; a kept picture goes to the private bucket under `voice-boards/<draft>/`.
- **Notes:** rule checks only: three shots in a row from one angle, a shot over 15 s or under 2 s, no description, no
  camera, no picture kept. They never say what a shot should show.
- **Play-through:** the kept pictures over the joined audio; a shot with no picture shows its words.
- **Saves** are versions (new rows only). Removing the draft removes them.
- **P2:** nothing writes a description or story words: there is no route or function that produces one, the tests
  check that every proposed shot starts empty and that a picture can't be made without the person's own words.

**Choices tonight, and why**

| # | Choice | Why |
|---|---|---|
| 17 | Cuts and notes by rule, not by an AI model | "The assistant proposes cuts and notes only"; rules can't write story words, cost nothing, and are predictable. A model can propose later, labelled. |
| 18 | Transcription `scribe_v3` with keyterms | v1 and v2 misheard the names; v2 and v3 with keyterms heard them; v3 is ElevenLabs' recommended model. |
| 19 | By-sound matching only for each speech's listed names | Broad sound matching would let real misreadings pass. |
| 20 | Stand-in pictures are cards that say what was asked | No spending, and nobody can mistake one for a picture. |
| 21 | A shot's description is kept up to 600 characters | Long enough for a shot, short enough for a prompt. |
| 22 | Storyboards are versions, never edited in place | As the rest of the edition: every choice can be traced. |
| 23 | Drafts kept before tonight can't get a storyboard ("record and accept again") | Their recipe has no word timings; tonight's Accept stores them. |
| 24 | History deletes retried for about 10 seconds in the request | The take's conversion is the one thing that must not linger; a sweep script backs it up. |

### Screenshots (slices 1 and 2)

**Newest (21 Nov, afternoon: the Model row, 3 pictures a shot, 12 shots, the picker's names):
https://media.snowmoon.party/review/2b2ed084c77266b4478bb508c7300744/index.html**. Before it,
https://media.snowmoon.party/review/608b48afbdf45515475a5530de061866/index.html: 60 screenshots, fifteen steps,
phone and desktop, light and dark, on a local build of this branch with the stand-in ElevenLabs, a throwaway database
and a fake microphone. Slice 2's steps: the strip with the automatic cuts; a shot being written (the description typed
by the test script, marked so); two stand-in pictures; one kept and the board saved; the notes; the play-through. Found
while taking them and fixed: the strip was sized by the recording's length, not the converted audio's, so the last
shot fell off the end. The earlier screenshot page (c3d1…) is superseded; it goes when Nate says he has looked.

The disk was full during the first run tonight (118 MB free of 460 GB): I deleted the `.next` build folders in three of
my own worktrees (live197, mic-link, mic-test; all merged or throwaway), leaving 3 GB. Not touched: #196's worktree,
anyone else's. The Mac needs a cleanup soon.

**check:ui** (run once, at the end, load under 8, on this branch's local build with the throwaway database): **did not
pass**, 3 problems: `/challenge/make` at 390 light and 1440 dark shows no "Make it" button (as on 20 Nov's local run),
and the Minpentai live page's layout check broke ("Invalid URL"). This branch touches neither page; the empty database
and local settings are the likely cause, not proven. ("See examples" in WebKit didn't run: WebKit isn't installed.)
Production's check:ui passed on 20 Nov at #195's merge. Before any merge of this branch: check:ui with the real
database, (a) or (b) above.

### Tonight: done, left, needs Nate

**Done:** names (key terms with scribe_v3; by-sound matching for listed names; measured), the history race fixed and a
sweep script, this morning's notes re-verified, slice 2 (strip, cuts, shots, stand-in pictures, keep, notes,
play-through, saves as versions, removal with the draft), tests (`test:voice`: 139 checks; `check:voice-proof`: 9 plants
caught), screenshots.

**Left:** a real picture model for shots (the stand-in has the same shape; that's a spending decision); the recording
page's host time limits and microphone help (planned above; this branch now has main's helpers); publishing a storyboard
(and the publish rule for unmatched sentences); deleting the superseded screenshot page.

**Needs Nate:** the reread (rule, own-voice-v2, P1h/P1i, Privacy and Terms lines, including tonight's nothing new);
picker names; caps; the migration (now with the board tables) for the coordinator to test, then to apply; check:ui with
the real database, (a) or (b); whether a picture model should replace the stand-in, and which.

## 2026-11-21, Nate's answers

1. **Migration:** the coordinator tested `NEXT_ephelion_voice.sql` on Postgres 16 with all 41 migrations (dry run clean,
   applies twice, read-back passes, privileges right, the Pacific-time purge right). Part D now refuses while any row
   exists in `studio.voice_drafts`, as 0043's undo does ("UNDO REFUSED: voice drafts exist; nothing is deleted"), and
   removes every voice table only when there are none. Tested both ways locally; the migration still applies twice
   cleanly in UTC and Pacific time. Since then it also has `studio.voice_board_asks` (item 5), tested the same way:
   **the coordinator should test this version again.**
2. **Picker names** (DRAFT for Nate's look): "Warm, measured (American)", "Warm, brighter (American)", "Light Russian
   accent".
3. **Caps for now:** a daily pool of 20,000 credits, 3 full takes per person per day (already the values; now noted as
   Nate's). Real numbers once the speeches' length is known.
4. **check:ui with the rehearsal database:** run on a **copy** of `~/snowmoon-rehearsal-db` (the original isn't touched:
   starting it from this branch would have applied 0040–0042 to Nate's rehearsal data, and check:ui might write), on
   this branch (07d8dcbe, load 2.2) and on main (f84252f5). **Both fail the same 2 checks and nothing else:**
   `/challenge/make` at 390 light and 1440 dark shows no "Make it" button. (Last night's "Invalid URL" break on the
   Minpentai live page is gone with real data: it was the empty database.) **Why:** the check opens
   `/challenge/make?from=<the first base in CHALLENGE.bases>`, production's base ids (e.g. bffc7b6a… for Zei); the
   rehearsal database seeds its own stand-in bases under other ids (`REHEARSAL_BASE_IDS`, used only with
   `CHALLENGE_REHEARSAL=on`), so the page finds no base and draws no button. Not a bug in the site or this branch: the
   check needs production's data, or a run in rehearsal mode. (Main's run started at load 17, over 8: my script printed
   the load but didn't wait. Its result matches the branch's, run at load 2.)
5. **Shot pictures through the challenge's picture code** (`src/lib/voice/shot-picture.ts`):
   - the Model row starts on GPT Image 2.5 Sunburst where OpenAI serves the person, FLUX elsewhere; FLUX and Gemini are
     offered; a closed model needs its maker's notice and the 18+ box (the challenge's own row and notice);
   - the person's description is the prompt's first part, word for word, so it needs the own-words consent (the site's
     consent screen shows when the server asks); then the camera, the sheets' texts and the site's picture rules;
     characters' sheet front views go as references;
   - the prompt check, the daily limits and the costs are `paidPicture`'s, as for the challenge (admins on the admins'
     pool);
   - at most **12 shots** (the automatic cuts stop at 12; a 13th is refused on save and on the strip) and **3 pictures a
     shot** (counted in `studio.voice_board_asks`; a 4th is refused);
   - **no real picture before Nate's word:** `VOICE.realPictures` is false, and while it is, the route refuses a real
     model before any call (tested). The tests and the screenshot run use stand-in cards through the same code;
   - nothing is stored until Keep; a kept picture (JPEG from a model, PNG for a stand-in) goes to the private bucket.
6. **Each speech carries its own label:** the stand-in c13-b64 is "Book" (with its block); the team's speeches will be
   "Invented, not from the book" with their writers. Shown with the speech and kept in every recipe.

## Plan: merging slices 1 and 2 behind the switch (not done; for Nate)

What would ship: everything on this branch, with `VOICE.adminTrial` **on** (admins only: Nate and Garance), `VOICE.open`
off, and `VOICE.realPictures` **off** (storyboard pictures refused). Nothing changes for anyone else: every voice page and
route stays a 404 to them. The legal texts describe what ships, so the reread lines go into `src/lib/legal.ts` in the same
merge.

**Order** (each step waits for the one before):
1. **Reread (Nate):** the rule in `docs/principles.md`, own-voice-v2 (with or without the bracketed training line, as
   Nate says), P1h and P1i, the Privacy §3, §4 and §7 and Terms §5 and §8 lines, the picker names. Nate says "reread".
2. **Wording into the branch:** the reread lines into `src/lib/legal.ts` (with the `ownerReread` keys recorded under his
   words and `LEGAL.effective` set to the merge day), `own-voice-v2` made `current` in `config/consent-own-voice.json`,
   the principles' DRAFT marks taken off where he reread, `VOICE.adminTrial: true` in one commit. Then the commit's file
   list and a clean tree are checked.
3. **Checks on the merge result** (main merged into the branch, clean tree): `npm run build`, `test:voice` (146),
   `check:voice-proof` (P1h, 9 plants), `check:principles` P1, P3, P6 locally; `check:ui` against a local build on a
   copy of the rehearsal database in rehearsal mode (once the check:ui branch is on main).
4. **Migration (Nate):** `NEXT_ephelion_voice.sql` numbered at merge (the next free number on main and production;
   0044 if nothing else lands first), applied by Nate: dry run, migration, read-back ("READ-BACK PASSED"). The
   coordinator has tested this version. The PR waits for "applied".
5. **Production settings (Nate):** `ELEVENLABS_API_KEY` is in Vercel already; `R2_PRIVATE_BUCKET` and its key are the
   ones hidden images use (to confirm by name). Training off in ElevenLabs (or the bracketed line dropped).
6. **Merge (Nate's word):** a merge commit, then wait for /api/version to show it.
7. **Live checks** from the merge commit: check:shipped, check:principles, check:ui (load under 8), check:miniapp; and
   by hand: every voice route answers 404 signed out and to a non-admin.

**What admins could try on production afterwards** (each real call measured; the 20% rule and the daily pool apply):
- /storyboard/record: the consent screen, pick one of the three voices, listen to the ready-made reading (made once,
  ≈ 985 credits), record the whole speech (c13-b64 stands in), convert (≈ 665 credits a minute), the word check with names
  by sound, redo a sentence, accept, remove a draft.
- /storyboard/board/<draft>: cuts, shots, descriptions, camera, sheets, notes, play-through. Pictures stay off
  (`VOICE.realPictures`) until Nate's word; with it, each picture is a challenge picture's cost.
- The Farcaster app: the microphone through the app's prompt (the time limits planned for the recording page should land
  first; see "Rule for /storyboard/record").
- The history sweep afterwards (`scripts/voice-history-sweep.ts`), to see nothing of ours is left at ElevenLabs.

**Before the switch opens to everyone** (later, separate): the Privacy/Terms lines for everyone, the open caps, the
publish slice and its rule for unmatched sentences, a check:ui on production data.

## Slice 4 (2026-11-21, stand-ins only; branch ephelion-publish, stacked on ephelion-voice)

Kept on its own branch, on top of this one, so the plan above for slices 1 and 2 and the migration the coordinator
tested stay as they are. Nothing spent, nothing merged.

- **Closing card** (section 4 of the board). Its words are set by the site from the recipe, never typed by the person or
  written by a model: the speech and its block (Book), who performed and storyboarded it (People), the voice conversion,
  the word check and each picture model by name and maker, "closed model" or "open model" (AI), "People did … AI did …
  No AI video.", and the not-affiliated line, with the snowmoon.party mark. Only the look is the person's: their own
  words prompt a background through the same picture flow as the shots (key `end`, no camera, 3 tries), and our server
  draws the text over it (sharp), so no model can change a word. "Name me" (on by default) or "a reader".
- **Publish** (section 5). The check lists what stands in the way, by rule: every sentence matching the speech word for
  word (the rule for unmatched sentences: accepting a mismatch is allowed, publishing it isn't; names heard by sound
  count, as the word check lists them), every shot with a description and a kept picture, the closing background kept,
  the board saved, and no stand-in cards outside a local test copy. Publishing copies the audio pieces, the shots'
  pictures, the background and the composed card to public storage under `storyboards/<id>/`, byte for byte, and stores
  the full recipe: the voice's (each raw take by sha256 only), every shot's words, camera and picture recipe, the
  closing card's words and credits, who did what. Not named: no FID or name in the public recipe. One function
  (`studio.publish_voice_board`) does it in one transaction; a published draft can't be removed or published twice.
- **Take down:** from the draft's page. Every public file is deleted, the page is gone, and it is a draft again.
- **The page:** `/storyboard/spoken/<id>` (`/storyboard/<id>` is Remix's). The play-through, the closing card at the end,
  the credits as text, "Recipe", "Save as a video".
- **Save as a video:** in the browser only: a canvas holds each shot's picture for its span, then the closing card for
  6 seconds, recorded with the joined audio by the browser's MediaRecorder (MP4 where the browser can, else WebM). In
  real time (a 3-minute speech takes 3 minutes), saved on the device, nothing uploaded, no AI video. Every frame has a
  corner label ("snowmoon.party · AI pictures · AI voice conversion", "stand-in cards" when they are, "draft" from the
  board), so a clip cut from it still says so. Also on the draft's board, so admins can try it before publishing exists.
- **The switch:** `VOICE.publish: false`. While off the publish route refuses and every spoken page is "not found";
  the local tests turn it on (`VOICE_TEST_ON`), stand-ins only.
- **Schema:** `NEXT_ephelion_voice_publish.sql` (after `NEXT_ephelion_voice.sql`): `voice_boards.closing`,
  `voice_publications`, the publish and take-down functions, and `delete_voice_draft` replaced so removing a draft
  also removes its taken-down publications' rows (a live one still blocks it; the undo restores the old one); dry run, migration, read-back (a realistic publication
  made, refused for someone else, for a stray file key, twice, then taken down), undo (refuses once anything was
  published). **Tested by the coordinator** on Postgres 16 after `NEXT_ephelion_voice.sql` (2026-11-21): dry run
  clean, applies twice, read-back passes, `voice_publications` select-only to studio_writer and closed to anon and
  authenticated, publish and take-down only through their functions, the undo refuses once anything was published and
  restores `delete_voice_draft` exactly. Applied after slices 1 and 2 are merged.
- **Legal (DRAFT):** Privacy §3, §4, §6 and Terms §8 lines in `docs/legal/ephelion-voice-draft.md`, under "Slice 4".
  own-voice-v2 already says publishing makes it public and that it can be hidden; nothing new there.

**Choices, and why**

| # | Choice | Why |
|---|---|---|
| 25 | A separate stacked branch and migration | The slices 1–2 merge plan and the tested migration don't move. |
| 26 | Unmatched sentences block publishing, not accepting | Story words stay the book's, checked word for word (P2); a draft can still be kept and redone. |
| 27 | The card's text drawn by our server over the picture | A model can't misspell or change a credit; the person still sets the look. |
| 28 | Stand-ins can't be published on Vercel | A placeholder card must never be public. |
| 29 | Public files copied at publish (not served from private) | The private bucket has no public address; a take-down deletes the copies. |
| 30 | Video made in the browser, in real time | No server video work, no upload, no AI video; works in current browsers. |
| 31 | `/storyboard/spoken/<id>` | `/storyboard/<id>` is already Remix's storyboards. |

**Screenshots and a saved video:** https://media.snowmoon.party/review/97b99d7a1096735ef24af1843d5ccd65/index.html
(22 steps, phone and desktop, light and dark, on a local build of this branch with the stub ElevenLabs, a throwaway
database, a fake microphone and stand-in cards; and the MP4 that "Save as a video" made in Chromium: 1280×720, H.264 and
AAC, 67 s, made in 70 s). Found from them and fixed: the closing background's own text showed through the credits (it
is now blurred and darkened, which also keeps any lettering a model draws from competing), the long title ran to the
edge, and with stand-ins only the card said AI made the pictures. The last fix's wording ("AI did the voice conversion
and the word check") came after the screenshots. Supersedes 608b… for slices 1–2.

**For Nate before `VOICE.publish`:** the reread of slice 4's lines; which public bucket holds `storyboards/` (the code
uses the readers' bucket, R2_BUCKET, at R2_IMAGES_PUBLIC_URL) and whether its key may write there; CORS on that host
for GET from snowmoon.party (the video draws the pictures and reads the audio from it); the migration applied; real
pictures switched on first (stand-ins can't be published).

## What Nate needs to do (one at a time)

1. #195 is merged and live: the iPhone and desktop tests on /admin/mic-test; Android goes to Garance or Luis.
2. ~~Picks~~ done; the picker's names (above): keep or change.
3. (Nate, this morning) ElevenLabs training off; say when it's done (the bracketed line stays until then).
4. ~~The key~~ done; the three test calls are done and measured (above).
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

