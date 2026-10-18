# Privacy: drafted lines for the You page and /@handle (DRAFT, for the owner's reread)

Branch `you-page`, 2026-10-18. Drafted by the coding agent. **Not in `src/lib/legal.ts`**: legal texts
describe what the site does on the day they go live, so these go in only with the owner's reread,
in the same merge that ships the pages (then `LEGAL.ownerReread.privacy` is set again on the owner's word).

What the branch changes about what is shown publicly or sent elsewhere:

1. **A public profile, `/@<handle>`**, gathers in one place the scenes, Remix frames and storyboards a
   person has published and not hidden. Each was already public at its own link; frames and
   storyboards were findable only by their link until now. The profile is `noindex` (not offered to
   search engines), never shows hidden work, pictures' prompts beyond each frame's own words, balances
   or anything from the You page.
2. **The You page, `/you`**, is shown only to the signed-in person. It reads what we already keep;
   it stores nothing new.
3. **Basenames.** For a wallet account, the server asks Base's public network endpoint for the
   address's Basename (reverse record, then checked forward), to name the account on its You page and
   its public profile. Only the address is sent.
4. **The top bar's avatar** (owner's follow-up, 2026-10-18). For a Farcaster sign-in, our server asks
   Farcaster's public API for the profile picture's address (the FID only, as for usernames) and then
   fetches the picture from wherever it is hosted, and serves it from this site at `/api/pfp/<fid>`, so
   the visitor's browser makes no third-party request; the picture's host sees our server, not the
   visitor. Pictures are public data, cached a day. A wallet session's avatar is drawn from the address
   on the device; nothing is sent.
5. **Farcaster and a wallet signed in together.** The You page then sends both sessions' tokens to our
   server in one request, each checked on its own, to show both accounts and their work. Nothing new is
   stored and the two accounts are not linked on the server.
6. **Hiding a scene.** A person can now hide their own published scene versions themselves, at once,
   as they can images, Remix frames and storyboards.

## The lines, and where each goes in `src/lib/legal.ts` (PRIVACY)

### A. Section 6, "What you publish." — append after the existing paragraph's last sentence ("See the Terms, sections 5 and 7.")

> Your public page, at /@ followed by your Farcaster name (or, for a wallet account, its address), lists in one place the scenes, Remix frames and storyboards you have published here and not hidden, each linking to its own page. It shows nothing that isn't already public at that link, and nothing you have hidden. It is not offered to search engines, but anyone with its address can open it, and names on the site link to it. On it, and on your own You page, a wallet account is named by its Basename if it has one, otherwise by its address shortened.

### B. Section 7, "Outside services and what they receive." — replace the Base item

Now:

> If you prepay: Base's public network endpoint receives the transaction we look up to confirm your payment.

Drafted:

> If you sign in with a wallet: Base's public network endpoint receives the transaction we look up to confirm a payment, and your wallet address when we look up its Basename to show on your You page and your public page.

### B2. Section 7 — the Farcaster item, one clause added at its end

Now ends:

> … and a username when a page is opened at /@name.

Drafted:

> … and a username when a page is opened at /@name. When you are signed in with Farcaster, our server also asks it where your profile picture is and fetches the picture from that host, to show it in the top bar; your browser fetches it only from us.

### C. Section 9, "Keeping and deleting." — one word added

Now:

> … and you can hide your own images, Remix frames and storyboards yourself at once; …

Drafted:

> … and you can hide your own scenes, images, Remix frames and storyboards yourself at once, from each one's page or from your You page; …

### D. Section 4, "Kept by us when you sign in." — the item about hiding, only if the DRAFT migration 0015 is applied

Now:

> That you agreed to the terms for publishing, and any of your own work you have hidden.

Drafted (0015 records who hid a scene, as 0013 already does for frames and storyboards):

> That you agreed to the terms for publishing, and any of your own work you have hidden, and whether you or a moderator hid it.

No line is needed for `/you` itself, nor for both sessions being sent together: it keeps nothing new (section 3's sign-in tokens are the same tokens).

## Not Privacy, but the same rule: the consent wording

`config/consent.json`, `own-words-v4`, says work "is shown with your name: your Farcaster name, or, for
a wallet account, its address shortened." Two changes on this branch go past that sentence:

- the public profile **gathers** a person's frames and storyboards in one place (v4 says frames are
  "public at its link"); and
- a wallet account may be named by its **Basename** on its profile.

If the owner keeps both, a new wording (`own-words-v5`) would say so, and everyone is asked again
before their next Generate or publish. A drafted line for v5, replacing v4's fifth paragraph:

> It is shown with your name: your Farcaster name, or, for a wallet account, its Basename if it has one, otherwise its address shortened. Your public page, /@ and your name, lists everything you have published and not hidden.

Until then, the two simplest ways to keep today's texts true are: merge these pages only together
with A–C and v5; or drop the Basename (src/lib/you.ts `whoIs`) and the frames and storyboards from
the profile (src/lib/you.ts `publicWork`), leaving it to scenes, which are public pages already.
