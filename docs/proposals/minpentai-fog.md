# Minpentai: fog, three ways

Draft for the owner (written overnight, 2026-10-21, by the coding agent). Read-only proposal; nothing here is built.

## What the book's fog is

- The field starts dark; a player sees within thirty squares of each copy of their symbol (c4-b93).
- Teammates share what they see (c4-b94).
- A hidden symbol can watch an opponent's moves without being seen (c10-b162).
- Players see less than the audience: "Zei and Gun could not see the full view of what was going on, but the audience could." (c14-b51)
- Intervention turns are taken at the same time, without seeing each other's choices (Play's rule; the book's turns are shared moments, c4-b110).
- The match's new rule is kept secret until play starts (c4-b148, c12-b133 to c12-b134).

This edition already has fog: you see 3 squares around your towers, and an unseen tower is shown where you last saw it.

## One thing to know first: solo fog can't be enforced

Against a computer player, the game is deterministic. With wallet-bound seeds the player knows the seed before playing. So anyone can compute the whole board, including the dark part, at every step. In solo, fog is a rule the screen keeps, not one anyone can check. That's fine for casual play and for a history of matches. It matters for a ranked mode: a ranked solo score measures "best play with full information", whatever the screen shows.

Fog only means something when there is information a player can't compute: another person's choices.

## The three options

| | Open information | Commit-reveal | Zero-knowledge fog |
|---|---|---|---|
| How it works | Every placement is public as soon as it is made. | Each turn, each player publishes a hash of their placements, then reveals them once both have committed. Fog during play is kept by a relay (today's one-on-one server) that sees everything and shows each player their part. | Each player keeps their pieces private and proves every move is legal against a committed hidden state. Pieces that meet in the dark (gliders crossing, a glider reaching a hidden tower) need a joint computation between the two private states. |
| What of the book survives | Simultaneous turns only if the relay holds them. No fog: anyone watching the chain or relay sees the whole board, like the audience. | Simultaneous turns (enforced by the commitments). Fog, as long as the relay is honest about privacy. The audience view after the match. Secret new rule, if the rule is drawn from a seed revealed at the start. | Everything, in principle, with no trusted relay. |
| What is trusted | Nothing extra. | The relay, for privacy only: it can leak the board but can't change moves, which the commitments and the final replay check. | The proof system and its setup. |
| Build size | Already there (the spike's MatchLog). | Small to medium: per-turn commitments signed by both players (signatures, not new keys), checked by the verifier; the final match recorded once, with both signatures. A week or two on top of today's one-on-one server. | Very large. Minpentai's physics makes hidden pieces interact every step, so it needs two-party computation or proofs over up to 96 simulated steps, not a proof per move. Months, with research risk. |
| Cost per match on Base (today's prices, about $0.001 per 70k gas) | About $0.001 (one record). | About $0.0015 if commitments stay offchain and are signed (one record, slightly longer). About $0.02 if every commitment is its own transaction (about 26 transactions of 45k gas). | Proof verification is roughly 250k gas each; one per player per turn is about 6.5M gas, about $0.10, plus heavy proving on the player's device. |

## Recommendation

1. Solo now: open information. Record matches as the spike does, and say plainly that solo fog is on the honour system.
2. PvP next: commit-reveal with signed, offchain commitments. Keep today's relay for fog, and record the finished match once, with both players' signatures over every turn's commitment. The verifier then checks that nobody changed a move after seeing the other's.
3. Zero-knowledge fog: only as a research project, not a plan. Dark Forest-style games work because hidden pieces interact only through explicit moves; Minpentai's pieces interact on their own every step.

## Open questions for the owner

- Is a relay that could leak the board, but not change it, acceptable for ranked PvP?
- Should the audience view (the whole board, as in c14-b51) be public live, or only after the match?
