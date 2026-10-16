# Fifteen Days: sound effects

Sound effects: list and CC0 candidates (model-drafted working list, 2026-10-15). Freesound needs a login to download; the owner downloads. Every sound used gets a recipe entry with its source URL, licence (CC0) and author.

**How this was checked.** Freesound searches were run with the CC0 filter, then each sound's own page was read and its licence line checked: every candidate below shows **Creative Commons 0** on its page (2026-10-15). One search hit came back as Attribution 4.0 despite the filter (klankbeeld, "people ambience large hall 01", sound 171317) and is left out. Sounds whose uploaders add their own conditions on top of CC0 in the description (for example "see profile for CC BY attribution requirements" or "not for redistribution as stock") are also left out. Nobody has listened to any candidate yet: the fit notes come from titles and descriptions only.

**Conventions.** *(inferred)* means the script doesn't call for the sound outright; it is implied by the picture or the action. Laughter, Zei's breath out (beat 7) and all speech are voiced, so they're not listed. The headphone music leak (Dreadnaught) is handled separately, so no music was searched. Dzego is a bright future city, so tech sounds should be clean and soft (chimes, airy whooshes, quiet motors), never sci-fi blasts. Real-world ambiences with cars or horns may need cars filtered out or covered.

**Adding a sound.** Download it anywhere (or record it at home), then run `python3 scripts/add-sound.py fifteen-days <file> --url <its Freesound page> --effect "<effect>"`, or `--recorded-by "FID 6786"` for a home recording. The script checks the URL against this list, copies the file to scenes-out/fifteen-days/sfx/ and writes the source URL, licence and author to `sounds/recipe.json`.

---

## Beat 1 · The walls hold (hall, waiting room)

