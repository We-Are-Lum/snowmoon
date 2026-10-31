import 'server-only';
import { ToolInputError } from '../../agent/tools';
import { appUrl } from '../../config';
import { playOn, type Agent } from '../../agents/core';
import type { AgentTool } from '../../agents/tools';
import { autopilot, linkOpens, newSolo, parseOrders, recordOf, resign, rulesOf, setStanding, simulate, SoloError, submit, viewFor, type ModelClaim, type SoloMatch } from './solo';
import { insert, listFor, liveCount, load, newId, newSeed, save, StoreError } from './store';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Minpentai agent play over the connector (draft, 2026-10-31; docs/proposals/minpentai-agent-play.md section 13),
 * solo first: the person's agent starts a match against the site computer and advises; the person decides in their
 * own chat. Scope "play", which stays off (AGENTS.minpentaiPlay) until the owner approves its wording and legal lines.
 *
 * Every answer about a live match comes from solo.ts viewFor (the person's side only) or simulate (their view plus
 * their own guess). A match that isn't the agent's person's reads as missing, the same words as one that doesn't
 * exist; a record opens only when the match is over.
 */
const MAX_LIVE = 5;

const only = (args: Record<string, unknown>, keys: string[]) => {
  const extra = Object.keys(args).filter((k) => !keys.includes(k));
  if (extra.length) throw new ToolInputError(`unknown argument: ${extra.join(', ')}`);
};
const on = () => { if (!playOn()) throw new ToolInputError('Minpentai agent play is not open yet'); };
const NOT_YOURS = 'no match of yours with that id (see minpentai_list_my_matches)';

async function mine(agent: Agent, id: unknown) {
  if (typeof id !== 'string') throw new ToolInputError('match_id must be a match id');
  const r = await load(id);
  if (!r || r.m.person !== agent.person) throw new ToolInputError(NOT_YOURS);
  return r;
}
/** Runs a change on one of the person's matches and saves it; the engine's words come back as the tool's error. */
async function change<T>(agent: Agent, id: unknown, f: (m: SoloMatch) => T): Promise<T> {
  const { m, version } = await mine(agent, id);
  let out: T;
  try { out = f(m); } catch (e) { if (e instanceof SoloError) throw new ToolInputError(e.message); throw e; }
  try { await save(m, version); } catch (e) { if (e instanceof StoreError) throw new ToolInputError(e.message); throw e; }
  return out;
}
const guard = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof SoloError) throw new ToolInputError(e.message); throw e; } };

function modelOf(v: unknown): ModelClaim | null {
  if (v === undefined) return null;
  const m = v as ModelClaim;
  if (!m || typeof m !== 'object' || typeof m.name !== 'string' || typeof m.maker !== 'string' || !['open', 'closed', 'unknown'].includes(m.weights)) throw new ToolInputError('model must be {name, maker, weights: open|closed|unknown, version?}');
  const t = (s: string) => s.replace(/[^\x20-\x7e]/g, '').slice(0, 60);
  return { name: t(m.name), maker: t(m.maker), weights: m.weights, ...(typeof m.version === 'string' ? { version: t(m.version) } : {}) };
}
const liveUrl = (id: string, secret: string) => `${appUrl()}/minpentai/m/${id}?k=${secret}`;

