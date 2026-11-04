# Challenge payout: the pot, payout addresses and the mint's chain (DRAFT, a proposal only)

Written by the coding agent (Claude, a closed model by Anthropic), first on 2026-11-03 and finished with numbers in the
owner's overnight run of 2026-11-04 (task 5), on branch `deep-funding`, for the owner's OK. DRAFT until the owner
approves it. **A proposal only: nothing is built, no contract or setting is changed, no migration file is written, no
legal text is changed, and nothing was sent to any network.** The diffs in section 18 are drafts, not applied.

- **Every payout number is illustrative:** the people, the deep funding results and the pots are made up, to show how
  each rule behaves. The calculator is in "How the numbers were made", at the end of section 16.
- **The chain numbers are real readings**, each with its source and time (section 18).

It answers items 16 to 18 of the owner's list of 2026-11-04, and replaces parts of two earlier drafts on this branch:

- `docs/proposals/payout-addresses.md`: the chain becomes Base, a passkey wallet is offered, and a missing address
  is shared among the others instead of going to the Lake;
- `docs/proposals/deep-funding-runner.md`: one pot for the whole contest instead of one split per character.

**The owner's rules used throughout** (2026-11-04):

- up to **3 submissions per person**, for any characters;
- a character **counts** once it has **3 different submitters**;
- the 20% equal share is **per person**, not per submission;
- **payment never buys an entry** (principle 7): the Submit refusal never offers to prepay;
- **/challenge is admin-only for now** (`CHALLENGE.public: false`); the dates stay in the config until the owner sets
  a new open date, and the payout's timing moves with it (section 17, "When");
- **the Fund account** (the team's share, "the Lake" below) is a Splits Teams smart account,
  `0xe29f1FC6B5afEd31897e8B388d9c1145a4e819d5`, set up on Ethereum and on Base with the same factory and
  implementation;
- **the mint** is planned for the Snowmoon WIP contract (`contracts/snowmoon-wip`), with a Splits v2 PushSplit as each
  token's payout.

## 16. The pot

**What's in it:** the owner's Snowmoon contest winnings, converted to ETH on Base, plus the Snowmoon WIP mint's
proceeds. All of it is distributed by the deep funding result across the whole contest.

**What the deep funding result gives** (`scripts/deep-funding.ts decide`), for each counting character's final
version, a share of credit for every version it was built on, adding up to 1:

- the final's own originality share (the owner's);
- what reaches the book;
- what reaches each maker's versions. A maker is a Farcaster ID; one maker may appear in several characters.

So the result says how to share **within** a character. The pot needs one more rule: how much goes to each character.

### The options across characters

- **A. Equal per character.** Each counting character gets the same part of the pot. Its few makers share as much
  as a busy character's many makers.
- **B. By number of submitters.** A character's part is in proportion to its distinct eligible submitters. Each
  person's expected share is about the same, whichever character they chose.
- **C. Proceeds follow their character.** Each token's mint proceeds go to its own character, and the winnings are
  split equally. This is the earlier plan (one split per token). Sales decide part of who gets what.
- **D. One graph across all, with no character weights.** The jurors and models would compare versions *across*
  characters ("did this Bai matter more than that Zei?"). The runner doesn't ask that, and 5 to 9 jurors per character
  can't answer it for six characters. **Not feasible as built.** The numbers below show D's mechanics with **assumed**
  cross-character weights (S1: Zei 0.45, Bai 0.35, Mu 0.20; S2: Zei 0.25, Gladias 0.20, Bai 0.20, Seila 0.15, Deluin
  0.10, Mu 0.10), which is exactly the input nobody would have.

Each option can be used on its own (100% by deep funding) or with the owner's 20/80 rule:

- **20%** of the pot is split equally among every eligible submitter, **per person**: someone with three entries
  gets one equal share.
- **80%** is split by deep funding, across characters by A, B, C or D.

