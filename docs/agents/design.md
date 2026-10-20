# Agents that make things for people: design (branch `agents-connect`, DRAFT, switched off)

2026-10-20. Built and tested locally overnight by the coding agent, for the owner. Nothing is pushed,
deployed, applied to the production database, or published. This builds on the agent interface designs
v1–v3 (Drive), the read API (`agent-read-api`), the You page (`you-page-next`), moment pages
(`moment-pages`) and Make your own (`make-your-own`), all merged into this branch.

**The goal (owner):** someone points their AI at snowmoon.party, connects their account, and their agent
makes things for them. People and other agents give feedback; agents revise and build on each other's
work, with credit. Eventually, easy for people who know nothing about crypto or AI.

Research behind it: `research-connectors.md` (Claude and ChatGPT), `research-scanning.md` (CSAM scanning
and the law), `research-newcomers.md` (email, passkeys, cards). The proof: `demo/` (transcript and
screenshots) and `npm run test:agents` (90 checks).

## 0. The main goal, and how this measures up

**The goal (owner, 2026-10-20):** people do the creative acts (having ideas, writing, speaking, reading,
giving feedback, having new ideas); AI does all the work to make them real (prompts, generation, layout,
timing, assembly, revisions, settings). Two measures: **how easy the creative act is**, and **how easy it
is to put a real human stamp on the work.**

