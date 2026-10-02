# 004: Cleanup before the first push

Date: 2026-10-02. Agent: Claude Code (Claude Opus 5.5).

```text
Small changes, amended into the same unpushed commit:

1. REPO_URL = https://github.com/We-Are-Lum/snowmoon. Update the
   About page and ATTRIBUTION.md to match.
2. Prompt 001: replace the local path with the file name and note
   the redaction.
3. Drop the `table` block kind from the parser, the constraint, and
   the checks.
4. Mark device in text_blocks.data as provisional. In the brief's
   Milestone 2, add: for each screen, record the device's owner with
   evidence. A character's device keeps its home world's look when
   they travel (chapter 19 shows both side by side).

Then scan the whole tree and the commit for private project names,
local paths, keys, and .env content. Report every match.
Do not push.
```
