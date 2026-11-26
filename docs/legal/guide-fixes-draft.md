# The guided storyboard's fixes: one Privacy change (reread by Nate, 2026-11-24, as written)

Branch `guide-fixes`, 2026-11-24. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT until Nate's
reread. In `src/lib/legal.ts` without its reread key (P6k is red until he says "reread"); it ships with the fixes (legal
texts describe today). Terms: no change.

## Why

Fix 2 (Nate, 2026-11-24): when the person describes the clothes, the scene and its shots send only the face from the
look, a head crop of the published sheet's front view (`src/lib/voice/head-crop.ts`), recorded in the recipe with the
crop box and the sheet picture it came from. Privacy §7's storyboard item says the model receives "the published sheet
of the character in it"; it now receives a part of it.

## Privacy §7, the storyboard item

**Before:** "… up to three reference pictures: the scene you kept, the published sheet of the character in it, and
other shots you kept for this storyboard, …"

**Proposed:** "… up to three reference pictures: the scene you kept, the published sheet of the character in it (only
its face, if you describe the clothes), and other shots you kept for this storyboard, …"

The rest of the item is unchanged.
