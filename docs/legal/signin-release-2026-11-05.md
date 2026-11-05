# Sign-in release, legal and consent lines (DRAFT)

**2026-11-05: the owner's reread is done** ("reviewed by the coordinator, approved by the owner"): L12, L16, C1 and
C2 approved as drafted, and A1 and A2 used, word for word. Recorded: Privacy `1tllgm9` (bluesky-check), Terms `erie8c`,
consent own-words-v5 noted as approved in `config/consent.json`. Switch commit: Lens and Bluesky sign-in on, the
Bluesky check on, `LEGAL.effective` 2026-11-05 (it must be the merge day).

**DRAFT**, written by a coding agent (Claude, a closed model made by Anthropic), 2026-11-05, for the coordinator first
and then the owner. Branch `signin-lens-bluesky`; the release itself is `bluesky-check`, which carries
`signin-lens-bluesky` and `origin/main` (943fc604, with check-decisions #115 and privacy-furthest-chapter #116).
Nothing here is merged, applied or published.

**What the owner asked (2026-11-05):** "Split the sign-in release from model choice: ship signin-lens-bluesky (with
the Lens App address set and verified) and bluesky-check as soon as they're ready, with a consent version covering only
what's live then; remix-model-choice follows after closed-model-bases."

**What this release turns on:** Lens sign-in (the site's own Lens App `0x3CD3dF83e3F74e855d7c4104a8ed9EBa23FaaE47`,
verified), Bluesky sign-in, linking them to a Farcaster (or Lens) account, the Lens score check (1,000) and the
Bluesky check (at least 30 days old, at least 5 posts in the last 30 days, rule `age30d+5posts30d`). Not in it: model
choice and closed models (remix-model-choice), closed-model bases, person-balance, Submit and its DID match
(remix-submit / contest).

## In one look

- **16 Terms and Privacy lines change** (L1–L16 below), **plus consent paragraphs 5 and 6** (C1, C2).
- **Approved word for word already:** L1–L11, L13–L15 (14 lines). They are in `src/lib/legal.ts` exactly as approved;
  Privacy §3 (L4) joins two approved texts without a new word.
- **Reread 2026-11-05 and approved as drafted:** L12 (Privacy §4, the Bluesky check item, 4.2), L16 (Privacy §7, the
  Bluesky check item, 4.1), C1 and C2 (consent own-words-v5), and A1 and A2 (About).
- **Words keys:** Terms `erie8c`, Privacy `1tllgm9` (with L12 and L16), both recorded as reread.
- **Consent for this release:** `own-words-v5`, Lens and Bluesky only (below). Its closed-model sentence moved out.
- **Migrations:** SQL pack items 2 and 5 (branch `sql-pack`, `docs/legal/sql-pack-2026-11-04.md`, blocks 2A–2D and
  5A–5D), apply 2 then 5. test:sql-pack: 187 passed, 0 failed, with 0034 as applied (sql-pack 21fe5a18).

## The consent version for this release: own-words-v5

Title "Your words will be public" and line "Public, permanent, GPL-3.0, shown with your name. You can hide it." are
v4's. Paragraphs 1–4 are v4's word for word. Paragraph 5 names the Lens username and Bluesky handle; paragraph 6 adds
one sentence on what Lens and Bluesky receive at the check. It still names Vercel AI Gateway and fal.ai, as v4 does.
Everyone who agreed to v4 is asked again before their next Generate or publish (a new hash). It is true only in a
release that has Lens and Bluesky sign-in **and** the Bluesky check, so `signin-lens-bluesky` must not ship alone (its
paragraph 6 names the Bluesky check): merge `bluesky-check`, which carries it, as one PR.

## Removed: model choice and closed models

