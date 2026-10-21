# DRAFT: Privacy line for sharing a Minpentai win

Branch `minpentai-share`, 2026-10-19. Drafted by the coding agent for the owner's reread. Not in
`src/lib/legal.ts`; it goes in with the merge that ships the share buttons.

What the branch does: after a win on the ladder, the result screen offers CAST IT and POST ON X. Nothing
happens unless the player taps one. The tap opens their own Farcaster or X composer with words and a
link (`/minpentai/result?r=<rung>&s=<steps>`) they can change or discard. The link's page and card are
drawn from the link each time; the server stores nothing about the share, and nothing ranks results.
Signed-out players can share too (their ladder isn't saved, but the win is on screen).

## Privacy, section 6 ("What you publish."), one sentence appended

> If you share a Minpentai win, your own Farcaster or X app posts it; its link carries only the opponent you beat and the number of steps, its card is drawn from that link, and we keep nothing about it.

Section 7 needs no change: Farcaster and X receive only what the person posts from their own app, and
the composer opens on their device (on X, x.com/intent/post).
