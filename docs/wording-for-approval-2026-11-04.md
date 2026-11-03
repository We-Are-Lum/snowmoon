# Wording for approval: the remix challenge, 2026-11-04

DRAFT, written by the coding agent (Claude, a closed model by Anthropic), overnight 2026-11-03, for the owner's review.
Branch `wording-for-approval`, from `origin/main` at 17e2c63.

One list of every user-facing string on the remix challenge's path that is still drafted wording, with its exact text,
where it shows, and its source. Reply by number: "W3 ok", "W7 change to …".

**Left out:** legal texts (`src/lib/legal.ts`, `config/consent.json`: already reread) and the starting-sheet recipe
lines (`src/lib/images/recipe-lines.ts`, approved 2026-11-02).

**How to read it:**

- `{character}` is the character's call name (Zei, Bai, Gladias, Seila, Deluin, Mu); `{title}` a sheet's name;
  `{n}` a number; `{network}` Farcaster, Bluesky or Lens. Other braces are named where they appear.
- Every date is built from `CHALLENGE.dates` in `src/lib/config.ts`, never written in the copy. Each is shown here as
  it renders today, in **[brackets]**: `[6 to 22 November]`, `[Friday 6 November, 09:00 Pacific]`,
  `[Sunday 22 November, 23:59 Pacific]`, `[Friday 4 December]`. Numbers from the config are bracketed the same way:
  `[six]` characters, `[three]` entrants, `[0.7]` score.
- **States:** *signed out*; *signed in, passing* (invited, or a Neynar score of 0.7 or more); *below 0.7*; *before*
  the window (until Fri 6 Nov 09:00 Pacific), *in the window*, *after the close* (from Mon 23 Nov 00:00 Pacific).
  "Any" means every state.
- Lines marked **from launch-rehearsal** are on branch `origin/launch-rehearsal` (fixes R1–R9, 26462b3), not on main.
- **launch-fixes:** when this list was read (2026-11-03, 00:22 PST), branch `launch-fixes` was local only (not on
  GitHub), at the same commit as `launch-rehearsal` (26462b3), with no uncommitted changes. So it had no new strings
  yet. Its planned items are listed in section 9 with what shows today, so the owner can still choose the words.
  Anything it adds later is not in this list.

## 1. The challenge page, /challenge

Readable signed out. Every line shows in every state unless its state says otherwise.

**W1** · page title and tab title · any
> Remix the cast

`src/lib/challenge/wording.ts:17`; tab title `src/app/challenge/page.tsx:20`.

**W2** · link preview description (page metadata) · any
> The remix challenge on Snowmoon Party: draft rules.

`src/app/challenge/page.tsx:20` · Choice: drop "draft" when the rules are approved.

**W3** · the draft line, under the title · any
> Draft wording: drafted for the owner, not yet approved.

`src/lib/challenge/wording.ts:18`, shown at `src/app/challenge/page.tsx:49` · Remove when this list is approved;
check:ui checks this line is there, so it changes with it (rehearsal report, item 4).

**W4** · the date line, bold · before the window (followed by W5 in plain text)
> Entries open [Friday 6 November, 09:00 Pacific].

`src/lib/challenge/wording.ts:44`, `src/app/challenge/page.tsx:51` · launch-fixes plans "Entries open Fri 6 Nov,
09:00 PT" (short form, see W72): choose one form for every date line.

**W5** · the date line · in the window (bold), and before it (after W4)
> Entries close [Sunday 22 November, 23:59 Pacific].

`src/lib/challenge/wording.ts:43`, `src/app/challenge/page.tsx:51–52`.

**W6** · the date line, bold · after the close
> Entries closed [Sunday 22 November, 23:59 Pacific].

`src/lib/challenge/wording.ts:45`, `src/app/challenge/page.tsx:51`.

**W7** · the introduction · any
> From [6 to 22 November], make your own version of Zei, Bai, Gladias, Seila, Deluin or Mu on snowmoon.party: start
> from a published sheet, or from someone else’s remix, change it, and publish. Your version gets its own page,
> credited back to what you built on.

