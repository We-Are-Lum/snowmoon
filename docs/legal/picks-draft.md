# Admin picks: the Terms line (DRAFT, for the owner's reread when picks ship)

**Status, 2026-10-30 (overnight run):** picks are built on branch `phase2-admin` (not merged). These lines ship in
the same merge, after the owner applies NEXT_admin_picks and rereads them. Nothing in src/lib/legal.ts has changed.

Principle 5 was reread by the owner on 2026-10-29 (docs/principles.md §5): an admin may pick which image shows first
for a moment or a glossary item, labelled "Picked by @handle", with the reader's switch "Picked by @handle · Most
liked · Newest · Liked by me". Picks aren't built yet. This line ships with them, never ahead (owner, 2026-10-18:
the texts only ever describe what the site does on the day they go live).

## Terms §7 (Hiding and removal), one sentence added at its end

> Admins (the site's owner and people the owner names) may pick which image shows first for a moment of the book or
> a glossary item; it is labelled with who picked it, and you can switch to the most liked, the newest or the images
> you liked, and every other image stays one tap away.

## Terms §7, a second sentence for the admins' Hide (new, 2026-10-30)

Today §7 says "We may hide content that breaks these Terms." Phase 2 lets admins hide images in the reader: readers'
images (as moderators already can, for content that breaks the Terms) and the project's own seeded images (the
edition's starting points). Proposed, after "We may hide content that breaks these Terms.":

> Admins may also hide the images the project made itself, its starting points, for any reason.

For the reread: a reader's image is still hidden only as the Terms and the removal policy say (the admin Hide on a
reader's image is the moderator's Hide, logged in the removal log); the new sentence covers only the project's own.

## Privacy: no change

The switch's choice stays on the reader's device (localStorage). "Liked by me" uses the likes the site already keeps
(Privacy §4), shown only to the person who liked them. A pick stores the admin's FID, the image and the time.
