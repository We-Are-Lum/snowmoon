# Starting sheets: front, side and back views from the edit model (DRAFT)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-01, on branch `starting-sheet-drafts`, for the owner to pick. **DRAFTS ONLY.** Nothing was published, nothing was written to any database, nothing was uploaded to the site's storage (R2). The pictures are local files in `/Users/nathan/snowmoon-starting-drafts/`, not in the repository. Every picture is AI-made and keeps that label wherever it is used.

Follows `docs/proposals/remix-challenge-starting-sheets.md` (branch `remix-challenge`), option B, with the owner's change: use the edit model with each character's existing starting sheet as the reference, for all three views.

Contact sheet (original, v2 views and first drafts, per character): `/Users/nathan/snowmoon-starting-drafts/index.html`.

## v2 (current): all 18 views redone through the site's own functions

The owner picked option B and asked for all 18 views redone first (2026-11-01): a plain light-grey background, Mu's shoulder panel without "sculpted", and made through the site's own path so the prompt check runs and the recipes are standard. Pictures: `/Users/nathan/snowmoon-starting-drafts/v2/<name>-<view>.jpg`. Script: `/Users/nathan/snowmoon-starting-drafts/v2/make-v2.mts`; log of every call with each view's full recipe: `/Users/nathan/snowmoon-starting-drafts/v2/ledger.json`. The first drafts below stay as they were, for comparison; `index.html` shows original, v2 and first drafts per character.

### What the script calls, and what it does not

