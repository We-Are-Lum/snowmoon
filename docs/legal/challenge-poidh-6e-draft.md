# The poidh backstory bounty: Terms §6e (reread by the owner, 2026-11-12)

**Reread by the owner (FID 6786) on 2026-11-12**, with one change: "The backstory bounty runs on poidh (poidh.xyz)."
Written by a coding agent (Claude, a closed model by Anthropic) on 2026-11-12, on branch `terms-6e-poidh`, for
the owner's reread. The new sentences are the owner's own words (2026-11-12); the agent only placed them.

Legal texts describe today. This ships in the same release as card 2's link to the bounty. On the owner's word,
`LEGAL.ownerReread.terms` is set to these words (`1mt1kb5`, 2026-11-12), so `check:principles` P6l is green.

## What changes in practice

- The owner opened a poidh bounty for backstories: poidh.xyz bounty 1546, "Snowmoon Character Backstory".
  - It is id 560 on the PoidhV3 contract on Base (`0x5555Fa783936C260f77385b4E153B9725feF1719`).
  - It holds 0.03 ETH and is open, so others can add funds and the winner goes to a vote among funders.
- The challenge home's card 2 ("Add a backstory", tagged "Extra credit") links to it.
- This release changes nothing else. The site sends nothing to poidh, and Privacy is unchanged: the card is a plain link.
- The later in-app "Submit to the poidh bounty" feature will bring its own Terms and Privacy lines, for their own reread.

## Terms §6e

Three changes. The rest of §6e is word for word as before. "Before" is quoted from `src/lib/legal.ts` on `origin/main`
(Terms words `1finiyh`, reread 2026-11-08).

**1. The entry sentence**

| | Text |
|---|---|
| Before | Entering is free and needs no purchase. |
| After | Entering the challenge is free and needs no purchase. |

**2. The prize sentences**

| | Text |
|---|---|
| Before | There is no prize for now. How the final version is chosen, and any prize, are added to the challenge's rules before entries close. |
| After | The backstory bounty runs on poidh (poidh.xyz). Its rules are in the bounty itself, and poidh's own terms cover entering it, choosing the winner and being paid. Submitting to it costs a small network fee on Base, paid to the network, not to us. How any other rewards are chosen is added to the challenge's rules before entries close. |

"The final version" is dropped (owner, 2026-11-12).

**§6e in full, after:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in
> with a Farcaster, Lens or Bluesky account that passes the site's check for it may remix pictures of its characters;
> making sheets and styles stays by invitation. Entering the challenge is free and needs no purchase. A picture counts as
> an entry only once its maker submits it on the Service, with a link to their own post about it on Farcaster, Bluesky or
> Lens that links to its page, and only if it is a picture of a challenge character, remixed from one of that
> character's pictures on the challenge pages (a base or any remix, including your own; not made from scratch), made on
> the Service during the challenge by an account we invited or one that passed the site's check when it was published.
> Each person can submit one entry a day (Pacific time), for any character, and can withdraw any of them until entries
> close; a withdrawn entry still uses its day. Admins can make pictures, but theirs aren't entries. The backstory bounty
> runs on poidh (poidh.xyz). Its rules are in the bounty itself, and poidh's own terms cover entering it, choosing the winner and
> being paid. Submitting to it costs a small network fee on Base, paid to the network, not to us. How any other rewards
> are chosen is added to the challenge's rules before entries close. We may change or end the challenge, and the page
> will say so.

The Terms words become `1mt1kb5` (from `1finiyh`). Privacy is unchanged.

## The code that matches it

- `CHALLENGE_LINKS.bounty` = `https://poidh.xyz/base/bounty/1546` (`src/lib/challenge/landing-wording.ts`). Card 2 shows
  the link instead of "(bounty opens soon)".
- The rules page's line becomes "How any other rewards are chosen is added to the rules before entries close."
  (`src/lib/challenge/wording.ts`). The rules already say "The poidh bounty for backstories is an optional extra."
- `scripts/test-challenge.ts`: "rewards" is allowed only in that sentence, and poidh only in these exact lines.