- **Consent v5, paragraph 6:** the sentence "If you choose a closed model for a character sheet, your prompt, and the
  front view the model made, go through Vercel AI Gateway to its maker instead of fal.ai: OpenAI, which may keep them
  for up to 30 days to check for abuse, and longer if needed to deal with abuse or required by law, or Google, which
  keeps no copy, except in memory for up to 24 hours, and may keep logs to check for abuse, for up to 90 days." is
  **removed** from v5 (`signin-lens-bluesky` 990b2783).
  **Moved to:** `remix-model-choice`, whose release will add a new consent version, **own-words-v6** = v5 plus that
  sentence, word for word as approved there (its draft is `docs/legal/remix-model-choice-draft.md`; its
  `config/consent.json` still has v4 as current, so nothing there needs undoing; it must call its version v6, not v5).
- **Terms, Privacy, About:** no closed-model line was on these two branches (Terms §8, About and Privacy §7's provider
  lines are on `closed-model-bases` and `remix-model-choice`), so nothing else is removed.

## Terms and Privacy: every line this release changes

Before is word for word from `origin/main` at 943fc604 (fetched 2026-11-05), after is `bluesky-check` now. Approved
lines are not reopened (owner, 2026-11-04 14:15).

### L1. Terms §4 ¶1 — **Approved**

the owner's own words for the Bluesky check, reread pack 3.3 (no numbers in Terms); the rest item 12 as drafted.

**Before** (main at 943fc604):

> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does.

**After:**

> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account, with a Lens account whose Lens score is at least the one the Service shows, and with a Bluesky account that passes the site's check (Privacy, section 7); a Bluesky account that doesn't pass gets them only while it is linked to a Farcaster or Lens account. To prepay for generations, sign in with a wallet (section 6a).

### L2. Terms §5 ¶1 — **Approved**

item 8, as drafted.

**Before** (main at 943fc604):

> If you publish something through the Service, or make a frame in Remix (which is saved, and can be seen by anyone with its link, as soon as it is made), it remains yours, and you license it to everyone under GPL version 3. You confirm it is your own work, or that you have the right to license it this way. Your name is shown with it: your Farcaster name, or, for a wallet account, its address shortened. Work made with a wallet that is linked to your Farcaster account is shown with your Farcaster name. Where the Service says so before you publish, the prompts and any planning thread that led to the piece are published with it. Published work is public and others may copy it under the licence. We can hide it on request (see section 7), but we cannot recall copies others have made.

**After:**

> If you publish something through the Service, or make a frame in Remix (which is saved, and can be seen by anyone with its link, as soon as it is made), it remains yours, and you license it to everyone under GPL version 3. You confirm it is your own work, or that you have the right to license it this way. Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle. Work made with a wallet that is linked to your Farcaster account is shown with your Farcaster name. Where the Service says so before you publish, the prompts and any planning thread that led to the piece are published with it. Published work is public and others may copy it under the licence. We can hide it on request (see section 7), but we cannot recall copies others have made.

### L3. Terms §6e ¶1 — **Approved**

reread pack 4.4 and 4.5, as drafted.

**Before** (main at 943fc604):

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account that passes the site's check may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

**After:**

> The challenge page sets out its dates, the characters, and what happens after. During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix its characters' sheets; making other sheets and styles stays by invitation. Entering is free and needs no purchase, and minting isn't needed for anything. A version counts as an entry if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. One entry per person per character: your latest version counts unless you mark another. Admins can make versions but aren't eligible for rewards. When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID (or, for a Bluesky account, its DID), when it was published and what it was built on; hiding a version later removes it from the Service, but not its fingerprint from that record. Anything that follows the challenge, including any mint, is a plan, not a promise, and is decided as the challenge page says. We may change or end the challenge, and the page will say so.

### L4. Privacy §3 ¶1 — **Approved**

the sign-in phrases (items 5–11, as drafted) beside main's furthest-chapter clause (reread pack item 1, live since #116); joined word for word, nothing new.

**Before** (main at 943fc604):

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen credited. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

**After:**

