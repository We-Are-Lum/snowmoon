# Three ways in: legal notes (DRAFT, for Nate's reread)

Branch `voice-three-ways`, 2026-11-24. Drafted by the coding agent (Claude, a closed model by Anthropic); DRAFT until
Nate's reread. Legal texts describe today, so nothing goes into `src/lib/legal.ts` in this branch: see why below.

## What changes for people, by way

1. **From scratch:** nothing new.
2. **New pictures for a recording:**
   - **Ready-made readings:** nothing new; they were already shared.
   - **Published takes** (only once `VOICE.publish` is on): someone else may make their own storyboard on a performer's published, named take, credited to that performer.
3. **Your voice over a storyboard:**
   - **Team-made storyboards:** the team's own boards (Nate's list, `VOICE.teamBoards`). The pictures are copied into the person's board, each picture's recipe kept, credited to the board's maker. They stay private to the person until they publish, as their own pictures do.
   - **Published storyboards** (only once `VOICE.publish` is on): the same, from anyone's published, named storyboard.

## Why nothing changes in Terms or Privacy in this branch

- **Readings and team storyboards:** project content, already covered. Terms §3's licence covers reuse, and §8 says storyboard pictures are AI-made and labelled. Privacy's storyboard and picture items say what is kept and shown; a copied picture is kept like the person's own (§4, "Speeches you record … with its recipe"), and its credit names the team member, who agreed to it.
- **Others' published work:** reused only once publishing is on. Publishing has its own legal lines, which ship when it does. So the lines below ship in that release, not this one.

## Proposed lines for the release that turns publishing on

- **Privacy §6 ("What you publish"), a new sentence:**
  > If you publish a storyboard under your name, others may make their own from it: their voice over your pictures, or
  > their pictures over your take. Each is credited to you, and your recipe goes with it.
- **Terms: no change.** §3 already licenses published work for reuse with credit.

## Credits (set by the site, never by a person or a model)

- **Your voice over a storyboard:**
  > Storyboard by @maker: the scene, the cuts, the N shots' descriptions and cameras, the pictures. Each picture's timing fitted to this voice by @you.
  
  The "Performed by @you" line is as before.
- **New pictures for someone's published take:**
  > Performed by @performer, in the voice "…".
  
  > Storyboard by @you: … on @performer's published take.
