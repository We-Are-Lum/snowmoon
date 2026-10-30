const KEY = process.env.AI_GATEWAY_API_KEY!;
const TOOL = { type: 'function', function: { name: 'route', description: 'Classify the message.', parameters: { type: 'object', properties: { kind: { enum: ['question about the book', 'make something'] } }, required: ['kind'], additionalProperties: false } } };
const SYS = 'Classify the person\'s message. "question about the book": they ask what something in the book means, who someone is, what happens, or anything they want explained or answered. "make something": they ask you to create, draft, draw, change or plan a picture, sheet, place, style, storyboard, comic, video, song or a change to a shot.';
const MSGS = ["I'd like to make a reference picture of Bai.", "Help me plan a short comic of the Minpentai match in chapter 4.", "In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei.", "Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard.", "What is a Keeper in the book?", "Who is Bai?", "Why does Zei freeze when the teams are announced?", "Turn chapter 2 into a song with music I can listen to.", "Techno vistas.", "What happens at the end of chapter 4?"];
let cost = 0;
for (const m of MSGS) {
  const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'system', content: SYS }, { role: 'user', content: m }], tools: [TOOL], tool_choice: { type: 'function', function: { name: 'route' } }, temperature: 0, max_tokens: 300, providerOptions: { gateway: { zeroDataRetention: true } } }) });
  const j = (await r.json()) as any;
  cost += j.usage?.cost ?? 0;
  console.log(JSON.parse(j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? '{}').kind, '|', m.slice(0, 60), '| zdr', j.choices?.[0]?.message?.provider_metadata?.gateway?.enabledZeroDataRetention);
}
console.log('cost', cost.toFixed(5));
