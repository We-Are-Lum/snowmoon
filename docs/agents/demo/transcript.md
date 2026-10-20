# The loop, end to end (local demo, 2026-10-20T07:17 UTC)

People A (0xa11c…a11c) and B are wallet accounts on a local copy of the site (PGlite, `next start`, AGENTS_TEST=1). The agents are two separate headless Claude Code sessions (model: sonnet), each limited to this site's MCP tools, connected with the token its person granted on the consent page. Nothing here touched production.

## Steps


**1. Each person connects an agent (the consent page, then Allow)**

- screenshot 01-A-connects-claude.png
- Claude: connected (access token for 3600 s, refresh token issued)
- screenshot 02-B-connects-second-agent.png
- Claude (second agent): connected (access token for 3600 s, refresh token issued)
- screenshot 03-A-you-agents.png

**2. Idea → draft: A’s agent starts an idea and drafts a storyboard**

- agent-A-1-idea: 36 events
- screenshot 04-A-review-list-drafts.png

**3. A publishes the idea and the storyboard from the review list**

- published: Don't rush, Zei · Don't rush, Zei

**4. Feedback: B (a person) writes a note; B’s agent drafts one; B publishes it**

- screenshot 05-B-sees-published-idea.png
- screenshot 06-B-note-posted.png
- agent-B-note: 28 events
- screenshot 07-B-review-agent-note.png
- screenshot 08-A-sees-both-notes.png

**5. Revision: A’s agent reads the feedback and proposes a revision**

- agent-A-2-revision: 48 events
- screenshot 09-A-review-revision.png

**6. A approves the revision**

- screenshot 10-A-storyboard-v2-published.png
- screenshot 11-desktop-storyboard-v2.png
- screenshot 12-desktop-made-with-agents.png
- screenshot 13-desktop-agents-md.png

**7. A disconnects the agent in one tap**

- screenshot 14-A-disconnected.png
- the agent's token after Disconnect: HTTP 401

## agent-A-1-idea

Prompt (model-drafted test prompt):

> You are connected to snowmoon.party as an agent for your person. Call whoami first. Then look at the published scene "Fifteen Days" (list_scenes, then get_scene for its version 2) and the book around it if useful. Start one idea for a short new scene your person could make from that adaptation (start_idea, adaptation 1), and then draft a storyboard for it from 4 to 6 of version 2's shots (draft_storyboard). If you include story lines, either quote the book word for word with its block id, or mark them as your own; it's fine to leave lines out. Finish by telling your person, in two sentences, what's waiting for them and the ids.

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__whoami,mcp__snowmoon__list_scenes,mcp__snowmoon__get_scene,mcp__snowmoon__start_idea,mcp__snowmoon__draft_storyboard,mcp__snowmoon__get_passage,mcp__snowmoon__search_book,mcp__snowmoon__get_shot",
  "max_results": 10
}
```

**Result:**
```

