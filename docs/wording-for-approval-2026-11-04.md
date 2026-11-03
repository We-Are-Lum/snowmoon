# Wording for approval: the remix challenge, 2026-11-04

DRAFT, written by the coding agent (Claude, a closed model by Anthropic), overnight 2026-11-03, for the owner's review.
Branch `wording-for-approval`. **Version 2:** refreshed against `origin/main` at 645cba1 (PR #99, `launch-fixes`,
merged). Version 1 was 12d9d88, read against 17e2c63.

One list of every user-facing string on the remix challenge's path that is still drafted wording, with its exact text,
where it shows, and its source. Reply by number: "W3 ok", "W7 change to …".

**Left out:** legal texts (`src/lib/legal.ts`, `config/consent.json`: already reread) and the starting-sheet recipe
lines (`src/lib/images/recipe-lines.ts`, approved 2026-11-02).

**How to read it:**

- `{character}` is the character's call name (Zei, Bai, Gladias, Seila, Deluin, Mu); `{title}` a sheet's name;
  `{n}` a number; `{network}` Farcaster, Bluesky or Lens. Other braces are named where they appear.
- Every date is built from `CHALLENGE.dates` in `src/lib/config.ts`, never written in the copy. Each is shown here as
  it renders today, in **[brackets]**: `[6 to 22 November]`, `[Friday 6 November, 09:00 Pacific]`,
  `[Sunday 22 November, 23:59 Pacific]`, `[Friday 4 December]`, and the short form `[Fri 6 Nov, 09:00 PT]`. Numbers
  from the config are bracketed the same way: `[six]` characters, `[three]` entrants, `[0.7]` score.
- **States:** *signed out*; *signed in, passing* (invited, or a Neynar score of 0.7 or more); *below 0.7*; *before*
  the window (until Fri 6 Nov 09:00 Pacific), *in the window*, *after the close* (from Mon 23 Nov 00:00 Pacific).
  "Any" means every state.
- **CHANGED since v1** marks an item whose text (or where it shows) differs from 12d9d88. **NOW ON MAIN** marks an
  item that v1 listed from `launch-rehearsal` and that #99 merged.
- **Not on main** marks the lines from branch `origin/challenge-three-bases` (unmerged, 005d178): W81 and W82.
- W numbers are the same as v1. The items v1 listed as "planned" (W69–W76) now hold #99's merged strings; W78–W82 are
  new.

## 1. The challenge page, /challenge

Readable signed out. Every line shows in every state unless its state says otherwise.

**W1** · page title, tab title, and the menu's and home page's link name (W76) · any
> Remix the cast

`src/lib/challenge/wording.ts:17`; tab title `src/app/challenge/page.tsx:20`.

**W2** · link preview description (page metadata) · any
> The remix challenge on Snowmoon Party: draft rules.

`src/app/challenge/page.tsx:20` · Choice: drop "draft" when the rules are approved.

**W3** · the draft line, under the title · any
> Draft wording: drafted for the owner, not yet approved.

`src/lib/challenge/wording.ts:18`, shown at `src/app/challenge/page.tsx:49` · Remove when this list is approved;
check:ui checks this line is there, so it changes with it.

**W4** · the date line, bold · before the window (followed by W5 in plain text)
> Entries open [Friday 6 November, 09:00 Pacific].

`src/lib/challenge/wording.ts:54`, `src/app/challenge/page.tsx:51` · Choice: #99 kept this long form here, but the
refusal to mark before the open uses the short form "Entries open [Fri 6 Nov, 09:00 PT]." (W72). One form everywhere,
or both?

**W5** · the date line · in the window (bold), and before it (after W4)
> Entries close [Sunday 22 November, 23:59 Pacific].

`src/lib/challenge/wording.ts:53`, `src/app/challenge/page.tsx:51–52`.

**W6** · the date line, bold · after the close
> Entries closed [Sunday 22 November, 23:59 Pacific].

`src/lib/challenge/wording.ts:55`, `src/app/challenge/page.tsx:51`.

**W7** · the introduction · any
> From [6 to 22 November], make your own version of Zei, Bai, Gladias, Seila, Deluin or Mu on snowmoon.party: start
> from a published sheet, or from someone else’s remix, change it, and publish. Your version gets its own page,
> credited back to what you built on.

`src/lib/challenge/wording.ts:28–29` · The names come from `CHALLENGE.characters`, in the owner's order. "start from
a published sheet" may need to match the three-bases rule (W81) if that branch merges.

