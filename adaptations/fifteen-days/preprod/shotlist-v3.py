"""Fifteen Days, shot list v3 (DRAFTED by the coding agent from the owner's review of v2, 2026-10-16; not approved).

v2 plus the owner's notes: more extreme close-ups and wides and fewer medium shots; close-ups from varied angles,
especially in the cafe; nobody sits in the corridor; natural blocking; the cafe table wider so they don't read as
lovers; the hall rebuilt (players in sunken pits at opposite edges, their faces on big screens, the tutorial's
holograms over the floor, physical towers on robotic bases, tiers below and a standing overlook at the top); the
lobby gets a close-up and a shot from the street through the window. Writes shotlist-v3.json.
"""
import json
from pathlib import Path

v2 = json.loads(Path(__file__).with_name("shotlist-v2.json").read_text())
G = dict(v2["geography"])
G["hall"] = ("A round hall inside the mountain, seen below its ceiling: good seats in tiers near the floor, a second tier above, and a "
             "standing overlook with a railing at the very top (where Zei and Bai watch). Deluin's sunken pit at the west edge of the floor, "
             "Kau's at the east, each facing outward with the crowd's tiers rising above them; neither can see the holograms. Over the "
             "floor, the tutorial's holograms and physical towers on robotic bases; above, big screens show each player's face. Deluin "
             "always faces screen-right, Kau screen-left.")
G["gallery"] = ("The standing overlook at the top of the hall: Zei and Bai stand at the railing, Zei on the left, Bai on the right, "
                "facing the floor (south); the second tier seated just below them, the good seats further down; the holograms and the "
                "players' big screens across the hall. Cameras stay on the hall side of the railing for singles.")
G["courtyard"] = G["courtyard"].replace("The table for four runs", "A wide table for four (room to spare between them) runs")
G["lobby"] = G["lobby"] + " A camera outside on the street can look in through the tall window at Zei's table."