`src/lib/challenge/wording.ts:19–20` · The names come from `CHALLENGE.characters`, in the owner's order.

**W8** · "What happens next." (bold head, then the paragraph) · any
> **What happens next.** At the call on [Friday 4 December], Nate shows the versions he’s taking into Episode 1,
> built from your remixes and credited to you. AI models and a small jury divide the credit for each one among
> everything it was built on, and we publish how every model did it. We plan to mint each final version as an open
> edition, with what it raises split among everyone it was built on, including the We Are Lum team. Details come
> with the mint page.

`src/lib/challenge/wording.ts:21–23`.

**W9** · "The bounties." (bold head, then the paragraph) · any
> **The bounties.** There is one poidh bounty for each character, [six] in all, on Ethereum mainnet, each funded and
> judged by Nate. Each goes to the remix that most changes how we see that character while staying true to the
> book. To claim one, your version must be an entry for that character here; post its link as a claim on that
> character’s bounty. Claiming needs a little ETH on mainnet for gas. A bounty can pay out even if its character has
> fewer than [three] entrants; if no claim fits, Nate cancels it.

`src/lib/challenge/wording.ts:24–26` · Once `CHALLENGE.bountyAmount` is set, "judged by Nate" becomes "judged by
Nate, {amount} each". Neither the amount nor the six bounty addresses are set yet (rehearsal report, item 5).

**W10** · the rules' head · any
> **The rules.**

`src/lib/challenge/wording.ts:30`.

**W11** · rule 1 · any
> Make your remix on snowmoon.party with the site’s tools. Every recipe is published.

`src/lib/challenge/wording.ts:32`.

**W12** · rule 2 · any
> Only remixes count: start from a published sheet or someone else’s remix. A new sheet made from scratch isn’t an
> entry.

`src/lib/challenge/wording.ts:33`.

**W13** · rule 3 · any
> One entry per person per character. Your latest version counts unless you mark another.

`src/lib/challenge/wording.ts:34`.

**W14** · rule 4 · any
> To count as an entry, sign in with a Farcaster account that passes the site’s check. It’s checked once, when you
> publish.