> Your browser stores a few things so the site works: whether you have seen the introduction, your light or dark setting, where you stopped listening, the furthest chapter you have opened, your questions to the assistant and its answers, drafts of images you make until you publish them, a few other settings of yours, and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, and a payment you have sent but not yet seen credited. These stay on your device, except that the assistant sends the furthest chapter, as a number (or another chapter you choose for a conversation), with each question and its search of the book, so that answers stay within it; it isn't kept. Clearing your browser's site data removes them. Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but privately: only you can see them (section 4).

### L5. Privacy §4 ¶1 — **Approved**

items 5–11, as drafted.

**Before** (main at 943fc604):

> Your account (a Farcaster account or a wallet address; other sign-in methods will be listed here when they come), and what you do with it here:

**After:**

> Your account (a Farcaster account, a wallet address, a Lens account or a Bluesky account), and what you do with it here:

### L6. Privacy §4 item 4 — **Approved**

items 5–11, as drafted (what is kept for a Lens or Bluesky sign-in).

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> If you sign in with Lens: your Lens account's address and its Lens username, as Lens gave them at your last sign-in, and when you first and last signed in that way. If you sign in with Bluesky: your Bluesky account's identifier (its DID) and your handle, if your handle points back to that account, and when you first and last signed in that way. We keep these while you use the Service (section 9). We keep no token from Lens or from your Bluesky server: we use what they give us once, to confirm who you are, and drop it. We don't keep the wallet you signed with for Lens.

### L7. Privacy §4 item 5 — **Approved**

item 7 with the owner's 30-day sentence (3a; reread pack 3.1–3.2).

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page. An account you unlink can be linked to a different account only after 30 days.

### L8. Privacy §4 item 6 — **Approved**

items 5–11, as drafted (the byline).

**Before** (main at 943fc604, Privacy §4 item 4):

> Images you publish, with their prompt, your name (Farcaster name or wallet address) and the record of how they were made. These are public.

**After:**

> Images you publish, with their prompt, your name (Farcaster name, wallet address, Lens username or Bluesky handle) and the record of how they were made. These are public.

### L9. Privacy §4 item 8 — **Approved**

reread pack 4.3, as drafted.

**Before** (main at 943fc604, Privacy §4 item 6):

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check), decided once, when you publish it, and kept with the time it was decided; and which of your versions you mark as your entry for each character, and when. Whether a version is an entry is shown on its page and on the challenge page, with how many people have entered each character.

**After:**

> If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why (you were invited, you are an admin, or whether your account passed the site's check: Neynar's score for a Farcaster account, the Bluesky check for a Bluesky account), decided once, when you publish it, and kept with the time it was decided; and which of your versions you mark as your entry for each character, and when. Whether a version is an entry is shown on its page and on the challenge page, with how many people have entered each character.

### L10. Privacy §4 item 9 — **Approved**

reread pack 4.4, as drafted.

**Before** (main at 943fc604, Privacy §4 item 7):

> When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID, when it was published and what it was built on. Hiding a version later removes it from this site, but not its fingerprint from that record.

**After:**

> When entries close, a record of every entry is published to IPFS and referenced on Ethereum, where it can't be removed: a fingerprint of its pictures and recipe (not the pictures or words themselves), its maker's Farcaster ID (or, for a Bluesky account, its DID), when it was published and what it was built on. Hiding a version later removes it from this site, but not its fingerprint from that record.

### L11. Privacy §4 item 16 — **Approved**

reread pack 3.4 (check-decisions' Lens item with the Farcaster item's early-removal sentence).

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> Whether your Lens account passed the check for making images (its Lens score against the score needed), when that was decided, and the score needed then; never the score itself. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.

### L12. Privacy §4 item 17 — **Approved 2026-11-05**

