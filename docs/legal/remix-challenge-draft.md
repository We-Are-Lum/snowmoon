# The remix challenge: Privacy and Terms lines (reread by the owner, 2026-11-01, with his changes)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-10-31, on branch `remix-challenge`. **Reread by
the owner on 2026-11-01**, with these changes, made here: the challenge's Terms section is 6e (main's 6d is "Minpentai
with your agent", live since 2026-10-31); the "No token" conflict note is dropped (#73 is live); the Neynar score is not
kept, only the decision (`passed` or `below`) and when, and the Privacy words say so. Nothing in `src/lib/legal.ts` has
changed yet, and its reread record is untouched: these words go into legal.ts in the release that turns the switches
on, with the reread recorded there.

**Revised 2026-10-31 for the owner's decisions:** eligibility is checked once, at publish, and stored (Neynar is never
asked when someone views a page); no wallet path; sheets open to everyone who passes the check during the window
(`openSheets`, which waits for these words by itself); the mint is a plan, not a promise.

Legal texts describe today (owner, 2026-10-18): these lines ship in the same merge as the switches they describe, and
the switches stay off until then:

- `CHALLENGE.entries` (entries listed with each character's count, the Entry badge, "Mark as my entry"; shows what
  `studio.challenge_marks` and `studio.challenge_eligibility` hold). The eligibility decision is stored at publish only
  once Privacy §4 describes the remix challenge (`src/lib/challenge/record.ts`), so nothing about a maker is kept
  before these words are live;
- `CHALLENGE.posts` ("Add where you posted it" and "Posted on"; stores `studio.version_posts`; asks Neynar, Bluesky
  and Lens for a post);
- `CHALLENGE.openSheets` (on in the config): forks of the six characters' sheets open to everyone who passes the
  Generate gate, only inside the entry window, and only once Privacy §4 describes the remix challenge
  (`src/lib/challenge/open-sheets.ts`; P6q checks the code waits for both). So these words are what turn it on.

`npm run check:principles` (P6q) fails if `entries` or `posts` is on while Privacy doesn't say what they keep and
send (it looks for "remix challenge" in §4, and for Bluesky and Lens in §7 when `posts` is on).

The share buttons (plain links to each network's compose page, or the Farcaster app's own compose sheet) store
nothing and load nothing from those networks, so they are not behind a switch; the one line about them below (§7's
last item) should still ship with them.

---

## Privacy §4 (Kept by us when you sign in): three new list items, after "Images you publish, …"

Before (the item they follow, unchanged):

> Images you publish, with their prompt, your name (Farcaster name or wallet address) and the record of how they were
> made. These are public.

New items:

> Character sheets you publish, with their text, their views, your name and the record of how each view was made.
> These are public. During the remix challenge, anyone who passes the same check as making images can publish a
> remix of its characters' sheets.

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count
> as an entry and why (you were invited, you are an admin, or whether your account passed the site's check when you
> published it), decided once when you publish it and kept with it, with when; and which of your versions you mark as
> your entry for each character, and when. Whether a version is an entry is shown on its page and on the challenge
> page, with how many people have entered each character.

> If you add where a version was posted: the post's network, its id there, its writer's handle, when it was posted,
> its address, and who added it and when. The network, handle, date and a link to the post are shown on the
> version's page; who added it isn't. You can remove a post you added; a moderator can remove any of them, on its
> writer's request or under the Terms.

## Privacy §6 (What you publish): one sentence added at the end

Before (its last sentence):

> Its card is drawn from that link, and we keep nothing about it.

After:

> Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its
> characters that you publish may be shown as your entry, on its page and on the challenge page.

## Privacy §7 (Outside services): the Neynar item, two sentences added after "We keep the score for a day."

Before:

> Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which
> decides whether you can make images. We keep the score for a day. When you sign in with a wallet, …

After:

> Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which
> decides whether you can make images. We keep the score for a day. During the remix challenge, that check also
> decides, once, when you publish a remix of a challenge character, whether it can count as an entry. Neynar is never
> asked about you when someone views a page. When someone adds a Farcaster post to a version's page, Neynar receives
> that post's address or id, to read it. When you sign in with a wallet, …

## Privacy §7: a new item, after the Neynar item

> Bluesky and Lens receive the details of a post someone adds to a version's page (Bluesky: its writer's handle or
> account id and the post's id; Lens: the post's id), so our server can read the post and check it links there. They
> receive nothing about you or the person who added it, and your browser never contacts them for this.

## Privacy §7: the last item (share links)

Before:

> A "report" or "share" link may open GitHub, Farcaster or X, where what you post is public and under their terms.

After:

> A "report" or "share" link may open GitHub, Farcaster, X, Bluesky or Lens (through hey.xyz), where what you post is
> public and under their terms.

---

## Terms: a new section 6e, after 6d (main's 6d is "Minpentai with your agent")

> **6e. The remix challenge.** The challenge page sets out its dates, the characters, and what happens after. During
> the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters'
> sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't
> needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the
> Service during the challenge by an account we invited or one that passed the site's check when the version was
> published. One entry per person per character: your latest version counts unless you mark another. Admins can make
> versions but aren't eligible for rewards. Anything that follows the challenge, including any mint, is a plan, not a
> promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

## Terms §7 (Hiding and removal): one sentence added after "You may hide your own work yourself …"

> A post you add to a version's page must be one that links there; you or a moderator can remove it, and we remove a
> post on its writer's request.

---

## Notes for the owner

- **Neynar only at publish (owner, 2026-10-31), no score kept (owner, 2026-11-01).** The decision is made when the
  maker publishes, from the same lookup the gate just made (that score kept a day in `studio.image_scores`, as for
  every Generate), against the challenge's fixed threshold of 0.7 (`CHALLENGE.neynarMinScore`), and only the decision
  and its time are stored in `studio.challenge_eligibility`. Pages only read it.
- **The spend cap** ($15 a day inside the window, $2 otherwise) needs no new words: the Terms speak of "spending caps"
  without amounts.
- **No wallet path.** Sheets are made with Farcaster only, so the Terms line names Farcaster accounts only.
- **The bounties** (one solo poidh bounty per character, on Ethereum mainnet) are run on poidh under its terms; the
  Terms section's "decided as the challenge page says" covers them, and the rules on /challenge describe them.
- **Admins** are named in Terms §7 already ("the site's owner and people the owner names"); the challenge page says
  "Admins (the site's owner and @garance)".
- **Words of posts are not kept or shown.** "Posted on" shows network · @handle · date · link only, so no other
  person's words appear on our pages (unlike social-read's "Posts that link here", which quotes them).
- **The challenge page itself** stores nothing and is not behind a switch; its rules are marked "Draft wording".