Who is an "eligible submitter" for the 20%: proposed, a person with at least one eligible entry in a **counting**
character, whether or not the final used it. A person whose only entries are in characters that didn't reach three
submitters has no deep funding result to stand on (the owner's list, item 2).

### The scenarios (illustrative)

**Pots:** 1, 2.6 and 5 ETH. Each holds **0.6 ETH of mint proceeds** (200 editions at the contract's 0.003 ETH; only
option C uses this) and the rest as winnings. At $2,303 per ETH (Chainlink, section 18) the pots are about $2,300,
$6,000 and $11,500.

**The made-up deep funding results** (each row adds up to 1; the owner's and the book's shares go to the Lake in the
"as built" version):

| Character | Submitters | Owner's originality | Book | Makers |
| --- | --- | --- | --- | --- |
| Zei | 8 | 0.40 | 0.10 | A 0.20, B 0.12, C 0.08, D 0.05, E 0.03, F 0.015, G 0.005, H 0 |
| Bai | 5 | 0.35 | 0.15 | B 0.25, I 0.15, J 0.06, A 0.04, K 0 |
| Mu | 3 | 0.45 | 0.05 | L 0.30, C 0.15, M 0.05 |
| Gladias (S2) | 6 | 0.40 | 0.10 | N 0.20, O 0.12, A 0.08, P 0.06, Q 0.04, R 0 |
| Seila (S2) | 4 | 0.45 | 0.10 | S 0.22, T 0.13, C 0.07, U 0.03 |
| Deluin (S2) | 3 | 0.50 | 0.10 | V 0.25, W 0.10, I 0.05 |

- **S1, three characters count, with 8, 5 and 3 submitters:** Zei, Bai and Mu. Gladias has only N and O, so it
  doesn't count; N and O get nothing. **13 people** (A to M); A, B and C entered two characters.
- **S2, all six count:** S1 plus Gladias (6), Seila (4) and Deluin (3). **23 people** (A to W). A entered Zei, Bai
  and Gladias, and C entered Zei, Seila and Mu: three submissions each, across three characters. N, V and S entered
  one character each.
- **S3, one person with 3 submissions across characters:** S1, but A also enters Mu (Mu: L 0.30, C 0.12, M 0.05,
  A 0.03), so A has entries in Zei, Bai and Mu, and Mu has 4 submitters.
- **C's proceeds by character:** S1 Zei 0.30, Bai 0.20, Mu 0.10; S2 Zei 0.20, Gladias 0.12, Bai 0.10, Seila 0.08,
  Deluin 0.05, Mu 0.05.

### S1 per person, at 2.6 ETH (ETH)

The 20% is 0.52 ETH: **0.04 ETH each** for 13 people.

| Person (characters) | A, 20/80 | B, 20/80 | C, 20/80 | D, 20/80 | B, 100% DF | B, 20/80, all distributed |
| --- | --- | --- | --- | --- | --- | --- |
| A (Zei, Bai) | 0.2064 | 0.2740 | 0.2224 | 0.2563 | 0.2925 | 0.5080 |
| B (Zei, Bai) | 0.2965 | 0.3273 | 0.3061 | 0.3343 | 0.3591 | 0.6146 |
| C (Zei, Mu) | 0.1995 | 0.1817 | 0.1939 | 0.1773 | 0.1771 | 0.3234 |
| D (Zei) | 0.0747 | 0.0920 | 0.0787 | 0.0868 | 0.0650 | 0.1440 |
| E (Zei) | 0.0608 | 0.0712 | 0.0632 | 0.0681 | 0.0390 | 0.1024 |
| F (Zei) | 0.0504 | 0.0556 | 0.0516 | 0.0540 | 0.0195 | 0.0712 |
| G (Zei) | 0.0435 | 0.0452 | 0.0439 | 0.0447 | 0.0065 | 0.0504 |
| H (Zei, credited 0) | 0.0400 | 0.0400 | 0.0400 | 0.0400 | 0 | 0.0400 |
| I (Bai) | 0.1440 | 0.1375 | 0.1440 | 0.1492 | 0.1219 | 0.2350 |
| J (Bai) | 0.0816 | 0.0790 | 0.0816 | 0.0837 | 0.0488 | 0.1180 |
| K (Bai, credited 0) | 0.0400 | 0.0400 | 0.0400 | 0.0400 | 0 | 0.0400 |
| L (Mu) | 0.2480 | 0.1570 | 0.2240 | 0.1648 | 0.1463 | 0.2740 |
| M (Mu) | 0.0747 | 0.0595 | 0.0707 | 0.0608 | 0.0244 | 0.0790 |
| **People, in all** | **1.5600** | **1.5600** | **1.5600** | **1.5600** | **1.3000** | **2.6000** |
| Lake: owner's originality | 0.8320 | 0.8190 | 0.8280 | 0.8164 | 1.0238 | 0 |
| Lake: the book | 0.2080 | 0.2210 | 0.2120 | 0.2236 | 0.2762 | 0 |

### Every option at every pot

Each cell is **people in all / Lake / lowest to highest person (median)**, in ETH. A, B and D scale exactly with the
pot. C doesn't quite, since its 0.6 ETH of proceeds is the same in every pot.

**S1 (three characters count, 13 people):**

| Option | 1 ETH | 2.6 ETH | 5 ETH |
| --- | --- | --- | --- |
| A, 20/80 | 0.60 / 0.40 / 0.0154–0.1141 (0.0287) | 1.56 / 1.04 / 0.0400–0.2965 (0.0747) | 3.00 / 2.00 / 0.0769–0.5703 (0.1436) |
| A, 100% DF | 0.50 / 0.50 / 0–0.1233 (0.0167), 2 get 0 | 1.30 / 1.30 / 0–0.3207 (0.0433), 2 get 0 | 2.50 / 2.50 / 0–0.6167 (0.0833), 2 get 0 |
| **B, 20/80** | **0.60 / 0.40 / 0.0154–0.1259 (0.0304)** | **1.56 / 1.04 / 0.0400–0.3273 (0.0790)** | **3.00 / 2.00 / 0.0769–0.6294 (0.1519)** |
| B, 100% DF | 0.50 / 0.50 / 0–0.1381 (0.0187), 2 get 0 | 1.30 / 1.30 / 0–0.3591 (0.0488), 2 get 0 | 2.50 / 2.50 / 0–0.6906 (0.0938), 2 get 0 |
| C, 20/80 | 0.60 / 0.40 / 0.0154–0.1237 (0.0314) | 1.56 / 1.04 / 0.0400–0.3061 (0.0787) | 3.00 / 2.00 / 0.0769–0.5799 (0.1476) |
| C, 100% DF | 0.50 / 0.50 / 0–0.1353 (0.0200), 2 get 0 | 1.30 / 1.30 / 0–0.3327 (0.0483), 2 get 0 | 2.50 / 2.50 / 0–0.6287 (0.0883), 2 get 0 |
| D, 20/80 (assumed weights) | 0.60 / 0.40 / 0.0154–0.1286 (0.0322) | 1.56 / 1.04 / 0.0400–0.3343 (0.0837) | 3.00 / 2.00 / 0.0769–0.6429 (0.1609) |
| D, 100% DF (assumed weights) | 0.50 / 0.50 / 0–0.1415 (0.0210), 2 get 0 | 1.30 / 1.30 / 0–0.3679 (0.0546), 2 get 0 | 2.50 / 2.50 / 0–0.7075 (0.1050), 2 get 0 |

**S2 (all six count, 23 people):** the 20% is 0.0087, 0.0226 or 0.0435 ETH each.

| Option | 1 ETH | 2.6 ETH | 5 ETH |
| --- | --- | --- | --- |
| A, 20/80 | 0.58 / 0.42 / 0.0087–0.0580 (0.0167) | 1.51 / 1.09 / 0.0226–0.1509 (0.0434) | 2.90 / 2.10 / 0.0435–0.2901 (0.0835) |
| A, 100% DF | 0.48 / 0.53 / 0–0.0617 (0.0100), 3 get 0 | 1.24 / 1.37 / 0–0.1603 (0.0260), 3 get 0 | 2.38 / 2.63 / 0–0.3083 (0.0500), 3 get 0 |
| **B, 20/80** | **0.59 / 0.41 / 0.0087–0.0716 (0.0186)** | **1.52 / 1.08 / 0.0226–0.1861 (0.0484)** | **2.93 / 2.07 / 0.0435–0.3580 (0.0931)** |
| B, 100% DF | 0.48 / 0.52 / 0–0.0786 (0.0124), 3 get 0 | 1.26 / 1.34 / 0–0.2044 (0.0323), 3 get 0 | 2.41 / 2.59 / 0–0.3931 (0.0621), 3 get 0 |
| C, 20/80 | 0.58 / 0.42 / 0.0087–0.0686 (0.0180) | 1.51 / 1.09 / 0.0226–0.1605 (0.0444) | 2.90 / 2.10 / 0.0435–0.2997 (0.0844) |
| C, 100% DF | 0.48 / 0.52 / 0–0.0749 (0.0117), 3 get 0 | 1.24 / 1.36 / 0–0.1723 (0.0272), 3 get 0 | 2.38 / 2.62 / 0–0.3203 (0.0512), 3 get 0 |
| D, 20/80 (assumed weights) | 0.59 / 0.41 / 0.0087–0.0727 (0.0183) | 1.52 / 1.08 / 0.0226–0.1890 (0.0476) | 2.93 / 2.07 / 0.0435–0.3635 (0.0915) |
| D, 100% DF (assumed weights) | 0.48 / 0.52 / 0–0.0800 (0.0120), 3 get 0 | 1.25 / 1.35 / 0–0.2080 (0.0312), 3 get 0 | 2.41 / 2.59 / 0–0.4000 (0.0600), 3 get 0 |

**S2, some people at 2.6 ETH (ETH):**

| Person (characters) | A, 20/80 | B, 20/80 | C, 20/80 | D, 20/80 | B, 100% DF |
| --- | --- | --- | --- | --- | --- |
| A (Zei, Bai, Gladias: 3 submissions) | 0.1335 | 0.1861 | 0.1508 | 0.1765 | 0.2044 |
| C (Zei, Seila, Mu: 3 submissions) | 0.1266 | 0.1209 | 0.1259 | 0.1172 | 0.1228 |
| B (Zei, Bai) | 0.1509 | 0.1811 | 0.1605 | 0.1890 | 0.1981 |
| N (Gladias only) | 0.0919 | 0.1087 | 0.0951 | 0.1058 | 0.1076 |
| V (Deluin only, a quiet character) | 0.1093 | 0.0764 | 0.0993 | 0.0746 | 0.0672 |
| S (Seila only) | 0.0989 | 0.0857 | 0.0954 | 0.0912 | 0.0789 |
| U (Seila, a small credit) | 0.0330 | 0.0312 | 0.0325 | 0.0320 | 0.0108 |
| H and R (credited 0) | 0.0226 | 0.0226 | 0.0226 | 0.0226 | 0 |

**The under-1% rule** (`DEEP_FUNDING.minShare`, 1%): in S2 the equal share alone is 0.87% of the pot, and **4 of the 23
people** under B with 20/80 are below 1%. Kept, the rule would send the smallest shares to the Lake and undo the 20%.
So it has to be off with 20/80 (the owner's list, item 4).

### S3: one person with 3 submissions across characters

Person A's total, S1 (two submissions, Zei and Bai) → S3 (a third, in Mu, credited 0.03), in ETH:

| Option | 1 ETH | 2.6 ETH | 5 ETH |
| --- | --- | --- | --- |
| A, 20/80 | 0.0794 → 0.0874 | 0.2064 → 0.2272 | 0.3969 → 0.4369 |
| A, 100% DF | 0.0800 → 0.0900 | 0.2080 → 0.2340 | 0.4000 → 0.4500 |
| **B, 20/80** | **0.1054 → 0.1057** | **0.2740 → 0.2749** | **0.5269 → 0.5287** |
| B, 100% DF | 0.1125 → 0.1129 | 0.2925 → 0.2936 | 0.5625 → 0.5647 |
| C, 20/80 | 0.0954 → 0.1010 | 0.2224 → 0.2408 | 0.4129 → 0.4505 |
| C, 100% DF | 0.1000 → 0.1070 | 0.2280 → 0.2510 | 0.4200 → 0.4670 |
| D, 20/80 (assumed) | 0.0986 → 0.1034 | 0.2563 → 0.2688 | 0.4929 → 0.5169 |
| D, 100% DF (assumed) | 0.1040 → 0.1100 | 0.2704 → 0.2860 | 0.5200 → 0.5500 |

What this shows:

- **The 20% doesn't grow with more submissions:** A's equal share is 0.04 ETH at 2.6 ETH in both S1 and S3.
- **Under A, a third entry in a quiet character pays about 10% more,** because Mu's third of the pot is shared by
  few people. That rewards spreading entries to the quietest characters.
- **Under B, it pays almost nothing extra** (0.2740 → 0.2749), since A gets only the credit the result gives that
  entry. But B moves weight: Mu's 4th submitter raises Mu's part, so the others there gain (L 0.1570 → 0.1868, M
  0.0595 → 0.0645) and the other characters' makers lose a little (B 0.3273 → 0.3104, I 0.1375 → 0.1318). Each
  submitter counts once per character and must pass the eligibility check at publish (a Farcaster account with a
  Neynar score of at least 0.7), which is what limits "bring friends to my character".
- **Three submissions in one character** count once toward that character's weight under B and once for the 20%. Only
  the deep funding result can give that person more, if the final used more of their versions.

### Missing addresses: redistribution

Anyone without a confirmed address by the deadline has their share **shared among the other people paid, in
proportion to what each already gets.** Nothing goes to the team. B with 20/80:

| Scenario | Pot | Missing | Shared out | Among | e.g. A | e.g. H (credited 0) | e.g. L |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 1 | E, K | 0.0428 | 11 people | 0.1054 → 0.1135 | 0.0154 → 0.0166 | 0.0604 → 0.0650 |
| S1 | 2.6 | E, K | 0.1112 | 11 people | 0.2740 → 0.2950 | 0.0400 → 0.0431 | 0.1570 → 0.1691 |
| S1 | 5 | E, K | 0.2138 | 11 people | 0.5269 → 0.5674 | 0.0769 → 0.0828 | 0.3019 → 0.3251 |
| S2 | 1 | E, K, R | 0.0327 | 20 people | 0.0716 → 0.0758 | 0.0087 → 0.0092 | 0.0335 → 0.0355 |
| S2 | 2.6 | E, K, R | 0.0850 | 20 people | 0.1861 → 0.1971 | 0.0226 → 0.0239 | 0.0872 → 0.0923 |
| S2 | 5 | E, K, R | 0.1635 | 20 people | 0.3580 → 0.3791 | 0.0435 → 0.0460 | 0.1676 → 0.1775 |

Each person's total grows by the same factor (the shared-out amount over the others' total: 7.7% in S1, 5.9% in S2).
The people's total stays the same (1.56 ETH in S1 at 2.6 ETH), and the Lake's share is unchanged. A sanctions hit
(section 17) is shared out the same way.

### The open question: all distributed, or the Lake at about 40%?

The owner's words are "All of it is distributed by the deep funding result." That can mean two different things:

- **Version 1, the Lake as built.** The result names the final's originality share (the owner's) and the book's share,
  and the runner sends both to the Lake (the Fund account). Then **about 40% of the pot goes back to the team.**
