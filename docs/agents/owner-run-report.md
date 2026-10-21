# Report: agents for your account only, with edit tools (2026-10-20 night, branch `agents-owner`)

A PR is open for you to merge. Nothing is pushed to main, nothing is deployed, no migration has been
applied, and nothing was spent: the frame and video runs use stand-ins.

## 1. Owner-only connector

- **Who:** FID 6786 only (your decision, 2026-10-20). No wallet is on the allowlist; add your sign-in
  wallet to `AGENTS.people.wallets` later.
- **Everyone else:** 404 from every agent route (test A1). The Tell-your-agent box and the agents
  section don't show. agents.md and /p are off (`AGENTS.public = false`).
- **Taking someone off the allowlist** stops their agents at once, because the allowlist is checked on
  every request.
- **Connector:** https://snowmoon.party/mcp, OAuth 2.1 with PKCE. Claude can register itself by
  dynamic client registration or a client ID metadata document (DCR or CIMD).
- **Drafts only:** keeping, publishing and spending happen only on /you, by you. The P4a check passes.

## 2. Edit tools (drafts on your own versions)

| Tool | What it drafts | Cost |
|---|---|---|
| `list_takes` | (reads a shot's lines and takes) | none |
| `try_frame` | a new frame from your note, through Remix's pipeline with the shot's own camera | about $0.05 after you approve; from your balance |
| `swap_take` | another of that line's own takes | none |
| `change_timing` | a new start and end (0.3 to 30 s) | none |
| `mark_speaking` | who speaks in the shot | none |
| `request_video_test` | 5 s of LongCat-Video 480p on fal, from the shot's frame and your note | about $0.025 after you approve; from the site's fal key |

- **Approvals:** each runs once (409 on a second try), within daily caps of 20 frames, 5 video tests and
  $2. What's made is kept privately.
- **Keeping an edit doesn't change the published scene yet.** Putting kept edits into a new version is
  the editor rework, which waits.
- **The real fal video call has not been tried.** Its first real run will be your first approval.

## 3. `log_gap`

The agent records what you asked and what was missing. It's shown on /you under "What your agent
couldn't do". In the demo the agent logged:

> asked: "Make Zei's coat blue in every hotel shot." / missing: "No tool changes a character's clothing
> across many shots … no way to list which shots are 'hotel' shots … or to apply one change to a set of
> shots."

## 4. Muse and OpenAI Dots (not built)

- **Muse (Meta):** probably yes. Third-party guides say you ask Muse in chat to add a public HTTPS MCP
  URL with OAuth; it has no settings form. I couldn't confirm this in Meta's own docs.
- **OpenAI Dots:** unclear. There's no official guide. Vendors report that Dots uses connectors added
  in ChatGPT developer mode, on paid plans, and write tools may need Business or Enterprise. Untested.

## 5. End-to-end test

Run in a fresh headless Claude Code session (`scripts/demo-edits.ts`, screenshots in
`docs/agents/demo-edits/`). I can't test from the Claude app on a phone: it needs the site deployed,
and the connector reaches only the live URL. Phone steps are in `docs/agents/phone-steps.md`.

**What happened:** you send one chat message asking for six things. The agent drafts five edits (a
frame, a take, a timing, who speaks, a video test) and logs the sixth (the blue coat everywhere) as a
gap. On /you you approve, keep, and see the gap.

**Taps after that one message:**
- connecting (once): 1;
- sending the message: 1;
- opening /you: 1;
- the frame, approve then keep: 2;
- the video test, approve then keep: 2;
- each free edit: 1 (3 in all).

In one of three runs, "a different take" was ambiguous: the shot has two lines. That agent asked which
line instead of guessing.

**Seen in the screenshots:** the "Tell your agent an idea" box carries two notes that contradict each
other:
- "Public, permanent, GPL-3.0…" (from the shared text field);
- "Private until something made from them is kept".

The first one should go; it was there before tonight. I left it for the editor rework, along with the
"Version 1 (draft)" heading that each edit shows.

## 6. Found and fixed tonight

- **The daily spending caps never counted** (`approved_at >= date` matched nothing). They now compare
  UTC dates. Test E12 proves a sixth video is refused.
- **The video call didn't send `X-Fal-Store-IO: 0`** (keep no copy), as the image calls do. Now it
  does.
- **Speaking was on for allowlisted people.** You said it stays off until Groq's audio retention is
  confirmed. It is now off (`AGENTS.transcription.on = false`), and the Speak button doesn't show. The
  tests still cover it.
- **test:you-page Y8** looked for the old menu class. It now uses `menu-account-name`, matching main.

## 7. Before you merge

- **This PR also brings in** you-page-next (the You page, which agents need for approvals and gaps),
  make-your-own (still off) and agent-read-api (still off). They're 16 commits that aren't on main.
- **Migrations, in order:** `0015_version_hidden_by.sql`, `0018_api_rate.sql`, `0019_agents.sql`.
  Each is a draft; dry-run each first.
- **Privacy and Terms:** drafts are in `docs/legal/agents-owner-draft.md`, for your "reread".
- **An open check on main, not from this work:** `test:images-gate` still expects picks to be
  invited-only, but you opened picks to everyone on 2026-10-19 (e749871). It fails the same way on
  origin/main. I left it, since it's that branch's test.
- **The video test is paid from the site's fal key**, not a balance. That's fine for your account
  only, but it must change before anyone else gets agents.
- **A question for you about the stamp:** an edit you ask for in chat reads "Idea by Claude, agent of
  @you", because the site can't verify words that never passed through it. If you'd rather it read
  "Idea by @you", Keep could confirm "these were my words". Your call.

## 8. Tests

- `test:agents`: 121 checks pass.
- `check:principles`: 46 pass and none fail. P6d isn't run (no Vercel CLI here; you've accepted that).
- Every other test and check script passes, except `test:images-gate` (above). `check:ui`,
  `check:miniapp` and `check:podcast` were run against this build.

