# 012: Image generation first

Given to the coding agent (Claude Code) on 2026-10-08, verbatim.

> Image generation is now the priority.
>
> Part A, today: take adaptations out of view. Remove Adaptations from the rail, menu, intro lists and About; turn off the "cited in" markers in the reader; /adaptations and its pages say nothing is published yet. Keep every file in the repo.
>
> Part B: before building, add to the add-an-image proposal: is there a hosted, open-weights image model that accepts reference images (for example FLUX.2 klein 4B's edit mode on a host)? Give licence, price, safety checker and what it would add as an outside service. That decides how character sheets work later.
>
> Part C: build the proposal as slice 1 on your branch, labelled "Trial". All 28 decisions as you recommended, except:
> - 11: invited FIDs only, starting with 6786. No Neynar key.
> - 12: find a way to show the Farcaster username without adding a new outside service, and tell me before adding anything. "FID n" until then.
> - 18: contact address snowmoon@wearelum.xyz. 20: moderator 6786.
> - 24: number the migration after the chat session's notice migration and coordinate with it. Keep the Farcaster ID only on rows that count a person's daily limit; cost rows carry no ID and only the date, the same rule as chat.
>
> Add to slice 1:
> - A feed of published images, newest first, with "most liked" as a labelled alternative. Images from chapters past the furthest one a reader has opened stay covered until they choose to see them.
> - Likes on images, using the existing likes.
> - A share card and "Cast this" on each image page, like quote cards.
> - "Add an image to this moment" in the player.
>
> Don't build style guides or character sheets yet, but build so they fit: the "uses" and "remixed from" links and the private picks table from the favourites proposal.
>
> Tell me exactly which secrets to add to Vercel and with what scope; I'll add them. Cap test spending at $1.
>
> Report: the answer to Part B first, then the branch, what I need to do, and the Principles section.

Part A shipped as a228576. Part B is in docs/proposals/add-an-image.md. Part C is branch
site-images (migration 0008, not applied).