- **Version 2, all to participants.** Those two shares are shared among each character's makers, in proportion to
  their credit there. **The whole pot goes to the people who entered.** `DEEP_FUNDING.bookRecipient` is then not
  needed for the challenge.

B with 20/80, in ETH:

| Scenario | Pot | V1: people | V1: Lake | V1: A | V1: L | V1: H | V2: people | V2: A | V2: L | V2: H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 1 | 0.6000 | 0.4000 | 0.1054 | 0.0604 | 0.0154 | 1.0000 | 0.1954 | 0.1054 | 0.0154 |
| S1 | 2.6 | 1.5600 | 1.0400 | 0.2740 | 0.1570 | 0.0400 | 2.6000 | 0.5080 | 0.2740 | 0.0400 |
| S1 | 5 | 3.0000 | 2.0000 | 0.5269 | 0.3019 | 0.0769 | 5.0000 | 0.9769 | 0.5269 | 0.0769 |
| S2 | 1 | 0.5862 | 0.4138 | 0.0716 | 0.0335 | 0.0087 | 1.0000 | 0.1345 | 0.0584 | 0.0087 |
| S2 | 2.6 | 1.5241 | 1.0759 | 0.1861 | 0.0872 | 0.0226 | 2.6000 | 0.3497 | 0.1517 | 0.0226 |
| S2 | 5 | 2.9310 | 2.0690 | 0.3580 | 0.1676 | 0.0435 | 5.0000 | 0.6724 | 0.2918 | 0.0435 |

- **Version 1** sends 40% to the Lake in S1 and 41% in S2. Everyone with credit gets a little over half of their
  Version 2 amount (A 0.2740 against 0.5080 in S1 at 2.6 ETH).
- **Version 2:** the medians at 2.6 ETH are 0.1180 ETH in S1 and 0.0764 in S2, against 0.0790 and 0.0484. Those
  credited 0 (H, K, R) get the same 20% share either way.

**Which to choose** is the owner's call (the owner's list, item 3). Proposed: **Version 2**. The pot is the owner's
winnings, given to the contest, and Version 1 would announce a pot of which 40% comes back to the team. Version 1 is
right if the originality share is meant to fund the project. If so, the challenge page should say "about 60% to the
people who entered" before anyone enters.

### Recommendation

**B (by number of submitters) with 20/80, Version 2 (all to participants), one pot in one split on Base.**

- **Each person's expected share doesn't depend on which character they picked.** Under A, a third entry in a quiet
  character pays about 10% more, and Mu's 3 people share a whole third of the pot (L gets 0.2480 under A and 0.1570
  under B, at 2.6 ETH in S1).
- **Sales don't decide anyone's payout,** which is C's weakness. Principle 7 is about scoring and ordering, but under
  C a maker's payout would depend on how well a token sold.
- **D isn't feasible** without cross-character judgments the runner doesn't ask for and the jury can't give.
- **The 20% means everyone eligible gets something:** at least 0.0087 ETH (about $20) in the busiest case at 1 ETH,
  and 0.0400 ETH (about $92) in S1 at 2.6 ETH. It replaces the under-1% rule, which must be off.
