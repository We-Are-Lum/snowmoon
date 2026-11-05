# The owner's first remixes (DRAFT)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `challenge-landing`, from the
owner's decisions of 2026-11-04. DRAFT until the owner approves it. **Nothing is published. No pictures have arrived.**

## What the owner decided (2026-11-04)

- One base per character, all in Animated series (branch `challenge-styles`,
  `docs/starting-sheet-drafts/views-contact-sheet.md`).
- The owner makes the first remixes in Midjourney, from the bases.
- The owner sends a self-reported recipe with each: tool and version, the full prompt and settings, which base, and
  the date.
- They are published from the owner's account as **admin remixes**, labelled **"made outside the site; reported by
  the maker; can't be re-run exactly"**, each with its file's sha256.
- /challenge shows each character's base and two of the owner's first remixes. Until they exist, the two slots are
  empty ("Not here yet").
- Later the same day: the first remixes sit in their own row under the heading **"First remixes by @naaate"** (a
  heading over the row, not a label on each picture). They are not entries: no Entry badge, no count, never in an
  entry list. Deluin and Gladias have three bases each (their current default look, recast a and recast b), shown in
  a fresh random order on each visit; the other characters keep one base for now.

## What the owner sends, per picture

1. The picture, exactly as exported from Midjourney (PNG or JPEG, not edited, not re-saved).
2. A recipe, filled from [challenge-first-remix-recipe.template.json](challenge-first-remix-recipe.template.json):
   - `character` and `base` (which base it was made from);
   - `file` and `sha256` (`shasum -a 256 <file>` on a Mac);
   - `tool`: name, maker and version as Midjourney shows them;
   - `prompt`: the full prompt, word for word;
   - `settings`: every setting as submitted (aspect ratio, stylize, chaos, weird, seed, raw, draft, mode, image
     weight, style or omni references, moodboards or profiles). Write `null` for what wasn't set;
   - `inputs`: each picture given to Midjourney, by sha256 and what it is (at least the base's view);
   - `job`: the job id and grid cell, or `null` when not shown;
   - `plan`: the Midjourney plan it was made on;
   - `made_on`: the date (YYYY-MM-DD);
   - `reported`: always `"self-reported"`.

## How they would be imported

`scripts/import-first-remixes.ts --dir=<folder>` (dry run only, today):

- checks every recipe field is filled, the character is a challenge character, the base is that character's base
  in `CHALLENGE.bases`, and the file's sha256 matches the reported one;
- prints the sheet's front view it would write: the prompt and settings as reported, the label, the job id, the
  inputs by sha256, `checks: not run` (the site's existing line: "Made outside the site; no prompt check or safety
  checker ran."), cost 0 (paid outside the site);
- refuses `--apply`: publishing is not built.

Publishing, once the gates below are met, would be: upload the file to `brought-in/` on the bucket by its sha256;
`makeDesign` in `fork` mode from the base's version, as the owner's FID (an admin); the front view's recipe as
printed; then add the new design's id to `CHALLENGE.firstRemixes.<character>` (at most two, in the owner's order).

## Gates before anything is published

1. **Midjourney's live terms re-checked by another agent** (reread item 5.3): that pictures made from the reference
   (and from these bases) may be published and used this way on the owner's plan. Not done yet.
2. **The bases are published** and their ids are in `CHALLENGE.bases`. None is yet. Today the bases are closed-model
   pictures (GPT Image 2.5, Gemini 3.1 Flash Image), which `CHALLENGE.closedBasesAllowed` (false) refuses until the
   owner's reread of the Terms and Privacy lines naming OpenAI and Google.
3. **The label's wording approved** and added to the recipe lines (`src/lib/images/recipe-lines.ts`), so the design
   page shows "made outside the site; reported by the maker; can't be re-run exactly". Not built yet.
4. **Self-reported recipes in a sheet's views**: the view recipe type has no "self-reported" field today. The plan
   puts it in `settings` (`self_reported: true`, `label`). The owner may prefer a typed field.
5. **The owner's go** on each picture.

## Questions for the owner

- Do the first remixes count as challenge entries? The owner is an admin; admins aren't eligible for rewards.
- Is showing two of the owner's own remixes beside each base OK under P5g (no featuring)? This plan records it as a
  third narrow exception, chosen by the owner, never by a count. Pending the owner's yes.
- Should the first remixes also appear in the random six and the feed? Today they would, as any remix does.
