# DRAFT: Privacy lines for Minpentai in a Farcaster cast (the snap)

Branch `minpentai-snap`, 2026-10-21. Drafted by the coding agent for the owner's reread. Not in
`src/lib/legal.ts`; it goes in with the merge that ships the snap (per "legal texts describe today").

What the branch does: `/snap/minpentai` serves a practice match of Minpentai that plays inside a
Farcaster cast. Each tap reaches our server as a request signed by the player's Farcaster app. To
check the signature, the server asks a Farcaster hub (by default `rho.farcaster.xyz`, run by
Farcaster) which signing keys the player's Farcaster ID has, and keeps that answer in memory for
five minutes. The match itself travels in the snap's own links, signed by us. We keep each
Farcaster ID's latest match (seed, computer level, version, and the placements of the finished
turns) so the first page can offer "Resume"; it is deleted when the match ends, and any left over
after 30 days. Nothing is recorded as a result, ranked, or sent onchain. "Keep playing in the app"
opens the mini app with the match's seed and moves in the link.

## Privacy, section 4 ("Kept by us when you sign in."), one item added to the list

Strictly a snap tap isn't a sign-in, but it is the same Farcaster ID; the list is where Minpentai's
other records are, so the line sits next to them:

> If you play Minpentai in a Farcaster cast: your latest practice match there (where pieces were placed, turn by turn, and the match's random seed), so you can resume it; deleted when the match ends, or 30 days after your last turn. Nothing else about these matches is kept or recorded.

## Privacy, section 7 ("Outside services and what they receive."), one item added

> When you tap in Minpentai inside a Farcaster cast, your Farcaster app signs the tap, and we ask a Farcaster hub (run by Farcaster) which signing keys your Farcaster ID has, to check the signature. The hub receives your Farcaster ID; we keep its answer in memory for five minutes and not after.

## Terms

No change: section 2 already describes "a game reconstruction", and nothing in the snap is paid,
published or ranked. If the owner prefers, section 1's "(snowmoon.party and its Farcaster mini app)"
could add "and its game in Farcaster casts".

## Checks to update with the merge

- P6g lists the outside services the Privacy page, About, the assistant's notice and the consent
  screen must agree on. If the hub becomes a named service, it is added there in the same change.
- Migration NEXT_minpentai_snap_resume (`studio.mp_snap_resume`, numbered at merge) is a DRAFT and must be applied before the snap ships to
  production; without it the snap still plays, and Resume lasts only while a server instance is warm.