**W8** · "What happens next." (bold head, then the paragraph) · any
> **What happens next.** At the call on [Friday 4 December], Nate shows the versions he’s taking into Episode 1,
> built from your remixes and credited to you. AI models and a small jury divide the credit for each one among
> everything it was built on, and we publish how every model did it. We plan to mint each final version as an open
> edition, with what it raises split among everyone it was built on, including the We Are Lum team. Details come
> with the mint page.

`src/lib/challenge/wording.ts:30–32`.

**W9** · "The bounties." (bold head, then the paragraph) · any
> **The bounties.** There is one poidh bounty for each character, [six] in all, on Ethereum mainnet, each funded and
> judged by Nate. Each goes to the remix that most changes how we see that character while staying true to the
> book. To claim one, your version must be an entry for that character here; post its link as a claim on that
> character’s bounty. Claiming needs a little ETH on mainnet for gas. A bounty can pay out even if its character has
> fewer than [three] entrants; if no claim fits, Nate cancels it.

`src/lib/challenge/wording.ts:33–35` · Once `CHALLENGE.bountyAmount` is set, "judged by Nate" becomes "judged by
Nate, {amount} each". Neither the amount nor the six bounty addresses are set yet.

**W10** · the rules' head · any
> **The rules.**

`src/lib/challenge/wording.ts:39`.

**W11** · rule 1 · any
> Make your remix on snowmoon.party with the site’s tools. Every recipe is published.

`src/lib/challenge/wording.ts:41`.

**W12** · rule 2 · any
> Only remixes count: start from a published sheet or someone else’s remix. A new sheet made from scratch isn’t an
> entry.

`src/lib/challenge/wording.ts:42` · Branch `challenge-three-bases` (not on main) replaces it with W81.

**W13** · rule 3 · any
> One entry per person per character. Your latest version counts unless you mark another.

`src/lib/challenge/wording.ts:43`.

**W14** · rule 4 · any · **CHANGED since v1** (the reworded rule; also W71)
> To remix at all, sign in with a Farcaster account that passes the site’s check. An account below it can’t make the
> pictures, so it can’t remix or enter. It’s checked when you press Generate, and again when you publish.

`src/lib/challenge/wording.ts:45`. v1: "To count as an entry, sign in with a Farcaster account that passes the site’s
check. It’s checked once, when you publish."

**W15** · rule 5 · any
> Each character needs at least [three] different people with an entry. A character with fewer gets no final
> version, credit test or mint.

`src/lib/challenge/wording.ts:46`.

**W16** · rule 6 · any
> Entering is free. Minting isn’t needed for anything.

`src/lib/challenge/wording.ts:47`.

**W17** · rule 7 · any
> Post your version anywhere with its link. If you’re remixing someone’s post, quote or reply to it.

`src/lib/challenge/wording.ts:48`.

**W18** · rule 8 · any
> An account passes the site’s check with a Neynar score of at least [0.7], fixed for the whole challenge.

`src/lib/challenge/wording.ts:49` · Choice: W70 now says the score above the rules too; one of the two could go.

**W19** · the last rule (admins) · any
> Admins (the site’s owner and @garance) can make versions too, but aren’t eligible for rewards.

`src/lib/challenge/wording.ts:51`, shown at `src/app/challenge/page.tsx:71`.

**W20** · under the rules · any
> An independent adaptation of Snowmoon by Vitalik Buterin (GPL-3.0), not affiliated with him.

`src/lib/challenge/wording.ts:52`.

**W21** · each character's count, under its name · any (while `CHALLENGE.entries` is on, as committed)
> {n} person has entered · {k} more needed for a final version

with "{n} people have entered" for any other number, and "enough for a final version" once {n} reaches [three].
Example with none: "0 people have entered · 3 more needed for a final version".

`src/lib/challenge/wording.ts:63–64`, `src/app/challenge/page.tsx:81`.

**W22** · each character's bounty line · any
> The bounty for {character}: the remix that most changes how we see {character} while staying true to the book.

`src/lib/challenge/wording.ts:37`, `src/app/challenge/page.tsx:86`.

**W23** · the bounty link, after W22 · only once that character's poidh address is set
> {character}’s bounty on poidh →

`src/lib/challenge/wording.ts:38`, `src/app/challenge/page.tsx:91`.

**W24** · link to the character's book page · any
> What the book says about {character} →

