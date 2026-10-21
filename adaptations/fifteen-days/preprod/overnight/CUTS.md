# Fifteen Days: the two cuts (overnight 2026-10-16/17)

All of this was drafted by the coding agent and is for the owner to judge. Nothing is published or pushed.

## Re-render (one command)

```
cd /Users/nathan/snowmoon-scenes && /Users/nathan/snowmoon/.venv-voice/bin/python scripts/cut-v4.py fifteen-days both --render
```

This rebuilds both timelines, mixes them, renders them, and copies the results to
`scenes-out/fifteen-days/cuts/full.mp4` and `tight.mp4`. Use `full` or `tight` instead of `both` to do one cut.
The full cut takes about 7 minutes and the tight cut about 4. It costs $0 and runs entirely on this Mac.

**Swapping in pictures.** For each shot the cut takes the first of these that exists:
1. `adaptations/fifteen-days/preprod/overnight/cut-pictures.json`, a map of shot id to a repo-relative file (`{"F05": "images-out/preprod/pass/F05.png"}`), for picked frames;
2. `images-out/preprod/pass/<shot>.png`;
3. `images-out/preprod/test3/T3-<shot>.png`;
4. `images-out/preprod/thumbs/thumb-<shot>.png`, the grey shot-list sketches (placeholders);
5. `images-out/preprod/set/<shot>.png`, the set frame (a placeholder).

Five composite inserts use the book's own pictures: F12 is the menu (c14-b108); L03, L07 and L09 are the messages (c15-b50, -b53, -b55); H04 uses `refs/board-console-fog.png`.
After frames land or picks change, run the command again.

## Voices (provisional, for the owner to confirm)

- **Zei: zei-v4b** ("clear, grounded … middle pitch, slightly husky, casual and friendly").
- **Bai: bai-v3b** ("bright, sharp, clearly feminine … middle to high register … crisp consonants").

**Why.** The owner's notes asked for Zei to be more neutral and less nerdy, and for Bai to be slightly different and more feminine with less depth. These are measured proxies; nobody has listened yet.

| line | voice | median pitch | transcription error | loudness | clipping |
|---|---|---|---|---|---|
| L09 | zei-v3 (current) | 169 Hz | 0 | -19.4 LUFS | none |
| L09 | zei-v4a | 105 Hz | 0 | -21.1 | none |
| L09 | **zei-v4b** | 127 Hz | 0 | -22.4 | none |
| L33 | zei-v3 | 169 Hz | 0 | -21.3 | none |
| L33 | zei-v4a | 104 Hz | 0 | -22.8 | none |
| L33 | **zei-v4b** | 126 Hz | 0.03 ("Redshare") | -23.8 | none |
| L16 | bai.eq (current) | 199 Hz | 0.13 | -19.1 | peak 1.0, clips |
| L16 | bai-v3a | 186 Hz | 0.19 (adds "This is…") | -18.5 | none |
| L16 | **bai-v3b** | 209 Hz | 0.13 | -17.6 | none |
| L31 | bai.eq | 182 Hz | 0.03 | -24.7 | none |
| L31 | bai-v3a | 176 Hz | 0.03 | -23.6 | none |
| L31 | **bai-v3b** | 195 Hz | 0.03 | -20.8 | none |

- **Zei:** v3's 169 Hz is the bright, boyish sound the owner wanted away from. v4a at about 105 Hz is low for "middle pitch" at eighteen. v4b at about 127 Hz sits in an ordinary young male range and transcribes as cleanly as the others.
- **Bai:** v3b is the most feminine, the clearest and the only one with no added sound. It also doesn't clip, where the current bai.eq does.
- **Lines rendered:** all 17 Zei lines and 9 Bai lines were converted locally, at $0, with Chatterbox VC from the same private takes as lines-v2. They're in `scenes-out/fifteen-days/lines-v3/`, each with a recipe; the takes stay private. Bai's new lines have no EQ, since v3b isn't deep.
- **Across all 26 lines:** mean transcription error is 0.089 with the new voices and 0.116 with the old. Most misses are invented words ("Dzegoban", "Deluin") that both voices miss.
- **Listen to:**
  - L13: whisper heard "Should be **fine**" with v4b, where v2 was heard as "fun".
  - L24: "version nine" came out as "Raiden 9" with v4b and as "written nine" before.
- **To switch back:** change `VOICE` in `scripts/cut-v4.py` (for example `"Zei": ("lines-v2", "zei-v3")`, or `"Bai": ("lines-v2", "bai.eq")`) and re-render.

## How each cut is built (`scripts/cut-v4.py`)

