# Friday: end card, cast and bounty post (DRAFTS for Nate to rewrite or approve)

**Updated 2026-10-17 (owner's note):** the cast and the bounty post now lead with the scene and "fork the next shot"
(the editor prototype's link, coming from Claude), and say every layer is already open in the repo. The end-card
options below are unchanged (option B is in the film).

Drafted by the coding agent on 2026-10-15. Every line here goes out under Nate's name or inside the
film, so all of it is a draft. Facts are taken only from what was checked in the repo tonight
(`docs/drafts/overnight-report.md`); anything still open is in [square brackets].

## Facts these drafts rest on (checked 2026-10-15)

- *Snowmoon* is by Vitalik Buterin, GPL v3: <https://vitalik.eth.limo/snowmoon/>.
- The bounty (<https://poidh.xyz/mainnet/bounty/34>): "Bring Snowmoon to Life"; pick one scene; the
  claim needs a still, a public video link and a public repo; "every qualifying submission must
  publicly release the meaningful production materials used to create it"; closes Sunday 18
  October, 11:59pm Pacific.
- Fifteen Days' script: 34 lines by Nate and 9 verbatim from the book, each tagged. No narrator.
- A fresh clone builds the reader with no keys, runs the tests, and renders the example scene
  (`dog-dawn`) from placeholder audio and stand-in stills to a 1080p video, with no keys and no
  models (`docs/make-a-scene.md`, on branch `fork-ready`).
- Every model-made file has a public recipe; models come from an allowlist that quotes each
  licence (`config/models.json`).
- Raw voice takes are never published (principle 1, recorded exception).

**Not yet true, so not claimed:** that the voices are watermarked; that `snowmoon.party/make`
exists; which image model made the final pictures; how the sound was made.

## The current end card (`adaptations/fifteen-days/end-card.json`), and what's wrong with it

| Line | Problem |
|---|---|
| "The pictures, the voices and the sound effects were made with open-weight AI models." | No sound has been generated; the plan prefers recordings. Unknown until the mix exists. |
| "Narration: Kokoro (Apache-2.0)." | The script has no narrator. |
| "Pictures: Z-Image Turbo (Apache-2.0)" | The style and model aren't picked yet. |
| "Every script, voice, picture, sound and timeline that made this is yours…" | Raw takes are private by rule; stills aren't public until publish. |
| "Make your own: https://snowmoon.party/make" | The page doesn't exist. |

## End card: three options

**A. Plain credits**

> **Fifteen Days**
> From *Snowmoon* by Vitalik Buterin.
> Words: naaate, with lines from the book.
> Voices: performed by naaate, AI-converted into character voices.
> Pictures: AI-generated with [model], an open-weight model.
> Sound: [recordings, credited in the description | made in code].
> AI use is labelled. GPL v3, like the book.
> Source, recipes, and how to make your own:
> github.com/We-Are-Lum/snowmoon

**B. The invitation**

> **Fifteen Days** · one scene from *Snowmoon* by Vitalik Buterin
> Words by naaate and the book. Voices AI-converted from naaate's performances. Pictures made with
> open-weight AI. All labelled.
> **This is one scene. Make the next.**
> Everything that made it is GPL v3: github.com/We-Are-Lum/snowmoon

**C. Shortest**

> *Fifteen Days*, from *Snowmoon* by Vitalik Buterin.
> Words: naaate and the book. AI voices and pictures, open weights, labelled.
> GPL v3. Make your own: github.com/We-Are-Lum/snowmoon

The "make your own" link should go to `docs/make-a-scene.md` once `fork-ready` is merged:
<https://github.com/We-Are-Lum/snowmoon/blob/main/docs/make-a-scene.md>. Until then it 404s; the
repo root works now.

## Facts added 2026-10-17 (checked in branch scenes-sound)

- Pictures: depth-guided from grey-box 3D sets with Qwen-Image-Edit-2509, finished with FLUX.2 [klein] 4B; both
  open weights, Apache-2.0 (`config/models.json`; Qwen confirmed by the owner on 2026-10-17).
- Voices: Nate's performances converted with Chatterbox VC (MIT), on his own computer.
- Sound: CC0 recordings from Freesound (each credited in `adaptations/fifteen-days/sounds/recipe.json`) and device and
  game sounds synthesized in code (`scripts/synth-device-sounds.py`). No AI-generated sound.
- Camera and edit follow written coverage rules (`docs/coverage.md`); the plan, every setup's camera and its layout
  frame are files (`adaptations/fifteen-days/preprod/coverage.json`, `scripts/coverage-plan.py`).
- **Only true after "publish":** `scenes-sound` is pushed as a branch (2026-10-17) but not merged, so "every layer is
  already open in the repo" holds on main only after the merge. The editor link is a prototype (a mockup, owner 2026-10-17), and both posts say so.

## Farcaster cast (under 320 characters)

> Fifteen Days: one scene from Vitalik's Snowmoon.
>
> Fork the next shot (editor prototype below).
>
> Every layer is already open in the repo: script, voices, 3D sets, cameras, prompts, frames, sound, timeline. GPL v3. github.com/We-Are-Lum/snowmoon

"Fork the next shot (editor prototype below)." is approved (owner, 2026-10-17).

Embeds (the cast's two, not in the text):
1. the video: `https://snowmoon.party/@naaate/1` (the scene page; shows the video once it is live);
2. the editor prototype: `https://claude.ai/artifact/NAuaFhUtoQKx8zHuANxwhU`.

243 characters of text, the repo link included (counted 2026-10-17); 77 to spare.

## Bounty post (longer)

> **Fifteen Days**, one scene from *Snowmoon* by Vitalik Buterin
>
> [video link]
>
> [One line on the scene, in Nate's words.]
>
> **Fork the next shot.** Editor prototype: https://claude.ai/artifact/NAuaFhUtoQKx8zHuANxwhU
> Pick a shot, change it, and make the next one. You don't have to start from nothing: every layer of this scene is
> already open in the repo, under GPL v3 like the book.
>
> **Every layer, open:**
> - the script, with every line's author (34 lines I wrote, 9 from the novel, each tagged);
> - the voices: my performances converted into the characters' voices with Chatterbox, an open-weight model, on my own
>   computer, each with its recipe (my raw recordings stay private);
> - the 3D grey-box sets, every camera, and the coverage rules the cameras follow;
> - for every picture: the layout frame sent to the model, the exact prompt, the model and settings, and the output's hash
>   (Qwen-Image-Edit-2509 and FLUX.2 [klein] 4B, open weights);
> - the sound: CC0 recordings, credited, and device sounds made in code;
> - the timeline, the mixer and the renderer, as scripts.
>
> A fresh clone renders our example scene to a 1080p video with no keys and no AI models, so you can see the pipeline
> work before you spend anything: [link to docs/make-a-scene.md]
>
> Everything AI made is labelled as AI.
>
> *Snowmoon* is by Vitalik Buterin: <https://vitalik.eth.limo/snowmoon/>. This is an independent fan project, not
> affiliated with him.
>
> Repo: <https://github.com/We-Are-Lum/snowmoon>
