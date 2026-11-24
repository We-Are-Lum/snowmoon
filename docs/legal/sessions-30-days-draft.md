# Privacy: 30-day sign-ins and "Sign out on every device" (DRAFT, for the owner's reread)

Branch `session-30d` (owner, 2026-11-23). Drafted by the coding agent (Claude, a closed model by Anthropic). Not in
`src/lib/legal.ts` yet: the words go in after the owner's "reread", in the same release as the feature, never ahead of it.

## What the site will do (and does on this branch)

- A website sign-in (Farcaster on the website, a wallet, Lens or Bluesky) lasts 30 days. It is the site's own signed
  session, kept in the browser's localStorage and sent with each request; never a cookie. Before: about an hour for
  Farcaster on the website (Farcaster's own token), a day for the others.
- Inside the Farcaster app nothing changes: Farcaster signs you in itself.
- "Sign out on every device" on the You page ends every website sign-in of that person, in every browser, including the
  one used. The server keeps one row per person: the moment they chose it. Nothing else is kept for sign-ins.

## 1. Privacy §3, "Kept on your device only." (the change the owner named)

Now:

> … and, on the website, your sign-in, which lasts about an hour (a day for a wallet, Lens or Bluesky sign-in), a note
> of a Bluesky sign-in under way, …

Draft:

> … and, on the website, your sign-in, which lasts 30 days unless you sign out, a note of a Bluesky sign-in under way, …

## 2. Privacy §4, "Kept by us when you sign in." (a new line, because the server now keeps something new)

Added after "That you agreed to the terms for publishing, and any of your own work you have hidden.":

> If you choose "Sign out on every device" on your You page: when you chose it, so that sign-ins made before then stop
> working.

Why it is needed: "Legal texts describe today" (CLAUDE.md). The table `studio.session_ends` keeps, per account, the
time of the last "Sign out on every device". It is private (no public read; studio_writer only), holds no device,
browser or address, and is kept while you use the Service (§9 unchanged). If the owner prefers no §4 line, the
alternative is to say it in §3's sentence instead; I recommend the §4 line, where the other kept sign-in facts are.

## Not changed

- Terms: no change (sign-in rules, 18+, accounts are as before).
- Consent screen (`config/consent.json`): no change.
- The You page's own words for the button are DRAFT wording in `src/components/you-page.tsx`
  ("Ends every sign-in to this site, in every browser, including this one. Inside the Farcaster app, Farcaster keeps you
  signed in.").