- **The numbers for the recommendation** (B, 20/80, Version 2; $ at $2,303 per ETH):

| | 1 ETH | 2.6 ETH | 5 ETH |
| --- | --- | --- | --- |
| S1 (13 people): lowest / median / highest | 0.0154 / 0.0454 / 0.2364 ($35 / $104 / $544) | 0.0400 / 0.1180 / 0.6146 ($92 / $271 / $1,415) | 0.0769 / 0.2269 / 1.1819 ($177 / $522 / $2,722) |
| S2 (23 people): lowest / median / highest | 0.0087 / 0.0294 / 0.1345 ($20 / $67 / $309) | 0.0226 / 0.0764 / 0.3497 ($52 / $175 / $805) | 0.0435 / 0.1469 / 0.6724 ($100 / $338 / $1,548) |
| The Lake | 0 | 0 | 0 |

  With Version 1 instead (the Lake as built), the people get 60% of these pots, and the lowest stays the same: S1 at
  2.6 ETH, 0.0400 / 0.0790 / 0.3273, with 1.04 ETH to the Fund account.
- **One pot means one split:** a PushSplit with owner `address(0)` holding every recipient (and the Fund account in
  Version 1). Every token's payout is that split, and the winnings are sent into it. On Base the winnings and the
  proceeds are already on one chain (section 18).

Weights are by distinct **eligible** submitters, counted once per character, as stored at publish
(`studio.challenge_eligibility`). An admin's or ineligible maker's entry counts toward neither a character's weight nor
its three submitters.

### What changes in the runner (when approved; not done)

- `decide` takes every counting character at once and writes one pot table: the character weights (A, B or C), the
  equal part, each FID's total, and the Lake rows (none in Version 2).
- A new setting, `DEEP_FUNDING.pot`: `{ across: 'submitters', equalShare: 0.2, toLake: false }`, and `minShare: 0`.
- `DEEP_FUNDING.lake` points at the Fund account (`FUND.address`, branch `fund-page`). On this branch it is still
  `SUPPORT.address` (`0x93eC…73a3`).
- Rule 5 ("no usable address → Lake") becomes "no address by the deadline → shared among the others, pro rata". The
  results file lists the redistributed total, without names.
- "Usable" means usable on the mint's chain. Today `src/lib/deep-funding/payout.ts` and `scripts/deep-funding.ts` say
  mainnet; with Base, both check chain 8453 (and `test-deep-funding.ts`'s rule 5 test changes with them).
- Allocations stay in millionths, adding up to exactly 1,000,000, one row per address.
- The results record (`snowmoon.challenge.results/1`, `docs/proposals/challenge-record.md`) gains a `pot` section:
  weights, equal share, totals by FID.

### How the numbers were made

A short Python calculator, kept outside the repository: for each character, its part is
(1 − equal) × pot × weight; within it, each maker gets that part × their credit, and (Version 1) the owner's and the
book's shares go to the Lake. The equal part is pot × 0.2 / the number of people. A missing person's total is shared
among the others, pro rata. Its S1 results match the first draft's worked example to the fourth decimal (for example,
A 0.2740 under B with 20/80, and the redistribution after E and K).

## 17. Payout addresses

**The rule** (owner, 2026-11-04):

- Addresses are asked **only of the people being paid**, and **only after the results**. Entering never asks for one.
- Each recipient chooses one of two options:
  - **"Use your wallet"**: a Farcaster-verified address, or a wallet they sign in with;
  - **"Create a passkey wallet"**: for people without one.
- A **deadline** comes before the split is made. Anyone without an address by then has their share **shared among
  the others** (above), not sent to the team.

### When

**The challenge is admin-only for now** (`CHALLENGE.public: false`, owner, 2026-11-04). The dates in
`CHALLENGE.dates` stay as written until the owner sets a new open date. Nothing opens by date alone (P6u). The payout
follows the open date:

| Step | Today's config | Offset from the open | Moves with the open? |
| --- | --- | --- | --- |
| Entries open | Fri 6 Nov 09:00 PT | 0 | the owner sets it |
| Entries close | Sun 22 Nov 23:59 PT | +16 days 15 h | yes |
| Shortlist and jurors | Tue 1 Dec to Thu 3 Dec | +24 to +27 days | yes |
| Results | Fri 4 Dec 09:00 PT | +28 days | yes |
| **Address deadline** (proposed, not in the config yet) | **Mon 7 Dec 12:00 PT** | **results + 3 days 3 h** | yes |
| The split is made, tokens created | Mon 7 Dec 12:00 to Tue 8 Dec 09:00 | before the mint | yes |
| Mint open | Tue 8 Dec 09:00 to Fri 18 Dec 09:00 PT | +32 to +42 days | yes |

**What moves with a new open date:**

- every date in `CHALLENGE.dates`, and a new `payoutConfirmCloses`;
- the README's `start` and `end` unix times for `createToken` (nothing is deployed, so nothing on chain changes);
- the address screen's sentence ("by Monday 7 December, 12:00 Pacific");
- the ETH price and the pot in dollars;
- **the tax timing.** The mint's proceeds are distributed after the mint closes (open + 42 days), and the winnings
  are sent into the split before the mint opens (open + about 32 days). An open date after about 19 November puts
  the proceeds' payout into 2027, and one after about 29 November puts the winnings' payout there too. A question
  for the tax adviser (item 9).
- the Pacific offset: these dates are all in PST (UTC−8). A window past 14 March 2027 would cross into PDT (UTC−7).

