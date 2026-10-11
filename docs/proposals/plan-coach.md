# Proposal: the planning coach (no UI yet)

> Draft by the coding agent, 2026-10-11, on branch `plan-coach`. Nothing here is
> built into the app. The world guide, the craft guide, the coach prompt and the
> eval are on the branch; only docs and data merge, after the owner's OK.

## What exists on the branch

| Piece | File | State |
|---|---|---|
| World guide | `content/snowmoon/world-guide.json`, `.md` | 278 lines (with 92 geography lines, see `docs/maps/feasibility.md`, and 29 added for the guide episodes), each cited and tagged with the latest chapter it depends on; `scripts/world-guide.ts check` passes; every line read against its blocks by gpt-oss-120b and by the coding agent (`content/snowmoon/recipes/world-guide.json`) |
| Craft guide | `docs/craft/visual-storytelling.md` | **Approved** (owner, 2026-10-11), with sections 8 to 17 added from Design v3's principles |
| Coach prompts | `config/prompts/plan-coach.md`, `plan-coach-claims.md`, `plan-coach-world-check.md`, `plan-coach-guard.md` | Design 2 (the owner's four changes) |
| Eval | `scripts/plan-coach-eval.ts`, fixtures in `scripts/fixtures/plan-coach/` | Design 1: three invented openings, reviewed in `docs/craft/plan-coach-eval-review.md`. Design 2: one test run; the full run, and the comparison of gpt-oss-120b, Kimi K3 and Claude Sonnet 5.5, wait for the owner's freewrite. Every call through the Vercel AI Gateway only |

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
| A9 | Planning thread "published with your piece as @name"; needs own-words consent | Planning is **private by default** (on the device, like asking). It only becomes public when the person publishes their piece and chooses to include the thread. That step shows the own-words consent (`config/consent.json`, current version), because the thread holds the person's words. No consent is needed to plan. |
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
   The coding agent wrote them from these names without seeing Design v3 itself; if its wording differs, the sections should follow it.
2. **All four design changes: yes.** Built as design 2 (`scripts/plan-coach-eval.ts`):
   - the world check as its own steps (`plan-coach-claims.md`, then `plan-coach-world-check.md` per claim);
   - picture slots without words, with a code check (`scripts/lib/plan-coach-checks.ts`, tested by `scripts/plan-coach-checks-test.ts`);
   - the coach's own guard (`plan-coach-guard.md`);
   - three answers plus "I can't check this within your chapter", enforced in code.
   **gpt-oss reruns with the owner's freewrite once it is pasted.** One test run on invented fixture A ($0.0041) checked that the pipeline works.
3. **Comparison eval, test drafts only:** gpt-oss-120b; Kimi K3, pinned to moonshotai with zero retention; Claude Sonnet 5.5, after its retention terms were confirmed on our account.
   - **Sonnet's terms, confirmed 2026-10-11:** a zero-retention request with only Anthropic allowed was answered "ZDR requested: all 1 attempts support ZDR", served by Anthropic on the gateway's own credentials. Vercel's ZDR page lists Anthropic as a ZDR provider; only claude-fable-5 is excepted.
   - **The allowlist** (`config/models.json`) now records Kimi K3's added use and Sonnet 5.5 as a closed model, both for test drafts only.
   - **Choosing a model for real users' drafts is a separate decision.**

Still open:
4. **Planning private by default**, with the thread published only by choice at publish time: yes or no? This replaces the board's "published with your piece".
5. **The notice and consent wording** that names who receives drafts.