**Shots and lines**
- The source is storyboard v4: 108 shots, in the order on the board.
- A line runs from the first shot that names it to the last, so b5-2 spans R02 to R04 with the watch insert in between. The shots it spans share the line's time in proportion to their storyboard lengths.
- Lines play one after another and never overlap. All 42 lines are in both cuts, word for word as the converted takes have them.

**Sound**
- **Acoustics:** each scene has its own; the gallery now counts as the hall overlook.
- **Beds:** one per place, all CC0, crossfaded over 1.5 s at each change of place.
- **The live game:** the swell over the first wide, the drone, the gasp, the alarm, and the swell as the walls hold.
- **The laugh:** Deluin's laugh as Zei comes in.
- **Dreadnaught v3:** loud for about 3 s when Bai pulls off one side of her headphones (R08). It then leaks thin and low-passed from the headphones after she puts them back on (R09).
- **Device sounds:** the synthesized ones.
  - Café: robot glide and greet, menu appears, three menu taps, robot acknowledge, robot glide for the tea.
  - Gate: Deluin's message sent.
  - Lobby: Zei's two taps and fifth message sent, robot glide for the refill, the reply received, the next message received.

**Picture, subtitles and loudness**
- **Subtitles:** the script's words, burned in white with a dark outline, at most two lines, split at sentence ends or commas. The robot's and the chant's lines are shown exactly as written.
- **End card B:** 8 s, from `adaptations/fifteen-days/end-card.json`.
- **Format and loudness:** 1920×1080 at 30 fps, H.264 with AAC, a slow push-in on each still, and -16 LUFS at -1 dBTP, as the podcast is mixed.

**Full:** every shot except the two marked optional (R10 and D10). Each shot holds at least its storyboard length, and a shot carrying a line holds the line plus 0.45 s before and 0.65 s after.

**Tight**
- **Shots kept:** every line keeps only its close shots (CU, ECU, MCU, INSERT, OTS or POV), or its first shot if it has none. Only 25 wordless shots stay, each held for 1.2–1.4 s:
  - H01, G02, H08, C01;
  - F06, F07, the menu F12;
  - the sugar wall S02, S09, S12, S12b;
  - the fifteen gesture D03, D04, plus D08 and D09;
  - the lobby, L01b to L11 (without L04).
- **Less dead air:** silence at the start and end of each take is trimmed to 50 ms, and any pause inside a performance longer than 0.3 s is cut down to 0.3 s. The words and their order never change. Lines sit 0.1 s apart within a beat.

## Durations

- Full: 7:31 (450.9 s, including the 8 s end card); 104 shots; `scenes-out/fifteen-days/cuts/full.mp4`, rendered in 11 min
- Tight: 4:42 (282.1 s, including the end card); 72 shots; `scenes-out/fifteen-days/cuts/tight.mp4`, rendered in 5.5 min

**Tension: Tight can't reach 3:00–3:30 with the same lines.** The 42 lines run 4:18 as performed. With every pause inside them cut to 0.3 s they still run about 3:41, before any picture without words. With every line kept, the tight cut lands at 4:42 with the end card. Getting to 3:30 means dropping or speeding up lines.
- Speeding up has already been ruled out ("words got lost").
- The other option is to drop beat 1, which the script marks as an optional opener: its six lines run about 25 s, which would bring the tight cut to about 4:10.

Both are the owner's call; I made neither.

## What's missing or a placeholder

- **Pictures:**
  - About 93 of 106 shots are still the grey shot-list sketches until the overnight pass frames land, and 6 are café test frames. S12b and L01b are set frames.
  - Run the command again once `images-out/preprod/pass/` fills, or once picks are written to `cut-pictures.json`.
  - The thumbnails were drawn for shot list v2, so a few may not match the v4 shot of the same id.
- **Sounds:** none of the at-home recordings are in yet (spit, footsteps, chair, sugar cubes, tea pour, headphones), so none are used. All device-sound and game-sound places are drafted.
- **Voices:** Zei's and Bai's voices are provisional. Deluin (deluin-v2, approved) and the robot are unchanged.
- **Timeline:** the timeline is marked `placeholder`, so its recipes stay in `scenes-out/fifteen-days/cuts/<cut>/` (gitignored), and no video recipe is written to `adaptations/`.
- **Code changes:**
  - `scripts/mix-scene.py` and `scripts/render-scene.py` gained `--timeline <path>` for cuts beyond the main timeline, plus subtitle resolving and burning.
  - `scripts/cut-v4.py` is new.
  - Nothing is committed.
