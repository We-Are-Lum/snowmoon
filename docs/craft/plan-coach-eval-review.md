# Planning coach eval: review

The coach's replies, in full, are in the generated eval reports on branch `plan-coach` (`docs/craft/plan-coach-eval-design-2.md`, `docs/craft/plan-coach-eval-design-3.md`). This file is the reviewer's.

## Round 1 (the coding agent, 2026-10-11)

Three invented openings, each with planted problems (listed in its fixture's header, never sent to the coach). The owner's café-to-invasion freewrite is still to come. Every note was read against the book.

### Notes that write prose or wording for the person

| Run | Where | What it did |
|---|---|---|
| b-hearing | picture slot after F5 | Rewrote the person's own narration as on-screen text with a question mark added: a rewrite of their sentence. **The guard passed it.** |
| c-freetown-news | note 1 | Offers a want in quotes ("find out what's happening"): wording for the piece. |
| c-freetown-news | note 5 | Offers a want in quotes ("send an alert"). |
| c-freetown-news | picture slot after F4 | A poster reading "DEFENSE TAX INCREASE": lettering for the piece, and it repeats a wrong fact. |
| a-quarter-final | picture slot after F5 | A scoreboard flashing "WIN": lettering for the piece. |
| a-quarter-final | note 1 | "(e.g., trembling fingers, clenched grip)": not a sentence, but it fills in the content the note should leave to the person. Borderline. |

### Notes that get a world fact wrong, or miss a planted one

| Run | Where | What went wrong |
|---|---|---|
| a-quarter-final | picture slot after F2 | Puts the arena in **Greater Plum Harbor** (it is in Pafogai Du's mountain pyramid, c4-b48, c4-b78). A new error. |
| a-quarter-final | note 2 | Says F2 opens on a face; F1 is the close-up. |
| a-quarter-final | world check F2 | "Bai, who grew up in Redshire" is called "beyond your chapter limit". Up to chapter 4 the book only has her taunting Zei about a Redshire holiday (c4-b73); the claim is unsupported, and the coach should say so. Half a catch. |
| b-hearing | note 1, picture slot after F1 | Sets the hearing in the Order's tower with "ten Order members" (c6-b147 is the Acolyte induction). The hearing is in the parliament building, before twenty senators (c8-b38, c8-b47). A new error. |
| b-hearing | world check F3 | Says the tally isn't given up to chapter 8. It is: ten to ten, the chairman breaks the tie (c8-b97). **Missed planted error**, and the picture slot then draws "11-9". |
| b-hearing | world check F4 | "Delwart, the Arctic spy" is called a conflict. Up to chapter 8 the book doesn't say, so the right answer is "can't check within your limit". No spoiler leaked, but the note is misleading. |
| c-freetown-news | world check F4, note 4 | Freetown's government raising taxes: called "beyond your chapter limit". Chapter 10 says the government is banned from collecting more than the basic land tax, and the big companies pay for defense (c10-b22, c10-b24). **Missed planted error**, and note 4 builds on it. |
| c-freetown-news | world check F3 | "Utaku, Jahn's sister": called beyond the limit. Chapter 10 introduces her as a doctoral student from Belpaki (c10-b9). **Missed planted error.** |
| all | world check | Uses "beyond your chapter limit" for the person's own inventions, which aren't world facts. |

### What it got right

- **Craft:** it found the named feelings (2 of 2), the narration that repeats the picture, and the missing turn and ending. It asked one useful question each time and never went past a chapter limit.
- **World facts:** it caught Mov chairing the committee.

### Verdict

Not useful enough yet. It caught 1 of 5 planted world errors, introduced 2 new world errors, and made 5 slips into wording, one a straight rewrite that the guard missed. The craft notes are reasonable.

## Comparison, design 2, 2026-10-11 (test fixtures a, b, c; four models)

Reviewed by the coding agent against the book. Sonnet 5.5 and Opus 5.5 ran with the per-reply zero-retention check (`scripts/lib/zdr-check.ts`); no reply was refused. Total $1.34 of the $2 cap.

**World errors introduced in the notes** (wrong facts the coach stated on its own, beyond the draft):
- gpt-oss-120b: 3, all in fixture b's picture slots:
  - it puts the draft's wrong "11-9" on the vote screen as fact (the book: ten to ten, the chairman decides, c8-b97);
  - it treats Delwart as a place ("a distant silhouette of Delwart");
  - it adds an Arctic flag.
- Kimi K3, Sonnet 5.5, Opus 5.5: none found. Three details that looked invented were checked and are the book's:
  - Zei's healed arm (c4-b51);
  - chapter 4 is set in Pafogai Du (c4-b1);
  - Jahn is a researcher at the Freetown Economics Institute (c10-b2).

**Writing for the person:**
- gpt-oss-120b, 2 turns:
  - the guard caught an offered phrase, "to survive the vote" (fixture b);
  - a quoted, invented headline in a picture slot (fixture c).
- Kimi, Sonnet, Opus: none. The code flags on Opus (a) and Sonnet (b) are false positives: the quote check paired the closing quote of one draft quotation with the opening quote of the next, so the flagged span is text between two of the person's own quoted phrases.

**Pipeline problems, not model problems:**
- **Fixture c's two planted conflicts were missed by all four models.** Retrieval never sent the passages that settle them: the tax rule (c10-b22) and Jahn and Utaku introducing themselves (c10-b8, c10-b9). Every model then answered "not said" from what it was given. The fix is in retrieval, then a rerun.
- **Kimi K3 used the whole 8,000-token output limit on every notes call,** mostly on reasoning. Fixture a's notes are empty, and b's and c's are cut off in ORDER. Its notes need a higher limit, or reasoning turned down, before it is judged.
- **The quote check needs to pair quotation marks properly** (the false positives above).

## Design 3, 2026-10-11 (fixtures a, b, c; gpt-oss-120b, Haiku 5.5, Sonnet 5.5, Opus 5.5)

What changed from design 2:
- **The craft guide follows Plan a Piece v4.** v4 kept v3's principles; it changed two lines and added the named note forms, among them SHOW IT.
- **Retrieval:** crude stemming, rare words weighted higher, the first mention of each name in the claim, and the blocks next to the best hits.
- **The quote check pairs quotation marks properly.**
- **Kimi K3 dropped** (owner: too slow for a live coach). **Haiku 5.5 added** after its own zero-retention test.

All Anthropic replies passed the per-reply zero-retention check. Total $0.92 of design 3's $2 cap.

Reviewed by the coding agent against the book:

| Model | World errors caught (planted) | Bonus catch ("one ship" vs three gliders, c4-b113) | World errors introduced | Slips into writing for the person | Cost per turn | Time per turn |
|---|---|---|---|---|---|---|
| gpt-oss-120b | 1 of 3 | yes | 3 | 2 turns | $0.006 | 20 s |
| Haiku 5.5 | 2 of 3 | yes | 2 | 0 | $0.006 | 40 s |
| Sonnet 5.5 | 3 of 3 | yes | 0 | 0 | $0.10 | 45 s |
| Opus 5.5 | 2 of 3 | yes | 0 | 0 | $0.19 | 53 s |

**Errors introduced:**
- **gpt-oss-120b:**
  - it puts the hearing in "the Order's tower chamber" (it is in the parliament's circular room, c8-b38, c8-b47);
  - it shows "eleven-nine" on the vote screen;
  - its fixture c picture slot shows a "defense-tax increase" notice, after its own world check had found that claim false.
- **Haiku 5.5:**
  - it sets the hearing on "the tower's top floor, open to the sky", followed by a slot on the stairs down the mountain;
  - its world check rated "Utaku, Jahn's sister, is already typing" a match. It checked the typing and ignored the sister, so a person would be told a wrong claim matches the book.
- **Sonnet 5.5 and Opus 5.5:** none. These details were checked and are the book's:
  - twenty senators in a circular room, and the green light at the selected seat (c8-b47, c8-b49);
  - the neck band (c8-b8);
  - Delwart followed out of the booth (c3-b127);
  - about ten people in the restaurant (c15-b9);
  - Jahn not looking at the news before the lecture (c15-b3).

**Slips into writing for the person** (gpt-oss only):
- a picture slot with "WIN" on the scoreboard (fixture a);
- example wants offered in quotes, "to have a quiet meal" and "to get reliable information" (fixture c).

The guard passed every turn.

**Misses:**
- Opus and gpt-oss judged b's "eleven to nine" as "not said";
- Haiku and gpt-oss missed c's "sister".

**Pipeline fixes made after this run (no rerun needed for the scores above):**
- **The verdict parser** now keeps a reason written on the verdict line. Sonnet wrote its reasons there, so three of its "conflicts" verdicts were shown without one. The scoring was not affected.
- **The code check had three kinds of false positive, now fixed:**
  - a quotation of the draft shortened with "…";
  - "words you could say aloud" in a question;
  - Design's own question, "What would we see?", quoted from the craft guide.
  
  On this run's stored replies, the fixed check flags only gpt-oss's real slips.