Run locally from this worktree (`tsx --conditions=react-server --env-file=.env.local`), importing the site's own modules:
- `blockedName` (`src/lib/images/rules.ts`), then `checkPrompt` (`src/lib/images/guard.ts`): the site's prompt check, gpt-oss-safeguard-20b against `config/prompts/image-guard.md`, on the full prompt, as `paidPicture` does. `GROQ_API_KEY` is removed from the script's environment, so `complete()` goes through the Vercel AI Gateway (the project's gateway key, Groq pinned, zero data retention), never the site's own Groq key (the batch-jobs rule).
- `viewPrompt` and `VIEW_LINES` (`src/lib/images/design-rules.ts`): the site's prompt builder and view lines.
- `makeEdit` (`src/lib/images/fal.ts`): the site's edit-model call, unchanged (its fixed settings; no seed is sent, so fal picks one and it is recorded).
- `recipeOf` from the publish route (`src/app/api/designs/route.ts`): a Next route file can't export it, so the script holds a verbatim copy and checks it against the route's source text at start (stops if they differ). Each view gets a `SampleTicket` as the sample route would sign it, and `recipeOf(ticket)` is the recipe exactly as publishing would store it.
- **Not called:** `paidPicture`, `reserve`, `settle`, `recordGuard` (the daily counts and spend tables), `signSampleTicket`, `putPublic` (R2), `makeDesign` (the database). `db()` is never opened. **Nothing was written to the production database, nothing uploaded, nothing published.** So the STOP condition did not arise: the prompt check and the recipe need neither a database write nor an upload; only the spend bookkeeping writes, and it was left out.

### What changed in the prompt

- **Background:** the site has no separate "plain sheet background" wording; its own is the view line's "plain light grey background", kept. The style text was what pulled in skies, so two clauses were removed from Techno vistas for the views: " rich mechanical and architectural detail kept to the middle and far distance, vast airy compositions with big pastel skies and enormous elegant megastructures on the horizon," and " cinematic wide-angle perspective,". The style text used: "Detailed science fiction comic art: precise fine uniform linework, cel-shaded flat color with soft hard-edged shadows, clean and bright and hopeful, no text, no lettering, no writing, no logos, no numbers."
- **Side and back are made from the new front view**, as the site's sheet tool does (its recipe's `references` is the front's sha256), not from the original sheet; that keeps the original's skyline out. The front is made from the original sheet (the owner's choice; `references` is the sheet's sha256).
- **Mu:** "with one sculpted shoulder panel" became "with one shoulder panel"; otherwise word for word.
- View lines as before (side and back the site's word for word; front in the side line's form, "seen from the front").

### Spend and calls

- **42 calls, $0.17116 in all:** 18 edit-model calls, $0.16810 (fronts 6 × $0.01032, with the 1024 × 576 sheet as reference; sides and backs 12 × $0.00885, with the 576 × 768 front as reference; the site's formula); and 24 prompt checks, $0.00306 (the gateway's own cost figures).
- The hard cap was $0.40, checked before every call against the worst case (the site's reservations: $0.0015 a check, $0.02 an edit). Worst-case total reached: $0.3960.
- **Nothing counted toward `IMAGES.dailySpendCapUsd`.** The cap is enforced from the site's spend tables, which only `reserve`/`settle`/`recordGuard` write; none ran, and the database was never opened. So today's visitor budget ($2) is untouched; for that reason today's recorded spend was not read. No caps or config changed.

### The prompt check

**Every view passed before its picture was made.** 5 first answers were refusals with category "unclear" (Zei back twice, Bai front, Deluin back, Mu front): the site's rule treats an empty or unparseable answer as a refusal. Each passed when asked again, as a visitor's retry would. One extra check on Zei's back prompt, with the reply shown, answered `{"allow": true}` after 385 of its 400 tokens, so the "unclear" answers are most likely the model's reasoning running out of tokens (the known case noted in `src/lib/config.ts`), not the prompts. Counted above. fal's safety checker flagged none of the 18.

### Recipe format (one example, Mu side, exactly as `recipeOf` gives it)

```json
{
 "prompt": "The same person as in the reference picture, full body, standing, seen from the side, plain light grey background. Keep the face, hair and clothes the same.\n\nDetailed science fiction comic art: precise fine uniform linework, cel-shaded flat color with soft hard-edged shadows, clean and bright and hopeful, no text, no lettering, no writing, no logos, no numbers.\n\nThe person is a woman in her early sixties, small and wiry, medium brown skin, short silver hair in a sharp asymmetric cut, keen eyes behind thin red-framed glasses, wearing a charcoal asymmetric commander's tabard with one shoulder panel and bright yellow piping, over a cobalt-blue seamless long-sleeved bodysuit, slim black segmented trousers, soft grey seamless boots and a slim wrist device.\n\nNo text, no lettering, no signs with words.",
 "model": "flux2-klein-4b-edit",
 "endpoint": "fal-ai/flux-2/klein/4b/edit",
 "host": "fal.ai",
 "settings": {
  "image_size": {
   "width": 576,
   "height": 768
  },
  "num_images": 1,
  "enable_safety_checker": true,
  "output_format": "jpeg",
  "sync_mode": true
 },
 "seed": 31879289,
 "request_id": "01a1982f-bbd9-7031-933b-cee7bdda5613",
 "cost_usd": 0.0088,
 "made_at": "2026-11-01T17:37:08.723Z",
 "width": 576,
 "height": 768,
 "references": [
  {
   "sha256": "7f90bc9b7f9f63997a31119769f1debbd8e9dc0d22f6908308aa9bac4eab0be3"
  }
 ],
 "style": {
  "version_id": "unpublished: content/snowmoon/designs/styles/techno-vistas.json (scenery clauses removed for views)",
  "title": "Techno vistas, views",
  "text": "Detailed science fiction comic art: precise fine uniform linework, cel-shaded flat color with soft hard-edged shadows, clean and bright and hopeful, no text, no lettering, no writing, no logos, no numbers."
 },
 "checks": {
  "prompt": {
   "model": "openai/gpt-oss-safeguard-20b",
   "verdict": "ok"
  },
  "host_safety_checker": "passed"
 },
 "assist": {
  "model": "claude-coding-agent",
  "drafted": [
   "sample subject or view line"
  ],
  "source": "src/lib/images/design-rules.ts"
 }
}
```

Two departures from a recipe made on the site, both because these were not made from a published style or through its sample route:
- `style.version_id` names the unpublished style file and says the clauses were removed, since Techno vistas has no published version. Publishing would need Techno vistas (or a views variant) published first, or this field set honestly another way.
- A front with a `references` entry (the original sheet): the site's front is made from text only. The recipe format allows it.
- Also note `cost_usd` is rounded to 4 decimals by `recipeOf` (0.0088 for $0.00885).

### Per character (v2)

**Zei Leimin.** **Keeps the look; plain background.** Blue streak, visor glasses, orange cropped jacket over the black bodysuit with cyan seams, grey gathered trousers, glowing sneakers. Side is a true profile.
- front: `/Users/nathan/snowmoon-starting-drafts/v2/zei-front.jpg`, sha256 `564f45deb5b5934c499ad0339ccedadb005f0a09e311231b0ff37e66708707a1`, seed 1187110907, $0.01032
- side: `/Users/nathan/snowmoon-starting-drafts/v2/zei-side.jpg`, sha256 `d0ac5203a26a4b8d00c6c1a617910fa2c03051a6749657176fc6e17f5548e561`, seed 2098441968, $0.00885
- back: `/Users/nathan/snowmoon-starting-drafts/v2/zei-back.jpg`, sha256 `7ee79ae8a51b91f2a2b9012f906d474e0347d8cba730f55f700c63e04db6f875`, seed 1571901438, $0.00885

**Bai Jahen.** **Keeps the look; plain background.** One small drift: from behind, the lime vest now covers the upper back (the original's back view shows the white bodysuit there).
- front: `/Users/nathan/snowmoon-starting-drafts/v2/bai-front.jpg`, sha256 `3d59639ed720bb48baea4a45c6b75640050ea44f196de2b15599e1653783da8e`, seed 965294590, $0.01032
- side: `/Users/nathan/snowmoon-starting-drafts/v2/bai-side.jpg`, sha256 `74c000a37e978014ed4bc3292b724669ac8a358c33fa3f2a7d9758c47b64577a`, seed 2129115511, $0.00885
- back: `/Users/nathan/snowmoon-starting-drafts/v2/bai-back.jpg`, sha256 `a6585ca3088a11c24cf42b4b35427b17733fa3da8835c5ea04e733e0dd01686f`, seed 2073201206, $0.00885

**Gladias.** **Keeps the look; plain background. No privacy robe.** Green tabard, cream sleeves, ochre sash, charcoal leggings, beard, earpiece, throat band. Small drift in the back view: the sash's hanging tail shows at the back, and the boots come up higher.
- front: `/Users/nathan/snowmoon-starting-drafts/v2/gladias-front.jpg`, sha256 `76e95dd38f75d840f10c1d387230ea746722cc1e6d93809b5a4b34eecce597d5`, seed 2015154021, $0.01032
- side: `/Users/nathan/snowmoon-starting-drafts/v2/gladias-side.jpg`, sha256 `37c793fdec5036bd20a86636dc387719e6d5f357bdbf7b2253ed18ebf7886b3a`, seed 422872616, $0.00885
- back: `/Users/nathan/snowmoon-starting-drafts/v2/gladias-back.jpg`, sha256 `38987e5444e820f04dabd2bc6e60f63d4618a08f1ec69ab65a5772158e3a36dc`, seed 2143050416, $0.00885

**Seila.** **Keeps the look; plain background.** Braids, round gold glasses, rust coat-dress with three bronze clasps, olive trousers, tan boots. The back view has a buckled half-belt (the original's is plainer).
- front: `/Users/nathan/snowmoon-starting-drafts/v2/seila-front.jpg`, sha256 `0d9ddc131a061f1c396ccc93334aa73c3fb873ffc271092814c30146b15c23f9`, seed 1016940298, $0.01032
- side: `/Users/nathan/snowmoon-starting-drafts/v2/seila-side.jpg`, sha256 `606ed412c0a555b820b90898c1b271c71c994b82515a53e5be943533a17f9c1c`, seed 17672628, $0.00885
- back: `/Users/nathan/snowmoon-starting-drafts/v2/seila-back.jpg`, sha256 `6843bd92475f83d911c7c107748e568e94a9c5525a1ece00acc08c22e54b026e`, seed 1388019085, $0.00885

**Deluin.** **Keeps the look; plain background.** Very close: hair, cream cable-knit tunic, grey hood, dark sash, green trousers, brown boots.
- front: `/Users/nathan/snowmoon-starting-drafts/v2/deluin-front.jpg`, sha256 `967e5a23d68070239c2c9d446ab0f765172c7b77c803489a3ed8d5ed7b56df2c`, seed 215413207, $0.01032
- side: `/Users/nathan/snowmoon-starting-drafts/v2/deluin-side.jpg`, sha256 `04df5eed5918460ad2e293a484c935f690a4b2249a437830e12b7f9d1f46c836`, seed 1098096228, $0.00885
- back: `/Users/nathan/snowmoon-starting-drafts/v2/deluin-back.jpg`, sha256 `7e798718dc05767ec9a6f77415a5b0b3ff42d60b26cd222d070aed6a44e11a6b`, seed 961309483, $0.00885

**Mu.** **Now keeps the look; plain background.** With "sculpted" dropped, the shoulder is the original's smooth cape-like panel with yellow piping in all three views; the armour-like panel of the first drafts is gone.
- front: `/Users/nathan/snowmoon-starting-drafts/v2/mu-front.jpg`, sha256 `7f90bc9b7f9f63997a31119769f1debbd8e9dc0d22f6908308aa9bac4eab0be3`, seed 1018900662, $0.01032
- side: `/Users/nathan/snowmoon-starting-drafts/v2/mu-side.jpg`, sha256 `abc66dccffd2bf5cdc227a0bf4803a0ee75322729e6c2260b253141e6fa0dd2f`, seed 31879289, $0.00885
- back: `/Users/nathan/snowmoon-starting-drafts/v2/mu-back.jpg`, sha256 `d485d194bee4460a12f955e2afa784db945477e4573dfb8ee39a07e4d39d47a9`, seed 544216540, $0.00885

Every background is now plain light grey, with a soft floor shadow and no skyline.

---

# First drafts (earlier the same day, kept for comparison)

## Spend

- **18 calls, all succeeded, no retries. Total $0.18579 at fal's list price** (worst case if fal rounds every picture up to 1 MP: 18 × $0.02 = $0.36). The cap was $1.00; the script checked the worst-case running total before every call.
- Price per call, by the site's own formula (`src/lib/images/fal.ts`, `makeEdit`; `IMAGES.editPricePerMp` = $0.01/MP): (output 576 × 768 = 0.442368 MP + reference 1024 × 576 = 0.589824 MP) × $0.01 = **$0.01032192**. (Higher than the proposal's $0.00885 because the reference here is the full 1024 × 576 sheet, not a 576 × 768 front view.)
- **Nothing counted toward the site's daily cap** (`IMAGES.dailySpendCapUsd`, $2). The model was called directly from a local script (`node --env-file=.env.local`, the project's `FAL_KEY`), not through the site's API, so nothing was recorded in the site's spend tables and visitors' $2 is untouched. No cap or config was changed; no fal account setting was changed.
- Not run: the site's prompt check (gpt-oss-safeguard-20b). These calls bypass the site, so it did not run; the prompts are the cast recipes' own wording plus the site's view lines and name no person, artist, studio or film. fal's safety checker was on for every call and flagged none (`has_nsfw_concepts` false for all 18).

## How each draft was made

- **Model:** FLUX.2 [klein] 4B edit (open weights, Apache-2.0), endpoint `fal-ai/flux-2/klein/4b/edit` on fal.ai, exactly as `IMAGES.editModel` and `makeEdit`.
- **Reference:** one picture, the character's whole original starting sheet (1024 × 576 PNG, three views), sent as a `data:image/png;base64` URI so fal fetches nothing.
- **Settings (every call):** `image_size {width: 576, height: 768}` (`IMAGES.viewSize`), `num_images 1`, `enable_safety_checker true`, `output_format "jpeg"`, `sync_mode true`, header `X-Fal-Store-IO: 0`; plus `seed` = the character's seed from `cast.json` (the site's tool sends no seed; one was added here so a redo is repeatable). fal echoed the same seed back each time.
- **Prompt:** the site's order (`viewPrompt` in `src/lib/images/design-rules.ts`): view line, style text, the sheet's text, `IMAGES.suffix`, joined by blank lines.
  - View lines: side and back are the site's `VIEW_LINES` word for word. The site's front line ("Character reference picture: …") is written for the text-only front model; with a reference picture the front line here takes the side line's form, "seen from the front" (wording adapted by the coding agent).
  - Style text: Techno vistas (`content/snowmoon/designs/styles/techno-vistas.json`), which is also the tail of every cast recipe.
  - Sheet text: the "The person is …" sentence of the character's `cast.json` prompt, word for word (drafted by the coding agent in October; `assist.drafted`). The original's opening ("Character reference sheet … three full-body views side by side …") is left out, since each call asks for one view.
- The script that made them: `/Users/nathan/snowmoon-starting-drafts/draft-views.mjs`; its log of every call, with prompt, settings, seed, fal request id and sha256: `/Users/nathan/snowmoon-starting-drafts/ledger.json`.

The three view lines used:

- front: "The same person as in the reference picture, full body, standing, seen from the front, plain light grey background. Keep the face, hair and clothes the same."
- side: "The same person as in the reference picture, full body, standing, seen from the side, plain light grey background. Keep the face, hair and clothes the same."
- back: "The same person as in the reference picture, full body, standing, seen from behind, plain light grey background. Keep the hair and clothes the same."

Shared by every prompt, after the view line: the Techno vistas text, then the sheet text below, then "No text, no lettering, no signs with words."

**What all six share:** the edit model kept the originals' skyline backgrounds behind each figure (the style text asks for skies and megastructures), with a light grey floor, so the "plain light grey background" is only partly followed. The drafts are 576 × 768, the site's view size.

## Per character

### Zei Leimin

- **Source:** `cast.json` id `zei-sheet`, seed 5114, sha256 `cd6e71769d0d468bbfc5dbb4269aa62b14a92efaa45aef33bfc1b9fd0ba8d867`, **verified** (sha256 of `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/cast v2/zei-sheet.png` and `/Users/nathan/snowmoon-scenes/images-out/cast/zei-sheet.png` matches). Copied to `/Users/nathan/snowmoon-starting-drafts/originals/zei-sheet.png`.
- **Sheet text in the prompt:** "The person is a young man of eighteen, slim and of medium height, light golden-tan skin, spiky jet-black hair with one electric-blue streak and quick dark eyes, wearing a cropped asymmetric orange shell jacket with one long sleeve and one short sleeve, angular reflective panels and a tall split collar, a black seamless high-neck bodysuit with thin glowing cyan seams, wide segmented grey trousers gathered into ankle cuffs, chunky white sneakers with glowing soles, a thin band around his throat and clear visor glasses pushed up on his head."
- **Seed:** 5114 for all three views.
- **Drafts:**
  - front: `/Users/nathan/snowmoon-starting-drafts/drafts/zei-front.jpg`, sha256 `8a5d1be22d0bcc77aeaebfbf5f211031d6388dc00925552d1c9ca8369b79a8fc`, fal request `01a195cf-9e04-7323-93a2-d3e234de800c`, $0.01032
  - side: `/Users/nathan/snowmoon-starting-drafts/drafts/zei-side.jpg`, sha256 `ffb03a7bcd2fdf23a44a205deab6748bbcd5a3f9a5ce71157171c68864787e8b`, fal request `01a195cf-cdaa-7af0-82ec-0341aaed2661`, $0.01032
  - back: `/Users/nathan/snowmoon-starting-drafts/drafts/zei-back.jpg`, sha256 `cda9cb1ab5ad53816b25255d0f87eb536f7beb156ec428f83d6170c6e59a3f6d`, fal request `01a195cf-db18-7141-9242-ec99b7a2db4d`, $0.01032
- **Cost:** 3 × $0.01032 = $0.03097.
- **Look:** **Keeps the look.** Face, spiky black hair with the electric-blue streak, visor glasses on the head, orange cropped jacket with reflective panels over the black bodysuit with cyan seams, grey gathered trousers, white sneakers with glowing soles. The jacket is on in all three drafts, which fixes the original's mismatch (its middle view shows the bodysuit without the jacket). The side draft is close to a true profile.

### Bai Jahen

- **Source:** `cast.json` id `bai-sheet`, seed 5015, sha256 `21def33df4f734aa8979a2bb152d88b443d511b940eaae0c4a67347f900db73e`, **verified** (sha256 of `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/cast v2/bai-sheet.png` and `/Users/nathan/snowmoon-scenes/images-out/cast/bai-sheet.png` matches). Copied to `/Users/nathan/snowmoon-starting-drafts/originals/bai-sheet.png`.
- **Sheet text in the prompt:** "The person is a young woman of about eighteen, tall and athletic, dark brown skin, hair pulled into a high puffy ponytail dyed magenta at the ends, a confident sly grin, wearing a lime-green modular shell vest with a bulky angular collar and reflective piping, a white seamless sleeveless bodysuit with glowing magenta seams, black wide gathered trousers with segmented knees, chunky black boots with glowing soles and a hip pouch."
- **Seed:** 5015 for all three views.
- **Drafts:**
  - front: `/Users/nathan/snowmoon-starting-drafts/drafts/bai-front.jpg`, sha256 `f8e07a202bc4ba53311d12c5743cd9e3d57549d5d628411079a1fb9f6d3db3f1`, fal request `01a195cf-e6e3-7223-a085-c04a4a12d982`, $0.01032
  - side: `/Users/nathan/snowmoon-starting-drafts/drafts/bai-side.jpg`, sha256 `b5862153ec954a26c2bc3bc3cafccb45b20df48550e046e363563dd22aa2da43`, fal request `01a195cf-f3c0-7d10-9f67-473f9e127593`, $0.01032
  - back: `/Users/nathan/snowmoon-starting-drafts/drafts/bai-back.jpg`, sha256 `b701d567e237f4836d9118239ff31d760f845636f51ce4c844ac3c3bb7acde0a`, fal request `01a195cf-ff3d-7f62-91eb-2bdb2df5a429`, $0.01032
- **Cost:** 3 × $0.01032 = $0.03097.
- **Look:** **Keeps the look.** Magenta-tipped high ponytail, sly grin, lime shell vest, white bodysuit (seen in the back view), black wide trousers with knee pads, black boots with magenta soles, hip pouch. The closest of the six to its original.

### Gladias

- **Source:** `cast.json` id `gladias-sheet`, seed 5001, sha256 `5b0c9d56c09f120d12be9657721f93eec56ec71c6f7c721312dc54a1a10e8d57`, **verified** (sha256 of `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/cast v2/gladias-sheet.png` matches). Copied to `/Users/nathan/snowmoon-starting-drafts/originals/gladias-sheet.png`.
- **Sheet text in the prompt:** "The person is a man of about forty, slim and of medium height, light olive skin, short wavy chestnut-brown hair, a neatly trimmed short beard and hazel eyes, wearing a long sleeveless moss-green woven tabard with a sculpted standing collar that rises to his jaw, over a fitted cream long-sleeved bodysuit with seamless panels, a wide ochre cloth sash at the waist, slim tapered charcoal leggings, smooth seamless grey boots with thick soft soles, a thin silver band around his throat, a small earpiece and a slim pale ceramic wrist device."
- **Seed:** 5001 for all three views.
- **Drafts:**
  - front: `/Users/nathan/snowmoon-starting-drafts/drafts/gladias-front.jpg`, sha256 `11d278a0ab33a46fc72bd50766f2f986131d98e0ba1cabdc9997fcbee6b9a3ee`, fal request `01a195d0-1295-7852-9e29-28adc2cd3333`, $0.01032
  - side: `/Users/nathan/snowmoon-starting-drafts/drafts/gladias-side.jpg`, sha256 `847f2941ca58474c0bef845056cd73a765d3601e6b1af11502bd7efc71a01389`, fal request `01a195d0-1f8d-71d2-aed4-6e113b151a1e`, $0.01032
  - back: `/Users/nathan/snowmoon-starting-drafts/drafts/gladias-back.jpg`, sha256 `e7fc6ffc13e19a15a8f9b98b5baa55218f832cd44f8f2589de04b2e08f7b7186`, fal request `01a195d0-2d0c-77b3-9583-a3d82d172f0a`, $0.01032
- **Cost:** 3 × $0.01032 = $0.03097.
- **Look:** **Keeps the look.** Moss-green sleeveless tabard with the standing collar, cream long-sleeved bodysuit, ochre sash, charcoal leggings, grey boots, short beard, earpiece and throat band. The side draft reads as three-quarter rather than profile.
- **Privacy robe check: the drafts show no privacy robe.** All three show his everyday clothes from the original sheet: moss-green tabard, cream bodysuit, ochre sash, charcoal leggings, grey boots, face and hair uncovered. Nothing purple, hooded or ankle-length. Expected, since neither the sheet nor its prompt has the robe. He stays held until the owner decides whether his look should follow Garance's new robe reference.

### Seila

- **Source:** `cast.json` id `seila-sheet`, seed 5002, sha256 `62f2f7ce966c5cc0c425af17edf58640bf587fff0486f5a7bb62530abfb447c4`, **verified** (sha256 of `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/cast v2/seila-sheet.png` matches). Copied to `/Users/nathan/snowmoon-starting-drafts/originals/seila-sheet.png`.
- **Sheet text in the prompt:** "The person is a woman in her late thirties, tall and slender, deep brown skin, black hair in shoulder-length braids gathered loosely back, alert dark eyes behind small round gold-rimmed glasses, wearing a long rust-orange woven coat-dress with a sculpted high funnel collar, an asymmetric closure of three bronze clasps running from shoulder to hip and a split hem, over an oatmeal seamless bodysuit, olive gathered trousers, soft tan seamless ankle boots and a thin band around her throat."
- **Seed:** 5002 for all three views.
- **Drafts:**
  - front: `/Users/nathan/snowmoon-starting-drafts/drafts/seila-front.jpg`, sha256 `c98932f5714d739c0ce624df702ba7de1903eecaaff8defb9bc3a0927a7b6fb4`, fal request `01a195d0-38b9-7d82-bb79-09dbfd9ec629`, $0.01032
  - side: `/Users/nathan/snowmoon-starting-drafts/drafts/seila-side.jpg`, sha256 `5ad3ad9adb60f830eed790bc8cc883f4584ffbbcd312c98bd963707a2120344b`, fal request `01a195d0-45b9-7022-a617-e6c102f56c48`, $0.01032
  - back: `/Users/nathan/snowmoon-starting-drafts/drafts/seila-back.jpg`, sha256 `45678174fcc3075ec6529fc8412ea9a88b9c055ec8df393fe58a14c417a4bd99`, fal request `01a195d0-5e50-7440-903a-b0d3ea9e88ad`, $0.01032
- **Cost:** 3 × $0.01032 = $0.03097.
- **Look:** **Keeps the look, one small drift.** Braids, round gold-rimmed glasses, rust coat-dress with three bronze clasps, oatmeal collar, olive gathered trousers, tan ankle boots. The back draft adds a buckled half-belt across the back of the coat (the original has a plain tie). The side draft reads as three-quarter. Like the original, the skyline sits in a framed panel behind her.

### Deluin

- **Source:** `cast.json` id `deluin-sheet`, seed 5020, sha256 `3edf7878c7001438c4c7133005517cba0d1679bed4988fadc58947d428934384`, **verified** (sha256 of `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/cast v2/deluin-sheet.png` and `/Users/nathan/snowmoon-scenes/images-out/cast/deluin-sheet.png` matches). Copied to `/Users/nathan/snowmoon-starting-drafts/originals/deluin-sheet.png`.
- **Sheet text in the prompt:** "The person is a young man of about eighteen, tall and long-limbed, pale skin, wavy shoulder-length light-brown hair, grey-green eyes and a calm, slightly serious face, wearing a thick cream cable-knit sweater cut as a long asymmetric tunic with a high folded collar and a light grey hood, dark green slim segmented trousers, a narrow dark sash and sturdy brown seamless boots."
- **Seed:** 5020 for all three views.
- **Drafts:**
  - front: `/Users/nathan/snowmoon-starting-drafts/drafts/deluin-front.jpg`, sha256 `edb74ad994cb52dfd25b94ff156a0f429b1037fd6b3d71c6f904d948abf708e7`, fal request `01a195d0-6fb8-7ae1-b44a-3cdc6e833932`, $0.01032
  - side: `/Users/nathan/snowmoon-starting-drafts/drafts/deluin-side.jpg`, sha256 `ca4e9e7c4a633e929f88427de73cba6418335cb440f21cb6eaf810e9973a319c`, fal request `01a195d0-91e8-72d1-a0e6-7ecf605c9559`, $0.01032
  - back: `/Users/nathan/snowmoon-starting-drafts/drafts/deluin-back.jpg`, sha256 `d111a9055d04b2c51d9a934f673bad1fb069ed2dcfcd12056b2bcbad619b53f2`, fal request `01a195d0-9ddd-7a23-b1cf-8504f7f8145b`, $0.01032
- **Cost:** 3 × $0.01032 = $0.03097.
- **Look:** **Keeps the look.** Wavy shoulder-length light-brown hair, calm face, cream cable-knit tunic with the grey hood, narrow dark sash, dark-green trousers, brown boots. Very close; the side draft is close to a true profile.

### Mu

- **Source:** `cast.json` id `mu-sheet`, seed 5017, sha256 `e1854964c41862db245d46cc188ba84af6235fb95c38a79d55fe9281abf3aec7`, **verified** (sha256 of `/Users/nathan/Library/CloudStorage/GoogleDrive-geko5443@gmail.com/My Drive/Snowmoon images/cast v2/mu-sheet.png` matches). Copied to `/Users/nathan/snowmoon-starting-drafts/originals/mu-sheet.png`.
- **Sheet text in the prompt:** "The person is a woman in her early sixties, small and wiry, medium brown skin, short silver hair in a sharp asymmetric cut, keen eyes behind thin red-framed glasses, wearing a charcoal asymmetric commander's tabard with one sculpted shoulder panel and bright yellow piping, over a cobalt-blue seamless long-sleeved bodysuit, slim black segmented trousers, soft grey seamless boots and a slim wrist device."
- **Seed:** 5017 for all three views.
- **Drafts:**
  - front: `/Users/nathan/snowmoon-starting-drafts/drafts/mu-front.jpg`, sha256 `d924a0f4422df65c18fcd192bdbb063e9737b96037e9839387f7ffbc00b57931`, fal request `01a195d0-b30b-7c03-8afe-9be2e98cf99d`, $0.01032
  - side: `/Users/nathan/snowmoon-starting-drafts/drafts/mu-side.jpg`, sha256 `07f530b24c8cf2a42b29f656840e69697df803120eac93030831a797c3488fbe`, fal request `01a195d0-c3bd-74c0-a62e-3733829f8691`, $0.01032
  - back: `/Users/nathan/snowmoon-starting-drafts/drafts/mu-back.jpg`, sha256 `5be20f9e9e4e4471dd38007e776f3ceca685790bd04d481473fbff66e8eaf234`, fal request `01a195d0-cfe8-78f2-ac4e-9cd9c61d870b`, $0.01032
- **Cost:** 3 × $0.01032 = $0.03097.
- **Look:** **Drifts at the shoulders.** Silver asymmetric hair, red glasses, charcoal tabard with yellow piping, cobalt sleeves, black trousers, grey boots and wrist device are kept, but all three drafts add a sculpted, armour-like shoulder panel (the prompt's "one sculpted shoulder panel") where the original has a smooth cape-like shoulder. If the owner wants the original's shoulder, a redo would drop that phrase from the prompt.

## Total

18 calls (6 characters × front, side, back), 18 pictures, no failures or retries: **$0.18579** at list price (worst case $0.36), under the $1.00 cap. Nothing through the site, so $0 of the site's daily cap was used.

## Next, for the owner

Option B was picked; the v2 views above are the candidates. Publishing still needs the steps and approvals in the starting-sheets proposal (and a published style for the views, or an honest `style` field). Gladias is released (2026-11-01) and treated like the others.

## Principles

- P1 (recipes complete): v2's recipes are what the site's own builder gives, with every input recorded. Pass, with the two departures noted in the v2 section (unpublished style; a front with a reference).
- P2 (AI labelled): every picture is AI-made and labelled so in the contact sheet and here. Pass.
- P4 (people publish): nothing published; the owner picks. Pass.
- P6 (data and spend): v2 ran the site's prompt check (through the gateway, zero data retention, Groq pinned; never the site's own key) and fal's safety checker; fal in sync mode with `X-Fal-Store-IO: 0`; no database or storage writes; the site's spend cap untouched. Pass. (The first drafts' concern, no prompt check, is resolved for v2.)
- P8 (book vs invented): the character descriptions are this edition's, drafted by the coding agent, as before. Pass.
- New tension: none. To note: five "unclear" refusals in 24 checks suggests the check's 400-token answer budget is tight for long sheet prompts; a visitor would see "This prompt asks for something the rules don't allow" and retry.
