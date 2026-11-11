# Contest branch: new words and legal lines (approved)

Drafted by the coding agent (Claude, a closed model by Anthropic), 2026-11-04, on branch `contest`, for the
coordinator and then the owner. **Approved (2026-11-04): reviewed by the coordinator, approved by the owner, with one fix: the Terms §6e sentence is
the owner's own words (below).** The lines are in `src/lib/legal.ts` on this branch, and `LEGAL.ownerReread` records
the new keys (Terms `jskf6i`, Privacy `1x81p6y`; the Privacy record covers the merged text of check-decisions and
remix-submit plus these lines). `LEGAL.effective` stays as it is; it is set at merge.

What changed in the code, and why these words are needed:

1. **One submission per person per Pacific day** (America/Los_Angeles), replacing "up to three in total". No total
   cap. Withdrawing doesn't give back that day's submission, so a withdrawn submission is now **kept**, marked
   withdrawn, instead of deleted (`supabase/migrations/NEXT_challenge_daily.sql`).
2. **The post check at Submit**: the post is read from its network and must exist, be by the submitter's own account
   and link to the remix's page. This was already in remix-submit and is already in the approved Privacy §4
   ("for a Farcaster or Bluesky post, the site checks with its network that you wrote it"). No new legal line.
3. **Every entry** (`/challenge/entries`): newest first, by character, or shuffled; no counts.
4. **No like, recast or reply counts** on remix pages while the challenge and vote are open: "Posted on" links read
   "See the conversation on Farcaster/Bluesky/Lens". Nothing reads counts (`CHALLENGE.socialCounts`, off).

Because of 1, the earlier Privacy §4 sentence "If you withdraw a submission, it is deleted" was no longer true of this
branch's code; the approved line below replaces it, so the pages describe what this branch does.

## Terms §6e (The remix challenge)

Before (live words):

> Each person can submit up to three entries, for one character or several, and can withdraw one until entries close.

After (approved, the owner's words):

> Each person can submit one entry a day (Pacific time), for any character, and can withdraw any of them until entries
> close; a withdrawn entry still uses its day.

## Privacy §4 (the remix challenge item)

Before (live words):

> … and each version you submit as an entry (up to three), with its character and when you submitted it. … If you
> withdraw a submission, it is deleted; the post stays listed until you remove it.

After (approved):

> … and each version you submit as an entry, with its character and when you submitted it. … If you withdraw a
> submission, it stops being an entry but is kept, marked withdrawn, with when; the post stays listed until you remove
> it.

(The rest of the item, including "for a Farcaster or Bluesky post, the site checks with its network that you wrote
it", is unchanged.)

## Words on the site (approved as drafted; each still carries the site's "Draft wording" mark)

| Where | Before | After |
|---|---|---|
| Rules, Submit line (`wording.ts`) | A remix becomes an entry only when you press Submit on its page, with a link to your own post about it on Farcaster, Bluesky or Lens. You can submit up to three, for one character or several. Until entries close you can withdraw one, which frees its place. | A remix becomes an entry only when you press Submit on its page, with a link to your own post about it on Farcaster, Bluesky or Lens. You can submit one remix a day (Pacific time), for any character, as many days as you like. Until entries close you can withdraw a submission; that day’s submission isn’t given back. |
| Rules, bases line | Only remixes count: for each character, start from its base, or someone else’s remix. … | Only remixes count: for each character, start from one of its bases, or someone else’s remix. … |
| Submit box note | … You can submit up to three, for one character or several. | … You can submit one remix a day (Pacific time). |
| Submit box, left | "n of 3 submissions left" | "You can submit one remix today." / "You’ve submitted today. You can submit again tomorrow (Pacific time)." |
| Withdraw note | Until entries close, withdrawing frees its place. | Until entries close you can withdraw it. Withdrawing doesn’t give back today’s submission. |
| Refusal at Submit | You’ve submitted 3, the most anyone can. Withdraw one to submit another. | You’ve already submitted a remix today. You can submit one each day (Pacific time), so come back tomorrow. |
| "Posted on" link | See it on Farcaster | See the conversation on Farcaster (Bluesky, Lens) |
| /challenge top links | Rules · Draft wording | Rules · Every entry · Draft wording |
| /challenge/entries (new) | — | "Every entry"; filter "All", then each character; order "Newest first" / "Shuffled"; "No entries yet." / "No entries for Zei yet." |
| /challenge first remixes (branch challenge-landing) | "First remix" on each picture; empty slot "First remix: not here yet" | A heading over the row: "First remixes by @naaate"; empty slot "Not here yet" |

## Migrations

`supabase/migrations/NEXT_challenge_daily.sql` **supersedes `NEXT_challenge_submit.sql`** (the SQL pack's item 4,
docs/legal/sql-pack-2026-11-04.md on branch sql-pack): withdrawing now sets `withdrawn_at` instead of deleting, so the
delete grant is not needed, and running NEXT_challenge_submit.sql after it would revoke the withdraw grant. The contest
branch removes NEXT_challenge_submit.sql; the SQL pack doc needs item 4 replaced by NEXT_challenge_daily.sql.

## Not changed, and why

- **The rehearsal** (`CHALLENGE_REHEARSAL=on`): runs only on this machine against a local database, never on any
  Vercel deployment (check:principles P6w). It makes admins eligible and opens entries today, but only there; the live
  Terms ("Admins can make versions but aren't eligible for rewards") stay true of the site. No legal line.
- **The rehearsal's pictures** stay on this machine (`~/snowmoon-rehearsal-db/store`), not in R2. No legal line.

## The merge note (for the reread pack)

On `contest`, the Privacy page merges two changes each approved on its own branch: check-decisions' (§4 decision item,
§7 Neynar item; words `1rsayc0`) and remix-submit's (§4 entry and daily-counts items; words `16bnvqx`). The owner's
approval of 2026-11-04 covers that merged text plus the lines above (Privacy words `1x81p6y`).
