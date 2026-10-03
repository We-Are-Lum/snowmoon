# Build prompts

The prompts given to the coding agent (Claude Code) that built this repository,
in order and verbatim, except where a prompt named or described private
infrastructure, or gave a local file path; those words are replaced with a
[bracketed] description. They are part of the pipeline, published under the
project's GPL-3.0 license along with everything else.

The agent also read `docs/SNOWMOON-BUILD-BRIEF.md` and
`docs/SNOWMOON-CHAPTER-NOTES.md`, which were supplied with the first prompt.

Prompts that the app itself sends to models (analysis, generation, digests) are
a different thing and live in `/prompts`, starting with Milestone 2.

| File | Result |
|------|--------|
| `001-start.md` | Repo set up |
| `002-milestone-1.md` | Milestone 1: scaffold, ingest, reader |
| `003-pre-deploy.md` | Brief v4: screen and figure blocks, render elements, bearer auth, scaffold review |
| `004-cleanup.md` | Repo URL, `table` kind dropped, provisional device, privacy scan |
| `005-studio-schema.md` | First push; brief v4b: `studio` schema, `studio_writer`, `setting` |
| `006-design-direction.md` | Brief v4c: version anchors, take display, house narration, reader restyle |
| `007-last-0001-edit.md` | Brief v4d: `replace` widened, 0001 frozen, `veridia/vote` template |
| `008-narration-and-images.md` | Kokoro narration of all 32 chapters, pronunciation table, read-aloud drafts, first FLUX.2 klein image tests |