## 9. Second part (same night): a personal agent key and agents.md

- **The key:** on /you → Agents → "Make an agent key", give a name and a spend cap (default $1, at most
  $10).
  - It's shown once, with Copy and "Done, hide it".
  - It starts with `sk1_` and only its sha256 is stored.
  - It can read and draft (no images) and lasts 30 days.
  - Each spend still needs your approval on /you, and the key's total stays within its cap.
  - /you shows "spent $x of $cap · ends <date>", and Disconnect ends it in one tap.
- **Sending it:** `Authorization: Bearer sk1_…`, or the header `X-Snowmoon-Key`. A key in a URL is
  refused.
- **Keys never appear in logs.** Test K9 searches everything the server printed. Only the key's hash
  is stored (K2).
- **agents.md:** snowmoon.party/agents.md is now site-wide whenever agents are on, like
  /minpentai/agents.md. It explains the MCP endpoint, how to send the key (with a curl example that
  reads the key from an environment variable), keeping the key secret, the tools and the rules.
  Connecting is still invited-only.
- **Tests:** `test:agents` now passes 130 checks (K1 to K9 are new).
- **A fresh agent using only agents.md and a key** (`scripts/demo-key.ts`, screenshots in
  `docs/agents/demo-key/` with the key blurred).
  - **Setup:** a new Claude session with no connector, only curl allowed. It was told the agents.md
    address. The key sat in an environment variable, as an app's secret store would hold it, and was
    never in its prompt.
  - **What it did:** it read the page, sent the key as `$SNOWMOON_AGENT_KEY` in its headers, and drafted
    both asks (a new frame, and who's speaking).
  - **The key was searched for afterwards:** it appears neither in the agent's transcript nor in the
    server's output. After one tap on Disconnect, the key was refused (401).
  - **Taps:** making a key took 5 (open /you, Make an agent key, Make the key, Copy, Done). Sending the
    ask took 1, reviewing took 1, and ending the key took 1.
- **check:principles P1f:** the key's two boxes are a small component of their own,
  `agent-key-field.tsx`, which says "Kept with the key… Never published by us". P1f now checks for
  that, as it already does for the agent address box.

### Connectors, one line each (researched tonight, not tested)

- **ChatGPT Plus with developer mode:** probably read-only. OpenAI's help page lists write actions for
  Business, Enterprise and Edu, and read and fetch for Pro, and doesn't name Plus. Test it with the
  steps in phone-steps.md. ([help article](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt))
- **Gemini, free:** maybe. Google's help page has "Add a custom app" with an MCP URL, for US adults
  with personal accounts in English, and names no paid plan. Some vendor guides say it's for paid
  plans only. ([Google](https://support.google.com/gemini/answer/17209137))
- **Mistral Le Chat, free:** yes, per Mistral's docs. It supports OAuth with DCR, or a Bearer key.
  ([Mistral](https://docs.mistral.ai/le-chat/knowledge-integrations/connectors/mcp-connectors))
- **Muse:** unconfirmed by Meta. Meta's page mentions a "Secure Credentials Store", and third-party
  guides show both OAuth and keys (Bearer, or a vendor's own header). Our key works either way.
  ([Meta](https://www.meta.com/help/artificial-intelligence/1687253048996149/))

## Principles

- **P1, public recipe:** pass. A made frame or video records its model, prompt and inputs ("Recipe").
  Nothing is published, so no public recipe is needed yet.
- **P2, AI declared; words people's:** pass. Edits carry no story words, and the agent's notes are
  credited to the agent. The stamp question in §7 is open for you.
- **P3, model allowlist:** pass. LongCat-Video (open weights) is on it, and so are Remix's models.
  Groq's Whisper stays off.
- **P4, no output published without a person:** pass. Spending and keeping need your tap, and P4a
  passes.
- **P5, nothing canon:** pass. Nothing touched.
- **P6, no third-party requests; no public ratings:** pass. Video comes through our server. P6d isn't
  run (accepted open).
- **P7, payments out of scoring:** pass. Spending only pays for making things.
- **P8, in-world screens match the source:** not touched.
- **Tension:** "your words" relayed through a chat app aren't verifiable as yours. The stamp says so
  honestly, which costs some of the human stamp. That's the §7 question.