reread pack 4.2, REDRAFTED for the no-numbers rule (owner's OK still owed).

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> Whether your Bluesky account passed the check for making images (section 7), and when that was decided; never its age or its post count. A pass is kept for 90 days and a fail for a day. A pass is removed sooner if your account is reported or one of your pictures is hidden by a moderator.

### L13. Privacy §6 ¶1 — **Approved**

items 5–11, as drafted (the byline).

**Before** (main at 943fc604):

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page.

**After:**

> Anything you publish, and every frame you make in Remix, is public, shown with your name (your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards), the date, and the record of how it was made. If you link a wallet to your Farcaster account, what you made with the wallet, before and after linking, is shown under your Farcaster name, so anyone can see that the two are yours; if you unlink it, that work is shown with the wallet's address again. See the Terms, sections 5 and 7. If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it. If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it. During the remix challenge, a version of one of its characters that you publish may be shown as your entry, on its page and on the challenge page.

### L14. Privacy §7 item 7 — **Approved**

item 9 with its final words (variant B, decision not score; reread pack 3.1–3.2).

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> If you sign in with Lens: our server asks Lens's API (api.lens.xyz) for a sign-in message for your Lens account and the wallet you sign with, and sends Lens your signature, which Lens checks. Lens receives those two addresses and learns that you signed in here. To show you which Lens accounts your wallet can sign in as, Lens also receives your wallet's address. When you make an image or a frame without a linked Farcaster account, and we have no current decision for your Lens account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides whether you get free images and frames. We don't keep the score: we keep only whether your account passed and when, for up to 90 days (a day if it didn't pass), and we check again sooner if your account is reported, one of your pictures is hidden by a moderator, or the score needed changes. Lens is never asked about you when someone views a page or when you open the image or frame maker.

### L15. Privacy §7 item 8 — **Approved**

items 5–11, as drafted.

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> If you sign in with Bluesky: our server looks up your handle (in its domain's DNS, or at the handle's own web address), your account's public record (at plc.directory, run by Bluesky, or at your own domain), and your Bluesky server (your PDS) and the sign-in server it names, which may be Bluesky's or another provider's. You approve the sign-in on that sign-in server, under its own terms, and it learns that you signed in here. We ask it only to confirm who you are, not to read or post anything for you.

### L16. Privacy §7 item 10 — **Approved 2026-11-05**

reread pack 4.1, REDRAFTED for the rolling rule and 'Farcaster or Lens' (owner's OK still owed); keeps the numbers, as the owner allowed for §7.

**Before** (main at 943fc604):

> (none: a new item)

**After:**

> If you sign in with Bluesky and your Bluesky account isn't linked to a Farcaster or Lens account: when you make an image or a frame, or publish a remix during the remix challenge, and your account has no current check, our server sends your Bluesky account's identifier (its DID, not your handle) to Bluesky's public AppView (public.api.bsky.app), to read when your account was made and its latest posts. This check decides whether you can make images and frames for free and whether a remix can count as an entry. We keep only whether your account passed (at least 30 days old, with at least 5 posts in the last 30 days, when we check) and when, for up to 90 days (a day if it didn't pass); never the dates or posts we read. We check again sooner if your account is reported or one of your pictures is hidden by a moderator. Bluesky is never asked about you when someone views a page.

### C1. Consent own-words-v5, paragraph 5 — **Approved 2026-11-05**

New version for everyone (reread pack 3.5/6.1). Title, line and paragraphs 1–4 are v4's, word for word.

**Before** (v4, live):

> It is shown with your name: your Farcaster name, or, for a wallet account, its address shortened.

**After** (v5):

> It is shown with your name: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle.

### C2. Consent own-words-v5, paragraph 6 — **Approved 2026-11-05**

**Before** (v4, live):

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

**After** (v5; Vercel AI Gateway and fal.ai still named, as in v4):

> To make an image, your prompt is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make it, and your Farcaster ID to Neynar to check your account's score. With a Lens account, its address goes to Lens instead, to check its Lens score; with a Bluesky account, its identifier goes to Bluesky, to check its age and recent posts. In Remix, every frame you make is saved and public at its link as soon as it is made, with your words. Elsewhere, drafts you don’t publish stay on your device.

## About (approved 2026-11-05 and used: `src/app/about/page.tsx`)

