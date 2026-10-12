# Proposal: the planning coach (no UI yet)

> Draft by the coding agent, 2026-10-11 (brought up to date 2026-10-12), on branch `plan-coach`. Nothing here is
> built into the app. The world guide, the craft guide, the coach prompt and the
> eval are on the branch; only docs and data merge, after the owner's OK.

## What exists on the branch

| Piece | File | State |
|---|---|---|
| World guide | `content/snowmoon/world-guide.json`, `.md` | 278 lines (with 92 geography lines, see `docs/maps/feasibility.md` on branch `maps-v5`, and 29 added for the guide episodes), each cited and tagged with the latest chapter it depends on; `scripts/world-guide.ts check` passes; every line read against its blocks by gpt-oss-120b and by the coding agent (`content/snowmoon/recipes/world-guide.json`) |
| Craft guide | `docs/craft/visual-storytelling.md` | **Approved** (owner, 2026-10-11). Sections 8 to 17 follow Design's "Plan a Piece v4" word for word where Design gives wording, including v4's named note forms. Examples are tagged by chapter and filtered to the reader's limit in code |
| Coach prompts | `config/prompts/plan-coach.md`, `plan-coach-claims.md`, `plan-coach-world-check.md`, `plan-coach-guard.md` | Design 3: design 2 (the owner's four changes) with the v4 craft guide, fixed retrieval and fixed quote checks |
| Eval | `scripts/plan-coach-eval.ts`, fixtures in `scripts/fixtures/plan-coach/` | Three invented openings (fixtures a, b, c), reviewed in `docs/craft/plan-coach-eval-review.md`. Design 3 compared gpt-oss-120b, Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5 (`docs/craft/plan-coach-eval-design-3.md`); results below. The owner's freewrite is still to be added. Every call goes through the Vercel AI Gateway only, and every Anthropic reply is checked for zero retention |

## Eval of design 1 (gpt-oss-120b)

The craft notes are reasonable. The coach fails in the two places the owner
named:

- **It writes for the person.** Five slips: quoted wants, picture lettering,
  and one rewrite of the person's own narration. The guard model passed the
  rewrite.
- **It gets the world wrong.** It caught 1 of 5 planted errors and
  introduced 2 new ones: the arena placed in Greater Plum Harbor, and the
  hearing placed in the Order's tower.

Each coach turn is about 7,500 tokens in and 1,700 out, about $0.002.

## What I would change before trying another model

These are cheap, and they test whether the problem is the model or the design:

1. **World check as its own step.** First extract the draft's claims about the
   world, one per line. Then fetch passages for each claim, up to the
   reader's limit. Then judge each claim against those passages. The current
   prompt asks for all of it at once, with passages chosen only by word
   overlap with the whole draft. The chapter 8 tally and chapter 10's tax
   rule were never in the passages.
2. **Picture slots without words.** No quotation marks, no on-screen text, no
   "e.g.". Say what the picture shows (place, who, action), never what it
   says. A code check rejects any quoted span that isn't the person's.
3. **The guard asked the right question.** The assistant's guard policy
   (`chat-guard.md`) is about answers to questions. The coach needs its own
   policy, `plan-coach-guard.md`: any wording for the piece, any rewrite or
   completion of the person's words, any on-screen text.
4. **Three answers, not one:** "matches", "conflicts" and "the book doesn't
   say up to your chapter". Keep "beyond your chapter limit" only for what
   the book says later. The coach has to know that without saying it, so the
   world check would get the full guide but may only say "I can't check this
   within your chapter".

## Alternatives, if the notes still aren't useful

Per coach turn at today's token counts (7.5k in, 1.7k out), at the prices on
Vercel AI Gateway's model list (2026-10-11). "Receives the draft" is everyone
who handles a person's private draft.

| Model | Open weights | Per turn | Receives the draft | Notes |
|---|---|---|---|---|
| gpt-oss-120b (now) | yes, Apache-2.0 | ~$0.002 | Groq directly; Vercel AI Gateway → Groq when busy; zero retention on both | On the allowlist |
| Qwen3.8 Flash | yes | ~$0.002 | Vercel AI Gateway → the provider the gateway routes to | Same family as the book's own tool (principle 3's source names Qwen 3.8 Flash Next); not on the allowlist |
| DeepSeek V4 Pro | yes | ~$0.008 | Vercel AI Gateway → provider | Not on the allowlist; in the 2026-10-07 test, DeepSeek V3.1 wrote for the user once in 27 attempts |
| Mistral Large 4 | check the licence | ~$0.009 | Vercel AI Gateway → Mistral | Not on the allowlist |
| Kimi K3 | yes | ~$0.048 | Vercel AI Gateway → provider | The model the book's own declaration names; most expensive open option |
| Claude Haiku 5.5 | no | ~$0.002 | Anthropic, via the gateway or directly | Closed model, reported under principle 3 |
| Claude Sonnet 5.5 | no | ~$0.032 | Anthropic, via the gateway or directly | Closed model |
| Claude Opus 5.5 | no | ~$0.064 | Anthropic, via the gateway or directly | Closed model; the model that wrote the summary |

