# /challenge, the short version: what was cut, for the owner's OK

DRAFT, for the owner's OK. Drafted 2026-11-04 by Claude Code (Claude, a closed model by Anthropic) on branch
`challenge-landing`, from the owner's note of 2026-11-04: "When it goes public, the page says much less. Draft a short
version: a title, one line on what to do, the characters' bases, and a Remix button, with the rules behind a 'Rules'
link. List what was cut, for my OK."

/challenge is admin-only for now (branch `challenge-admin-only`, built separately). Nothing here opens it.

## The short page, word for word

**Title:** Remix the cast

**The one line** (its dates built from `CHALLENGE.dates`, so it changes by itself):

- Before entries open: "Pick a character, tap one of its bases, then Remix to make it your own. Entries open Fri 6 Nov, 09:00 PT and close Sun 22 Nov, 23:59 PT."
- While they're open: "Pick a character, tap one of its bases, then Remix to make it your own. Entries close Sun 22 Nov, 23:59 PT."
- After the close: "Entries closed Sun 22 Nov, 23:59 PT. Every remix is below."

**Then:** "Rules" (a link to `/challenge/rules`) · "Draft wording".

**Then each character**, in `CHALLENGE.characters`' order: its name, its three bases as a triptych (tap one, then
"Remix" opens that base's remix form). Before its bases are picked: "Zei's three bases aren't picked yet. Until they
are, remix any published sheet of Zei." and up to three of its sheets as the triptych; with no sheet at all: "Gladias's
three bases aren't picked yet, and no sheet of Gladias is published yet."

**Then (proposed, please say yes or no):** "Remixes", a random six, fresh on each visit, and "See all remixes →"
(`/challenge/remixes`). Your list doesn't name them. They add one block, about two screens of cards at phone width;
if that is too long, they can move to "See all" only, with one link under the characters.

**At the foot:** "An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him."

## Where the rules went

A separate page, **`/challenge/rules`**, not a disclosure on /challenge: it has its own address to link from posts and
the share text, it keeps /challenge short even for someone who opens the rules, and a phone's back button returns to
the bases. It is reached by the "Rules" link at the top of /challenge.

## What was cut from today's page, and where it went

| Today's /challenge | Now |
|---|---|
| "← Characters" link at the top | Dropped (the menu still has References › Characters) |
| "Draft wording: drafted for the owner, not yet approved." | Shortened to "Draft wording" beside Rules; the full line is on /challenge/rules |
| The deadline line ("Entries open … Entries close …, Pacific") | Folded into the one line (short dates, PT); the full line moved to Rules |
| "Entering needs a Farcaster account with a Neynar score of 0.7 or more; we check when you press Generate." | Moved to Rules (top, under the deadline). **Needs your OK:** your 2026-11-03 decision put it up front on /challenge. A below-0.7 visitor still reads it before the consent screen of a challenge fork, which is unchanged |
| The intro ("From 6 to 22 November, make your own version of …") | Moved to Rules; the one line replaces it here |
| "What happens next." (the call, Episode 1, the credit test, the mint plan) | Moved to Rules |
| "The rules." and its list (site tools, remixes only, one entry, the account check, three entrants, free, posting, the 0.7 score) | Moved to Rules |
| "Admins (the site's owner and @garance) can make versions too, but aren't eligible for rewards." | Moved to Rules |
| The bounties paragraph and each character's bounty line | Dropped: no bounties at all (owner, 2026-11-04) |
| Each character's count ("0 people have entered · 3 more needed for a final version") | Moved to Rules, as "Entrants so far", one line per character |
| Each character's "about" text from its sheet file | Dropped |
| "What the book says about Zei →" | Dropped from /challenge (the character's own page is one tap from any base's page) |
| "Bases to start from" / "Sheets to start from" label | Dropped: the triptych and the one line say it |
| The list of up to 24 starting sheets per character (before the bases) | Cut to three, shown as the triptych; the rest stay on the character's page |
| "Entries so far" (newest first) and "Made by admins (not eligible for rewards)" | Moved to Rules |

## Decisions owed

1. The short page as drafted: the title, the one line and the triptychs.
2. The random six and "See all" on /challenge: keep, or move to "See all" only.
3. "Who can enter" moved off /challenge to Rules (your 2026-11-03 decision put it up front).
4. Rules as a separate page (`/challenge/rules`) rather than a disclosure.