Approved and in code (signin-lens-bluesky 550460c9). Two About sentences become incomplete once Lens and Bluesky sign-in are
on; they are not legal texts, but the owner may want them in the same release. Shortest true sentence, checked against
the code (cards and likes take only a Farcaster sign-in, `getFid`; the assistant takes a Farcaster account or one
linked to it, `getPerson` with `fid > 0`; images take any sign-in that passes its check).

### A1. About, "Signing in"

**Before:**

> Reading needs no account. Saving cards, liking, making images and asking the assistant need a Farcaster sign-in.

**After:**

> Reading needs no account. Saving cards and liking need a Farcaster sign-in, and the assistant a Farcaster account or one linked to it. Making images needs a sign-in.

### A2. About, the image byline

**Before:**

> It is shown with your name (Farcaster name or wallet address).

**After** (Privacy §4's approved byline words):

> It is shown with your name (Farcaster name, wallet address, Lens username or Bluesky handle).

## Not legal text, but words people see (DRAFT, owner's OK)

- The sign-in choices (`src/lib/sign-in-text.ts`): "Sign in with Lens: Your Lens account, signed for by the wallet that
  owns or manages it." and "Sign in with Bluesky: Your Bluesky account, approved on your Bluesky server."
- The Bluesky check's refusals (`BLUESKY_CHECK_WORDING`) and the link panel (`src/lib/social/link-wording.ts`).
- Challenge page words (`src/lib/challenge/wording.ts` whoCanEnter, rules; `src/lib/images/wording.ts`
  signInChallenge) still say "Farcaster account". /challenge is admin-only, so they aren't public; they change with
  the contest branch, before the challenge opens.

## The migrations

SQL pack items 2 and 5, as copy blocks: branch `sql-pack` (21fe5a18), `docs/legal/sql-pack-2026-11-04.md`,
sections "2. NEXT_signin_lens_bluesky" (2A–2D) and "5. NEXT_social_bluesky_check" (5A–5D). Paste only those, in that
order, as `postgres` in the Supabase SQL Editor. Item 1 is applied (0034); 3 and 4 wait for their own releases.

- **2B is the branch's migration word for word;** 2D now uses made-up accounts (a made-up Lens address
  `0x…c0de02`, `did:plc:readbacksigninaaaaaa2345`, FID 2147483646), and so does the branch's own file since 990b2783.
- **5's dependencies (tested):** 5B's SQL needs only 0033; its read-backs need 0034 (5C errors without it) and 2 (5D
  needs `social_accounts`). So 2 first, then 5.
- **Tested on PGlite, 2026-11-05:** `npm run test:sql-pack` 187 passed, 0 failed, on 0001–0034 (with contest's item 6 after 3 and 4). 2: A leaves nothing,
  B applies, C 12/12, D passes, B twice stops and changes nothing; 5: A leaves nothing, B applies, C 11/11, D passes,
  B twice safe. Planted faults caught: 5 for item 2, 6 for item 5 (including an old rule label). The release alone
  (0034, 2, 5, with no 3 or 4) has 1C, 2C, 5C all true and 1D, 2D, 5D passing. No C or D block contains a real
  account (checked). 5D refuses a made-up account kind (`'x'`) rather than `'lens'`, so it still holds once contest's
  item 6 lets Lens decisions in.
- Likely numbers at merge: 2 → 0035, 5 → 0036 (checked again against `origin/main` and production then).

## Fixes after the owner's localhost sign-ins, 2026-11-05

DRAFT, by a coding agent (Claude, a closed model made by Anthropic). Asked by the owner before the release merges,
after signing in on localhost with Bluesky (nate0.bsky.social) and Lens (lens/nate0). Every new word below is DRAFT
wording, except the Privacy §3 line (approved).

- **You page** (`src/components/you-page.tsx`): the label beside the name is the account's own network (Lens,
  Bluesky, Farcaster, Wallet); rows without a value aren't shown (a Lens or Bluesky account has no FID or address
  row); the public-page row for a Lens or Bluesky account: "Public pages come with a Farcaster account. Link this
  {Lens|Bluesky} account to yours, and what you make while it is linked shows on your Farcaster page."; the Wallet
  section for one: "A {Lens|Bluesky} account has no balance here. To prepay for images and Remix frames, sign in with
  a wallet; while it is signed in, you make them as the wallet’s account." with the wallet sign-in button; signed in
  with a Lens or Bluesky account linked to Farcaster: "Signed in with your linked {Lens|Bluesky} account." (it said
  "Signed in with your linked wallet."); one button style (`ic-secondary`; the link panel's "forget" button was
  `ed-small`, unstyled on /you).
