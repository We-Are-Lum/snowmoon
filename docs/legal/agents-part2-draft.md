# Agents, part 2 (pictures): Privacy and Terms lines (DRAFT, for the owner's reread)

Branch `agent-pictures`, part 2, 2026-10-29. Drafted by the coding agent. **Not reread yet.** Owner, 2026-10-29: "Plan A
part 2 merges only after part 1 is applied and merged, with its own Privacy lines for my reread." They ship in the same
merge as the picture tools, and are written on top of part 1's lines (docs/legal/agents-part1-draft.md). Nothing in
`src/lib/legal.ts` changes until the owner says "reread".

## What part 2 changes

| What | New data, or new place it goes | Who sees it | Published? |
|---|---|---|---|
| Picture drafts (draft_picture, draft_sheet, draft_place, draft_style) | `studio.piece_versions`, as other drafts: what it is attached to (a moment, a shot, a reference or a glossary word), the style, the exact prompt in parts with whose words each part is, the estimate | the person on their dashboard; the site's owner, as for other drafts | only if the person publishes it, and only once made |
| A picture the person approves (Make it) | the picture, in the agents' private storage; its recipe: model, request id, seed, settings, prompt parts, style, target, cost, which agent drafted it, who approved it and when | the person only | only if the person publishes it |
| The prompt check and fal.ai | the prompt goes to the prompt check and to fal.ai, as for any picture the person makes in Pictures | (outside services, §7) | no |
| match_request | when no tool makes what the person asked for, it records what they asked and what was missing, as log_gap does | the person on their dashboard; the site's owner, with the person's name | never |

## Privacy §4, the agent paragraph

Today: "If you use an agent here (for now, only people the site has invited): the edits it drafts for your own scene
versions (a new frame, another voice take, a shot's timing, who speaks in a shot, a video test), each with the note it
was drafted from. A frame or video test you approve is kept with what it cost, the model and the pictures sent,
privately and only for you. When your agent can't do something you asked, it may record what you asked and what was
missing. …"

Proposed (changes in the first two sentences; the rest as today, with part 1's sentences after it):

> If you use an agent here (for now, only people the site has invited): the edits it drafts for your own scene versions
> (a new frame, another voice take, a shot's timing, who speaks in a shot, a video test), each with the note it was
> drafted from; and the pictures it drafts for you (a picture of a moment, a shot, a reference or a glossary word; a
> character sheet; a place; a new style and its sample), each with what it is for, the style you chose, and its prompt,
> showing whose words each part is. A frame, video test or picture you approve is kept with what it cost, the model, the
> prompt and the pictures sent, privately and only for you, until you publish or discard it. When your agent can't do
> something you asked, it may record what you asked and what was missing. …

## Privacy §7 (outside services)

The fal.ai item and the prompt-check item already cover "an image you make". Proposed, so an agent's picture is named:

> Groq, and Vercel AI Gateway when Groq is busy, receive assistant questions, and the prompts for images you make (or
> approve from your agent's drafts), which are checked against the published rules.

> fal.ai receives the prompt for an image you make (or approve from your agent's drafts), and any pictures sent with it
> … (the rest as today)

## Terms 6b (Agents), the first paragraph

Today: "… When an agent drafts something that costs money (a new frame or a video test), it shows the estimated cost,
and nothing is made until you approve it. Each draft is made at most once, and each day is limited to 20 frames, 5 video
tests and $2 in all. A frame counts like any other Remix frame: …"

Proposed:

> … When an agent drafts something that costs money (a new frame, a video test or a picture), it shows the estimated
> cost, and nothing is made until you approve it. Each draft is made at most once, and each day is limited to 20 frames,
> 5 video tests and $2 in all. A frame counts like any other Remix frame, and a picture like any other picture you make:
> on a Farcaster account it uses your free frames or pictures for the day; on a wallet account it's charged to your
> balance at the price shown (section 6a). Video tests are paid by us for now.

## No other change

- §9 (keeping and deleting): none; picture drafts are account-linked records like other drafts.
- Terms 8 (AI-made material): pictures are already named; an agent's picture is labelled "AI-generated image, not by
  the author" and its recipe says which agent drafted it and who approved it.

## For the reread

- "showing whose words each part is": the recipe lists each part with its author: the agent's description (from your
  request), the style's maker, the edition's invented look for a sheet (not the book), the site's fixed wording
  (src/lib/agents/pictures.ts, `parts`; test:agents P4).
- "until you publish or discard it": a picture can't be published before it is made with its whole recipe (P5, P7).
- "uses your free … pictures for the day": Make it goes through Pictures' own caps (src/lib/images/paid.ts), so an
  approved agent picture counts against the person's daily Pictures count as well as the agents' $2 a day.
