# Editing your own scene through your agent (local demo, 2026-10-21T05:22 UTC)

Person A is a wallet account on a local copy of the site (PGlite, `next start`, AGENTS_TEST=1), the author of Fifteen Days version 2 here. The agent is a fresh headless Claude Code session (model: sonnet), limited to this site's MCP tools and connected with the token A granted on the consent page. A's chat message is a model-drafted stand-in for the owner's words. The frame comes from Remix's pipeline with its labelled stand-in model (REMIX_TEST_FAKES), and the video from a stand-in for fal; no paid model was called. Nothing here touched production.

## Steps


**1. The person connects their agent (the consent page, then Allow)**

- screenshot 01-connect-claude.png
- Claude: connected (access token for 3600 s, refresh token issued)

**2. The person asks, in one chat message; a fresh agent session does the work**

- agent-edits: 42 events
- screenshot 02-edits-waiting.png
- waiting: Shot 6: a video test; Shot 6: who's speaking; Shot 7: new timing; Shot 6: another take of b1-1; Shot 6: a new frame
- gaps: asked ""make Zei's coat blue in every hotel shot""; missing: No tool edits a costume across a set of shots. try_frame redraws one shot at a time from a note, and draft_character_version changes Zei's look everywhere, not just in hotel shots. Nothing selects shots by place (hotel/lobby) or applies one change to all of them.

**3. The person approves the new frame (cost shown), then keeps it**

- screenshot 03-frame-made.png

**4. The video test: approve, then keep**

- screenshot 04-video-test-made.png

**5. The free edits (take, timing, who speaks): one Keep each**


**6. What the agent couldn’t do, on /you**

- screenshot 05-gaps-on-you.png
- kept: Shot 6: a video test ($0.025); Shot 6: who's speaking; Shot 7: new timing; Shot 6: another take of b1-1; Shot 6: a new frame ($0)
- still waiting: 0

**Taps, by phase (the chat message is the creative act and isn’t counted, only sending it):**

- connect (once): 1 (Allow)
- ask: 1 (send the message in Claude)
- review on /you: 1 (open the You page)
- frame: approve and keep: 2 (Make it (cost shown) · Keep)
- video test: approve and keep: 2 (Run the test (cost shown) · Keep)
- free edits: keep each: 3 (Keep · Keep · Keep)

## agent-edits

Prompt (model-drafted test prompt):

> You are connected to snowmoon.party as an agent for your person, through its connector. Call whoami first. Your person just said to you in chat (their words, a test stand-in): "In my version of Fifteen Days (version 2), on the first shot that has a spoken line: 1) try a new frame, my note: "warmer morning light, steam rising from his cup". 2) Use a different take of that line. 3) Make the shot after it 4 seconds long. 4) It's Bai speaking in that first shot, mark it. 5) Ask for a video test of that first shot: "steam rises, the camera holds". 6) And make Zei's coat blue in every hotel shot." Do each thing you can as a draft, using the tools. For anything the tools can't do, call log_gap with what they asked and what was missing. Finish by telling your person in two or three sentences what's waiting for them and what you couldn't do.

**Tool call:** `ToolSearch`
```json
{
  "query": "select:mcp__snowmoon__whoami,mcp__snowmoon__list_my_work,mcp__snowmoon__list_scenes,mcp__snowmoon__get_piece,mcp__snowmoon__get_scene,mcp__snowmoon__get_shot,mcp__snowmoon__list_takes,mcp__snowmoon__try_frame,mcp__snowmoon__swap_take,mcp__snowmoon__change_timing,mcp__snowmoon__mark_speaking,mcp__snowmoon__request_video_test,mcp__snowmoon__log_gap,mcp__snowmoon__draft_character_version",
  "max_results": 20
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
{"you":"Claude, agent of @0xa11c…a11c","person":"@0xa11c…a11c","scopes":["read","drafts","images","notes"],"limits_per_day":{"drafts":50,"notes":20,"images":50,"imagesPerMinute":5,"readsPerMinute":60},"story_words":"never yours: place your person's own words (exactly as they said them) or the book's; if a line is missing, leave it out and ask","how_to_work":"Call read_requests: your person's ideas and notes are your to-do list. Answer each with a draft (answering: its id). They react with keep, try again, or say more; those come back as requests. To edit their own scene, use list_takes, try_frame, swap_take, change_timing, mark_speaking or request_video_test; anything with a cost waits for their approval. If no tool can do what they asked, call log_gap.","bringing_in_images":"open","rule":"You draft; your person publishes. Nothing you make is public until they do."}
```

**Tool call:** `list_my_work`
```json
{
  "status": "draft"
}
```

**Result:**
```
{"items":[]}
```

**Tool call:** `list_scenes`
```json
{}
```

**Result:**
```
{"note":"An independent adaptation, not affiliated with the author.","scenes":[{"adaptation":1,"title":"Fifteen Days","versions":[{"version":2,"parent_version":null,"by":"@0xa11ce0000000000000000000000000000000a11c","created":"2026-10-21","page":"http://localhost:3456/@0xa11ce0000000000000000000000000000000a11c/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0"},{"version":1,"parent_version":null,"by":"@naaate","created":"2026-10-21","page":"http://localhost:3456/@naaate/1/v/1","video":"https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg","ai_label":"Pictures: AI-generated, not by the author · Voices: @naaate's performances, AI-converted.","closed_model":null,"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0"}]}]}
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
{"title":"Fifteen Days","version":2,"parent_version":null,"by":"@0xa11ce0000000000000000000000000000000a11c","created":"2026-10-21","page":"http://localhost:3456/@0xa11ce0000000000000000000000000000000a11c/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0","shots_from_version":2,"shots":[{"id":"0-EST","n":1,"from":0,"to":2.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H01-Q3-g1.jpg","lines":[]},{"id":"1-FLOOR","n":2,"from":2.2,"to":3.6,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-FLOOR-live-E40-g1.jpg","lines":[]},{"id":"2-PIT-D","n":3,"from":3.6,"to":4.9,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-PIT-D-playing-K7-g1.jpg","lines":[]},{"id":"3-PIT-K","n":4,"from":4.9,"to":6.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H05-K6-g1.jpg","lines":[]},{"id":"4-SCREEN","n":5,"from":6.2,"to":7.6,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-S …
```

