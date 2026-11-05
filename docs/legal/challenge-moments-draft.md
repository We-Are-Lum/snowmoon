# The remix challenge as moments: Terms, Privacy and site lines (DRAFT)

Drafted by a coding agent (Claude, a closed model by Anthropic), 2026-11-05, on branch `challenge-moments`, for the
coordinator's review and the owner's reread. **DRAFT: none of these words is in `src/lib/legal.ts`.** Legal texts
describe today, so they ship only in the release that makes pictures the entries, after the owner says "reread".
`LEGAL.ownerReread` is not touched.

What changes in practice (docs/proposals/challenge-moments.md §2; owner's answers of 2026-11-05): an entry stops being
a remixed character sheet and becomes **one picture of a challenge character at one of the challenge's moments**,
remixed from one of its pictures on the challenge page. Submit stays as it is (option B: paste the post's address).
The final version stays a sheet (option A). Nothing new is sent to any service: the picture is made through the site's
existing image pipeline, whose services Privacy already names.

The switch: `CHALLENGE.pictureEntries` (off). `check:principles` P6ac refuses it on until Terms §6e and Privacy §4
say what is below. While it is off, sheet remixes stay the entries and these words stay out.

Every "Before" is quoted word for word from `src/lib/legal.ts` on this branch (Terms words `7rdbgk`, Privacy words
`1h0plt9`). Shortest true sentence; no implementation detail.

## Terms §6e

| # | Before | After |
|---|---|---|
| T1 | During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix its characters' sheets; making other sheets and styles stays by invitation. | During the challenge, anyone signed in with a Farcaster account or a Bluesky account that passes the site's check for it may remix pictures of its characters; making sheets and styles stays by invitation. |
| T2 | A version counts as an entry only once its maker submits it on the Service, with a link to their own post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a remix (not a sheet made from scratch) made on the Service during the challenge by an account we invited or one that passed the site's check when the version was published. | A picture counts as an entry only once its maker submits it on the Service, with a link to their own post about it on Farcaster, Bluesky or Lens that links to its page, and only if it is a picture of a challenge character at one of the challenge's moments, remixed from one of its pictures on the challenge page (not made from scratch), made on the Service during the challenge by an account we invited or one that passed the site's check when it was published. |
| T3 | Admins can make versions but aren't eligible for rewards. | Admins can make pictures but aren't eligible for rewards. |
| T4 | …a fingerprint of its pictures and recipe (not the pictures or words themselves)… hiding a version later removes it from the Service, but not its fingerprint from that record. | …a fingerprint of its picture and recipe (not the picture or words themselves)… hiding a picture later removes it from the Service, but not its fingerprint from that record. |
| — | A character needs entries from at least three different people to get a final version; several entries by one person count once. | unchanged (option A keeps "final version") |

Note on T1: the Bluesky clause says "a Farcaster account or a Bluesky account"; Lens accounts can submit (Privacy §4
and the site's Submit line say "Farcaster, Lens or Bluesky"). Whether T1 should name Lens is a question for the
coordinator (it is true today for sheets too, so it is not this release's change).

## Privacy §4

| # | Before | After |
|---|---|---|
| P1 | Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. During the remix challenge, anyone who passes the same check as making images can publish a remix of its characters' sheets. | Character sheets you publish, with their text, their views, your name and the record of how each view was made. These are public. |
| P2 | If you take part in the remix challenge: for each version of a challenge character you publish, whether it can count as an entry and why… | If you take part in the remix challenge: for each picture of a challenge character you publish, whether it can count as an entry and why… |
| P3 | …and each version you submit as an entry, with its character and when you submitted it. | …and each picture you submit as an entry, with its character and when you submitted it. |
| P4 | …which is kept and listed on the version's page like any post you add (below)… | …which is kept and listed on the picture's page like any post you add (below)… |
| P5 | Whether a version is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. | Whether a picture is an entry is shown on its page and on the challenge page, with how many people have submitted for each character. |

The IPFS record sentence of §4 (if it carries "a fingerprint of its pictures and recipe") changes as T4 does.

## Privacy §6

| Before | After |
|---|---|
| During the remix challenge, a version of one of its characters that you publish and submit is shown as an entry, on its page and on the challenge page. | During the remix challenge, a picture of one of its characters that you publish and submit is shown as an entry, on its page and on the challenge page. |

## Privacy §7

| Before | After |
|---|---|
| During the remix challenge, that check also decides, once, when you publish a remix of a challenge character, whether it can count as an entry. | During the remix challenge, that check also decides, once, when you publish a picture of a challenge character, whether it can count as an entry. |

The Bluesky item ("or publish a remix during the remix challenge") stays true and is unchanged. No new service, no new
sentence: Submit option B needs none (option A, "Find my post", would, and is not built).

## Consent screen

Unchanged. The person's words go into an image prompt exactly as on "Make an image", under the same consent.

## Site lines (all "Draft wording" until approved)

| Where | Before | After |
|---|---|---|
| /challenge one line (`landing-wording.ts`) | Pick a character, tap its base or a first remix, then Remix to make it your own. Entries … close … | Pick a character. Tap a picture to remix it. Entries close … (shipped in R1) |
| Card: moments heading | — | Moments picked by @naaate |
| Card: deeper layers | — | May spoil later chapters. |
| Card: marks | — | This edition's summary · Look invented by this edition: the book doesn't describe it. |
| Remix screen | the sheet form's band, views, licence line, rules text | Describe what to change (placeholder) · the model chip · the publication line (P1) |
| Near Submit (owner, answer 7) | — | Sign in with Farcaster, Lens or Bluesky to enter. · Rules |
| Rules: what counts | Only remixes count: for each character, start from one of its bases, or someone else's remix. A new sheet made from scratch isn't an entry. | Only remixes count: start from one of a character's pictures on the challenge page and set it at one of the moments. A picture made from scratch isn't an entry. |
| Rules: free | Remixing is free: three remixes a day. A remix is one sheet's three views; if one of them fails, make it again inside the same remix without using another. | Remixing is free: ten pictures a day. |
| Rules: to remix at all | …It's checked when you press Generate, and again when you publish. | …It's checked when you press Make it, and again when you publish. |
| Post text | My remix of Bai, for the Snowmoon Party remix challenge | Bai at The quarterfinal, my remix for the Snowmoon Party remix challenge |

The rules and post-text lines switch with `CHALLENGE.pictureEntries`, so the site never says pictures count before
Terms and Privacy do.