- **Sign-in buttons** (`src/components/social-sign-in.tsx`): the Lens account list has the heading "Choose your Lens
  account" and the same button as the one above it; the Bluesky "Continue" too.
- **The rail and the menu** don't repeat the sign-in buttons on /you signed out (the page has them), so a sign-in
  error shows once.
- **The assistant**, signed out or signed in with Lens, Bluesky or a wallet: "Asking questions needs a Farcaster
  account."
- **Bluesky without typing a handle:** "Sign in with Bluesky" starts at Bluesky's entryway, https://bsky.social (PAR
  with no login_hint; Bluesky's page asks which account). The finish is unchanged: the token's DID, its own DID
  document, its PDS, and that this PDS names the issuer (bsky.social) as its authorization server; an account whose PDS
  names another server is refused ('wrong-server'); the handle kept only if it resolves back. Checked against the live,
  public metadata (read-only, 2026-11-05): bsky.social's issuer and endpoints pass `asMetadata`, and a Bluesky-hosted
  PDS (puffball.us-east.host.bsky.network) names `https://bsky.social`. Under the button, "Use another server or
  handle" opens today's handle box, filled in with the handle last signed in with on this device
  (`snowmoon.bluesky.last-handle`, localStorage, every access in try/catch; saved only when the server's handle check
  passed).
- **Privacy §7, the Bluesky sign-in item (L15):** unchanged; still true word for word. From bsky.social, our server
  still looks up the handle, the account's public record and its PDS and the sign-in server it names, and the person
  approves on that sign-in server (bsky.social is the one the PDS names, or the sign-in is refused). Only the order
  changes (bsky.social is asked first), and the item doesn't state an order.
- **Privacy §3 (approved line):** the device-storage list adds "the Bluesky handle you last signed in with, to fill it
  in next time" (owner's approval, coordinator-reviewed, 2026-11-05), fitted between "kept in that tab for at most ten
  minutes," and "and a payment you have sent", no other word changed. Recorded on signin-lens-bluesky as
  `LEGAL.ownerReread.privacy` 19gyyjh (was m0e1f7); on bluesky-check after the merge, see its record (was 1tllgm9).
  `LEGAL.effective` unchanged.