E = {}  # id -> fields to replace
def e(id, **kw): E[id] = kw
# The hall, rebuilt after the owner's notes on H01-H04.
e("H01", who=["D", "K"], size="EWS, from the standing overlook, below the ceiling", action="The hall from the top: tiers of a varied crowd falling away to the floor; over the floor, the tutorial's holograms in two colours (cyan and amber), glowing towers, streams of gliders and ships, walls building; big screens hanging above show the two players' faces in close-up; far apart at opposite edges, two small sunken pits with one player in each.", purpose="Establish the hall, its tiers, the holograms, the screens, and the players' isolation. Place and date on screen (c14-b1).")
e("H02", size="WS, low among the towers", action="Down among the game: physical tower pillars on small robotic bases rolling to new places, holographic gliders and ships shooting around them in cyan and amber, a holographic wall building itself; the tiers rising beyond.", purpose="The game as the audience sees it (broadcast imagined).")
e("H03", size="MS, high angle looking down into his pit", action="{D} in his sunken pit at a large glowing console, glasses on a long cable running behind him, calm and cool; the crowd's tiers rise high above him; on a big screen above, his own face in close-up.", purpose="Deluin: alone in a hole, watched by a thousand.")
e("H04", composite="tutorial board (two colours, mostly blacked out)", action="Deluin's console screen: the tutorial's flat board in two colours, most of it blacked out; only his own corner and a ring of walls show.", purpose="What a player sees: almost nothing. Composited from the tutorial, never drawn.")
e("H05", size="ECU", action="{K}'s face in his pit, sweat beading under the cabled glasses, jaw tight, console glow from below.", purpose="Kau: under pressure. Faces the other way to Deluin.")
e("H06", size="WS, audience cutaway", action="The good seats near the floor: a varied crowd of many ages, builds and skin tones in clothes of many colours, an old man leaning forward on his cane, a mother pointing for her child, two teens whispering; hologram light on their faces.")
e("H07", action="The holographic walls stand as the last gliders break; the crowd rises in a swell of noise; the big screen cuts to Deluin's face.")
e("H08", size="CU, high angle into the pit", action="{D} lifts the glasses off; the cable falls behind his arm; a small private smile.")
# The gallery: standing overlook; more extremes.
e("G01", size="EWS, from the floor looking up", action="Far above the crowded tiers, at the top of the hall, the standing overlook and its railing: {Z} and {B}, tiny, leaning on it among a few other standing people.")
e("G02", size="WS two-shot from behind", action="From behind, at the overlook railing: {Z} on the left leans forward, absorbed in the holograms far below; {B} on the right, half turned away, head down over something in her hands; the whole hall below them.")
e("G03", size="CU, low angle from the hall side", action="{Z} leaning on his forearms on the railing, eyes on the game below, admiring; hologram light on his face.")
e("G04", size="ECU INSERT", action="{B}'s fingers prying open a small electronic gadget with a tiny tool on the flat top of the railing: a little circuit board and wires.")
e("G05", size="CU, three-quarter from her right", action="{B} at the railing, eyes on her gadget, not looking up, dry.")
e("G06", size="ECU", action="{Z}'s eyes turn to her, one eyebrow raised.")
e("G08", size="EWS POV, straight down over the railing", action="Straight down past the crowd's heads to the floor far below: the holographic ring of walls holding against streams of gliders.")
e("G09", size="CU, side-on profile", action="{B} glances sideways at him, wry.")
e("G10", size="WS side two-shot", action="{B} sets the gadget on the rail and leans out over the railing to study the board below; {Z} straightens and turns to watch her.")
# The corridor: everyone stands; extremes.
e("C02", who=["D", "Z", "B"], size="MS, from behind Zei and Bai", action="From behind {Z} and {B}, standing in the foreground: the elevator doors slide open and {D} steps out, sees them, and brightens.")
e("C01", size="EWS, down the length of the corridor", action="The long round-topped stone corridor with a row of elevator doors, a few people passing far off; near one elevator {Z} stands waiting, shifting on his feet; {B} leans against the opposite wall, arms crossed, looking away.")
e("C03", size="CU, three-quarter", action="{Z}, standing, eager, half a step toward him.")
e("C04", size="CU, low three-quarter", action="{D}, standing in the elevator doorway, easy and friendly.")
e("C05", size="CU", action="{Z}, standing, a self-deprecating grin, rubbing the back of his neck.")
e("C06", size="WS, past Zei's shoulder", action="{B} small against the far wall, standing, arms crossed, looking off down the corridor, bored; {Z}'s shoulder soft in the foreground.")
e("C08", size="ECU", action="{Z}'s grin, delighted.")
e("C10", size="ECU", action="{B}'s shrug and a sour twist of her mouth.")
e("C11", size="EWS", action="{D}, small, walking away down the long corridor, back to us; {Z} in the foreground, standing, lifts a hand.")
# The cafe: the wide table; varied close-up angles.
e("F01", who=["D", "B", "R"])
e("F05", size="WS side two-shot", action="{D} and {B} laughing across the wide table, plenty of room between them; {D} spots someone and waves.")
e("F06", size="WS", action="{Z} drags a chair to the end of the table and drops into it.")
e("F07", size="WS three-shot from the west, waist-up", action="All three at the wide table, well apart: {D} on the left (north side), {B} on the right (south side), {Z} at the far end between them, at right angles.")
e("F08", who=["R", "D", "B", "Z"], action="{R} glides up beside the wide table where {D} and {B} sit across from each other, well apart, and {Z} sits at the end.")
e("F09", size="CU", action="{R} beside the table, its face screen kind, tray level.")
e("F11", size="ECU, high angle", action="{Z}'s eyes over the top of the paper-thin menu, looking down at it.")
e("F13", size="CU, low three-quarter", action="{Z}, the menu in his hands, explaining.")
e("F14", size="CU, profile", action="{B} holding her menu, glancing up from it at the two of them, unhappy.")
e("F15", size="CU, frontal", action="{Z} realises he's talking to a foreigner, turns to him.")
e("F16", size="CU, three-quarter from Zei's side", action="{D}, menu in hand, modest.")
e("F18", size="CU, high angle", action="{D} leaning over his menu, reading it closely.")
e("F19", size="ECU", action="{Z}'s eyebrows rising as he listens.")
e("F21", size="CU, low angle", action="{D}, a mock-stern face with a playful smile, no gestures: a joking lecture.")
e("F22", size="CU, three-quarter", action="{Z}, impressed and a bit put out.")
e("F23", size="CU, from across the table", action="{B} puts her menu down on the table.")
e("F25", size="ECU", action="{Z} nods, a bit confused.")
e("S01", size="WS side two-shot", action="{R} pours tea into two cups between {Z} and {D}, seated at right angles at the wide table.")
e("S02", size="ECU INSERT, top-down", action="{D}'s fingers, absent-mindedly taking sugar cubes from a little bowl and setting one on another.")
e("S03", size="CU, three-quarter from Zei's side", action="{D}, eyes on Zei, not on his hands.")
e("S04", size="CU, low three-quarter", action="{Z}; behind him, small and soft, {B} at her table with headphones on.")
e("S05", size="CU, profile", action="{D}, warm, thinking about home.")
e("S07", size="CU, frontal", action="{D}: 'Less cameras, more castles.'")
e("S08", size="ECU", action="{Z}'s eyes drop to the table; a smile starts.")
e("S10", size="CU, high angle", action="{Z}, amused.")
e("S11", size="CU, high angle", action="{D} looks down at the cubes as if for the first time, and smiles.")
e("S13", size="WS side two-shot", action="{Z} and {D} both laughing, at right angles at the wide table.")
e("S14", size="CU cutaway", action="{B} at her table, headphones on, handheld in her hands, looking straight ahead; her eyes slide toward them.")
e("R01", size="CU, low three-quarter", action="{D}, leaning in, eager and inviting.")
e("R02", size="CU", action="{Z}, a little embarrassed; {B} small and soft behind him.")
e("R03", size="ECU INSERT", action="{Z}'s wrist: he turns it to glance at his watch.")
e("R05", size="CU, profile", action="{D}, playful.")
e("R06", size="CU, from behind her table", action="{B} glances back over her shoulder, absent-mindedly.")
e("R10", size="WS side two-shot", action="{Z} and {D} exchange an amused look.")
e("D02", size="CU", action="{D} at the gate, on the street side, turns back to Zei.")
e("D06", size="EWS", action="{D}, small and alone in the long street, stops under a lamp and takes out his small device.")
e("D07", size="ECU", action="{D}'s face lit by the screen, hesitating.")
e("D09", size="EWS, high", action="At dusk, {Z} walks back across the emptying courtyard toward {B}'s small table; she sits alone, headphones on.")
e("L02", size="CU", action="{Z}, distraught, tapping his device again; an untouched bowl of rice and vegetables and a tea cup in front of him.")
e("L06", size="ECU", action="{Z}'s eyes lift to her.")
e("L11", size="ECU", action="{B}'s eyes reading the screen; her face unreadable.")

shots = []
for s in v2["shots"]:
    t = {**s, **E.get(s["id"], {})}
    shots.append(t)
    if s["id"] == "L01":  # the owner's lobby: B's mood, plus the shot from the street and a close-up
        shots.append({"id": "L01b", "scene": "lobby", "size": "WS, from the street outside, through the tall window", "who": ["Z"],
                      "action": "From the dark street outside, through the tall window: {Z} alone at his table in the warm, empty lobby restaurant, small, head down over his device.",
                      "line": None, "look": "-", "dur_s": 4, "purpose": "Seen from outside: alone (owner's note)."})
sizes = {}
for s in shots:
    k = s["size"].split(",")[0].split(" ")[0]
    sizes[k] = sizes.get(k, 0) + 1
json.dump({"about": __doc__.strip(), "geography": G, "shots": shots, "sizes": sizes},
          open(Path(__file__).with_suffix(".json"), "w"), indent=2, ensure_ascii=False)
print(len(shots), "shots,", sum(s["dur_s"] for s in shots), "s; sizes:", sizes)
v2s = {}
for s in v2["shots"]:
    k = s["size"].split(",")[0].split(" ")[0]; v2s[k] = v2s.get(k, 0) + 1
print("v2 sizes:", v2s)