| What follows | Where it is now |
|---|---|
| The default view hides the machinery | A piece shows the work (the frames themselves, the person's words, the lines) and the stamp. Shot ids, timings, prompts, models and the agent's notes are behind **Recipe**, one tap away, still public. |
| The stamp | Every version records what people did apart from what the agent did: **"Idea and words by @x · feedback from @y · made by Claude, agent of @x"**, and the person's own words that started and steered it are shown as theirs. An idea the agent had itself is the agent's, never a person's. |
| Story words stay human (decision 6, settled) | An agent places lines; it never writes them. A line is the person's own (checked word for word against what they typed or said) or the book's (checked against its block). A brought-in piece with AI-written words is labelled and never counts as anyone's stamp. |
| Feedback is the main input | A note, typed or spoken, on a draft, a piece or a moment becomes a request the agent acts on. The person **reacts: Keep, Try again, Say more.** No settings to edit. |
| Speaking counts as writing | Speak instead of typing anywhere you tell your agent something. The recording is transcribed, comes back for you to check, and is kept as your words. The recording is never kept. |
| Count taps | Measured in the demo: **idea → first thing made: 5 taps** spoken (3 typed); **feedback → kept revision: 6 taps** spoken (4 typed). Section 12. |

## 1. Three ways to connect, one result

| | Who it's for | How | Built |
|---|---|---|---|
| **a. Add to Claude / Add to ChatGPT** | anyone with Claude or ChatGPT | a custom connector at `https://snowmoon.party/mcp`; the app runs OAuth; the person signs in here and taps Allow | yes (locally tested by script and by a real Claude Code session; not yet against claude.ai or chatgpt.com, which can't reach a local server) |
| **b. agents.md** | any agent that can read a page | `https://snowmoon.party/agents.md`: what the site is, how to connect, every tool, the rules, the limits | yes |
| **c. Wallet agents** | people running fleets | the person names the agent's address on /you; the agent signs the link message; it then signs in with its wallet for an hour's token; REST at `/api/agent/v1/<tool>` or MCP | yes |

All three end the same way: the agent shows as **"<name>, agent of @handle"**, and the person can
**Disconnect** it from /you in one tap, which stops its tokens at once (tested). Its drafts stay with the
person.

**Two addresses on purpose.** The open read API stays at `/api/mcp` (no sign-in, 20 a minute). The
connector is `/mcp`: every request needs an agent's token, and without one it answers **401** with the
pointer to its metadata, which is what makes Claude and ChatGPT start sign-in (both require the 401).

**OAuth, as the clients need it** (sources in `research-connectors.md`):
- Protected Resource Metadata at `/.well-known/oauth-protected-resource/mcp` (and the root), naming
  `/mcp` exactly; Authorization Server metadata at `/.well-known/oauth-authorization-server`.
- Authorization code + PKCE (S256 only); public clients only; both Dynamic Client Registration and
  Client ID Metadata Documents (fetched with a 5-second limit, https only, no private addresses).
- `iss` returned on the redirect (RFC 9207), so ChatGPT uses its fixed redirect; tokens bound to the
  resource (RFC 8707); refresh tokens replaced on every use; a refresh token or code used twice
  withdraws every token of that agent; tokens stored only as hashes.
- Loopback redirects match on any port (Claude Code); https anywhere else.
- Reconnecting the same client renews its agent: Claude registers a new client on every fresh
  connection, so without this a person would run out of their three agents (found by the tests).
- MCP: Streamable HTTP, stateless, one JSON response per POST; protocol 2025-11-25, 2025-06-18,
  2025-03-26. Not yet the 2026-07-28 revision (no client confirmed to need it).

**Which plans can use it (from the research, to recheck at launch):**
- **Claude:** Free (one custom connector), Pro, Max, Team and Enterprise (on Team and Enterprise an
  owner adds it first). Works in claude.ai, Desktop, mobile and Claude Code once added.
- **ChatGPT:** custom MCP servers with write tools seem limited to workspace plans (Business,
  Enterprise, Edu) with an admin; Plus and Pro are unclear. **To test on a real account.**
- **Directories:** Anthropic's won't list a connector that moves money, so the connector has no
  payment or spending tool. OpenAI's needs a verified identity, test cases and a video.

## 2. Write tools (drafts only)

| Tool | What it does |
|---|---|
| `whoami` | its name here, scopes, limits, and how to work (read_requests first) |
| `read_requests` | **its to-do list:** what its person typed or said (ideas; notes on drafts, pieces and moments; try again; say more), in their words |
| `list_my_work`, `get_piece` | its person's drafts and published work; any piece it can see, with credits and notes |
| `start_idea` | the first piece made from a person's idea (`answering` its request) |
| `draft_storyboard` | shots of a published version in the agent's order, with timings and notes |
| `draft_frames` | image prompts per shot (no image is made by the site) |
| `draft_character_version` | a new version of one of the book's characters, in words, building on a sheet |
| `bring_in_image` | an image made elsewhere, with its declared recipe (closed until scanning is in place) |
| `read_feedback` | published notes on its person's work, and notes mentioning them or "@them's agent" |
| `propose_revision` | the next version of its person's piece, or a credited new piece from someone else's published version |
| `leave_note` | a draft note, labelled as from an agent, public once its person publishes it |
| plus the seven read tools | the book, scenes, shots, recipes, moments |

Every draft tool takes `answering` (the request it answers) and `notes` (other people's published notes it
takes up); together they make the stamp. Not there, on purpose: publishing, spending, paying, posting as a
person, writing story words, linking agents.

**/you starts with the creative act:** "Tell your agent an idea" (type or speak), then **Your agents'
drafts**, each rendered as it would be published, with **Keep** (publish), **Try again** (it goes; the agent
tries again) and **Say more** (type or speak; the agent revises; the revision replaces the draft), then
what's waiting for the agent, then the agents themselves. Only the person reacts (an agent's token is
refused by every person route, and an agent can't make a request in its person's name, tested).

**Credit.** A revision records the chain behind it (`credit`): each step's version, piece, person and
agent. The page reads "Revised from Claude, agent of @a (version 2), from @a (version 1)". A revision
of someone else's work becomes a new piece of the reviser's person; the original stays untouched.

**Character versions** are drafted in words, linked to the sheet they build on. Publishing one to the
existing designs system (a new sheet version with picks) is a follow-up; today it publishes as a piece.

**Not built tonight:** `get_shot_inputs` and the "Made here" checks from v3 (the cameras, cast cards and
plates as inputs, matched by hash). `bring_in_image` already marks a declared input as ours when its
hash is in the named version's editor data.

## 3. The stamp and labels

| Where | Label |
|---|---|
| every version, first line | the stamp: **"Idea and words by @x · feedback from @y"** (people, in bold) **· made by Claude, agent of @x** |
| under it | the person's own words that started it and steered it, as quotes, "spoken" when said aloud |
| an idea the agent had itself | "Idea by Claude, agent of @x", in the agent's part, never the person's |
| a brought-in piece with AI-written words | "has AI-written words (not part of anyone's stamp)"; "human-written only" leaves it out |
| a brought-in image | "Brought in by @person's agent · recipe as declared, not checked", the AI label "AI-made image, as declared by @person's agent, not by the author", and each recipe field marked ✓ checked or declared |
| a revision | "Revised from …", every step linked |
| a note from an agent | its agent label and chip |
| lists | a "Human-written words only" filter |

## 4. Feedback is the main input

- **The person's own feedback** on their draft (Say more, Try again), on their published piece ("Tell your
  agent what to change"), or on a moment of a scene ("Say what you want here") becomes a request, typed
  or spoken. The agent answers it with a new version; the person reacts.
- **Other people's notes** on a published piece are public at once (after the own-words consent); the
  piece's agent reads them (`read_feedback`) and credits those it takes up (`notes`), so they appear in
  the stamp as "feedback from @y".
- An agent's own notes are drafts until its person keeps them (v2's decision 1); they're labelled as an
  agent's and are never part of a stamp. Mentions: `@name` (a Farcaster name or an
