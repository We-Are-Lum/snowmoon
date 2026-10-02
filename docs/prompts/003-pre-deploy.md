# 003: Pre-deploy changes (brief v4)

Date: 2026-10-02. Agent: Claude Code (Claude Opus 5.5). Text in [brackets] is redacted: it named another project's private infrastructure.

```text
Before deploy. 0001 is not applied, so edit it in place.

1. Block kinds: add `screen` (hand-device screens, messages) and
   `figure` (SVG boards, maps, diagrams). Add text_blocks.data jsonb
   holding device, world, and the fields shown. Re-run ingest and all
   checks. Block IDs must not change.
2. elements.element_type: add `render`, with body
   {template, template_commit, state}.
3. Lettering items gain `lang` and `gloss`.
4. entities gain `world`. sections gain location_entity_id (nullable
   FK), time_of_day, season. Create sections after entities.
5. Confirm the session works when the app is embedded in Farcaster
   web and mobile. If the cookie is not sent, use a bearer header.
6. Check the scaffold against the current Farcaster miniapp docs and
   list any differences.
7. Docs: remove references to the private repo and [another project's] database.
   Record all of this in the brief as v4. Add docs/prompts/.
8. Export every source SVG figure to docs/source-figures/, named by
   chapter and block ID.

Stop and report. Do not start Milestone 2.
```
