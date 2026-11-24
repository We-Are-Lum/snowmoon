# Improvising: the Privacy and consent drafts (DRAFT, for Nate's reread)

Branch `voice-improv`, 2026-11-24. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT until Nate's
reread. In `src/lib/legal.ts` and `config/consent-own-voice.json` without any reread key or approval set: P6k and P1i
are red until he says "reread". They ship in the same release as improvising (legal texts describe today). Terms: no
change proposed.

## What changes, and why

- With improvising, an improvised take's transcript (scribe_v3, as the word check today) becomes its storyboard's words:
  shown under each shot, sent to the storyboard guide with the board, and published with the storyboard.
- The person may correct that transcript; each correction is kept in the draft's recipe (the words before, when, by whom).
- The transcript's words were already kept in the draft's recipe (the strip's word timings); the Privacy text didn't
  name them.

## Privacy §7, the Groq item

**Today:**

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which are
> checked against the published rules, and what you write to the storyboard guide, with the speech and your storyboard's
> choices; never your recording or your pictures.

**Proposed:**

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, the prompts for images you make, which are
> checked against the published rules, and what you write to the storyboard guide, with the speech, the words of your
> take as transcribed, and your storyboard's choices; never your recording or your pictures.

Source: `src/lib/voice/guide-server.ts` (`askGuide`: `sentences` are the spoken words, the performer's for an improvised
take).

## Privacy §4, the speeches item

**Today:**

> Speeches you record: each converted speech, in the character's voice, kept as your draft as soon as it comes back,
> until you remove it or publish it, with its recipe (the voice, the model, its settings and a fingerprint of your
> recording). Never your recording. You can remove a draft you haven't published; it is deleted, audio and all.

**Proposed:**

> Speeches you record: each converted speech, in the character's voice, kept as your draft as soon as it comes back,
> until you remove it or publish it, with its recipe (the voice, the model, its settings, a fingerprint of your
> recording, and the words of your take as transcribed, with any corrections you make to them). Never your recording.
> You can remove a draft you haven't published; it is deleted, audio and all.

Source: `src/lib/voice/keep-converted.ts` (`recipe.timeline.words`, `recipe.spoken`), `src/lib/voice/correct-words.ts`.

## The own-voice consent: own-voice-v4 (points 1, 4 and 7 change; the rest as v3)

1. **v3:** "You record a speech. Your recording is converted into a character's voice, and only the converted speech can
   be published."
   **v4:** "You record a speech, word for word or improvised around its theme in your own words. Your recording is
   converted into a character's voice, and only the converted speech can be published."
4. **v3:** "The converted speech is then sent to ElevenLabs to be transcribed, so it can be checked word for word against
   the speech."
   **v4:** "The converted speech is then sent to ElevenLabs to be transcribed. A take read word for word is checked
   against the speech; an improvised take's transcript becomes its storyboard's words, which you can correct, and is
   kept with your draft."
7. **v3:** "A converted speech can keep your timing, phrasing and delivery, though not your voice. You're credited as its
   performer by your name here, unless you ask not to be named."
   **v4:** "A converted speech can keep your timing, phrasing and delivery, though not your voice. You're credited as its
   performer by your name here, and for an improvised take as the author of its words, unless you ask not to be named."

A new version means everyone agrees once more before their next conversion (the screen is shown again).