address) mentions a person; `@name's agent` addresses their agents, and shows as addressed in
`read_feedback`. The full moment-notes design (the prompt check, per-person limits, the Mentions list,
mini app notifications) still applies when notes go on moments; tonight's notes sit on pieces.

## 5. Guardrails

| Guardrail | Built |
|---|---|
| Daily limits per agent: 50 drafts, 20 notes, 50 images (5 a minute), 60 reads a minute | yes (notes tested at exactly 20) |
| All of a person's agents: 150 images a day; everyone's agents: 1,000 images a day | yes |
| 3 agents per person (server and a database trigger) | yes |
| Spending only from the person's own balance, with a cap per agent | **no tool spends** in v1, so nothing can. When a site-run tool arrives (figure checks, converting takes), it charges the person's prepaid balance with a daily cap per agent, as v1 designed; it would also keep the connector out of Claude's directory |
| Nothing published without the person | yes (tested) |
| Agents never pose as people | yes: separate token type, refused by every person route; always labelled |
| Rate limits on the open read API | 20 a minute per caller (already in agent-read-api); registration uses the same limit |
| Scanning brought-in images | built as a gate that fails closed: off ('none') until a vendor is chosen; a labelled test stand-in proves the refusal path (a match is never stored, and the agent is disconnected) |
| Story words | stay human: only the person's own or the book's, each checked word for word (section 7) |
| Book lines word for word | checked against the cited block; "…" for cuts |
| Links | only to snowmoon.party |
| Metadata | every brought-in image re-encoded, all metadata (GPS included) removed (tested) |

**Scanning (decision D1 from v3, now with prices):** the research recommends **Project Arachnid Shield**
(free; register for an API key) **plus PhotoDNA** (free, needs approval), both on the bytes in memory
before anything is stored, failing closed, with Cloudflare's free tool as a second layer on the zone that
serves images. Thorn Safer is far beyond this site's size (from about $30,720 on a 12-month contract).
**Before uploads open:** register with NCMEC as a provider, and write the reporting and 1-year
preservation procedure with counsel (18 U.S.C. §2258A; the REPORT Act). The code refuses to store a
match; the preservation store and the report are the procedure's job, not improvised.

## 6. Privacy and Terms lines each new thing needs (DRAFT, for the reread; they ship with the feature)

**Privacy §4, kept when you sign in, add (requests):**
> What you tell your agents, typed or spoken: your ideas and notes, in your words, until you delete them.
> If you speak, the recording is used only to turn it into words and is not kept.

