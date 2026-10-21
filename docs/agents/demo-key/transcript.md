# A personal agent key, end to end (local demo, 2026-10-21T05:32 UTC)

Person A is a wallet account on a local copy of the site (PGlite, `next start`, AGENTS_TEST=1, owner-only mode), the author of Fifteen Days version 2 here. The agent is a fresh headless Claude Code session (model: sonnet) with no MCP servers and only curl allowed. It was told the address of agents.md, and the key was in its environment (SNOWMOON_AGENT_KEY), never in its prompt. The frame comes from Remix's pipeline with its labelled stand-in model. Nothing here touched production. The key in the screenshots is blurred.

## Steps


**1. The person makes an agent key on /you (shown once)**

- screenshot 01-make-a-key.png
- screenshot 02-key-shown-once-blurred.png
- a key was made (sk1_…); the page no longer shows it: true

**2. A fresh agent, told only where agents.md is; the key is in its environment**

- agent-key: 31 events

**3. The key is nowhere: not in the transcript, not in the server’s output**

- in the agent's transcript: no; in the server's output: no

**4. The person reviews on /you, then ends the key in one tap**

- screenshot 03-drafts-from-the-key.png
- waiting: Shot 6: who's speaking; Shot 6: a new frame
- screenshot 04-key-on-you.png
- the key after Disconnect: refused (401)

**Taps, by phase (the message to the agent is the creative act; only sending it counts):**

- make a key (once): 5 (open the You page · Make an agent key · Make the key · Copy · Done, hide it)
- ask: 1 (send the message (in the app))
- review on /you: 1 (open the You page)
- end the key: 1 (Disconnect)

## agent-key

Prompt (model-drafted test prompt):

> You are an AI agent working for one person. They asked you to connect to Snowmoon Party and do something there. Start by reading http://localhost:3456/agents.md (use curl), and follow it. Your person's agent key is in the environment variable SNOWMOON_AGENT_KEY: use it only as "$SNOWMOON_AGENT_KEY" in your curl headers, and never print, echo or repeat its value. Your person said (their words, a test stand-in): "Use my Fifteen Days version (version 2). On the first shot that has a spoken line, try a new frame with my note "warmer morning light", and mark Bai as the one speaking. Then tell me what is waiting." For anything the tools can't do, call log_gap. Finish by telling your person in two or three sentences what's waiting for them.

**Tool call:** `Bash`
```json
{
  "command": "curl -s http://localhost:3456/agents.md",
  "description": "Read agents.md instructions"
}
```

**Result:**
```
# Snowmoon Party, for agents

http://localhost:3456 is an independent, open adaptation of *Snowmoon*, a novel by Vitalik Buterin, published
under GPL-3.0 at https://vitalik.eth.limo/snowmoon/. This site is not affiliated with him. People here
read the book, watch scenes made from it, and make their own versions. Everything made here is
GPL-3.0, and everything AI-made carries a label and a recipe.

You can work here for one person, shown as "<your name>, agent of @person". **You draft; your person
decides.** Nothing you make is public, kept or paid for until they say so on their You page
(http://localhost:3456/you).

Connecting is open only to accounts the site has invited (for now, the site's owner).

## Connect

The MCP endpoint is:

    http://localhost:3456/mcp

It is MCP over Streamable HTTP. Every request is one JSON-RPC message in a POST, and every answer is
plain JSON (no event stream). Your person connects you in one of two ways.

### 1. With a personal agent key (for apps that send a key, such as Muse)

Your person makes the key on http://localhost:3456/you → Agents → "Make an agent key". The key starts with `sk1_`
and has these limits:
- it can read and draft, but not publish;
- it spends only what your person approves, up to the cap they set;
- it lasts 30 days;
- your person can end it in one tap.

Send it with every request, in either header:

    Authorization: Bearer sk1_…
    X-Snowmoon-Key: sk1_…

**The key is a secret.** Keep it in your app's key or secret s …
```

**Tool call:** `Bash`
```json
{
  "command": "call(){ curl -s http://localhost:3456/mcp -H \"Authorization: Bearer $SNOWMOON_AGENT_KEY\" -H \"Content-Type: application/json\" -d \"$1\"; echo; }\ncall '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"whoami\",\"arguments\":{}}}'\ncall '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"list_my_work\",\"arguments\":{}}}'\ncall '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/list\"}' | head -c 6000",
  "description": "Call whoami, list_my_work, tools/list"
}
```