**Privacy (principle 6).** Drafts are a person's private creative work, more
sensitive than questions about the book.
- **Any provider other than Groq** must be checked for zero data retention
  before it receives a draft. The gateway can require it per request, but
  whether a given model has a zero-retention provider on the gateway has to
  be confirmed model by model.
- **For Claude,** zero retention depends on Anthropic's terms for the
  account. Check it before use, the same way the Groq console was checked.
- **The first-time notice and the consent text** would have to name the
  provider that receives drafts.

**Recommendation.** Make the four design changes, then rerun on gpt-oss-120b
with the owner's freewrite added. Rerunning costs under a cent. If it still
misses world facts, run the same four fixtures on one open model (Qwen3.8
Flash or Kimi K3) and on Claude Sonnet 5.5, in a separate eval, after the
owner approves which ones may receive the test drafts. The test drafts are
not private, but the decision sets the precedent.

## How the coach resolves gap-list items A9–A13 and A20–A22

| Item | The gap | How this design resolves it |
|---|---|---|
| A9 | Planning thread "published with your piece as @name"; needs own-words consent | Planning is **private by default** (owner, 2026-10-11): on the device until the person publishes, then published whole with the piece. Publishing shows the own-words consent (`config/consent.json`, current version), because the thread holds the person's words. No consent is needed to plan. |
| A10 | The piece kept apart from the chat | The piece is made only of the person's own fragments (F1, F2…), stored apart from the coach's notes. The coach can propose an order by label, but never adds text to the piece, so nothing from a note can end up in it. |
| A11 | A private question turns into planning; the private thread isn't copied | Asking and planning stay separate threads. "Start planning from this" opens a new planning thread with only the person's chosen question. Nothing is copied over unless they choose it, and nothing goes public until they publish. |
| A12 | Publish review, always shown, can't trim (conflict 4 with removal) | The review is always shown before publishing. The thread is published **whole or not at all**: no trimming individual messages, so the coach's notes can't be shown out of context. Removal stays as `docs/removal.md` has it: the person can hide the whole thread, or the whole piece, at once, at any time. That keeps "can't trim" and "can hide" consistent: **hiding is all or nothing**, like publishing. |
| A13 | "How this was made" with overlap flags | Published with the piece: every message in order, the coach's labelled model-drafted. **Overlap check:** any run of six or more consecutive words shared by the piece and a coach note is flagged, excluding book quotes and the person's own earlier words that the coach quoted back (`docs/proposals/chat.md`, rule 11). Since the coach may not write wording, a flag means a slip, and it is shown. |
| A20 | Every planning message signed with the person's name | Signed only in the published thread, with their Farcaster name, which the own-words consent at publishing covers. On the device, unsigned. |
| A21 | A hosted model receives messages (principle 6) | Same route as the assistant: Groq with zero retention (confirmed in the console), and the gateway, also zero retention, only when Groq is busy. The notice must say that **drafts**, not only questions, go to Groq. Any other model needs the checks in "Alternatives" first. |
| A22 | Planning thread published in full with the piece | Yes, in full, but only under "How this was made", labelled model-drafted (principle 2), never inside the piece itself. Together with A12: whole or not at all, hideable at once. |

## Decisions (owner, 2026-10-11)

1. **Craft guide: approved**, with one addition: Design v3's two sets of principles, so the coach and the screens match. These are sections 8 to 17 of `docs/craft/visual-storytelling.md`:
   - stories: want, pressure, turn, choice with a price, change;
   - characters: want and need, flaw, contradiction, arc, fits the world.
   Done: once Design's files arrived, the sections were matched to Plan a Piece v3, then to v4 (see 6).