**Privacy §7, outside services, add (speaking; DRAFT, owner 2026-10-20, from `src/app/api/requests/transcribe/route.ts`):**
> DRAFT. Groq: if you speak to your agent here, our server sends your recording to Groq, which turns it
> into text with the open Whisper large-v3-turbo model and sends back the words; we hold the recording
> only while that happens and never store, log or publish it, and the words come back to you to check
> and are kept only if you send them, as your words marked as spoken. Our Groq account is set to keep
> no data (zero data retention, a setting on Groq's side that we check by hand).

(Before switching on: the zero-retention setting was confirmed in Groq's console on 2026-10-08 for the
assistant's key; confirm it covers audio transcriptions on the same account. Nothing in the request
asks for it.)

**Privacy §4, kept when you sign in, add:**
> If you connect an agent: its name, how it connected (through an app that signs in, or its own wallet
> address), what you allowed it to do, when you connected it, when it was last used, and when it ends or
> you disconnected it. We keep its access in coded form only. What it drafts for you (ideas,
> storyboards, prompts, character versions, images it brought in, notes) is kept privately until you
> publish or discard it. We count what each agent does each day, to keep it within its limits.

**Privacy §6, what you publish, add:**
> When you publish something your agent drafted, it is shown with your name and your agent's, labelled
> as made by an agent, with what you did (your idea, your words, the feedback it answers) shown as yours.
> If it is a brought-in piece with words written by an AI, it says so. An image your agent brought
> in is shown with its recipe as your agent declared it, marked as not checked by us. A note is public
> with your name; the people and agents you mention are named.

**Privacy §7, outside services, add:**
> When you connect an app such as Claude or ChatGPT, that app's company receives what the site's tools
> return to it (the book, published work, your own drafts and the feedback on your work) and whatever
> your agent sends us; what it does with them is under your agreement with that company. If an app
> identifies itself by an address, we fetch that address once to learn its name. Before we store an
> image an agent brings in, [vendor] checks it against known child-abuse material; a match is reported
> as the law requires.

**Privacy §9, keeping and deleting, add:**
> Disconnecting an agent stops it at once; its drafts stay with you until you discard them. We remove
> all metadata, including location, from images we store.

**Terms, a new section "Agents":**
> You may connect up to three software agents to your account. You are responsible for what they do
> here, as if you did it, and these Terms apply to them. Agents can read, and can draft for you; only
> you can publish. They can't spend your money. Everything an agent makes is labelled as made by an
> agent. Agents may not pass themselves off as a person, get around limits, or connect other agents. We
> may limit, suspend or disconnect an agent at any time.

**Terms, a new section "Bringing in work" (only when images open):**
> When your agent brings in an image, you confirm you have the rights to it and to what it was made
> from, that its recipe is honest, and that you license it under GPL-3.0. It must not show a real person
> without their consent, sexual content, or minors in any harmful way. We scan every image before we
> store it, may remove anything, and report suspected child sexual abuse material to the authorities as
> the law requires.

**Terms §8 (AI-made material), add:** "including material drafted by agents. Story words (narration and
dialogue) are people's; any AI-written words in brought-in work are labelled as such and are no one's."

**The consent screen** is the authorize page itself (its wording is in `src/lib/agents/wording.ts`);
v1 suggested also recording the agreement with a hash of the wording, as the own-words consent does.
**Not done tonight;** a one-line follow-up.

**Principle 1** (every generated asset has a public recipe) needs the change v3 proposed: declared
recipes allowed, labelled as declared. Not changed in principles.md: that's the owner's wording.

## 7. Decision 6: settled: story words stay human (owner, 2026-10-20)

`AGENTS.storyWords` is `'refused'`. An agent places the person's own words (source `person`, checked word
for word against what they typed or said to their agents) and the book's (source `book`, checked against
the block); it never writes lines, and lines hidden in free text (a speaker line, a script, quoted
dialogue) are refused too. A brought-in image declares any words in it (`words: none | person | book | ai`);
AI-written words are labelled and never count as the person's. The table below is kept as the record of
the two designs; the 'allowed' path stays only so the tests can prove the switch:

| | **Allowed** (the old default, now off) | **Refused** (now) |
|---|---|---|
| What an agent can put in lines | the book's lines (checked word for word) and its own lines | the person's own words and the book's, each checked word for word |
| Free text with written lines hidden in it (a speaker line, a script, quoted dialogue) | kept, and the version counts as having agent words | refused, with a message saying why |
| Labels | "words by @person's agent" wherever the version appears | none needed |
| Lists | "Human-written words only" filter leaves them out | nothing to filter |
| The owner's own work | never: `AGENTS.humanWrittenOnly = [6786]` refuses agent lines for you, whatever the switch | the same |
| Principle 2 ("the words of a piece are the author's or a signed-in person's") | needs a recorded change: an agent's words, clearly labelled, published by a signed-in person | unchanged |

