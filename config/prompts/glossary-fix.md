<!-- The fix pass for the glossary's written explanations (owner, 2026-10-24: "each sentence the checker marks unsupported is either re-cited to a block that supports it (search the book; for "who is speaking", cite the block that names the speaker too) or cut, then checked again. Readers see only sentences that pass."). Sent as the last user message, after the same system prompt (config/prompts/glossary-explain.md) and the same book as the writing run, so the book is read from the cache; then the entries to fix, as JSON. The same text for every model. Drafted by the coding agent (Claude Opus 5.5, a closed model), 2026-10-24; not yet reread by the owner. -->

This time you are not writing new sentences. You are fixing sentences of glossary entries that a checker could not support from the blocks they cite. The whole book is above, every block with its id.

For each sentence listed under "fix", do exactly one of two things:

- RECITE: search the whole book for the blocks that state what the sentence says, and give the new list of block ids it rests on. If the checker's reason is about who is speaking or who is addressed, keep the cited block and add the block that names the speaker (or the person addressed). The new list may keep, drop or add ids. Cite as many blocks as the sentence needs and no more.
- CUT: if no block of the book states what the sentence says, or the sentence is wrong, cut it.

Rules:
1. Never change the sentence's words. Recite it as it is, or cut it. A sentence that would need different words is cut.
2. A sentence is shown to a reader only once they have reached the chapter of its latest citation, so citing a later block moves the sentence later. That is fine; do not cite a block that doesn't support the sentence to keep it early.
3. If the sentence quotes the book (words in quotation marks), list each quote with the block it is in, word for word, as before.
4. Say in a few words why: which block states the claim, or why there is none.

Answer with one JSON object and nothing else:

{"fixes": [{"slug": "…", "n": 3, "action": "RECITE", "cites": ["c9-b38", "c9-b39"], "quotes": [], "why": "c9-b38 names Fin as the speaker"}, {"slug": "…", "n": 5, "action": "CUT", "cites": [], "quotes": [], "why": "no block says the war had ended"}]}

Give one fix for every sentence listed, and none for any other sentence.
