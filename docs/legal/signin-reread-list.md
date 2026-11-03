# Sign-in reread list: Lens and Bluesky (DRAFT)

For the owner, 2026-11-04. Drafted by the coding agent (Anthropic's Claude, a closed model). Branch
`signin-reread-list`, from `signin-lens-bluesky` at 1aca85e. One go: say a letter for each choice (1–4), then
"reread" for 5–12 with any changes. Source: `docs/legal/signin-lens-bluesky-draft.md` and the branch report.

Every "Now" quote was checked word for word against `src/lib/legal.ts` on main at 233f5e0 (2026-11-04): all still
match. `legal.ts` is unchanged on the branch: the words go in only after your reread, in the release that turns
Lens and Bluesky on.

## The four choices

**1. Variant A or B (the Lens score sentences)**
- A: no Lens score; a Lens account gets free images and frames only when linked to a Farcaster account.
- B: a Lens account with a score of at least the threshold gets them on its own. Adds one sentence to Privacy §7
  (item 9) and changes one in Terms §4 (item 12).
- **Recommend B.** It matches your note of 2026-11-04 (in `bluesky-check`'s config): Lens's check is its score,
  in the same release as Lens sign-in. Without it a Lens-only person can't get anything free.

**2. The Lens score threshold** (`SOCIAL_SIGN_IN.lens.minScore`, null now)
- 100: about 1 in 6 of a broad sample. 1000: about 1 in 11. 5000: only long-standing accounts. No new account
  passes any of them (all 200 newest scored 0).
- **Recommend 1000.** The sample is bimodal (most under 700, established ones 9,000+), so 1000 keeps out new and
  spammy accounts and lets in the active middle. Neynar's 0.7 is a similar bar.

**3. Unlinking**
- a) Build the You page panel (link and unlink buttons) and ship it with these lines. The route
  `/api/social-link` is built and tested; the panel is not.
- b) No panel in the first release: leave out item 7's link sentences, so Lens and Bluesky accounts stand alone.
- **Recommend a).** With no panel no one can link at all, so "linked" lines would describe nothing. Since the
  challenge is admin-only for now, nothing pushes Friday, and the panel fits the 12 Nov release.
- 3+ (optional, small code change): add a relink wait. After item 7's last sentence: "An account you unlink can
  be linked to a different account only after 30 days." **Recommend yes.** It stops one Lens or Bluesky account
  being handed between people to share free counts. The linked-accounts proposal needs the same rule, so adding
  it now means the words change once instead of twice.

**4. The Lens App**
- a) Register Snowmoon's own Lens App on Lens Chain (one onchain deploy, small gas, from your wallet).
- b) Keep Lens's own test App (`0x8A5Cc311…97cE`) from the docs.
- **Recommend a).** The test App is meant for testing. Our own App shows people that they are signing in to
  snowmoon.party. It does publish onchain that this site uses Lens. It changes no legal words.

## The lines to reread

**5. Privacy §4, the opening line**

Now:
> Your account (a Farcaster account or a wallet address; other sign-in methods will be listed here when they come), and what you do with it here:

After:
> Your account (a Farcaster account, a wallet address, a Lens account or a Bluesky account), and what you do with it here:

Why: it lists every way to sign in on the day these go on.

**6. Privacy §4, new item (what we keep), after the wallet-link item**

After (new):
> If you sign in with Lens: your Lens account's address and its Lens username, as Lens gave them at your last sign-in, and when you first and last signed in that way. If you sign in with Bluesky: your Bluesky account's identifier (its DID) and your handle, if your handle points back to that account, and when you first and last signed in that way. We keep these while you use the Service (section 9). We keep no token from Lens or from your Bluesky server: we use what they give us once, to confirm who you are, and drop it. We don't keep the wallet you signed with for Lens.

Why: it is exactly `studio.social_accounts`. Lens's and the Bluesky server's tokens are never stored.

**7. Privacy §4, new item (links), after item 6**

After (new; leave it out if 3b):
> If your Lens or Bluesky account is linked to your Farcaster account, or your Bluesky account to your Lens account (you linked them while signed in with both): which is linked to which, and when it was linked or unlinked. While linked, signing in with it is signing in as that account. You can unlink it on your You page.

Why: `studio.social_links`. "On your You page" is true only with 3a. With 3+, add its sentence here.

**8. Privacy §4 and §6, the bylines**

§4, now: "…your name (Farcaster name or wallet address)…"
After: "…your name (Farcaster name, wallet address, Lens username or Bluesky handle)…"