`src/lib/challenge/wording.ts:58`, `src/app/challenge/page.tsx:97`.

**W25** · label over the starting sheets · any
> Sheets to start from

`src/lib/challenge/wording.ts:56`, `src/app/challenge/page.tsx:99` · Branch `challenge-three-bases` shows W82 instead
once a character's bases are picked.

**W26** · when a character has no published sheet · any
> No sheet of {character} is published yet.

`src/lib/challenge/wording.ts:57`, `src/app/challenge/page.tsx:125`.

**W27** · the entries list's head · any
> Entries so far

`src/lib/challenge/wording.ts:59`.

**W28** · under W27 · when there are entries
> Newest first.

`src/lib/challenge/wording.ts:60`.

**W29** · under W27 · no entries yet
> No entries yet.

`src/lib/challenge/wording.ts:61`.

**W30** · under W27 · only if `CHALLENGE.entries` is turned off (it is on, as committed)
> Entries will be listed here once the challenge starts.

`src/lib/challenge/wording.ts:62`.

**W31** · the badge on an entry's row (and on its page, W36) · any
> Entry

`src/lib/challenge/wording.ts:66`.

**W32** · an entry's row title, after W31 · any · **NOW ON MAIN** (R4; words unchanged)
> {character}: {title}

or "{character}" alone when the sheet has no name. Each row's line under it is "{byline} · v{n}".

`src/lib/challenge/wording.ts:68`, `src/app/challenge/page.tsx:149`.

**W33** · head over admins' versions · when an admin has made one
> Made by admins (not eligible for rewards)

`src/lib/challenge/wording.ts:65`. Each row is "{character}: {title} · {byline} · v{n}", or "{character} · …" when
untitled (`src/app/challenge/page.tsx:175`).

**W34** · picture descriptions, read aloud and served beside each thumbnail (not visible) · any
> AI-generated front view of {full name}, not by the author

and in the entries list "AI-generated front view, not by the author".

`src/app/challenge/page.tsx:107` and `:143`.

## 2. A character's sheet or version page, /references/designs/{id}

The challenge lines show only on Zei's, Bai's, Gladias's, Seila's, Deluin's and Mu's sheets.

**W35** · the starting sheets' line, under the title · any · **NOW ON MAIN** (R1; words unchanged)
> The project’s starting sheet. Its text was drafted by the coding agent, a closed model.

`src/lib/images/wording.ts:112`, `src/app/references/designs/[id]/page.tsx:101`.

**W36** · on a version that is its maker's entry · any
> Entry This is its maker’s entry for {character} in the remix challenge. Remix the cast →

`src/lib/challenge/wording.ts:66` and `:69`, `src/app/references/designs/[id]/page.tsx:104` ("Entry" is the badge,
W31; "Remix the cast →" links to /challenge).

**W37** · on a sheet that isn't an entry · in the window · **CHANGED since v1** ("fork" became "remix"), **NOW ON
MAIN** (R5)
> {character} is in the remix challenge: remix this sheet, change it and publish to enter. Remix the cast →

`src/lib/challenge/wording.ts:71`, `src/app/references/designs/[id]/page.tsx:120`. v1 (launch-rehearsal): "… fork this
sheet, change it and publish to enter."

**W38** · on a version made in the window that isn't its maker's entry (a "candidate") · in the window
> Made during the remix challenge. Its maker’s latest version counts unless they mark another.

`src/lib/challenge/wording.ts:72`, `src/app/references/designs/[id]/page.tsx:111`.

**W39** · a candidate, after the close · **NOW ON MAIN** (R9; words unchanged)
> Made during the remix challenge. Entries are closed: its maker’s entry for {character} is another version.

`src/lib/challenge/wording.ts:74`, `src/app/references/designs/[id]/page.tsx:115`. After the close the W40 button
isn't offered.

**W40** · the button under W38 · its maker only, signed in, in the window
> Mark as my entry

`src/lib/challenge/wording.ts:76`, `src/components/challenge-mark.tsx:24`. It goes once marked (R6, now on main).

**W41** · after W40 · marked
> Marked as your entry.

`src/lib/challenge/wording.ts:77`.

**W42** · after W40 · refused (from the server) · **CHANGED since v1** (one refusal added: W72)
> Entries open [Fri 6 Nov, 09:00 PT].  *(before the window: W72)* · Entries aren’t open yet.  *(only if entries are
> switched off)* · Entries are closed. · You can mark only your own version, made during the challenge. · Marking
> another version isn’t available yet. Your latest version counts. · Sign in with Farcaster to mark your entry ·
> Could not mark it

