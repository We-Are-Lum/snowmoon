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
