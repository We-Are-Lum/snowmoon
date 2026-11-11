import 'server-only';
import { ToolInputError } from '../../agent/tools';
import { AGENTS, appUrl } from '../../config';
import { draftsFor, playFor, type Agent } from '../../agents/core';
import type { AgentTool } from '../../agents/tools';
import { CURRENT, DRAFTS, RULESETS, autopilot, linkOpens, newSolo, parseOrders, recordOf, resign, rulesOf, setStanding, simulate, SoloError, submit, symbolLaunches, viewFor, type ModelClaim, type RulesetName, type SoloMatch } from './solo';
import { PIECES_PAGE, toolNotes } from './rules-text';
import { BASE, BASE_DRAWN } from '../versions/schema';
import { insert, listFor, liveCount, load, newId, newSeed, save, StoreError } from './store';
import { planSoon } from './quiet';
import { changeFor, mineFor, NOT_YOURS } from './act';
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
const on = (agent: Agent) => { if (!playFor(agent.person)) throw new ToolInputError('Minpentai agent play is not open to you yet'); };

const mine = (agent: Agent, id: unknown) => mineFor(agent.person, id);
const change = <T,>(agent: Agent, id: unknown, f: (m: SoloMatch) => T): Promise<T> => changeFor(agent.person, id, f);
const guard = <T,>(f: () => T): T => { try { return f(); } catch (e) { if (e instanceof SoloError) throw new ToolInputError(e.message); throw e; } };

function modelOf(v: unknown): ModelClaim | null {
  if (v === undefined) return null;
  const m = v as ModelClaim;
  if (!m || typeof m !== 'object' || typeof m.name !== 'string' || typeof m.maker !== 'string' || !['open', 'closed', 'unknown'].includes(m.weights)) throw new ToolInputError('model must be {name, maker, weights: open|closed|unknown, version?}');
  const t = (s: string) => s.replace(/[^\x20-\x7e]/g, '').slice(0, 60);
  return { name: t(m.name), maker: t(m.maker), weights: m.weights, ...(typeof m.version === 'string' ? { version: t(m.version) } : {}) };
}
/**
 * The rules lines tool descriptions carry (owner, 2026-11-02), generated from the settings new matches are played
 * under, so they can't drift from the engine; each match's view has its exact rules in "rules".
 */