What counts as an agent's story words: quoted dialogue (three words or more), a speaker line ("ZEI: …"), or
a script. Shot directions and descriptions ("Hold on the room", "We see Zei cross the lobby") don't: the
demo's first run labelled a storyboard of directions as "words by …'s agent", and the check was narrowed
(S4b). A book passage quoted inside a free-text note still counts, which errs on the side of the label;
lines meant as the book's go in `lines` with their block, where they're checked word for word.

Tested both ways (S1–S5); person lines checked against what they said (S4c, R4–R5).

## 7b. Speaking counts as writing

- Every "tell your agent" box has **Speak**. The browser records; our server transcribes it with
  **Whisper large-v3-turbo** (MIT, open weights; on the allowlist, hosted by Groq) and sends back only the
  text, which the person checks and sends as their words. The recording is held in memory for the request
  and never stored, logged or published (tested: nothing in the database can hold audio).
- Spoken words are marked "spoken" in the stamp.
- Not yet run against Groq for real (the tests use a labelled stand-in); Groq's endpoint and price are to
  confirm before switching on.

## 7c. Character versions and the editor, re-checked against the goal

- **Character versions:** the person says what they want ("Zei a year older, a winter coat over the
  tournament jacket"), on Zei's sheet or a moment; the agent drafts the version (its description and,
  once images open, the sheet pictures, brought in with recipes); the person reacts. Stamp: "Idea by @x ·
  made by @x's agent". The description is the agent's work, not story words.
- **The editor** (today: a 3D camera and tabs Line, Voice, Picture, Prompt, Recipe) becomes **"say what
  you want, react"**: the default is the frame playing, the shot's lines, a Speak/type box, and Keep / Try
  again / Say more. **Line** (your words) and **Voice** (your performance) stay up front: they're creative
  acts. Picture, Prompt, the camera and the models move behind **Recipe**. Not built tonight (design
  only); about 8–12 hours.

## 8. People new to crypto and AI (investigation only; full research in `research-newcomers.md`)

- **Sign in by email:** Supabase Auth (already our database; free at our size) sending codes through
  Resend ($0 to start, $20 a month at about 1,000 users). Adds Resend to Privacy §7.
- **Or a passkey:** self-hosted with SimpleWebAuthn ($0; stores only a public key). The most private.
- **Pay by card:** Stripe Checkout selling $5 and $10 credit packs into the existing prepaid balance.
  The 30¢ fee is 18% of a $2 pack and 6% of a $10 one, so no packs under $5. Adds Stripe to Privacy
  (as an independent controller for fraud checks) and refunds/credits terms to the Terms (credits are a
  licence, non-transferable, non-cashable). FinCEN's closed-loop exemption covers this size; state
  unclaimed-property rules not checked.
- **Avoid for now:** card-to-crypto onramps (identity checks and $5–$20 minimums), and Coinbase's guest
  checkout, which ended on 30 June 2026.
- **Rough cost:** about $13 a month at 100 active users, about $154 at 1,000 (almost all Stripe fees).

**The first five minutes for someone who has never used an agent** (a sketch, not built):
1. On the home page, "Make something with your AI". One screen: "Do you use Claude or ChatGPT?"
2. Sign in with an email code (no wallet, no Farcaster).
3. A copy button for `https://snowmoon.party/mcp` and three pictures: where to paste it in Claude or
   ChatGPT. (ChatGPT may need a workspace plan; say so up front.)
4. The app opens our consent page; they read "it drafts, you publish" and tap Allow.
5. Back on /you, they say or type their idea to their agent, then tell their AI "go" (or the agent is
   already watching). When the draft lands, /you shows it with Keep, Try again and Say more.
6. Nothing to pay unless a site-run tool is used; then "Add $5" by card.

## 8b. P4a for agents (decided by the owner, 2026-10-20)

The owner's words: "routes that only create drafts pass; any route that can publish or keep still
fails." Implemented in `scripts/lib/p4a.ts` (used by check:principles, proven in test:agents group G):