`src/lib/challenge/wording.ts:35` · Open: the rehearsal found it reads as if a failing account could still remix
(it can't make a single view), and the score is in fact first looked up at Generate (item 3 and its legal note).
launch-fixes plans to reword it (W71).

**W15** · rule 5 · any
> Each character needs at least [three] different people with an entry. A character with fewer gets no final
> version, credit test or mint.

`src/lib/challenge/wording.ts:36`.

**W16** · rule 6 · any
> Entering is free. Minting isn’t needed for anything.

`src/lib/challenge/wording.ts:37`.

**W17** · rule 7 · any
> Post your version anywhere with its link. If you’re remixing someone’s post, quote or reply to it.

`src/lib/challenge/wording.ts:38`.

**W18** · rule 8 · any
> An account passes the site’s check with a Neynar score of at least [0.7], fixed for the whole challenge.

`src/lib/challenge/wording.ts:39`.

**W19** · the last rule (admins) · any
> Admins (the site’s owner and @garance) can make versions too, but aren’t eligible for rewards.

`src/lib/challenge/wording.ts:41`, shown at `src/app/challenge/page.tsx:69`.

**W20** · under the rules · any
> An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.

`src/lib/challenge/wording.ts:42`.

**W21** · each character's count, under its name · any (while `CHALLENGE.entries` is on, as committed)
> {n} person has entered · {k} more needed for a final version

with "{n} people have entered" for any other number, and "enough for a final version" once {n} reaches [three].
Example with none: "0 people have entered · 3 more needed for a final version".

`src/lib/challenge/wording.ts:53–54`, `src/app/challenge/page.tsx:79`.

**W22** · each character's bounty line · any
> The bounty for {character}: the remix that most changes how we see {character} while staying true to the book.

`src/lib/challenge/wording.ts:28`, `src/app/challenge/page.tsx:84`.

**W23** · the bounty link, after W22 · only once that character's poidh address is set
> {character}’s bounty on poidh →

`src/lib/challenge/wording.ts:29`, `src/app/challenge/page.tsx:89`.

**W24** · link to the character's book page · any
> What the book says about {character} →

`src/lib/challenge/wording.ts:48`, `src/app/challenge/page.tsx:95`.

**W25** · label over the starting sheets · any
> Sheets to start from

`src/lib/challenge/wording.ts:46`.

**W26** · when a character has no published sheet · any
> No sheet of {character} is published yet.

`src/lib/challenge/wording.ts:47`.

**W27** · the entries list's head · any
> Entries so far

`src/lib/challenge/wording.ts:49`.

**W28** · under W27 · when there are entries
> Newest first.

`src/lib/challenge/wording.ts:50`.

**W29** · under W27 · no entries yet
> No entries yet.

`src/lib/challenge/wording.ts:51`.

**W30** · under W27 · only if `CHALLENGE.entries` is turned off (it is on, as committed)
> Entries will be listed here once the challenge starts.

`src/lib/challenge/wording.ts:52`.

**W31** · the badge on an entry's row (and on its page, W36) · any
> Entry

`src/lib/challenge/wording.ts:56`.

**W32** · an entry's row title, after W31 · any · **from launch-rehearsal (R4; may still change)**
> {character}: {title}

or "{character}" alone when the sheet has no name. On main today an untitled entry reads "{character}: {character}"
("Bai: Bai"). Each row's line under it is "{byline} · v{n}".

launch-rehearsal `src/lib/challenge/wording.ts:58`, `src/app/challenge/page.tsx:147`.

**W33** · head over admins' versions · when an admin has made one
> Made by admins (not eligible for rewards)

`src/lib/challenge/wording.ts:55`. Each row is "{character}: {title} · {byline} · v{n}" (R4 applies here too,
`src/app/challenge/page.tsx:173` on launch-rehearsal).

**W34** · picture descriptions, read aloud and served beside each thumbnail (not visible) · any
> AI-generated front view of {full name}, not by the author

and in the entries list "AI-generated front view, not by the author".

`src/app/challenge/page.tsx:105` and `:141`.

## 2. A character's sheet or version page, /references/designs/{id}

The challenge lines show only on Zei's, Bai's, Gladias's, Seila's, Deluin's and Mu's sheets.

**W35** · the starting sheets' line, under the title · any · **from launch-rehearsal (R1; may still change)**
> The project’s starting sheet. Its text was drafted by the coding agent, a closed model.

launch-rehearsal `src/lib/images/wording.ts:112`, `src/app/references/designs/[id]/page.tsx:101`. On main a starting
sheet says "The project’s starting style. Its text was drafted by the coding agent, a closed model."
(`src/lib/images/wording.ts:110`).

**W36** · on a version that is its maker's entry · any
> Entry This is its maker’s entry for {character} in the remix challenge. Remix the cast →

`src/lib/challenge/wording.ts:56–57`, `src/app/references/designs/[id]/page.tsx:103` ("Entry" is the badge, W31;
"Remix the cast →" links to /challenge).

**W37** · on a sheet that isn't an entry · in the window · **from launch-rehearsal (R5; may still change)**
> {character} is in the remix challenge: fork this sheet, change it and publish to enter. Remix the cast →

launch-rehearsal `src/lib/challenge/wording.ts:61`, `src/app/references/designs/[id]/page.tsx:120` · Says "fork"; see
W69 if the button becomes "Remix".

**W38** · on a version made in the window that isn't its maker's entry (a "candidate") · in the window
> Made during the remix challenge. Its maker’s latest version counts unless they mark another.

`src/lib/challenge/wording.ts:58`, `src/app/references/designs/[id]/page.tsx:108`.

**W39** · a candidate, after the close · **from launch-rehearsal (R9; may still change)**
> Made during the remix challenge. Entries are closed: its maker’s entry for {character} is another version.

launch-rehearsal `src/lib/challenge/wording.ts:64`, `src/app/references/designs/[id]/page.tsx:115`. On main, W38 and
the W40 button still show after the close.

**W40** · the button under W38 · its maker only, signed in, in the window
> Mark as my entry

`src/lib/challenge/wording.ts:60`, `src/components/challenge-mark.tsx:20`. On launch-rehearsal (R6) the button goes
once marked.

**W41** · after W40 · marked
> Marked as your entry.

`src/lib/challenge/wording.ts:61`.

**W42** · after W40 · refused (from the server)
> Entries aren’t open yet. · Entries are closed. · You can mark only your own version, made during the challenge. ·
> Marking another version isn’t available yet. Your latest version counts. · Sign in with Farcaster to mark your
> entry · Could not mark it

`src/lib/challenge/entries.ts:144–147`; `src/app/api/challenge/mark/route.ts:14`; fallback
`src/components/challenge-mark.tsx:15`. (Also "Not set up on this deployment" and "Bad request", which only a broken
deployment or request shows.)

**W43** · on a version an admin made in the window · any
> Made by an admin during the remix challenge: admins aren’t eligible for rewards.

`src/lib/challenge/wording.ts:59`, `src/app/references/designs/[id]/page.tsx:112`.

**W44** · the bar's buttons · signed in (in the window, anyone signed in on a challenge sheet; otherwise invited
readers); "New version" on your own sheet only
> Fork · New version

