# X posts from Discord: plan

**DRAFT.** Written by an AI coding agent (Claude, made by Anthropic), 2026-11-25, for the owner's reread. No code yet.
Every wording below is this edition's own, a draft until the owner rereads it.

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
- **The proposer's approval is counted automatically** when they propose (recommended; question 1). The card starts at
  1 of 3.

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
  itself and says so on the card (recommended; question 5). This keeps the Privacy line in section 4 true without anyone
  having to remember.

### Site suggestions

- When something new is published that the team may want to share, the site posts a card **"Suggested by
  snowmoon.party"**. First events: a new published take, a new remix challenge entry.
- The suggestion's text comes from a fixed template (section 4), never from a model. No approval is counted for the
  site: it needs 3 people, one of them Nate, Garance or Luis.
- Edit and Withdraw on a suggestion (recommended; question 2): anyone on the team can Edit it, and becomes its proposer
  (their approval counts, the others reset); Nate, Garance and Luis can Withdraw it.
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
- **X, through its API**, posting as the Snowmoon account with that account's own access token (question 6).
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

**States**
- Withdrawn: "Withdrawn by {name}, {date}."
- Posted: "Posted on X, {date}: {link}. Approved by {names}." Button: "Delete from X"
- Deleted: "Deleted from X by {name}, {date}."
- Deleted on hide: "Deleted from X by snowmoon.party, {date}: the work it links to was hidden on the site."
- Failed: "X refused this post: {X's reason}. Nothing was posted." Button: "Try again" (anyone who approved it)
- No answer: "X didn't answer. Check @{account} before trying again." Button: "Try again"
- Budget: "Held: this month's X budget (${limit}) is used up. Nate, Garance or Luis can post it with Try again next
  month."

## 4. Wording for the reread: posts and legal lines

**Site suggestion templates** (the post itself, as it would go on X)

Names are written without `@`, so they never tag a stranger on X: a Farcaster or Lens name with its network, a Bluesky
handle as it is, a wallet shortened.

- A published take: "{character}'s line from chapter {n}, voiced by {name} on {network}, made with AI. Team pick on
  snowmoon.party: {link}"
- A challenge entry: "A new remix challenge entry: {character} by {name} on {network}, made with {model} ({maker}{,
  closed model}). Team pick on snowmoon.party: {link}"

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

**X developer app** (signed in to X as the Snowmoon account, the account that posts)
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

## 9. Questions for the owner

1. Does proposing count as the proposer's approval (recommended), or do they click Approve like everyone else?
2. Site suggestions: anyone on the team can Edit (and becomes the proposer), only Nate, Garance and Luis can Withdraw
   (recommended)?
3. Principle 5: a post of someone's work from the project's account is a kind of pick. Label it "Team pick" in the post
   (recommended), or another word?
4. $20 a month on the site, $25 in X's console, 10 a day (recommended)?
5. Delete from X automatically when the linked work is hidden (recommended), or only flag it on the card?
6. Is the X developer account signed in as the Snowmoon X account itself? If not, posting needs a one-time sign-in
   flow instead of the four values in section 6.

## Principles

- **P1** (recipes; people know their words are public): pass. Post text is written by people or comes from a fixed
  template; no model writes it. Linked pages keep their recipes.
- **P2** (AI declared; the book never altered): pass if the templates keep "made with AI" / the model and maker, and
  book lines are quoted word for word.
- **P4** (no model output published without a person's action): pass. Three people approve every post.
- **P5** (nothing featured; picks labelled): **tension.** Sharing a person's work from the project's account features
  it. Proposed: label it "Team pick" (question 3).
- **P6** (no third-party requests from pages): pass. Discord and X are called only by the server.
- **P7** (payments never in ordering): pass. Suggestions follow publication order only.
- **P3, P8**: not touched.
