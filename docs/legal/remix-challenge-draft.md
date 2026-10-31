# The remix challenge: Privacy and Terms lines (DRAFT, for the owner's reread)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-10-31, on branch `remix-challenge`. DRAFT until
the owner says "reread". Nothing in `src/lib/legal.ts` has changed, and its reread record is untouched.

Legal texts describe today (owner, 2026-10-18): these lines ship in the same merge as the switches they describe, and
the switches stay off until then:

- `CHALLENGE.entries` (entries listed, the Entry badge, "Mark as my entry"; stores `studio.challenge_marks`; asks
  Neynar for makers' scores);
- `CHALLENGE.posts` ("Add where you posted it" and "Posted on"; stores `studio.version_posts`; asks Neynar, Bluesky
  and Lens for a post);
- `CHALLENGE.openSheets` (forks of Bai's and Zei's sheets open to everyone who passes the Generate gate).

`npm run check:principles` (P6q) fails if `entries` or `posts` is on while Privacy doesn't say what they keep and
send (it looks for "remix challenge" in §4, and for Bluesky and Lens in §7 when `posts` is on).

The share buttons (plain links to each network's compose page, or the Farcaster app's own compose sheet) store
nothing and load nothing from those networks, so they are not behind a switch; the one line about them below (§7's
last item) should still ship with them.

## Before you reread: a conflict to settle first

**Terms §2 says "There is no token. … Payments are final. Nothing else here is for sale."** and principle 7 says "No
token", with the home page's first screen saying "No token". The challenge's draft rules (shown on /challenge, marked
draft) say each final version "is then minted as an open edition in Snowmoon WIP". An ERC-1155 open edition sold for
ETH is a token sold through the project. These lines don't cover the mint; the owner should decide how "No token"
reads (for example "no coin or currency token") before the mint wording goes live, and the mint gets its own Terms
section in the mint's own release.

---

## Privacy §4 (Kept by us when you sign in): two new list items, after "Images you publish, …"

Before (the item they follow, unchanged):

> Images you publish, with their prompt, your name (Farcaster name or wallet address) and the record of how they were
> made. These are public.

New items:

> If you take part in the remix challenge: which of your versions you mark as your entry for each character, and when.
> Whether a version is an entry is shown on its page and on the challenge page. An entry means its maker could take
> part (an invited account, or a Farcaster account that passes the same check as making images); your score itself is
> never shown.

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
> decides whether you can make images. We keep the score for a day. During the remix challenge, Neynar also receives
> the Farcaster ID of each person whose version could be an entry, to look up the same score, which decides whether it
> counts; we keep it for a day. When someone adds a Farcaster post to a version's page, Neynar receives that post's
> address or id, to read it. When you sign in with a wallet, …

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

## Terms: a new section 6d, after 6c

> **6d. The remix challenge.** The challenge page sets out its dates, the characters, and what happens after. Entering
> is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix
> made on the Service during the challenge, by an account we invited or a Farcaster account that passes the site's
> check (or a wallet linked to one). One entry per person per character: your latest version counts unless you mark
> another. Admins can make versions but aren't eligible for rewards. Any rewards are decided as the challenge page
> says; nothing else is promised. We may change or end the challenge, and the page will say so.

## Terms §7 (Hiding and removal): one sentence added after "You may hide your own work yourself …"

> A post you add to a version's page must be one that links there; you or a moderator can remove it, and we remove a
> post on its writer's request.

---

## Notes for the owner

- **Neynar for others' FIDs.** Today Neynar receives only the signed-in person's own FID (and wallet address). The
  entries list asks Neynar about the makers of versions, whoever is reading. It's the same score and the same one-day
  cache (`studio.image_scores`), so a maker who just published (and passed the gate) is usually answered from the
  cache. Alternative, if you'd rather not: record the eligibility at publish time (one more column on
  `challenge_marks`), so Neynar is never asked on a page view.
- **Admins** are named in Terms §7 already ("the site's owner and people the owner names"); the challenge page says
  "Admins (the site's owner and @garance)".
- **Words of posts are not kept or shown.** "Posted on" shows network · @handle · date · link only, so no other
  person's words appear on our pages (unlike social-read's "Posts that link here", which quotes them).
- **The challenge page itself** stores nothing and is not behind a switch; its rules are marked "Draft wording".
