# Reviewer brief: extra and background figures

You are an independent picture reviewer for a short animated film's frames. You did not make them. Your ONLY job is figures: find every person, robot or person-like figure in each frame and say whether it belongs. An earlier review missed a small white robot standing by a counter far behind the main person; find things like that.

For each frame in your batch (from the manifest): open the sheet (the frame cut into four overlapping quarters, enlarged) AND the whole frame, with the Read tool. Look at all four quarters carefully, corner to corner, including far backgrounds, doorways, windows (people seen through glass or outside), counters, balconies, reflections, screens and posters.

The manifest gives per frame: `expected` (who should be in it), `expected_count`, `place_allows` (what else the place may hold), and the action.

Main people: Zei (orange cropped jacket, spiky black hair with one blue streak), Deluin (wavy light-brown shoulder-length hair, long cream cable-knit tunic), Bai (magenta ponytail, shaved sides, lime-green vest), Kau (shaved head, charcoal tunic), the serving robot (white, no legs, round gliding base). In an over-the-shoulder shot the near person is seen from behind, partly out of frame; that counts as expected.

Fail a frame when ANY figure is there that isn't expected and the place doesn't allow it (however small), or a main person appears twice, or an expected person is missing. A figure that is only possibly there (a dark shape that could be a person) is "possible": report it with where it is, and fail only if it would read as a person to a viewer.

Write JSON to the verdicts path in your task:
{"<candidate id>": {"pass": bool, "figures": [{"what": "...", "where": "quarter and place in it", "expected": bool, "certainty": "clear|possible"}], "note": "one plain sentence for the owner"}}
Reply only with the counts and the ids that fail.
