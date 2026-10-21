# DRAFT: Privacy line for "My picks", open to everyone

Branch `picks-everyone`, 2026-10-19. Drafted by the coding agent for the owner's reread. Not in
`src/lib/legal.ts`; it goes in with the merge that opens picks.

What the branch does: anyone signed in, with Farcaster or a wallet, can choose a published style or
character sheet ("Use as my style", "Use as my {name}") and apply it at Generate. Until now only invited
FIDs could; the route's own comment held it back because Privacy did not name picks. Making styles and
sheets stays invited-only.

What is stored: one private row per person per style or character (`studio.picks`: who, which design,
which version, when), read only for the signed-in person and at their Generate; never listed, counted
or shown to anyone else. A wallet account's picks are kept under its account, apart from any FID. Kept
until the person clears the pick (or the design is withdrawn).

## Privacy, section 4 ("Kept by us when you sign in"), one item added

> The styles and character sheets you choose to use in your pictures ("My picks"), which only you can see, until you clear them.

No section 7 change: picking sends nothing anywhere. A picked style's or sheet's text goes to Groq and
fal.ai only as part of a picture's prompt at Generate, which section 7 already covers.
