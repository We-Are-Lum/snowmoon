# The remix challenge while it is admin-only: do the live legal lines need a change? (DRAFT)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `challenge-admin-only`, for the
owner's reread. **DRAFT** until the owner approves it. `src/lib/legal.ts` is **not changed** on this branch, and this note is
kept out of `docs/legal/` on purpose: a change there would hold the merge for a reread (CLAUDE.md), and this branch
must merge before Fri 6 Nov 09:00 PT.

## The change of plan

The owner, 2026-11-04: /challenge is admin-only for now. With `CHALLENGE.public` off (`src/lib/config.ts`):

- /challenge, `/api/challenge/*`, the menu item, the home row, the challenge share text, and on sheet pages the Entry
  badge, "Mark as my entry", the challenge lines and "Posted on" are for admins only. Everyone else gets "not found".
- Nothing opens by date alone. At Fri 6 Nov 09:00 PT: no entries (no eligibility is stored at publish, so Neynar
  isn't asked for it; no marking), no open sheet-making, no $15 cap.

"Legal texts describe today" (owner, 2026-10-18): a live line must not describe something the public can't do.

## The live lines (since the owner's reread of 2026-11-01), quoted

Terms §6e, "The remix challenge.":

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed
> in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and
> styles stays by invitation. […] We may change or end the challenge, and the page will say so.

Terms §7: "A post you add to a version's page must be one that links there; you or a moderator can remove it, and we
remove a post on its writer's request."

Privacy §4:

> During the remix challenge, anyone who passes the same check as making images can publish a remix of its
> characters' sheets.

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count
> as an entry and why […]. Whether a version is an entry is shown on its page and on the challenge page, with how many
> people have entered each character.

> When entries close, a record of every entry is published to IPFS and referenced on Ethereum […].

> If you add where a version was posted: the post's network, its id there, its writer's handle, when it was posted, its
> address, and who added it and when. The network, handle, date and a link to the post are shown on the version's page;
> who added it isn't. […]

Privacy §6: "During the remix challenge, a version of one of its characters that you publish may be shown as your entry,
on its page and on the challenge page."

Privacy §7: "During the remix challenge, that check also decides, once, when you publish a remix of a challenge
character, whether it can count as an entry." "When someone adds a Farcaster post to a version's page, Neynar receives
that post's address or id, to read it." And the Bluesky and Lens item.

## The answer: no change is needed

Every one of these lines is conditional: "during the challenge", "during the remix challenge", "if you take part",
"if you add", "when entries close". None says the challenge is running, and none names a date (the dates are only on
the challenge page). While the challenge is admin-only it hasn't started for anyone, so the conditions aren't met and
nothing in them is false:

- **Nothing is collected or sent that the texts don't describe.** With the switch off, less happens than they describe:
  no eligibility is stored and Neynar isn't asked about makers; no marks from the public; no posts added by the public.
  Admins can still test (mark, add a post); what that keeps and sends is what §4 and §7 already describe.
- **Nothing the texts promise the public is taken away mid-way:** no one has entered (the window never opened), so no
  entry, badge or record is withheld from anyone.

Two lines read slightly off while the page is hidden, but neither is untrue:

1. Terms §6e, "The challenge page sets out its dates […] and the page will say so": the page exists and does set them
   out, for admins; the public can't open it until the challenge opens, and §6e's rules apply only from then.
2. Privacy §4, "The network, handle, date and a link to the post are shown on the version's page": a post already
   added (if any; this branch couldn't read production to count them) is, for now, shown to admins only. Showing less
   than the text says is not a privacy problem, and it holds again once the challenge opens.

## If the owner wants it said anyway: the smallest change (optional, not on this branch)

One sentence at the start of Terms §6e, nothing else:

> **Until we open it, the challenge and its page are for admins only, and nothing in this section applies.**

It would need the owner's reread, and a PR with it can't merge until then. That is why it is not on this branch: this
branch must merge before Fri 6 Nov 09:00 PT. If the owner wants the sentence, it can follow in its own PR. It must come
out again in the release that opens the challenge (the same release that turns `CHALLENGE.public` on), since from then
it would be untrue.

## When the owner opens the challenge

Reread §6e, §4, §6 and §7 then, against the new dates: they describe the open challenge as built, so no change is
expected, but the IPFS line (Privacy §4, Terms §6e) still has nothing on `main` that builds the record (launch
rehearsal, "Legal wording to check"). That was true before this change too.