`src/lib/challenge/entries.ts:166–171`; `src/app/api/challenge/mark/route.ts:14`; fallback
`src/components/challenge-mark.tsx:16`. (Also "Not set up on this deployment" and "Bad request", which only a broken
deployment or request shows.)

**W43** · on a version an admin made in the window · any
> Made by an admin during the remix challenge: admins aren’t eligible for rewards.

`src/lib/challenge/wording.ts:75`, `src/app/references/designs/[id]/page.tsx:117`.

**W44** · the bar's buttons · signed in (in the window, anyone signed in on a challenge sheet; otherwise invited
readers); "New version" on your own sheet only · **CHANGED since v1** ("Fork" became "Remix")
> Remix · New version

`src/lib/images/wording.ts:133–134`, `src/components/design-bar.tsx:32` and `:37`. On every style and sheet, not only
the challenge's (W69).

**W45** · the page's draft line, at the foot · any
> Draft wording

`src/lib/images/wording.ts:12`, `src/app/references/designs/[id]/page.tsx:219` · Covers the whole page, including
the image wording that predates the challenge.

## 3. The remix form, /references/designs/new?from={id}

The form for remixing a challenge character's sheet. **CHANGED since v1:** its title is now **"Remix"** (was "Fork";
`src/lib/images/wording.ts:149`, `src/app/references/designs/new/page.tsx:40`), or "New version" (`:150`) for a new
version of your own sheet.

**W46** · the credit band, at the top · any
> Remixed from {source title} v{n} · {source byline}
>
> Shown on yours for good. It credits {source byline}.

`src/lib/images/wording.ts:151–152`, `src/components/design-form.tsx:205` and `:207`. The first line is repeated in
the preview (`:334`).

**W47** · the sign-in gate · signed out, on a challenge sheet in the window · **CHANGED since v1** (its last words),
**NOW ON MAIN** (R2)
> Sign in with Farcaster to remix this sheet. During the remix challenge, anyone whose account passes the site’s check
> can remix it.

`src/lib/images/wording.ts:187`, `src/components/design-form.tsx:215`. v1 (launch-rehearsal) ended "can fork it."
Outside the window, signed out: "Sign in to make a style or a sheet. For now, making them is open to invited readers
only." (`src/lib/images/wording.ts:185`).

