# 001: The owner's change of approach

Date: 2026-10-05. Given to the coding agent (Claude Code). Verbatim.

```text
Change of approach. Models build structure and images. People write
every published word.

1. Revise docs/adaptation-format.md. Each beat now has:
   - who: the characters present
   - wants / in the way / cost / what changes
   - context: block IDs, with a note where something is invented
   - book lines: verbatim candidates from the cited blocks, for
     the writer to use or ignore
   - image and lettering, as before
   - narration: empty until a person writes it, max 25 words
   - dialogue: empty until a person writes it
   Models never write narration, dialogue, or published
   description.

2. Rework adaptations/dog-dawn/script.md into this format. Remove
   every narration line you wrote. Keep the verified book lines as
   candidates only. Fill in the cost for each beat, marking it as
   invented where the book is silent.

3. Add to principle 2: published words are the author's or a
   signed-in person's. Add a check that fails if a beat's narration
   or dialogue has no human author recorded.

4. Show me the structure and stop. Once I approve it, generate the
   images. Narration audio waits until I have written the lines.
```

What the agent did: revised the format, rewrote the script as structure only
(no narration or dialogue; 45 candidate book lines, each checked verbatim),
added `P2c` and the verbatim and length checks. The narration lines from the
first draft (commit `ac67138`) were removed from the script; they remain in
git history on this branch.
