# Reread pack, 2026-11-04 (DRAFT)

**DRAFT.** Written by the coding agent (Claude, a closed model by Anthropic) overnight on 2026-11-04, branch
`reread-pack`, for the owner's morning. It is not legal advice. Nothing here has been merged, applied, published or
deployed.

This pack lists every legal or wording change that is waiting on you, in one place. They are ordered by what each
reread unlocks, with the most unblocking first. Each item gives:

- the branch and commit;
- the **Before**, word for word from `origin/main`'s `src/lib/legal.ts` (main at **5559f56** = d42b7d8 plus #108,
  which didn't touch `legal.ts`), or from the main file named;
- the **After**, word for word from the branch;
- what saying "reread" (or "OK", for non-legal wording) unlocks;
- the choices you need to make, with my recommendation.

Every "before" was checked against main tonight. Where a branch's text no longer matches main, it is marked
**STALE**.

## How to answer

Reply by item number, for example "1 reread", "3 reread with 3.2 = B", "13: W44 ok, W53 change to …".
"Reread" covers the item's legal lines only. Merging still follows CLAUDE.md: a merge needs your "merge", and any
migration has to be "applied" first.

## The order at a glance

| # | Item | Branch @ commit | Saying "reread" unlocks | Needs first |
|---|---|---|---|---|
| 1 | Privacy §3: the furthest chapter (one clause) | `privacy-furthest-chapter` @ 344786a | Today's Privacy page becomes true. It's the base text for every other §3 change (items 3 and 6). | Merge main into the branch (it's 30 commits behind) |
| 2 | Check decisions: Neynar §7, §4 and About | `check-decisions` @ 8093118 | Merging check-decisions (no scores kept). It also gives the wording that items 3 and 4 reuse for Lens and Bluesky. | `NEXT_check_decisions.sql` applied |
| 3 | Lens and Bluesky sign-in: the three final lines | `signin-lens-bluesky` @ e6a1d0c | Lens and Bluesky sign-in (12 Nov) | Items 2 and 4 in the same release; two migrations applied |
| 4 | The Bluesky check | `bluesky-check` @ 9dd54bd | Free images and frames for a Bluesky account that passes the check. It also makes item 3's Terms §4 true. | Item 3 merged in; three migrations applied |
| 5 | Closed-model bases: done, plus the Midjourney lines | `closed-model-bases` @ 702c6e3 | Merging closed-model-bases (already reread). The Midjourney lines unlock publishing anything made from your Midjourney reference. | Nothing (it's level with main) |
| 6 | Model choice for remixers | `remix-model-choice` @ 00e4001 | Turning `IMAGES.designs.modelChoice` on (12 Nov) | Item 5 merged first; `NEXT_remix_model_choice.sql` applied |
| 7 | "Ask for help" and "Find a moment": Privacy §5 (and §6, Terms §6e) | `sheet-help` @ 601d081, `find-a-moment` @ 0a178e0 | Ask for help and Find a moment going live (12 Nov) | `NEXT_sheet_help.sql` applied; **raise P9d first (item 12)** |
| 8 | Fund page: Terms §6c | `fund-page` @ 1773ff2 | /fund live, with the new Splits Teams account | Merge main into the branch |
| 9 | Submit: Terms §6e, Privacy §4 and §6, the rules | `remix-submit` @ 8e7b5f9 | Submit, three per person, three free remixes a day | Two migrations applied; merge main (admin-only gate) |
| 10 | The refusal that offers a next step | `signin-reread-list` @ c7a5328 | Building the refusal lines (nothing is built yet) | None for (a); linking for (b) |
| 11 | Remix landing: the arrival line, "Remix this", "Remixing opens …" | `remix-landing` @ 2544598 | Merging the landing page and link previews | Merge main (admin-only gate) |
| 12 | Principle 9 (spoilers) | `find-a-moment` @ 0a178e0 | Principle 9 joins `docs/principles.md`; P9b–P9f become owed checks | A decision on item 7's P9d conflict |
| 13 | W1–W82: what's still open | `wording-for-approval` @ b4bcf34 | Removing the "Draft wording" line from the sheet page and the remix form | Nothing |
| — | Also waiting, not in tonight's list | several | — | — |

**The 12 November release, if you want it as one batch:** 1, 2, 3, 4, 6 and 7 all change Privacy §3, §4, §5 or §7.
Reread together, they need one combined set of words and one new `ownerReread` key per page (see "Overlaps"). Items
8, 9 and 11 are independent of that batch.

## Stale "before" quotes and keys (read this first)

Main took two rereads on 2026-11-04 that most branches don't have yet: wallet-fid-link (Privacy **1wgu7z**, PR #110)
and the effective date **2026-11-04**. All branches except `closed-model-bases` and `remix-model-choice` were cut
before that, so:

1. **The wallet-link item in Privacy §4 is stale** on check-decisions, signin-lens-bluesky, bluesky-check,
   remix-submit, fund-page and privacy-furthest-chapter. Their `legal.ts` still reads "(because that account verified
   the wallet's address on Farcaster, or because you linked them while signed in with both)". Main reads "(because
   Farcaster lists the wallet's address as that account's, as its custody address or as an address it verified, or
   because you linked them while signed in with both)". Main's words win at every merge. None of these branches meant
   to change that line.
2. **The Neynar item in Privacy §7 is stale** on the same six branches. Their wallet sentences say "the Farcaster
   account that has verified it; if exactly one has, … no longer verifies it". Main says "the Farcaster account whose
   custody address it is or that has verified it; if exactly one account has it, … no longer has it". check-decisions
   and signin-lens-bluesky also change the start of this same item, so a combined text is given in Overlap B.
3. **The recorded future keys are stale.** These were all computed on the old Privacy words: signin-lens-bluesky's
   `qdj3pt` / `f2hfa7`, remix-submit's Privacy `mvnybk` and privacy-furthest-chapter's `1ruixoi`. They have to be
   recomputed at merge, from the words you actually reread. remix-submit's Terms `1jj0onr` may still hold (Terms on
   main is unchanged at 15lsr9u), but any other Terms change merged first makes it stale too.
4. **`LEGAL.effective` reads 2026-11-01** on signin-lens-bluesky, bluesky-check, remix-submit and
   privacy-furthest-chapter. Main reads 2026-11-04. It gets set to the merge day.
5. **The quoted "befores" in the draft docs all still match main**, except:
   - `remix-model-choice-draft.md`'s consent quote writes "drafts you don't publish" with a straight apostrophe.
     `config/consent.json` own-words-v4 has a curly one ("don’t"). It doesn't change the meaning, but it isn't word
     for word.
   - `signin-final-words.md` quotes as its "Before" the lines from the reread list's drafts, not main. That's correct
     for what you're OKing. The before **against main** is given below.
   - `signin-final-words.md` says the Bluesky check's retention is "24 hours". bluesky-check now says "for up to 90
     days" (your rule of 2026-11-04). That note is stale.
6. **closed-model-bases' recorded keys** (Terms `7w024g`, Privacy `4qjwtd`) are true only while it stays level with
   main. Merged first, they hold. Merged after any other legal change, they need recomputing for the combined words.
   Your reread of its sentences still stands either way.

---

## 1. Privacy §3: the furthest chapter is sent as a number

**Branch** `privacy-furthest-chapter` @ 344786a (2026-11-04). Draft: `docs/legal/privacy-furthest-chapter-draft.md`.
Your request: "Privacy §3 is wrong today … Fix it on main now, separately."

**Before** (main, Privacy §3, matches):

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen credited. These stay on your device. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

**After** (only "These stay on your device." changes):

> … and a payment you have sent but not yet seen credited. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. …

**Saying "reread" unlocks:** merging a correction to today's live Privacy page. There's no migration and no code
change. It also fixes the §3 base text that items 3 and 6 add to (Overlap A).

**Needs first:** merge main into the branch. It's 30 commits behind and carries the pre-wallet-fid-link §4 and §7
lines (stale points 1 and 2). Then recompute the key.

**Choices:**