`src/lib/images/wording.ts:130–131`, `src/components/design-bar.tsx:32` and `:37` · Open: "Fork" vs "Remix"
(rehearsal item 15). launch-fixes plans a "Remix" button (W69).

**W45** · the page's draft line, at the foot · any
> Draft wording

`src/lib/images/wording.ts:12`, `src/app/references/designs/[id]/page.tsx:209` · Covers the whole page, including
the image wording that predates the challenge.

## 3. The fork form, /references/designs/new?from={id}

The form for forking a challenge character's sheet. Its title is **"Fork"** (`src/lib/images/wording.ts:145`,
`src/app/references/designs/new/page.tsx:40`), or "New version" (`:146`) for a new version of your own sheet.

**W46** · the credit band, at the top · any
> Remixed from {source title} v{n} · {source byline}
>
> Shown on yours for good. It credits {source byline}.

`src/lib/images/wording.ts:147–148`, `src/components/design-form.tsx:185` and `:187`. The first line is repeated in
the preview (`:312`).

**W47** · the sign-in gate · signed out, on a challenge sheet in the window · **from launch-rehearsal (R2; may still
change)**
> Sign in with Farcaster to remix this sheet. During the remix challenge, anyone whose account passes the site’s check
> can fork it.

launch-rehearsal `src/lib/images/wording.ts:185`, `src/components/design-form.tsx:196`. On main every signed-out
visitor reads "Sign in to make a style or a sheet. For now, making them is open to invited readers only."
(`src/lib/images/wording.ts:181`, `src/components/design-form.tsx:195`).

