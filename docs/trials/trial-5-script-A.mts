/**
 * Fifth assistant trial (owner, 2026-10-29 overnight): the hybrid. Each conversation starts on gpt-oss-120b (book
 * questions); once match_request finds a tool for what the person wants to make, every later call in that conversation
 * goes to Kimi K3 ("make" mode). A match_request that finds no tool (a gap) stays on gpt-oss.
 * The trial-3 fixes live in the tools, not the prompt. The draft tools are
 * the site's real definitions as tools/list gives them (style as an enum of the offered styles) and run the site's
 * real code (src/lib/agents/pictures.ts: targets, style, the subject-alone rule, match_request, the replies), with only
 * the database stood in: drafts and gaps are kept in memory here, nothing is written anywhere. Every request goes
 * through the Vercel AI Gateway with zeroDataRetention: true (only providers with a verified ZDR agreement); the
 * provider that served each call and its cost are recorded. Never the site's Groq key.
 */
import { writeFileSync } from 'node:fs';
import { TOOLS } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agent/tools';
import { editorData } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agent/data';
import { listedTools } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agents/tools';
import { draftPicture, draftPlace, draftSheet, draftStyle, matchRequest, type PictureCtx, type PictureStyle } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agents/pictures';
import { parseMove } from '/Users/nathan/snowmoon-agent-pictures/src/lib/agents/edits';
import { styleText } from '/Users/nathan/snowmoon-agent-pictures/src/lib/images/rules';

const KEY = process.env.AI_GATEWAY_API_KEY!;
const BOOK_MODEL = 'openai/gpt-oss-120b';
const MAKE_MODEL = 'moonshotai/kimi-k3';
const OUT = process.argv[2] ?? '/tmp/trial6.json';
const BUDGET_USD = Number(process.argv[3] ?? 2.5);
let spentAll = 0;

// The styles on a fresh site: the starting style only.
const OFFERED: PictureStyle[] = [{ version: null, starting: 'techno-vistas', name: 'Techno vistas', by: 'the project', text: styleText('techno-vistas', null) }];
let n = 0;
const drafts: { kind: string; title: string }[] = [];
const gaps: { asked: string; missing: string }[] = [];
const characterLooks = new Map<string, string>();
const ctx: PictureCtx = {
  offered: async () => OFFERED,
  write: async (kind, title) => (drafts.push({ kind, title }), { version: `stub-${kind}-${++n}`, piece: `stub-piece-${n}` }),
  gap: async (asked, missing) => (gaps.push({ asked, missing }), { gap: `stub-gap-${gaps.length}` }),
};
const AGENT = { id: 'trial', person: 6786, route: 'oauth', name: 'Assistant', scopes: ['read', 'drafts', 'images', 'notes'], clientId: null, address: null, spendCapUsd: null } as never;
const shotOf = (a: Record<string, unknown>) => {
  const shot = editorData(Number(a.adaptation), Number(a.version))?.shots.find((x) => x.id === a.shot);
  if (!shot) throw new Error(`no shot "${String(a.shot)}" in that version. Next: get_scene lists its shots.`);
  return shot;
};
const MAKE_IT = (what: string, usd: number) => `Saved as a private draft; nothing is made or spent yet. Next, your person taps Make it on their dashboard (about $${usd}): that makes the ${what} privately, inside the draft, seen only by them. Publishing or using it is a separate step, Keep, which only your person can take.`;
const RUN: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
  draft_picture: (a) => draftPicture(AGENT, a, ctx),
  draft_sheet: (a) => {
    const look = typeof a.from_version === 'string' ? characterLooks.get(a.from_version) : undefined;
    return draftSheet(AGENT, look ? { ...a, from_version: undefined, look } : a, ctx);
  },
  draft_place: (a) => draftPlace(AGENT, a, ctx),
  draft_style: (a) => draftStyle(AGENT, a, ctx),
  match_request: (a) => matchRequest(AGENT, a, ctx),
  log_gap: async (a) => (gaps.push({ asked: String(a.asked), missing: String(a.missing) }), { gap: `stub-gap-${gaps.length}` }),
  draft_character_version: async (a) => { const id = `stub-character-${++n}`; characterLooks.set(id, String(a.description ?? '')); return { version: id, status: 'draft' }; },
  set_camera: async (a) => {
    const shot = shotOf(a);
    const words = Array.isArray(a.moves) ? a.moves : typeof a.moves === 'string' ? [a.moves] : [];
    const moves = words.map((w, i) => parseMove(w, i));
    const who = new Set(Array.isArray(shot.who) ? (shot.who as string[]) : []);
    for (const p of (Array.isArray(a.people) ? a.people : []) as { who?: string }[]) if (!p.who || !who.has(p.who)) throw new Error(`${p.who ?? 'who'} isn't in shot ${shot.id} (on screen: ${[...who].join(', ') || 'nobody'})`);
    if (!moves.length && !(Array.isArray(a.people) && a.people.length)) throw new Error('nothing to change: give moves (e.g. "tilt down 20°", "pan left 15°", "closer", "wider", "higher", "lower") or people');
    return { version: `stub-camera-${++n}`, status: 'draft', change: { type: 'camera', moves }, next: 'Saved as a private draft. Keep, which only your person can take, is the separate step that uses it. Next: try_frame draws a frame from it.' };
  },
  try_frame: async (a) => (shotOf(a), { version: `stub-frame-${++n}`, status: 'draft', estimate_usd: 0.05, next: MAKE_IT('frame', 0.05) }),
  request_video_test: async (a) => (shotOf(a), { version: `stub-video-${++n}`, status: 'draft', estimate_usd: 0.054, next: MAKE_IT('video', 0.054) }),
  draft_storyboard: async (a) => { for (const it of (Array.isArray(a.items) ? a.items : []) as { shot?: string }[]) shotOf({ ...a, shot: it.shot }); return { version: `stub-storyboard-${++n}`, status: 'draft' }; },
};
const listed = (await listedTools({ scopes: ['read', 'drafts', 'images', 'notes'] } as never, async () => OFFERED)).filter((t) => t.name in RUN);
const READ = TOOLS.filter((t) => !(t.name in RUN)).map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown> }));
const tools = [...READ, ...listed.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown> }))].map((t) => ({ type: 'function', function: t }));

