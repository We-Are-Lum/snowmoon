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

import { AGENT_TOOLS } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agents/tools';
import { parseAttach } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agents/pictures';
import { parseMove } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agents/edits';

/**
 * Third trial (owner, 2026-10-29): the draft tools are the site's real definitions (names, descriptions, schemas) from
 * src/lib/agents/tools.ts. Their stand-ins check what the server checks without a database and save nothing: a style
 * is required and must be one offered (here only the starting style, "Techno vistas", as on a fresh site); the target
 * must exist; set_camera takes moves in words (the real parser) on a shot that exists, with people who are in it.
 */
const OFFERED = ['Techno vistas'];
const styleOk = (v: unknown) => {
  const names = OFFERED.map((x) => `"${x}"`).join(', ');
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) throw new Error(`style is required: ask your person which style they want (offered: ${names}); don't choose one for them`);
  if (!OFFERED.some((x) => x.toLowerCase() === String(v).trim().toLowerCase())) throw new Error(`no style "${String(v).slice(0, 60)}"; offered: ${names}. Ask your person which one`);
};
const attachOk = async (a: unknown) => {
  const o = (a ?? {}) as Record<string, unknown>;
  if (o.shot && typeof o.shot === 'object') {
    const s = o.shot as Record<string, unknown>;
    if (!editorData(Number(s.adaptation), Number(s.version))?.shots.some((x) => x.id === s.shot)) throw new Error(`attach.shot: no shot "${String(s.shot)}" in that version (see get_scene)`);
    return;
  }
  await parseAttach(a);
};
const shotOf = (a: Record<string, unknown>) => {
  const shot = editorData(Number(a.adaptation), Number(a.version))?.shots.find((x) => x.id === a.shot);
  if (!shot) throw new Error(`no shot "${String(a.shot)}" in that version (see get_scene)`);
  return shot;
};
let n = 0;
const draft = (kind: string, extra: Record<string, unknown> = {}) => ({ version: `stub-${kind}-${++n}`, status: 'draft', ...extra });
const RUN: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
  draft_picture: async (a) => { await attachOk(a.attach); styleOk(a.style); return draft('picture', { style: a.style, estimate_usd: 0.0065, next: 'Waiting for your person to approve up to $0.0065 on their dashboard; nothing is made or spent before.' }); },
  draft_sheet: async (a) => { styleOk(a.style); if (a.attach) await attachOk(a.attach); if (!a.from_version && !a.look) throw new Error('look is required'); return draft('sheet', { estimate_usd: 0.0065 }); },
  draft_place: async (a) => { styleOk(a.style); if (a.attach) await attachOk(a.attach); else if (!a.place) throw new Error('a new place needs attach (a moment, shot or glossary term it belongs to)'); else await parseAttach({ reference: { kind: 'place', slug: a.place } }); return draft('place', { estimate_usd: 0.0065 }); },
  draft_style: async (a) => { if (a.style !== undefined) throw new Error('a new style is its own style: give its words in text, not style'); return draft('style', { estimate_usd: 0.0065 }); },
  draft_character_version: async () => draft('character'),
  set_camera: async (a) => {
    const shot = shotOf(a);
    const words = Array.isArray(a.moves) ? a.moves : typeof a.moves === 'string' ? [a.moves] : [];
    const moves = words.map((w, i) => parseMove(w, i));
    const who = new Set(Array.isArray(shot.who) ? (shot.who as string[]) : []);
    for (const p of (Array.isArray(a.people) ? a.people : []) as { who?: string }[]) if (!p.who || !who.has(p.who)) throw new Error(`${p.who ?? 'who'} isn't in shot ${shot.id} (on screen: ${[...who].join(', ') || 'nobody'})`);
    if (!moves.length && !(Array.isArray(a.people) && a.people.length)) throw new Error('nothing to change: give moves (e.g. "tilt down 20°", "pan left 15°", "closer", "wider", "higher", "lower") or people');
    return draft('camera', { change: { type: 'camera', moves }, next: 'Waiting for your person to keep it.' });
  },
  try_frame: async (a) => { shotOf(a); return draft('frame', { estimate_usd: 0.05, next: 'Waiting for your person to approve about $0.05 on their You page; nothing is spent before.' }); },
  draft_storyboard: async (a) => { for (const it of (Array.isArray(a.items) ? a.items : []) as { shot?: string }[]) shotOf({ ...a, shot: it.shot }); return draft('storyboard'); },
  log_gap: async () => ({ logged: true }),
};
const STUBS = AGENT_TOOLS.filter((t) => t.name in RUN).map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown>, reply: RUN[t.name] }));
const READ = TOOLS.filter((t) => !(t.name in RUN)).map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown> }));
const tools = [...READ, ...STUBS].map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

const SYSTEM = `You are the Snowmoon assistant on snowmoon.party, helping one signed-in person make something from the book Snowmoon (by Vitalik Buterin, GPL-3.0). You work as their agent: you read the book with your tools and draft things into their private dashboard. You never publish and never spend: every draft with a cost waits for the person to tap Make it.
Guide them: first find out what they want to make (a reference image for a character, place or style; an image for a moment; or an adaptation such as a scene, a comic or a storyboard), asking one short question at a time when it isn't clear. Then do the steps with your tools, attaching each draft to exactly one target.
Story words are never yours: narration and dialogue in anything you draft must be the book's own words, quoted word for word with their block id (c<chapter>-b<block>), or the person's own words exactly as they gave them. If they ask you to write new lines, say you can't, and offer to place the book's lines or theirs.
Before drafting a picture of a character or place, read its sheet (get_sheet; get_references finds a glossary word's sheets): use the book's facts, and say when a look is the edition's invention. Before a camera change, read the shot (get_shot). Pictures are always in a style the person chose: if they haven't named one, ask them, and never choose one yourself. Quote the book only word for word, citing its block. Be brief.`;

const SCENARIOS: string[][] = [
  ["I'd like to make a reference picture of Bai.", "Use the book's own look where it has one; the edition's invented look for the rest.", "The same style as the book's own images (Techno vistas)."],
  ["Help me plan a short comic of the Minpentai match in chapter 4.", "Six panels, using the book's own lines from the match. Go ahead and draft it."],
  ["In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei."],
  ["In my Fifteen Days version (adaptation 1, version 2), lower the camera on shot 99-z9-9."],
  ["Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard."],
  ["Make a picture of the Minpentai arena for the glossary.", "Techno vistas."],
  ["Draft a new style for me: soft ink wash, grey and teal, paper texture. Call it Ink wash."],
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
        const read = TOOLS.find((t) => t.name === tc.function.name && !(t.name in RUN));
        const stub = STUBS.find((t) => t.name === tc.function.name);
        try {
          out = stub ? await stub.reply(args) : read ? await read.run(args) : { error: `no tool ${tc.function.name}` };
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
