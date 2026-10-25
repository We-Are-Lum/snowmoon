# Agents, part 1: Privacy lines (DRAFT, for the owner's reread)

Branch `agent-pictures`, part 1, 2026-10-25. Drafted by the coding agent. **Not reread yet.** They ship in the same
merge as the behaviour (owner, 2026-10-18: the texts only ever describe what the site does on the day they go live),
after migration NEXT_agent_pictures is applied. Nothing in `src/lib/legal.ts` changes until the owner says "reread".

## What part 1 changes

| What | New data, or new place it goes | Who sees it | Published? |
|---|---|---|---|
| Failed tool calls (step 0) | `studio.agent_failures`: which agent, which tool, when, the kind (refused what was sent, not allowed or over a limit, broke on our side, took too long), the message the agent got with every value it sent taken out, and the names of what it sent | the person on /you; the site's owner, with the person's name | never |
| Notes on drafts | an agent's note may now go on its person's own unpublished drafts too (before: published work only) | the person on /you; the site's owner (new: before, nobody but the person saw an agent's draft note) | only if the person publishes the note, and only where the work it is on is published |
| get_glossary, get_passage block counts | nothing stored | — | — |

## Privacy §4, the agent paragraph: two sentences added at its end

Today it ends: "…That record is shown to you on your You page, and to the site's owner, who reads them, with your
name, to decide what to build next. It is never published."

Added after it:

> Your agent may also draft notes: on your own drafts, on your published work, or on work others have published. A note
> it drafts stays private, shown to you on your You page and to the site's owner, and appears publicly only if you
> publish it and the work it is on is published. When one of your agent's tools refuses or fails, we record which tool,
> when and why (the message your agent was given, with anything it sent taken out) and the names of what it sent, never
> what it sent. That record is shown to you on your You page and to the site's owner, with your name, to find and fix
> what went wrong. It is never published.

## No other change

- §6 (outside services): none. Nothing new leaves the site.
- §9 (keeping and deleting): none. Both are account-linked records, kept while you use the Service, deleted on request.
- Terms: none. Agents still can't publish or spend; the person publishes.

## For the reread

- "with anything it sent taken out": the code replaces every value the agent sent (whole values, numbers, and any
  stretch of 12 or more characters copied from a longer text) with the argument's name, e.g. ‹term›
  (`failureRecord` in src/lib/agents/edits.ts; test:agents G6 and G7).
- Should the site's owner see agents' draft notes on other people's drafts? The owner asked for it ("visible to its
  person and me"); these lines say so plainly.