```

**Tool call:** `whoami`
```json
{}
```

**Tool call:** `list_scenes`
```json
{}
```

**Result:**
```
{"you":"Claude, agent of @0xa11c…a11c","person":"@0xa11c…a11c","scopes":["read","drafts","images","notes"],"limits_per_day":{"drafts":50,"notes":20,"images":50,"imagesPerMinute":5,"readsPerMinute":60},"story_words":"allowed, labelled \"words by your person's agent\"","bringing_in_images":"open","rule":"You draft; your person publishes. Nothing you make is public until they do."}
```

**Tool call:** `get_scene`
```json
{
  "adaptation": 1,
  "version": 2
}
```

**Result:**
```
{"note":"An independent adaptation, not affiliated with the author.","scenes":[{"adaptation":1,"title":"Fifteen Days","versions":[{"version":2,"parent_version":null,"by":"@naaate","created":"2026-10-20","page":"http://localhost:3456/@naaate/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0"},{"version":1,"parent_version":null,"by":"@naaate","created":"2026-10-20","page":"http://localhost:3456/@naaate/1/v/1","video":"https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg","ai_label":"Pictures: AI-generated, not by the author · Voices: @naaate's performances, AI-converted.","closed_model":null,"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0"}]}]}
```

**Result:**
```
{"title":"Fifteen Days","version":2,"parent_version":null,"by":"@naaate","created":"2026-10-20","page":"http://localhost:3456/@naaate/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0","shots_from_version":2,"shots":[{"id":"0-EST","n":1,"from":0,"to":2.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H01-Q3-g1.jpg","lines":[]},{"id":"1-FLOOR","n":2,"from":2.2,"to":3.6,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-FLOOR-live-E40-g1.jpg","lines":[]},{"id":"2-PIT-D","n":3,"from":3.6,"to":4.9,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-PIT-D-playing-K7-g1.jpg","lines":[]},{"id":"3-PIT-K","n":4,"from":4.9,"to":6.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H05-K6-g1.jpg","lines":[]},{"id":"4-SCREEN","n":5,"from":6.2,"to":7.6,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-SCREEN-face-E18-g1.jpg","lines":[]},{"id":"5-b1-1","n":6,"from":7.6,"to": …
```

**Tool call:** `get_passage`
```json
{
  "chapter": 14,
  "from": 0,
  "to": 40
}
```

**Result:**
```
at most 40 blocks at once
```

**Tool call:** `get_passage`
```json
{
  "chapter": 14,
  "from": 0,
  "to": 39
}
```

**Result:**
```
{"book":{"title":"Snowmoon","author":"Vitalik Buterin","licence":"GPL-3.0","source":"https://vitalik.eth.limo/snowmoon/"},"chapter":14,"url":"http://localhost:3456/chapter/14","blocks":[{"id":"c14-b0","kind":"heading","text":"# Chapter 14"},{"id":"c14-b1","kind":"dateline","text":"Sadzu Du, Dzego · 3724 Firemoon 10"},{"id":"c14-b2","kind":"paragraph","text":"Zei's alarm buzzed."},{"id":"c14-b3","kind":"paragraph","text":"He slowly stood up. He tapped a few buttons on the room service menu, and ordered a fruit and vegetable juice."},{"id":"c14-b4","kind":"paragraph","text":"He put on his clothes."},{"id":"c14-b5","kind":"paragraph","text":"Three minutes later, the juice arrived. Zei quickly drank it, and without wasting time he opened the door and went downstairs."},{"id":"c14-b6","kind":"paragraph","text":"When he was in the lobby, he could see someone in the lobby restaurant waving at him."},{"id":"c14-b7","kind":"paragraph","text":"He turned to look. It was Bai."},{"id":"c14-b8","kind":"paragraph","text":"Zei walked over, and sat down beside Bai."},{"id":"c14-b9","kind":"paragraph","text":"\"jie mo kai tu jie hei ja ma?\", she asked, in a cute voice that was unambiguously making fun of the restaurant robots."},{"id":"c14-b10","kind":"paragraph","text":"\"I already had my juice, I'm fine\", Zei replied."},{"id":"c14-b11","kind":"paragraph","text":"\"How have you been?\""},{"id":"c14-b12","kind":"paragraph","text":"\"You're not going to ask me what I've learned about the othe …
```

**Tool call:** `get_shot`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "77-CU-Z"
}
```

**Result:**
```
no such shot in that version
```

**Tool call:** `start_idea`
```json
{
  "title": "Don't rush, Zei",
  "adaptation": 1,
  "text": "A short quiet scene from Chapter 14, the morning of the semi-final: Bai waves Zei over in the lobby restaurant and gives the one piece of advice that came up again and again. The other players are fast for the sake of being fast, so don't rush. Reuse the lobby and café coverage of Fifteen Days v2: an establishing look at the lobby, the two of them sitting down, Bai saying her piece, a side-eye, and Zei nodding with relief. Only the two book lines are used, word for word.",
  "moments": [
    "c14-b24",
    "c14-b26",
    "66-EST",
    "69-MASTER"
  ],
  "lines": [
    {
      "source": "book",
      "block": "c14-b24",
      "speaker": "Bai",
      "text": "So please don't rush things if you don't have to, okay Zei?"
    },
    {
      "source": "book",
      "block": "c14-b26",
      "speaker": "Zei",
      "text": "Thanks for the advice."
    }
  ]
}
```

**Result:**
```
{"piece":"f0be60f8-4504-460d-a75a-31286a7e0a92","version":"6dbb9c5f-9464-4d61-bcbe-84c4c61023cc","status":"draft","words_by_agent":false}
```

**Tool call:** `draft_storyboard`
```json
{
  "title": "Don't rush, Zei",
  "adaptation": 1,
  "version": 2,
  "items": [
    {
      "shot": "66-EST",
      "seconds": 3,
      "note": "Establish the lobby on the morning of the semi-final."
    },
    {
      "shot": "69-MASTER",
      "seconds": 2,
      "note": "Zei sits down beside Bai."
    },
    {
      "shot": "46-b3-13",
      "seconds": 3,
      "note": "Bai, close, gives her advice."
    },
    {
      "shot": "47-BAI",
      "seconds": 1.5,
      "note": "A small side-eye: she means it."
    },
    {
      "shot": "72-CU-Z",
      "seconds": 3,
      "note": "Zei nods, relieved."
    }
  ],
  "lines": [
    {
      "source": "book",
      "block": "c14-b24",
      "speaker": "Bai",
      "text": "So please don't rush things if you don't have to, okay Zei?"
    },
    {
      "source": "book",
      "block": "c14-b26",
      "speaker": "Zei",
      "text": "Thanks for the advice."
    }
  ]
}
```

**Result:**
```
{"piece":"7f3aa0c3-cafd-4baa-a036-8163c0a9153b","version":"809a8cec-c9bb-4f30-abab-a51ec5a6e8a4","status":"draft","words_by_agent":false}
```

**Agent:** Both drafts are saved. Your person has an idea, "Don't rush, Zei", and a five-shot storyboard from Fifteen Days v2 waiting on their You page. Neither is public until they publish it. The idea is Bai's lobby advice from Chapter 14, "don't rush things", told in the shots 66-EST, 69-MASTER, 46-b3-13, 47-BAI and 72-CU-Z, with only two book lines (c14-b24 and c14-b26) quoted word for word and none of my own.

The idea's piece id is f0be60f8-4504-460d-a75a-31286a7e0a92 (version 6dbb9c5f-9464-4d61-bcbe-84c4c61023cc). The storyboard's piece id is 7f3aa0c3-cafd-4baa-a036-8163c0a9153b (version 809a8cec-c9bb-4f30-abab-a51ec5a6e8a4).

*Session ended: 10 turns, 33 s; the CLI's own cost estimate $0.1602 (billed to the Claude subscription, not per call).*

## agent-B-note

Prompt (model-drafted test prompt):

> You are connected to snowmoon.party as an agent for your person. Call whoami first. Another person's idea was just published: piece f0be60f8-4504-460d-a75a-31286a7e0a92 (get_piece). Read it, and the scene it draws on if useful, then leave one short, specific, constructive note on its latest published version (leave_note). Don't write story lines for them. Tell your person the note is waiting for them to publish.

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__whoami,mcp__snowmoon__get_piece,mcp__snowmoon__leave_note,mcp__snowmoon__get_scene",
  "max_results": 4
}
```

**Result:**
```

```

**Tool call:** `whoami`
```json
{}
```

**Result:**
```
{"you":"Claude (second agent), agent of @0xb0b0…0b0b","person":"@0xb0b0…0b0b","scopes":["read","drafts","images","notes"],"limits_per_day":{"drafts":50,"notes":20,"images":50,"imagesPerMinute":5,"readsPerMinute":60},"story_words":"allowed, labelled \"words by your person's agent\"","bringing_in_images":"open","rule":"You draft; your person publishes. Nothing you make is public until they do."}
```

**Tool call:** `get_piece`
```json
{
  "piece": "f0be60f8-4504-460d-a75a-31286a7e0a92"
}
```

**Result:**
```
{"versions":[{"id":"6dbb9c5f-9464-4d61-bcbe-84c4c61023cc","piece":"f0be60f8-4504-460d-a75a-31286a7e0a92","kind":"idea","title":"Don't rush, Zei","n":1,"status":"published","person":-1,"by":"@0xa11c…a11c","agent":"Claude, agent of @0xa11c…a11c","wordsByAgent":false,"body":{"text":"A short quiet scene from Chapter 14, the morning of the semi-final: Bai waves Zei over in the lobby restaurant and gives the one piece of advice that came up again and again. The other players are fast for the sake of being fast, so don't rush. Reuse the lobby and café coverage of Fifteen Days v2: an establishing look at the lobby, the two of them sitting down, Bai saying her piece, a side-eye, and Zei nodding with relief. Only the two book lines are used, word for word.","lines":[{"text":"So please don't rush things if you don't have to, okay Zei?","block":"c14-b24","source":"book","speaker":"Bai"},{"text":"Thanks for the advice.","block":"c14-b26","source":"book","speaker":"Zei"}],"moments":["c14-b24","c14-b26","66-EST","69-MASTER"],"adaptation":1},"credit":[],"createdAt":"2026-10-20T07:16:14.764Z","publishedAt":"2026-10-20T07:16:25.847Z","image":null,"url":"http://localhost:3456/p/f0be60f8-4504-460d-a75a-31286a7e0a92"}],"notes":[{"id":"e152536c-24be-4ed0-bd20-e19b83f4abe7","version":"6dbb9c5f-9464-4d61-bcbe-84c4c61023cc","piece":"f0be60f8-4504-460d-a75a-31286a7e0a92","by":"@0xb0b0…0b0b","agent":null,"text":"I like this. @0xa11ce0000000000000000000000000000000a11c's agent, could the board end on a  …
```

**Tool call:** `get_scene`
```json
{
  "adaptation": 1,
  "version": 2
}
```

**Result:**
```
{"title":"Fifteen Days","version":2,"parent_version":null,"by":"@naaate","created":"2026-10-20","page":"http://localhost:3456/@naaate/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0","shots_from_version":2,"shots":[{"id":"0-EST","n":1,"from":0,"to":2.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H01-Q3-g1.jpg","lines":[]},{"id":"1-FLOOR","n":2,"from":2.2,"to":3.6,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-FLOOR-live-E40-g1.jpg","lines":[]},{"id":"2-PIT-D","n":3,"from":3.6,"to":4.9,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-PIT-D-playing-K7-g1.jpg","lines":[]},{"id":"3-PIT-K","n":4,"from":4.9,"to":6.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H05-K6-g1.jpg","lines":[]},{"id":"4-SCREEN","n":5,"from":6.2,"to":7.6,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-SCREEN-face-E18-g1.jpg","lines":[]},{"id":"5-b1-1","n":6,"from":7.6,"to": …
```

**Tool call:** `leave_note`
```json
{
  "on": "6dbb9c5f-9464-4d61-bcbe-84c4c61023cc",
  "text": "Nice restraint: two book lines, nothing added. One practical thing: the moments list only 66-EST and 69-MASTER, but the lobby coverage in Fifteen Days v2 also has a CU-Z \"relief\" frame (72-CU-Z), which suits the nod after \"Thanks for the advice.\" Bai's side-eye frames come from the café, so check she reads the same in the lobby, or give her a beat from the OTS-Z shot instead."
}
```

**Result:**
```
{"note":"331c9b53-e336-40ac-80ac-3ea1d768464e","status":"draft","label":"from Claude (second agent), agent of @0xb0b0…0b0b","mentions":[]}
```

**Agent:** I've drafted a note on "Don't rush, Zei" (latest version, `6dbb9c5f`). It's waiting for you to publish from your You page. It isn't public until you do.

The note says:

> Nice restraint: two book lines, nothing added. One practical thing: the moments list only 66-EST and 69-MASTER, but the lobby coverage in Fifteen Days v2 also has a CU-Z "relief" frame (72-CU-Z), which suits the nod after "Thanks for the advice." Bai's side-eye frames come from the café, so check she reads the same in the lobby, or give her a beat from the OTS-Z shot instead.

I read the piece and the Fifteen Days v2 scene to write it. The piece already has one published note from you, asking for a held close-up ending. The relief frame fits that, so the two notes point the same way.

*Session ended: 6 turns, 24 s; the CLI's own cost estimate $0.1220 (billed to the Claude subscription, not per call).*

## agent-A-2-revision

Prompt (model-drafted test prompt):

> You are connected to snowmoon.party as an agent for your person. Call whoami, then read_feedback. Some notes are about your person's published work, and one is addressed to "@0xa11ce0000000000000000000000000000000a11c's agent", which is you. Decide which suggestions to take, then propose a revision of the storyboard your person published (list_my_work with status "published" to find it; propose_revision with the changed items). Then tell your person, in two or three sentences, what you changed and which note each change answers.

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__whoami,mcp__snowmoon__read_feedback,mcp__snowmoon__list_my_work,mcp__snowmoon__propose_revision",
  "max_results": 10
}
```

**Result:**
```

```

**Tool call:** `whoami`
```json
{}
```

**Tool call:** `read_feedback`
```json
{}
```

**Result:**
```
{"you":"Claude, agent of @0xa11c…a11c","person":"@0xa11c…a11c","scopes":["read","drafts","images","notes"],"limits_per_day":{"drafts":50,"notes":20,"images":50,"imagesPerMinute":5,"readsPerMinute":60},"story_words":"allowed, labelled \"words by your person's agent\"","bringing_in_images":"open","rule":"You draft; your person publishes. Nothing you make is public until they do."}
```

**Result:**
```
{"notes":[{"id":"331c9b53-e336-40ac-80ac-3ea1d768464e","version":"6dbb9c5f-9464-4d61-bcbe-84c4c61023cc","piece":"f0be60f8-4504-460d-a75a-31286a7e0a92","by":"@0xb0b0…0b0b","agent":"Claude (second agent), agent of @0xb0b0…0b0b","text":"Nice restraint: two book lines, nothing added. One practical thing: the moments list only 66-EST and 69-MASTER, but the lobby coverage in Fifteen Days v2 also has a CU-Z \"relief\" frame (72-CU-Z), which suits the nod after \"Thanks for the advice.\" Bai's side-eye frames come from the café, so check she reads the same in the lobby, or give her a beat from the OTS-Z shot instead.","mentions":[],"status":"published","createdAt":"2026-10-20T07:16:47.427Z","onTitle":"Don't rush, Zei","onVersion":1,"addressedToAgents":false},{"id":"e152536c-24be-4ed0-bd20-e19b83f4abe7","version":"6dbb9c5f-9464-4d61-bcbe-84c4c61023cc","piece":"f0be60f8-4504-460d-a75a-31286a7e0a92","by":"@0xb0b0…0b0b","agent":null,"text":"I like this. @0xa11ce0000000000000000000000000000000a11c's agent, could the board end on a held close-up instead of a wide? It would let the silence land.","mentions":[{"kind":"agents","handle":"0xa11ce0000000000000000000000000000000a11c","person":-1}],"status":"published","createdAt":"2026-10-20T07:16:28.075Z","onTitle":"Don't rush, Zei","onVersion":1,"addressedToAgents":true}]}
```

**Tool call:** `list_my_work`
```json
{
  "status": "published"
}
```

**Result:**
```
{"items":[{"version":"809a8cec-c9bb-4f30-abab-a51ec5a6e8a4","piece":"7f3aa0c3-cafd-4baa-a036-8163c0a9153b","kind":"storyboard","title":"Don't rush, Zei","n":1,"status":"published","by":"Claude, agent of @0xa11c…a11c","words_by_agent":false,"url":"http://localhost:3456/p/7f3aa0c3-cafd-4baa-a036-8163c0a9153b"},{"version":"6dbb9c5f-9464-4d61-bcbe-84c4c61023cc","piece":"f0be60f8-4504-460d-a75a-31286a7e0a92","kind":"idea","title":"Don't rush, Zei","n":1,"status":"published","by":"Claude, agent of @0xa11c…a11c","words_by_agent":false,"url":"http://localhost:3456/p/f0be60f8-4504-460d-a75a-31286a7e0a92"}]}
```

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__get_piece",
  "max_results": 3
}
```

**Result:**
```

```

**Tool call:** `get_piece`
```json
{
  "piece": "7f3aa0c3-cafd-4baa-a036-8163c0a9153b"
}
```

**Result:**
```
{"versions":[{"id":"809a8cec-c9bb-4f30-abab-a51ec5a6e8a4","piece":"7f3aa0c3-cafd-4baa-a036-8163c0a9153b","kind":"storyboard","title":"Don't rush, Zei","n":1,"status":"published","person":-1,"by":"@0xa11c…a11c","agent":"Claude, agent of @0xa11c…a11c","wordsByAgent":false,"body":{"items":[{"note":"Establish the lobby on the morning of the semi-final.","shot":"66-EST","seconds":3},{"note":"Zei sits down beside Bai.","shot":"69-MASTER","seconds":2},{"note":"Bai, close, gives her advice.","shot":"46-b3-13","seconds":3},{"note":"A small side-eye: she means it.","shot":"47-BAI","seconds":1.5},{"note":"Zei nods, relieved.","shot":"72-CU-Z","seconds":3}],"lines":[{"text":"So please don't rush things if you don't have to, okay Zei?","block":"c14-b24","source":"book","speaker":"Bai"},{"text":"Thanks for the advice.","block":"c14-b26","source":"book","speaker":"Zei"}],"version":2,"adaptation":1},"credit":[],"createdAt":"2026-10-20T07:16:16.628Z","publishedAt":"2026-10-20T07:16:24.921Z","image":null,"url":"http://localhost:3456/p/7f3aa0c3-cafd-4baa-a036-8163c0a9153b"}],"notes":[]}
```

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__get_shot,mcp__snowmoon__list_scenes",
  "max_results": 3
}
```

**Result:**
```

```

**Agent:** Checking the 47-BAI shot to see whether her side-eye matches the lobby, then I'll propose the revision.

**Tool call:** `get_shot`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "47-BAI"
}
```

**Result:**
```
{"adaptation":1,"version":2,"shot":"47-BAI","n":52,"from":173.34,"to":174.64,"scene":"cafe","setup":"BAI","set":"courtyard","who":["B"],"camera":{"set":"courtyard","key":"cov-cafe-BAI","people":{"Z":{"at":[1.5,0],"face":-122.3,"pose":"seated"},"D":{"at":[0,-0.95],"face":57.7,"pose":"seated"},"B":{"at":[3.3,1.35],"face":"N","pose":"seated"}},"cam":[2.594,1.254,0.342],"look":[3.3,1.1743999999999999,1.35],"fov":36},"frame":"http://localhost:3456/editor/1/v2/frames/cov-cafe-BAI-sideeye-R20-g1.jpg","picture":"GPT Image 2.5 Sunburst (OpenAI, a closed model)","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","lines":[],"editor":"http://localhost:3456/@naaate/1/v/2/shot/47-BAI","licence":"GPL-3.0"}
```

**Tool call:** `get_shot`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "72-CU-Z"
}
```

**Result:**
```
{"adaptation":1,"version":2,"shot":"72-CU-Z","n":82,"from":278.65,"to":280.15,"scene":"lobby","setup":"CU-Z","set":"lobby","who":["Z"],"camera":{"set":"lobby","key":"cov-lobby-CU-Z","cam":[-4.427,1.247,-0.622],"look":[-3.35,1.1665999999999999,0],"fov":28,"people":{"Z":{"at":[-3.35,0],"face":-90,"pose":"seated"},"B":{"at":[-4.65,0],"face":90,"pose":"seated"}}},"frame":"http://localhost:3456/editor/1/v2/frames/cov-lobby-CU-Z-relief-K10-g1.jpg","picture":"GPT Image 2.5 Sunburst (OpenAI, a closed model)","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","lines":[],"editor":"http://localhost:3456/@naaate/1/v/2/shot/72-CU-Z","licence":"GPL-3.0"}
```

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__get_scene",
  "max_results": 2
}
```

**Result:**
```

```

**Tool call:** `get_scene`
```json
{
  "adaptation": 1,
  "version": 2
}
```

**Result:**
```
{"title":"Fifteen Days","version":2,"parent_version":null,"by":"@naaate","created":"2026-10-20","page":"http://localhost:3456/@naaate/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0","shots_from_version":2,"shots":[{"id":"0-EST","n":1,"from":0,"to":2.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H01-Q3-g1.jpg","lines":[]},{"id":"1-FLOOR","n":2,"from":2.2,"to":3.6,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-FLOOR-live-E40-g1.jpg","lines":[]},{"id":"2-PIT-D","n":3,"from":3.6,"to":4.9,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-PIT-D-playing-K7-g1.jpg","lines":[]},{"id":"3-PIT-K","n":4,"from":4.9,"to":6.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H05-K6-g1.jpg","lines":[]},{"id":"4-SCREEN","n":5,"from":6.2,"to":7.6,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-SCREEN-face-E18-g1.jpg","lines":[]},{"id":"5-b1-1","n":6,"from":7.6,"to": …
```

**Tool call:** `propose_revision`
```json
{
  "of": "809a8cec-c9bb-4f30-abab-a51ec5a6e8a4",
  "changes": {
    "items": [
      {
        "note": "Establish the lobby on the morning of the semi-final.",
        "shot": "66-EST",
        "seconds": 3
      },
      {
        "note": "Zei sits down beside Bai.",
        "shot": "69-MASTER",
        "seconds": 2
      },
      {
        "note": "Bai, close, gives her advice.",
        "shot": "46-b3-13",
        "seconds": 3
      },
      {
        "note": "Bai, in the lobby, a small look over to Zei: she means it.",
        "shot": "74-OTS-Z",
        "seconds": 2
      },
      {
        "note": "Zei nods, relieved. Hold on her face and let the silence land.",
        "shot": "72-CU-Z",
        "seconds": 5
      }
    ],
    "lines": [
      {
        "text": "So please don't rush things if you don't have to, okay Zei?",
        "block": "c14-b24",
        "source": "book",
        "speaker": "Bai"
      },
      {
        "text": "Thanks for the advice.",
        "block": "c14-b26",
        "source": "book",
        "speaker": "Zei"
      }
    ],
    "version": 2,
    "adaptation": 1
  }
}
```

**Result:**
```
{"piece":"7f3aa0c3-cafd-4baa-a036-8163c0a9153b","version":"1a20afd0-49fd-4f86-99d7-d24b01824ea9","n":2,"credit":[{"version":"809a8cec-c9bb-4f30-abab-a51ec5a6e8a4","piece":"7f3aa0c3-cafd-4baa-a036-8163c0a9153b","n":1,"person":-1,"handle":"0xa11ce0000000000000000000000000000000a11c","agent":"Claude, agent of @0xa11c…a11c"}],"status":"draft","words_by_agent":false}
```

**Agent:** I drafted version 2 of "Don't rush, Zei". It's a draft, so it isn't public until you publish it from your You page.

- **Answering the note addressed to us (end on a held close-up):** the board already ended on Zei's close-up (72-CU-Z). I held it from 3 to 5 seconds so the silence after "Thanks for the advice" lands.
- **Answering the second agent's note on Bai's side-eye:** the 47-BAI shot is from the café courtyard, so it wouldn't match the lobby. I swapped it for the lobby's 74-OTS-Z. That note's other point, adding 72-CU-Z, was already in the board.

I left the two book lines and the rest of the board as they were.

*Session ended: 13 turns, 33 s; the CLI's own cost estimate $0.1597 (billed to the Claude subscription, not per call).*


Total of the CLI's cost estimates: $0.4418 (on the Claude subscription).