// The trial-3 prompt, without the style sentence added there: the fixes are in the tools now.
const SYSTEM = `You are the Snowmoon assistant on snowmoon.party, helping one signed-in person make something from the book Snowmoon (by Vitalik Buterin, GPL-3.0). You work as their agent: you read the book with your tools and draft things into their private dashboard. You never publish and never spend: every draft with a cost waits for the person to tap Make it.
Guide them: first find out what they want to make (a reference image for a character, place or style; an image for a moment; or an adaptation such as a scene, a comic or a storyboard), asking one short question at a time when it isn't clear. Then do the steps with your tools, attaching each draft to exactly one target.
Story words are never yours: narration and dialogue in anything you draft must be the book's own words, quoted word for word with their block id (c<chapter>-b<block>), or the person's own words exactly as they gave them. If they ask you to write new lines, say you can't, and offer to place the book's lines or theirs.
Before drafting a picture of a character or place, read its sheet (get_sheet; get_references finds a glossary word's sheets): use the book's facts, and say when a look is the edition's invention. Before a camera change, read the shot (get_shot). Quote the book only word for word, citing its block. Be brief.`;

const SCENARIOS: string[][] = [
  ["I'd like to make a reference picture of Bai.", "Use the book's own look where it has one; the edition's invented look for the rest.", "The same style as the book's own images (Techno vistas)."],
  ["Help me plan a short comic of the Minpentai match in chapter 4.", "Six panels, using the book's own lines from the match. Go ahead and draft it."],
  ["In my Fifteen Days version (adaptation 1, version 2), redo shot 11-b1-4 from a lower angle, looking up at Zei."],
  ["In my Fifteen Days version (adaptation 1, version 2), lower the camera on shot 99-z9-9."],
  ["Write Zei a new line where he finally tells Bai how he feels, and put it in a storyboard."],
  ["Make a picture of the Minpentai arena for the glossary.", "Techno vistas."],
  ["What is a Keeper in the book?"],
  ["I'd like a reference picture of the Minpentai arena, the place itself.", "Techno vistas."],
  ["Make me a new style: soft ink wash, grey and teal, paper texture, with a sample picture. Call it Ink wash."],
  ["Make a picture of the moment in chapter 4 when Bai walks in and puts her hand on Zei's shoulder.", "Techno vistas."],
  ["In my Fifteen Days version (adaptation 1, version 2), on shot 14-b1-6, bring the camera closer and pan left a little."],
  ["Turn chapter 2 into a song with music I can listen to."],
];

