# Overnight: agents that make things for people (summary)

Branch **`agents-connect`** (not pushed, nothing deployed, nothing published, no production database
change). Switched off. Money spent: **$0** (the test agents ran on your Claude subscription; no fal or
gateway calls). InfiniteTalk test: **skipped**, Modal isn't set up on this Mac.

## What works (locally, end to end)

- **Connect, three ways.** "Add to Claude / ChatGPT" (a connector at snowmoon.party/mcp with sign-in),
  a plain-text guide at snowmoon.party/agents.md, and wallet agents for fleets. Each agent shows as
  **"Claude, agent of @you"**. One tap on /you disconnects it, and its token stops at once.
- **Agents draft, you publish.** They can start ideas, draft storyboards, frame prompts and character
  versions, propose revisions, leave notes, read feedback, and bring in images with their recipe. All of
  it waits in a new **"Your agents' drafts"** list on /you with Publish and Discard. No tool publishes,
  spends money or speaks as you.
- **The loop, proven with two real Claude agents.** A's agent drafted an idea and a storyboard. A
  published them. B (a person) left a note, and B's agent drafted a note that B published. A's agent
  read both and revised the storyboard: it ended on a held close-up, as B asked. A approved version 2,
  which shows "Revised from Claude, agent of @A".
- **Labels everywhere:** "agent of @x", "words by @x's agent", "Brought in · recipe as declared, not
  checked", the credit chain, and a "Human-written words only" filter.
- **Guardrails:** daily limits per agent, 3 agents per person, book lines checked word for word,
  metadata stripped from images, and a scan gate that refuses to store a match and disconnects the
  agent. Agents' tokens are refused everywhere a person signs in.
- **Tests:** `test:agents` passes all 69 checks. The tests and the demo found three real bugs, now fixed: token withdrawal being undone, reconnecting using up an agent slot, and shot directions being labelled as story words.

## What you'd see

The screenshots are in `docs/agents/demo/`:
1. The consent page.
2. Your agents on /you.
3. The review list.
4. A piece with notes from a person and from an agent.
5. The revised storyboard, version 2.
6. Disconnected.

The demo transcript is `docs/agents/demo/transcript.md`.

## Decisions for you

1. **Story words.** Can your agent write narration and dialogue? It's allowed by default, always
   labelled, with a human-written-only filter. Your own work stays human-written either way. Keep it,
   or refuse it?
2. **Scanning before images open.** Arachnid Shield plus PhotoDNA (both free, both need an
   application), plus registering with NCMEC and a written reporting procedure with a lawyer. Images
   stay closed until then.
3. **Principle checks.** P4a fails on the agent sign-in routes. I've proposed a change (design §8b) and
   didn't make it. Principle 1 also needs to allow declared recipes.
4. **ChatGPT.** Custom connectors with write tools may need a Business plan. It needs a test on a real
   account.
5. **Newcomers** (researched, not built). Email codes plus $5 and $10 card packs through Stripe: about
   $13 a month at 100 users. Or passkeys first?
6. The Privacy and Terms lines in design §6 are for your reread.

## Worth knowing

- Claude registers a new client on every reconnect, so reconnecting now renews the same agent instead
  of using up one of your three.
- Anthropic's directory won't list a connector that moves money, so agents can't spend anything. That's
  by design.
- In version 2, the agent wrote "her face" about Zei. A person's review step catches slips like that.

Full design: `docs/agents/design.md`. Research: `docs/agents/research-*.md`.
