# Lens and Bluesky sign-in: Privacy and Terms wording (DRAFT, for the owner's reread)

Branch `signin-lens-bluesky`, 2026-10-31. Drafted by the coding agent (Anthropic's Claude, a closed model). **Not
reread.** Nothing here is in `src/lib/legal.ts`: its words and its reread record are unchanged on this branch.

Lens and Bluesky sign-in are **off** (`SIGN_IN_METHODS` in `src/lib/config.ts`: `lens` and `bluesky` are `on: false`).
While off, every Lens and Bluesky route answers 404 and nothing about a Lens or Bluesky account reaches us. They are
turned on in the same release as these lines, after the owner's "reread" (CLAUDE.md: legal texts describe today).
`check:principles` P6p fails if either is turned on while Privacy §4 and §7 don't describe it.

Two choices change the words; each is marked below:

- **Lens score threshold** (`SOCIAL_SIGN_IN.lens.minScore`, null today). While it is null, Lens accounts get no free
  generations and **the Lens score is never looked up**, so the score sentence in §7 and Terms §4 stays out
  (variant A). Once the owner sets a number, variant B goes in, in the same release.
- **Linking UI.** The link and unlink route is built (`/api/social-link`), but no page offers it yet (see the branch
  report). The "You can unlink it on your You page" sentences are true only once the You page offers it. Either the
  You page panel ships with these lines, or the sentence becomes "Write to us to unlink it" for the first release.

## 1. Privacy §4 (Kept by us when you sign in)

### 1a. The opening line — replace

**Today:**
> Your account (a Farcaster account or a wallet address; other sign-in methods will be listed here when they come), and what you do with it here:

**Proposed:**
> Your account (a Farcaster account, a wallet address, a Lens account or a Bluesky account), and what you do with it here:

### 1b. New item, after the wallet-link item

**Proposed (new):**
> If you sign in with Lens: your Lens account's address and its Lens username, as Lens gave them at your last sign-in, and when you first and last signed in that way. If you sign in with Bluesky: your Bluesky account's identifier (its DID) and your handle, if your handle points back to that account, and when you first and last signed in that way. We keep these while you use the Service (section 9). We keep no token from Lens or from your Bluesky server: we use what they give us once, to confirm who you are, and drop it. We don't keep the wallet you signed with for Lens.

What it describes: `studio.social_accounts` (kind, subject, handle, created_at, last_sign_in_at;
`NEXT_signin_lens_bluesky.sql`). Lens's access, refresh and ID tokens and the Bluesky server's access and refresh
tokens are never stored, logged or returned to the page (`src/lib/social/lens.ts`, `src/lib/social/atproto.ts`).

### 1c. New item, after 1b

**Proposed (new):**
> If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page.

What it describes: `studio.social_links` (account, FID or Lens account, linked_at, unlinked_at, ended_by 'person').
See the linking-UI choice at the top.

### 1d. The images item — one change in the brackets

**Today:**
> Images you publish, with their prompt, your name (Farcaster name or wallet address) and the record of how they were made. These are public.

**Proposed:**
> Images you publish, with their prompt, your name (Farcaster name, wallet address, Lens username or Bluesky handle) and the record of how they were made. These are public.

## 2. Privacy §7 (Outside services and what they receive)

### 2a. New item, after the Farcaster item: Lens

**Proposed, variant A (threshold null; today's code):**
> If you sign in with Lens: our server asks Lens's API (api.lens.xyz) for a sign-in message for your Lens account and the wallet you sign with, and sends Lens your signature, which Lens checks. Lens receives those two addresses and learns that you signed in here. To show you which Lens accounts your wallet can sign in as, Lens also receives your wallet's address.

**Variant B (once the owner sets a Lens score threshold), add:**
> When you open the image or frame maker, or make an image or a frame, without a linked Farcaster account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides whether you get free images and frames. We keep the score in memory for up to an hour.

### 2b. New item, after 2a: Bluesky

**Proposed:**
> If you sign in with Bluesky: our server looks up your handle (in its domain's DNS, or at the handle's own web address), your account's public record (at plc.directory, run by Bluesky, or at your own domain), and your Bluesky server (your PDS) and the sign-in server it names, which may be Bluesky's or another provider's. You approve the sign-in on that sign-in server, under its own terms, and it learns that you signed in here. We ask it only to confirm who you are, not to read or post anything for you.

What it describes: `startBluesky` / `finishBluesky` in `src/lib/social/atproto.ts`: DNS TXT `_atproto.<handle>` or
`https://<handle>/.well-known/atproto-did`; `https://plc.directory/<did>` or `did:web`; the PDS's
`/.well-known/oauth-protected-resource`; the authorization server's metadata, PAR and token endpoints; scope
`atproto` only.

## 3. Privacy §3 (Kept on your device only) — also needed, one phrase

Not in the owner's list, but §3 would stop being true without it.

**Today (the phrase):**
> …and, on the website, a sign-in token that lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen credited.

**Proposed:**
> …and, on the website, a sign-in token that lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, and a payment you have sent but not yet seen credited.

## 4. Privacy §6 (What you publish) — also needed, one phrase

**Today (the phrase):**
> …shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards)…

**Proposed:**
> …shown with your name (your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards)…

## 5. Terms §4 (Who can use it)

**Today:**
> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does.

**Proposed, variant A (threshold null):**
> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account; a Lens or Bluesky account gets them only while it is linked to one. To prepay for generations, sign in with a wallet (section 6a).

**Variant B (threshold set) replaces the second-to-last sentence with:**
> Free daily images and frames come with a Farcaster account, and with a Lens account whose Lens score is at least the one the Service shows; a Bluesky account gets them only while it is linked to a Farcaster or Lens account.

## 6. Terms §5 (What you add) — also needed, one sentence

**Today (the sentence):**
> Your name is shown with it: your Farcaster name, or, for a wallet account, its address shortened.

**Proposed:**
> Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle.

## What else changes when they are turned on

- The two lines under the buttons (`SIGN_IN_CHOICES` in `src/lib/sign-in-text.ts`, DRAFT): "Your Lens account, signed
  for by the wallet that owns or manages it." and "Your Bluesky account, approved on your Bluesky server."
- The box under the Bluesky handle (`src/components/handle-field.tsx`, DRAFT): "Sent to us to find your Bluesky server
  and sign you in. Never published by us."
- The refusals for free generations (`FREE_WORDING` in `src/lib/social/free.ts`, DRAFT) and the sign-in errors
  (`SOCIAL_WORDING` in `src/lib/social/client.ts`, DRAFT).
- About's sign-in services line (`SIGN_IN_SERVICES`) names Farcaster's services only; it is shown at the Farcaster
  sign-in step, so it stays as it is.
