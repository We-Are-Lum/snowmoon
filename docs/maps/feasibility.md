# Maps of Snowmoon: what the book fixes, and a proposed layout

> Draft by the coding agent (Claude, a closed model), 2026-10-11, on branch
> `plan-coach`. AI-made, not by the author. Data and docs only: no UI, nothing
> merged until the owner says.

## What was made

| Piece | File |
|---|---|
| 92 geography lines, wg-301 to wg-392: every statement in the book about where places are, each cited, tagged with the latest chapter it depends on, and stated as one relation (a → rel → b) | `content/snowmoon/world-guide.json`, section `geography` |
| Three proposed layouts. Every placement is marked `book` or `placed by us`, with the lines it rests on | `content/snowmoon/maps/meldan.json`, `pafogai-du.json`, `world.json` |
| A checker. It runs 112 numeric tests (bearing, distance, inside, a view from a roof...) and fails if any cited relation doesn't hold, or if a geography line is neither tested nor listed with a reason | `scripts/maps.ts check` (`report` lists every result) |
| Drawings: solid means from the book, dashed means placed by us | `docs/maps/*.svg` (Meldan whole and center; Pafogai Du; world, Northshore, United Cities) |

**"Book" and "placed by us".** A placement is **book** when the book fixes
where it is relative to things already on the map: a direction, and a
distance where one is given. The outline may still be ours (a district's
edges, a pyramid's footprint). It is **placed by us** when the book doesn't
say where it is, so we chose. Every map also needs one anchor that is ours:
Meldan's summit, Pafogai Du's south-west corner, Meldan on the globe.

**How the lines were checked.**
- `scripts/world-guide.ts check` passes on all 249 lines.
- gpt-oss-120b read each geography line against its cited blocks: 92 lines,
  $0.045, now able to see SVG figures.
- I reviewed every flag. Real errors were fixed:
  - "coming in to land"; "the road to the left";
  - the pyramid walks were in the past;
  - "later" in wg-384, which had the chapter order backwards;
  - wg-375: the peninsula was offered to the people leaving Redshire, not
    to the Arctics. The checker caught that one.
- The remaining 26 flags are false positives. Mostly the checker reads the
  entity name as a speaker, or can't see the chapter's place header.
  Two are misreadings: wg-319 and wg-345.

**Scope.** Places only. Not included: Minpentai game boards, the insides of
buildings, and the positions of units during the battle.

## Meldan

**The book fixes:**
- The mountain is in the center (c26-b22).
- Districts around it (c26-b24, b26, b28):
  - business district to the east;
  - Kalimar to the south;
  - a residential district to the west.
- One commute, told three times (c1, c6, c32):
  - Kalimar footpath, then a sky bridge over a busy road;
  - from the bridge, the road runs about 2 km and turns right toward the
    mountain;
  - just past the bridge, a tunnel with a Y.
- Left at the Y:
  - parliament, about 20 minutes' walk;
  - the Order's tower, at the top of a two-hundred-meter staircase.
- The view from parliament's roof (c32-b105 to b108): Kalimar in front, the
  commercial district to the left, Greater Plum Harbor further left, the
  concert venue on the right edge, the mountain to the right. With Kalimar
  to the south, that puts parliament on the mountain's south-east slope.
- Greater Plum Harbor is a square nearly a kilometer wide.
- Near Gladias's street:
  - Galanar Square is 1 km south of the community center, on Kalimar's border;
  - Tapaia Square is 1 km further west.

**Ambiguous:**
- Is the tour's "business district" the same as the "commercial district"? We
  take it so.
- Does Gladias turn right at the Y on his walk to Greater Plum Harbor
  (chapter 3)? It's never said; he "almost never" turns left (c6-b143), so
  we take the right.
- Is the hill building where they meet Evelor Silverchat's headquarters?
  Likely, not stated.
- Which way the aeroplane faced when the Gelebor mountains were "on the
  right": not given.

**Placed by us:**
- the city's extent (about 13 × 11 km for 1.1 million people);
- every district outline;
- Gladias's house, in the residential district. The book never names his
  district.
- all walking routes;
- the aeroplane building;
- the Order's tower's side of the mountain;
- the Gelebor ridge;
- everything north of the mountain.

**Contradictions:** none. A small seam: in chapter 1 he steps off the sky bridge
onto a street, and in chapters 6 and 32 the path goes from the bridge into
the tunnel. Our layout has both: the tunnel mouth beside the street.

**Layout:** 44 tests hold. View `docs/maps/meldan-center.svg`.

## Pafogai Du

The best-fixed place in the book.

**The book fixes:**
- A 3.2 km square grid (c4-b53):
  - seventeen named streets, 200 m apart, running east–west;
  - thirty-three numbered streets, 100 m apart, running north–south.
- 0th street is the west edge (c18-b81); Dzai Gun is the south edge (c4-b50).
- From the south: Dzai Gun, Zin Go, Tan Kai (c18-b76 to b82).
- House numbers are meters from 0th street: the corner of 20th is number
  2000 (c2-b30, c2-b31). That puts the hotel, at 1565 Tan Kai, between 15th
  and 16th, and Gladias's walk (right out of the hotel, right on 17th, with
  the pyramid ahead) fits exactly.
