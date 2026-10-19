# Speaking mouths: test edits on version 2's frames (candidates only)

**Not in any cut and not on the site** (owner's long run, 2026-10-19, item 5). Version 2's cut and frames are unchanged.

In version 2 (the GPT cut) every face is drawn with a closed mouth, so a character holds the same closed-mouth still
through their whole line. These are five test edits: the speaker's mouth open mid-word, and every other visible face
left closed. They were made with **GPT Image 2.5 Sunburst (OpenAI, a closed model)** through Vercel AI Gateway
(/v1/images/edits). The only picture sent was the frame itself, with a prompt drafted by the coding agent. All
pictures are AI-generated, not by the author.

- `speaking-shots.md` / `.json`: every shot of version 2 with a line over it (50 shots: 45 with the speaker's face
  visible, 5 with the speaker off screen). Columns: shot id, time, line, speaker, whether the speaker's face shows,
  who else is in frame, and the frame. Times are from the cut's timeline; line lengths come from the stems.
  Who is in each frame was read from the frames by the coding agent.
- `jobs.json`: the five edits chosen (close-ups and one mid shot, by how long the face is on screen speaking):

| edit | frame | speaker | shots (all of this frame's uses; the same speaker in each) | on screen |
|---|---|---|---|---|
| explain | cov-cafe-CU-Z0-explain-K13 | Zei | 37-b3-5, 39-b3-6, 41-b3-8 | 16.5 s |
| serious | cov-walk-CU-B-serious-K9 | Bai | 27-b2-8, 29-b2-10, 30-b2-11 | 11.4 s |
| warm | cov-cafe-CU-D-warm-E16 (g2) | Deluin | 50-b4-3, 52-b4-5-cut | 18.8 s |
| amused | cov-cafe-CU-Z-amused-K7 | Zei | 49-b4-2, 51-b4-4 | 14.1 s |
| eager | cov-corridor-OTS-D-eager-K7 | Zei; Bai listens, mouth kept closed | 18-b2-1, 20-b2-3, 23-b2-5, 25-b2-7 | 12.3 s |

- `mouths.mjs`: the calls; `candidates/<id>-t1.png` with a recipe each (labelled "closed model": prompt, the frame's sha256,
  cost, the output's sha256).
- `costs.jsonl`: the ledger, one line per call. **5 calls, $0.2173** (cap $4.00; the script stops before any call that
  could pass it).
- `drift.json`: how much changed outside the mouth: mean absolute difference 2.2 to 5.2 out of 255; 0.1 % to 0.7 % of
  pixels changed by more than 40. In side-by-side views, the framing, faces, hair and background are unchanged.

**Open for the owner:** whether to use them, and how. A still with the mouth open held over a whole line (up to 14 s
in `warm`) may read as frozen mid-word. Options: swap the open and closed frames while the line plays, use the open
frame only for the first second or two of a line, or don't use them. Nothing goes into a cut without the owner's say.

**No prompt training (owner, 2026-10-19).** mouths.mjs and ../gpt/gpt.mjs send
`providerOptions.gateway.disallowPromptTraining: true` on every call, and record it in each recipe's `request`. The
gateway then routes only to a provider that doesn't train on prompts, or refuses the call. No zeroDataRetention (the
model has none). The candidates above were made before the flag was added. Checked with a stand-in gateway (a preload
that replaces fetch and exits before any write): both scripts send it. No real call was made.