const MODEL = { type: 'object', properties: { name: { type: 'string' }, maker: { type: 'string' }, weights: { enum: ['open', 'closed', 'unknown'] }, version: { type: 'string' } }, required: ['name', 'maker', 'weights'], additionalProperties: false, description: 'The model you run, as you declare it. Shown as self-reported; never checked.' };
const MATCH = { type: 'string', description: 'The match id (from minpentai_start_solo or minpentai_list_my_matches).' };
const PLACEMENTS = {
  type: 'array', maxItems: 40,
  description: 'Pieces to place this turn. piece: glider, square, tower; on the book edition also mirror, symbol_glider, moving_wall, factory. x, y from the top left. dir (N, NE, E, SE, S, SW, W, NW) for gliders, symbol gliders, moving walls (where it flies; x, y is its middle square) and factories (where it fires; its rock is behind it). slant ("/" or "\\") for mirrors.',
  items: { type: 'object', properties: { piece: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' }, dir: { type: 'string' }, slant: { type: 'string' } }, required: ['piece', 'x', 'y'], additionalProperties: false },
};

export const MINPENTAI_TOOLS: AgentTool[] = [
  {
    name: 'minpentai_start_solo', title: 'Start a Minpentai match against the site computer', scope: 'play', writes: true, counts: 'reads',
    description: 'Starts a match for your person (Cyan) against the site computer (Amber), on the book edition (default) or Play\'s rules, at level 1 (easiest) to 5. Returns the match, your side\'s first view, and a live link that shows your person their side only (shown once: give it to your person). Your person decides; you advise and place what they agree to. Rules invented for this edition, not the book\'s.',
    inputSchema: { type: 'object', properties: { ruleset: { enum: ['book', 'play'] }, level: { type: 'integer', minimum: 1, maximum: 5 }, model: MODEL }, additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['ruleset', 'level', 'model']);
      const ruleset = args.ruleset === undefined ? 'book' : args.ruleset;
      const level = args.level === undefined ? 3 : args.level;
      if (ruleset !== 'book' && ruleset !== 'play') throw new ToolInputError('ruleset must be "book" or "play"');
      if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > 5) throw new ToolInputError('level must be 1 to 5');
      if ((await liveCount(agent.person)) >= MAX_LIVE) throw new ToolInputError(`your person already has ${MAX_LIVE} live matches; finish or resign one first`);
      const { m, linkSecret } = guard(() => newSolo({ id: newId(), ruleset, level: level as number, seed: newSeed(), person: agent.person, agent: { id: agent.id, name: agent.name, model: modelOf(args.model) }, now: new Date().toISOString() }));
      await insert(m);
      return { match_id: m.id, side: 'Cyan', live_url: liveUrl(m.id, linkSecret), view: viewFor(m) };
    },
  },
  {
    name: 'minpentai_list_my_matches', title: 'Your person\'s Minpentai matches', scope: 'play', writes: false, counts: 'reads',
    description: 'Your person\'s agent-play matches, newest first: id, ruleset, level, and whether each is over.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, []);
      return { matches: (await listFor(agent.person)).map((r) => ({ match_id: r.id, ruleset: r.ruleset, level: r.level, over: r.over, updated_at: r.updated_at })) };
    },
  },
  {
    name: 'minpentai_get_view', title: 'Your side of a Minpentai match', scope: 'play', writes: false, counts: 'reads',
    description: 'What your side sees now: rocks, your pieces, every piece within sight of your towers, where you last saw enemy towers, the squares you may place on, your pending orders and the opponent\'s commitment (a hash; its orders stay hidden until the reveal). Nothing outside your sight.',
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['match_id']);
      return viewFor((await mine(agent, args.match_id)).m);
    },
  },
  {
    name: 'minpentai_simulate', title: 'Try plans against your guess', scope: 'play', writes: false, counts: 'reads',
    description: 'Runs the engine from your side\'s view plus your own belief about the dark (enemy towers, squares and gliders you suppose are where you can\'t see), for 1 to 6 scenarios of your placements, to the next turn to act (or `steps`). Never reads the hidden board: a belief piece is refused only where you can already see. Stores nothing.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['match_id', 'scenarios'],
      properties: {
        match_id: MATCH,
        belief: { type: 'object', additionalProperties: false, properties: {
          towers: { type: 'array', items: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' } }, required: ['x', 'y'], additionalProperties: false } },
          squares: { type: 'array', items: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, hits_left: { type: 'integer' } }, required: ['x', 'y'], additionalProperties: false } },
          gliders: { type: 'array', items: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, dir: { type: 'string' } }, required: ['x', 'y', 'dir'], additionalProperties: false } },
        } },
        scenarios: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', properties: { name: { type: 'string' }, placements: PLACEMENTS }, required: ['name', 'placements'], additionalProperties: false } },
        steps: { type: 'integer', minimum: 1, maximum: 96 },
      },
    },
    async run(agent, args) {
      on();
      only(args, ['match_id', 'belief', 'scenarios', 'steps']);
      const { m } = await mine(agent, args.match_id);
      if (m.end) throw new ToolInputError('the match is over: see minpentai_get_record');
      return guard(() => simulate(m, args as Parameters<typeof simulate>[1]));
    },
  },
  {
    name: 'minpentai_submit_orders', title: 'Submit your side\'s orders', scope: 'play', writes: true, counts: 'reads',
    description: 'Your side\'s placements for the open turn, replacing any you sent before. Say whose they are: "person" (your person chose them) or "agent" (you chose them under your person\'s standing order). Returns a commitment (sha256 of the orders and a fresh secret salt, revealed with them after the turn). With final: true the turn resolves now: both sides\' orders are revealed and applied together, and the match runs to the next turn to act.',
    inputSchema: { type: 'object', properties: { match_id: MATCH, turn: { type: 'integer', minimum: 0 }, placements: PLACEMENTS, source: { enum: ['person', 'agent'] }, final: { type: 'boolean' }, note: { type: 'string', maxLength: 280 } }, required: ['match_id', 'turn', 'placements', 'source'], additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['match_id', 'turn', 'placements', 'source', 'final', 'note']);
      if (args.source !== 'person' && args.source !== 'agent') throw new ToolInputError('source must be "person" or "agent"');
      const note = typeof args.note === 'string' ? args.note.replace(/[\x00-\x1f]/g, ' ').slice(0, 280) : undefined;
      const out = await change(agent, args.match_id, (m) => {
        const ps = parseOrders(args.placements, rulesOf(m).s);
        return { r: submit(m, { turn: Number(args.turn), placements: ps, source: args.source as 'person' | 'agent', final: args.final === true, note, now: new Date().toISOString() }), m };
      });
      return { ...out.r, view: viewFor(out.m) };
    },
  },
  {
    name: 'minpentai_let_site_play_turn', title: 'Let the site computer play this turn', scope: 'play', writes: true, counts: 'reads',
    description: 'The site computer plays your side for the open turn, from your side\'s view only, under your standing order\'s preset (balanced if none), and the turn resolves. The record shows the turn as the site computer\'s, not your person\'s or yours.',
    inputSchema: { type: 'object', properties: { match_id: MATCH, turn: { type: 'integer', minimum: 0 } }, required: ['match_id', 'turn'], additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['match_id', 'turn']);
      const out = await change(agent, args.match_id, (m) => ({ r: autopilot(m, { turn: Number(args.turn), now: new Date().toISOString() }), m }));
      return { ...out.r, view: viewFor(out.m) };
    },
  },
  {
    name: 'minpentai_set_standing_order', title: 'Your person\'s standing order', scope: 'play', writes: true, counts: 'reads',
    description: 'How your person wants this match played, in their words (up to 500 characters), and the nearest preset for the site computer when it plays a turn for them: defend, attack, expand or balanced. Private to your side; shown on your person\'s live link.',
    inputSchema: { type: 'object', properties: { match_id: MATCH, text: { type: 'string', maxLength: 500 }, preset: { enum: ['balanced', 'defend', 'attack', 'expand'] } }, required: ['match_id', 'text', 'preset'], additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['match_id', 'text', 'preset']);
      return await change(agent, args.match_id, (m) => setStanding(m, args.text, args.preset));
    },
  },
  {
    name: 'minpentai_resign', title: 'Resign a Minpentai match', scope: 'play', writes: true, counts: 'reads',
    description: 'Ends the match as a loss for your side. Only when your person says so.',
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['match_id']);
      return await change(agent, args.match_id, (m) => resign(m));
    },
  },
  {
    name: 'minpentai_new_live_link', title: 'A new live link for your person', scope: 'play', writes: true, counts: 'reads',
    description: 'Makes a new live link for one of your person\'s matches (their side only) and stops the old one working.',
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(agent, args) {
      on();
      only(args, ['match_id']);
      const secret = randomBytes(24).toString('base64url');
      const id = await change(agent, args.match_id, (m) => { m.linkHash = createHash('sha256').update(secret).digest('hex'); return m.id; });
      return { live_url: liveUrl(id, secret) };
    },
  },
  {
    name: 'minpentai_get_record', title: 'A finished match\'s record', scope: 'play', writes: false, counts: 'reads',
    description: 'The whole record of a finished match, for anyone: the seed, both sides\' orders every turn with who chose them, each commitment and its salt (so anyone can check the orders are the ones committed), the end and the final board. Not before the match ends.',
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(_agent, args) {
      on();
      only(args, ['match_id']);
      const r = typeof args.match_id === 'string' ? await load(args.match_id) : null;
      // Missing and unfinished read the same, so this can't be used to learn that a match exists or how it stands.
      if (!r || !r.m.end) throw new ToolInputError('no finished match with that id');
      return recordOf(r.m);
    },
  },
];

export { linkOpens };