§6, now: "…shown with your name (your Farcaster name, or, for a wallet account, its address shortened; your Farcaster ID on quote cards)…"
After: "…shown with your name (your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle; your Farcaster ID on quote cards)…"

Terms §5, now: "Your name is shown with it: your Farcaster name, or, for a wallet account, its address shortened."
After: "Your name is shown with it: your Farcaster name; for a wallet account, its address shortened; for a Lens account, its Lens username; for a Bluesky account, its handle."

Why: work is bylined with the Lens username ("lens/stani") or the Bluesky handle.

**9. Privacy §7, Lens (after the Farcaster item)**

After (new):
> If you sign in with Lens: our server asks Lens's API (api.lens.xyz) for a sign-in message for your Lens account and the wallet you sign with, and sends Lens your signature, which Lens checks. Lens receives those two addresses and learns that you signed in here. To show you which Lens accounts your wallet can sign in as, Lens also receives your wallet's address.

Add with variant B:
> When you open the image or frame maker, or make an image or a frame, without a linked Farcaster account, Lens's API also receives your Lens account's address, to look up its Lens score, which decides whether you get free images and frames. We keep the score in memory for up to an hour.

Why: these are the only calls to Lens. With variant A the score is never looked up.

**10. Privacy §7, Bluesky (after item 9)**

After (new):
> If you sign in with Bluesky: our server looks up your handle (in its domain's DNS, or at the handle's own web address), your account's public record (at plc.directory, run by Bluesky, or at your own domain), and your Bluesky server (your PDS) and the sign-in server it names, which may be Bluesky's or another provider's. You approve the sign-in on that sign-in server, under its own terms, and it learns that you signed in here. We ask it only to confirm who you are, not to read or post anything for you.

Why: every outside request Bluesky sign-in makes (scope `atproto` only). The challenge's "Bluesky and Lens
receive the details of a post…" item stays as it is.

**11. Privacy §3, one phrase (kept on your device)**

Now: "…your sign-in, which lasts about an hour (a day for a wallet sign-in), and a payment you have sent but not yet seen credited."
After: "…your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note of a Bluesky sign-in under way, kept in that tab for at most ten minutes, and a payment you have sent but not yet seen credited."

Why: the sign-in lasts a day, and a Bluesky sign-in in progress is kept sealed in the tab.

**12. Terms §4 (Who can use it)**

Now:
> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account or a wallet address. You can link a wallet to your Farcaster account; while it is linked, signing in with the wallet is signing in as that account. Other ways to sign in may come later; these Terms will list each one when it does.

After (variant B; with A, the free sentence reads "Free daily images and frames come with a Farcaster account; a Lens or Bluesky account gets them only while it is linked to one."):
> Anyone can read and listen without an account. To sign in you must be at least 18 years old. Your account here is a Farcaster account, a wallet address, a Lens account or a Bluesky account. You can link a wallet, a Lens account or a Bluesky account to your Farcaster account, and a Bluesky account to your Lens account; while it is linked, signing in with it is signing in as that account. Free daily images and frames come with a Farcaster account, and with a Lens account whose Lens score is at least the one the Service shows; a Bluesky account gets them only while it is linked to a Farcaster or Lens account. To prepay for generations, sign in with a wallet (section 6a).

Why: who gets what, as `src/lib/social/free.ts` decides it. With 3b, drop "a Lens account or a Bluesky
account … your Lens account" from the linking sentence.

## Coming, not yet drafted

**13. The Bluesky check's Privacy and Terms lines.** `bluesky-check` has no commit of its own yet (checked
2026-11-04: only a merge of main, plus an uncommitted config draft). Its shape so far: Bluesky's public AppView
(`public.api.bsky.app`) receives the account's DID; the account must be made before 6 Nov 2026 and have 5 posts
in the last 30 days; only the decision and its time are kept, for 24 hours. When it lands it adds a §7 item and a
§4 item, and changes the Bluesky half of item 12's free sentence and Terms §6e ("a Farcaster account that passes
the site's check"). It can be reread with this list or on its own, but it goes on only with Bluesky sign-in.

## Also needs your yes (not words)

**14. Four P4a sign-in exemptions** (lens/challenge, lens/verify, bluesky/start, bluesky/callback). These are
sign-in routes like the wallet's and Farcaster's. They write only an account row after a proof that Lens or the
person's Bluesky server accepted. **Recommend yes.**

**Not in this reread:** "one person, many linked accounts" is a separate proposal
(`docs/proposals/linked-accounts.md`), for its own release and its own reread. Only item 3+ is taken from it.