Three days is short. A longer deadline means a later mint, since each token's payout is fixed at `createToken`.
Proposed, since the dates are being reset anyway: **7 days from the results** to the address deadline, with the mint
opening the next day (the owner's list, item 5).

### The screens

Who sees them: a recipient (an FID on the results' recipients list, committed with the results) who signs in sees a
card on /you and on /challenge: "You're in the results: 0.0712 ETH. Choose where it goes by Monday 7 December, 12:00
Pacific, or it's shared among the others." Nobody else sees the screen or can store an address.

**Use your wallet:**

- The server reads the person's verified Ethereum addresses from Neynar (Neynar receives their FID, at that moment
  only) and offers the primary one, selected, with the others as choices. These addresses are already proven by
  Farcaster.
- **Another wallet:** signing in with it on the same screen (the site's Sign-In with Ethereum,
  `src/lib/wallet/session.ts`, checked on Base, so smart wallets work). This proves control, so there's no free-text
  address box.

**Create a passkey wallet:**

- A short explainer: "A passkey wallet lives on your phone or computer, unlocked with your fingerprint or face. No
  app, no seed phrase. It's made by Coinbase (Base Account); the site never holds it."
- The button "Create one with Coinbase" opens Coinbase's sign-up (Sign in with Base) in its own window. Once it's
  made, the same window signs our sign-in message, so the address is proven like any other wallet.

**Confirm:**

> Your 0.0712 ETH will go to 0x12…ab on Base, through a split contract that can't be changed once made. Check that
> you control this address on Base: payments to it can't be reversed.

Button: "Confirm". It can be changed until the deadline; after that, nothing changes.

### Checks before anything is stored (our server)

- **Works on Base.** `eth_getCode` on Base.
  - An ordinary wallet, an EIP-7702 delegation, or a deployed contract wallet: accepted.
  - A smart wallet not deployed yet (a new Base Account): accepted when its sign-in signature checks out
    (ERC-6492). The address is fixed by the passkey, so ETH sent to it waits there until its first transaction
    deploys it.
- **Sanctions:** Chainalysis' sanctions oracle by `eth_call`, so no screening service receives the address beyond our
  RPC. Its contract address on Base is **to confirm** before this is built. A hit is refused with a neutral message,
  and the share is shared among the others.

### What's stored

A sketch, not a file:

```sql
-- NEXT_payout_addresses.sql (sketch). MUST RUN AS postgres. RLS on; studio_writer select and insert only.
create table studio.payout_confirmations (
  id bigint generated always as identity primary key,
  challenge text not null check (challenge ~ '^[a-z0-9-]{1,40}$'),
  fid bigint not null check (fid > 0),
  chain_id int not null check (chain_id = 8453),
  address text not null check (address ~ '^0x[0-9a-fA-F]{40}$'),
  source text not null check (source in ('farcaster-primary', 'farcaster-verified', 'signed-wallet', 'passkey-wallet')),
  wallet_kind text not null check (wallet_kind in ('ordinary', 'delegated', 'contract', 'undeployed-smart')),
  checked_block bigint not null,
  sanctions_clear boolean not null check (sanctions_clear),
  confirmed_at timestamptz not null default now()
);
```

- One row per confirmation, append-only; the latest counts. A failed check stores nothing. Only FIDs on the
  recipients list may insert (checked by the route).
- **No amounts in the table**: the shares are in the public results file.
- **Retention:** rows are deleted 90 days after the split is made. The addresses stay public in the split on chain.
- Nothing about wallets is read or stored at publish, or for anyone not on the list.

### Privacy and Terms lines (DRAFT, for the owner's reread; they ship with the feature, never ahead)

**Privacy §4 (Kept by us when you sign in), a new item:**

> If the remix challenge's results pay you and you choose a payout address: the address, how you chose it (a verified
> Farcaster address, a wallet you signed in with, or a passkey wallet you created), the result of our checks (that it
> can receive on Base and is not on the sanctions list), and when you confirmed it. The address is written, with your
> share, into a split contract on Base, where it is public and permanent. We delete our record of it 90 days after the
> split is made. We ask no one else for an address, and never to enter.

**Privacy §7 (Outside services), added to the Neynar item:**

> If the results pay you, Neynar receives your Farcaster ID when you open "Choose where your payout goes", to read your
> verified addresses.

**Privacy §7, new items:**