2. **All four design changes: yes.** Built as design 2 (`scripts/plan-coach-eval.ts`):
   - the world check as its own steps (`plan-coach-claims.md`, then `plan-coach-world-check.md` per claim);
   - picture slots without words, with a code check (`scripts/lib/plan-coach-checks.ts`, tested by `scripts/plan-coach-checks-test.ts`);
   - the coach's own guard (`plan-coach-guard.md`);
   - three answers plus "I can't check this within your chapter", enforced in code.
   **gpt-oss reruns with the owner's freewrite once it is pasted.** One test run on invented fixture A ($0.0041) checked that the pipeline works.
3. **Comparison eval, test drafts only:** gpt-oss-120b; Kimi K3, pinned to moonshotai with zero retention; Claude Sonnet 5.5 **only after the owner confirms Anthropic's data retention for our account** (owner, 2026-10-11: "Before Sonnet receives anything, confirm Anthropic's data retention terms for our account; don't assume zero retention").
   - **Superseded by 5:** Sonnet was blocked in code until `hosted.retention_confirmed_by_owner` was set in `config/models.json`; the owner has since confirmed it.
   - **Already sent to Sonnet:** two calls on 2026-10-11, made as setup checks before the owner's condition arrived. Each contained only "Reply with the single word OK."
   - **Evidence gathered so far** (gateway level, not the confirmation itself) is listed in the agent's report to the owner. In short: we have no Anthropic organization; calls go through Vercel's own credentials, under Vercel's agreement with Anthropic.
   - **The allowlist** (`config/models.json`) records each model's use; Haiku, Sonnet and Opus 5.5 are recorded as closed models, test drafts only.
   - **gpt-oss through the gateway uses Vercel's own Groq account, not ours** (checked 2026-10-11 from the response metadata: `credentialType: "system"`, "System credentials planned for: groq"). Our Groq key is not registered with the gateway as BYOK, and batch jobs never read it.
   - **Choosing a model for real users' drafts is a separate decision.**

4. **Planning is private by default** (owner, 2026-10-11): "on the device until the person publishes, then published whole with the piece." This replaces the board's "published with your piece" for the time before publishing; A9, A12 and A22 below follow it.

5. **Model comparison (owner, 2026-10-11, test drafts only):**
   - **Sonnet 5.5 unblocked.** Our zero-retention test (ZDR required, Anthropic as the only provider, every attempt supporting ZDR) met the owner's condition.
   - **Opus 5.5 added as a ceiling,** on the same terms, after its own zero-retention test passed.
   - **Haiku 5.5 added,** on the same terms, after its own test.
   - **Kimi K3 dropped** from the coach comparison: about 225 s a turn is too slow for a live coach.
   - **Every Anthropic reply must carry the gateway's zero-retention flag,** and every attempt must go to anthropic; otherwise the run fails (`scripts/lib/zdr-check.ts`, 8 test cases).
   - **Real users' drafts remain a separate decision.**
6. **Before the design 3 run:**
   - the craft guide was brought up to Plan a Piece v4;
   - retrieval was fixed, so fixture c's planted errors are findable;
   - the quote pairing in the code checks was fixed.

## Design 3 results (fixtures a, b, c; $0.92 of the $2 cap)

| Model | Planted errors caught | Errors introduced | Slips into writing for the person | Cost per turn | Time per turn |
|---|---|---|---|---|---|
| gpt-oss-120b | 1 of 3 | 3 | 2 turns | $0.006 | 20 s |
| Claude Haiku 5.5 | 2 of 3 | 2 | 0 | $0.006 | 40 s |
| Claude Sonnet 5.5 | **3 of 3** | 0 | 0 | $0.10 | 45 s |
| Claude Opus 5.5 | 2 of 3 | 0 | 0 | $0.19 | 53 s |

On these three fixtures, Sonnet was the only model with no misses and no errors, at about half Opus's cost. Haiku costs the same as gpt-oss, but one of its errors told a person a wrong claim matched the book. The full review is in `docs/craft/plan-coach-eval-review.md`.

Still open:
7. **The owner's freewrite,** to add to the fixtures before any choice is made.
8. **The notice and consent wording** that names who receives drafts.
9. **Choosing a model for real users' drafts** (a separate decision; the comparison covers test drafts only).
