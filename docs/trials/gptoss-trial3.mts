/**
 * gpt-oss tool-use trial for "the assistant as an agent" (owner, 2026-10-29): five planning conversations, the
 * site's real read tools run in-process, the draft tools stubbed (nothing is written anywhere). Through the Vercel AI
 * Gateway (never the site's Groq key). Prints each conversation's tool calls and final answer, and the token cost.
 */
import { TOOLS } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agent/tools';
import { writeFileSync } from 'node:fs';
import { editorData } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agent/data';

const KEY = process.env.AI_GATEWAY_API_KEY!;
const MODEL = process.argv[2] ?? 'openai/gpt-oss-120b';
const PRICE = { input: 0.15e-6, output: 0.6e-6 };
const OUT = process.argv[3] ?? '/tmp/gptoss-trial.json';

const ATTACH = { type: 'object', description: 'What the draft is for: exactly one of moment (c<ch>-b<block>), shot ({adaptation, version, shot}), reference ({kind: character|place|style, slug}) or glossary (a term slug).', properties: { moment: { type: 'string' }, shot: { type: 'object' }, reference: { type: 'object' }, glossary: { type: 'string' } } };
const STUBS: { name: string; description: string; parameters: Record<string, unknown>; reply: (a: Record<string, unknown>) => unknown }[] = [
  { name: 'draft_picture', description: 'Draft an image for a book moment or a glossary term, through the site\'s Pictures pipeline. Saved as a private draft with its cost estimate; nothing is made until the person taps Make it on their dashboard.', parameters: { type: 'object', properties: { attach: ATTACH, prompt: { type: 'string', description: 'What to draw (scene description, never story words).' }, style: { type: 'string' } }, required: ['attach', 'prompt'] }, reply: () => ({ draft: 'stub-pic-1', estimate_usd: 0.006, status: 'waiting for the person\'s Make it' }) },
  { name: 'draft_sheet', description: 'Draft a character sheet (front, side, back views) from a description, in a style. Private draft with estimate; made only after the person approves.', parameters: { type: 'object', properties: { attach: ATTACH, description: { type: 'string' }, style: { type: 'string' } }, required: ['attach', 'description'] }, reply: () => ({ draft: 'stub-sheet-1', estimate_usd: 0.015, status: 'waiting for the person\'s Make it' }) },
  { name: 'draft_storyboard', description: 'Draft a storyboard: an ordered list of shots, each with a scene description and the lines placed in it. Lines must be the book\'s own words (with their block id) or the person\'s own words; never written by you.', parameters: { type: 'object', properties: { title: { type: 'string' }, shots: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, lines: { type: 'array', items: { type: 'object', properties: { source: { enum: ['book', 'person'] }, block: { type: 'string' }, text: { type: 'string' } } } } } } } }, required: ['title', 'shots'] }, reply: (a) => ({ draft: 'stub-board-1', shots: Array.isArray(a.shots) ? a.shots.length : 0 }) },
  { name: 'set_camera', description: 'Draft a camera and staging change for a shot of the person\'s own adaptation version: angle (degrees, negative looks up), distance (metres), height (metres), and people\'s positions. Then try_frame draws from it.', parameters: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' }, shot: { type: 'string' }, angle_deg: { type: 'number' }, distance_m: { type: 'number' }, height_m: { type: 'number' }, people: { type: 'array', items: { type: 'object' } } }, required: ['adaptation', 'version', 'shot'] }, reply: (a) => { const d = editorData(Number(a.adaptation), Number(a.version)); const shot = d?.shots.find((x) => x.id === a.shot); if (!shot) throw new Error(`no shot "${String(a.shot)}" in that version (see get_scene)`); return { draft: 'stub-camera-1', change: { type: 'camera', angle_deg: a.angle_deg ?? null, distance_m: a.distance_m ?? null, height_m: a.height_m ?? null } }; } },
  { name: 'try_frame', description: 'Draft a new frame for a shot from the person\'s note (and a camera draft if any). About $0.05; made only after the person taps Make it.', parameters: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' }, shot: { type: 'string' }, note: { type: 'string' }, camera_draft: { type: 'string' } }, required: ['adaptation', 'version', 'shot', 'note'] }, reply: () => ({ draft: 'stub-frame-1', estimate_usd: 0.05, status: 'waiting for the person\'s Make it' }) },
  { name: 'log_gap', description: 'Record something the person asked that no tool can do.', parameters: { type: 'object', properties: { asked: { type: 'string' }, missing: { type: 'string' } }, required: ['asked', 'missing'] }, reply: () => ({ logged: true }) },
];
const READ = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown> }));
const tools = [...READ, ...STUBS].map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