> To check a payout address, our Base provider (Base's public endpoint) receives the address, to read whether it holds
> a contract and to ask the Chainalysis sanctions list on Base whether it is listed.

> If you choose "Create a passkey wallet", Coinbase makes the wallet in its own window, under its own terms and
> privacy policy; we receive only the address and its signature.

**Terms, a new section after 6e:**

> **6f. Payouts.** If the results pay you, you may choose an address on Base for your share by the date the challenge
> page gives. Choose only an address you control on Base: payments to it can't be reversed, and the split it goes into
> can't be changed. We may refuse an address that can't receive on Base or that is on a sanctions list. If you don't
> choose a usable address in time, your share is shared among the other people paid.

**Terms §6e needs a change too:** today it says "One entry per person per character: your latest version counts unless
you mark another" (`src/lib/legal.ts`; the challenge's own wording in `src/lib/challenge/wording.ts` says the same).
The owner's rule is now up to 3 submissions per person, for any characters. The new words wait for the owner to say
whether three in one character are allowed (the owner's list, item 11), and need the owner's reread.

### The passkey wallet: what is simplest today

Checked 2026-11-03. The live help pages refused the fetch tool in places, and that's marked below.

- **Coinbase's Base Account** (formerly Coinbase Smart Wallet) is the simplest option. Its docs have moved:
  - docs.base.org's Base Account pages now say "The Base Account SDK and Base MCP documentation has moved from Base
    docs to Coinbase Developer Platform", and that the Base Account SDK is now the Coinbase Wallet SDK
    (<https://docs.base.org/base-account/overview/what-is-base-account.md>, read 2026-11-03).
  - Coinbase Developer Platform's overview
    (<https://docs.cdp.coinbase.com/coinbase-wallet/overview>, read 2026-11-03, through the fetch tool's summary) says
    "Use Sign in with Base to authenticate with a passkey — no password, no email round-trip", that one passkey works
    across Base-enabled apps with "no installs, seed phrases, or network switches", and that the SDK to use for now is
    `@base-org/account`. It calls the consumer app "Coinbase Wallet (formerly known as Base App)".
  - Coinbase's help page on passkeys (<https://help.coinbase.com/en-gb/wallet/getting-started/smart-wallet-passkeys>)
    refused the fetch (HTTP 403). A search summary of it says sign-in at keys.coinbase.com works with passkeys, email
    passcodes or a recovery phrase. **Not read directly.**
  - The older Smart Wallet docs, via a search summary, not re-read live: the same address on every supported network
    (Base and Ethereum among them), deployed on its first transaction. Coinbase's own network page now redirects to
    the moved docs. **To re-read before building.**
- **Why it fits:**
  - it's free for the person, with no app or extension;
  - it works on Base, where the payout would be;
  - it signs our existing sign-in message (ERC-6492, which `src/lib/wallet/chain.ts` already checks on Base);
  - we never hold a key.
- **The cost to principle 6:** the SDK opens Coinbase's window, and may send Coinbase its own telemetry.
  - Proposed: load it only on the payout screen, only after the person taps "Create one with Coinbase", with
    telemetry off if the SDK allows it (**to check**).
  - Name Coinbase in Privacy §7, as above.
  - Add a P6 check that the SDK is imported nowhere else.
  - This is a narrow, opt-in exception to "production pages make no third-party requests" (the owner's list, item 6).
- **Alternatives:**
  - **The Farcaster app's own wallet.** Most recipients already have it, and its address is usually their verified
    one, so "Use your wallet" covers them with no new wallet at all. This is likely the most common path.
  - **Embedded-wallet services** (Privy, Dynamic, Web3Auth and the like). They need an account with them, their
    scripts on our page, and they hold key shares. Rejected: more to trust, and more third-party requests.
  - **Paste an address and type its last six characters to confirm.** No proof of control, but the person is signed
    in with Farcaster, so the risk is only theirs. A fallback if the SDK exception is refused.
  - **A Safe.** Too much setup for one payout.

## 18. The mint's chain

Compared (owner, 2026-11-04):

- **Keep** Snowmoon WIP on Ethereum mainnet, as built (`contracts/snowmoon-wip`).
- **Move** it to Base, and anchor the challenge record on mainnet in one transaction.

**Nothing has been changed; the owner decides.** The sale window in the README (unix `1796749200` → `1797613200`,
Tue 8 Dec 09:00 PST to Fri 18 Dec 09:00 PST, end exclusive) moves with the open date (section 17).

### Today's readings (2026-11-04, 08:05 to 08:09 UTC)

**Gas prices,** from public RPC (`eth_gasPrice`, `eth_getBlockByNumber`, `eth_feeHistory` with the 50th percentile tip),
read 08:05:40 UTC:

| | Ethereum mainnet (ethereum-rpc.publicnode.com) | Base (mainnet.base.org) |
| --- | --- | --- |
| `eth_gasPrice` | **0.0621 gwei** | **0.00603 gwei** |
| Latest block's base fee | 0.0621 gwei (block 26,340,140, 08:05:35 UTC) | 0.00503 gwei (block 53,495,097, 08:05:41 UTC) |
| Base fee, last 20 blocks | 0.0588 to 0.0682, median 0.0633 gwei | 0.00500 to 0.00503, median 0.00500 gwei |
| Base fee, last 1,024 blocks | 0.0283 to 0.1282, median 0.0435 gwei (about 3.4 hours) | 0.00500 to 0.00522, median 0.00500 gwei (about 34 minutes) |
| Median tip (p50) | 0.0094 gwei | 0.0012 gwei |
| Base's L1 data fee | n/a | from Base's GasPriceOracle (`0x4200…000F`), 08:08:58 UTC: L1 base fee 0.0635 gwei, blob base fee 0.0038 gwei. For the deploy's 9,901 bytes, 0.0000000343 ETH (under $0.0001); for a mint's 100 bytes, 0.0000000006 ETH; for a 30-recipient distribute's 2,212 bytes, 0.0000000048 ETH |

**The ETH price:** **$2,303.03**, Chainlink's ETH/USD feed on Ethereum (`0x5f4e…8419`, `latestRoundData`, round
updated 07:27:35 UTC, read 08:05:50 UTC). Cross-checks: Chainlink's ETH/USD on Base, $2,306.54 (updated 08:05:19 UTC);
Coinbase's public spot price (`api.coinbase.com/v2/prices/ETH-USD/spot`, no key), $2,308.20 at 08:05:50 UTC.

**Gas used:** measured on local `anvil` forks of each chain (nothing sent to any network). The contract was built
with forge 1.7.1, solc 0.8.28, OpenZeppelin v5.7.0. The real Splits v2.2 factory was used, with the Fund account as a
recipient and fresh addresses for the rest. These are receipts' `gasUsed`, so intrinsic and calldata gas are included;
mainnet and Base give the same numbers to within 12 gas. `forge test --gas-report` (52 passed, 1 skipped) agrees:
deploy 2,011,180 before calldata, `createToken` median 145,599 with a short URI, and `mint` median 76,307.

| Step | Gas | Mainnet today (0.0621 gwei) | Mainnet at 1 gwei | Mainnet at 10 gwei | Base today (0.00603 gwei) |
| --- | --- | --- | --- | --- | --- |
| Deploy the contract | 2,078,714 | 0.000129 ETH, $0.30 | $4.79 | $47.87 | 0.0000126 ETH, $0.029 |
| `createToken` (one per counting character, up to 6) | 214,256 | $0.031 | $0.49 | $4.93 | $0.003 |
| Create the split, 30 recipients (15: 197,443; 45: 276,272) | 236,757 | $0.034 | $0.55 | $5.45 | $0.003 |
| A buyer's mint, a new holder | 67,973 | 0.0000042 ETH, **$0.010** | $0.16 | **$1.57** | 0.00000041 ETH, **$0.0009** |
| The token's very first mint | 102,175 | $0.015 | $0.24 | $2.35 | $0.0014 |
| A holder minting again | 50,875 | $0.007 | $0.12 | $1.17 | $0.0007 |
| 10 editions in one mint | 67,963 | $0.010 | $0.16 | $1.57 | $0.0009 |
| 10 mints by 10 new buyers (total) | 679,726 | $0.097 | $1.57 | $15.65 | $0.0095 |
| `release` (proceeds to the split) | 39,688 | $0.006 | $0.09 | $0.91 | $0.0006 |
| Distribute, 15 recipients, all new to the chain | 556,663 | $0.080 | $1.28 | $12.82 | $0.008 |
| Distribute, 30 recipients, all new to the chain | 1,092,776 | **$0.156** | $2.52 | **$25.17** | **$0.015** |
| Distribute, 30 recipients, all known to the chain | 367,776 | $0.053 | $0.85 | $8.47 | $0.005 |
| Distribute, 45 recipients, all new to the chain | 1,629,065 | $0.233 | $3.75 | $37.52 | $0.023 |
| The mainnet anchor (323 bytes: 2 CIDs, 2 sha256s) | 33,920 | **$0.005** | $0.08 | $0.78 | (on mainnet either way) |

- **Notes on the table:**
  - The 1 and 10 gwei columns are **assumptions** for a busy week, not readings. The highest base fee in the last
    1,024 blocks was 0.128 gwei.
  - Base's L1 data fee adds under $0.0001 to each row.
  - "New to the chain" means an address that has never held anything there, which costs 25,000 more gas for each
    recipient. A new passkey wallet is one of these.
  - **Per payout:** about 35,700 gas for each recipient new to the chain, and about 10,700 for one already known. On
    mainnet today that's $0.005 for each recipient, or $0.83 at 10 gwei. On Base it's $0.0005.
  - **The anchor** costs 33,920 gas because EIP-7623's calldata floor applies: 21,000 plus 40 gas per nonzero byte.
    It's the same transaction under either choice, if the owner wants a mainnet anchor at all.
- **A buyer's cost against the price** (0.003 ETH, $6.91): on mainnet today, 0.14%. At 10 gwei, 23%. On Base, 0.01%.

### Mainnet vs Base

| | Keep on mainnet | Move to Base, anchor on mainnet |
| --- | --- | --- |
| **The owner's setup** (deploy + 6 `createToken` + one split + 6 `release` + one distribute to 30 new addresses) | about $0.71 today; about $114 at 10 gwei | about $0.07 |
| **A buyer's mint** | $0.010 today; $1.57 at 10 gwei (23% of the price) | $0.0009 |
| **Each recipient's payout** (paid by whoever calls distribute) | $0.005 today; $0.83 at 10 gwei | $0.0005 |
| **Buyers' wallets** | need ETH on mainnet. Most of this audience (the Farcaster app's wallet, Coinbase Wallet / the Base app) holds ETH on Base by default, and would have to bridge or switch first. Likely, not measured | ETH on Base, where those wallets already are. The mini app can mint in one tap |
| **Recipients' wallets** | a new passkey wallet receives ETH on mainnet, but must deploy itself there, paying mainnet gas, before it can move anything | deployed cheaply on Base, often sponsored by the wallet |
| **The pot** (winnings are ETH on Base) | the proceeds are on mainnet and the winnings on Base. Either **two splits** with the same allocations (one per chain; `createSplitDeterministic` with the same salt and factory gives the same address on both, **to confirm**), so every recipient is paid on two chains; or the owner **bridges** one side | **one chain:** the winnings and every token's proceeds go into **one** split |
| **Bridging** | mainnet → Base, the native bridge's deposit: a few minutes and one mainnet transaction. Base → mainnet, the native bridge's withdrawal: about 7 days (the fault-proof window), plus prove and finalize transactions on mainnet; third-party bridges are faster for a fee. General knowledge, not read today | none for the pot. A recipient who wants their share on mainnet bridges it themselves |
| **Splits v2 code** (`eth_getCode`, 08:05:50 UTC, mainnet block 26,340,141, Base block 53,495,104) | PushSplitFactory v2.2 `0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4`: 3,030 bytes; v2.1 `0xDc6259E13ec0621e6F19026b2e49D846525548Ed`: 3,022; SplitsWarehouse `0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8`: 12,146 | **the same three addresses, the same sizes:** 3,030, 3,022 and 12,146 bytes |
| **The Fund account** `0xe29f…19d5` | 61 bytes (the proxy), set up (tx `0xd9c5…a68a`) | 61 bytes, set up (tx `0xac87…051d`) |
| **The fork test** (`test/fork/PushSplitFork.t.sol`) | passes, 2 of 2 | passes, 2 of 2, against Base's public RPC (2026-11-03; with the Fund account on branch `fund-page`, 2026-11-04) |
| **Time** | 12-second blocks; final after 2 epochs, about 13 minutes | 2-second blocks (with sub-second preconfirmations); safe once the batch is posted to mainnet, usually minutes; final when that mainnet block is final, roughly 15 to 30 minutes. General knowledge, not read today |
| **Gas risk** | fees can jump 10 to 100 times in a busy week: $0.01 to $1.57 a mint at 10 gwei | negligible |
| **"Referenced on Ethereum"** (Terms §6e) | true: every token references the record | true through the anchor transaction, if it's made before the tokens and the tokens name it |
| **Provenance** | some collectors value mainnet | a Base token is an Ethereum L2 token; its record is anchored on mainnet |

**Recommendation: move to Base and anchor on mainnet.** Gas doesn't decide it: mainnet is cheap today, with a mint at
about a cent, and even at 10 gwei the owner's setup is about $114. What decides it:

- **One chain for the pot.** The winnings are already on Base, so the pot, the proceeds, the split and the payouts are
  all in one place, with no bridge and no second split.
- **Buyers mint where their ETH already is.**
- **New passkey wallets work** without paying mainnet gas to deploy.
- **No gas risk** for a $7 edition.
- **The record stays referenced on Ethereum** by one transaction of about $0.005.

### What changes if Base is chosen (DRAFT diffs, not applied)

**The contract: no Solidity changes.** Base runs the Cancun EVM the contract is built for, including the transient
storage `ReentrancyGuardTransient` uses. The window's unix times work the same, since Base block times are also UTC
seconds. Only the fork test's variable name changes:

```diff
--- a/contracts/snowmoon-wip/test/fork/PushSplitFork.t.sol
+++ b/contracts/snowmoon-wip/test/fork/PushSplitFork.t.sol
@@
-/// @notice Mainnet-fork test: SnowmoonWIP pays a Splits v2 PushSplit that has a recipient rejecting ETH.
+/// @notice Fork test (Base, or mainnet): SnowmoonWIP pays a Splits v2 PushSplit that has a recipient rejecting ETH.
 /// @dev Read-only fork; nothing is sent to any network. Run with:
-///      MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com forge test --match-path test/fork/PushSplitFork.t.sol -vv
-///      Skipped when MAINNET_RPC_URL is unset. The same addresses exist on Sepolia (11155111).
+///      FORK_RPC_URL=https://mainnet.base.org forge test --match-path test/fork/PushSplitFork.t.sol -vv
+///      Skipped when FORK_RPC_URL is unset. The same addresses exist on Ethereum (1), Sepolia and Base Sepolia.
@@
-        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
+        string memory rpc = vm.envOr("FORK_RPC_URL", string(""));
```

**The contract's README** (against this branch's copy, which matches `main`; branch `fund-page` also edits these
sections, so the hunks are rebased onto it at merge):

```diff
--- a/contracts/snowmoon-wip/README.md
+++ b/contracts/snowmoon-wip/README.md
@@ ## Build and test
-MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com \
-  forge test --match-path test/fork/PushSplitFork.t.sol -vv   # mainnet-fork test, read-only
+FORK_RPC_URL=https://mainnet.base.org \
+  forge test --match-path test/fork/PushSplitFork.t.sol -vv   # Base-fork test, read-only
@@
-The fork test creates real Splits v2 PushSplits (v2.1 and v2.2 factories) on a local fork of mainnet.
+The fork test creates real Splits v2 PushSplits (v2.1 and v2.2 factories) on a local fork of Base.
@@ ## Splits v2 addresses
-These come from `packages/splits-v2/deployments/1.json` and `11155111.json` in [0xSplits/splits-contracts-monorepo](…). The addresses are the same on mainnet and Sepolia, and the code was checked present on both on 2026-10-31.
+These come from `packages/splits-v2/deployments/8453.json` (Base), `84532.json` (Base Sepolia) and `1.json` in [0xSplits/splits-contracts-monorepo](…). The addresses are the same on Base, Base Sepolia and mainnet; the code was checked present on Base and mainnet on 2026-11-04 (3,030, 3,022 and 12,146 bytes).
@@ ## Deploy checklist (for the owner)
-`$RPC` is any RPC URL: `https://ethereum-sepolia-rpc.publicnode.com` for Sepolia, or `https://ethereum-rpc.publicnode.com` for mainnet.
+`$RPC` is any RPC URL: `https://sepolia.base.org` for Base Sepolia, or `https://mainnet.base.org` for Base. The anchor (step 4) is the one mainnet transaction: `https://ethereum-rpc.publicnode.com`.
@@ ### 0. Before any deploy
-MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com \
+FORK_RPC_URL=https://mainnet.base.org \
   forge test --match-path test/fork/PushSplitFork.t.sol -vv   # must show 2 passed, not skipped
@@
-### 1. Sepolia dry run
+### 1. Base Sepolia dry run
 
-Do the whole run with Sepolia ETH; make the window short.
+Do the whole run with Base Sepolia ETH; make the window short.
@@ ### 2. Verify the source
-forge verify-contract <WIP> src/SnowmoonWIP.sol:SnowmoonWIP --chain sepolia --watch \
+forge verify-contract <WIP> src/SnowmoonWIP.sol:SnowmoonWIP --chain base-sepolia --watch \
@@
-Once it's verified, Etherscan's "Write Contract" tab can mint and release without the site.
+Once it's verified (Basescan; the same Etherscan API key works), its "Write Contract" tab can mint and release without the site.
@@
-### 3. Mainnet
+### 3. Base
@@
-   - check every recipient address works on mainnet and screen it;
-   - create its PushSplit (you sign);
-   - before `createToken`, read the split's `owner()` (must be `0x0…0`) and its `cast codesize` on mainnet (must be above 0), as in step 1.3;
+   - one split for the whole pot (docs/proposals/challenge-payout.md): check every recipient address works on Base and screen it;
+   - create the PushSplit once (you sign); every token uses it;
+   - before `createToken`, read the split's `owner()` (must be `0x0…0`) and its `cast codesize` on Base (must be above 0), as in step 1.3;
+   - pin the records and send the anchor (step 4) before writing any token's metadata, which names the anchor;
@@
+### 4. The mainnet anchor (you sign, once, before the tokens' metadata)
+
+`npm run challenge-record -- anchor` prints the data and the command. It's one 0 ETH transaction from your own
+wallet to your own address on Ethereum mainnet (about 34,000 gas):
+
+```sh
+cast send <YOUR_ADDRESS> <0x… data it prints> --value 0 --rpc-url https://ethereum-rpc.publicnode.com --browser
+```
+
+Write the transaction hash into each token's metadata as `record_anchor` (`eip155:1:tx:<hash>`).
```

**`scripts/challenge-record.ts`:** the records don't change (no chain in the entries record). A new `anchor` step
prints the mainnet transaction for the owner to send. It sends nothing:

```diff
--- a/scripts/challenge-record.ts
+++ b/scripts/challenge-record.ts
@@
- *   npm run challenge-record -- entries
+ *   npm run challenge-record -- entries
+ *   npm run challenge-record -- anchor
@@
+ * `anchor` (the mint on Base, docs/proposals/challenge-payout.md §18) reads challenge-record-out/entries.json and
+ * results.json, and PRINTS one Ethereum mainnet transaction for the owner to send from his own wallet: 0 ETH, to his
+ * own address, with the records' CIDs and sha256s as its data. Nothing is signed or sent here.
-import { mkdirSync, writeFileSync } from 'node:fs';
+import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
@@
 async function main() {
+  if (args[0] === 'anchor') return anchor();
   if (args[0] !== 'entries') {
-    console.log('usage: challenge-record entries (see the file header)');
+    console.log('usage: challenge-record entries | anchor (see the file header)');
     process.exit(2);
   }
@@
+/** The anchor's data: fixed text, so anyone can read it on Etherscan as UTF-8. */
+export function anchorText(entries: Uint8Array, results: Uint8Array): string {
+  const e = offlineCid(entries), r = offlineCid(results);
+  if (!e || !r) throw new Error('a record is over one 1 MiB chunk: compute its CID with kubo first');
+  return `snowmoon-challenge-record/1 entries=${e} results=${r} entries-sha256=${sha256Hex(entries)} results-sha256=${sha256Hex(results)}`;
+}
+
+function anchor() {
+  const entries = readFileSync(path.join(OUT, 'entries.json'));
+  const results = readFileSync(path.join(OUT, 'results.json')); // the results record, not built yet
+  const text = anchorText(entries, results);
+  const data = `0x${Buffer.from(text, 'utf8').toString('hex')}`;
+  console.log(`anchor text (${text.length} bytes): ${text}`);
+  console.log('nothing was sent. The owner sends it on Ethereum mainnet from his own wallet (about 34,000 gas):');
+  console.log(`  cast send <YOUR_ADDRESS> ${data} --value 0 --rpc-url https://ethereum-rpc.publicnode.com --browser`);
+  console.log('then writes the hash into each token\'s metadata: "record_anchor": "eip155:1:tx:<hash>"');
+}
```

`test-challenge-record.ts` would gain a check that `anchorText` is the same for the same bytes, changes when one byte
changes, and fits in one transaction's data. The results record and each token's metadata gain
`"chain": "eip155:8453"`, the split's address on Base, and `"record_anchor": "eip155:1:tx:<hash>"`
(`docs/proposals/challenge-record.md`). **The order:** pin the records, anchor, write and pin the metadata, then
`createToken` on Base. The anchor comes before the metadata that names it.

**Principle 7's text** (`docs/principles.md`; the owner's own wording of 2026-10-31, so the owner rewords it):

```diff
--- a/docs/principles.md
+++ b/docs/principles.md
@@ ## 7.
-collectible, with no royalties and no promises: Snowmoon WIP, open editions on Ethereum mainnet from
-`contracts/snowmoon-wip`, whose price and terms are fixed when each token is created; buying one changes nothing on
-the site.
+collectible, with no royalties and no promises: Snowmoon WIP, open editions on Base (an Ethereum layer 2) from
+`contracts/snowmoon-wip`, whose price and terms are fixed when each token is created, with the challenge record
+anchored on Ethereum mainnet; buying one changes nothing on the site.
```

No check reads that sentence (P7b checks the contract's code, not the chain).

**Other wording that would change:**

- `docs/proposals/challenge-record.md`: "the splits are created on mainnet" becomes one split on Base;
- the plan's "minted on Ethereum mainnet";
- the runner's "usable mainnet address" (section 16).

The mint sentence on /challenge names no chain, and Terms §6e ("referenced on Ethereum") stays true through the
anchor.

## Tax

**Lum LLC paying prizes to many people: ask the tax adviser before December** (the owner's item). With the open date
moving, ask about the payout month and tax year too, and whether Version 1's Lake share (the team paying itself back
part of the pot) changes anything.

## The owner's list (decisions owed, each with a recommendation)

1. **The split across characters:** A, B, C (D isn't feasible), and 20/80 or 100% by deep funding.
   **Recommended: B with 20/80.** Each person's expected share doesn't depend on the character, and sales don't decide
   payouts.
2. **"Eligible submitter" for the 20%:** in a counting character only, or anyone with an eligible entry.
   **Recommended: counting characters only.** N and O in S1 have no result to stand on.
3. **All distributed, or the Lake at about 40%:** Version 1 (the Lake as built: 1.04 of 2.6 ETH to the Fund account in
   S1) or Version 2 (all 2.6 ETH to participants).
   **Recommended: Version 2.** If Version 1 is chosen instead, the challenge page says "about 60% to the people who
   entered", and `DEEP_FUNDING.bookRecipient` must be set.
4. **The under-1% rule:** off with 20/80, or kept.
   **Recommended: off** (`minShare: 0`). In S2 the 20% share alone is 0.87% of the pot, so the rule would take
   4 people's shares.
5. **The address deadline:** 3 days after results (Mon 7 Dec 12:00 PT as configured today), or longer, with the mint
   later.
   **Recommended: 7 days,** set together with the new open date, the mint opening the day after.
6. **The passkey option:** Base Account through Coinbase's SDK on the payout screen only (a narrow P6 exception named
   in Privacy §7), or the paste-and-retype fallback.
   **Recommended: the SDK, opt-in on that screen only, with a P6 check** (only if Base is chosen).
7. **The mint's chain:** stay on mainnet, or move to Base with the mainnet anchor.
   **Recommended: Base with the anchor.** The diffs above are ready to apply once approved, and principle 7's sentence is
   the owner's to reword.
8. **The Privacy and Terms lines above** (§4, §7, a new §6f): reread when the feature is built, in its release.
   **Recommended: keep them on this branch until then.**
9. **Tax:** Lum LLC paying prizes to many people; ask the tax adviser before December, and about the tax year once the
   open date is set.
   **Recommended: ask now, before setting the open date.**
10. **The new open date** (`CHALLENGE.public` stays off until then). It moves every date in section 17's table,
    including the payout and the mint.
    **Recommended: choose the dates and the address window together** (item 5).
11. **Three submissions in one character?** The owner's rule is "up to 3 per person, any characters". Terms §6e and the
    challenge wording still say "One entry per person per character".
    **Recommended:** decide whether three in one character are allowed, then reword §6e and the wording on the
    challenge's branch, for the owner's reread. Under B, three entries in one character count once.
12. **`DEEP_FUNDING.lake`:** point it at the Fund account (`FUND.address`, branch `fund-page`) when that merges.
    **Recommended: yes**, so that a Version 1 Lake share and any held-back share go to the Fund account, not the old
    support address.
13. **The sanctions oracle's address on Base:** to confirm before the payout screen is built (a check for the agent, not
    a choice).

## Principles

- **P1 (recipes public):** unchanged. The results file publishes every share by FID; no address is in the records.
- **P5 (no ranking powers):** pass. Character weights come from submitter counts, not from any admin pick. Admins'
  entries count toward nothing. Every person's 20% is the same.
- **P6 (privacy):** concern. The passkey option loads Coinbase's SDK on one screen, opt-in. That's a narrow exception
  needing the owner's yes, Privacy §7 words and a check. Addresses are asked only of recipients, after the results.
  The chain readings for this doc were read-only calls to public RPCs and Coinbase's public price endpoint, from the
  agent's machine, not from the site.
- **P7 (payments never in scoring or ordering):** pass for B, A and D. C makes payouts depend on sales, which is a
  tension and one reason it isn't recommended. Payment never buys an entry: nothing here offers a prepay path to enter.
  The mint stays a fixed-price collectible with no royalties, on either chain. Moving to Base needs the owner's
  rewording of P7's "open editions on Ethereum mainnet" (drafted above).