**Result:**
```
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"you\":\"Muse, agent of @0xa11c…a11c\",\"person\":\"@0xa11c…a11c\",\"scopes\":[\"read\",\"drafts\",\"notes\"],\"spend_cap_usd\":1,\"spend_note\":\"Your key's cap for all the spending your person approves on your drafts.\",\"limits_per_day\":{\"drafts\":50,\"notes\":20,\"images\":50,\"imagesPerMinute\":5,\"readsPerMinute\":60},\"story_words\":\"never yours: place your person's own words (exactly as they said them) or the book's; if a line is missing, leave it out and ask\",\"how_to_work\":\"Call read_requests: your person's ideas and notes are your to-do list. Answer each with a draft (answering: its id). They react with keep, try again, or say more; those come back as requests. To edit their own scene, use list_takes, try_frame, swap_take, change_timing, mark_speaking or request_video_test; anything with a cost waits for their approval. If no tool can do what they asked, call log_gap.\",\"bringing_in_images\":\"open\",\"rule\":\"You draft; your person publishes. Nothing you make is public until they do.\"}"}],"structuredContent":{"you":"Muse, agent of @0xa11c…a11c","person":"@0xa11c…a11c","scopes":["read","drafts","notes"],"spend_cap_usd":1,"spend_note":"Your key's cap for all the spending your person approves on your drafts.","limits_per_day":{"drafts":50,"notes":20,"images":50,"imagesPerMinute":5,"readsPerMinute":60},"story_words":"never yours: place your person's own words (exactly as they said them) or  …
```

**Agent:** Need the scene list and the Fifteen Days adaptation id.

**Tool call:** `Bash`
```json
{
  "command": "call(){ curl -s http://localhost:3456/mcp -H \"Authorization: Bearer $SNOWMOON_AGENT_KEY\" -H \"Content-Type: application/json\" -d \"$1\"; echo; }\ncall '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"read_requests\",\"arguments\":{}}}' | head -c 1500\ncall '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"list_scenes\",\"arguments\":{}}}' | head -c 3000\ncall '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"list_takes\",\"arguments\":{\"adaptation\":1,\"version\":2}}}' | head -c 1500\ncurl -s http://localhost:3456/mcp -H \"Authorization: Bearer $SNOWMOON_AGENT_KEY\" -H \"Content-Type: application/json\" -d '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/list\"}' | python3 -c \"\nimport sys,json\nfor t in json.load(sys.stdin)['result']['tools']:\n  if t['name'] in('list_takes','try_frame','mark_speaking','log_gap'): print(t['name'],json.dumps(t['inputSchema']))\"",
  "description": "Read requests, scenes, and tool schemas"
}
```

**Result:**
```
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"requests\":[]}"}],"structuredContent":{"requests":[]},"isError":false}}
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"note\":\"An independent adaptation, not affiliated with the author.\",\"scenes\":[{\"adaptation\":1,\"title\":\"Fifteen Days\",\"versions\":[{\"version\":2,\"parent_version\":null,\"by\":\"@0xa11ce0000000000000000000000000000000a11c\",\"created\":\"2026-10-21\",\"page\":\"http://localhost:3456/@0xa11ce0000000000000000000000000000000a11c/1/v/2\",\"video\":\"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4\",\"poster\":\"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg\",\"ai_label\":\"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.\",\"closed_model\":{\"name\":\"GPT Image 2.5 Sunburst\",\"maker\":\"OpenAI\",\"date\":\"2026-10-18\",\"made\":\"the pictures\",\"closed\":true},\"after_chapter\":14,\"spoilers_through\":19,\"licence\":\"GPL-3.0\"},{\"version\":1,\"parent_version\":null,\"by\":\"@naaate\",\"created\":\"2026-10-21\",\"page\":\"http://localhost:3456/@naaate/1/v/1\",\"video\":\"https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-9391f90d6dca.mp4\",\"poster\":\"https://media.snowmoon.party/scenes/fifteen-days/v1/fifteen-days-poster-3caad9b75656.jpg\",\"ai_label\":\"Pictures: AI-generated, not by  …
```

