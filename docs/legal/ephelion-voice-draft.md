# Ephelion voice (record, convert, accept): Privacy and Terms lines (reread by Nate, 2026-11-21)

Branch `ephelion-voice`, 2026-11-19. Drafted by the coding agent (Claude, a closed model by Anthropic). Reread by Nate on
2026-11-21 ("reread: … the Privacy §3, §4 and §7 lines, the Terms §5 and §8 lines …") and now in `src/lib/legal.ts`, in
the release that turns the voice pages on for admins (the merge plan on the review page). The facts behind each line,
with links: `docs/proposals/ephelion-voice.md`.

The training sentence's square brackets are removed: Nate turned off ElevenLabs' training for the account (2026-11-21).

## Privacy

**Section 3 (Kept on your device only), add after "drafts of images you make until you publish them":**

> , a speech you record, until it is sent once to be converted (it is gone when you leave the page or record again)

**Section 4 (Kept by us when you sign in), a new list item after "Storyboards you save…"** (v2, 2026-11-20 morning:
removing a draft added):

> Speeches you record and accept: the converted speech, in the character's voice, as your draft until you publish it,
> with its recipe (the voice, the model, its settings and a fingerprint of your recording). Never your recording. You
> can remove a draft you haven't published; it is deleted, audio and all.

**Section 4, the daily-counts item** (Nate, 2026-11-20 morning). Today it reads: "How many images, sheet remixes and
Remix frames you make each day, to count the daily limits, and the reports you make." Proposed:

> How many images, sheet remixes, Remix frames and voice conversions you make each day, to count the daily limits, and
> the reports you make. The count of voice conversions is deleted the next day.

(True as built: studio.voice_asks rows from before today, UTC, are deleted when the voice page or a voice request is
next used after the day ends, at most once an hour, as Minpentai's daily counts are. If nobody uses the voice pages for
days, they wait for the next use. Section 4's last line already says "Deletions happen at the next routine clean-up, so they
can come a little later than stated." The other counts are not changed by this branch.)

**Section 6 (What you publish):** no change. A published converted speech is published work like any other.

**Section 7 (Outside services), a new list item after the fal.ai item:**

> If you record a speech and agree to send it: ElevenLabs receives your recording and converts it into a character's
> voice, then receives the converted speech to transcribe it. It receives nothing else about you. It stores what it
> receives in the United States and may keep it under its own privacy policy; we ask it to delete each conversion and its transcript
> right after. It doesn't use them to train its models. ElevenLabs also reads this edition's speeches aloud in
> the characters' voices, from their written words.

### Slice 4: publishing a storyboard (DRAFT, 2026-11-21; these ship only with VOICE.publish, never before)

**Section 3 (Kept on your device only), add:**

> , a video you save of a storyboard (it is made in your browser and never uploaded)

**Section 4, a new list item after the speeches item:**

> Storyboards for a speech you accepted: the cuts, your words for each shot and for the closing card, and the pictures
> you keep, as your draft until you publish it. They are removed with the draft.

**Section 6 (What you publish), add:**

> A storyboard you publish shows your converted speech (never your recording), your words for each shot and for the
> closing card, the pictures and its recipe, under your name here unless you choose not to be named. You can take it
> down: its public files are deleted, and it is your draft again. Copies others have made may remain.

(Section 7 needs nothing new: the storyboard's pictures go to the same picture services as the challenge's, already
listed, and the video is made on the device.)

## Terms

**Section 5 (What you add), add at the end:**

> If you record a speech, record only your own voice, and don't imitate a real person. Your recording is never published;
> the converted speech you publish is licensed GPL-3.0, like everything else you publish here.

**Section 8 (AI-made material), add "the characters' voices in storyboards" to the list of what AI models produce:**

> The narration, many pictures (every frame made in Remix among them), the characters' voices in storyboards and the
> assistant's answers are produced by AI models and are labelled as such.

**Section 8, with slice 4 (publishing), add:**

> A published storyboard's closing card lists who did what, people and AI apart; the site sets its words.

## About and the consent screen

- P6g–P6j need the same services named on About and in the consent: ElevenLabs is added to the About page's list with
  the Privacy line, and `own-voice-v2` names it (`config/consent-own-voice.json`).
- The age line stays as today (18 to sign in). ElevenLabs' own policy also requires 18+ for its account holder (us) and
  forbids recordings of anyone under 18; `own-voice-v2`'s last point covers the performer.

## What these lines don't say, on purpose (shortest true sentence)

- No retention period: ElevenLabs states none for speech-to-speech or transcription on our plan (its privacy policy says
  "as long as necessary", and voice data at most 3 years after the last interaction).
- No plan name, no Zero Retention Mode: it is Enterprise-only, and we don't have it.
- No daily cap: it is a setting that changes.