| effect | record at home? | candidates | note |
|---|---|---|---|
| Game hall ambience: big room, hushed audience *(inferred: a semifinal with spectators)* | no | [people ambience large hall 02.wav](https://freesound.org/people/klankbeeld/sounds/171462/), klankbeeld, 2:55, CC0 · [Crowd Talking Quietly Stadium.mp3](https://freesound.org/people/FunWithSound/sounds/381373/), FunWithSound, 0:11, CC0 · [R08-48-Crowd in Reverberant Space.wav](https://freesound.org/people/craigsmith/sounds/480728/), craigsmith, 1:17, CC0 | Low murmur under the board; keep it hushed. |
| Gliders zooming around the board | no | [Whoosh (tiny)](https://freesound.org/people/Nakhas/sounds/569258/), Nakhas, 0:03, CC0 · [Sci Fi Wooshes_variations.wav](https://freesound.org/people/Alex_hears_things/sounds/400908/), Alex_hears_things, 0:44, CC0 · [DSGNWhsh_Cinematic Sci-fi Whoosh 02](https://freesound.org/people/KVV_Audio/sounds/729226/), KVV_Audio, 0:14, CC0 | Tiny whoosh layered, pitched up; avoid the cinematic one's weight. |
| Gliders crashing into symbols | no | [8-bit Soft Impact](https://freesound.org/people/JapanYoshiTheGamer/sounds/361268/), JapanYoshiTheGamer, 0:00.4, CC0 · [Soft Glitch Notification FX](https://freesound.org/people/CVLTIV8R/sounds/865975/), CVLTIV8R, 0:03, CC0 · [SF_1 Sharp glitch hit.wav](https://freesound.org/people/Yarmonics/sounds/441864/), Yarmonics, 0:01, CC0 | Small soft hits, many layered at low level. |
| Waiting room tone, the game heard through glass *(inferred)* | no | [Room_Tone_Ambience_Medium_Control_Low_Hum.wav](https://freesound.org/people/gchase/sounds/144046/), gchase, 2:14, CC0 · [hospital_hallway_waiting_room.flac](https://freesound.org/people/rthijs/sounds/614805/), rthijs, 2:36, CC0 | Quiet hum; muffle the hall sounds under it. |
| Bai spits into the trash can | yes (a soft spit, or water, into a lined bin) | [NPX Throat Clearing and Spit 2.wav](https://freesound.org/people/noahpardo/sounds/352407/), noahpardo, 0:02, CC0 · [Spit2.wav](https://freesound.org/people/tiptoe84/sounds/155900/), tiptoe84, 0:03, CC0 | Trim the throat-clear; keep it short. |
| Something lands in the trash can | yes | [Putting Something In The Trash Can](https://freesound.org/people/OutbreakProtocol/sounds/719578/), OutbreakProtocol, 0:08, CC0 · [Throwing away trash in can](https://freesound.org/people/mrrap4food/sounds/470628/), mrrap4food, 0:07, CC0 | Tiny thunk to sit under the spit. |

## Beat 2 · The corridor

| effect | record at home? | candidates | note |
|---|---|---|---|
| Quiet corridor room tone (rock inside the mountain, clean panels) | no | [Room_Tone_Ambience_Medium_Control_Low_Hum.wav](https://freesound.org/people/gchase/sounds/144046/), gchase, 2:14, CC0 · [room tone laundry room creepy ambient hum…](https://freesound.org/people/kyles/sounds/453549/), kyles, 1:02, CC0 | gchase is neutral; kyles may be too creepy. |
| Elevator door opens as Deluin comes out *(inferred from the image: an elevator door; book c14-b95)* | no | [Elevator_Door_Opening.wav](https://freesound.org/people/PagDev/sounds/562714/), PagDev, 0:04, CC0 · [Opening an elevator door sample.wav](https://freesound.org/people/Rshai/sounds/202604/), Rshai, 0:03, CC0 | Soften; a quiet glide suits a future building. |
| Elevator arrival chime *(inferred)* | yes (flick a wine glass, as the XfiXy8 recording did) | [Elevator Ding.wav](https://freesound.org/people/XfiXy8/sounds/467299/), XfiXy8, 0:04, CC0 · [Elevator_DingDong.wav](https://freesound.org/people/uniuniversal/sounds/634327/), uniuniversal, 0:06, CC0 | Wine-glass ding is clean and soft. |
| Footsteps: Deluin steps out, then walks away down the corridor | yes | [Footsteps one person CLEAN.wav](https://freesound.org/people/RaggedyAngst/sounds/546270/), RaggedyAngst, 3:08, CC0 · [Foot -Steps](https://freesound.org/people/davidkyoku/sounds/152901/), davidkyoku, 0:06, CC0 | RaggedyAngst: quiet corridor, starts and stops; add reverb. |

## Beat 3 · The café

| effect | record at home? | candidates | note |
|---|---|---|---|
| Courtyard café ambience, early evening (runs through beats 3 to 5) | no | [People talking at cafe ambience](https://freesound.org/people/priesjensen/sounds/482990/), priesjensen, 2:17, CC0 · [OUTSIDE QUIET CAFE : RESTAURANT, CROCKERY…](https://freesound.org/people/Anya_Media/sounds/437462/), Anya_Media, 2:27, CC0 · [city_square_outdoor_serving.wav](https://freesound.org/people/sphion/sounds/153545/), sphion, 2:06, CC0 | Anya_Media is quiet with a faint fountain; good bed. |
| Zei runs across the courtyard and pulls up short | yes (run and stop on paving) | [R11-21-People Running on Hard Floor.wav](https://freesound.org/people/craigsmith/sounds/480436/), craigsmith, 0:31, CC0 · [Footsteps - Exterior - running and stop, dirty, stony path](https://freesound.org/people/TILIADESIGN/sounds/591533/), TILIADESIGN, 0:39, CC0 · [Footsteps Gravel Running-Stop](https://freesound.org/people/KikeVilaplana/sounds/436525/), KikeVilaplana, 0:06, CC0 | Hard floor fits best; gravel only if the courtyard's gravel. |
| Zei sits: chair pulled out *(drafted direction)* | yes | [Pulling out chair.m4a](https://freesound.org/people/chris.t/sounds/452884/), chris.t, 0:08, CC0 · [Wooden chair, push in, pull out.wav](https://freesound.org/people/SpliceSound/sounds/218316/), SpliceSound, 0:26, CC0 | Short scrape on a hard floor. |
| The robot waiter slides up to the table (book, c14-b105) | no | [Machine Noise 1](https://freesound.org/people/chungus43A/sounds/592802/), chungus43A, 0:01, CC0 · [Sound Design Elements-Robot mechanism-001](https://freesound.org/people/AudioPapkin/sounds/813060/), AudioPapkin, 0:04, CC0 · [Chair Rolling on Wood - Fast and Slow](https://freesound.org/people/neverak/sounds/708603/), neverak, 0:14, CC0 | Partial: no clean "wheeled robot" found; layer a soft motor with a rolling wheel. |
| Menu appears (soft UI chime) | no | [Bell Chime Alert](https://freesound.org/people/plasterbrain/sounds/419493/), plasterbrain, 0:01, CC0 · [Scratch Rise](https://freesound.org/people/CJspellsfish/sounds/727646/), CJspellsfish, 0:01, CC0 · [ui-popup-sfx](https://freesound.org/people/JeffPearson/sounds/849841/), JeffPearson, 0:00.3, CC0 | plasterbrain is a neutral bell-like UI chime. |
| Bai spins round to the adjoining table *(inferred: chair turn or scrape)* | yes | [8_Swivel chair.wav](https://freesound.org/people/15GPanskaZacekSamuel/sounds/461815/), 15GPanskaZacekSamuel, 0:10, CC0 · [Pulling out and back of swivel chair](https://freesound.org/people/focuss87/sounds/842599/), focuss87, 0:06, CC0 | Only if café chairs swivel; else use a scrape. |
| Bai puts on headphones *(inferred)* | yes (headphone rustle on and off) | [Loose Headphones Crunching #2](https://freesound.org/people/imnotdubMass/sounds/679992/), imnotdubMass, 0:49, CC0 · [RemovingHeadphones.wav](https://freesound.org/people/tabiCATcreations/sounds/415784/), tabiCATcreations, 0:02, CC0 | Cut one ear-cup rustle; the second could be reversed. |
| Bai's handheld beeps and taps *(inferred)* | partly (screen taps yes; beeps no) | [Hover 2](https://freesound.org/people/plasterbrain/sounds/237421/), plasterbrain, 0:00.2, CC0 · [Notification Sound](https://freesound.org/people/thehorriblejoke/sounds/583554/), thehorriblejoke, 0:00.4, CC0 · [Typing on an iPhone.mp3](https://freesound.org/people/Caitlin_100/sounds/365543/), Caitlin_100, 0:06, CC0 | Very quiet; background under the dialogue. |

## Beat 4 · The question and the sugar wall

| effect | record at home? | candidates | note |
|---|---|---|---|
| Tea poured | yes | [tea pour.wav](https://freesound.org/people/fryzu82/sounds/142330/), fryzu82, 0:05, CC0 · [PouringTea.mp3](https://freesound.org/people/shelbyshark/sounds/457276/), shelbyshark, 0:08, CC0 · [Teacup Teapot Table Quick Pour](https://freesound.org/people/fthrll/sounds/786673/), fthrll, 0:43, CC0 | fryzu82: teapot into porcelain cup; shelbyshark adds pot set down. |
| Cups set down, on saucers *(inferred)* | yes | [teacup set down](https://freesound.org/people/nikerk/sounds/764772/), nikerk, 0:01, CC0 · [Teacup on Saucer 170504_1507.wav](https://freesound.org/people/megashroom/sounds/391497/), megashroom, 0:22, CC0 · [Cup.wav](https://freesound.org/people/pbharri/sounds/426364/), pbharri, 0:00.5, CC0 | nikerk is café Foley, one clean take. |
| Spoon on a cup *(inferred; the script names no spoon)* | yes | [stir tea in cup.wav](https://freesound.org/people/cupido-1/sounds/433539/), cupido-1, 0:13, CC0 · [Metal spoon stirring.mp3](https://freesound.org/people/Caitlin_100/sounds/365505/), Caitlin_100, 0:06, CC0 | Use sparingly, if at all. |
| Sugar cubes stacked into a wall (small dry clicks) | yes (best recorded: stack real sugar cubes on a saucer or table) | none found that is CC0 and fits | Searches for sugar cubes, dominoes and stacking blocks found nothing usable. |
| Zei flicks a cube out of the bottom row | yes (flick a sugar cube on a tabletop) | none found that is CC0 and fits | Record with the stacking. |

## Beat 5 · Redshire and fifteen days

| effect | record at home? | candidates | note |
|---|---|---|---|
| Café ambience continues | no | as beat 3 | Same bed; level drops when Bai's music blares. |
| Bai pulls one side of her headphones off | yes | [RemovingHeadphones.wav](https://freesound.org/people/tabiCATcreations/sounds/415784/), tabiCATcreations, 0:02, CC0 · [taking off headphones and setting them down.m4a](https://freesound.org/people/addison42/sounds/546729/), addison42, 0:05, CC0 | Over-ear removal; the music leak goes on top (handled separately). |
| Zei glances at his watch | no sound needed | none | Silent action; a tiny tap at most, if any. |

## Beat 6 · The gate

| effect | record at home? | candidates | note |
|---|---|---|---|
| Dusk at the courtyard gate: city winding down, evening birds | no | [Dusk City Ambience.mp3](https://freesound.org/people/TheGloomWorker/sounds/474625/), TheGloomWorker, 0:26, CC0 · [City neighborhood ambiance with far traffic, road hum, birds at times at dusk](https://freesound.org/people/felix.blume/sounds/689356/), felix.blume, 2:27, CC0 · [AMBUrbn Large square and fountain with people in the evening, Malmö](https://freesound.org/people/vhio/sounds/816562/), vhio, 7:07, CC0 | TheGloomWorker has windchimes; far traffic may need masking. |
| Lamps coming on *(inferred: a soft hum or tick as they light)* | no | [Foley_Mechanism_Light_Buzz_Short_Loop_Mono_DR05.wav](https://freesound.org/people/Nox_Sound/sounds/553075/), Nox_Sound, 0:20, CC0 · [Bell Chime Alert](https://freesound.org/people/plasterbrain/sounds/419493/), plasterbrain, 0:01, CC0 | Partial: no clean "lamps on" found; a very low hum fade-in, or nothing. |
| Deluin types the message on his device | yes (type on a phone with key sounds off) | [phone unlock and typing](https://freesound.org/people/oliwoli/sounds/562275/), oliwoli, 0:56, CC0 · [Phone typing/texting](https://freesound.org/people/mimi_meow/sounds/717538/), mimi_meow, 0:26, CC0 · [Typing on an iPhone.mp3](https://freesound.org/people/Caitlin_100/sounds/365543/), Caitlin_100, 0:06, CC0 | oliwoli: no artificial key sounds, just fingers. |
| The hesitation, then the message sent | no | [Message sound.wav](https://freesound.org/people/Sunart1/sounds/592772/), Sunart1, 0:02, CC0 · [Message Sent](https://freesound.org/people/Froey_/sounds/760370/), Froey_, 0:01, CC0 | Soft send cue; silence before it carries the hesitation. |
| Zei walks across the courtyard at dusk *(inferred)* | yes | [Footsteps one person CLEAN.wav](https://freesound.org/people/RaggedyAngst/sounds/546270/), RaggedyAngst, 3:08, CC0 | Unhurried steps under the on-screen line, kept low. |

## Beat 7 · The vigil

| effect | record at home? | candidates | note |
|---|---|---|---|
| Hotel lobby restaurant in the evening, nearly empty | no | [220130_Asuncion_LobbyHotelGuarani_Morning](https://freesound.org/people/blaukreuz/sounds/747196/), blaukreuz, 3:49, CC0 · [MC Donalds quiet restaurant.WAV](https://freesound.org/people/Sandermotions/sounds/223255/), Sandermotions, 2:00, CC0 · [S15-15 Hotel lobby; bg walla.wav](https://freesound.org/people/craigsmith/sounds/675170/), craigsmith, 0:54, CC0 | Sandermotions: almost no guests, which fits "nearly empty". |
| Tea refilled by the robot *(inferred: the book says refilled four times, before the shot; an on-screen refill is optional)* | yes (pour) | [tea pour.wav](https://freesound.org/people/fryzu82/sounds/142330/), fryzu82, 0:05, CC0 · [Machine Noise 1](https://freesound.org/people/chungus43A/sounds/592802/), chungus43A, 0:01, CC0 | Pour plus a faint motor, if the robot is seen. |
| Bai sits down across from him | yes | [Pulling out chair.m4a](https://freesound.org/people/chris.t/sounds/452884/), chris.t, 0:08, CC0 · [Wooden chair, push in, pull out.wav](https://freesound.org/people/SpliceSound/sounds/218316/), SpliceSound, 0:26, CC0 | Quiet; she says nothing. |
| Message received chime (the reply, then the next message: twice) | no | [Soft-Notifications - Bell - Ding-Dong.mp3](https://freesound.org/people/LegitCheese/sounds/571513/), LegitCheese, 0:01, CC0 · [Message Receive](https://freesound.org/people/Froey_/sounds/760369/), Froey_, 0:01, CC0 · [Bell Chime Alert](https://freesound.org/people/plasterbrain/sounds/419493/), plasterbrain, 0:01, CC0 | Same family as beat 6's send cue, so they pair. |
| Phone vibrates on the table *(inferred, an alternative to the chime)* | yes | [Cell Notification Vibrate](https://freesound.org/people/CoryCoolguy/sounds/688629/), CoryCoolguy, 0:01, CC0 | Could go under the chime, or replace it. |

---

## No CC0 candidate found

- **Sugar cubes stacked into a wall** (beat 4). Record at home.
- **A sugar cube flicked out of the wall** (beat 4). Record at home.

Partial matches only (candidates listed, but none is a clear fit):
- **The wheeled robot sliding up** (beat 3): layer a soft motor with a rolling wheel.
- **Lamps coming on at dusk** (beat 6): a low hum fade-in, or leave it silent.

## Location beds (at least a minute, CC0)

Two picks per location, best first. Each sound's own page was checked on 2026-10-15: licence shown as Creative Commons 0, length a minute or more, and no extra conditions in the description. Nobody has listened yet: the notes come from titles and descriptions.

| location | candidates | note |
|---|---|---|
| Game/match hall, hushed audience (big reverberant room) | [people ambience large hall 02.wav](https://freesound.org/people/klankbeeld/sounds/171462/), klankbeeld, 2:54, CC0 · [R08-48-Crowd in Reverberant Space.wav](https://freesound.org/people/craigsmith/sounds/480728/), craigsmith, 1:17, CC0 | klankbeeld: 120 people in a church before a concert, language unclear, crowd goes quiet at the end (use that end; trim the laughs). craigsmith: very indistinct murmur, some coughs. |
| Players' waiting room (small quiet room tone, faint HVAC) | [Room_Tone_Ambience_Medium_Control_Low_Hum.wav](https://freesound.org/people/gchase/sounds/144046/), gchase, 2:13, CC0 · [Soft Room Tone](https://freesound.org/people/callmethefoo/sounds/744447/), callmethefoo, 1:37, CC0 | gchase: theatre control room, machine-rack hum (reads as HVAC). callmethefoo: soft quiet cabin room tone, if the hum is too much. Muffle the hall bed under either. |
| Quiet corridor inside the mountain arena (hard surfaces, near-silent) | [concrete_silence.wav](https://freesound.org/people/sturmankin/sounds/272317/), sturmankin, 1:49, CC0 · [Concrete Hallway with Air Conditioner](https://freesound.org/people/ecfike/sounds/474458/), ecfike, 1:44, CC0 | sturmankin: concrete room tone made for footsteps; nearest to silence. ecfike: ductwork and fluorescent hum down a concrete hall; listen for light buzz, keep low. |
| Courtyard café, early evening (light chatter, cups, birds) | [OUTSIDE QUIET CAFE : RESTAURANT, CROCKERY…](https://freesound.org/people/Anya_Media/sounds/437462/), Anya_Media, 2:27, CC0 · [AMBRest_Outdoors, Camley Street Natural Park, London, Cafe, Cutlrey Movement…](https://freesound.org/people/JW_Audio/sounds/808266/), JW_Audio, 5:06, CC0 | Anya_Media: quiet café, crockery, faint fountain, "general suburban city noise" (listen for cars). JW_Audio: park café, cutlery, talk, distant birds; London, so check for traffic and sirens. |
| Café street gate at dusk (quieter, evening air, distant hum) | [XY_City hum_Night_River_ambience.wav](https://freesound.org/people/softwalls/sounds/385104/), softwalls, 3:35, CC0 · [Plomodiern evening birds.wav](https://freesound.org/people/bruno.auzet/sounds/690330/), bruno.auzet, 4:51, CC0 | softwalls: quiet night city, distant traffic hum (a hum bed, no birds). bruno.auzet: swifts and birds at day's end, faraway car, ventilation. Layer both: hum under, birds low. |
| Nearly empty hotel lobby restaurant, evening | [Small Restaurant atmosphere.wav](https://freesound.org/people/Berwitz/sounds/263584/), Berwitz, 2:17, CC0 · [MC Donalds quiet restaurant.WAV](https://freesound.org/people/Sandermotions/sounds/223255/), Sandermotions, 1:59, CC0 | Berwitz: small, silent restaurant, some talk, cutlery and glasses (check the talk stays unintelligible). Sandermotions: almost no guests; listen for fast-food beeps or fryer alarms to cut. |

## The live game in the hall (CC0)

The layer over the hall bed while the game plays on the giant screen. The book supports the drones (c4-b81), the alarm buzz (c14-b86), the bell (c4-b76) and the audience gasp (c4-b134); the screen's game sounds are invented. Each sound's own page was checked on 2026-10-15: licence shown as Creative Commons 0, duration, author, and no extra conditions in the description. Nothing with intelligible speech, sports commentary or stadium chants. Nobody has listened yet: the notes come from titles and descriptions.

| effect | record at home? | candidates | note |
|---|---|---|---|
| Crowd reaction swells: a large audience murmuring up and down, tense and impressed | no | [G28-11-Mixed CrowdWalla - Some Reactions.wav](https://freesound.org/people/craigsmith/sounds/438370/), craigsmith, 1:48, CC0 · [crowd int show movement walla murmur active whispers no steps…](https://freesound.org/people/kyles/sounds/637466/), kyles, 0:59, CC0 · [G28-24-Whispering Crowd Walla.wav](https://freesound.org/people/craigsmith/sounds/438384/), craigsmith, 0:23, CC0 | craigsmith 438370: walla with "some awe reactions", the swells. kyles: indoor show audience, whispers. Whispering walla for the hushed troughs; layer and stack to sound like a thousand. |
| A collective gasp (short) | no | [small crowd gasp shock surprise](https://freesound.org/people/HowardV/sounds/264376/), HowardV, 0:09, CC0 · [CRWDReac_Crowd Gasping In Surprise, Voiced 01…XY-AKG214-96k.wav](https://freesound.org/people/ShangusBurger/sounds/763875/), ShangusBurger, 0:04, CC0 · [Crowd gasp.wav](https://freesound.org/people/RadioCounseling/sounds/635110/), RadioCounseling, 0:02, CC0 | HowardV: about 20 people in a small hall. ShangusBurger: medium crowd, drawn out (GameSoundCon walla, published for CC0 use). Stack two or three to sound larger. |
| A small drone buzzing past (hand-sized quadcopter) | no | [Tiny Hawk 2 short flight.wav](https://freesound.org/people/Sadiquecat/sounds/677833/), Sadiquecat, 0:45, CC0 · [Quadcopter Flyby (Multiple).mp3](https://freesound.org/people/5deMayo/sounds/524331/), 5deMayo, 0:22, CC0 · [Mini Quadcopter Flying Loop](https://freesound.org/people/simeonradivoev/sounds/383852/), simeonradivoev, 0:03, CC0 | Tiny Hawk 2 is a micro quad recorded indoors (mostly hovering; pan it for the pass). 5deMayo: real flybys, but a 5" quad, so pitch up and lower it. |
| Alarm buzz: short electronic alert as the game nears its end | no | [Soft Warning Buzzer](https://freesound.org/people/magnuswaker/sounds/641416/), magnuswaker, 0:00.7, CC0 · [UI Interaction Error Beep - Ghost Metro Ticket](https://freesound.org/people/TommasoMotteran/sounds/859155/), TommasoMotteran, 0:01, CC0 · [BiLevel Cab Car cabin buzzer](https://freesound.org/people/chungus43A/sounds/745668/), chungus43A, 0:05, CC0 | magnuswaker: soft synth buzz, five quick pulses. TommasoMotteran: clean, modern, "futuristic HMI". chungus43A: two short synth beeps. |
| PA bell before an announcement (soft "ding") | yes (flick a wine glass, as for the elevator chime) | [Synthesized Bell Tones](https://freesound.org/people/Sauron974/sounds/478253/), Sauron974, 1:15, CC0 · [Arpeg.wav](https://freesound.org/people/stib/sounds/493698/), stib, 0:06, CC0 · [Subway Station Chime](https://freesound.org/people/plasterbrain/sounds/419491/), plasterbrain, 0:03, CC0 | Sauron974: 14 synth bell tones made to precede paging announcements; pick one. stib: dry four-note airport-style chime. Keep it soft. |
| The screen's game sounds (gliders, hits) | no | as beat 1 | Invented, not in the book; keep under the crowd. |
