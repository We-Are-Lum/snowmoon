# Remix submit: Terms and Privacy lines, the rules and the minimum (DRAFT, pending the owner's reread)

Drafted by the coding agent (Claude Opus 5.5, a closed model by Anthropic) on 2026-11-04, on branch `remix-submit`, for
the owner's reread. **DRAFT: not reread.** The "after" words are applied in `src/lib/legal.ts` on the branch, marked
pending there: `LEGAL.ownerReread` still holds the reread keys (Terms `15lsr9u`, Privacy
`1frr16h`), so the pages show "Draft wording" and check:principles P6k and P6l fail until the owner
says "reread" and the new keys are set (Terms `1jj0onr`, Privacy `mvnybk`).

Legal texts describe today (owner, 2026-10-18): these lines ship in the same merge as Submit, the cap of three and the
free-remix count, never ahead of them. "Before" is main's `src/lib/legal.ts` word for word (at 233f5e0); "after" is the
branch's.

What they describe (owner, 2026-11-04, items 5 and 7):

- A remix becomes an entry only when its maker presses Submit on its page, with a link to a post about it on
  Farcaster, Bluesky or Lens. The post is read from its network's own API and must link to the version's page, as "Add
  where you posted it" checks it; it is then listed on the page as a post the maker added.
- Up to three submissions per person across all characters, any mix (three of one character included), checked on the
  server under a per-person lock. Each version once.
- Withdrawing (proposed, built): until entries close, a maker can withdraw a submission, which deletes it and frees the
  slot; the post stays listed until they remove it. Needs `NEXT_challenge_submit.sql` (a delete grant); until then
  Withdraw says "not available yet".
- The minimum: a character needs at least three different people who submitted for it; three entries by one person
  count once.
- Free remixes: three a day for an account that passes the check, counted as remixes (a sheet's three views), not
  pictures; this adds a per-person daily count (`studio.sheet_remix_asks`, `NEXT_remix_count.sql`), which Privacy §4's
  daily-limits item must name.

---

## Terms §6e (The remix challenge.)

Before:

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

After:

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry only once its maker submits it on the Service, with a link to a post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. Each person can submit up to three entries, for one character or several, and can withdraw one until entries close. A character needs entries from at least three different people to get a final version; several entries by one person count once. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

The change, in short: "A version counts as an entry if it is a remix …" becomes "A version counts as an entry only
once its maker submits it on the Service, with a link to a post about it on Farcaster, Bluesky or Lens that links to
its page, and only if it is a remix …"; "One entry per person per character: your latest version counts unless you
mark another." becomes "Each person can submit up to three entries, for one character or several, and can withdraw one
until entries close."; and the minimum is added: "A character needs entries from at least three different people to
get a final version; several entries by one person count once."

## Privacy §4 (Kept by us when you sign in): the entry item

Before:

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check), decided once, when you publish it, and kept with the time it was decided; and which of your versions you mark as your entry for each character, and when. Whether a version is an entry is shown on its page and on the challenge page, with how many people have entered each character.

After:

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check), decided once, when you publish it, and kept with the time it was decided; and each version you submit as an entry (up to three), with its character and when you submitted it. Submitting needs the link to your post about it, which is kept and listed on the version's page like any post you add (below). If you withdraw a submission, it is deleted; the post stays listed until you remove it. Whether a version is an entry is shown on its page and on the challenge page, with how many people have submitted for each character.

## Privacy §4: the daily-limits item (free remixes)

Before:

> How many images and Remix frames you make each day, to count the daily limits, and the reports you make.

After:

> How many images, sheet remixes and Remix frames you make each day, to count the daily limits, and the reports you make.

## Privacy §6 (What you publish): the entry sentence

Not in the owner's list, but its old words ("may be shown as your entry") no longer match: a version is shown as an
entry only once it is submitted. Before (the whole paragraph; the change is its last sentence):

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page.

After:

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish and submit is shown as an entry, on its page and on the challenge page.

## Privacy §7 (Outside services): no change

The Neynar, Bluesky and Lens items already say they receive a post's details "when someone adds a … post to a
version's page"; Submit adds the post the same way, so they stay true. No new outside service.

---

## The rules on /challenge (`src/lib/challenge/wording.ts`, `CHALLENGE_WORDING.rules`; draft wording)

Before (main):

> One entry per person per character. Your latest version counts unless you mark another.

After:

> A remix becomes an entry only when you press Submit on its page, with a link to your post about it on Farcaster,
> Bluesky or Lens. You can submit up to three, for one character or several. Until entries close you can withdraw
> one, which frees its place.

## The minimum (the same list)

Before (main):

> Each character needs at least three different people with an entry. A character with fewer gets no final version,
> credit test or mint.

After:

> Each character needs at least three different people who submitted an entry for it; several entries by one person
> count once. A character with fewer gets no final version, credit test or mint.

## Free remixes (a new rule in the same list)

> Remixing is free: three remixes a day. A remix is one sheet's three views; if one of them fails, make it again
> inside the same remix without using another.

## Other lines that change with Submit (draft wording, `src/lib/challenge/wording.ts`)

- The publish confirmation. Before (the owner's words of 2026-11-03): "This is your entry for Bai." After: "To enter it
  for Bai, press Submit on its page, with the link to your post about it."
- Neynar down at publish. Before: "… Publish another version later to enter; an earlier entry for Bai, if you have one,
  still counts." After: "… Publish another version later and submit that one; an entry you already submitted still
  counts."
- The Entry badge's note. Before: "This is its maker's entry for Bai in the remix challenge." After: "Submitted as an
  entry for Bai in the remix challenge."
- A remix not yet submitted. Before: "Made during the remix challenge. Its maker's latest version counts unless they
  mark another." After: "Made during the remix challenge. It isn't an entry for Bai unless its maker submits it."
- After the close. Before: "Made during the remix challenge. Entries are closed: its maker's entry for Bai is another
  version." After: "Made during the remix challenge. Entries are closed: it wasn't submitted as an entry for Bai."
- New, Submit on the version page (its maker only): "Submit as an entry"; "A remix becomes an entry only when you
  submit it, with the link to your post about it on Farcaster, Bluesky or Lens; the post must link to this page. You
  can submit up to three, for one character or several."; the box "Your post's address (Farcaster, Bluesky or Lens)";
  "Submit"; "Submitted: this is now one of your entries."; "2 of 3 submissions left"; "Withdraw"; "Until entries close,
  withdrawing frees its place."; "Withdrawn: it is no longer an entry."
- Refusals: "You've submitted 3, the most anyone can. Withdraw one to submit another."; "You've already submitted this
  version."; "Add the link to a post about it on Farcaster, Bluesky or Lens first."; "This version can't be entered:
  your account didn't pass the site's check when you published it."; "Withdrawing isn't available yet."
- Free remixes: "You've made today's 3 remixes. More tomorrow (00:00 UTC)."; "This remix has used its 6 pictures. Press
  Remix to start a new one."

---

## For the owner to decide with the reread

1. The publish line replaces your own words of 2026-11-03 ("This is your entry for …"), since publishing no longer
   enters. Keep the draft, or give the words.
2. Privacy §6: the sentence above is outside your list; keep it, or say how you want it.
3. A post that is removed after Submit (by its adder or a moderator): the entry stays (the post was checked at Submit).
   Say if a submission should stop counting when its post goes.
4. The post's writer isn't checked against the submitter (as "Add where you posted it" doesn't check it). Say if Submit
   should require your own post.
5. `LEGAL.effective` stays 2026-11-01 on the branch; set it to the day these go live at merge.