- **1.1** Keep the parenthesis "(or another chapter you choose for a conversation)". **Recommend: keep it.** Without
  it, the clause is false when a reader picks another chapter.
- **1.2** Once "Find a moment" (item 7) ships, it also sends the furthest chapter, and "Ask for help" sends a chapter
  limit too. The find-a-moment draft says §3 is "handled separately, on main". **Recommend:** when item 7 ships, widen
  the clause to "except that the assistant, and 'Ask for help' and 'Find a moment' on a character sheet, send the
  furthest chapter …". Those are new words, so they'd need your reread with item 7. Not today.

---

## 2. Check decisions, not scores: Neynar §7, §4 and About

**Branch** `check-decisions` @ 8093118 (2026-11-04). Draft: `docs/legal/check-decisions-draft.md`. Your rule:
"store the decision, not the score".

### 2a. Privacy §7, the Neynar item: only its first sentences change

**Before** (main, those sentences match):

> Neynar receives your Farcaster ID when you first make an image on a given day, to look up its account score, which decides whether you can make images. We keep the score for a day. During the remix challenge, that check also decides, once, when you publish a remix of a challenge character, whether it can count as an entry.

**After:**

> Neynar receives your Farcaster ID when you make or publish an image or a character sheet and your account has no current check, to look up its account score, which decides whether you can make images. We don't keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. During the remix challenge, that check also decides, once, when you publish a remix of a challenge character, whether it can count as an entry.

**STALE** in the branch's `legal.ts`: the rest of this item still has the old wallet sentences. The full combined item
is in Overlap B.

### 2b. Privacy §4: a new item, after "How many images and Remix frames you make each day, …"

**Before:** no such item.

**After:**

> Whether your Farcaster account passed the check for making images (its Neynar score against the score needed), when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.

### 2c. About (`src/app/about/page.tsx`, not a legal page, same reread)

**Before** (main, matches):

> Neynar receives your Farcaster ID when you make an image, to look up its account score, which decides whether you can make images. The score is kept for a day.

**After:**

> Neynar receives your Farcaster ID when you make an image and your account has no current check, to look up its account score, which decides whether you can make images. The score isn't kept: only whether your account passed and when, for up to 90 days (a day if it didn't pass).

The consent screen ("your Farcaster ID to Neynar to check your account's score") stays true and is not changed.

**Saying "reread" unlocks:** merging check-decisions once `NEXT_check_decisions.sql` is applied. The migration
deletes every kept score, so the new words are true on day one. These are also the words items 3 and 4 reuse for Lens
and Bluesky, and signin-lens-bluesky already carries them merged in.

**Needs first:** the migration applied (you have the blocks; they're not applied yet). Merge main (stale points 1
and 2).

**Choices:**

- **2.1** Does a maker hiding their own picture also withdraw their pass? **Recommend: no**, as drafted. A self-hide
  isn't a signal, and withdrawing would cost a lookup.
- **2.2** Delete old score rows in the migration (as drafted), or let them expire. **Recommend: delete them**, so the
  words are true the day they go live.

---

## 3. Lens and Bluesky sign-in: the three changed lines

**Branch** `signin-lens-bluesky` @ e6a1d0c (2026-11-04). Draft: `docs/legal/signin-final-words.md`. You already
approved items 5–12 of the reread list as drafted, except these three lines. They're new words, so they need your
final OK. The branch also carries check-decisions' lines (item 2), merged in.

### 3.1 Privacy §7, the Lens item (a new item, before Neynar's)

**Before** (main): there's no Lens sign-in item. Main's §7 names Lens only in the "Bluesky and Lens receive the
details of a post …" item and the share-link item.

**After** (the whole new item; the changed part starts at "When you make an image or a frame"):

> If you sign in with Lens: our server asks Lens's API (api.lens.xyz) for a sign-in message for your Lens account and the wallet you sign with, and sends Lens your signature, which Lens checks. Lens receives those two addresses and learns that you signed in here. To show you which Lens accounts your wallet can sign in as, Lens also receives your wallet's address. When you make an image or a frame without a linked Farcaster account, and we have no current decision for your Lens account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides whether you get free images and frames. We don't keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. Lens is never asked about you when someone views a page or when you open the image or frame maker.

### 3.2 Privacy §4, the Lens/Bluesky link item, with the 30-day sentence

**Before** (main): no such item.

**After:**

> If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page. An account you unlink can be linked to a different account only after 30 days.

### 3.3 Terms §4 (Who can use it.)

**Before** (main, Terms §4, matches):

> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does.

**After:**

> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account, with a Lens account whose Lens score is at least the one the Service shows, and with a Bluesky account that passes the site's check (made before 6 November 2026, with at least 5 posts in the last 30 days); a Bluesky account that doesn't pass gets them only while it is linked to a Farcaster or Lens account. To prepay for generations, sign in with a wallet (section 6a).

### Already approved and in the branch (for reference; this reread records them)

These are in `legal.ts` as drafted: Terms §5's byline (Lens username, Bluesky handle); Privacy §3's sign-in lengths
and the Bluesky note (Overlap A); §4's opening line ("Your account (a Farcaster account, a wallet address, a Lens
account or a Bluesky account), and what you do with it here:"); §4's Lens/Bluesky sign-in item; §4's images item
("your name (Farcaster name, wallet address, Lens username or Bluesky handle)"); §6's names (Overlap C); and §7's
Bluesky sign-in item. Until you OK 3.1–3.3, the reread record stays at the old words, so P6k and P6l fail on this
branch, as they should.

**Saying "reread" (to 3.1–3.3 plus item 2) unlocks:** Lens and Bluesky sign-in, for the 12 Nov release.

**Needs first:**

- `NEXT_check_decisions.sql` and `NEXT_signin_lens_bluesky.sql` applied (`docs/legal/signin-sql-for-owner.md`).
- Item 4 (bluesky-check) in the same release. 3.3 describes the Bluesky check, so without it the Terms §4 sentence is
  false.
- Merge main (stale points 1–4).
- Your own Lens App registration (separate doc on the branch).

**Choices:**

- **3.4** The §4 check item from item 2 names only Farcaster. Either widen it ("Whether your Farcaster account, or
  your Lens account, passed …"), or add check-decisions' own drafted Lens item, word for word:

  > Whether your Lens account passed the check for making images (its Lens score against the score needed), when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day.

  **Recommend: add check-decisions' Lens item as drafted** (no new words, and it's already reviewed against the same
  store). As written, though, it leaves out the early-removal sentence that the Farcaster item has, even though Lens's
  code does remove a pass early. Say if you want "A pass is removed sooner if your account is reported or one of your
  pictures is hidden by a moderator." added, as on the Farcaster item.
- **3.5** The consent screen (own-words-v4) still says "your Farcaster ID to Neynar to check your account's score".
  For a Lens account, Lens receives the account's address instead, and the screen doesn't say so. The branch doesn't
  change `consent.json`. **Recommend:** fold a Lens/Bluesky sentence into the consent v5 that item 6 already needs
  (one re-ask, not two). This is your call; I haven't drafted the words.

---

## 4. The Bluesky check

**Branch** `bluesky-check` @ 9dd54bd (2026-11-04). Draft: `docs/legal/bluesky-check-draft.md`. It's built on
signin-lens-bluesky at 1aca85e, **before** sign-in's legal lines and check-decisions were merged in. So its
`legal.ts` has neither, and its Neynar item is the pre-check-decisions one (STALE).

### 4.1 Privacy §7: a new item, after Neynar's

**Before:** no such item.

**After** (bluesky-check, as in its `legal.ts`):

> If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster account: when you first make an image or a frame on a given day, and when you publish a remix during the remix challenge, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free and whether a remix can count as an entry. We keep only whether your account passed and when, for up to 90 days; never the dates or posts we read. Bluesky is never asked about you when someone views a page.

**Against check-decisions' drafted Bluesky line** (`check-decisions-draft.md` §4, which you asked this to match):