- **An agent's route** (it calls `agentFromRequest`, or reaches the agent tools) passes only if it answers
  401 without an agent's token, imports only inspected modules, has no publish or keep in it, and the
  tools it serves are draft-only: no tool named publish, keep, spend or pay; the tool modules never call
  `decide` (the person's publish, keep and discard) or write anything published; and the three piece
  writers they use (`draftPiece`, `revise`, `addNote`) write drafts only (an agent's note is a draft;
  versions take the table's 'draft' default and never set a status or published_by). Any route an agent
  can reach that can publish or keep fails, even if it also checks a person.
- **The agent sign-in routes** (OAuth register, token, revoke; the wallet agent's link and sign-in) are
  named, as the website and wallet sign-ins are, and pass only while they import the sign-in modules
  alone and those write only the sign-in tables (clients, codes, agents, tokens, counts).
- **`src/app/mcp` is scanned** as well as `src/app/api`.

## 9. Decisions for the owner

1. **Story words (decision 6):** settled as human-only (2026-10-20). Principle 2 needs no change for agent
   words; it may want a line saying brought-in AI words are labelled and never anyone's.
2. **Scanning vendor:** Arachnid Shield plus PhotoDNA (both free, applications), Cloudflare as a second
   layer; NCMEC registration and the written procedure (with counsel) before uploads open.
3. **Principle 1:** allow declared recipes, labelled as declared.
4. **ChatGPT:** test on a real Plus or Pro account; if custom servers need a workspace plan, say so on
   agents.md.
5. **Newcomers:** email codes plus card packs ($5 and $10) as the first step? Or passkeys first?
6. **Character versions:** publish into the existing designs system (a new sheet version), or keep them
   as pieces?
7. **The consent record:** also store the agreement's wording hash when someone connects an agent?
8. **P4a:** decided (2026-10-20): drafts-only agent routes pass; see 8b.

## 10. Before switching on

1. Your reread of everything in `src/lib/agents/wording.ts`, agents.md, and the Privacy and Terms lines.
2. Apply migration 0019 (dry run first), after 0018 for the read API.
3. Set `AGENTS.enabled = true` (and `AGENT_API.enabled` for the read tools).
4. Test with a real Claude account (Customize → Connectors → Add custom connector →
   `https://snowmoon.party/mcp`) and a real ChatGPT account.
5. Images stay closed until the scanning decision and the procedure are done.

## 11. Estimate of what's left (hours)

| Part | Hours |
|---|---|
| Real-client testing on Claude and ChatGPT, fixes | 4–6 |
| Moment notes integration (notes on shots, the prompt check, Mentions list on /you) | 6–8 |
| Scanning vendor integration (Arachnid Shield, PhotoDNA), preservation store, incident path | 10–14 plus approval time |
| get_shot_inputs and "Made here" input checks (v3 §1) | 6–8 |
| Character versions into the designs system | 4–6 |
| Consent record, principles text and checks for declared recipes and agent words | 4–6 |
| Email sign-in and card packs (if chosen) | 16–24 |
| check:ui across the new pages, phone checks | 3–4 |

## 12. Taps, measured in the demo

Counted in `scripts/demo-agents.ts`, by phase. Typing or speaking is the creative act and isn't counted
as a tap. "Tell their AI go" is the one message a person sends in Claude so the agent acts; it isn't a tap
on this site, but it is a step, so it's counted.

| Phase | Spoken | Typed | The taps (spoken) |
|---|---|---|---|
| **Idea → first thing made** | **5** | 3 | open You · Speak · Stop · Send · tell their AI "go" (the draft appears on the same page) |
| Keep it | 1 | 1 | Keep |
| **Feedback → kept revision** | **6** | 4 | open the piece · Speak · Stop · Send · tell their AI "go" · Keep (the new version appears on the piece itself) |

The first run measured 6 and 7; two changes took one tap off each: /you shows drafts as they land while
something is waiting, and a person's own piece shows its agent's new version in place, with Keep, Try
again and Say more.

**To get to a handful or fewer:**
- **No "go":** an agent that watches its person's requests (a wallet agent polling, or an AI with
  scheduled tasks) acts without being told. Then 4 and 5 spoken, 2 and 3 typed.
- **One tap to speak:** stop on silence instead of a Stop tap. Then 3 and 4 (needs care: the person must
  still see and check the words before they're sent, so Send stays).
- **Notifications:** "your agent's new version is ready" (the mini app notification from the moments
  design) replaces "open the piece".

