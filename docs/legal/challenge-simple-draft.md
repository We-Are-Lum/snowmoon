# The simpler remix challenge: Terms §6e (DRAFT, needs the owner's reread)

**DRAFT.** Written by a coding agent (Claude, a closed model by Anthropic), 2026-11-08, on branch `challenge-simple`,
for the owner's reread. The new words are the owner's own after-text (relayed by the coordinator, 2026-11-08); the
agent only placed them. Legal texts describe today, so this ships only in the release that turns the moments off
(`CHALLENGE.moments`), after the owner says "reread". `LEGAL.ownerReread` is not touched: until the reread, Terms shows
its "Draft wording" line and `check:principles` P6k is red.

What changes in practice: the challenge drops the moments (`CHALLENGE.moments` off; their code and data stay). An entry
is a picture of a challenge character remixed from one of that character's pictures on the challenge pages: one of its
bases, or any published challenge remix of it, the person's own included. Nothing else about entering changes (Submit,
one a day, the site's check, admins' pictures aren't entries). Nothing new is collected or sent anywhere: a style a
person writes is part of the prompt, which the site already publishes with every picture and already sends to the prompt
check (Privacy names it).

## Terms §6e

Only this sentence changes; the rest of §6e is word for word as before. "Before" is quoted from `src/lib/legal.ts` on
`origin/main` at 00722d70 (Terms words `huq39i`, reread 2026-11-06).

| | Text |
|---|---|
| Before | …and only if it is a picture of a challenge character at one of the challenge's moments, remixed from one of its pictures on the challenge page (not made from scratch), made on the Service during the challenge… |
| After | …and only if it is a picture of a challenge character, remixed from one of that character's pictures on the challenge pages (a base or any remix, including your own; not made from scratch), made on the Service during the challenge… |

The Terms words become `1qqdzvb` (from `huq39i`). Privacy is unchanged (`ozmbuf`): it never named the moments.

## The code that matches it

- `CHALLENGE.moments = false` (src/lib/config.ts): no page shows a moment; a picture needs none.
- `src/lib/challenge/pictures.ts`: with the moments off, a challenge picture needs no moment; it counts when its line
  (itself, or the pictures it was remixed from, step by step) `uses` one of its character's bases. A remix of any
  published challenge picture of that character, the person's own included, is on such a line.
- `scripts/test-challenge-moments.ts` proves it on a local database (a picture from a base counts; a remix of one's own
  picture counts; a picture with no line, or from another character's base, doesn't).
- P6ac still holds: Terms §6e says a picture of a challenge character is what counts.

## Site lines that change with it (also DRAFT or the owner's, listed for the reread pack)

- Rules intro, the owner's words exactly: "From 17 to 29 November, make your own picture of Zei, Gladias, Bai, Seila,
  Deluin or Mu: start from one of their pictures, change what you like, pick a style and a model, and publish it. To
  enter, post it on Farcaster, Lens or Bluesky and submit the post. Your picture gets its own page, credited back to what
  you built on."
- Rules, the "only remixes count" line (DRAFT, the agent's, matching §6e): "Only remixes count: start from one of a
  character's pictures on the challenge pages, a base or any remix, including your own. A picture made from scratch isn't
  an entry."
