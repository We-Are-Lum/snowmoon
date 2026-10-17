# own-voice-v1 (draft, not approved)

Drafted by the coding agent on 2026-10-13 from the owner's terms of the same
day. Nothing records agreement to it until the owner approves the wording; it
then moves into `config/consent.json` as a version of kind `own_voice`, and
its sha256 is recorded with each agreement, as for `own-words`.

Agreed once per performer, before their first take is converted. A performer
who isn't signed in (a friend recording offline) agrees in writing, and the
signed copy's sha256 is recorded instead; the copy stays private.

## Line

Your converted voice is public and GPL-3.0. Your own recordings are never released.

## Title

Your performance, in a character's voice

## Text

1. You record lines from a script. Each recording is converted into a
   character's voice, and only the converted line is published.
2. The converted line is public and permanent, licensed GPL-3.0 like
   everything in this edition. Anyone may copy, edit and adapt it, including
   converting it again into another voice.
3. Your own recordings are never published or released. They stay on the
   device that recorded and converted them, in a private folder, and are not
   uploaded to the project's repository or storage. A hosted service is used
   for a recording only if you agree to that for that recording.
4. Each converted line's public recipe names the model, its settings, the
   character's reference clip, and a fingerprint (sha256) of your recording.
   The fingerprint shows which recording was used; your voice can't be
   recovered from it.
5. A converted line can keep your timing, phrasing and delivery, though not
   your voice. You're credited as its performer by your Farcaster name (or
   the name you give), unless you ask not to be named.
6. You can ask for a line to be hidden from view, like any other contribution.
   Copies others have already made may remain.
7. You must not perform a voice that imitates a real person.

## Notes for the owner

- Point 5 says the converted voice isn't yours. That is the intent; conversion
  replaces timbre but keeps prosody. Test 1 will show how much of you comes
  through, and the wording can be tightened after it.
- Crediting performers by default (point 5) is my addition; the terms you sent
  didn't say. Strike it if you'd rather credit "performed by a person" only.
- Point 6 follows `docs/removal.md` as for written contributions.
