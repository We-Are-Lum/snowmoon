"""Fifteen Days, shot list v2 (DRAFTED by the coding agent from the owner's re-shoot notes, 2026-10-16; not approved).

Writes shotlist-v2.json. Names are written {Z} {B} {D} {K} {R} so prompts can describe people, never name them.
Screen directions (180-degree rule) per scene are in GEOGRAPHY; looks are the subject's eyeline in frame.
"""
import json
from pathlib import Path

GEOGRAPHY = {
    "hall": "Deluin's pod on the west edge of the floor, Kau's on the east edge, each facing outward to the wall with its back to the holograms; the holograms rise in the middle. Deluin is always shot facing screen-right, Kau screen-left, so they read as opponents who never see each other.",
    "gallery": "High on the hall's north side. At the railing Zei stands on the left, Bai on the right, both facing the hall (south). Cameras stay on the hall side of the railing for singles: Zei looks screen-right when he turns to Bai, Bai screen-left to him. The crowd sits just below the railing.",
    "corridor": "The elevator doors are on the west wall. Deluin steps out of the elevator on the left of frame and faces right; Zei faces left; Bai leans on the east wall behind Zei. After Deluin leaves (north, away down the corridor), Zei and Bai walk south toward the camera, Zei on the left, Bai on the right.",
    "courtyard": "The table for four runs east-west in the middle of the courtyard. Deluin sits on its north side, Bai across from him on the south side, and Zei pulls a chair to the east end, at right angles to both. Cameras stay on the west side: Deluin looks screen-right, Zei screen-left, Bai (at the table) screen-left. Bai's later table is a small round table just east of the end, behind Zei, so she is in the background of Zei's singles and of the side two-shots. The street gate is at the north-east corner.",
    "gate": "The gate at the courtyard's north-east corner, the street beyond. Deluin on the street side, left of frame, facing right; Zei inside the gate, right of frame, facing left (the café's directions kept).",
    "lobby": "Zei's table by the tall windows (west). Zei sits on the east side facing the window, looking screen-left; Bai sits across from him on the window side, looking screen-right. The robot's counter is on the east wall; the lobby entrance south.",
}

S = []
def shot(id, scene, size, who, action, line=None, look="-", dur=3, purpose="", optional=False, insert=None):
    S.append({"id": id, "scene": scene, "size": size, "who": who, "action": action, "line": line, "look": look,
              "dur_s": dur, "purpose": purpose, **({"optional": True} if optional else {}), **({"composite": insert} if insert else {})})

