# Privacy and Terms lines for Minpentai in a Farcaster cast (the snap)

Branch `minpentai-snap`, 2026-10-22. Drafted by the coding agent; in `src/lib/legal.ts` in the same
PR as the snap (per "legal texts describe today"), awaiting the owner's reread. Until then
check:principles P6k and P6l fail, and the merge waits.

What ships: `snowmoon.party/minpentai` plays inside a Farcaster cast (the snap) when a Farcaster
client asks for a snap; browsers get the page as before. Each tap reaches our server signed by the
player's Farcaster app. To check the signature, the server asks Neynar's Farcaster hub
(`hub-api.neynar.com`, with the site's Neynar key; owner, 2026-10-22) which signing keys the
player's Farcaster ID has, and keeps
that answer in memory for five minutes. The match itself travels in the snap's own links, signed by
us. We keep each Farcaster ID's latest match (seed, computer level, version, picked extra rule, and
the placements of the finished turns) so the first page can offer "Resume"; it is deleted when the
match ends, and any left over after 30 days. Share posts a challenge: the player's own Farcaster app
composes the cast, and its link (`/minpentai/c/…`) carries the match's start and the player's result,
signed; its preview card is drawn from the link. Nothing is recorded as a result, ranked, or sent
onchain. "Keep playing in the app" opens Play with the match's seed and moves in the link.

## Privacy, section 4 ("Kept by us when you sign in."), one item added to the list

> If you play Minpentai in a Farcaster cast: your latest practice match there, kept with your Farcaster ID (its random seed, the computer level, the extra rule and where you placed your pieces, turn by turn), so you can resume it; deleted when the match ends, or 30 days after your last turn. Nothing else about these matches is kept or recorded.

## Privacy, section 6 ("What you publish."), one sentence added at the end

> If you share a Minpentai challenge from a Farcaster cast, your Farcaster app posts it; its link carries the match's start (its random seed, the computer level and the extra rule) and your result (how and at which step it ended, how many towers were left and how many taps you used). It does not carry your moves or your Farcaster ID, though anyone who opens the link can read what it does carry. Its card is drawn from that link, and we keep nothing about it.

## Privacy, section 7 ("Outside services and what they receive."), one sentence added to the Neynar item

Added to the existing Neynar item (P6g's list of outside services is unchanged; the Farcaster item
is as on main):

> When you play Minpentai inside a Farcaster cast, your Farcaster app signs each tap, and we ask Neynar's Farcaster hub which signing keys your Farcaster ID has, to check the signature: Neynar receives your Farcaster ID, and we keep its answer in memory for five minutes.

## Terms, section 1 ("Who runs this.")

> Snowmoon Party (snowmoon.party, its Farcaster mini app and its game in Farcaster casts, together "the Service") is operated by Lum LLC, a Wyoming limited liability company ("we"). By using the Service you agree to these Terms.

(Was: "snowmoon.party and its Farcaster mini app".) Section 2 already describes "a game
reconstruction"; nothing in the snap is paid, published by us or ranked.

## After the reread

Set `LEGAL.ownerReread` to the keys check:principles prints (P6k, P6l), with the date.

## The migration

`supabase/migrations/NEXT_minpentai_snap_resume.sql` (`studio.mp_snap_resume`) takes the next free
number at merge. Without it the snap still plays, and Resume lasts only while a server instance is
warm; the Privacy line is true either way (the match is kept, in memory or in the table).
