# Agents for the owner's account only: Privacy and Terms lines (reread 2026-10-24)

**Reread, 2026-10-24.** The owner said "Reread" for these lines, with his own changes, on branch
`agents-legal-reread`. What went in (`src/lib/legal.ts`, word for word as he wrote them; each sentence checked
against the code on main at 588c8e8 first):

- **Privacy §3**, the last sentence is now: "Frames you make in Remix are not drafts: they are saved by us as soon
  as they are made (section 4). So are the frames and video tests your agent makes when you approve them, but
  privately: only you can see them (section 4)." (This replaces the drafted "A frame your agent tries for you is
  different…" below.)
- **Privacy §4**, agent keys: as drafted below.
- **Privacy §7**, fal.ai, added at the end, without waiting for fal: "For a video test you approve, fal.ai receives
  the shot's frame (already public on the site), your note and your acting notes for that shot, and makes a short
  video with the open LongCat-Video model. It is asked to keep no copy of the request. It returns the video at a link
  on its own storage; we copy it at once and keep it privately, for you." How long fal keeps that file is still
  open: the owner asked for a line to add once known (see the PR).
- **Terms**, a new section **6b "Agents."** (there was no Agents section yet; 6b keeps the numbers the other
  sections cite): "Agents are open only to accounts we invite." (the bracketed "for now, only the site's owner" cut);
  then the owner's own spending sentences: "They can't spend money. When an agent drafts something that costs money
  (a new frame or a video test), it shows the estimated cost, and nothing is made until you approve it. Each draft
  can be approved once, and each day is limited to 20 frames, 5 video tests and $2 in all. A frame counts like any
  other Remix frame: on a Farcaster account it uses your free frames for the day; on a wallet account it's charged
  to your balance at the price shown (section 6a). Video tests are paid by us for now."; then the agent key
  paragraph as drafted below.
- Not in: the rest of the design's "Agents" section (`docs/agents/design.md` §6: up to three agents, responsibility,
  labels, suspension). It was not part of this reread.
- With it, the code fix the owner asked for: `runApproved` counts approvals still in progress at their estimate, under
  one lock per person, so two taps at once can't both pass the $2 a day or a key's cap (test K5b).
- **Before agents open beyond invited people**, video tests are charged like frames and Terms 6b changes to say so
  (the owner, 2026-10-24).

The draft as it stood before the reread follows.


These lines are written for branch `agents-owner`. Agents are switched on for an allowlist: the owner's
FID 6786 and one wallet address. Nobody else sees anything new. These lines add to the agent lines in
`docs/agents/design.md` §6 and replace one sentence there. Nothing here ships until you say "reread".

Each line below describes what the code does today. The source is named under each line.

## Privacy

**§4 Kept when you sign in, add:**
> If you use an agent here (for now, only people the site has invited): the edits it drafts for your own
> scene versions (a new frame, another voice take, a shot's timing, who speaks in a shot, a video
> test), each with the note it was drafted from. A frame or video test you approve is kept with what it
> cost, the model and the pictures sent, privately and only for you. When your agent can't do something
> you asked, it may record what you asked and what was missing. That record is shown to you on your You
> page, and to the site's owner, who reads them, with your name, to decide what to build next. It is
> never published.

Source: `src/lib/agents/edits.ts` (`allGaps`, for the owner only, 2026-10-22), `approve.ts` and the `agent_gaps`
table in migration 0019. Test SU7.

**§4 Kept when you sign in, also add (agent keys, 2026-10-20 night):**
> If you make an agent key: its name, the spend cap you set, when it was made, when it ends (30 days
> later) and when it was last used. The key itself is shown to you once and kept only in coded form, so
> we can't show it again; it isn't written to our logs.

Source: `createKey` in `src/lib/agents/accounts.ts` (only the sha256 is stored) and tests K2 and K9.

**§3 Kept on your device only, change** "Frames you make in Remix are not drafts: they are saved by us
as soon as they are made (section 4)." **to:**
> Frames you make in Remix are not drafts: they are saved by us as soon as they are made (section 4).
> A frame your agent tries for you is different: it is kept privately until you keep it.

Source: `runFrame` stores the frame in the private bucket (`made/…`). It is not added to Remix's public
frames. Test E6 checks this.

**§7 Outside services, fal.ai line, add at the end:**
> For a video test you approve, fal.ai receives the shot's frame (already public on the site) and your
> note, and makes a short video with the open LongCat-Video model. It is asked to keep no copy of the
> request.

Source: `runVideo` sends `X-Fal-Store-IO: 0`, the same header the site's image calls send.

**Check before this ships:** fal returns the video as a link on its own storage, and we fetch it from
there. I could not confirm how long fal keeps that file. The real call has not been tried yet; the
tests use a stand-in. If fal keeps the file, change the line to: "…It is asked to keep no copy of the
request; the video it makes is held at fal.ai for [period] at a link only we have."

## Terms

**"Agents" section (design §6): replace** "They can't spend your money." **with:**
> They can't spend money. When an agent drafts something that costs money (a new frame or a video
> test), it shows the estimated cost, and nothing is made until you approve it. Each approval is
> limited to once, and each day to 20 frames, 5 video tests and $2 in all. A frame is charged to your
> balance like any other generation (section 6a).

Source: `AGENTS.spend` in `src/lib/config.ts`, `runApproved` and tests E3, E4, E7 and E12.

**"Agents" section, add as the first sentence while the allowlist is on:**
> Agents are open only to accounts we invite; for now, only the site's owner.

**Check:** a video test is not charged to a balance. It is paid from our fal account, which is fine
while only the owner uses it. Before agents open to anyone else, it must be charged to the person's
balance like a frame, and this line must say so.

**"Agents" section, add (agent keys):**
> You can make a personal agent key for an app that connects with a key. Keep it secret, as you would a
> password. Until it ends (after 30 days, or when you disconnect it), anyone holding it can read and draft
> for you, but not publish. Nothing it drafts is paid for unless you approve it, and never more than the
> cap you set. If it gets out, disconnect it on your You page.

## No change needed

- **§6 What you publish:** an edit is never published. Keeping an edit marks it kept; it does not
  change the published scene (`edits.ts`, header comment).
- **Groq:** no change. Speaking stays off until you've confirmed audio retention in the Groq console
  (your decision of 2026-10-20).