type Msg = { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string; name?: string; reasoning?: string };
type Spent = { usd: number; tokensIn: number; tokensOut: number; providers: Set<string>; zdr: boolean; byModel: Record<string, number> };
async function chat(MODEL: string, messages: Msg[], spent: Spent) {
  if (spentAll >= BUDGET_USD) throw new Error(`stopped: the trial's budget of $${BUDGET_USD} is spent`);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 6000, providerOptions: { gateway: { zeroDataRetention: true } } }),
      signal: AbortSignal.timeout(240_000),
    }).catch((e) => e as Error);
    if (r instanceof Error || (!r.ok && attempt < 2 && r.status >= 500)) { if (attempt < 2) continue; throw r instanceof Error ? r : new Error(`gateway ${r.status}`); }
    const j = (await r.json()) as { choices?: { message: Msg & { provider_metadata?: { gateway?: { routing?: { finalProvider?: string }; enabledZeroDataRetention?: boolean } } } }[]; usage?: { prompt_tokens: number; completion_tokens: number; cost?: number }; error?: unknown };
    if (!r.ok || !j.choices) throw new Error(`gateway ${r.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
    const m = j.choices[0].message;
    const g = m.provider_metadata?.gateway;
    spent.usd += j.usage?.cost ?? 0;
    spentAll += j.usage?.cost ?? 0;
    spent.byModel[MODEL] = (spent.byModel[MODEL] ?? 0) + (j.usage?.cost ?? 0);
    spent.tokensIn += j.usage?.prompt_tokens ?? 0;
    spent.tokensOut += j.usage?.completion_tokens ?? 0;
    if (g?.routing?.finalProvider) spent.providers.add(`${MODEL.split('/')[1]} on ${g.routing.finalProvider}`);
    if (g?.enabledZeroDataRetention !== true) spent.zdr = false;
    return m;
  }
}

const results = [];
for (const turns of SCENARIOS) {
  const s = turns.join(' / ');
  const spent: Spent = { usd: 0, tokensIn: 0, tokensOut: 0, providers: new Set<string>(), zdr: true, byModel: {} };
  let model = BOOK_MODEL;
  let switchedAt: number | null = null;
  const gapsBefore = gaps.length;
  const messages: Msg[] = [{ role: 'system', content: SYSTEM }, { role: 'user', content: turns[0] }];
  let turn = 1;
  const calls: { name: string; args: unknown; ok: boolean; note?: string }[] = [];
  let final = '';
  let error: string | null = null;
  try {
    for (let step = 0; step < 20; step++) {
      const m = await chat(model, messages, spent);
      messages.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls, ...(m.reasoning ? { reasoning: m.reasoning } : {}) });
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
          const stub = RUN[tc.function.name];
          const read = TOOLS.find((t) => t.name === tc.function.name && !(t.name in RUN));
          try {
            out = stub ? await stub(args) : read ? await read.run(args) : { error: `no tool ${tc.function.name}` };
            if (!read && !stub) ok = false;
          } catch (e) { ok = false; out = { error: (e as Error).message }; }
        }
        calls.push({ name: tc.function.name, args, ok, note: ok ? undefined : JSON.stringify(out).slice(0, 300), model: model.split('/')[1] } as never);
        // "Make" mode: once match_request finds a tool, the rest of this conversation runs on Kimi K3.
        if (ok && tc.function.name === 'match_request' && (out as { tools?: unknown }).tools && model !== MAKE_MODEL) { model = MAKE_MODEL; switchedAt = calls.length; }
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(out).slice(0, 12000) });
      }
    }
  } catch (e) { error = (e as Error).message; }
  results.push({ scenario: s, calls, final, error, gaps: gaps.slice(gapsBefore), cost_usd: spent.usd, by_model: spent.byModel, switched_to_kimi_after_call: switchedAt, tokens_in: spent.tokensIn, tokens_out: spent.tokensOut, providers: [...spent.providers], zdr_every_call: spent.zdr });
  console.log(`\n=== ${s}  [$${spent.usd.toFixed(4)} via ${[...spent.providers].join(', ')}${spent.zdr ? ', ZDR on every call' : ', ZDR NOT confirmed'}]\n${calls.map((c) => `  ${c.ok ? 'ok ' : 'ERR'} ${c.name} ${JSON.stringify(c.args).slice(0, 220)}${c.note ? ' -> ' + c.note : ''}`).join('\n')}${error ? `\n  ERROR ${error}` : ''}\n--- answer: ${final.replace(/\s+/g, ' ').slice(0, 700)}`);
}
const total = results.reduce((a, r) => a + r.cost_usd, 0);
console.log(`\nhybrid: $${total.toFixed(4)} for ${results.length} conversations, $${(total / results.length).toFixed(4)} each on average`);
writeFileSync(OUT, JSON.stringify({ model: `${BOOK_MODEL} for book questions, ${MAKE_MODEL} once match_request finds a tool`, cost_usd: total, results }, null, 1));
