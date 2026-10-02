# Build prompts

The prompts given to the coding agent (Claude Code) that built this repository,
in order and verbatim, except where a prompt named private infrastructure
or a local file path; those words are replaced with a
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