- **One account per network in a linked group (A6)** (`src/lib/social/accounts.ts` `linkSocial`): a link is refused
  ('same-network', 409) when the group it joins (the FID or Lens account, every account actively linked to it, and
  those linked through a Lens account linked to it; a Lens target linked to an FID is that FID's group) already has an
  account of the joining kind; a Lens account joining an FID brings its own linked Bluesky into the check. The check
  and the insert are one transaction under `pg_advisory_xact_lock` on the FID and the Lens accounts involved (FID
  first, then Lens by number, so no deadlock). Refusal: "This account already has a {Lens|Bluesky} account linked.
  Unlink it first to link another." (DRAFT), shown where the other link refusals show.
- **Tests:** test:signin-lens-bluesky adds B5 (bsky.social start, the handle box path, an account on a Bluesky PDS host
  checked through its DID document, another server refused) and K4 (two Bluesky to one FID, a Bluesky via Lens plus one
  directly, both ways, a Lens with its Bluesky, two Lens, two links racing, unlink then another). check:ui adds the
  signed-in You page for Lens, Bluesky, Farcaster and a wallet, and the rail and menu on /you signed out.

## What's left before it can ship

Who does each: **O** the owner, **C** the coordinator, **A** an agent.

- [x] **The Lens App registered** (O, 2026-11-05 06:56 UTC) and **verified** (C, and A with `npm run verify:lens-app`;
  `docs/lens-app-registration.md`, "Verified").
- [x] **Config: `SOCIAL_SIGN_IN.lens.app`** = `0x3CD3dF83e3F74e855d7c4104a8ed9EBa23FaaE47` (A, 57b8e5db). Live only
  when Lens is switched on.
- [x] **Main merged in** (A): both branches carry `origin/main` 943fc604.
- [x] **Bluesky rule** is the rolling one (`minAgeDays` 30, `minRecentPosts` 5 in `recentDays` 30, label
  `age30d+5posts30d`), not "made before 6 Nov" (A, checked).
- [x] **person-balance stays out** (A, checked: neither branch contains it; nor remix-submit, remix-model-choice,
  closed-model-bases).
- [x] **Coordinator review** of L12, L16, C1, C2, A1, A2 (C, 2026-11-05).
- [x] **The owner's reread** of the same (O, 2026-11-05), recorded: `LEGAL.ownerReread.privacy` 1tllgm9, 2026-11-05
  (bluesky-check 435c1bf4); v5 noted approved (550460c9).
- [x] **Switches** (A, 2026-11-05): `SIGN_IN_METHODS` lens and bluesky `on: true` (550460c9),
  `SOCIAL_SIGN_IN.bluesky.check.on: true` (435c1bf4), `LEGAL.effective` = 2026-11-05, **which must be the merge day**
  (the owner plans to merge tonight; if not, change it first).
- [ ] **The two migrations applied** (O, Supabase SQL Editor, laptop): SQL pack 2A–2D, then 5A–5D. Needed before the
  localhost sign-ins too, because localhost uses the production database (as `studio_writer`).
- [ ] **One real Lens and one real Bluesky sign-in by the owner on localhost** (O, laptop; steps below).
- [x] **The checks on a local build, under the heavy lock** (A, 2026-11-04 23:32–23:50 PT, `bluesky-check` at
  414e493e, http://127.0.0.1:3210): tsc 0 errors on both branches; test:signin-lens-bluesky 21/21,
  test:bluesky-check 64/64, test:check-decisions 44/44, test:images-gate 130, test:wallet 193; check:ui passed (59
  pages); check:miniapp passed; check:principles 60 of 63, the three fails expected: P6d (accepted open item), P6k
  (Privacy awaits the reread of L12 and L16) and P6a (only on a local target: the site's own media.snowmoon.party and
  pictures.snowmoon.party count as third-party when the target is 127.0.0.1).
- [x] **The checks again after the switch commit** (A, 2026-11-05 07:31–08:07 PT, `bluesky-check` at 1f882675, local
  build at http://127.0.0.1:3210): tsc 0 errors (signin-lens-bluesky, bluesky-check, contest);
  test:signin-lens-bluesky 21/21, test:bluesky-check 64/64, test:check-decisions 44/44, test:images-gate 130,
  test:wallet 193, test:sql-pack 187/187; check:principles 61 of 63 (**P6k and P6l pass**; only P6d, the accepted
  open item, and P6a, a local-target artifact, fail); check:miniapp passed; check:ui passed (59 pages) once it was
  taught to expect the four sign-in buttons that SIGN_IN_METHODS now turns on (it had hard-coded two;
  signin-lens-bluesky, "check:ui: the sign-in buttons it expects follow SIGN_IN_METHODS").
- [ ] **check:snap-live runs after deploy, against production.** It doesn't work on a local target: its composer and
  challenge-link checks compare against the public host and a production-signed link (on 127.0.0.1 they 404 or name
  localhost). This release's `next.config.ts` change is only the local-only `NEXT_PUBLIC_SIGN_IN_ALL_FOUR` guard, not
  the snap's headers.
- [ ] **PR from `bluesky-check`** (one PR; it carries signin-lens-bluesky), the owner's OK, merge commit, deploy,
  live checks (check:shipped, check:principles, check:ui, check:miniapp; check:snap-live only if `next.config.ts` or
  middleware changed; this branch changes `next.config.ts`, so run it).
- [ ] **First production Bluesky sign-in** right after deploy (O, phone is fine): production's client id is
  `https://snowmoon.party/oauth/bluesky/client-metadata.json`, which Bluesky can only fetch once it is live (previews
  are behind Vercel Authentication).
- **Not in this release:** the Bluesky DID match (and Lens author match) at Submit. Submit is on contest/remix-submit,
  not on main; it is built on contest (overnight item 4) and ships with Submit, before /challenge goes public.

## The owner's two real sign-ins on localhost (laptop, Terminal, one line at a time)

Before: the two migrations applied (above). Bluesky works only at **http://127.0.0.1**, never "localhost".

1. Open Terminal and type:
   ```
   cd ~/snowmoon-bluesky-check
   ```
2. ```
   git pull
   ```
3. Check that a local sign-in secret exists (it is made on your Mac, not a production key):
   ```
   grep -c '^IMAGES_TICKET_SECRET=' .env.local
   ```
4. Only if that printed `0`:
   ```
   echo "IMAGES_TICKET_SECRET=$(openssl rand -hex 32)" >> .env.local
   ```
5. Take the shared lock (if it says "File exists", another job is running: wait and try again):
   ```
   mkdir ~/.snowmoon-heavy.lock
   ```
6. Start the site, keeping a copy of its output (Lens and Bluesky are on in the config now, so no extra flag):
   ```
   npm run dev -- -H 127.0.0.1 -p 3000 2>&1 | tee /tmp/snowmoon-dev.log
   ```
7. In your browser open **http://127.0.0.1:3000/you** and choose **Sign in with Lens**; sign with the wallet that
   owns your Lens account.
8. In a second Terminal tab (Cmd-T), check the token was for our App:
   ```
   grep "lens sign-in: aud" /tmp/snowmoon-dev.log
   ```
   It must show `aud 0x3cd3df83e3f74e855d7c4104a8ed9eba23faae47` (any capitals) and `our App:
   0x3CD3dF83e3F74e855d7c4104a8ed9EBa23FaaE47`. Anything else: stop and tell me.
9. Sign out, then **Sign in with Bluesky** on the same http://127.0.0.1:3000 page, with your handle; approve on your
   Bluesky server. It should come back signed in, with your handle.
10. Back in the first tab, stop the site: press Ctrl-C.
11. Release the lock:
    ```
    rm -r ~/.snowmoon-heavy.lock
    ```

Your two sign-ins write your own rows (your Lens address and username, your DID and handle) to production's
`social_accounts`, as the live site will. They stay, as they would after a real sign-in.

## The earliest date

**Earliest: Thursday 5 November 2026, about 21:00 Pacific. More likely: Friday 6 November, evening.**

| Step | Who | Needs | Time |
|---|---|---|---|
| Checks on a local build | A | the heavy lock (shared; held by another session tonight) | ~45 min, overnight |
| Review of L12, L16, C1, C2 (A1, A2) | C | this doc | early Thu 5 Nov |
| Reread (4 lines; 2 optional) | O | phone | Thu daytime |
| Record reread, switch commit, checks again | A | lock | ~1 h after the reread |
| Apply 2A–2D, 5A–5D | O | laptop, Supabase SQL Editor | ~15 min, Thu evening |
| Two real sign-ins on localhost | O | laptop, a wallet owning a Lens account, a Bluesky account | ~20 min, Thu evening |
| OK, merge, deploy, live checks, first production Bluesky sign-in | O then A | | ~45 min |

Why: the owner works from a phone by day, and both the SQL Editor paste and the localhost sign-ins need the laptop,
so the last owner steps fall in the evening. If the reread is back by mid-afternoon Thursday, all of it fits Thursday
evening (about 19:00 migrations, 19:20 sign-ins, 19:45 OK, live by about 21:00). The challenge-admin-only merge before
Fri 09:00 is separate and isn't blocked by this. Any change asked in the reread adds a round (more likely Friday).
