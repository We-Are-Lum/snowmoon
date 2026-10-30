# Minpentai: the ladder when the stronger computer arrives

> DRAFT proposal, 2026-10-30, for the owner's read. Written by the coding agent (Anthropic's Claude, a closed model). Nothing here is built. Rules invented for this edition · not affiliated with the author. Background: `docs/proposals/minpentai-stronger-computer.md` (branch `minpentai-stronger-computer`), `docs/proposals/minpentai-play-flow.md` §8.

## What changes

- The stronger computer is a search player: it simulates the real engine and scores the boards. Its five levels are search settings (look-ahead, mistakes drawn from its seed, how many candidates it tries), not today's five habit lists (Rival, Blocker, Builder, Opportunist, Planner).
- In the spike, its level 3 beat every one of today's players almost every time (200 of 200 against Rival to Opportunist, 187 / 11 / 2 against Planner). So "rung 5 beaten" today and "level 5 beaten" after are not the same achievement.
- Under the owner's rule (2026-10-30: a rule change is a new ruleset), the new players are **ruleset 3**. Rulesets 1 and 2 stay frozen with today's players, so every old link, token, card and saved match keeps replaying against the players it was made against.

## Proposal: a new ladder, the old one kept as a record

1. **A new ladder for ruleset 3**, starting at level 1 for everyone. Five levels with plain names (for example: Learner, Steady, Sharp, Strong, Master; names for the owner), calibrated with the round-robin test until each beats the one below most of the time but not always, then checked with people (the spike's open question: the top must be beatable by a good player).
2. **The old ladder is kept, read-only, as "The first ladder"**: each person's opened rungs and wins under rulesets 1 and 2 stay visible on their ladder page, under a heading with its dates. Nothing is deleted; nothing new is added to it.
3. **A head start, not a carry-over:** a person who beat today's rung 5 starts the new ladder at level 2 (it's open, not won). Everyone else starts at 1. Rationale: the old top shows a person can play, but the new level 2 is already stronger than the old rung 5.
4. **A one-time note**, like cap10's: "New computer players. They plan by simulating the game, so they're much stronger. Your first ladder is kept below. The new one starts at level 1 (or 2 if you finished the first)."
5. **Share cards** for new wins carry ruleset 3 and the level's name; old cards keep reading as before (their ruleset is in the link, or missing and so 1).
6. **Snap and Choose new game** offer the new five levels from the start (play-flow §8: the stronger computer lands before Choose new game).

## What the ladder record needs

- Today a person's progress is one record (opened rung, tries and first win per rung). It becomes one record **per ladder**: `{ ladder: 1 | 3, opened, rec }`, where ladder 1 covers rulesets 1 and 2 (same players, same rungs). Old rows read as ladder 1.
- The result endpoint takes the ruleset (and so the ladder) with each result, and checks the step against that ruleset's limit.
- Ladder progress is in the database (`studio.mp_progress`, migration 0009, keyed by Farcaster ID), so this needs a small `NEXT_` migration (a ladder column, default 1, part of the key), applied before the stronger computer merges, with a read-back that inserts and deletes a realistic row.

## Alternatives

- **Keep progress across the change** (what cap10 does): simple, but a "rung 5" win would mean beating a much weaker player than the new level 5, and people would skip levels they've never met.
- **Reset with no record:** simplest, but throws away people's wins; the owner's rule that old things keep meaning what they meant argues against it.

## Size

S–M on top of the stronger computer: the per-ladder record, the head start, the old ladder's read-only list, the note, and tests (old rows read as ladder 1; a result under ruleset 2 can't open a level-3 ladder; the head start).

## Principles

- P8 (Minpentai): the new players are this edition's; labels unchanged.
- P6 (data): one more small field per person (which ladder); nothing public.
- P7: no payments involved.
