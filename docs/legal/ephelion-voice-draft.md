# Ephelion voice (record, convert, accept): Privacy and Terms lines (DRAFT, for Nate's reread)

Branch `ephelion-voice`, 2026-11-19. Drafted by the coding agent (Claude, a closed model by Anthropic). Nothing here is
in `src/lib/legal.ts` yet. It goes there only after Nate says "reread", and ships in the same release that turns the
voice pages on for anyone beyond admins (owner, 2026-10-18: legal texts describe today). While the switch is admins-only,
these lines stay in this file. The facts behind each line, with links: `docs/proposals/ephelion-voice.md`.

Square brackets mark a sentence that is true only after something Nate does (turning off ElevenLabs' training toggle on
the account). Drop it if he doesn't.

## Privacy

**Section 3 (Kept on your device only), add after "drafts of images you make until you publish them":**

> , a speech you record, until it is sent once to be converted (it is gone when you leave the page or record again)

**Section 4 (Kept by us when you sign in), a new list item after "Storyboards you save…":**

> Speeches you record and accept: the converted speech, in the character's voice, as your draft until you publish it,
> with its recipe (the voice, the model, its settings and a fingerprint of your recording). Never your recording.

**Section 6 (What you publish):** no change. A published converted speech is published work like any other.

**Section 7 (Outside services), a new list item after the fal.ai item:**

> If you record a speech and agree to send it: ElevenLabs receives your recording and converts it into a character's
> voice, then receives the converted speech to transcribe it. It receives nothing else about you. It stores what it
> receives in the United States and may keep it under its own privacy policy; we ask it to delete each conversion from
> its history. [It doesn't use them to train its models.] ElevenLabs also reads the book's speeches aloud in the
> characters' voices, from the book's words only.

## Terms

**Section 5 (What you add), add at the end:**

> If you record a speech, record only your own voice, and don't imitate a real person. Your recording is never published;
> the converted speech you publish is licensed GPL-3.0, like everything else you publish here.

**Section 8 (AI-made material), add "the characters' voices in storyboards" to the list of what AI models produce:**

> The narration, many pictures (every frame made in Remix among them), the characters' voices in storyboards and the
> assistant's answers are produced by AI models and are labelled as such.

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
