# Challenge rewards: legal drafts (DRAFT, for the owner's reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-11, on branch `challenge-rewards`. DRAFT:
nothing here is in `src/lib/legal.ts`; `LEGAL.ownerReread` is untouched (P6k and P6l stay green on this branch). These
lines would go live in the same release that turns `CHALLENGE.rewards` on, never before (CLAUDE.md: legal texts describe
today). Shortest true sentences; no amounts or thresholds that change. Where a sentence depends on a choice still open,
the choice is named below it.

## Terms §6e, The remix challenge (its last sentences)

**Before:**

> … Admins can make pictures, but theirs aren't entries. There is no prize for now. How the final version is chosen, and any prize, are added to the challenge's rules before entries close. We may change or end the challenge, and the page will say so.

**After (draft):**

> … Admins can make pictures, but theirs aren't entries. The challenge page sets out its rewards: what they are, who can receive them, and how and when they are paid. Only accounts that pass the site's check can receive one, and only after entries close. They are paid in ETH on Base, to an address verified as yours; we don't pay where the law doesn't allow it, and any tax on what you receive is yours. Some rewards are given through other services (a bounty on poidh, a pool shared through deep funding), whose own terms also apply; the Snowmoon collab's pool is not a prize from us and has its own rules. How the final version is chosen is added to the challenge's rules before entries close. We may change or end the challenge, and the page will say so.

Open choice: if the owner pays every reward himself from his own wallet, "given through other services" narrows to
the poidh bounty only.

## Privacy §4, the remix challenge item (added at its end)

**Before** (its last sentence today):

> … If you add a backstory to a challenge picture, it is kept and shown with the picture.

**After (draft), three sentences added:**

> … If you add a backstory to a challenge picture, it is kept and shown with the picture. For the rewards, we count how many pictures other people's accounts remixed from each entry, from what each picture's page already shows; the counts aren't shown while entries are open. If you receive a reward: the address we paid, how it was verified, the amount and when, kept as the record of the payment (the payment itself is public on Base). If you entered with Bluesky only and add an address for rewards: that address and the signed message that proves it's yours, kept until the rewards are paid, then with the payment's record.

How a "verified address" is verified (choose before go-live; the sentence above says "how it was verified" so it stays
true whichever is chosen):
- **Farcaster:** an address Farcaster lists as the account's (custody or verified), read from Neynar as today, or a
  wallet linked on the site (signed in with both). No new storage.
- **Lens:** the Lens account's own address (its owner). No new storage.
- **Wallet accounts:** the address itself. No new storage.
- **Bluesky only:** nothing today links a wallet to a Bluesky account. "Add one" needs a new step: sign a message with
  the wallet while signed in with Bluesky, and keep the address, the signature and when. **That needs a migration** (a
  small table, e.g. `studio.reward_addresses (person, address, signed_message, signature, at)`, insert/select for
  studio_writer, no public read). Not written on this branch.

## Privacy §7, outside services (two items added)

**Before:** none.

**After (draft):**

> If rewards are paid through poidh: we post the bounty there; your entry on poidh is between you and poidh, under its terms, and we send poidh nothing about you.

> If a rewards pool is shared through deep funding: it receives, for each picture that can share in it, the picture's link, its maker's public name, how many pictures other people's accounts remixed from it, and the address to pay. Nothing else about you.

Open choice: if deep funding doesn't take payout addresses (the owner pays from its result), drop "and the address to
pay".

## Consent (own-words-v6)

No change: it covers what is sent when a picture is made; rewards send nothing at that moment.

## Not legal, but changes with the switch

- Rules, "What happens next.": "There is no prize for now. How the final version is chosen, and any prize, are added to the rules before entries close." → "The rewards are below. How the final version is chosen is added to the rules before entries close."
- Rules, the line "Entering is free. There is no prize for now." → "Entering is free."
- The section itself and the line on /challenge (src/lib/challenge/rewards.ts), with "[amount]" and "[link]" blanks.

## For the owner

1. **poidh.** The memory note of 2026-11-04 says "no poidh"; this request brings it back. Noted only.
2. **P5 and counting remixes.** P5 is about steering what people see (nothing canon, official or featured; no order by
   popularity). P5i forbids showing remix, like or built-on counts on the challenge's cards and feed while it runs, and
   any "most remixed" sort; it says such a sort may come back after entries close by the owner's decision. Counting
   remixes **for a payout after entries close**, without showing the counts on the site while it runs, breaks no
   check:principles rule (P5i reads the cards, the random selection, the feed and its server code; this branch adds no
   count there). It is still a popularity measure deciding money, which is in tension with P5's spirit ("nothing
   featured") and invites remixing for reward; only-other-people's-accounts and the site's check limit the obvious
   abuse but don't remove it (several accounts per person). Plainly: no rule fails, but it is a tension to decide
   knowingly, and the counts must stay off the pages until entries close.
3. **check:principles.** None fails on this branch with the switch off or on (the section names no count and no order;
   no payment enters any ordering, P7). P6g/P6h would need poidh and deep funding in Privacy §7 only if About or a
   notice named them; neither does.
4. **The site's words.** The site has no "step 1" / "step 2": entries are pictures submitted with Submit, and a backstory
   is the text added at publish. The drafts use "entries" and "backstory"; if a bounty is for something else (e.g. a
   separate backstory round), the words need the owner's.
