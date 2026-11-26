# X posts from Discord: plan

**DRAFT.** Written by an AI coding agent (Claude, made by Anthropic), 2026-11-25, for the owner's reread. Version 6:
the owner's answers to section 9 and later changes (2026-11-25) are folded in. Every wording below is this edition's own, a draft until
the owner rereads it. The account is @snowmoon_party.

The team proposes posts for the Snowmoon X account in one Discord channel, approves them with buttons, and the site
posts them once enough people agree. The site can suggest posts too. Everything is logged.

## 1. How it works

### Proposing

- One channel, **#x-posts**, private to the team role (and the app).
- **`/xpost`** posts a card in #x-posts. Only members with the team role can use it (checked by the site on every
  request, whatever Discord's command settings say). Options:
  - `text` (required): the post as it will appear on X.
  - `link` (optional): added at the end of the post. A post with a link costs about 13 times more (section 5).
- The site checks the post before the card appears, and says why if it refuses: X's own character count (a link counts
  as 23 characters, some characters count double; 280 at most), not empty, no `@` mention of an X account unless the
  proposer confirms it (an `@name` on X tags whoever owns that name there).
- **The proposer's approval is counted automatically** when they propose (owner, 2026-11-25). The card starts at 1 of 3:
  3 distinct people, at least one of them Nate, Garance or Luis.

### The card

Discord shows the same buttons to everyone; the site checks who clicked and answers only them (an "ephemeral" reply,
seen only by that person).

- **Approve**: anyone with the team role. Clicking again takes the approval back.
- **Edit**: the proposer only. Opens a box with the post's text and link. Saving **resets the approvals** to the
  proposer's alone and says so on the card.
- **Withdraw**: the proposer only, after a confirmation. The card stays, marked withdrawn, with no buttons.

### Posting

- It posts when **3 people** with the team role have approved, **at least one of them Nate, Garance or Luis**,
  identified by their Discord user IDs.
- Roles are checked at each click. Someone whose team role was removed can't approve, edit, withdraw or delete.
- **Posted once, at most.** The database moves a proposal from open to posting in one step, so two clicks at the same
  moment can't post twice (Chorus's check for this never worked: see section 7). If X doesn't answer, the card says
  "X didn't answer: check the account before trying again" rather than posting again by itself.
- Discord needs an answer within 3 seconds; X can be slower. The click is acknowledged at once and the card is updated
  when X answers.
- After posting, the card shows the post's link, who approved it, and **Delete from X**.

### Deleting

- **Delete from X**: any one person who approved it (still on the team), and Nate, Garance and Luis always. After a
  confirmation. The card then says who deleted it and when.
- **If the work a post links to is hidden on the site** (by its maker or a moderator), the site deletes the post from X
  itself and says so on the card (owner, 2026-11-25). This keeps the Privacy line in section 4 true without anyone
  having to remember.
- **A posted card is frozen** (owner, 2026-11-25): its text, link and post never change, and it can't reopen. The
  database refuses anything but marking it deleted, and a deleted card never changes.

### Delete and redraft

"Edit and try again" after a post is out (owner, 2026-11-25).
- **Delete and redraft**, beside Delete from X, for the same people. After a confirmation it deletes the post from X,
  then starts a new open card with the same text and link, ready to edit.
- The new card is a team card with the clicker as its proposer, also when the old one was a site suggestion (a work has
  at most one suggestion). It keeps the work it is about, so hiding that work still withdraws it or deletes its post.
- It needs fresh approvals: 3 people, at least one of Nate, Garance or Luis. As with any proposal, the proposer's own
  approval counts.
- Each card points to the other, and the log has a row on both ("redrafted to", "redrafted from"). A card is redrafted
  once at most; the database refuses a second.
- If X doesn't delete the post, nothing is redrafted.

### Site suggestions

