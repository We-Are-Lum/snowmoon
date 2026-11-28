# Recording a passage of a speech (proposal, not built)

DRAFT. Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-27, from Garance's point 5 (via Nate,
2026-11-26): "Propose, don't build: a way to record just a passage of a speech, since a full 2–3 minute take is hard."

## The idea
On the Record step, before recording, the person can choose "Just a passage": tap the first and last sentence of a
run of the script (at least 3 sentences, or about 20 seconds; at most the whole speech). The highlight, the reading
line and the take's time limit then cover only those sentences. Everything else is as today.

## What it changes
- **The word check.** The take is checked against the chosen sentences only (`n` from the first to the last, in the
  speech's numbering, so a redone sentence keeps its number). Sentences outside the passage aren't expected and aren't
  counted as missed. "Word for word" means word for word for those sentences; an edited or improvised passage is
  "improvised" by the same rules as a whole take. The recipe keeps the passage as `{ from, to }` beside the speech id,
  so the check can be re-run.
- **Converting.** Cost follows the passage's length, as now (credits per second of the take).
- **Entries.** A passage of a speech is an entry of that speech, labelled "Passage: sentences N–M" on its card row, its
  page and its Share card. It counts as that person's one live take of the speech: entering a whole take later replaces
  the passage (after asking), and the reverse. At most one take per person per card stays as it is (P7); the card's
  "Latest take" can be a passage, with its label.
- **The database.** Nothing new is needed: the passage rides in the take's recipe (`speech.passage: { from, to }`), which
  the take's recipe check already allows. `publish_voice_take` would need no change. (If Nate wants a passage and a
  whole take of the same speech both live, that is a change to the one-live-take index, 0054: `(fid, speech_id)` would
  become `(fid, speech_id, whole-or-passage)`.)
- **Legal lines.** Privacy §4's take item says "the words of your take as transcribed"; a passage's words are those, so
  it stays true. One Privacy §4 addition would make it exact: "…and, for a passage, which sentences you chose". Terms §6f
  ("you can have one live take of each speech") stays true if a passage counts as that one take.
- **Screens.** A "Just a passage" switch beside "Edit text"; the script shows the chosen run with the rest dimmed; the
  countdown, states and redo are unchanged.

## Decisions for Nate
1. Does a passage count as the person's one live take of that speech (proposed), or can both be live?
2. A minimum length: 3 sentences, about 20 seconds, or none?
3. Should judging (if any) treat passages and whole takes the same, or apart?
