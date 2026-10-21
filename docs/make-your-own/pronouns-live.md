# "Make your own": the coach's pronouns, live check

Run 2026-10-19 after the owner's go ("Live check: go"), capped at $0.01: the assistant's models (openai/gpt-oss-120b,
guard openai/gpt-oss-safeguard-20b) through Vercel AI Gateway, zero data retention, on a local PGlite. **Spent
$0.0056.** Six messages that invite pronouns for Bai, Zei, Mu, Min and Deluin, one of them with the person using the
wrong one ("Bai is angry because he lost face"). The draft has no pronouns of its own. Replies are AI-generated (the
coach); the messages were written by the coding agent. Data: pronouns-live.json (its `slips` are from the check as it
was during the run).

**The model, with the cast list in its prompt:** 11 replies written, no real slip. Bai was "she", Zei "he", Mu "she"
and Deluin "he" throughout. When the person wrote "he" for Bai, the coach answered with "she" without remarking on it.
Min (listed as "she" in the prompt during the run) was only ever named, never given a pronoun.

**The check, during the run:** 3 flags in 2 replies, all false. Each pronoun was about someone named in an earlier
sentence ("What would she risk losing if Zei…", where "she" is Mu). Both replies were retried, and the retries shown.

**The check, tightened** (a pronoun before the name now means the sentence is skipped) and run again, at no cost, on
the 11 replies above and the 32 shown in the earlier red-team (before the cast list was in the prompt):
- the 2 clear false flags are gone;
- 1 flag left, ambiguous ("what does Bai want most in this moment—him to stay focused, or to prove he's still a
  threat?": "him" is Zei; "he" could be either);
- 4 real slips from the earlier red-team caught: "Zei… she" twice, "Bai… his" twice.

All of these sentences are now cases in test:make M7.