- When something new is published that the team may want to share, the site posts a card **"Suggested by
  snowmoon.party"**. First events: a new published take, a new remix challenge entry. A recording-only Ephelion entry
  (kind `voice_take`) can be suggested too (owner, 2026-11-25: its table, from `NEXT_voice_takes.sql`, uses a uuid id).
- The suggestion's text comes from a fixed template (section 4), never from a model. No approval is counted for the
  site: it needs 3 people, one of them Nate, Garance or Luis.
- Edit and Withdraw on a suggestion (owner, 2026-11-25): anyone on the team can Edit it, and becomes its proposer
  (their approval counts, the others reset); only Nate, Garance and Luis can Withdraw it.
- At most 5 site suggestions a day, in the order things were published. Nothing paid enters which work is suggested.
- If the work is hidden before it's posted, the site withdraws the suggestion.

### The log

Every proposal, edit, approval, approval taken back, withdrawal, post, failed post and delete is a row in an
append-only log: what happened, who (Discord user ID and name at the time), when, the post's text at that moment, the X
post's ID and what X charged. The card shows the latest state; the full log is on an admin page,
`/admin/x-posts`. A migration (`NEXT_x_posts.sql`) adds the proposals, approvals and log tables.

## 2. How it's built

- **Discord, over the web only.** Discord sends slash commands, button clicks and the edit box to
  `https://snowmoon.party/api/discord/interactions`, signed with the app's key; the site checks every signature and
  refuses anything unsigned. The site posts and updates cards through Discord's web API with the bot's token. No bot
  stays connected, so Vercel can run it. No reactions.
- **X, through its API**, posting as @snowmoon_party with that account's own four fixed token values (owner,
  2026-11-25: the developer app is created while signed in as @snowmoon_party; no sign-in flow).
- **Commands are registered from the site**: a button on `/admin/x-posts`, owner-only, so no agent ever handles the
  bot token.
- **Switches** in `src/lib/config.ts`: `X_POSTS.cards` (the channel works, nothing goes to X) and `X_POSTS.post` (posts
  for real). With `post` off, a card that reaches its approvals says "Would post now (posting is off)."
- Tests: `npm run test:x-posts` sends signed fake Discord requests (approvals, edits, races, roles, the lead rule,
  deletes, the budget, hides) against a stub X. No real X call in tests.

## 3. Wording for the reread: Discord

**Command**
- `/xpost`: "Propose a post for the Snowmoon X account"
- `text`: "The post, as it will appear on X"
- `link`: "A link to add at the end (a post with a link costs more)"

**Card (team proposal)**
- Title: "Proposed post"
- Body: the post, quoted.
- "Proposed by {name}"
- "Approved by {names} · {n} of 3"
- When no lead has approved yet: "Needs Nate, Garance or Luis"
- "{count} of 280 characters · costs about {$0.015 or $0.20} to post"
- Footer: "Posts to @{account} once 3 people approve, one of them Nate, Garance or Luis."
- Buttons: "Approve" · "Edit" · "Withdraw"

**Card (site suggestion)**
- Title: "Suggested by snowmoon.party"
- Under the post: "{what it is}, published {date}: {link}"
- The rest as above.

**Replies only the clicker sees**
- No team role: "Only the X posts team can do this. Ask Nate, Garance or Luis for the role."
- Approved: "Approved: {n} of 3." Taken back: "Your approval is taken back."
- Edit or Withdraw by someone else: "Only the person who proposed this can do that."
- Delete by someone not allowed: "Only someone who approved this post, or Nate, Garance or Luis, can delete it."
- Refused at proposal: "This is {count} characters on X; the most is 280." / "This mentions @{name}, which tags that X
  account. Propose it again with `confirm` set if you mean it."

**Edit box**
- Title: "Edit the post". Fields: "Post", "Link (optional)".
- On the card after saving: "Edited by {name}. Approvals start again."