- Mun Gui is 800 m north of Hun Min. The walk from 1990 Hun Min to 1842 Mun
  Gui comes out at 968 m, against the book's 958 m from number 2000.
- The pyramid is south of the city, 500 m tall. Its main door is at half
  height, where a row of trees circles it. A straight path rises from Dzai
  Gun at about 10%.

**Ambiguous:** which rows Hun Min and Mun Gui are on (only their gap is
given).

**Placed by us:**
- Hun Min's row;
- the pyramid's footprint: 0.75 km square, 0.6 km south of Dzai Gun;
- where the path steepens;
- the forest.

**Tension, not quite a contradiction.** A straight path that rises at 10% all
the way to a door 250 m up would be 2.5 km long. A pyramid with such a gentle
face would make the walk around it at half height take hours. The book has
that walk take twenty minutes (c24-b21). Our layout:
- keeps the 10% for the first stretch only ("the street curved up with about
  a ten percent slope", c4-b52);
- turns the last stretch into a steep stair up a 50° face;
- makes the ring at half height 1.7 km, about twenty minutes.

The cost: Zei's "about five minutes later" (c4-b54) only works if "somewhat
further up" is already high on the stair. The book doesn't rule that out.

**Layout:** 25 tests hold. View `docs/maps/pafogai-du.svg`.

## The world

**The book fixes:**
- **Northglade:**
  - "pretty far northeast" of Meldan, almost at the Arctic border, but over
    200 km from it;
  - about 1,000 km from Meldan;
  - in Northshore, on an island about 20 km wide.
- **The battle map (c29-b34).** The book's only drawn map:
  - two seas: an inlet from the north, a sea to the south-east;
  - Northglade on the southern coast;
  - the four groups' starts and routes.
- **c31-b4 explains a gap:** the island is too small for "the most
  simplified maps of the region". That is why the battle map doesn't show it.
- **Around Northshore:**
  - Elenar Forest lies west of Northshore;
  - a river is the Arctic border, north of Group North;
  - Thaldur is an island east of Northshore;
  - a peninsula dangles off Northshore's eastern end, toward Thaldur;
  - Telten is hundreds of kilometers east.
- **The United Cities:**
  - The co-governance diagram (c5-b46) gives fifteen cities and 26 links.
    Each city gives votes to its neighbors (c22-b49), so the links are
    neighbors.
  - Freetown is the farthest from Redshire except Silverbeach and Mabuli
    (c15-b25).
  - "The aks" are a cluster.
  - The Arctics are north of Redshire.
  - Arturia is west of Redshire, across water.
- **Further south and away:**
  - Messalia and Haragmir are "south", after the United Cities;
  - Dzego is "halfway across the world" from Veridia.

**Ambiguous:**
- **"Over two hundred kilometers inland" (c17-b101)** for a town on a 20 km
  island. We read "inland" as "from the border".
- **Telten:** on Thaldur, or on the Arctic mainland. We put it on Thaldur.
- **Whether Dzego shares the United Cities' continent:** c22-b46's "armies of
  this continent" stopped the Arctic offensive against Dzego.
- **Glasscrown:** only "far north" (polar night).
- **The battle map's scale and orientation:** we assume north is up; our
  scale, 2.6 km per pixel, makes Group North's cable run about 225 km, the
  book's "hundreds of kilometers".

**Placed by us:**
- where Veridia, the United Cities, the Arctic Empire, Dzego, Messalia and
  Haragmir sit on the globe;
- all coastlines, except Northshore's;
- the river's course;
- Eldil;
- Thaldur's size;
- the positions of the fifteen cities.

**Contradictions:**

1. **The battle groups' directions.**
   - The text: Group Center goes "directly east" (c29-b25) and Group South
     "toward the southeast" (c29-b27).
   - The battle map draws both heading east-north-east (51° and 58°).
   - No single rotation of the map fixes it: Group North and Group Naval
     already match with north up.
   - The layout follows the drawing. wg-367 and wg-368 are tested to fail,
     so the contradiction stays on record.
   - The alternative would follow the text and redraw the starts north-west
     of Northglade, discarding the drawing.
2. **The co-governance diagram isn't a map.**
   - Read to scale, Hapton and Inglewore would be farther from Redshire than
     Freetown, which c15-b25 rules out.
   - Its Arturia–Petersvil link crosses Redshire–Devanvil.
   - These are a drawing's limits, not errors in the book. But the diagram
     can't be traced as a map.
3. **A number, not a place.** The diagram puts 15 on Redshire–Devanvil.
   c2-b16 agrees, "Devanvil gets fifteen percent votes in Redshire". c10-b21
   says "Redshire chooses twelve percent of the seats in Devanvil's
   parliament". If the share can differ by direction, there is no
   contradiction, but the diagram shows one number per link. This matters
   only if a map labels the links.

**The United Cities can be drawn.** A search starting from the diagram's
positions (6 km per pixel) moved cities as little as possible until every
relation held:
- no link crosses another;
- no link is longer than 900 km;
- the aks are within 500 km of each other;
- Freetown, Silverbeach and Mabuli are farthest from Redshire, in the
  book's order;
- nothing lies due north of Redshire;
- Arturia is west of Redshire.

One topological catch: Redshire, Arturia and Petersvil are mutual
neighbors. For the links not to cross, Arturia must be north-west of
Redshire, so the Arturia–Petersvil link passes north of Redshire, across
water. That fits the book: the Arctic land invasion came "out of
never-before-seen underground tunnels" (c15-b8), not across a land border.

**Layout:** 41 tests hold and 2 contradictions fail as expected. Views:
`docs/maps/world.svg`, `world-northshore.svg`, `world-united-cities.svg`.

## Not tested, with reasons

24 lines aren't map relations:
- modes of travel without distance (train, air);
- terrain;
- sizes;
- places inside Freetown, Sadzu Du and Northglade, for which no map was
  asked;
- one identity (the two Y-intersections are the same).

Each is listed with its reason in the map files' `not_tested`. The checker
requires that every one of the 92 lines is either tested or listed there.

## Decisions for the owner

1. **The battle groups:** follow the drawing (as now) or the text?
2. **Should the United Cities layout keep Arturia north-west of Redshire?**
   It is the price of no crossing links. Or accept one crossing and keep the
   diagram's shape.
3. **The pyramid:** a steep final stair (as now), or a longer path that keeps
   10% throughout (which breaks the twenty-minute walk)?
4. **Should Dzego share the United Cities' continent?**
5. **Before any map goes public:** should the author see the "placed by us"
   list? Everything dashed on the drawings is invention.
