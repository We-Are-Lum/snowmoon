# Fifteen Days, the GPT version (version 2)

Version 1's cut (coverage-v6) with every model-drawn picture redrawn by **GPT Image 2.5 Sunburst (OpenAI), a closed model**,
through the Vercel AI Gateway (owner, 2026-10-18: "Let's go with that one and change the site to allow closed models").
Words, voices, sound, timing and the pictures drawn in code are version 1's; the mix is the same file.

**Inputs open, model closed.** The prompts (plan.json), the reference pictures sent (each recipe names them with their
sha256; the cast cards and plates are the committed copies in ../sent/, same sha256), the scripts, every call's recipe
and cost, and the cut are here. The model's weights are not published by its maker.

- build_plan.py: one job per picture in cut v6, from that picture's own recipe chain (no new prompts written by hand
  beyond the joining sentences in it).
- gpt.mjs: the calls (AI Gateway /v1/images/edits, 1536x864). make_timeline.py: v6's timeline with the pictures swapped.
- figure-check.json: the extra-figure check of every picture (51 of 51 pass, one after a retry).
- costs.jsonl: what each call cost ($2.21 for the cut).
- recipes/: one recipe per picture used, labelled "closed model".
- The cut: scenes-out/fifteen-days/cuts/coverage-v6-gpt/ (mp4, timeline, recipe, poster).

**Note on the recipes' "purpose" field.** Each per-picture recipe was written when the GPT cut was a private comparison
("not in the cut or on the site"). On 2026-10-18 the owner chose this cut as version 2, so that line is out of date. The
recipes are kept exactly as written at the time; this note is the correction.