**Confirmations**
- Withdraw: "Withdraw this proposal? It can't be undone." Button: "Withdraw"
- Delete: "Delete this post from X? It can't be undone." Button: "Delete from X"
- Delete and redraft: "Delete this post from X and start a new card with its text? The new card needs 3 approvals
  again." Button: "Delete and redraft"

**States**
- Withdrawn: "Withdrawn by {name}, {date}."
- Posted: "Posted on X, {date}: {link}. Approved by {names}." Buttons: "Delete from X" · "Delete and redraft"
- Deleted: "Deleted from X by {name}, {date}."
- Redrafted (old card): "Deleted from X by {name}, {date}, and redrafted: {link to the new card}."
- Redraft (new card), under the title: "Redraft of {link to the old card}, by {name}."
- Delete failed: "X didn't delete this post: {X's reason}. Nothing changed." Buttons stay.
- Deleted on hide: "Deleted from X by snowmoon.party, {date}: the work it links to was hidden on the site."
- Failed: "X refused this post: {X's reason}. Nothing was posted." Button: "Try again" (anyone who approved it)
- No answer: "X didn't answer. Check @{account} before trying again." Button: "Try again"
- Budget: "Held: this month's X budget (${limit}) is used up. Nate, Garance or Luis can post it with Try again next
  month."

## 4. Wording for the reread: posts and legal lines

**Site suggestion templates** (the post itself, as it would go on X)

Names are written without `@`, so they never tag a stranger on X: a Farcaster or Lens name with its network, a Bluesky
handle as it is, a wallet shortened.

- A published take (a published storyboard): "{character}'s line from chapter {n}, voiced by {name} on {network}, made
  with AI, on snowmoon.party: {link}"
- A challenge entry: "A new remix challenge entry: {character} by {name} on {network}, made with {model} ({maker}{,
  closed model}), on snowmoon.party: {link}"

No "Team pick" or other label: it reads as a ranking (owner, 2026-11-25). If a work's page shows anything, it is
"Shared on X", with the post's link (release 2).

The link opens the work's page, which carries the recipe, the book's block ID for any quoted line, and the
"not affiliated" line. A post quotes the book only word for word.

**Legal lines** (only in the release that turns posting on; a PR with these waits for "reread")

- Privacy §6, What you publish, added at the end: "Our team may share what you publish on the project's X account,
  with your name and a link to it. If it is hidden here, we delete that post."
- Privacy §7, Outside services, a new item: "Discord, where our team chooses posts for the project's X account,
  receives the name and link of work the site suggests sharing. X receives the posts our team approves, which are
  public there under its terms."
- Terms: no change. What people publish is already GPL-3.0 and shown with their name (Terms §3, §5).

The team's own Discord IDs and names in the log are the team's, not site users', and need no Privacy line.

## 5. Spending

