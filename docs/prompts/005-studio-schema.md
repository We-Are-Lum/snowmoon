# 005: Push, then the studio schema (brief v4b)

Date: 2026-10-02. Agent: Claude Code (Claude Opus 5.5). Text in [brackets] is redacted: it described private infrastructure or named a person.

```text
Phase 1, amended into the unpushed commit:
- Replace "[the maintainer's name]" in the brief with "the maintainer".
- Push to origin main.

Phase 2, as a new commit. We are deploying into [a shared studio database]:
1. Put every table, trigger, and policy from 0001 in a schema named
   `studio`. Nothing goes in `public`.
2. Add the grants the API roles need, and list the Supabase settings
   I must change by hand to expose the schema.
3. Server writes should use a role limited to the `studio` schema.
   Propose how, and say what it costs versus the service role.
4. Rename `world` to `setting` in entities and text_blocks.data.
5. Docs: describe this only as "a shared studio database".

Re-run the PGlite tests against the new schema. Push when they pass.
```
