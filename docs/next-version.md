# Snowmoon Party — Next Version Plan

Brainstorm with Nate, 2026-10-27. A starting plan, not a spec. Each phase is meant to go to Claude Code as a
report-first task: plan, cost and open questions before building.

Saved from the owner's doc "Snowmoon Party — Next Version Plan"
(https://claude.ai/artifact/XxdWhRNmimw9H9NB1kQvGa), 2026-10-29, word for word.

## The idea in one line

snowmoon.party built around **adaptations**: social across many networks, easy for AI agents to work in, with a
small group of admins shaping what's featured in the book. Every recipe is logged, everything is forkable, and
people publish their own work.

## What Nate said, grouped

### 1. Adaptations first

- Adaptations may move to the top of the menu, possibly above Read.
- An adaptation is a full work in progress (a scene, a video, a comic) that its maker controls. **The maker has
  final cut.**
- Others can comment, suggest and propose changes.
- **Anyone can fork** (the licence allows it anyway), and forking is encouraged and friendly: "exploratory forks,
  not angry forks".
- A fork shows what it came from. The original maker can look at a fork and pull pieces back into their own cut.

### 2. "Pictures" becomes "References"

- References are one or more images for every glossary item (characters, places, objects, styles), made by the
  community: a visual glossary.
- Pictures of moments stay throughout the reader; that's a separate thing.
- People submit images for any moment or glossary item. Admins approve which ones are featured.

### 3. Admins

- Nate and Garance, with near-unlimited generations and AI use.
- From inside the reader, while signed in as admin, they can:
  - remove any displayed image;
  - grab any text and generate images from it;
  - see what others have made for a moment and approve images to be featured in the book or glossary.

### 4. More models

- Add Gemini and ChatGPT image models, and over time as many models as their licences allow.
- The recipe is logged for every one.

### 5. Many logins

- Farcaster, wallet, X, Lens and Bluesky, plus any other free logins worth having.
- Only logins with a reputation score (like Neynar's) get free generations.

### 6. Social conversation around everything published

- Anything published (a moment image, a reference, an adaptation, an idea, later the NFT collection) gathers what
  people say about it on social networks: posts that link to it, and replies to the Snowmoon bot's post sharing
  it.
- **Cross-network replies:** reply on Farcaster to a Lens post, from inside the site. The full thread lives on
  snowmoon.party, and the bot replies on each network pointing to it ("see the full thread here").

### 7. Cleaner design

- Less text, with details behind info icons.

### 8. Agents can do everything a person can

- Agents mostly work on your private, unpublished projects, logging every recipe as they go.
- Publishing stays a human step on the site: approve one by one, or approve all after looking.
- Rate limits so no one's agent floods the feed.

### 9. The Collab app

- A separate app for now: a $1–5/month subscription to a running private chat for committed collaborators. At
  first it's gated by Neynar score.
- It's where private work happens: the Snowmoon Fund, the NFT collection, and donations.
- **Later, an API to the site:**
  - At minimum, members (and their agents) can read the chat on snowmoon.party and get notified of new things.
  - At most, they chat directly on the site, share links that unfurl nicely, like messages, and renew their
    subscription there.

## Things to check before building

- **Cross-network replies need write access.** Posting someone's reply to Farcaster, Lens, Bluesky or X needs them
  signed in with that network and having granted permission to post for them. Farcaster needs a signer; Bluesky
  and Lens have their own app permissions; X's API charges for writing and especially for reading replies. Expect
  Farcaster, Bluesky and Lens to be practical first, with X limited.
- **Reputation scores differ by network.** Neynar for Farcaster; Lens has its own score; Bluesky and X have no
  official equivalent. Decide what "has a reputation score" means for each.
- **Closed image models (Gemini, ChatGPT):** check each one's terms against the book's licence and your principles
  (recipes, labels, open-weights preference). Their recipes can't include weights or seeds the same way.
- **Admin removal vs. "no canon":** featured images are a curated default, not canon. Keep the measurement-based
  defaults where they exist, and make the admin feature visibly labelled as a pick.
- **Fork credit:** pulling a piece back from a fork should credit the fork's maker in the recipe.
- **The Collab chat stays private.** If members' agents read it, the privacy notice and Terms need lines for that.

## Suggested order

**Phase 0: finish what's open.** The glossary letter, the image review and redos, the fal cleanup, and Plan A
part 1 (the agent failure log and notes on drafts). Vitalik's asks come first.

**Phase 1: menu, names and cleanup (cheap, visible).**

- Adaptations at or near the top; Pictures renamed References; Read stays easy to reach.
- Tuck explanatory text behind info icons across the main pages.
- References page: one card per glossary item, with its reference images.

**Phase 2: admin powers in the reader.**

- An admin role for Nate and Garance: remove, generate from any text, review submissions, feature in book or
  glossary.
- Higher limits for admins, still logged.

**Phase 3: adaptations as owned, forkable works.**

- Owner's final cut; comments, suggestions and proposals from others.
- Fork with a visible "forked from"; pull a piece back from a fork, credited.

**Phase 4: agents at parity, with a publish queue.**

- Agents can draft anything a person can (building on Plan A).
- A publish queue on /you: approve one by one or all, rate-limited.

**Phase 5: more logins.**

- Bluesky and Lens first, then X. Free generations only for logins with a reputation score.

**Phase 6: social threads.**

- Collect posts linking to published items and replies to the bot's posts, starting with Farcaster.
- Show them on the item's page. Cross-network replying comes after, network by network.

**Phase 7: more models.**

- Gemini and ChatGPT image models once licence and labelling are settled, with full recipes.

**Phase 8: Collab integration.**

- An API so members and their agents can read the Collab chat on the site and get notified. Posting and renewing
  later.

## Kickoff prompt for Claude Code

Paste this to start. It asks for a plan only.

```
Next version of snowmoon.party: read docs/next-version.md (save this doc there first). Report only, build nothing.

1. For each phase (1 to 8), give me: what changes in the site, the files and tables it touches, any migration, what it costs to run, which principles it affects (and any it conflicts with), and the Privacy/Terms lines it would need.
2. Phase 1 in detail: the new menu order (Adaptations near the top, Pictures renamed References), every page where text should move behind an info icon (list them with the text), and a References page with one card per glossary item. Include screenshots of today's pages for comparison.
3. Phase 2 in detail: an admin role for FID 6786 and Garance (193912): remove, generate from any text, review submissions, feature in book or glossary. How "featured" sits with "no canon" and measurement-based defaults.
4. Logins (phase 5): for Bluesky, Lens and X, what sign-in each offers, what it costs, whether it gives a reputation score, and what posting on someone's behalf would need.
5. Social threads (phase 6): what we can read for free from Farcaster, Bluesky, Lens and X about posts linking to our pages and replies to our bot.
6. Gemini and ChatGPT image models (phase 7): their terms against the book's licence and our principles.
Then propose what to build first. Phase 0 (glossary, image review, fal, Plan A part 1) stays ahead of all of this.
```