> When you sign in with Bluesky and your account has no current check, Bluesky's public API receives your account's id (its DID), so we can read when the account was made and how many posts it made in the last 30 days, which decide whether you can make images. We don't keep those: we keep only whether your account passed (made before 6 November 2026, with at least 5 posts in the last 30 days) and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported or one of your pictures is hidden by a moderator.

**Differences:**

| | bluesky-check | check-decisions' draft |
|---|---|---|
| When it's asked | "when you first make an image or a frame on a given day, and when you publish a remix" | "when … your account has no current check" |
| Scope | only an account "that isn't linked to a Farcaster account" | not stated |
| Service named | "Bluesky's public AppView (public.api.bsky.app)" | "Bluesky's public API" |
| What's read | "when your account was made and its latest posts" | "when the account was made and how many posts it made in the last 30 days" |
| What it decides | free images and frames, **and** whether a remix can count as an entry | "whether you can make images" |
| Retention of a fail | not stated ("for up to 90 days") | "(a day if it didn't pass)" |
| The rule | not stated | "made before 6 November 2026, with at least 5 posts in the last 30 days" |
| Asked again early | **missing**. The code (`studio.bluesky_checks`) doesn't do it yet; it comes when this check moves onto check-decisions' store | "we check again sooner if your account is reported or one of your pictures is hidden by a moderator" |
| A §4 item | **none** | drafted (below) |

**"First … on a given day" is wrong for a 90-day pass.** With the pass kept 90 days, Bluesky isn't asked every day.

**Combined After, recommended.** This is my merge of the two drafts, matched to what bluesky-check's code does today.
The new words are "and your account has no current check", the rule in brackets and "(a day if it didn't pass)":

> If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster account: when you make an image or a frame, or publish a remix during the remix challenge, and your account has no current check, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free and whether a remix can count as an entry. We keep only whether your account passed (made before 6 November 2026, with at least 5 posts in the last 30 days) and when, for up to 90 days (a day if it didn't pass); never the dates or posts we read. Bluesky is never asked about you when someone views a page.

**4.2 Privacy §4: check-decisions' drafted Bluesky item** (not in bluesky-check). Recommend adding it, word for word:

> Whether your Bluesky account passed the check for making images (made before 6 November 2026, with at least 5 posts in the last 30 days), and when that was decided; never its age or its post count. A pass is kept for 90 days and a fail for a day.

### 4.3 Privacy §4, the remix challenge's entry phrase

**Before** (main, matches): "…(you were invited, you are an admin, or whether your account passed the site's
check), decided once, when you publish it…"

**After:** "…(you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for
a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it…"

This overlaps item 9 (Overlap D).

### 4.4 Privacy §4, the IPFS record phrase; Terms §6e, the same phrase

**Before** (main, both match): "…its maker's Farcaster ID, when it was published and what it was built on…"

**After:** "…its maker's Farcaster ID (or, for a Bluesky account, its DID), when it was published and what it was
built on…"

### 4.5 Terms §6e, who may remix

**Before** (main, matches): "During the challenge, anyone signed in with a Farcaster account that passes the site's
check may remix its characters' sheets;"

**After:** "During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the
site's check for it may remix its characters' sheets;"

**Saying "reread" unlocks:** the Bluesky check (free images and frames, and remixing, for a Bluesky account that
passes). It also makes item 3's Terms §4 true. It ships with Bluesky sign-in on 12 Nov.

**Needs first:**

- Item 3's branch merged in, so it carries sign-in's lines and check-decisions'.
- `NEXT_check_decisions.sql`, `NEXT_signin_lens_bluesky.sql` and `NEXT_social_bluesky_check.sql` applied.
- Merge main.

**Choices:**

- **4.6** Move the Bluesky check onto check-decisions' shared store before the release, so it also asks again early
  after a report or a hide. Then all three networks say the same, and the combined line gains "and we check again
  sooner if your account is reported or one of your pictures is hidden by a moderator". The alternative is to ship
  without early re-asks. **Recommend: move it onto the shared store.** The person passes if any linked account
  passes, which is simpler with one store.
- **4.7** The wording files (`src/lib/challenge/wording.ts` "whoCanEnter", `src/lib/images/wording.ts`) still say
  "a Farcaster account that passes the site's check". They change in the release that turns Bluesky sign-in on. That's
  noted here, not drafted.

---

## 5. Closed-model bases: what's done, and what's still open

**Branch** `closed-model-bases` @ 702c6e3 (2026-11-04), level with main (0 behind, 6 ahead). Drafts:
`docs/legal/closed-model-bases-draft.md` and `docs/legal/midjourney-reference-draft.md`.

### Done: your reread of 2026-11-04 ("approved as drafted")

`LEGAL.ownerReread` on the branch is at Terms `7w024g` and Privacy `4qjwtd`, on 2026-11-04. `closedBasesAllowed`
stays off.

- **Privacy §7, a new item after fal.ai.** DONE:
  > OpenAI and Google, through Vercel AI Gateway, receive the prompt and the reference pictures for some of the pictures the project makes itself: the remix challenge's bases, styles and references. They receive nothing about you, and your browser never contacts them. We send the gateway only the prompt, the pictures and the picture's settings, and it passes them on from its own accounts with OpenAI and Google, set so that neither may train on them. Google, on its Vertex AI, keeps no copy. OpenAI may keep our prompts, reference pictures and the pictures it makes for up to 30 days to watch for abuse, and longer only where the law requires it or to protect its services or others from harm. Each picture's recipe names the model and its maker.
- **Terms §8, two sentences added after main's last one.** DONE:
  > Some of the project's own pictures, among them some of the remix challenge's bases, styles and references, are made with closed models by OpenAI and Google, named with their maker on each picture's recipe. Their makers' terms let us publish them and bind us, not you: we offer these pictures under the licence in section 3, as far as anyone holds rights in them, since a picture made wholly by a model may have no copyright at all.
- **About, "Where it runs", after "Supabase holds the database."** DONE:
  > Some of the project's own pictures (the remix challenge's bases, styles and references) are made with closed models by OpenAI and Google, through Vercel AI Gateway: they receive the prompt and the reference pictures, nothing about you.

### Still open: the Midjourney reference (not reread, and not in `legal.ts`)

challenge-styles' latest commit (95fd9af, 2026-11-04 00:01) records the reference's recipe card and Midjourney's
terms, quoted from a dated copy. It adds **no** legal line. The draft lines live on closed-model-bases.

- **5.1 Terms §8, one sentence after the closed-model sentences.** Before: none. After:
  > Some of these pictures were made from a reference the owner made outside the Service with Midjourney, a closed model by Midjourney; its recipe says so and labels it "Brought in". The owner owns that picture under Midjourney's terms and offers it, and what is made from it, under the licence in section 3, as far as anyone holds rights in them.
- **5.2 About, one sentence after the OpenAI and Google sentence.** Before: none. After:
  > One reference picture was made by the owner outside the site with Midjourney and brought in; the site sends nothing to Midjourney.
- No Privacy line is needed: nothing is sent to Midjourney.

**Saying "reread" to 5.1–5.2 unlocks:** publishing any base or picture made from your Midjourney reference (the
"Animated series" direction). They go into `legal.ts` only in that release.

**Your reread already unlocks** merging closed-model-bases itself, whenever you say "merge". Merging it **first**
keeps its keys valid, and item 6 needs it merged before it can go.

**Choices:**

- **5.3** Midjourney's live terms page refused the fetch. The quotes are from a dated third-party copy (TOS Tracker,
  captured 2026-07-03). **Recommend:** re-check the live page before anything made from the reference is published.
- **5.4** check:principles' `SERVICES`: should Midjourney be a maker named for provenance (not a service that
  receives anything), so P6h doesn't demand a Privacy line? That's a check change for your OK. **Recommend: yes.**
- **5.5** The uploaded file differs from the recipe card's saved copy. Confirm whether it's an upscale or another
  export, so the recipe can say which.
- **5.6** Merge timing: still yours to decide (your note of 2026-11-04).

---

## 6. Model choice for remixers

