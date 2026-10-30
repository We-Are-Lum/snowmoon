# Branch report: dashboard-rename

2026-10-29/30, overnight, by the coding agent. Not merged, no PR opened, no migration, no money spent.

## What changed

- **Your page is now the Dashboard, at /dashboard.** The old addresses keep working: /you and every
  page under it (/you/illustrations, /you/script/…) send people on to the same page under /dashboard,
  permanently (the same way /images became /references).
- **Every place that pointed at /you now points at /dashboard**: the top bar's avatar, the name in the
  menu, the wallet panel's "link this wallet" hint, the image review's back link, the script links in
  the agents list, and the page's own title ("Dashboard"). The avatar's spoken name is now
  "Dashboard: @name".
- **Words "You page" became "Dashboard"** everywhere people or agents read them: the agent tools'
  descriptions, the guide agents read (agents.md), the agent connection screen, the messages an agent
  gets back ("waiting for your person to approve … on their Dashboard"), and the wallet hint.
- **The page's data address stays /api/you.** Other pages read it too (the agent connection screen and
  the feedback box use it to know who is signed in), so moving it would have meant more change for no
  gain. Nobody sees this address.
- **The public profile, /@<name>, now shows published pictures** as well as published scenes. Each
  picture carries its AI label (with its recipe one tap away, as everywhere else) and links to its
  own page. Hidden pictures and drafts never appear. **Agent pieces** appear there too, but only once
  the agents' public pages (/p) are switched on; today they are off, so none show. Remix frames and
  storyboards still wait for consent v5, as you decided on 2026-10-19.
- A person with nothing published gets "Nothing published yet."; an unknown name gets "not found".
  (A wallet account with nothing published also gets "not found", as before, so the page never tells
  anyone which addresses have used the site.)
- On the Dashboard, the note under "Your public page" now says what it really shows: "the scenes and
  pictures you have published here".
- No new tables; the profile reads the same published records the rest of the site shows.

## What was checked

All on this branch, with full logs kept.

- TypeScript: no errors.
- Lint: the repository has no lint script or ESLint setup, so there was nothing to run.
- Principles (static): 53 pass, 0 fail, 1 not run (P6d needs the Vercel tool, as before), of 54.
- Build: passed.
- UI check against the built site: **passed**, 59 pages (light and dark, phone and desktop sizes).
- Shipped check against the built site: 13 of 13 pass, including a new one: /you, /you/illustrations,
  /you/script/1/2 and /you?tab=agents each redirect permanently to the same /dashboard address,
  /dashboard and /dashboard/illustrations load, and an unknown /@name is "not found".
- Agent tests: 185 checks pass. Agent read API: 25 of 25 pass.
- Dashboard and profile test (test-you-page): **74 of 74 pass**, including the profile showing a
  published picture with its AI label and never a hidden one or someone else's. Its first run found
  two old expectations still waiting for the avatar's old spoken name "You: …" (70 pass, 4 fail); the
  site was right, the test was fixed, and it then passed in full.
- The build and the UI and shipped checks ran on commit 143cb8a; the commit after it changes only the
  test script and these documents, not the site.

## Left for you

- **Reread the legal draft**: docs/legal/dashboard-rename-draft.md. The Terms (6b) and Privacy (§4)
  each still say "on your You page" once. I did not change them. Until you reread, the legal texts say
  "You page" while the site says "Dashboard".
- Optional, in the same draft: one sentence for Privacy §6 naming the public profile.
- The connection screen agents show ("Disconnect it on your Dashboard…") is drafted wording in
  src/lib/agents/wording.ts; it is not part of the recorded consent, but you may want to read it.

## Principles

- **P1 (public recipe)**: pass. Every picture on the profile opens its recipe sheet, the same one the
  feed and the picture's own page show.
- **P2 (AI declared)**: pass. Every picture on the profile carries its AI label; the UI and profile
  checks look for a label on every picture, in light and dark.
- **P4 (nothing published without a person's action)**: pass. The profile lists only work its maker
  published and has not hidden; agent drafts never appear.
- **P5 (nothing featured)**: pass. The profile lists newest first; nothing is picked or ranked.
- **P6 (no third-party requests; only totals)**: pass. Pictures come from the site's own media host; no
  likes or ratings are shown per person.
- **P7 (no payments in ordering)**: pass. Balances never appear on the profile.
- Concern to weigh: listing a person's published pictures together on their profile is new. Each was
  already public with their name at its own page, and Privacy §6 says so, but you decided on
  2026-10-19 to keep remix frames and storyboards off the profile until consent v5. Pictures are
  listed now because you asked for them; if you see them like frames, turn them off before merging.