**W48** · the gate · signed in but not invited, outside the window (also the server's refusal after the close)
> Making styles and character sheets is open to invited readers only, for now. Anyone signed in can browse them and
> use them in their pictures.

`src/lib/images/wording.ts:191`, `src/components/design-form.tsx:221`; sent by
`src/app/api/designs/sample/route.ts:38` and `src/app/api/designs/route.ts:69` · Open: after the close a challenge
entrant reads "invited readers only" with no word that the challenge ended.

**W49** · the consent gate · signed in, before the first agreement · **CHANGED since v1** (W70 now shows above it,
for a reader who isn't invited, on a challenge sheet in the window)
> Before your first style or sheet: how your words are published.
>
> [button] Read and agree

`src/lib/images/wording.ts:193–194`, `src/components/design-form.tsx:227` and `:229`. Then the consent screen
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

`src/lib/images/wording.ts:154`, `:156`, `:163`, `:164`; `src/components/design-form.tsx:235`, `:238`, `:248`, `:251`.
Each box also shows the publication line from `config/consent.json` (legal, left out).

**W51** · the style choice · signed in, agreed
> Style for the views
>
> Each view is made in the style you choose: its text goes into the prompt before your sheet text. Your sheet shows
> which style its views used.
>
> No styles are published yet. Publish a style first.  *(only when none is published)*
>
> Choose a style first.  *(while none is chosen; a remix now starts with its source's style chosen, R8)*
>
> The style changed since these views were made. Make them again.  *(after changing style)*

`src/lib/images/wording.ts:158–162`; `src/components/design-form.tsx:255`, `:281`, `:278`, `:310`, `:309`.

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

`src/lib/images/wording.ts:166`, `:168–172`, `:174`, `:177`, `:183`, `:173`; `src/components/design-form.tsx:286`,
`:179`, `:307`, `:308`, `:311`, `:312`, `:313–318`, `:351`; the suffix is `IMAGES.suffix` in `src/lib/config.ts`.

**W53** · the three view lines, each beside its view (also part of every view's prompt) · signed in, agreed
> front: Character reference picture: one person, full body, standing, seen from the front, plain light grey
> background.
>
> side: The same person as in the reference picture, full body, standing, seen from the side, plain light grey
> background. Keep the face, hair and clothes the same.
>
> back: The same person as in the reference picture, full body, standing, seen from behind, plain light grey
> background. Keep the hair and clothes the same.

`src/lib/images/design-rules.ts:22–25`, shown at `src/components/design-form.tsx:302` · Model-drafted prompt lines,
not the recipe lines approved 2026-11-02. Changing them changes every new view's prompt.

**W54** · the rules box · signed in, agreed
> The rules
>
> Don’t base a character on a real person. Don’t contradict what the book says. Describe how they look early in the
> book; nothing that happens later. No real people. No sexual content. Nothing violent or hateful. No characters or
> logos from other works. Don’t ask for words in the picture.

`src/lib/images/wording.ts:17` and `:176`; `src/lib/images/rules.ts:32`; `src/components/design-form.tsx:325–326`.

**W55** · Generate refused · below 0.7 (at the first Generate of the day) · **CHANGED since v1** (where it shows:
now right under the view buttons, scrolled into view; the words are the same)
> Image making is open to Farcaster accounts with a Neynar score of [0.7] or more, to keep out spam accounts. Yours is
> {score}. Reading, listening, saving cards and everything else still work.

and, when Neynar can't be reached:
> Image making can’t check your account right now (Neynar, which scores Farcaster accounts, can’t be reached). Try
> again later. Reading, listening, saving cards and everything else still work.

`src/lib/images/gate.ts:28–31`, shown at `src/components/design-form.tsx:293`. Every other refusal at Generate shows
in the same place.

**W56** · the form's other messages · signed in · **CHANGED since v1** (the publish confirmation for an entry is now
W73)
> Published. See it  *(after Publish, when it isn't an entry: a style, a place, or outside the window)*
>
> Could not make the picture · No connection. Try again. · Could not record your agreement · Could not publish ·
> Sign in with Farcaster to make a picture · Making styles and sheets isn’t set up on this deployment yet.

`src/lib/images/wording.ts:181–182`, `:192`; `src/components/design-form.tsx:189–190`, `:111`, `:113`, `:152`, `:138`,
`:223`; `src/app/api/designs/sample/route.ts:32`.

The form's foot shows the same **"Draft wording"** line as W45 (`src/components/design-form.tsx:360`).

## 4. The consent screen, before a first Generate or publish

The title and paragraphs come from `config/consent.json` (own-words-v4) and are left out as legal text. The screen's
own lines, from `src/components/publish-words.tsx` (unchanged by #99):

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

## 5. Preview and publish (the remix form's foot)

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
`src/lib/images/wording.ts:138`, `:114`, `:117`, `:120`; `src/components/design-form.tsx:333`, `:342–345` · Site-wide
publish lines, listed because entrants pass through them.

## 6. Share this version (every sheet and style page)

**W60** · the share section · any
> Share this version
>
> [buttons] Farcaster · Bluesky · Lens

Each button's spoken label is "Post on {network}".

`src/lib/challenge/wording.ts:79–80`; `src/components/challenge-share.tsx:62`, `:67–78`.

**W61** · the share text, prefilled in each network's compose box (followed by the page's link) · any page except a
challenge character's sheet in the window (that one uses W74)
> {character}: {title}, made on Snowmoon Party

On a sheet with no name, {title} is "Sheet by {byline}". On a style, "{style title}, made on Snowmoon Party".

`src/lib/challenge/wording.ts:81`; built at `src/app/references/designs/[id]/page.tsx:217` and
`src/components/challenge-share.tsx:31`.

**W62** · under the buttons · any
> If you’re remixing someone’s post, quote or reply to it on the same network. Always include your version’s link.

`src/lib/challenge/wording.ts:92`, `src/components/challenge-share.tsx:81`.

## 7. Add where you posted it (under Share)

**W63** · the box · signed in (Farcaster or wallet), while `CHALLENGE.posts` is on (it is, as committed)
> Add where you posted it
>
> Your post’s address (Farcaster, Bluesky or Lens)
>
> [placeholder] https://…
>
> [button] Add

`src/lib/challenge/wording.ts:93–95`; `src/components/challenge-share.tsx:90–93`;
`src/components/post-link-field.tsx:15`.

**W64** · the post-link box line, under the box · signed in
> Sent to us. We read the post from its network’s own service, never from this address. Shown on this page with the
> network, the writer’s handle and the date, as a link.

`src/components/post-link-field.tsx:17` (marked DRAFT wording in the file's comment).

**W65** · after Add · added, or already there
> Added. · Already listed.

`src/lib/challenge/wording.ts:96–97`. In the Farcaster app, a cast made with the Farcaster button is added the same
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
`src/app/api/challenge/posts/route.ts:33`, `:44`; fallback `src/components/challenge-share.tsx:43`.

## 8. Posted on (a version's page, once a post is listed)

**W67** · the list · any
> Posted on
>
> {network} · @{handle} · {YYYY-MM-DD} · See it on {network}
>
> Posts that link to this page, newest first, as their writers or the people who added them listed them. Shown as
> links only.

`src/lib/challenge/wording.ts:98–100`; `src/components/posted-on.tsx:43`, `:49–51`, `:62`.

**W68** · on a post you added (or any, for a moderator) · signed in
> [button] Remove
>
> Only the person who added it, or a moderator, can remove it  *(refused)* · Sign in first

`src/lib/challenge/wording.ts:101`, `src/components/posted-on.tsx:56`; `src/app/api/challenge/posts/route.ts:69`,
`:57`.

## 9. The launch fixes, as merged in #99 (645cba1)

All **CHANGED since v1**: v1 listed these as planned, with no words yet.

**W69** · "Remix" in place of "Fork" · signed in · every place it now shows:
> Remix

- the sheet and style page's button: `src/lib/images/wording.ts:133`, `src/components/design-bar.tsx:32` (W44);
- the form's title: `src/lib/images/wording.ts:149`, `src/app/references/designs/new/page.tsx:40` (section 3);
- the sheet page's challenge line, "…remix this sheet…": `src/lib/challenge/wording.ts:71` (W37);
- the signed-out gate, "…can remix it.": `src/lib/images/wording.ts:187` (W47);
- two server refusals, "Remix it…": W78 and W79.

No user-facing "Fork" is left on the challenge's path. (The code still calls the mode `fork`, and the URL still uses
`?from=`; neither is shown as words.)

**W70** · who can enter, up front · /challenge (under the date line, before the window and in it; not after the
close), and the remix form (above W49, and again under the view buttons) for a reader who isn't invited, on a
challenge sheet in the window
> Entering needs a Farcaster account with a Neynar score of [0.7] or more; we check when you press Generate.

`src/lib/challenge/wording.ts:27`; `src/app/challenge/page.tsx:55`; `src/components/design-form.tsx:226` and `:297`.
The owner's exact words (2026-11-03), with the score from `CHALLENGE.neynarMinScore`. No new lookup: the score is read
at Generate.

**W71** · the reworded rule · /challenge · any
> To remix at all, sign in with a Farcaster account that passes the site’s check. An account below it can’t make the
> pictures, so it can’t remix or enter. It’s checked when you press Generate, and again when you publish.

`src/lib/challenge/wording.ts:45` (the same line as W14; reply on either).

**W72** · marking refused before the window · a version page, its maker, before Fri 6 Nov 09:00 Pacific
> Entries open [Fri 6 Nov, 09:00 PT].

`src/lib/challenge/entries.ts:168`, built by `shortDateText('opens')` in `src/lib/challenge/rules.ts:54–59` · This is
the only place the short form shows; /challenge's own date line keeps the long form (W4). Before #99 this case said
"Entries are closed."

**W73** · the publish confirmation · remix form, a version that is now its maker's entry (a challenge character, in the
window, passing)
> Published. This is your entry for {character}. See it

`src/lib/images/wording.ts:181` ("Published."), `src/lib/challenge/wording.ts:85` ("This is your entry for
{character}."), `src/lib/images/wording.ts:182` ("See it", a link); shown at `src/components/design-form.tsx:189–190`.
A "Draft wording" line shows under it (W80).

**W74** · the challenge share text · Share, on a challenge character's sheet, in the window (followed by the page's
link)
> {character}: {title}, made on Snowmoon Party. Remix the cast: the remix challenge is open until [Sunday 22 November,
> 23:59 Pacific].

`src/lib/challenge/wording.ts:83`; chosen at `src/components/challenge-share.tsx:31`, switched on at
`src/app/references/designs/[id]/page.tsx:217`. Before and after the window, and on other pages, W61. Choice: the
text has no link to /challenge; only the version's link follows it.

**W75** · the "unchecked" notice · remix form, after Publish, when Neynar didn't answer at publish (the version is
published but doesn't count)
> This version won’t count as your entry for {character}: Neynar, which scores Farcaster accounts, didn’t answer when
> you published, so the site couldn’t check your account. Publish another version later to enter; an earlier entry
> for {character}, if you have one, still counts.

`src/lib/challenge/wording.ts:90–91`, shown at `src/components/design-form.tsx:194` (under "Published. See it"), with
W80 under it. Shown only at publish; the version's page then shows no challenge line.

**W76** · the link to /challenge from the menu and the home page · any
> Menu: Remix the cast
>
> Home page row: **Remix the cast** · The remix challenge, [6 to 22 November]: remix a character and publish it ·
> Draft wording · →

Menu: `src/lib/nav.ts:48` (last, after Assistant). Home row: name W1, its line `src/lib/challenge/wording.ts:22`, the
small "Draft wording" marker `src/lib/challenge/wording.ts:20`, shown at `src/app/page.tsx:70` and `:78` (last row,
after Assistant). Choice: the home row stays after the window too (it still reads "6 to 22 November" then).

**W77** · R1–R9's wording, now on main · W32 (R4), W35 (R1), W37 (R5, now "remix"), W39 (R9), W47 (R2, now "remix").
R3, R6, R7 and R8 change no words.

## 10. New since v1

**W78** · server refusal · someone else's sheet, "New version" asked for (normally not offered) · **CHANGED since v1**
(was "Fork it…"; not listed in v1)
> Only its maker can add a version. Remix it to make your own.

`src/app/api/designs/route.ts:130`, `src/lib/images/designs.ts:318`.

**W79** · server refusal · a new style whose name is taken · **CHANGED since v1** (was "Fork it…"; not listed in v1)
> A style with this name already exists. Remix it, or choose another name.

`src/app/api/designs/route.ts:125`, `src/lib/images/designs.ts:293` · Styles only, not the challenge's path; listed
because #99 changed it.

**W80** · the draft line under the publish confirmation · remix form, after Publish, when W73 or W75 shows
> Draft wording

`src/lib/images/wording.ts:12`, shown at `src/components/design-form.tsx:197`.

**W81** · rule 2, three bases · /challenge · any · **Not on main:** branch `origin/challenge-three-bases` (005d178)
> Only remixes count: for each character, start from any of its three bases, or someone else’s remix. A new sheet made
> from scratch isn’t an entry.

That branch's `src/lib/challenge/wording.ts:34` (replaces W12) · On that branch the rule changes whether or not a
character's bases are picked yet, and W7 still says "start from a published sheet".

**W82** · label over the starting sheets, three bases · /challenge, once a character's bases are picked · **Not on
main:** branch `origin/challenge-three-bases`
> Bases to start from

That branch's `src/lib/challenge/wording.ts` (`startFromBases`) and `src/app/challenge/page.tsx` (replaces W25 then).

## 11. About: naming Bluesky and Lens for "Posted on"

Unchanged by #99: `src/app/about/page.tsx` and the P6 checks are the same on 645cba1.

**Why.** Privacy §7 names Bluesky and Lens: "Bluesky and Lens receive the details of a post someone adds to a
version's page … so our server can read the post and check it links there." (`src/lib/legal.ts:198`). About names
neither. Branch `social-read` adds Bluesky to the services check:principles compares
(`['Bluesky', /\bBluesky\b/g]` in `SERVICES`, `scripts/check-principles.ts`), so P6h will fail with "the Privacy
page names Bluesky; About does not" once it merges.

**What the checks compare** (`scripts/check-principles.ts`, P6g–P6j):

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

82 numbered items (W1–W82): 80 on main and 2 on the unmerged `challenge-three-bases` branch (W81, W82). W77 only
points to other items. 18 items are marked CHANGED since v1 (W14, W37, W42, W44, W47, W49, W55, W56, W69–W76, W78,
W79); 3 more are NOW ON MAIN with the same words (W32, W35, W39). W78–W82 are new to the list (W78 and W79 were already on main, worded "Fork it…", and #99 changed them). Several items hold a few short
lines of one screen state (buttons, errors). Plus section 11's proposed About line and its optional second sentence.