X charges per request: about $0.015 a post, $0.20 a post with a link, $0.01 a delete (prices from X's pricing page,
2026-11-25; X says they may change, so the developer console is the authority). Media uploads aren't priced on that
page; this plan posts no pictures (X shows the linked page's card picture by itself).

Most posts will have a link, so plan on $0.20 each.

- **Monthly limit: $20 on the site** (about 100 posts with a link). The site adds up what X charged this month from the
  log and holds any post that would go over; the card says so (section 3).
- **$25 spending limit in X's console**, as a backstop, with auto-recharge off. X blocks requests at the limit, and a
  negative balance blocks everything.
- **10 posts a day at most**, whatever the budget.

## 6. What the owner creates

Values go into Vercel (production only, marked Sensitive) by the owner. Never in chat.

**X developer app** (signed in to X as @snowmoon_party, the account that posts)
1. In the X Developer Console, create an app, `snowmoon-party-posts`. Choose pay-per-use, buy $25 of credits, set the
   spending limit to $25 and leave auto-recharge off.
2. User authentication settings: App permissions **Read and write** (no Direct Messages). Type of app: Web App,
   Automated App or Bot. Callback URL and website: `https://snowmoon.party`.
3. Keys and tokens: copy the API Key and Secret, then **generate the Access Token and Secret after step 2** (a token
   made before it stays read-only; check it says "Read and Write").
4. In Vercel: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.

**Discord app**
1. Discord Developer Portal: New Application, `Snowmoon X posts`.
2. Installation: Guild Install only (User Install off). Scopes `bot` and `applications.commands`. Bot permissions:
   **View Channels, Send Messages, Embed Links, Read Message History**. Nothing else.
3. Bot: Public Bot off. All three Privileged Gateway Intents off. Reset Token and copy it.
4. In Vercel: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`.
5. Install it in the server with the install link.

**In the server**
1. A role, `X posts team`, for everyone who may propose and approve.
2. A private channel, `#x-posts`: the team role and the app can view and send; @everyone can't view.
3. With Developer Mode on (User Settings, Advanced), copy the server ID, the channel ID, the role ID and the user IDs of
   Nate, Garance and Luis. In Vercel (plain, not secret): `DISCORD_GUILD_ID`, `DISCORD_X_CHANNEL_ID`,
   `DISCORD_X_ROLE_ID`, `DISCORD_X_LEADS` (the three user IDs, comma-separated). Kept out of the public repository so
   the team's Discord accounts aren't listed there.
4. After the release is live: General Information, Interactions Endpoint URL
   `https://snowmoon.party/api/discord/interactions` (Discord tests it when saved), then "Register commands" on
   `/admin/x-posts`, then Server Settings, Integrations, Snowmoon X posts: allow `/xpost` for the team role only.

## 7. From Chorus (read, not reused)

Metalabel's Chorus (MIT) counted emoji reactions with a connected bot and posted through the old Twitter API. It kept
no database; state lived in reactions. Taken from it:
- Say why a post is refused, with a clear mark on the card.
- Put the post's link on the card when it goes out.
- Check length before the threshold is reached.

Not repeated:
- Its "already posted" check compares a Promise, so it never works and further reactions can post again. Here a
  database state change guarantees once.
- It counts characters as JavaScript does, not as X does.
- Anyone's reaction counts, including the author's or a bot's; no roles; no edits, deletes or log.

## 8. Release order

1. One branch, `x-posts`: code, migration `NEXT_x_posts.sql`, tests, Privacy lines, both switches off.
2. Owner creates the apps (section 6, one step at a time) and applies the migration.
3. Merge with `cards` on, `post` off. Owner sets the endpoint and registers commands. The team tries a proposal
   through to "Would post now".
4. Owner's reread of the Privacy lines; merge `post` on with them, in the same release.
5. First real post, then a delete, to check both and what X charged.

## 8b. Release 1 as built (branch `x-posts`, 2026-11-25)

- **On:** `/xpost`, the cards and every button (`X_POSTS.cards`). **Off:** posting to X (`X_POSTS.post`) and the site's
  suggestions (`X_POSTS.suggest`). A card that reaches 3 approvals with a lead is logged "would post" and says
  "Would post now (posting is off)".
- **Site suggestions wait for release 2.** Turning them on sends a person's name and a link to their work to Discord,
  which Privacy §7 must say first, so they ship with the Privacy lines. The automatic delete on hide is also release 2:
  nothing is posted before then. The tables already hold both.
- **The owner's two notes (2026-11-25), both tested:**
  1. No handler updates a posted or deleted card's row. Every write locks the card and checks its state first; a late
     Approve, Edit, Withdraw, edit box or Try again on a posted card is told "This is already posted on X, so it can't
     change. Use Delete from X or Delete and redraft.", and drawing the card again writes nothing.
  2. Delete and redraft requires the old card to be posted, with its X post, inside the same transaction that marks it
     deleted and creates the new card. An open, withdrawn, refused or already redrafted card is refused with nothing
     written; the test also shows the database alone would accept it.
- **Built, tested against a stub, switched off:** posting once (open to posting in one step), X refusing (the card is
  "failed": Try again, Edit or Withdraw), X not answering ("unknown", counted as charged), the $20 month and the 10 a day
  (held, Try again by a lead), Delete from X, Delete and redraft.
- **Choices made in the code, for the owner's review:**
  - A card X refused can be edited; saving opens it again with approvals starting over.
  - The edit box doesn't ask again about an @mention: only /xpost asks (`confirm`).
  - X links a bare domain such as "snowmoon.party" by itself, so a post that names the site costs $0.20 like a link,
    and counts 23 characters. The card shows the price.
  - The month is the calendar month in UTC; the day is the Pacific day.
  - The one new wording item: `/xpost`'s `confirm` option, "Yes, I mean the @ mention (it tags that X account)".
- **P4a:** the Discord route can't require a site sign-in (Discord sends it). It passes as a checked exemption (the
  owner's yes, 2026-11-26: "Yes to the P4a exemption for /api/discord/interactions, with the conditions as checked"): the route hands the raw request to the handler and imports nothing else; the handler refuses
  (401) anything without Discord's signature before it reads it, then requires the server and the team role; nothing it
  reaches publishes or keeps anything on the site. Each part is proven to fail on a planted fault.
- **The command** is registered from `/admin/x-posts` by the owner's account only (FID 6786), so no agent handles the
  bot token. Admins see the log, this month's spending and today's posts there.

## 9. The owner's answers (2026-11-25)

1. Proposing counts as the proposer's approval: 3 distinct people, at least one of Nate, Garance or Luis. A site
   suggestion has no proposer, so it needs 3 approvals.
2. Anyone on the team can edit a site suggestion and becomes its proposer, which resets the approvals. Only Nate,
   Garance and Luis can withdraw.
3. No "Team pick" label: it reads as a ranking. If a work's page shows anything, it's "Shared on X".
4. $20 a month enforced by the site, $25 in X's console with auto-recharge off, at most 10 posts a day.
5. Delete the X post automatically when its work is hidden on the site. The owner rereads the §6 line that promises it.
6. The account is @snowmoon_party. The owner creates the developer app signed in as @snowmoon_party, so the four fixed
   token values post as that account. No sign-in flow.

Later the same day (owner, 2026-11-25): a posted card is frozen in the database (only to deleted; deleted is final), and
"Delete and redraft" is added (section 1). Both are in `NEXT_x_posts.sql` (version 2, the freeze; version 3, the redraft).
Then: a site suggestion can also be about a recording-only Ephelion entry, kind `voice_take` with a uuid id
(`NEXT_x_posts.sql` version 4).

Then (owner, 2026-11-26): yes to the P4a exemption; the owner rereads the wording in PR #246; after the merge, the
Discord setup steps one at a time (app and bot, role and channel, Vercel settings, redeploy, Interactions URL, Register
commands). The X developer app waits: release 1 never posts.

Next (owner, 2026-11-25): release 1, the cards with posting off, on branch `x-posts`. `NEXT_x_posts.sql` goes to the
owner to test first; the setup steps come one at a time once the cards are ready to try.

## Principles

- **P1** (recipes; people know their words are public): pass. Post text is written by people or comes from a fixed
  template; no model writes it. Linked pages keep their recipes.
- **P2** (AI declared; the book never altered): pass if the templates keep "made with AI" / the model and maker, and
  book lines are quoted word for word.
- **P4** (no model output published without a person's action): pass. Three people approve every post.
- **P5** (nothing featured; picks labelled): concern, resolved by the owner (2026-11-25): no label in the post, since
  "Team pick" reads as a ranking; at most "Shared on X" on the work's page. Open tension: posting still shares some works
  and not others, which the site's own pages never do; nothing on the site ranks or orders by it.
- **P6** (no third-party requests from pages): pass. Discord and X are called only by the server.
- **P7** (payments never in ordering): pass. Suggestions follow publication order only.
- **P3, P8**: not touched.