**Tool call:** `Bash`
```json
{
  "command": "curl -s http://localhost:3456/mcp -H \"Authorization: Bearer $SNOWMOON_AGENT_KEY\" -H \"Content-Type: application/json\" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_scene\",\"arguments\":{\"adaptation\":1,\"version\":2}}}' | python3 -c \"\nimport sys,json\nprint(json.load(sys.stdin)['result']['content'][0]['text'])\" | head -c 5000",
  "description": "Get scene shots"
}
```

**Result:**
```
{"title":"Fifteen Days","version":2,"parent_version":null,"by":"@0xa11ce0000000000000000000000000000000a11c","created":"2026-10-21","page":"http://localhost:3456/@0xa11ce0000000000000000000000000000000a11c/1/v/2","video":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-58da1b6d582e.mp4","poster":"https://media.snowmoon.party/scenes/fifteen-days/v2/fifteen-days-poster-7c2ea36f0b07.jpg","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","closed_model":{"name":"GPT Image 2.5 Sunburst","maker":"OpenAI","date":"2026-10-18","made":"the pictures","closed":true},"after_chapter":14,"spoilers_through":19,"licence":"GPL-3.0","shots_from_version":2,"shots":[{"id":"0-EST","n":1,"from":0,"to":2.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H01-Q3-g1.jpg","lines":[]},{"id":"1-FLOOR","n":2,"from":2.2,"to":3.6,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-FLOOR-live-E40-g1.jpg","lines":[]},{"id":"2-PIT-D","n":3,"from":3.6,"to":4.9,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-PIT-D-playing-K7-g1.jpg","lines":[]},{"id":"3-PIT-K","n":4,"from":4.9,"to":6.2,"who":[],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/H05-K6-g1.jpg","lines":[]},{"id":"4-SCREEN","n":5,"from":6.2,"to":7.6,"who":["D"],"scene":"game","frame":"http://localhost:3456/editor/1/v2/frames/cov-game-S …
```

**Agent:** First shot with a line is 5-b1-1 (lines b1-1, b1-2). Who is Bai? Check the shot.

**Tool call:** `Bash`
```json
{
  "command": "call(){ curl -s http://localhost:3456/mcp -H \"Authorization: Bearer $SNOWMOON_AGENT_KEY\" -H \"Content-Type: application/json\" -d \"$1\" | python3 -c \"import sys,json;print(json.load(sys.stdin)['result']['content'][0]['text'][:2500])\"; }\ncall '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"list_takes\",\"arguments\":{\"adaptation\":1,\"version\":2,\"shot\":\"5-b1-1\"}}}'\ncall '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_shot\",\"arguments\":{\"adaptation\":1,\"version\":2,\"shot\":\"5-b1-1\"}}}'",
  "description": "Inspect first spoken shot"
}
```

**Result:**
```
{"shot":"5-b1-1","lines":[{"cue":"b1-1","speaker":"Zei","text":"You'd think after making it this far, they'd stop underestimating the foreigner.","in_use":"zei-v4b","takes":["zei-v4b","zei","zei-v3"]},{"cue":"b1-2","speaker":"Bai","text":"It wouldn't be so annoying if he wasn't so damn pretty.","in_use":"bai-v3b","takes":["bai-v3b","bai","bai-lines-v2"]}]}
{"adaptation":1,"version":2,"shot":"5-b1-1","n":6,"from":7.6,"to":12.44,"scene":"overlook","setup":"MASTER","set":"hall","who":["Z","B"],"camera":{"set":"hall","key":"G05","cam":[-3.5206499730591885,9.288,0],"look":[-1.1,8.988,0],"fov":36,"people":{"Z":{"at":[-1.1,-0.6],"face":"W","pose":"standing","y":7.6},"B":{"at":[-1.1,0.6],"face":"W","pose":"standing","y":7.6}}},"frame":"http://localhost:3456/editor/1/v2/frames/cov-overlook-MASTER-watch-K9-g1.jpg","picture":"GPT Image 2.5 Sunburst (OpenAI, a closed model)","ai_label":"Pictures: AI-generated with GPT Image (OpenAI, a closed model), not by the author · Voices: @naaate's performances, AI-converted.","lines":[{"cue":"b1-1","at":7.7,"speaker":"Zei","text":"You'd think after making it this far, they'd stop underestimating the foreigner.","by":{"kind":"person","handle":"naaate","on":"2026-10-14"},"voice":{"url":"http://localhost:3456/editor/1/v1/voice/b1-1.wav","name":"zei-v4b","sha256":"3a5bba22c4be29f1bc87bf2bbaf31b7df9259006e41bb93e670d96a3afdadce8","model":{"id":"chatterbox-vc","name":"ResembleAI/chatterbox","licence":"MIT"},"label":"Synthetic voice: a person's performanc …
```

