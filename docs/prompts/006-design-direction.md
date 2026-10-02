# 006: Design direction, version anchors, house narration, reader restyle (brief v4c)

Date: 2026-10-02. Agent: Claude Code (Claude Opus 5.5). Attachment: the design boards, now in `docs/design/`. Text in [brackets] is redacted: a local file path.

```text
[local path]/Snowmoon direction boards review (1).zip    0001 is pushed but not applied. Edit it in place as a new commit,
inside the `studio` schema, and extend test:db to cover the changes.    Design direction is in docs/design/. Treat it as direction, not spec.

In 0001, before it is applied:
1. Move the anchor from elements to element_versions.
2. take_items gains display: 'beside' (default) or 'replace'.
   Replace hides the book text and requires lettering.
3. Exactly one house narration per chapter, enforced in the database.

Rendering, no schema:
4. An uncovered screen or figure block renders from its default
   template if one exists, otherwise as the source drew it.
5. Paragraph labels count readable blocks only. Block IDs stay.

Reader restyle:
6. Paper #F4F2ED in every chapter. Accent from the block's setting:
   #2E5A3A Veridia, #B3306E Dzego. Crimson Pro for reading, DM Mono
   for labels. No other fonts in app chrome.
7. Minimum 12px text and 44px tap targets.
8. First screen says: independent adaptation, not affiliated with
   the author, no token.

Record all of this in the brief. Do not build Listen, takes, or
ratings yet.
```
