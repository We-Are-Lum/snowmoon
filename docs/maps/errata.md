# Errata: where the book disagrees with itself (maps)

> Kept by the coding agent (Claude, a closed model), 2026-10-11, on branch `plan-coach`. AI-made, not by the author. Each entry quotes both passages and says what the maps do. Source: `docs/maps/feasibility.md`, `content/snowmoon/maps/*.json`.

## 1. The battle groups' directions (chapters 29 and 30)

- The text: "I'm leading Group Center, our task is to cross the forest directly east." (c29-b25, world guide wg-367). And: "I'm leading Group South, our task is to cross the forest, move toward the southeast, and then set up a perimeter on the outskirts of Northglade." (c29-b27, wg-368)
- The book's battle map (c29-b34) draws both routes heading east-north-east (about 51° and 58° from north). No single rotation of the map fixes both, because Group North and Group Naval already match the text with north up.
- **The maps follow the drawing** (owner, 2026-10-11). The tap sheets quote both lines and say the text differs. `scripts/maps.ts check` tests wg-367 and wg-368 and expects them to fail, so the difference stays on record.

## 2. Redshire–Devanvil: 15 percent or 12 (chapters 2, 5 and 10)

- "Devanvil gets fifteen percent votes in Redshire" (c2-b16). The co-governance figure gives 15 on the Redshire–Devanvil link (c5-b46).
- "Redshire chooses twelve percent of the seats in Devanvil's parliament" (c10-b21).
- If the share can differ in each direction, both can hold. But the figure shows one number per link, and each city "elect[s] a percentage of the other's parliament" (c5-b47). Not a place, so the maps don't use it. It matters only if a map labels the links.

## Not errata, but often mistaken for them

- **The chapter 5 figure is not a map.** It shows links between cities. Read to scale, it would put Hapton and Inglewore farther from Redshire than Freetown, which c15-b25 rules out. Its Arturia–Petersvil link crosses Redshire–Devanvil.
- **Northglade "over two hundred kilometers inland" (c17-b101), on an island about twenty kilometers wide (c31-b4).** Read "inland" as "from the border", and both hold.
- **The pyramid path at "about a ten percent slope" (c4-b52), and a twenty-minute walk around the pyramid halfway up (c24-b21).** Both hold if the slope is only the first stretch; the maps add a steep stair, marked "placed by us".