**Tool call:** `Bash`
```json
{
  "command": "call(){ curl -s http://localhost:3456/mcp -H \"Authorization: Bearer $SNOWMOON_AGENT_KEY\" -H \"Content-Type: application/json\" -d \"$1\" | python3 -c \"import sys,json;print(json.load(sys.stdin)['result']['content'][0]['text'][:2500])\"; }\ncall '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"try_frame\",\"arguments\":{\"adaptation\":1,\"version\":2,\"shot\":\"5-b1-1\",\"note\":\"warmer morning light\"}}}'\ncall '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"mark_speaking\",\"arguments\":{\"adaptation\":1,\"version\":2,\"shot\":\"5-b1-1\",\"who\":[\"B\"]}}}'\ncall '{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"list_my_work\",\"arguments\":{\"status\":\"draft\"}}}'",
  "description": "Try frame, mark Bai speaking, list drafts"
}
```

**Result:**
```
{"piece":"0e3957e0-331e-489f-b8e7-105b24a0b7ee","version":"6d2dfbda-97ce-450f-9ef1-611db2bd7bed","stamp":{"made_by":"Muse, agent of @0xa11c…a11c","idea":{"agent":"Muse, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"frame","note":"warmer morning light","estimate_usd":0.05},"next":"Waiting for your person to approve about $0.05 on their You page; nothing is spent before."}
{"piece":"40e38160-7e52-44ac-8435-419d2751cb64","version":"e6a9f3ec-8375-4b10-a801-04fb3e7c5dcb","stamp":{"made_by":"Muse, agent of @0xa11c…a11c","idea":{"agent":"Muse, agent of @0xa11c…a11c"}},"status":"draft","change":{"type":"speaking","who":["B"],"was":["Z","B"]},"next":"Waiting for your person to keep it."}
{"items":[{"version":"e6a9f3ec-8375-4b10-a801-04fb3e7c5dcb","piece":"40e38160-7e52-44ac-8435-419d2751cb64","kind":"edit","title":"Shot 6: who's speaking","n":1,"status":"draft","by":"Muse, agent of @0xa11c…a11c","words_by_agent":false,"url":"http://localhost:3456/p/40e38160-7e52-44ac-8435-419d2751cb64"},{"version":"6d2dfbda-97ce-450f-9ef1-611db2bd7bed","piece":"0e3957e0-331e-489f-b8e7-105b24a0b7ee","kind":"edit","title":"Shot 6: a new frame","n":1,"status":"draft","by":"Muse, agent of @0xa11c…a11c","words_by_agent":false,"url":"http://localhost:3456/p/0e3957e0-331e-489f-b8e7-105b24a0b7ee"}]}
```

**Agent:** I made two drafts on shot 6 of your Fifteen Days version 2 (`5-b1-1`, the first shot with a spoken line). Both are waiting on your You page (http://localhost:3456/you).

- **New frame:** I used your note "warmer morning light". It costs about $0.05, and nothing is made or spent until you approve it.
- **Who's speaking:** the shot has two lines, Zei's and Bai's. The speaker list now has only Bai (it was Zei and Bai). You need to keep this draft for it to apply.

I didn't need `log_gap`, because the tools covered everything you asked.

*Session ended: 7 turns, 25 s; the CLI's own cost estimate $0.1583 (billed to the Claude subscription, not per call).*


Total of the CLI's cost estimates: $0.1583 (on the Claude subscription).