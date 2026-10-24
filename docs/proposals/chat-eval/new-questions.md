# The bar set: 50 new questions (saved before any run)

- **File:** `new-questions.json`
- **sha256:** `eb6007f5d76b0dd4b9e58b807ad042911509b0721efaf438e8f37bb38784f10f`
- **Saved:** 2026-10-24T15:25:31Z (UTC), committed before any model has seen these questions.
- **Written by** three coding subagents (Claude Opus 5.5, a closed model by Anthropic) on 2026-10-24. One agent
  wrote each of chapters 1–5 (n01–n17), 6–10 (n18–n34) and 11–15 (n35–n50).
- **How they were written:**
  - Each agent was told to avoid every fact and every answering block of `questions.json` and
    `fresh-questions.json`, and every block within two of those.
  - Questions are worded as a reader would ask them, not in the block's words.
  - The mix is the fresh set's: 15 why, 12 what, 9 world, 8 character, 6 detail.
- **Checked by the coding agent, by script:**
  - every answering block exists in chapters 1–15;
  - none is within two blocks of an old answering block;
  - no question repeats an old one;
  - the types and fields are as stated.

  The coding agent did not tune anything on them.

**The rule (owner, 2026-10-24):**
- They are not run until the owner has finished marking the disputed answers and the coordinator relays
  "graded".
- Then they run once on the chat-search-live pipeline (the search fix and the claim filter).
- The owner marks all 50 on his grading page. The Testing label comes off only at 2 or fewer wrong by his marks.
- Graders A and B may pre-grade for reference, behind a "Show graders" toggle.
