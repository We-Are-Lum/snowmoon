# Keeping takes (the take on the device, the converted take kept at once): final texts (reread by Nate, 2026-11-22)

Branch `voice-keep-takes`, 2026-11-22. DRAFT: drafted by the coding agent (Claude, a closed model by Anthropic), reread
by Nate on 2026-11-22 with his own changes ("reread, with these changes: …"), and in this branch word for word as below.
Terms: no change (Nate, 2026-11-22).

What it describes, as built on this branch:

- The raw take stays on the performer's device, in this browser's IndexedDB (`snowmoon-voice-takes`), under the
  signed-in FID and the speech, until they press Remove or record that speech again (or the browser clears it). It is
  sent to the server only when they press Convert. Another sign-in on the same browser neither sees nor converts it.
- The conversion route converts the take, transcribes the converted audio (never the take), and keeps the converted
  speech as the person's private draft before it answers, as one job kept alive past the reply, so leaving mid-conversion
  loses nothing. It stores only the converted audio (P1h; planted faults that hand it the take, or save a draft any other
  way, are caught).
- "Use this one" keeps a take with its redone sentences as a further draft. Remove deletes a draft, audio and all.

## own-voice-v3 (`config/consent-own-voice.json`, now current; v2 and v1 kept on file, retired)

Title: Your performance, in a character's voice

Line: Your converted voice is public and GPL-3.0. We never publish or keep your recording.

1. You record a speech. Your recording is converted into a character's voice, and only the converted speech can be published.
2. We never publish or keep your recording. It stays on your device, in this browser's storage, until you remove it or record again; your browser may also clear it. It is sent to be converted only when you press Convert.
3. To convert it, we send your recording to ElevenLabs, only if you agree for that recording. ElevenLabs stores what it receives in the United States and may keep it under its own privacy policy (elevenlabs.io/privacy-policy). We ask it to delete each conversion and its transcript right after, though its own logs may still keep it. Our account is set so it doesn't use them to train its models.
4. The converted speech is then sent to ElevenLabs to be transcribed, so it can be checked word for word against the speech.
5. We keep each converted speech as your draft as soon as it comes back, until you remove it. Once you publish it, it is public and permanent, licensed GPL-3.0 like everything in this edition. Anyone may copy, edit and adapt it, including converting it again into another voice.
6. Each converted speech's public recipe names the voice, the model, its settings, and a fingerprint (sha256) of your recording. The fingerprint shows which recording was used; your voice can't be recovered from it.
7. A converted speech can keep your timing, phrasing and delivery, though not your voice. You're credited as its performer by your name here, unless you ask not to be named.
8. You can hide a speech you published, like any other contribution. Copies others have already made may remain.
9. You must not perform a voice that imitates a real person.
10. Record only your own voice, never someone else's recording.
11. You must be at least 18 years old.

(Points 2 and 5 are Nate's 2026-11-22 text; the rest is v2 unchanged.)

## Privacy

**§3 (Kept on your device only.), as it now reads in full** (`src/lib/legal.ts`):

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a speech you record, until you remove it or record again, or your browser clears it (it is sent to us only to be converted, and we keep only its fingerprint, never the recording), a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, the Bluesky handle you last signed in with, to fill it in next time, and a payment you have sent but not yet seen credited. If you choose a closed model for a challenge picture, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; with each such picture we receive only that you confirmed, and don't keep it. These stay on your device, except that the assistant sends the chapter you're reading, as a number, with each question, so it can answer “where was I”; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

**§4, the speeches item, in full:**

> Speeches you record: each converted speech, in the character's voice, kept as your draft as soon as it comes back, until you remove it or publish it, with its recipe (the voice, the model, its settings and a fingerprint of your recording). Never your recording. You can remove a draft you haven't published; it is deleted, audio and all.

The Privacy reread key is now `mzoagf` (it was `adecw7`), recorded with Nate's words in `src/lib/legal.ts`.

## The raw-recordings rule (`docs/principles.md`), its "In practice" sentence

> In practice: the take stays on the performer's device, in the browser's storage, until they remove it or record again, and
leaves it only when they press Convert; the site's server passes it to ElevenLabs without writing it to the database,
storage, disk or a log, keeps only its sha256, and keeps the converted speech as the performer's private draft (owner,
2026-11-22, reread).