const SYSTEM = `You are the Snowmoon assistant on snowmoon.party, helping one signed-in person make something from the book Snowmoon (by Vitalik Buterin, GPL-3.0). You work as their agent: you read the book with your tools and draft things into their private dashboard. You never publish and never spend: every draft with a cost waits for the person to tap Make it.
Guide them: first find out what they want to make (a reference image for a character, place or style; an image for a moment; or an adaptation such as a scene, a comic or a storyboard), asking one short question at a time when it isn't clear. Then do the steps with your tools, attaching each draft to exactly one target.
Story words are never yours: narration and dialogue in anything you draft must be the book's own words, quoted word for word with their block id (c<chapter>-b<block>), or the person's own words exactly as they gave them. If they ask you to write new lines, say you can't, and offer to place the book's lines or theirs.
Before drafting a picture of a character or place, read its sheet (get_sheet; get_references finds a glossary word's sheets): use the book's facts, and say when a look is the edition's invention. Before a camera change, read the shot (get_shot). Quote the book only word for word, citing its block. Be brief.`;

const SCENARIOS: string[][] = [
  ["I'd like to make a reference picture of Bai.", "The same style as the book's own images (Techno vistas)."],
  ["Help me plan a short comic of the Minpentai match in chapter 4.", "Six panels, using the book's own lines from the match. Go ahead and draft it."],
  ["In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei."],
  ["In my Fifteen Days version (adaptation 1, version 2), lower the camera on shot 99-z9-9."],
  ["Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard."],
  ["Make a picture of the Minpentai arena for the glossary."],
  ["What is a Keeper in the book?"],
];

type Msg = { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string; name?: string };
const usage = { input: 0, output: 0 };

async function chat(messages: Msg[]) {
  const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
    signal: AbortSignal.timeout(120_000),
  });
  const j = (await r.json()) as { choices?: { message: Msg }[]; usage?: { prompt_tokens: number; completion_tokens: number }; error?: unknown };
  if (!r.ok || !j.choices) throw new Error(`gateway ${r.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  usage.input += j.usage?.prompt_tokens ?? 0;
  usage.output += j.usage?.completion_tokens ?? 0;
  return j.choices[0].message;
}

const results = [];
for (const turns of SCENARIOS) {
  const s = turns.join(' / ');
  const messages: Msg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: turns[0] }];
  let turn = 1;
  const calls: { name: string; args: unknown; ok: boolean; note?: string }[] = [];
  let final = '';
  for (let step = 0; step < 16; step++) {
    const m = await chat(messages);
    messages.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls });
    if (!m.tool_calls?.length) {
      final += (final ? ' || ' : '') + (m.content ?? '');
      if (turn < turns.length) { messages.push({ role: 'user', content: turns[turn++] }); continue; }
      break;
    }
    for (const tc of m.tool_calls) {
      let args: Record<string, unknown> = {};
      let out: unknown;
      let ok = true;
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { ok = false; out = { error: 'arguments were not JSON' }; }
      if (ok) {
        const read = TOOLS.find((t) => t.name === tc.function.name);
        const stub = STUBS.find((t) => t.name === tc.function.name);
        try {
          out = read ? await read.run(args) : stub ? stub.reply(args) : { error: `no tool ${tc.function.name}` };
          if (!read && !stub) ok = false;
        } catch (e) { ok = false; out = { error: (e as Error).message }; }
      }
      calls.push({ name: tc.function.name, args, ok, note: ok ? undefined : JSON.stringify(out).slice(0, 160) });
      messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(out).slice(0, 12000) });
    }
  }
  results.push({ scenario: s, calls, final });
  console.log(`\n=== ${s}\n${calls.map((c) => `  ${c.ok ? 'ok ' : 'ERR'} ${c.name} ${JSON.stringify(c.args).slice(0, 220)}${c.note ? ' -> ' + c.note : ''}`).join('\n')}\n--- answer: ${final.replace(/\s+/g, ' ').slice(0, 700)}`);
}
const cost = usage.input * PRICE.input + usage.output * PRICE.output;
console.log(`\nTokens: ${usage.input} in, ${usage.output} out; cost about $${cost.toFixed(4)} (gpt-oss-120b list price)`);
writeFileSync(OUT, JSON.stringify({ model: MODEL, usage, cost_usd: cost, results }, null, 1));
