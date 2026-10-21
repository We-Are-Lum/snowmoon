# 000: The owner's request

Date: 2026-10-05. Given to the coding agent (Claude Code). Verbatim.

```text
Build one narrated comic for the seed below. This is a single
adaptation, not a general comics system.

Seed: dog-dawn   (change this line to use another seed)

Step 1. Write adaptations/<seed>/script.md and stop.
- 8 to 12 panels, about 60 seconds of narration in total
  (roughly 130 to 150 words).
- For each panel: the narration line, a description of the image,
  any text drawn in the image (added in code, never by the image
  model), and the block IDs it draws on.
- Narration is in the first person, in the voice the brief
  suggests. Mark which lines are the book's words and which are
  new.
- Mark the script as AI-drafted and unapproved.
Show me the script and wait. I will edit it.

Step 2. After I approve the script:
- Generate one image per panel through the existing image job
  pipeline, with a recipe for each and the clean file kept. At
  most three attempts per panel. Keep one consistent look, drawn
  from the design boards.
- Generate the narration through the speech adapter, using a
  different voice from the house narrator. Check that voice's
  license first. Use the pronunciation table for Dzegoban.
- Record every prompt in the seed's prompts/ folder and fill in
  shots.md.

Step 3. Assemble:
- On /adaptations/<seed>, play the panels in time with the
  narration, reusing the existing player.
- Also render one video file of the same thing (panels and audio,
  simple cuts) at 1080p, so it can be posted.
- Show an AI use declaration on the page: what was generated, with
  which models, and what a person wrote or approved.

Report the total cost and stop. Do not publish the page until I
have watched it.
Script format, for this and every later adaptation. Each beat has:
- narration: describes the scene well enough to follow with the
  screen off
- dialogue: optional lines, each with a named speaker
- image: a description of the panel
- citations: block IDs

script.md is the single source. The comic, the audio, and later
video are all rendered from it, and each beat's duration comes
from its audio.

For this piece use one narrator voice and no character voices yet.

Also write docs/adaptation-format.md describing this format and
the four stages: narrated comic, audio drama with character
voices, animatic, video. Include a podcast feed as part of the
audio drama stage. Describe only. Build nothing beyond stage one.
```
