# Recast tests: Deluin and Gladias (DRAFT, for the owner's pick)

Made 2026-11-04 by the coding agent (Claude, a closed model by Anthropic) with **Gemini 3.1 Flash Image, a closed model by
Google** (Vertex AI, zero retention, through Vercel AI Gateway), the same way as the current Animated series fronts:
same prompt, style text and settings, with only the skin, hair and eyes words changed (owner, 2026-11-04). Drafts only;
nothing is published. Recipes: `directions/ledger.json` (rows tagged `recast`). Script: `scripts/recast-fronts.ts`.
Cost: $0.26890 of the $0.30 cap (four pictures and four prompt checks).

## Deluin

<table><tr><td align="center" valign="top"><img src="directions/deluin-animated-gemini.jpg" width="200" alt="Now, AI-generated draft"><br><b>Now</b><br><sub>pale skin, wavy shoulder-length light-brown hair, grey-green eyes<br>$0.06709 · sha256 <code>ed9362662479…</code></sub></td><td align="center" valign="top"><img src="directions/deluin-recast-a-gemini.jpg" width="200" alt="Option a, AI-generated draft"><br><b>Option a</b><br><sub>deep brown skin, shoulder-length black hair in loose twists, dark brown eyes<br>$0.06724 · sha256 <code>d2ebbc5fc7af…</code></sub></td><td align="center" valign="top"><img src="directions/deluin-recast-b-gemini.jpg" width="200" alt="Option b, AI-generated draft"><br><b>Option b</b><br><sub>warm golden-brown skin, straight shoulder-length black hair, dark brown eyes<br>$0.06709 · sha256 <code>a6f08f0c3510…</code></sub></td></tr></table>

Skin check: **a matches** its words. **b doesn't:** the skin came out a flat yellow-orange, not warm golden-brown. If you
want b, it needs one more try (about $0.07; $0.03 is left in the cap).

## Gladias

<table><tr><td align="center" valign="top"><img src="directions/gladias-animated-gemini.jpg" width="200" alt="Now, AI-generated draft"><br><b>Now</b><br><sub>light olive skin, short wavy chestnut-brown hair, a neatly trimmed short beard and hazel eyes<br>$0.06711 · sha256 <code>aff6f24f59e5…</code></sub></td><td align="center" valign="top"><img src="directions/gladias-recast-a-gemini.jpg" width="200" alt="Option a, AI-generated draft"><br><b>Option a</b><br><sub>deep brown skin, short curly black hair, a neatly trimmed short beard and dark brown eyes<br>$0.06711 · sha256 <code>bca41e700fdb…</code></sub></td><td align="center" valign="top"><img src="directions/gladias-recast-b-gemini.jpg" width="200" alt="Option b, AI-generated draft"><br><b>Option b</b><br><sub>warm medium-brown skin, short straight black hair with a few grey strands, a neatly trimmed short beard and dark eyes<br>$0.06711 · sha256 <code>b9b6c00952cb…</code></sub></td></tr></table>

Skin check: **a matches**. **b is lighter than "warm medium-brown"** (closer to light tan). Build, age, clothes, the calm
face, beard and throat band are kept in all four.

After your pick: descriptor and sheet_prompt in both character files and their sheet jobs in `cast.json`; Deluin's side
and back views; Gladias's side and back views again (the current ones are of the old look); then the re-render list
(`recast-rerender-list.md`), for your overnight run.

## Update, 2026-11-04 evening: the bases and current defaults

Nothing is canonical (owner): all three looks of Deluin and of Gladias are challenge bases, shown in a random order on
each visit. Look b is the **current default** for the site's own pictures until the challenge or the owner changes it.

- **Deluin b, without the bag** (owner, 2026-11-05: "remake Deluin b without the green shoulder bag"): the same words
  ("warm tan skin, straight shoulder-length black hair, dark brown eyes"), the same clothes and the same model and
  settings as b3 (Gemini 3.1 Flash Image, a closed model by Google, Vertex, zero retention), with one negative added: "No
  bag, no shoulder strap, nothing carried." First try, no retry needed. **This is Deluin b now.**

<table><tr><td align="center" valign="top"><img src="directions/deluin-recast-b4-gemini.jpg" width="200" alt="Deluin b, front, no bag, AI-generated draft"><br><b>Front</b><br><sub>$0.06710 · sha256 <code>2b45d17da426df0304fc84ded0f3f0c464472c55c96aa517735f9837368432d4</code></sub></td><td align="center" valign="top"><img src="directions/deluin-recast-b4-side-gemini.jpg" width="200" alt="Deluin b, side, no bag, AI-generated draft"><br><b>Side</b><br><sub>$0.06766 · sha256 <code>8f1c6d951e20a384adbb3ce76684820c20cf4ecb93c6863db821c3a8ad5e1a97</code></sub></td><td align="center" valign="top"><img src="directions/deluin-recast-b4-back-gemini.jpg" width="200" alt="Deluin b, back, no bag, AI-generated draft"><br><b>Back</b><br><sub>$0.06766 · sha256 <code>15849b6dc6ac7f7225b76ef17b3587f8570f85429584a5b1f9ba358b8c060d0f</code></sub></td></tr></table>

  Check: no bag or strap in any of the three; the skin a warm tan in all three; the clothes as the sheet says (cream
  cable-knit long asymmetric tunic, high folded collar, light grey hood, dark green slim segmented trousers, a narrow dark
  sash, brown boots). The sash reads as a thin dark-brown belt; the side view is closer to three-quarter than a true
  profile. Cost $0.20267 (three pictures, three prompt checks) of a $0.25 cap. Script `scripts/deluin-b4.ts`; recipes
  in `directions/ledger.json` (task `deluin-b-no-bag`).

- ~~Deluin b3~~ (**replaced** by the pictures above: the model added a green shoulder bag that isn't in his clothes; it
  showed in the front and back views). Kept as drafts, unpublished:

<table><tr><td><img src="directions/deluin-recast-b3-gemini.jpg" width="120" alt="Deluin b3, front, replaced, AI-generated draft"></td><td><img src="directions/deluin-recast-b-side-gemini.jpg" width="120" alt="Deluin b3, side, replaced, AI-generated draft"></td><td><img src="directions/deluin-recast-b-back-gemini.jpg" width="120" alt="Deluin b3, back, replaced, AI-generated draft"></td></tr></table>

- **Gladias b** in the owner's corrected words: "warm light-brown skin, short straight black hair greying at the
  temples, a neatly trimmed short beard and dark eyes"; views on the views sheet.
- Character files and cast.json sheet jobs now hold b for both (Deluin's fixed description too, its old words kept in
  its history). The chapter re-render waits for the owner's overnight go.
- Spending: recast $0.40329 of $0.44; views $2.67253 of $2.83 (Gemini 3.1 Flash Image, a closed model by Google, Vertex,
  zero retention). Deluin b in the owner's words cost $0.20276 (front $0.06718, views $0.13558, checks included).