const NOTES = toolNotes(rulesOf({ ruleset: CURRENT.book, seed: 1 }).s, { ...BASE, ...RULESETS[CURRENT.play].set }, (RULESETS[CURRENT.play].drawn ?? BASE_DRAWN).map((d) => d.set));
const PAGE = `The view's "rules" lists every rule of the match; "how_the_pieces_work" (${PIECES_PAGE}) is a page for your person to read, invite-only: you can't open it, and you don't need to.`;
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
    description: `Starts a match for your person (Cyan) against the site computer (Amber), on the book edition (default) or Play\'s rules (or a draft of the book edition\'s rebalanced rules, "book-3" or "book-4", open only to the people they\'re shown to), at level 0 (the beginner) to 3. Returns the match, your side\'s first view, and a live link that shows your person their side only (shown once: give it to your person). Your person decides; you advise and place what they agree to. Rules invented for this edition, not the book\'s. ${NOTES.core} ${NOTES.convergence} ${NOTES.sight} ${PAGE}`,
    inputSchema: { type: 'object', properties: { ruleset: { enum: ['book', 'play', ...(DRAFTS as string[])] }, level: { type: 'integer', minimum: 0, maximum: 3 }, model: MODEL }, additionalProperties: false },
    async run(agent, args) {
      on(agent);
      only(args, ['ruleset', 'level', 'model']);
      const ruleset = args.ruleset === undefined ? 'book' : args.ruleset;
      const level = args.level === undefined ? 2 : args.level;
      const draft = (DRAFTS as unknown[]).includes(ruleset) && draftsFor(agent.person);
      if (ruleset !== 'book' && ruleset !== 'play' && !draft) throw new ToolInputError('ruleset must be "book" or "play"');
      if (!Number.isInteger(level) || (level as number) < 0 || (level as number) > 3) throw new ToolInputError('level must be 0 (the beginner) to 3');
      if ((await liveCount(agent.person)) >= MAX_LIVE) throw new ToolInputError(`your person already has ${MAX_LIVE} live matches; finish or resign one first`);
      const { m, linkSecret } = guard(() => newSolo({ id: newId(), ruleset: draft ? (ruleset as RulesetName) : CURRENT[ruleset as 'book' | 'play'], level: level as number, seed: newSeed(), person: agent.person, agent: { id: agent.id, name: agent.name, model: modelOf(args.model) }, now: new Date().toISOString() }));
      await insert(m);
      planSoon(m.id); // the computer plans its setup just after this answer is sent
      return { match_id: m.id, side: 'Cyan', live_url: liveUrl(m.id, linkSecret), view: viewFor(m) };
    },
  },
  {
    name: 'minpentai_list_my_matches', title: 'Your person\'s Minpentai matches', scope: 'play', writes: false, counts: 'reads',
    description: 'Your person\'s agent-play matches, newest first: id, ruleset, level, and whether each is over.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run(agent, args) {
      on(agent);
      only(args, []);
      return { matches: (await listFor(agent.person)).map((r) => ({ match_id: r.id, ruleset: r.ruleset, level: r.level, over: r.over, started_at: r.created_at })) };
    },
  },
  {
    name: 'minpentai_get_view', title: 'Your side of a Minpentai match', scope: 'play', writes: false, counts: 'reads',
    description: `What your side sees now (call it at the start of every exchange: your person may have taken the turn on their live page, in which case my_turns marks it taken_on_the_live_page and last_turn_summary tells what happened): rocks, your pieces, every piece within sight (board), the same as text (grid: one character a square, with its legend), the squares you see (in_sight, as rows "y=3: x=0-4, 6"), your own pieces out of sight as you last saw them (my_pieces_out_of_sight: never their state now; a glider a kill report ties to the tower it destroyed is left out, and a symbol glider of yours is listed as resting out of sight only where your side saw it come to rest, the square and the step last_turn_summary gives; one that came to rest where you didn't see isn't listed until you see it, since a resting one gives no sight), where you last saw enemy towers, where the enemy could place next turn from those towers (enemy_can_place_from_last_seen), the squares you may place on (can_place, as rows), those of them the enemy can place on too, where it may cancel what you place (can_place_contested), on rulesets with kill reports the towers each side destroyed (towers_destroyed: not towers left; they may have towers you haven't seen), your pending orders and the opponent's commitment (a hash; its orders stay hidden until the reveal). Nothing outside your sight. Also the match's full rules ("rules", generated from its ruleset: read them before your first turn). ${NOTES.core} ${NOTES.sight} ${PAGE}`,
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(agent, args) {
      on(agent);
      only(args, ['match_id']);
      return viewFor((await mine(agent, args.match_id)).m);
    },
  },
  {
    name: 'minpentai_simulate', title: 'Try plans against your guess', scope: 'play', writes: false, counts: 'reads',
    description: `Runs the engine from your side\'s view plus your own belief about the dark (enemy towers, squares and gliders you suppose are where you can\'t see), for 1 to 6 scenarios of your placements, to the next turn to act (or \`steps\`). Never reads the hidden board. By default the enemy towers you last saw (last_seen_enemy_towers) are on the board where you last saw them (use_last_seen: false leaves them out), so are the enemy squares you last saw, with the hits they had then (use_last_seen_squares: false leaves them out; last_seen_squares_assumed lists them), and so are your own pieces out of sight, as you last saw them. A belief piece is refused only where you can already see (in_sight in get_view); every such square is named at once. Stores nothing. Each scenario also says, on the book edition, which symbols form (symbols: x, y, the step it forms) and where your symbol gliders rest (symbol_gliders_resting), and whether last turn's symbol stays walled in (last_turns_symbols); "warnings" for placements that block your own launch lanes: a row or column left with no launch cell, or a piece standing in the line in front of one of your launch cells (measured with the towers you have now, on your view; squares beside your own towers wall them in, so they get one line a tower: "Your squares at (12,2) and (12,4) wall (12,3)"); and "contested" when a placement is on a square the enemy can place on too ("The enemy can place on (13,8): it may cancel."). ${NOTES.core} ${NOTES.convergence}`,
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
        use_last_seen: { type: 'boolean', description: 'Default true: enemy towers you last saw are assumed where you last saw them. false: leaves them out.' },
        use_last_seen_squares: { type: 'boolean', description: 'Default true: enemy squares you last saw are assumed where you last saw them, with the hits they had then. false: leaves them out.' },
      },
    },
    async run(agent, args) {
      on(agent);
      only(args, ['match_id', 'belief', 'scenarios', 'steps', 'use_last_seen', 'use_last_seen_squares']);
      const { m } = await mine(agent, args.match_id);
      if (m.end) throw new ToolInputError('the match is over: see minpentai_get_record');
      return guard(() => simulate(m, args as Parameters<typeof simulate>[1]));
    },
  },
  {
    name: 'minpentai_symbol_launches', title: 'Three symbol gliders that form your symbol on a square', scope: 'play', writes: false, counts: 'reads',
    description: `Book edition: for a target square (x, y), up to three options, each three symbol-glider launches (from your can_place squares, in directions the rules allow) that come to rest inside the 3 x 3 box around the target and form your symbol there, with where and at which step each comes to rest and the step the symbol forms. Each option was flown in the engine, all three together, from your side's view with your own pieces out of sight where you last saw them (my_pieces_out_of_sight: a symbol glider of yours resting there stops launches), and nothing assumed about the enemy's pieces you can't see (an enemy piece in the dark can still stop them). If there is none it says why (nothing in that line to stop them, the target out of every lane, the tower cap), and whether you can afford three this turn. Stores nothing; place them with minpentai_submit_orders. ${NOTES.convergence}`,
    inputSchema: { type: 'object', properties: { match_id: MATCH, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 } }, required: ['match_id', 'x', 'y'], additionalProperties: false },
    async run(agent, args) {
      on(agent);
      only(args, ['match_id', 'x', 'y']);
      const { m } = await mine(agent, args.match_id);
      if (m.end) throw new ToolInputError('the match is over: see minpentai_get_record');
      return guard(() => symbolLaunches(m, { x: args.x, y: args.y }));
    },
  },
  {
    name: 'minpentai_submit_orders', title: 'Submit your side\'s orders', scope: 'play', writes: true, counts: 'reads',
    description: `Your side's placements for the open turn, replacing any you sent before. Sent with final: false they are a draft: your person sees it on their live page (faint on the board, its cost and lane warnings) and can approve it there with Take turn, which plays the turn as theirs; or they tell you to send it with final: true. Say whose they are: "person" (your person chose them) or "agent" (you chose them under your person\'s standing order). Returns only whether they were accepted, the commitment (sha256 of the orders and a fresh secret salt, revealed with them after the turn; Take turn on the live page keeps it) and the points left; with final: true also how the turn resolved (call minpentai_get_view for what happened). With final: true the turn resolves now: both sides\' orders are revealed and applied together, and the match runs to the next turn to act. Try them in minpentai_simulate first: it warns when a placement blocks your own launch lanes. ${NOTES.core}`,
    inputSchema: { type: 'object', properties: { match_id: MATCH, turn: { type: 'integer', minimum: 0 }, placements: PLACEMENTS, source: { enum: ['person', 'agent'] }, final: { type: 'boolean' }, note: { type: 'string', maxLength: 280 } }, required: ['match_id', 'turn', 'placements', 'source'], additionalProperties: false },
    async run(agent, args) {
      on(agent);
      only(args, ['match_id', 'turn', 'placements', 'source', 'final', 'note']);
      if (args.source !== 'person' && args.source !== 'agent') throw new ToolInputError('source must be "person" or "agent"');
      const note = typeof args.note === 'string' ? args.note.replace(/[\x00-\x1f]/g, ' ').slice(0, 280) : undefined;
      const out = await change(agent, args.match_id, (m) => {
        const ps = parseOrders(args.placements, rulesOf(m).s);
        return { r: submit(m, { turn: Number(args.turn), placements: ps, source: args.source as 'person' | 'agent', final: args.final === true, note, now: new Date().toISOString() }), m };
      });
      const r = out.r as ReturnType<typeof submit> & { resolved?: unknown };
      // Small replies (owner, 2026-11-04): no echo of the view; get_view has it.
      return { accepted: r.accepted, commitment: r.commitment, points_left: r.points_left, ...(r.resolved ? { resolved: r.resolved } : {}) };
    },
  },
  {
    name: 'minpentai_let_site_play_turn', title: 'Let the site computer play this turn', scope: 'play', writes: true, counts: 'reads',
    description: 'The site computer plays your side for the open turn, from your side\'s view only, under your standing order\'s preset (balanced if none), and the turn resolves. The record shows the turn as the site computer\'s, not your person\'s or yours.',
    inputSchema: { type: 'object', properties: { match_id: MATCH, turn: { type: 'integer', minimum: 0 } }, required: ['match_id', 'turn'], additionalProperties: false },
    async run(agent, args) {
      on(agent);
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
      on(agent);
      only(args, ['match_id', 'text', 'preset']);
      return await change(agent, args.match_id, (m) => setStanding(m, args.text, args.preset));
    },
  },
  {
    name: 'minpentai_resign', title: 'Resign a Minpentai match', scope: 'play', writes: true, counts: 'reads',
    description: 'Ends the match as a loss for your side. Only when your person says so.',
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(agent, args) {
      on(agent);
      only(args, ['match_id']);
      return await change(agent, args.match_id, (m) => resign(m));
    },
  },
  {
    name: 'minpentai_new_live_link', title: 'A new live link for your person', scope: 'play', writes: true, counts: 'reads',
    description: 'Makes a new live link for one of your person\'s matches (their side only) and stops the old one working.',
    inputSchema: { type: 'object', properties: { match_id: MATCH }, required: ['match_id'], additionalProperties: false },
    async run(agent, args) {
      on(agent);
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
    async run(agent, args) {
      on(agent);
      only(args, ['match_id']);
      const r = typeof args.match_id === 'string' ? await load(args.match_id) : null;
      // Missing and unfinished read the same, so this can't be used to learn that a match exists or how it stands.
      if (!r || !r.m.end) throw new ToolInputError('no finished match with that id');
      return recordOf(r.m);
    },
  },
];

export { linkOpens };
