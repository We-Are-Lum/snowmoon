# Coverage: how a scene is shot and cut

The owner's camera and edit rules (2026-10-17), for every scene and every fork. `scripts/coverage-plan.py` applies them:
it reads a scene plan (`adaptations/<seed>/preprod/coverage.json`), computes each setup's camera from the 3D set,
checks the rules and writes the layouts and the cut list (`coverage-board.json`); `scripts/set-render.mjs` renders each
layout frame and `scripts/cut-coverage.py` cuts the scene from the list. Change a rule
here and in the planner together.

## Camera

- **Static only.** No pans, zooms or drifts anywhere. Every shot is a still from a fixed camera.
- **Few fixed setups per scene.** Each scene uses 4–6 camera positions from its 3D set (inserts not counted). The camera doesn't wander.
  Cutting between the same setups is what tells the viewer where they are.
- **Establish first.** Each scene opens on a wide establishing shot or its master. Re-establish only when someone enters, leaves or moves.
- **Two-person dialogue uses standard coverage:**
  - a master two-shot in profile, the camera square to the line between them;
  - matched over-the-shoulder shots, each over one person's shoulder onto the other's face, mirrored, with the same lens and height;
  - matched clean close-ups of each person, mirrored, with the same lens and height.
- **One side of the 180° line.** Every setup in a scene stays on the same side of the line between the two people talking.
  Eyelines stay consistent: the adaptation names who is on the left (Fifteen Days: Zei on the left looking right;
  Deluin and Bai on the right looking left). The planner puts the camera on the side that keeps that.
- **Three people (the café):** the master shows the triangle at the table. The Zei–Deluin coverage is the over-the-shoulder pair;
  once Bai moves to her back table (F26 on), she is visible behind Zei in the shot over Deluin's shoulder.
- **Inserts only for props that matter** (Fifteen Days: the menu, the sugar wall, Zei's watch, the phone message).
  A prop with no photo is modelled in the set and drawn from a close camera, depth-guided, like any frame.

## Frames

- **Draw each setup once,** with a few expression variants (neutral, smiling, serious) where the dialogue needs them,
  and reuse them for every line from that position. A variant that changes a pose (standing, leaning) is its own layout;
  one that changes only a face is a restyle of the same layout. Far fewer unique frames, and they match.

## Edit

- **Picture cuts on the dialogue.** Mostly show the speaker; cut to the listener for reactions that matter.
  The next speaker's audio may start just before the cut (a short J-cut).
- **Hard cuts within a scene;** a fade only at a time jump (Fifteen Days: into the vigil) and at the end.
- **No held empty frames.** A wordless shot runs 1–1.5 s unless the moment needs more (a place card, a message to read).

## The plan file

`coverage.json` per adaptation: who stands on the left, then per scene its set, who is where (people face whom they talk to),
its setups (kinds: `establish`, `master`, `ots`, `cu`, `single`, `insert`, `pov`, or `reuse` of a frame already drawn and approved)
with their variants, and the sequence: each line or wordless beat and the setup and variant it cuts to.
The planner refuses a plan that breaks a rule above (a seventh setup, a setup across the line, a scene that doesn't open wide,
a wordless beat over 1.5 s without a reason) and says why.