**W48** · the gate · signed in but not invited, outside the window (also the server's refusal after the close)
> Making styles and character sheets is open to invited readers only, for now. Anyone signed in can browse them and
> use them in their pictures.

`src/lib/images/wording.ts:185`, `src/components/design-form.tsx:201`; sent by `src/app/api/designs/sample/route.ts:38`
and `src/app/api/designs/route.ts:68` · Open: after the close a challenge entrant reads "invited readers only" with
no word that the challenge ended.

**W49** · the consent gate · signed in, before the first agreement
> Before your first style or sheet: how your words are published.
>
> [button] Read and agree

`src/lib/images/wording.ts:187–188`, `src/components/design-form.tsx:206` and `:208`. Then the consent screen
(section 4).

**W50** · the form's fields and notes · signed in, agreed
> Name (optional)
>
> Sheet text · added when {character} is in a prompt
>
> Shaded words are yours; the rest is unchanged from v{n}.  *(once the text differs from the source)*
>
> Your text is sent to Groq to be checked (through Vercel AI Gateway when Groq is busy) and to fal.ai to make the
> pictures. It becomes public only if you publish.

`src/lib/images/wording.ts:150`, `:152`, `:159`, `:160`; `src/components/design-form.tsx:214`, `:217`, `:227`, `:230`.
Each box also shows the publication line from `config/consent.json` (legal, left out).

**W51** · the style choice · signed in, agreed
> Style for the views
>
> Each view is made in the style you choose: its text goes into the prompt before your sheet text. Your sheet shows
> which style its views used.
>
> No styles are published yet. Publish a style first.  *(only when none is published)*
>
> Choose a style first.  *(while none is chosen; on launch-rehearsal, R8, the source's style starts chosen)*
>
> The style changed since these views were made. Make them again.  *(after changing style)*

`src/lib/images/wording.ts:154–158`; `src/components/design-form.tsx:234`, `:260`, `:257`, `:283`, `:282`.

**W52** · the views · signed in, agreed
> Views · front, side, back
>
> [each view's button] + Generate · Make again · Making it…
>
> Published views can be used by other readers as reference pictures for their images.
>
> The text changed since these were made. Make them again with this text.  *(after an edit)*
>
> Each one uses a generation · {n} left today
>
> Each picture’s prompt is its line above, then your text, then “No text, no lettering, no signs with words.”
>
> {model} · open weights, {licence} · runs on {host}
> Side and back are made from the front view: {edit model} · open weights, {licence} · runs on {host}
>
> Make the front view first.  *(under Publish, until the front view is made)*

`src/lib/images/wording.ts:162`, `:164–168`, `:170`, `:173`, `:179`, `:169`; `src/components/design-form.tsx:265`,
`:168`, `:280`, `:281`, `:284`, `:285`, `:286–291`, `:329`; the suffix is `IMAGES.suffix`, `src/lib/config.ts:491`.

**W53** · the three view lines, each beside its view (also part of every view's prompt) · signed in, agreed
> front: Character reference picture: one person, full body, standing, seen from the front, plain light grey
> background.
>
> side: The same person as in the reference picture, full body, standing, seen from the side, plain light grey
> background. Keep the face, hair and clothes the same.
>
> back: The same person as in the reference picture, full body, standing, seen from behind, plain light grey
> background. Keep the hair and clothes the same.

`src/lib/images/design-rules.ts:22–25`, shown at `src/components/design-form.tsx:275` · Model-drafted prompt lines,
not the recipe lines approved 2026-11-02. Changing them changes every new view's prompt.

**W54** · the rules box · signed in, agreed
> The rules
>
> Don’t base a character on a real person. Don’t contradict what the book says. Describe how they look early in the
> book; nothing that happens later. No real people. No sexual content. Nothing violent or hateful. No characters or
> logos from other works. Don’t ask for words in the picture.

`src/lib/images/wording.ts:17` and `:172`; `src/lib/images/rules.ts:32`; `src/components/design-form.tsx:298–299`.

**W55** · Generate refused · below 0.7 (at the first Generate of the day)
> Image making is open to Farcaster accounts with a Neynar score of [0.7] or more, to keep out spam accounts. Yours is
> {score}. Reading, listening, saving cards and everything else still work.

and, when Neynar can't be reached:
> Image making can’t check your account right now (Neynar, which scores Farcaster accounts, can’t be reached). Try
> again later. Reading, listening, saving cards and everything else still work.

`src/lib/images/gate.ts:28–31`, shown at `src/components/design-form.tsx:101` (under the rules) · Open: the
rehearsal found it shows below the screen, so the tap seems to do nothing (item 2, options a/b). launch-fixes plans
a shorter line before Generate (W70).

**W56** · the form's other messages · signed in
> Published. See it  *(after Publish)*
>
> Could not make the picture · No connection. Try again. · Could not record your agreement · Could not publish ·
> Sign in with Farcaster to make a picture · Making styles and sheets isn’t set up on this deployment yet.

`src/lib/images/wording.ts:177–178`, `:186`; `src/components/design-form.tsx:177`, `:101`, `:103`, `:141`, `:128`,
`:203`; `src/app/api/designs/sample/route.ts:32` · Open: "Published. See it" doesn't say "This is your entry for
{character}" (rehearsal item 14). launch-fixes plans that line (W73).

The form's foot shows the same **"Draft wording"** line as W45 (`src/components/design-form.tsx:338`).

## 4. The consent screen, before a first Generate or publish

The title and paragraphs come from `config/consent.json` (own-words-v4) and are left out as legal text. The screen's
own lines, from `src/components/publish-words.tsx`:

**W57** · under the consent text · signed in
> Your words will be shown as @{username}.

or, for a wallet account, "Your words will be shown with your address, {address}.", or, when the name isn't known,
"Your words will be shown with your name (Farcaster name or wallet address)."

`src/components/publish-words.tsx:59`.

**W58** · the buttons and the version label · signed in
> Not now · I agree
>
> Wording {version}  *(e.g. "Wording own-words-v4")*

`src/components/publish-words.tsx:63`, `:66`, `:69`.

## 5. Preview and publish (the fork form's foot)

**W59** · the publish flow · signed in, agreed
> [button] Preview
>
> Preview: this is how it will appear, to anyone
>
> Sheet by @{username}  *(the preview's title when the sheet has no name; "Sheet by you" without a username)*
>
> Front, side, back · Views made in the style {style} · Sheet text · added when {character} is in a prompt
>
> [buttons] Publish · Edit
>
> Sign in with Farcaster to publish · Could not check your agreement · Could not record your agreement · Could not
> publish  *(errors)*

`src/components/publish-words.tsx:131`, `:137`, `:144`, `:147`, `:91`, `:92`, `:113`, `:122`;
`src/lib/images/wording.ts:135`, `:112`, `:115`, `:118`; `src/components/design-form.tsx:311`, `:320–323` · These are
site-wide publish lines, not challenge-only; listed because entrants pass through them. The publication line after
"Preview" is the consent wording's (legal, left out).

## 6. Share this version (every sheet and style page)

**W60** · the share section · any
> Share this version
>
> [buttons] Farcaster · Bluesky · Lens

Each button's spoken label is "Post on {network}".

`src/lib/challenge/wording.ts:63–64`; `src/components/challenge-share.tsx:60`, `:65–76`.

**W61** · the share text, prefilled in each network's compose box (followed by the page's link) · any
> {character}: {title}, made on Snowmoon Party

On a sheet with no name, {title} is "Sheet by {byline}", so "Bai: Sheet by @rehearsal-di, made on Snowmoon Party". On
a style, "{style title}, made on Snowmoon Party".

`src/lib/challenge/wording.ts:65`; built at `src/app/references/designs/[id]/page.tsx:207` and
`src/components/challenge-share.tsx:29` · Open: doesn't name the challenge or the bounty (rehearsal item 16).
launch-fixes plans a challenge share text (W74).

**W62** · under the buttons · any
> If you’re remixing someone’s post, quote or reply to it on the same network. Always include your version’s link.

`src/lib/challenge/wording.ts:66`, `src/components/challenge-share.tsx:79`.

## 7. Add where you posted it (under Share)

**W63** · the box · signed in (Farcaster or wallet), while `CHALLENGE.posts` is on (it is, as committed)
> Add where you posted it
>
> Your post’s address (Farcaster, Bluesky or Lens)
>
> [placeholder] https://…
>
> [button] Add

`src/lib/challenge/wording.ts:67–69`; `src/components/challenge-share.tsx:88–91`;
`src/components/post-link-field.tsx:15`.

**W64** · the post-link box line, under the box · signed in
> Sent to us. We read the post from its network’s own service, never from this address. Shown on this page with the
> network, the writer’s handle and the date, as a link.

`src/components/post-link-field.tsx:17` (marked DRAFT wording in the file's comment).

**W65** · after Add · added, or already there
> Added. · Already listed.

`src/lib/challenge/wording.ts:70–71`. In the Farcaster app, a cast made with the Farcaster button is added the same
way and shows the same line.

**W66** · after Add · refused (from the server)
> Paste the address of your post (it starts with https://).
>
> That isn’t a post on Farcaster (farcaster.xyz), Bluesky (bsky.app) or Lens (hey.xyz).
>
> That address isn’t a single post. Open the post itself and copy its address.
>
> We couldn’t find that post on its network. Check the address, or try again in a minute.
>
> That network didn’t answer just now. Try again in a minute.
>
> That post can’t be listed here: Bluesky marks it, or its account, as not for showing on other sites.
>
> That post doesn’t link to this version’s page. Add the page’s link to your post, then add it here.
>
> Adding where you posted it isn’t open yet. · Adding where you posted it isn’t available yet.
>
> You can add [20] posts a day. More tomorrow (00:00 UTC).
>
> Sign in to add where you posted it · No such version · Could not add it

`src/lib/challenge/post-links.ts:55–57`; `src/lib/challenge/posts.ts:21–27`;
`src/app/api/challenge/posts/route.ts:33`, `:44`; fallback `src/components/challenge-share.tsx:41`.

## 8. Posted on (a version's page, once a post is listed)

**W67** · the list · any
> Posted on
>
> {network} · @{handle} · {YYYY-MM-DD} · See it on {network}
>
> Posts that link to this page, newest first, as their writers or the people who added them listed them. Shown as
> links only.

`src/lib/challenge/wording.ts:72–74`; `src/components/posted-on.tsx:43`, `:49–51`, `:62`.

**W68** · on a post you added (or any, for a moderator) · signed in
> [button] Remove
>
> Only the person who added it, or a moderator, can remove it  *(refused)* · Sign in first

`src/lib/challenge/wording.ts:75`, `src/components/posted-on.tsx:56`; `src/app/api/challenge/posts/route.ts:69`, `:57`.

## 9. launch-fixes: planned, not yet written (as read 2026-11-03, 00:22 PST)

**From launch-fixes (may still change).** None of these was on the branch yet. Each shows what is on main today, so
the owner can approve the idea and the words together, or wait for the branch's own words.

**W69** · the "Remix" button · the sheet page's bar (W44) and the fork form's title
> Today: Fork

Planned: "Remix". Choice: also the form's title, and "fork" in W37 and W47.

**W70** · the below-0.7 line · fork form, before Generate · below 0.7
> Entering needs a Farcaster account with a Neynar score of 0.7 or more; we check when you press Generate.

The words as the task gave them; the score should come from `CHALLENGE.neynarMinScore`, like W18.

**W71** · the reworded rule · /challenge (replaces W14)
> Today: To count as an entry, sign in with a Farcaster account that passes the site’s check. It’s checked once,
> when you publish.

**W72** · the opening date line · /challenge, before the window (replaces W4)
> Entries open Fri 6 Nov, 09:00 PT

Built from config. Choice: this short form or W4's long form ("Friday 6 November, 09:00 Pacific"), and the same for
W5 and W6.

**W73** · after Publish · fork form, a challenge character's fork, in the window
> This is your entry for {character}

Today: "Published. See it" (W56).

**W74** · the challenge share text · Share (replaces W61 on a challenge character's version)
> Today: {character}: {title}, made on Snowmoon Party

**W75** · the "unchecked" notice · a version whose maker's check couldn't run at publish (`why: 'unchecked'` in
`src/lib/challenge/rules.ts:70`)
> Today: nothing is shown; the version just isn't counted.

**W76** · the home page and the menu's link to /challenge · any
> Today: none (the rehearsal's item 1). The menu order is the owner's (2026-10-29).

**W77** · R1–R9's wording · as on launch-rehearsal: W32 (R4), W35 (R1), W37 (R5), W39 (R9), W47 (R2). R3, R6, R7 and
R8 change no words.

## 10. About: naming Bluesky and Lens for "Posted on"

**Why.** Privacy §7 names Bluesky and Lens: "Bluesky and Lens receive the details of a post someone adds to a
version's page … so our server can read the post and check it links there." (`src/lib/legal.ts:198`). About names
neither. Branch `social-read` adds Bluesky to the services check:principles compares
(`['Bluesky', /\bBluesky\b/g]` in `SERVICES`, `scripts/check-principles.ts`), so P6h will fail with "the Privacy
page names Bluesky; About does not" once it merges.

**What the checks compare** (`scripts/check-principles.ts:1557–1665` on main):

- The vocabulary is `SERVICES`: a list of names, each with a pattern (Vercel AI Gateway, Vercel, Cloudflare, Supabase,
  Groq, fal.ai, Farcaster's services, Neynar, GitHub, ntfy, Spotify; social-read adds Bluesky). A service not on it
  (Lens, X, hey.xyz, Base) is not compared.
- About is read as served: the text of `.page` on /about, every tag's text with spaces between.
- **P6g:** every service About names must be named on the Privacy page.
- **P6h:** About and the Privacy page must name the same set, both ways.
- **P6i** compares only the assistant's notice with Privacy §5 and §7's assistant lines; About doesn't enter it.

**Where it goes.** About's "Where it runs" paragraph (`src/app/about/page.tsx:117–123`, heading `id="services"`),
which lists the outside services the Privacy Policy names that aren't named higher up. Insert it after the ntfy
sentence ("…carries no content and nothing about you.") and before "Every outside service, and what each receives,
is in the Privacy Policy".

**The proposed line (one exact sentence):**

> When someone adds a post to a version’s page, our server asks Bluesky or Lens for that post, sending only its
> details, to check that it links there; it sends nothing about you, and your browser never contacts them for this.

**Optional second sentence**, to match Privacy §7's share-link line ("A 'report' or 'share' link may open GitHub,
Farcaster, X, Bluesky or Lens (through hey.xyz)…"): change About's "A report link for the narration opens GitHub or
Farcaster, where what you post is public." to

> A report or share link opens GitHub, Farcaster, X, Bluesky or Lens, where what you post is public.

**Would P6h pass?** Yes, by reading the code:

- With the line in, About's text matches `/\bBluesky\b/`, so About's set gains Bluesky. The Privacy page's set has it
  already (§7, two places). So once social-read puts Bluesky on the list, both sets hold it and P6h finds no
  difference on Bluesky.
- The line names no other service on the list: "Lens" has no pattern, and the line doesn't say Farcaster, Vercel or
  any other listed name, so P6h and P6g gain no new difference.
- On main today, Bluesky isn't on the list, so the line changes nothing for P6g or P6h there: it can merge before or
  with social-read.
- social-read's own About paragraph (on "Posts that link here") names Bluesky only while `SOCIAL_READ.show` is on.
  Privacy on main names Bluesky for "Posted on" whatever that switch says, so without this line P6h fails whenever
  social-read is merged with the switch off. This line is always shown, so P6h passes either way.
- The optional second sentence keeps "GitHub" and "Farcaster" (already in both sets) and adds X and Lens (not on the
  list), so it changes nothing either.
- Not run: check:principles was not run against any deployment for this; only the code was read.

**Describes today?** Yes: "Add where you posted it" and its Bluesky and Lens lookups are on main and on
(`CHALLENGE.posts` is on), and Privacy §7 already says so. About is not a legal text, but the same rule holds.

## Count

77 numbered items (W1–W77): 63 on main, 5 from launch-rehearsal (R1, R2, R4, R5, R9), and 9 in section 9 (launch-fixes's planned items: 8 strings not yet written, plus W77 pointing at the rehearsal items). Several items hold a few short lines of one screen state (buttons, errors). Plus section 10's proposed About line and its optional second sentence.