**Branch** `remix-model-choice` @ 00e4001 (2026-11-04), 2 behind main (no legal change in those 2), 8 ahead. Draft:
`docs/legal/remix-model-choice-draft.md` v2. The Privacy §3, §4 and §7 lines and the notices are in `legal.ts` on
the branch. Consent, Terms §8 and About are drafts only (About is on the branch's page).

### 6a. The notices (`MODEL_NOTICES`, new), word for word

**OpenAI** (notice version 1): title "A closed model by OpenAI".

> GPT Image 2.5 Sunburst is made by OpenAI. Its weights aren't published, so its recipe can't be re-run exactly.
>
> OpenAI receives your prompt for each view and, for the side and back, the front view it made, through Vercel AI Gateway. Nothing else about you.
>
> OpenAI may keep them for up to 30 days to check for abuse, and longer if its checks flag a picture for review. It doesn't train its models on them. The gateway keeps no copy.

**Google** (notice version 1): title "A closed model by Google".

> Gemini 3.1 Flash Image is made by Google. Its weights aren't published, so its recipe can't be re-run exactly.
>
> Google receives your prompt for each view and, for the side and back, the front view it made, through Vercel AI Gateway. Nothing else about you.
>
> Google is set to keep no copy, through the gateway's zero-retention agreement with Google Vertex AI, and doesn't train its models on them. The gateway keeps no copy.

### 6b. The 18+ line (`ADULT_CONFIRM`), shown with the first notice a device sees

> Closed models are for people 18 or older, as signing in here is (Terms, section 4).
>
> ☐ I'm 18 or older

Buttons (`NOTICE_BUTTONS`): "OK" · "Don't remind me again". Both stay disabled until the box is ticked.

### 6c. The labels beside each closed model in the picker

- GPT Image 2.5 Sunburst: "OpenAI keeps prompts up to 30 days"
- Gemini 3.1 Flash Image: "Google keeps no copy"

### 6d. Privacy §3: one sentence before "These stay on your device."

**Before:** main's §3 (quoted in item 1).

**After** (the added sentence):

> If you choose a closed model when you remix a character's sheet, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; we don't receive either.

Combined with items 1 and 3 in Overlap A.

### 6e. Privacy §4, the character sheets item

**Before** (main, matches):

> Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets.

**After:**

> Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets. When you remix a character's sheet you can choose the model that makes all of its views: the site's open models, or a closed model, named with its maker on the form and in each view's record. How many pictures you make with closed models each day is counted apart from the others.

### 6f. Privacy §7: a new item after fal.ai (after closed-model-bases' item, if that ships)

**Before:** none.

**After:**

> If you choose a closed model when you remix a character's sheet, its maker receives, through Vercel AI Gateway, the prompt for each view and, for the side and back, the front view it made. It receives nothing else about you, and your browser never contacts it. OpenAI (for GPT Image 2.5 Sunburst) may keep them for up to 30 days to check for abuse, and longer if its checks flag a picture for review; it does not train its models on them. Google (for Gemini 3.1 Flash Image) is set to keep no copy, through the gateway's zero-retention agreement with Google Vertex AI, and does not train its models on them. The gateway itself keeps no copy.

### 6g. Consent, own-words-v5 (draft only; `config/consent.json` isn't changed on the branch)

**Before** (own-words-v4, its last paragraph, from `config/consent.json`):

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

**After:**

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. If you choose a closed model for a sheet's views, the prompt and the front view go to its maker (OpenAI or Google) through Vercel AI Gateway instead of fal.ai; OpenAI may keep them for up to 30 days. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don't publish stay on your device.

(The draft writes "don't" with a straight apostrophe. v4 has "don’t". Keep v4's curly one.)

### 6h. Terms §8: one sentence at the end

**Before:** main's §8 ("The narration, … not advice of any kind.").

**After** (the added sentence):

> When you remix a character's sheet you may choose a closed model for its views, named with its maker on the form and in each view's record; its maker's terms let us publish those pictures, and bind us, not you: they are offered under the licence in section 3, as far as anyone holds rights in them, and a closed model's recipe can't be re-run exactly.

Combined with item 5 in Overlap F.

### 6i. About, "Where it runs": one sentence after "Supabase holds the database."

> If you choose a closed model when you remix a character's sheet, its maker (OpenAI or Google) receives the prompt and the front view through Vercel AI Gateway, and nothing about you; OpenAI may keep them for up to 30 days, Google is set to keep no copy, and neither trains on them.

**Saying "reread" unlocks:** turning `IMAGES.designs.modelChoice` on, for the 12 Nov release. P6t fails while the
switch is on and these lines are missing.

**Needs first:**

- Item 5 merged first (the §7 items sit side by side, and the §8 sentence follows its sentences).
- `NEXT_remix_model_choice.sql` applied.
- The consent decision (6.1).

**Choices:**

- **6.1** Consent: a new version, own-words-v5 (everyone agrees again), or a separate consent only when a closed model
  is chosen. **Recommend: own-words-v5.** P6j compares the consent screen with what receives the prompt, and v5 can
  also fix the Lens gap (3.5) in the same re-ask.
- **6.2** The 18+ box is a device-only reminder, not a verification. Is that enough under OpenAI's minors clause, in
  your reading? This is your reading to make. For Google, you decided on 2026-11-04 that it's fine.
- **6.3** Google: "set to keep no copy" (Vercel's ZDR agreement), or also name Google's own 24-hour in-memory cache.
  **Recommend: add the cache.** Google's own page states it, and Vercel's agreement doesn't say it covers it.
- **6.4** OpenAI is described two ways. Bases (item 5, reread) say "longer only where the law requires it or to
  protect its services or others from harm". Model choice (6a, 6f) says "longer if its checks flag a picture for
  review". Both are quoted from OpenAI's pages, for different cases. **Recommend:** one description in both §7 items
  and the notice, for example "for up to 30 days to watch for abuse, and longer if its checks flag a picture for
  review or where the law requires it". That's new wording, so it needs your reread, and it would reopen item 5's
  reread for that one sentence.
- **6.5** OpenAI's live policy pages still refuse the fetch. Re-check the ownership and usage quotes there.
- **6.6–6.10** These are in the draft and aren't wording: C2PA originals; closed models for wallet accounts (refused
  for now); whether a closed-model remix can be an entry or be minted; the form's other wording; Qwen after a test.

---

## 7. "Ask for help" and "Find a moment": Privacy §5, with §6 and Terms §6e

**Branches:**

- `sheet-help` @ 601d081 (2026-11-04). Draft: `docs/legal/sheet-help-draft.md`. §6 uses your words "words it
  suggested to you".
- `find-a-moment` @ 0a178e0 (2026-11-04). Draft: `docs/legal/find-a-moment-draft.md` v2, built on sheet-help. Its
  two sentences are your own words.

Neither branch puts these lines in `legal.ts`. They go in after "reread", in the release that switches each feature
on.

### 7a. Privacy §5 (The assistant.)

**Before** (main, matches):

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending.

**After** (main's text, then sheet-help's four sentences, then find-a-moment's two):

> Your question is sent to Groq to be answered, or through Vercel AI Gateway to Groq when Groq is busy. Both are set to keep nothing. We keep no copy of your questions or the answers. Under your Farcaster ID we record only how many questions you ask and when, to count the daily limit. The assistant's costs are kept only as daily totals, without your ID, to track our spending. On a character sheet, 'Ask for help' sends your message, the sheet's prompt draft and recipe, and the character's facts from the book to Groq (or through Vercel AI Gateway when Groq is busy), set to keep nothing. We keep no copy of the conversation. We keep a fingerprint of each change it suggests to you (not the words themselves, and never your message), with your Farcaster ID and the sheet, for 2 days, so that if you publish that sheet with those words, its recipe says it includes words from AI suggestions. Under your Farcaster ID we also record how many messages you send and when, to count the daily limit; costs are kept as daily totals without your ID. 'Find a moment' sends what you describe, the character you choose and the furthest chapter you've opened (or that you chose to include later chapters), with the passages book search found, the same way. Each search counts as one of those messages, and we keep nothing else about it.

### 7b. Privacy §6: one sentence at the end (sheet-help)

> If you publish a sheet whose prompt includes words it suggested to you in 'Ask for help', its recipe says it includes words from AI suggestions.

It follows the remix challenge's sentence, which item 9 rewrites (Overlap C).

### 7c. Terms §6e: one sentence at the end (sheet-help)

> 'Ask for help' is optional; entries are judged the same either way.

### 7d. Privacy §7, the Groq item (sheet-help suggests it; not drafted as a line)

**Before** (main): "Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for
images you make, which are checked against the published rules."

**After** (suggested): "Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, 'Ask for help'
messages, and the prompts for images you make, which are checked against the published rules."

**Saying "reread" unlocks:** "Ask for help" (P6r) and "Find a moment" (P6w) going live in the 12 Nov release, once
their switches are on.

**Needs first:** `NEXT_sheet_help.sql` applied. Merge main into both branches (sheet-help is 61 behind, find-a-moment
37 behind).

**Choices:**

- **7.1** Add "'Ask for help' messages" to §7's Groq item. **Recommend: yes**, so §7's list stays complete.
- **7.2** "Under your Farcaster ID": Ask for help counts per FID (`reserveHelp`). If Lens or Bluesky accounts can use
  it once sign-in ships, these words must widen. **Recommend:** keep it Farcaster-only for 12 Nov, so the words stay
  true.
- **7.3** The §3 clause (item 1.2) once these ship.
- **7.4 A principle conflict, raised before you decide:** under draft principle 9 (item 12), "Ask for help" floors
  the chapter limit at the character's first chapter (`validateHelp`). So a reader before that chapter has later facts
  sent to the model, and can be shown a later quote. That **fails P9d**. If you adopt P9 and ship Ask for help on
  12 Nov as built, it ships in breach of it. You said "don't fix it yet". Choose: fix the floor before 12 Nov, ship
  with P9d recorded as an open item, or don't adopt P9 yet.

---

## 8. Fund page: Terms §6c and the page's words

**Branch** `fund-page` @ 1773ff2 (2026-11-04). Draft: `docs/legal/fund-page-draft.md`.

**Before** (main, Terms §6c, matches):

> **6c. Support.** You can send money to the address on the Support page (a Splits account on Ethereum or Base) to support the We Are Lum team, who make the Service. It's a gift: it buys nothing on the Service, isn't an investment, can't be refunded and isn't tax-deductible (Lum LLC is not a charity). Send it only on the networks the page names; money sent on any other network may be lost. How it's shared out is public on Splits.

**After:**

> **6c. Fund.** You can send money to the address on the Fund page (a Splits Teams account on Ethereum or Base) to fund the We Are Lum team, who make the Service. It's a gift: it buys nothing on the Service, isn't an investment, can't be refunded and isn't tax-deductible (Lum LLC is not a charity). Send it only on the networks the page names; money sent on any other network may be lost. The account is a smart account the team controls, not a split: nothing divides what it receives automatically. Everything it receives and sends is public on each network.

**The page's words** (`src/lib/support-wording.ts`):

| Where | Today (main) | After |
|---|---|---|
| Menu (first section, under "Remix the cast") | not in the menu | **Fund** |
| Page title | Support the We Are Lum team | **Fund this project** |
| Footer and About link | Support the We Are Lum team | **Fund this project** |
| The line | We make snowmoon.party. Send ETH or USDC on Ethereum mainnet or Base to this address, or send below. | unchanged while both chains are ready |
| The warning | Other networks: funds may be lost. | unchanged |

**Saying "reread" (and OK to the page words) unlocks:** /fund live with the new address
0xe29f1FC6B5afEd31897e8B388d9c1145a4e819d5. /support redirects there. P7c checks the code exists on each ready chain.
There's no migration and no Privacy change.

**Needs first:** merge main (stale points 1 and 2; it's 30 behind).

**Choices:**

- **8.1** "to fund the We Are Lum team" (keeps your earlier "support the We Are Lum team"), or "to fund this project,
  made by the We Are Lum team". **Recommend: the first.** It's closest to your reread words.
- **8.2** "(a Splits Teams account on Ethereum or Base)", or "(a Splits Teams account, on the networks the Fund page
  names)". **Recommend: the second.** It never goes false if a chain is switched off.
- **8.3** The footer: "Fund this project" (the title), or "Fund" (the menu label). You named only the menu and the
  title. **Recommend: "Fund this project"**, as drafted.
- **8.4** "Remix the cast" is the menu item above Fund. While /challenge is admin-only, non-admins don't see it, so
  "under 'Remix the cast'" is true only for admins. The placement still works for everyone else.

---

## 9. Submit: Terms §6e, Privacy §4 and §6, the rules and the publish confirmation

**Branch** `remix-submit` @ 8e7b5f9 (2026-11-04). Draft: `docs/legal/remix-submit-draft.md`.

### 9a. Terms §6e

**Before** (main, Terms §6e, matches):

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

**After:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry only once its maker submits it on the Service, with a link to a post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. Each person can submit up to three entries, for one character or several, and can withdraw one until entries close. A character needs entries from at least three different people to get a final version; several entries by one person count once. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

### 9b. Privacy §4, the entry item

**Before** (main, matches):

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check), decided once, when you publish it, and kept with the time it was decided; and which of your versions you mark as your entry for each character, and when. Whether a version is an entry is shown on its page and on the challenge page, with how many people have entered each character.

**After:**

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check), decided once, when you publish it, and kept with the time it was decided; and each version you submit as an entry (up to three), with its character and when you submitted it. Submitting needs the link to your post about it, which is kept and listed on the version's page like any post you add (below). If you withdraw a submission, it is deleted; the post stays listed until you remove it. Whether a version is an entry is shown on its page and on the challenge page, with how many people have submitted for each character.

### 9c. Privacy §4, the daily-limits item

**Before** (main, matches): "How many images and Remix frames you make each day, to count the daily limits, and the
reports you make."

**After:** "How many images, sheet remixes and Remix frames you make each day, to count the daily limits, and the
reports you make."

### 9d. Privacy §6, the last sentence

**Before** (main, matches): "During the remix challenge, a version of one of its characters that you publish may be
shown as your entry, on its page and on the challenge page."

**After:** "During the remix challenge, a version of one of its characters that you publish and submit is shown as an
entry, on its page and on the challenge page."

### 9e. The rules (`src/lib/challenge/wording.ts`, draft wording)

| Rule | Before (main, matches) | After |
|---|---|---|
| Entries | One entry per person per character. Your latest version counts unless you mark another. | A remix becomes an entry only when you press Submit on its page, with a link to your post about it on Farcaster, Bluesky or Lens. You can submit up to three, for one character or several. Until entries close you can withdraw one, which frees its place. |
| The minimum | Each character needs at least three different people with an entry. A character with fewer gets no final version, credit test or mint. | Each character needs at least three different people who submitted an entry for it; several entries by one person count once. A character with fewer gets no final version, credit test or mint. |
| Free remixes (new) | none | Remixing is free: three remixes a day. A remix is one sheet's three views; if one of them fails, make it again inside the same remix without using another. |

### 9f. The publish confirmation and its neighbours

| Line | Before (main, matches) | After |
|---|---|---|
| Publish confirmation | This is your entry for {character}. *(your words of 2026-11-03)* | To enter it for {character}, press Submit on its page, with the link to your post about it. |
| Neynar down at publish (its end) | … Publish another version later to enter; an earlier entry for {character}, if you have one, still counts. | … Publish another version later and submit that one; an entry you already submitted still counts. |
| Entry badge note | This is its maker's entry for {character} in the remix challenge. | Submitted as an entry for {character} in the remix challenge. |
| A remix not yet submitted | Made during the remix challenge. Its maker's latest version counts unless they mark another. | Made during the remix challenge. It isn't an entry for {character} unless its maker submits it. |
| After the close | Made during the remix challenge. Entries are closed: its maker's entry for {character} is another version. | Made during the remix challenge. Entries are closed: it wasn't submitted as an entry for {character}. |

**New on the version page** (its maker only): "Submit as an entry"; "A remix becomes an entry only when you submit it,
with the link to your post about it on Farcaster, Bluesky or Lens; the post must link to this page. You can submit up
to three, for one character or several."; the box "Your post's address (Farcaster, Bluesky or Lens)"; "Submit";
"Submitted: this is now one of your entries."; "2 of 3 submissions left"; "Withdraw"; "Until entries close,
withdrawing frees its place."; "Withdrawn: it is no longer an entry."

**Refusals:** "You've submitted 3, the most anyone can. Withdraw one to submit another."; "You've already submitted
this version."; "Add the link to a post about it on Farcaster, Bluesky or Lens first."; "This version can't be
entered: your account didn't pass the site's check when you published it."; "Withdrawing isn't available yet."

**Free remixes:** "You've made today's 3 remixes. More tomorrow (00:00 UTC)."; "This remix has used its 6 pictures.
Press Remix to start a new one."

**Saying "reread" unlocks:** merging Submit, the cap of three, Withdraw and three free remixes a day. While /challenge
is admin-only, only admins see any of it.

**Needs first:**

- `NEXT_challenge_submit.sql` and `NEXT_remix_count.sql` applied.
- Merge main. The branch predates challenge-admin-only (774e124), so Submit must respect `CHALLENGE.public`.

**Choices:**

- **9.1** The publish line replaces your own words of 2026-11-03, because publishing no longer enters. **Recommend:
  the draft.**
- **9.2** The §6 sentence is outside your list. **Recommend: keep it.** The old one ("may be shown as your entry")
  would be false.
- **9.3** A post removed after Submit: the entry stays, as drafted, or stops counting. **Recommend: it stays.** The
  post was checked at Submit, and the record shouldn't depend on a moderator's later hide.
- **9.4** Must the post be your own (writer = submitter)? Not checked, as drafted. **Recommend: require it** for
  Farcaster and Bluesky, where the writer is known. That's a code change, and §4 would then say so.
- **9.5** Submit's refusal never offers prepay. You already decided this on 2026-11-04, and the drafts above follow
  it.

---

## 10. A refusal that offers a next step

**Branch** `signin-reread-list` @ c7a5328, `docs/proposals/linked-accounts.md` §12. Nothing is built. No legal line
changes (§12.5).

**Before** (main, `src/lib/images/gate.ts` `GATE_WORDING.below`, matches):

> Image making is open to Farcaster accounts with a Neynar score of ${IMAGES.neynarMinScore} or more, to keep out spam accounts. Yours is ${shown(value)}. Reading, listening, saving cards and everything else still work.

(It's shown as W55, with 0.7 and the score.)

**After, (a), interim: prepay only, until linking is built.** For Generate: images, sheet views, style samples and
Remix frames.

> Your account doesn’t pass the site’s check for free images and frames.
> You can still make them: sign in with a wallet and prepay.

**After, (b), once linking is built.** `{networks}` lists only the networks the person hasn't linked yet, in the
order Farcaster, Lens, Bluesky.

> Your account doesn’t pass the site’s check for free images and frames.
> Link {networks} that passes, or sign in with a wallet and prepay.

**On Submit, (a), interim** (no prepay, per your decision):

> This version can’t count as an entry: your account didn’t pass the site’s check when you published it.
> You can still remix and share it, but only an account that passes can enter.

**On Submit, (b), after linking:**

> This version can’t count as an entry: your account didn’t pass the site’s check when you published it.
> Link {networks} that passes, then publish a new version to enter.

**Saying "OK" unlocks:** building (a) now. It replaces `GATE_WORDING.below`, sign-in's `FREE_WORDING.lensBelow` and
bluesky-check's two `BLUESKY_CHECK_WORDING` refusals. (b) waits until linking is built.

**Choices:**

- **10.1** Keep the per-network detail (the threshold, and Neynar's score) as a third line under "Why?". **Recommend:
  yes.** People ask why.
- **10.2** The "Tension to settle" in §12.2 is settled by your decision: Submit never offers prepay.
- **10.3** Submit (b) says "then publish a new version to enter". With item 9, publishing alone doesn't enter.
  **Recommend:** "then publish a new version and submit it."
- **10.4** Not wording, but in the same section: tighten A5 to "at most 2 moves in 365 days", or keep 90 days.
  **Recommend: 365.** That caps one strong account at 3 people a year.

---

## 11. Remix landing: the arrival line, "Remix this", "Remixing opens …"

**Branch** `remix-landing` @ 2544598 (2026-11-04), `src/lib/challenge/landing.ts` `LANDING_WORDING`. It's not legal
text. Every date comes from `CHALLENGE.dates`. Shown here as they render today: window "6 to 22 November", opens
"Friday 6 November, 09:00 Pacific", closes "Sunday 22 November, 23:59 Pacific".

**Before:** none. Every line below is new.

| Key | After |
|---|---|
| `arrival` (open or before) | This is a version of {character} in Snowmoon’s remix challenge, [6 to 22 November]. To make your own, sign in with Farcaster, press Remix, change it and publish. |
| `arrival` (closed) | This is a version of {character} from Snowmoon’s remix challenge, which ran [6 to 22 November]. |
| `arrivalLink` | How the challenge works |
| `remix` (the big button) | Remix |
| `remixNote` | Start your own {character} from this one: change it, make the pictures, publish. |
| `opensLine` (before the window, in the button's place) | Remixing opens [Friday 6 November, 09:00 Pacific]. |
| `closedLine` | Entries closed [Sunday 22 November, 23:59 Pacific]. |
| `maker` / `remixOf` | Made by {by} / A remix by {by} |
| `embedButton` (Farcaster card button) | Remix this |
| `cardTop` / `cardAi` (drawn on the card) | SNOWMOON · REMIX THE CAST / AI-GENERATED PICTURE · NOT BY THE AUTHOR |
| `previewDescription` | A version of {character} by {by}, remixed on Snowmoon Party. AI-generated picture, not by the author. |

**Saying "OK" unlocks:** merging the landing page, with its Farcaster embed and the Bluesky and Lens previews.

**Needs first:** merge main. The branch predates challenge-admin-only, so the landing's challenge lines and its Remix
button must respect `CHALLENGE.public`. With the challenge admin-only and no open date, "Remixing opens Friday
6 November" would be false.

**Choices:**

- **11.1** With item 9, publishing alone doesn't enter, but the arrival line only says "make your own", so it stays
  true. With Bluesky sign-in (items 3 and 4), "sign in with Farcaster" becomes narrower than the truth.
  **Recommend:** "sign in, press Remix, change it and publish" once Bluesky can remix.
- **11.2** "Remixing opens …" versus /challenge's "Entries open …" (W4). One verb everywhere? **Recommend:
  "Remixing opens"** on the landing (it's about the button), and "Entries open" on /challenge.

---

## 12. Principle 9: spoilers

**Branch** `find-a-moment` @ 0a178e0, `docs/principles.md`, new section 9 (drafted for your OK). It's your own rule,
not inferred from the author. Only P9a is built.

**Before:** none. The intro says "Eight principles". The draft adds: "(A ninth, on spoilers, is drafted below for the
owner's OK: it is the owner's own rule, not inferred from the author.)"

**After** (the heading and the principle):

> **9. Nothing past where a reader has read is shown, or sent to a model on their behalf, unless they choose it each time.**
>
> Every surface that draws on the book keeps to the furthest chapter opened on the reader's own device. Anything past it is left out or covered, and the surface says that something is held back, until the reader chooses to see it. That choice is made in the open, for that one view, search or thread, and is never assumed: not from a link, not from a character's first chapter, not from an earlier visit. How far someone has read stays on their device. The server learns it only as the number a request carries for its own limit, and never keeps it.

What it means: the limit is `max(openedChapters())`; there are no floors; the choice starts off and never carries
over; what's held back says so, with no later words; names count; the edition's own inventions are held to the same
limit.

Checks: P9a is built ("Find a moment"). P9b (the assistant: a link-opened thread must not start past `readTo()`),
P9c (a sheet's book quotes are absent from the page data), P9d (Ask for help has no floor), P9e (pickers and the
index cover names) and P9f ("Set in the book", after 22 Nov) are proposed. The status table records failures today
for P9b's link case, P9c's page data, P9d and P9e.

The same OK also covers the draft checks P2k and P2l (Find a moment's quotes) and P6r and P6w (the Privacy gates for
items 7a and 7b).

**Saying "OK" unlocks:** principle 9 in `docs/principles.md` on merge. P9b–P9f become owed checks (you said "don't
fix it yet").

**Choices:**

- **12.1** The P9d conflict (item 7.4). **Recommend:** adopt P9, and fix Ask for help's floor before it goes live on
  12 Nov (a small change in `validateHelp`). Then nothing ships in breach.
- **12.2** CLAUDE.md says "`docs/principles.md` holds the eight principles". It would need to say nine. That's your
  file to change.

---

## 13. W1–W82: what's still open

**Source:** `wording-for-approval` @ b4bcf34, `docs/wording-for-approval-2026-11-04.md` v2, read against main at
645cba1. I re-checked each kept item's text against main 5559f56 tonight. All of them are still on main, word for
word.

### Dropped, and why (61 numbered items, plus section 11)

- **Obsolete, no poidh and no bounties** (3): **W9** (the bounties paragraph), **W22** (each character's bounty line)
  and **W23** (the poidh link). You decided on 2026-11-04: no poidh at all. challenge-landing (2df58ca) removes them.
  **Main still has these strings** (`bountyHead`, `bounty`, `bountyFor`, `bountyLink` in
  `src/lib/challenge/wording.ts`). They're unreachable while /challenge is admin-only, and go when challenge-landing
  merges.
- **Already approved** (3, plus section 11): **W69** ("Remix" in place of "Fork", your launch-fixes decision, merged in #99);
  **W70** (your exact words of 2026-11-03); **section 11's About lines** (approved 2026-11-04 and on main at 4a5b7ab);
  **W77** (only a pointer).
- **Superseded by Submit (item 9)** (12): **W13**, **W15**, **W36**, **W38**, **W39**, **W40**, **W41**, **W42**,
  **W72**, **W73**, **W75** and **W80** (the draft marker under W73 and W75). Marking an entry is replaced by Submit.
  Item 9 redrafts each of these.
- **Parked by /challenge admin-only** (43). They're shown only on /challenge, or in the challenge's open-window states,
  which no one but an admin sees while `CHALLENGE.public` is off. challenge-landing also redrafts the public page.
  They come back when you set an open date:
  - **W1–W8**, **W10–W12**, **W14** (and **W71**, the same rule), **W16–W21**, **W24–W34**;
  - **W37** (the sheet's challenge invite) and **W43** (the admin note);
  - **W47** (the challenge sign-in gate);
  - **W63–W68** (Add where you posted it and Posted on: admin-only commit 774e124 hides them, and /api/challenge/posts
    answers 404 to non-admins);
  - **W74** (the share text never mentions the challenge now);
  - **W76** (the menu and home row);
  - **W81** and **W82** (three bases; now on main, on /challenge only).

### Still open (21 items): what the public sees today

Each is the text on main now. Saying "W… ok" approves it as is.

| # | Where | Text (main) |
|---|---|---|
| W35 | A starting sheet's line | The project’s starting sheet. Its text was drafted by the coding agent, a closed model. |
| W44 | The sheet bar's buttons | Remix · New version |
| W45 | The page's foot | Draft wording *(goes when the items on that page are approved)* |
| W46 | The remix form's credit band | Remixed from {source title} v{n} · {source byline} / Shown on yours for good. It credits {source byline}. |
| W48 | The gate, signed in, not invited | Making styles and character sheets is open to invited readers only, for now. Anyone signed in can browse them and use them in their pictures. |
| W49 | The consent gate | Before your first style or sheet: how your words are published. / [button] Read and agree |
| W50 | Fields and notes | Name (optional) / Sheet text · added when {character} is in a prompt / Shaded words are yours; the rest is unchanged from v{n}. / Your text is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make the pictures. It becomes public only if you publish. |
| W51 | The style choice | Style for the views / Each view is made in the style you choose: its text goes into the prompt before your sheet text. Your sheet shows which style its views used. / No styles are published yet. Publish a style first. / Choose a style first. / The style changed since these views were made. Make them again. |
| W52 | The views | Views · front, side, back / + Generate · Make again · Making it… / Published views can be used by other readers as reference pictures for their images. / The text changed since these were made. Make them again with this text. / Each one uses a generation · {n} left today / Each picture’s prompt is its line above, then your text, then “No text, no lettering, no signs with words.” / {model} · open weights, {licence} · runs on {host} / Side and back are made from the front view: {edit model} · open weights, {licence} · runs on {host} / Make the front view first. |
| W53 | The three view lines (they're also part of every prompt) | front: Character reference picture: one person, full body, standing, seen from the front, plain light grey background. / side: The same person as in the reference picture, full body, standing, seen from the side, plain light grey background. Keep the face, hair and clothes the same. / back: The same person as in the reference picture, full body, standing, seen from behind, plain light grey background. Keep the hair and clothes the same. |
| W54 | The rules box | The rules / Don’t base a character on a real person. Don’t contradict what the book says. Describe how they look early in the book; nothing that happens later. No real people. No sexual content. Nothing violent or hateful. No characters or logos from other works. Don’t ask for words in the picture. |
| W55 | Generate refused | Line 1 (below 0.7): replaced by item 10 (a) if you OK it. Line 2 stays open: Image making can’t check your account right now (Neynar, which scores Farcaster accounts, can’t be reached). Try again later. Reading, listening, saving cards and everything else still work. |
| W56 | The form's other messages | Published. See it / Could not make the picture · No connection. Try again. · Could not record your agreement · Could not publish · Sign in with Farcaster to make a picture · Making styles and sheets isn’t set up on this deployment yet. |
| W57 | Under the consent text | Your words will be shown as @{username}. *(or "… with your address, {address}.", or "… with your name (Farcaster name or wallet address).")* |
| W58 | Consent buttons | Not now · I agree / Wording {version} |
| W59 | Preview and publish | Preview / Preview: this is how it will appear, to anyone / Sheet by @{username} / Front, side, back · Views made in the style {style} · Sheet text · added when {character} is in a prompt / Publish · Edit / errors: Sign in with Farcaster to publish · Could not check your agreement · Could not record your agreement · Could not publish |
| W60 | Share | Share this version / Farcaster · Bluesky · Lens *(spoken: "Post on {network}")* |
| W61 | The share text | {character}: {title}, made on Snowmoon Party |
| W62 | Under the share buttons | If you’re remixing someone’s post, quote or reply to it on the same network. Always include your version’s link. |
| W78 | Server refusal | Only its maker can add a version. Remix it to make your own. |
| W79 | Server refusal | A style with this name already exists. Remix it, or choose another name. |

**Saying "ok" unlocks:** with W44–W62 approved, the "Draft wording" line (W45) can go from the sheet page and the
remix form.

**Notes:**

- **W53:** changing a view line changes every new view's prompt.
- **W57 and W59:** with Lens and Bluesky sign-in, "@{username}" and "(Farcaster name or wallet address)" must widen to
  Lens usernames and Bluesky handles. That's new wording for the sign-in release.
- **W59's "Sign in with Farcaster to publish"** has the same issue.

---

## Overlaps: where two drafts touch the same sentence

The combined texts below are mechanical merges of the drafts' own words, unless they're marked "new words". They are
DRAFT and need your reread like any other line. Each needs a fresh key at merge.

### A. Privacy §3: items 1, 3 and 6 (plus 1.2 later)

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, and a payment you have sent but not yet seen credited. If you choose a closed model when you remix a character's sheet, it also stores that you confirmed you are 18 or older, and which makers' notices you asked not to be shown again; we don't receive either. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

Item 1 alone ships first. Items 3 and 6 then each add their own phrase.

### B. Privacy §7, the Neynar item: item 2 (and 3, which carries it) against main's wallet-fid-link words

> Neynar receives your Farcaster ID when you make or publish an image or a character sheet and your account has no current check, to look up its account score, which decides whether you can make images. We don't keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. During the remix challenge, that check also decides, once, when you publish a remix of a challenge character, whether it can count as an entry. Neynar is never asked about you when someone views a page. When someone adds a Farcaster post to a version's page, Neynar receives that post's address or id, to read it. When you sign in with a wallet, Neynar also receives the wallet's address, to find the Farcaster account whose custody address it is or that has verified it; if exactly one account has it, your wallet is linked to that account (section 4). We keep the answer for a day. A linked wallet is looked up again at most once a day, and its link ends if that account no longer has it; a wallet you unlinked isn't looked up again. When you play Minpentai inside a Farcaster cast, your Farcaster app signs each tap, and we ask Neynar's Farcaster hub which signing keys your Farcaster ID has, to check the signature: Neynar receives your Farcaster ID, and we keep its answer in memory for five minutes.

This is check-decisions' first two sentences, then main's (wallet-fid-link) rest. The branches' `legal.ts` would
otherwise put "the Farcaster account that has verified it; if exactly one has … no longer verifies it" back.

### C. Privacy §6: items 3, 9 and 7

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish and submit is shown as an entry, on its page and on the challenge page. If you publish a sheet whose prompt includes words it suggested to you in 'Ask for help', its recipe says it includes words from AI suggestions.

**New words to consider:** "it suggested to you" follows the challenge sentence, so "it" no longer has a nearby
referent. **Recommend:** "… includes words that 'Ask for help' suggested to you, its recipe says …". That's a small
change to your sentence, so it's your call.

### D. Privacy §4, the remix challenge's entry item: items 9 and 4

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and each version you submit as an entry (up to three), with its character and when you submitted it. Submitting needs the link to your post about it, which is kept and listed on the version's page like any post you add (below). If you withdraw a submission, it is deleted; the post stays listed until you remove it. Whether a version is an entry is shown on its page and on the challenge page, with how many people have submitted for each character.

### E. Terms §6e: items 9, 4 and 7

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry only once its maker submits it on the Service, with a link to a post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. Each person can submit up to three entries, for one character or several, and can withdraw one until entries close. A character needs entries from at least three different people to get a final version; several entries by one person count once. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID (or, for a Bluesky account, its DID), when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so. 'Ask for help' is optional; entries are judged the same either way.

**Later, not tonight:** linked-accounts §10 (signin-reread-list) widens the record phrase to "the public id of the
account its maker published it with (a Farcaster ID, a Lens address or a Bluesky DID)". It replaces bluesky-check's
narrower phrase, and the "who may remix" phrase becomes "an account that passes the site's check, or that is linked
to one that does". Those lines wait for linking to be built.

### F. Terms §8: item 5 (done), plus 5.1 and 6h

> The narration, many pictures (every frame made in Remix among them) and the assistant's answers are produced by AI models and are labelled as such. They can be wrong. The assistant's commentary is not the book and is not advice of any kind. Some of the project's own pictures, among them some of the remix challenge's bases, styles and references, are made with closed models by OpenAI and Google, named with their maker on each picture's recipe. Their makers' terms let us publish them and bind us, not you: we offer these pictures under the licence in section 3, as far as anyone holds rights in them, since a picture made wholly by a model may have no copyright at all. Some of these pictures were made from a reference the owner made outside the Service with Midjourney, a closed model by Midjourney; its recipe says so and labels it "Brought in". The owner owns that picture under Midjourney's terms and offers it, and what is made from it, under the licence in section 3, as far as anyone holds rights in them. When you remix a character's sheet you may choose a closed model for its views, named with its maker on the form and in each view's record; its maker's terms let us publish those pictures, and bind us, not you: they are offered under the licence in section 3, as far as anyone holds rights in them, and a closed model's recipe can't be re-run exactly.

### G. Privacy §7, the OpenAI and Google items: items 5 and 6

These are two separate items, side by side after fal.ai (bases first, then remixers'). They describe OpenAI's
retention differently (choice 6.4).

### H. About, "Where it runs": items 5, 5.2 and 6i

> Vercel hosts the site and sees your IP address and browser details, as any web host does. Cloudflare stores and serves the pictures and audio. Supabase holds the database. Some of the project's own pictures (the remix challenge's bases, styles and references) are made with closed models by OpenAI and Google, through Vercel AI Gateway: they receive the prompt and the reference pictures, nothing about you. One reference picture was made by the owner outside the site with Midjourney and brought in; the site sends nothing to Midjourney. If you choose a closed model when you remix a character's sheet, its maker (OpenAI or Google) receives the prompt and the front view through Vercel AI Gateway, and nothing about you; OpenAI may keep them for up to 30 days, Google is set to keep no copy, and neither trains on them. A report or share link opens GitHub, Farcaster, X, Bluesky or Lens, where what you post is public. …

The rest is unchanged from main. About's Neynar paragraph (item 2c) is a separate paragraph, with no overlap.

### I. Privacy §4, the check items: items 2, 3.4 and 4.2

There's one item per network, in this order after the daily-limits item: Farcaster (2b), Lens (3.4) and Bluesky
(4.2). No sentence is shared, but the three are worded alike. Read them together.

### J. Terms §4: item 3 only

Only item 3 changes Terms §4 tonight. Later, linked-accounts §10 replaces its linking sentences.

### K. The consent screen: items 6 and 3.5

One re-ask (v5) could carry both the closed-model sentence and a Lens sentence.

---

## Also waiting, not in tonight's list (for completeness; not quoted here)

These branches have legal or wording drafts that aren't on main. Say if you want any of them in the next pack.

- `challenge-landing` @ 2055956 (WIP): the short /challenge page's words (`src/lib/challenge/landing-wording.ts`,
  e.g. "Pick a character, tap one of its bases, then Remix to make it your own. Entries open … and close …."). It also
  removes the bounties from `remix-challenge-draft.md` and `wording.ts`.
- `deep-funding`: `docs/legal/challenge-record-draft.md` and `deep-funding-draft.md` (the IPFS record export; a §7
  draft for the storage service).
- `agent-tools-grouped` / `agent-pictures`: agents part 1 and part 2, and routing C.
- `social-read`, `dashboard-rename` and `next-version` (assistant agent): older drafts from 2026-10-30 and 10-31.
- `signin-reread-list`: linked-accounts §10, the lines for when linking is built (Overlap E).

---

## Principles

The principles this pack touches, from the drafts as read:

- **P1 (public recipes; people know what becomes public):** items 5, 6, 7 and 9 keep recipes naming models, makers
  and AI-suggested words. **Pass.**
- **P2 (the book's words only word for word):** item 7 (P2k and P2l) and item 12. **Pass as drafted.**
- **P4 (a person's own act):** Submit (9) needs the maker's press and a post. Linking needs both sign-ins. **Pass.**
- **P5 (moderators only hide):** a moderator's hide withdraws a check pass (2, 3, 4). That's a consequence, not a new
  power. **Pass.**
- **P6 (privacy):**
  - Items 2, 3 and 4 keep decisions, not scores. **Pass.**
  - **Concern 1:** six branches would put back the pre-wallet-fid-link words at merge (stale points 1 and 2). Each
    must merge main first.
  - **Concern 2:** the Lens gap on the consent screen (3.5).
  - **Concern 3:** OpenAI's retention is described two ways (6.4).
  - P6d is the accepted open item.
- **P7 (payment never buys an entry):** Submit's refusal never offers prepay (9.5, 10). The Fund line (8) says the
  money buys nothing. **Pass.**
- **P8 (labels: book, invented, draft):** every agent-drafted line here is marked DRAFT. **Pass.**
- **Draft P9 (spoilers):** **Tension.** Ask for help (item 7) fails P9d as built. Raised in 7.4 and 12.1 for your
  decision before either is read.
- **"Legal texts describe today":** every item is tied to the release that builds it. Item 1 fixes a live mismatch.
  Item 11's dates, and item 3's Terms §4 without item 4, would describe something that isn't true. Both are noted as
  dependencies.