# Beat 1, the hall
shot("H01", "hall", "EWS, high from the back of the stands", [], "The vast hall inside the mountain: tiers packed with a varied crowd; the game's holograms glowing in the middle of the floor; far apart on opposite edges, two tiny pods, one player in each, facing the walls.", None, "-", 4, "Establish the hall, its scale, and the players' isolation. Place and date on screen (c14-b1).")
shot("H02", "hall", "WS, low angle from the floor", [], "Among the holograms: thin black pillar towers with glowing cube tops; a ring of luminous walls holding as streams of small glowing gliders crash into it; the crowd's tiers rising beyond.", None, "-", 3, "The game, as the audience sees it (broadcast imagined).")
shot("H03", "hall", "MS, front three-quarter", ["D"], "{D} seated in his dark pod at a large glowing console, game glasses on a long cable running behind him, calm and cool; a dark partition behind him hides the holograms.", None, "R", 3, "Deluin: patient, unbothered.")
shot("H04", "hall", "INSERT", [], "Deluin's console screen: the flat 2D game board, large parts of it blacked out, a tight ring of walls around his base.", None, "-", 2, "What a player sees: almost nothing.")
shot("H05", "hall", "MS, front three-quarter", ["K"], "{K} hunched in his pod on the far side at his console, glasses on a cable, sweating, jaw tight, focused down on his board.", None, "L", 3, "Kau: under pressure. Opponents face opposite ways.")
shot("H06", "hall", "MS, audience cutaway", [], "Spectators in the tiers, varied in age, build and skin tone and in clothes of many colours: an old man leaning forward on his cane, a mother pointing for her child, two teens whispering; hologram light on their faces.", None, "-", 3, "A real, mixed crowd, not a uniform one.")
# The gallery
shot("G01", "gallery", "WS, from across the hall, looking up", ["Z", "B"], "High up at the gallery railing, {Z} and {B}, small, leaning on it; the crowd seated just below them; hologram light from below.", None, "-", 3, "Establish where Zei and Bai watch from.")
shot("G02", "gallery", "MS two-shot from behind", ["Z", "B"], "From behind, {Z} leans on the railing on the left, absorbed in the game below; {B} on the right, half turned away, hunched over something in her hands; the full hall below.", None, "-", 3, "They're together, but only he is watching.")
shot("G03", "gallery", "MCU, from the hall side, slightly below", ["Z"], "{Z} leaning on his forearms on the railing, eyes on the game below, admiring.", "b1-1 Zei: You'd think after making it this far…", "down", 4, "Zei admires Deluin.")
shot("G04", "gallery", "INSERT", ["B"], "{B}'s hands prying open a small electronic gadget with a tiny tool on the flat top of the railing: a little circuit board and wires.", None, "-", 2, "Bai's idle tinkering (the owner's change).")
shot("G05", "gallery", "MCU", ["B"], "{B} at the railing, eyes on her gadget, not looking up, dry.", "b1-2 Bai: It wouldn't be so annoying if he wasn't so damn pretty.", "down", 3, "")
shot("G06", "gallery", "CU", ["Z"], "{Z} turns to her, one eyebrow raised.", None, "R", 2, "Zei's look (script).")
shot("G07", "gallery", "MCU", ["B"], "{B} snaps the gadget's casing shut and shrugs, without looking at him.", "b1-3 Bai: Nah, way too fake for me.", "down", 2, "Replaces the spit.")
shot("G08", "gallery", "POV, high angle down over the railing", [], "Looking down past the backs of the crowd's heads to the holograms far below: the ring of walls holding against the gliders.", "b1-4 Zei: Such patience… (over)", "-", 3, "What Zei admires.")
shot("G09", "gallery", "MCU", ["B"], "{B} glances sideways at him, wry.", "b1-5 Bai: Total wimp, just like you. But it gets you guys the W.", "L", 4, "")
shot("G10", "gallery", "MS side two-shot", ["Z", "B"], "{B} sets the gadget on the rail and leans over the railing to study the board below; {Z} turns to watch her.", None, "-", 3, "The game catches her eye.")
shot("G11", "gallery", "CU", ["B", "Z"], "{B}'s face lit from below by the holograms, eyes narrowed, studying the pieces; {Z} soft in the background over her shoulder, watching her.", "b1-6 Bai: That other loser's toast…", "down", 5, "Bai reads the game better than she lets on.")
shot("H07", "hall", "WS", [], "The holograms' walls stand as the last gliders break; the crowd rises in a swell of noise.", None, "-", 3, "Deluin wins (c14-b94). Alarm, crowd swell, no announcer words.")
shot("H08", "hall", "MCU", ["D"], "{D} lifts the glasses off; the cable falls behind his arm; a small private smile.", None, "R", 2, "")
# Beat 2, the corridor
shot("C01", "corridor", "WS establishing", ["Z", "B"], "The round-topped, polished stone corridor with a row of elevator doors; a few people passing far off; {Z} waits near one elevator door; {B} leans on the opposite wall behind him, arms crossed.", None, "-", 3, "Why they're here: waiting for Deluin to come up.")
shot("C02", "corridor", "MS", ["D"], "The elevator doors slide open; {D} steps out, sees them, and brightens.", None, "R", 3, "")
shot("C03", "corridor", "MCU", ["Z"], "{Z}, eager.", "b2-1 Zei: Good job out there.", "L", 2, "")
shot("C04", "corridor", "MCU", ["D"], "{D}, easy and friendly.", "b2-2 Deluin: Thanks. Yeah, the walls held out…", "R", 4, "")
shot("C05", "corridor", "MCU", ["Z"], "{Z}, a self-deprecating grin.", "b2-3 Zei: Yeah, please ignore the ugly style…", "L", 4, "")
shot("C06", "corridor", "MS, past Zei's shoulder", ["B", "Z"], "{B} in the background against the wall, arms crossed, looking off down the corridor, bored; {Z}'s shoulder soft in the foreground.", None, "-", 2, "Bai's disinterest.")
shot("C07", "corridor", "MCU", ["D"], "{D} asks.", "b2-4 Deluin: Patience often does, until you win. Hey, do you want to get tea later?…", "R", 5, "")
shot("C08", "corridor", "CU", ["Z"], "{Z}, delighted.", "b2-5 Zei: Sure, yeah, that works well for me!", "L", 2, "")
shot("C09", "corridor", "OTS from behind Bai", ["D", "B"], "Over {B}'s shoulder, {D} turns to her, open and warm.", "b2-6 Deluin: Great, I'll see you then. Bai, you're welcome to come too…", "R", 4, "")
shot("C10", "corridor", "CU", ["B"], "{B} shrugs, disgruntled.", None, "L", 2, "")
shot("C11", "corridor", "WS", ["D", "Z"], "{D} walks away down the corridor, back to us; {Z} in the foreground lifts a hand.", "b2-7 Zei: See you.", "-", 3, "")
shot("C12", "corridor", "MS walk-and-talk, tracking ahead of them", ["Z", "B"], "{Z} and {B} walk the other way toward camera, other people passing; he turns to her, hopeful.", "b2-7 Zei: So are you gonna come? Should be fun!", "-", 3, "They walk because they're leaving.")
shot("C13", "corridor", "MCU walking", ["B"], "{B} walking, not looking at him.", "b2-8 Bai: He's your competition, remember?", "L", 2, "")
shot("C14", "corridor", "MCU walking", ["Z"], "{Z} walking, teasing.", "b2-9 Zei: Take it easy, you're my competition too.", "R", 2, "")
shot("C15", "corridor", "CU walking", ["B"], "{B} walking, a sly smile.", "b2-10 Bai: 'Was.' And you know I hate you…", "L", 4, "Same angle as C13: continuity.")
shot("C16", "corridor", "CU walking", ["B"], "{B} walking; the smile drops, serious.", "b2-11 Bai: Deluin? We don't know anything about this guy.", "L", 3, "")
shot("C17", "corridor", "MS two-shot walking", ["Z", "B"], "{Z} grins and nudges her shoulder with his; {B} rolls her eyes, half smiling.", "b2-12 Zei: So let's get to know him…", "-", 4, "")
# Beat 3, the café
shot("F01", "courtyard", "EWS establishing, high from the west", ["D", "B"], "The courtyard café at night: close-set tables full of people eating and talking, the shade tree hung with little lights, megastructures above the rooftops; at the table for four in the middle, {D} and {B}, small, laughing.", None, "-", 4, "Establish the courtyard and the table.")
shot("F02", "courtyard", "MS", ["Z"], "{Z} steps in through the courtyard's street gate, scanning the tables.", None, "-", 2, "Him looking around.")
shot("F03", "courtyard", "POV, long lens between diners", ["D", "B"], "Across the courtyard, between other diners: {D} and {B} at their table, laughing together.", None, "-", 2, "What he sees: they're already friends.")
shot("F04", "courtyard", "MS", ["Z"], "{Z} weaving quickly between the crowded tables, half running, slowing as he nears.", None, "-", 2, "He hurries, but not at the table.")
shot("F05", "courtyard", "MS two-shot, side", ["D", "B"], "{D} and {B} laughing across the table; {D} spots someone and waves.", "b3-1 Deluin: Hey, over here! We were just talking about you!", "R", 3, "")
shot("F06", "courtyard", "MS", ["Z"], "{Z} pulls a chair to the end of the table and sits.", None, "-", 2, "")
shot("F07", "courtyard", "WS three-shot from the west, waist-up", ["D", "B", "Z"], "All three at the table: {D} on the left (north side), {B} on the right (south side), {Z} at the far end between them, at right angles.", None, "-", 2, "The table's geography, used for every later shot.")
shot("F08", "courtyard", "MS", ["R"], "{R} glides up beside the table.", None, "-", 2, "")
shot("F09", "courtyard", "MCU", ["R"], "{R} at the table, its face screen kind, tray level.", "b3-2 Robot: jie mo kai tu jie hei ja ma?", "-", 3, "")
shot("F10", "courtyard", "INSERT", [], "The robot's hands offering paper-thin tablet menus; hands take them.", None, "-", 2, "The menu is a paper-thin tablet.")
shot("F11", "courtyard", "CU", ["Z"], "{Z} looking down at the paper-thin menu in his hands.", "b3-3 Zei: Whoa / b3-4 Deluin: What is it? (over)", "down", 2, "")
shot("F12", "courtyard", "INSERT", [], "The menu: the book's own glyph picture on the paper-thin tablet.", None, "-", 3, "", insert="c14-b108")
shot("F13", "courtyard", "MCU", ["Z"], "{Z}, the menu in his hands, explaining.", "b3-5 Zei: I think these are some of the new symbols…", "L", 5, "")
shot("F14", "courtyard", "MCU", ["B"], "{B} holding her menu, glancing up from it at the two of them, unhappy.", None, "L", 2, "Bai, left out.")
shot("F15", "courtyard", "MCU", ["Z"], "{Z} realises he's talking to a foreigner, turns to him.", "b3-6 Zei: Have you heard about version nine?", "L", 2, "")
shot("F16", "courtyard", "MCU", ["D"], "{D}, menu in hand, modest.", "b3-7 Deluin: … I had a couple people mention it to me…", "R", 5, "")
shot("F17", "courtyard", "OTS from behind Deluin", ["Z", "D"], "Over {D}'s shoulder: {Z}, menu in hand, eyes going between the menu and him.", "b3-8 Zei: Hmmm. More straight horizontal lines than usual…", "L", 5, "")
shot("F18", "courtyard", "MCU", ["D"], "{D} leaning over his menu, reading it closely.", "b3-9 Deluin: Top right is 'kai', right?…", "R", 5, "")
shot("F19", "courtyard", "CU", ["Z"], "{Z} listening, eyebrows rising.", "b3-9 (continues)", "L", 4, "Reaction during a long line.")
shot("F20", "courtyard", "CU", ["Z"], "{Z}, astonished.", "b3-10 Zei: Wait, you know Dzegoban?", "L", 2, "")
shot("F21", "courtyard", "CU", ["D"], "{D}, a mock-stern face with a playful smile, no gestures: a joking lecture.", "b3-11 Deluin: The whole point of Dzegoban…", "R", 5, "")
shot("F22", "courtyard", "CU", ["Z"], "{Z}, impressed and a bit put out.", "b3-12 Zei: I'm impressed, you're almost a local already.", "L", 3, "")
shot("F23", "courtyard", "MCU", ["B"], "{B} puts her menu down on the table.", "b3-13 Bai: Actually, I don't think I want anything…", "L", 4, "")
shot("F24", "courtyard", "CU", ["B"], "{B}, standing now, headphones in hand, to Zei.", "b3-13 Bai: Zei, when you're done, come get me…", "L", 4, "")
shot("F25", "courtyard", "CU", ["Z"], "{Z} nods, a bit confused.", None, "R", 2, "")
shot("F26", "courtyard", "MS past Zei, soft foreground", ["B", "Z"], "Behind {Z}, {B} sits at the small round table, puts on big headphones and takes out her handheld.", None, "-", 3, "Bai's table, fixed for the rest of the scene.")
# Beat 4, the sugar wall
shot("S01", "courtyard", "MS side two-shot", ["Z", "D", "R"], "{R} pours tea into two cups between {Z} and {D}.", None, "-", 3, "")
shot("S02", "courtyard", "INSERT", ["D"], "{D}'s hand, absent-mindedly taking sugar cubes from a little bowl and setting one on another.", None, "-", 2, "Absent-minded: his eyes aren't on it.")
shot("S03", "courtyard", "MCU", ["D"], "{D}, eyes on Zei, not on his hands.", "b4-1 Deluin: So while visiting, I've been wondering…", "R", 6, "")
shot("S04", "courtyard", "MCU", ["Z", "B"], "{Z}; behind him, small, {B} at her table with headphones on.", "b4-2 Zei: Kids get into it pretty young here…", "L", 6, "Bai in the background.")
shot("S05", "courtyard", "MCU", ["D"], "{D}, warm, thinking about home.", "b4-3 Deluin: Sure. Yeah, we have our fair share…", "R", 6, "")
shot("S06", "courtyard", "INSERT", ["D"], "{D}'s hands still stacking while he talks: the cubes are becoming a little wall.", "b4-3 (continues)", "-", 3, "")
shot("S07", "courtyard", "MCU", ["D"], "{D}: 'Less cameras, more castles.'", "b4-3 (continues)", "R", 5, "")
shot("S08", "courtyard", "CU", ["Z"], "{Z} glances down at the table, notices, and smiles.", None, "down", 2, "Zei noticing.")
shot("S09", "courtyard", "INSERT", [], "A neat little wall of white sugar cubes between two tea cups.", None, "-", 2, "")
shot("S10", "courtyard", "CU", ["Z"], "{Z}, amused.", "b4-4 Zei: I see where you get your love of walls then.", "L", 3, "")
shot("S11", "courtyard", "CU", ["D"], "{D} looks down at the cubes as if for the first time, and smiles.", "b4-5 Deluin: Yes. Simple, straightforward, useful.", "down", 3, "")
shot("S12", "courtyard", "INSERT", ["Z"], "{Z}'s finger flicks one cube out of the bottom row: the wall now has a door.", None, "-", 2, "")
shot("S13", "courtyard", "MS side two-shot", ["Z", "D"], "{Z} and {D} both laughing.", None, "-", 3, "")
shot("S14", "courtyard", "MS cutaway", ["B"], "{B} at her table, headphones on, handheld in her hands, looking straight ahead; her eyes slide toward them.", None, "R", 2, "Bai, listening while pretending not to.")
# Beat 5, Redshire and fifteen days
shot("R01", "courtyard", "MCU", ["D"], "{D}, leaning in, eager and inviting.", "b5-1 Deluin: Why don't you come visit?…", "R", 6, "")
shot("R02", "courtyard", "MCU", ["Z", "B"], "{Z}, a little embarrassed; {B} small behind him.", "b5-2 Zei: Well, budget will be pretty tight for…", "L", 3, "")
shot("R03", "courtyard", "INSERT", ["Z"], "{Z}'s wrist: he turns it to glance at his watch.", None, "-", 2, "")
shot("R04", "courtyard", "CU", ["Z"], "{Z}, smiling.", "b5-2 Zei: …about fifteen days.", "L", 3, "")
shot("R05", "courtyard", "MCU", ["D"], "{D}, playful.", "b5-3 Deluin: Oh yeah, then I can use some of my winnings…", "R", 4, "")
shot("R06", "courtyard", "MS", ["B"], "{B} at her table glances back over her shoulder, absent-mindedly.", None, "L", 2, "")
shot("R07", "courtyard", "MCU", ["D"], "{D} leans out and calls across, loudly.", "b5-4 Deluin: You're welcome to come too, Bai!", "R", 2, "")
shot("R08", "courtyard", "MS", ["B"], "{B} makes a big show of pulling one side of her headphones off; loud music blares.", "b5-5 Bai: What?!!", "L", 2, "")
shot("R09", "courtyard", "CU", ["B"], "{B} points at the headphones, then pops them back on, playing it off as if she can't hear them.", "b5-5 Bai: Dreadnaught!! It's good! You should check it out.", "L", 4, "")
shot("R10", "courtyard", "MS side two-shot", ["Z", "D"], "{Z} and {D} exchange an amused look.", None, "-", 2, "", optional=True)
# Beat 6, the gate
shot("D01", "gate", "WS establishing", ["D", "Z"], "The courtyard's street gate at dusk, lamps coming on; {D} and {Z} walk to it.", None, "-", 3, "")
shot("D02", "gate", "MS", ["D"], "{D} at the gate, on the street side, turns back to Zei.", "b6-1 Deluin: Dze go ba fau gie", "R", 3, "The contestants' chant (c12-b93).")
shot("D03", "gate", "MS", ["D"], "{D} holds up both open hands, ten fingers, then lowers one hand: five. One clear gesture: fifteen.", None, "R", 3, "Fifteen: the days to the final (c14-b32).")
shot("D04", "gate", "MS", ["Z"], "{Z} mirrors it, grinning: ten fingers, then five.", None, "L", 3, "")
shot("D05", "gate", "WS", ["D", "Z"], "{D} walks out under the lamps into the street, back to us; {Z} small at the gate.", None, "-", 3, "")
shot("D06", "gate", "MS", ["D"], "{D} alone in the street stops under a lamp and takes out his small device.", None, "-", 2, "")
shot("D07", "gate", "CU", ["D"], "{D}'s face lit by the screen, hesitating.", None, "down", 3, "")
shot("D08", "gate", "INSERT", ["D"], "His thumbs hover over the device, its screen turned away from us, then press: sent.", None, "-", 3, "The message is never shown.")
shot("D09", "courtyard", "WS", ["Z", "B"], "At dusk, {Z} walks back across the emptying courtyard toward {B}'s small table; she sits alone, headphones on.", None, "-", 5, "On-screen line (after c19-b124).")
shot("D10", "courtyard", "MS", ["B"], "{B} looks up as he arrives.", None, "L", 2, "", optional=True)
# Beat 7, the vigil
shot("L01", "lobby", "WS establishing", ["Z", "R"], "The hotel lobby restaurant late at night, nearly empty; {Z} alone at a table by the tall windows; {R} by the counter.", None, "-", 4, "Place on screen (c15-b48).")
shot("L02", "lobby", "MCU", ["Z"], "{Z}, distraught, tapping his device again; an untouched bowl of rice and vegetables and a tea cup in front of him.", None, "down", 3, "")
shot("L03", "lobby", "INSERT", [], "His device's screen: his fifth message.", None, "-", 3, "", insert="c15-b50")
shot("L04", "lobby", "MS", ["R", "Z"], "{R} refills his tea; he doesn't look up.", None, "-", 3, "Refilled four times (c15-b51).")
shot("L05", "lobby", "MS", ["B", "Z"], "{B} sits down across from him, without a word.", None, "R", 3, "")
shot("L06", "lobby", "CU", ["Z"], "{Z} looks up at her.", None, "L", 2, "")
shot("L07", "lobby", "INSERT", [], "The device lights up: the reply.", None, "-", 4, "The reply chime.", insert="c15-b53")
shot("L08", "lobby", "CU", ["Z"], "{Z} breathes out, eyes closing.", None, "down", 3, "")
shot("L09", "lobby", "INSERT", [], "The next message.", None, "-", 3, "", insert="c15-b55")
shot("L10", "lobby", "OTS from behind Zei", ["Z", "B"], "Over {Z}'s shoulder: he turns the screen to {B}.", None, "R", 2, "")
shot("L11", "lobby", "CU", ["B"], "{B} reads it; her face unreadable.", None, "R", 4, "Cut on her face.")

json.dump({"about": __doc__.strip(), "geography": GEOGRAPHY, "shots": S}, open(Path(__file__).with_suffix(".json"), "w"), indent=2, ensure_ascii=False)
print(len(S), "shots,", sum(s["dur_s"] for s in S), "s;", sum(1 for s in S if s.get("optional")), "optional")
