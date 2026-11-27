# 013: Glossary definition drafts (DRAFT)

Date: 2026-11-24/25. Agent: Claude Code (Claude, a closed model by Anthropic), a cloud session
(`session_015MNLwvqWNRKiBmpphsR2Lj`). Written by the coding agent; DRAFT until the owner approves it.

## The owner's prompt (item 2 of the session's prompt, verbatim)

```text
2. If there's time after that: glossary definitions, draft. For every glossary entry, a 1–3 sentence summary of what the book says about it, grounded in the book with block citations (c<chapter>-b<block>), quoting only word for word. Mark them draft, not approved, and "drafted with AI help (Claude, by Anthropic)", for Garance and Nate to approve, as the challenge's Learn more texts were. Put a review page in the PR.
```

## How the drafts were made

- The coding agent wrote the format, the checker (`scripts/test-glossary-definitions.ts`), the context helper
  (`scripts/glossary-context.py`, which prints a term's glossary entry and the book's text of every block mentioning
  it) and the first draft (Acolyte).
- Seven helper agents (the same model) drafted the other 210 terms, 30 each. Each got the prompt below with only its
  list of slugs changed. The slugs were dealt round-robin from `content/snowmoon/glossary.json`'s order, after Acolyte.
- The coding agent read a sample of ten drafts against their blocks. One (Zei) made claims its cited blocks don't
  support, so the coding agent rewrote it.
- Four more helper agents (the same model) then rechecked every draft against its cited blocks, about 53 each, with
  the second prompt below. They fixed or cut what the blocks don't state.
- No other model was called, and there were no API calls. The checker runs on the repository alone.

## The drafting prompt

Sent seven times; only the batch file's number changed (0 to 6).

```text
You are drafting glossary definitions for snowmoon.party, an independent adaptation of the novel *Snowmoon* by Vitalik Buterin (GPL-3.0). Work only in [the worktree]. Do not commit, push, or edit anything except the draft files below. No network, no model calls.

TASK: for each slug in the file [the batch's slug list] (comma-separated), write docs/glossary-definitions/drafts/<slug>.json: a 1–3 sentence summary of what THE BOOK says about the term, for a reader who hasn't read it.

Get the book's text with: python3 -I [the context helper, now scripts/glossary-context.py] <slug> [maxblocks]  (prints the term, the rule-picked explaining sentences, and every block that mentions it, as "c<ch>-b<idx>: text"; default 60 blocks — raise it for big terms, or grep content/snowmoon/text/chapter-N.json yourself for context around a block). Read enough of the mentions to be accurate.

Rules (strict):
- Grounded: every sentence states only what the cited blocks say. No guessing, no outside knowledge, no interpretation the text doesn't support. If the book says little, say little (one sentence is fine).
- Every sentence cites at least one block (c<chapter>-b<block>) that supports it. Prefer the clearest, earliest explanatory blocks.
- Quotes must be WORD FOR WORD from the cited block (an exact substring at whole words; curly quotes and markdown emphasis are normalised by the checker). Paraphrase in plain text otherwise; never put paraphrase in a quote segment. Short quotes are best.
- Neutral, plain, present tense ("X is …"). Spoilers are fine, but keep it to what defines the term.
- Keep it short: at most ~60 words. No names of real people other than as the book uses them.
- Use the glossary's exact "term" string (shown as TERM).

Format, exactly (sentences is a list of sentences; each sentence a list of segments: {"text": ...}, {"quote": ..., "cite": ...} or {"cite": ...}):
{
  "slug": "acolyte",
  "term": "Acolyte",
  "status": "draft",
  "approved": false,
  "aiHelp": "drafted with AI help (Claude, by Anthropic)",
  "sentences": [
    [{ "text": "In the Order of Steering, an Acolyte is " }, { "quote": "an Order member in training", "cite": "c1-b57" }, { "text": "." }],
    [{ "text": "A share of an Acolyte's audits is repeated by Sentinels, and their score is how well those votes predicted the Sentinels' judgements." }, { "cite": "c1-b68" }]
  ]
}
(An example is already at docs/glossary-definitions/drafts/acolyte.json.)

CHECK: after writing, run from the worktree: npx tsx scripts/test-glossary-definitions.ts --only=<comma-separated slugs of your batch>
Fix every FAIL until it prints the "glossary definitions: …" pass line. Then reread each draft against its cited blocks once more for accuracy.

REPORT back (short): the pass line, and a list of any terms where the book says too little or is ambiguous (slug + one line why), so a person can look at them. Do not paste the drafts.
```

The prompts for batches 5 and 6 added one line after "Read enough of the mentions to be accurate.": "Some terms in this
batch are major (many mentions): focus on what defines them, from their clearest explanatory blocks." The batch 0
prompt said "No spoilers policy applies (spoilers are fine)" where the others say "Spoilers are fine".

## The checking prompt

Sent four times; only the batch file's number changed (0 to 3).

```text
You are an adversarial fact-checker for glossary definition drafts of the novel *Snowmoon* (snowmoon.party, an independent adaptation). Work only in [the worktree]. Edit only docs/glossary-definitions/drafts/<slug>.json for the slugs below. No commits, no network, no model calls.

Slugs: the comma-separated list in [the batch's slug list]

Each draft has "sentences": a list of sentences; each sentence is segments {"text"}, {"quote","cite"} or {"cite"} where cite is a block id c<chapter>-b<idx> (block idx in content/snowmoon/text/chapter-<chapter>.json, field "content"). Another agent wrote them; in a sample, about 1 in 5 had a claim the cited blocks don't support (e.g. attributing a speech to a character when the block doesn't name the speaker — dialogue blocks are <span data-hue=...> with no name, so speaker identity must come from the text; or adding a detail like "with Fin" that isn't in the cited block).

For EVERY draft: read every cited block in full (a quick way: python3 -I [the context helper] <slug> 200 prints all mentions; or read the block from the chapter JSON). For each claim in each sentence ask: do the cited blocks of THAT sentence state this? Speaker attribution clear? Is "later"/"secretly"/causal wording supported? Is the term's identity right (e.g. a person vs a word)?
- If a claim is unsupported: fix it — cite the block that does support it (find it), or cut the claim. Prefer cutting to stretching. A shorter, true draft beats a fuller one.
- Keep 1–3 sentences, every sentence with ≥1 cite, quotes word for word, keep slug/term/status/approved/aiHelp unchanged.
- Don't restyle drafts that are correct.

Then run: npx tsx scripts/test-glossary-definitions.ts --only=<your slugs>  and fix until it passes.

REPORT (short): pass line; number of drafts changed; for each changed draft one line: slug — what was wrong. Don't paste drafts.
```
