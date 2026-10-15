# Friday: end card, cast and bounty post (DRAFTS for Nate to rewrite or approve)

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

## Farcaster cast (under 320 characters)

> Fifteen Days, one scene from Vitalik's Snowmoon for the poidh bounty. My words and the book's, my
> voice AI-converted into the characters', open-weight AI pictures, all labelled. Everything that
> made it is GPL v3. Fork it and make the next scene: [video link] [repo link]

246 characters before the links; 308 with a 23-character video link and
`github.com/We-Are-Lum/snowmoon` (counted 2026-10-15). Count again with the real links.

## Bounty post (longer)

> **Fifteen Days**, a scene from *Snowmoon* by Vitalik Buterin
>
> [video link]
>
> Zei and Deluin, fifteen days before their final. [One line on the scene, in Nate's words.]
>
> **What's in it.** The words are mine and the book's: 34 lines I wrote and 9 taken verbatim from
> the novel, each tagged in the script with its source. I performed the voices and converted them
> into designed character voices with Chatterbox, an open-weight model, on my own computer. The
> pictures were made with [model], also open weights. Everything AI made is labelled as AI.
>
> **Make your own.** This entry is an invitation. Everything that made it is public under GPL v3,
> like the book:
> - the script, with every line's author;
> - the timeline: every voice line, sound, shot, camera move and cut, timed from the audio;
> - a recipe for every file a model made: the model, the exact prompt, the settings and the
>   output's hash;
> - the model allowlist, with each licence quoted from its card;
> - the mixer and renderer, as scripts.
>
> A fresh clone renders our example scene to a 1080p video with no keys and no AI models, so you
> can see the whole pipeline work before you spend anything. The guide walks through writing a
> script, casting voices, adding sound and stills, mixing and rendering:
> [link to docs/make-a-scene.md]
>
> My raw voice recordings aren't published, for privacy; the converted lines are.
>
> Pick a scene. Fork the repo. Make the next one.
>
> *Snowmoon* is by Vitalik Buterin: <https://vitalik.eth.limo/snowmoon/>. This is an independent
> fan project, not affiliated with him.
>
> Repo: <https://github.com/We-Are-Lum/snowmoon>