**Tool call:** `list_takes`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "5-b1-1"
}
```

**Result:**
```
{"shot":"5-b1-1","lines":[{"cue":"b1-1","speaker":"Zei","text":"You'd think after making it this far, they'd stop underestimating the foreigner.","in_use":"zei-v4b","takes":["zei-v4b","zei","zei-v3"]},{"cue":"b1-2","speaker":"Bai","text":"It wouldn't be so annoying if he wasn't so damn pretty.","in_use":"bai-v3b","takes":["bai-v3b","bai","bai-lines-v2"]}]}
```

**Tool call:** `try_frame`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "5-b1-1",
  "note": "warmer morning light, steam rising from his cup"
}
```

**Result:**
```
{"piece":"d1abf42e-2054-4f5a-b8d5-6cd8c3fe0573","version":"086588f0-8211-4942-9054-205431f09842","stamp":{"made_by":"Claude, agent of @0xa11c…a11c","idea":{"agent":"Claude, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"frame","note":"warmer morning light, steam rising from his cup","estimate_usd":0.05},"next":"Waiting for your person to approve about $0.05 on their You page; nothing is spent before."}
```

**Tool call:** `swap_take`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "5-b1-1",
  "cue": "b1-1",
  "take": "zei"
}
```

**Result:**
```
{"piece":"a09b4427-0b84-4812-884a-e4e833fe022e","version":"a701993b-feb0-4219-b41e-8feeb944db5f","stamp":{"made_by":"Claude, agent of @0xa11c…a11c","idea":{"agent":"Claude, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"take","cue":"b1-1","line":"You'd think after making it this far, they'd stop underestimating the foreigner.","from":"zei-v4b","to":"zei"},"next":"Waiting for your person to keep it."}
```

**Tool call:** `change_timing`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "6-b1-2",
  "seconds": 4
}
```

**Result:**
```
{"piece":"01dce05e-c9b3-4f9e-9654-7826624e5fc0","version":"043cc33e-cd12-4685-a376-82b22937b54a","stamp":{"made_by":"Claude, agent of @0xa11c…a11c","idea":{"agent":"Claude, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"timing","from_s":12.44,"to_s":16.44,"was":{"from_s":12.44,"to_s":15.83}},"next":"Waiting for your person to keep it."}
```

**Tool call:** `mark_speaking`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "5-b1-1",
  "who": [
    "Bai"
  ]
}
```

**Result:**
```
{"piece":"74f35664-6f46-429c-976b-172ec2f12a8f","version":"2a21ef68-aef7-4e3f-a5d2-e391c04107bd","stamp":{"made_by":"Claude, agent of @0xa11c…a11c","idea":{"agent":"Claude, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"speaking","who":["Bai"],"was":["Z","B"]},"next":"Waiting for your person to keep it."}
```

**Tool call:** `request_video_test`
```json
{
  "adaptation": 1,
  "version": 2,
  "shot": "5-b1-1",
  "note": "steam rises, the camera holds"
}
```

**Result:**
```
{"piece":"5a2d3df6-a214-41e0-9024-058f7c88480c","version":"eb7ace9f-eece-4bfc-b3e1-54522fd00704","stamp":{"made_by":"Claude, agent of @0xa11c…a11c","idea":{"agent":"Claude, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"video","note":"steam rises, the camera holds","model":"fal-ai/longcat-video/distilled/image-to-video/480p","seconds":5,"estimate_usd":0.025},"next":"Waiting for your person to approve about $0.025 on their You page; nothing is spent before."}
```

**Tool call:** `log_gap`
```json
{
  "asked": "\"make Zei's coat blue in every hotel shot\"",
  "missing": "No tool edits a costume across a set of shots. try_frame redraws one shot at a time from a note, and draft_character_version changes Zei's look everywhere, not just in hotel shots. Nothing selects shots by place (hotel/lobby) or applies one change to all of them."
}
```

**Result:**
```
{"gap":"f95ee339-1c62-4292-a65a-ca27db391bc0","shown":"on your person's You page, under \"What your agent couldn't do\""}
```

**Agent:** Five of the six are drafted on your You page, all on shot 6 (the first with a spoken line, Zei's "You'd think after making it this far…") and the shot after it. The frame costs about $0.05 and the video test about $0.025, and nothing is spent until you approve each one.

- **New frame:** "warmer morning light, steam rising from his cup".
- **Different take:** Zei's line now uses the `zei` take instead of `zei-v4b`. The shot has two lines, so I took "that line" to mean the first, Zei's. Tell me if you meant Bai's.
- **Timing:** the next shot (7) runs 4 seconds, up from about 3.4.
- **Speaking:** the shot now marks only Bai as speaking. It was Zei and Bai before, and Zei still has the first line there, so this may not be what you wanted.
- **Video test:** "steam rises, the camera holds".

I couldn't make Zei's coat blue in every hotel shot. No tool applies one change across shots chosen by place, so I logged it as a gap on your You page.

*Session ended: 13 turns, 26 s; the CLI's own cost estimate $0.1040 (billed to the Claude subscription, not per call).*


Total of the CLI's cost estimates: $0.1040 (on the Claude subscription).