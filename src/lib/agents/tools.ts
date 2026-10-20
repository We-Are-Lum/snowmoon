import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { TOOLS as READ_TOOLS, ToolInputError } from '../agent/tools';
import { editorData } from '../agent/data';
import { AGENTS } from '../config';
import { countOk, sql, type Agent, type Counted, type Scope } from './core';
import { revoke, agentLabel } from './accounts';
import { checkLines, checkPlain, checkText, storyWordsAllowed } from './filter';
import { bringIn, imagesOpen, ScanMatch, type Declared } from './images';
import { addNote, draftPiece, feedbackFor, notesOn, pieceVersions, piecesOf, revise, versionById, visibleTo, type Kind } from './pieces';

/**
 * The tools an agent of a person can use (owner, 2026-10-20; design §2). Served as MCP at /mcp (the
 * "Add to Claude / Add to ChatGPT" connector) and as REST at /api/agent/v1/<tool> for wallet agents.
 * - Read: the seven read tools of the open read API, plus the agent's own person's work and feedback.
 * - Draft: ideas, storyboards, frames and prompts, character versions, revisions, notes, brought-in images.
 * NOTHING here publishes, spends, or speaks as a person: every draft waits for its person on /you.
 * No tool moves money (Anthropic's directory rule, and ours).
 */
type Schema = { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  scope: Scope;
  writes: boolean;
  counts?: Counted;
  run: (agent: Agent, args: Record<string, unknown>) => Promise<unknown>;
}

const only = (args: Record<string, unknown>, keys: string[]) => {
  const extra = Object.keys(args).filter((k) => !keys.includes(k));
  if (extra.length) throw new ToolInputError(`unknown argument: ${extra.join(', ')}`);
};
const posInt = (v: unknown, what: string) => {
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw new ToolInputError(`${what} must be a whole number from 1`);
  return n;
};
const uuid = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/.test(v)) throw new ToolInputError(`${what} must be an id from this site`);
  return v;
};
const title = (v: unknown) => checkPlain(v, 'title', 120);

/** Shot ids that exist in a published version's data, for storyboards and frames. */
function shotsOf(adaptation: number, version: number) {
  const d = editorData(adaptation, version);
  if (!d) throw new ToolInputError(`no published version ${version} of adaptation ${adaptation} (see list_scenes)`);
  return new Set(d.shots.map((s) => s.id));
}

const LINES = {
  type: 'array',
  maxItems: 60,
  description: 'Story lines, if any. A book line: {source:"book", block:"c14-b32", speaker?, text} (word for word; "…" marks a cut). Your own: {source:"agent", speaker?, text}, allowed only where the site and the person allow agent-written words; such work is labelled "words by @person\'s agent".',
  items: { type: 'object', properties: { source: { enum: ['book', 'agent'] }, block: { type: 'string' }, speaker: { type: 'string' }, text: { type: 'string' } }, required: ['source', 'text'], additionalProperties: false },
};
const STORYBOARD_ITEMS = { type: 'array', minItems: 1, maxItems: 80, items: { type: 'object', properties: { shot: { type: 'string' }, seconds: { type: 'number' }, note: { type: 'string' } }, required: ['shot'], additionalProperties: false } };
const FRAMES = { type: 'array', minItems: 1, maxItems: 40, items: { type: 'object', properties: { shot: { type: 'string' }, prompt: { type: 'string' }, note: { type: 'string' } }, required: ['shot', 'prompt'], additionalProperties: false } };

function storyboardBody(args: Record<string, unknown>, person: number) {
  const adaptation = posInt(args.adaptation, 'adaptation');
  const version = posInt(args.version, 'version');
  const shots = shotsOf(adaptation, version);
  if (!Array.isArray(args.items) || !args.items.length || args.items.length > 80) throw new ToolInputError('items: 1 to 80 shots');
  let words = false;
  const items = args.items.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    if (typeof o.shot !== 'string' || !shots.has(o.shot)) throw new ToolInputError(`item ${i + 1}: no shot "${String(o.shot)}" in that version (see get_scene)`);
    const seconds = o.seconds === undefined ? undefined : Number(o.seconds);
    if (seconds !== undefined && !(seconds > 0 && seconds <= 30)) throw new ToolInputError(`item ${i + 1}: seconds from 0 to 30`);
    const note = o.note === undefined ? undefined : checkText(o.note, `item ${i + 1} note`, 300, person);
    if (note?.wordsByAgent) words = true;
    return { shot: o.shot, ...(seconds ? { seconds } : {}), ...(note ? { note: note.text } : {}) };
  });
  const lines = checkLines(args.lines, person);
  return { body: { adaptation, version, items, ...(lines.lines.length ? { lines: lines.lines } : {}) }, words: words || lines.wordsByAgent, adaptation };
}

function framesBody(args: Record<string, unknown>) {
  const adaptation = posInt(args.adaptation, 'adaptation');
  const version = posInt(args.version, 'version');
  const shots = shotsOf(adaptation, version);
  if (!Array.isArray(args.frames) || !args.frames.length || args.frames.length > 40) throw new ToolInputError('frames: 1 to 40');
  const frames = args.frames.map((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>;
    if (typeof o.shot !== 'string' || !shots.has(o.shot)) throw new ToolInputError(`frame ${i + 1}: no shot "${String(o.shot)}" in that version`);
    return { shot: o.shot, prompt: checkPlain(o.prompt, `frame ${i + 1} prompt`, 1500), ...(o.note !== undefined ? { note: checkPlain(o.note, `frame ${i + 1} note`, 300) } : {}) };
  });
  return { body: { adaptation, version, frames }, adaptation };
}

function characterBody(args: Record<string, unknown>, person: number) {
  const character = typeof args.character === 'string' ? args.character.toLowerCase() : '';
  if (!/^[a-z-]{2,30}$/.test(character) || !existsSync(path.join(process.cwd(), 'content/snowmoon/designs/characters', `${character}.json`)))
    throw new ToolInputError('character must be one of the book’s characters with a design sheet (e.g. zei, deluin, bai)');
  const d = checkText(args.description, 'description', 1200, person);
  return { body: { character, description: d.text, ...(typeof args.based_on === 'string' ? { based_on: checkPlain(args.based_on, 'based_on', 120) } : {}) }, words: d.wordsByAgent };
}

function ideaBody(args: Record<string, unknown>, person: number) {
  const t = checkText(args.text, 'text', 2000, person);
  const adaptation = args.adaptation === undefined ? null : posInt(args.adaptation, 'adaptation');
  const lines = checkLines(args.lines, person);
  const moments = Array.isArray(args.moments) ? args.moments.slice(0, 20).map((m) => checkPlain(m, 'moment', 80)) : undefined;
  return { body: { text: t.text, ...(adaptation ? { adaptation } : {}), ...(moments ? { moments } : {}), ...(lines.lines.length ? { lines: lines.lines } : {}) }, words: t.wordsByAgent || lines.wordsByAgent, adaptation };
}

const myWork = async (agent: Agent, status: 'draft' | 'published') =>
  (await piecesOf(agent.person, status)).map((v) => ({ version: v.id, piece: v.piece, kind: v.kind, title: v.title, n: v.n, status: v.status, by: v.agent ?? v.by, words_by_agent: v.wordsByAgent, url: v.url }));

const WRITE: AgentTool[] = [
  {
    name: 'whoami', title: 'Who am I here', scope: 'read', writes: false,
    description: 'Your name on this site ("<name>, agent of @person"), your scopes, your daily limits, and whether story words, images and notes are open to you.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (agent, args) => {
      only(args, []);
      const who = await agentLabel(agent.person, agent.name);
      return { you: who.label, person: `@${who.short}`, scopes: agent.scopes, limits_per_day: AGENTS.limits, story_words: storyWordsAllowed(agent.person) ? 'allowed, labelled "words by your person\'s agent"' : 'not allowed: book lines (word for word) only', bringing_in_images: imagesOpen() ? 'open' : 'not open yet', rule: 'You draft; your person publishes. Nothing you make is public until they do.' };
    },
  },
  {
    name: 'list_my_work', title: 'List my person\'s work', scope: 'read', writes: false,
    description: 'Your person\'s drafts waiting for them (status "draft") or their published work ("published"), newest first.',
    inputSchema: { type: 'object', properties: { status: { enum: ['draft', 'published'] } }, additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['status']);
      return { items: await myWork(agent, args.status === 'published' ? 'published' : 'draft') };
    },
  },
  {
    name: 'get_piece', title: 'Get a piece', scope: 'read', writes: false,
    description: 'Every version of a piece you can see (published ones, and your person\'s drafts), with their credit chains and published notes.',
    inputSchema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['piece']);
      const versions = await pieceVersions(uuid(args.piece, 'piece'), agent.person);
      if (!versions.length) throw new ToolInputError('no piece with that id that you can see');
      return { versions, notes: await notesOn(versions.filter((v) => v.status === 'published').map((v) => v.id)) };
    },
  },
  {
    name: 'start_idea', title: 'Start an idea', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft an idea for your person: what it is, which adaptation and moments it touches. A private draft until they publish it.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string', description: 'The idea, up to 2,000 characters.' }, adaptation: { type: 'integer' }, moments: { type: 'array', items: { type: 'string' }, description: 'Shot ids or book blocks it touches.' }, lines: LINES }, required: ['title', 'text'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['title', 'text', 'adaptation', 'moments', 'lines']);
      const b = ideaBody(args, agent.person);
      return { ...(await draftPiece(agent, 'idea', title(args.title), b.adaptation, b.body, b.words)), status: 'draft', words_by_agent: b.words };
    },
  },
  {
    name: 'draft_storyboard', title: 'Draft a storyboard', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft a storyboard from a published version\'s shots, in your order, with timings and notes. A private draft until your person publishes it.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, adaptation: { type: 'integer' }, version: { type: 'integer' }, items: STORYBOARD_ITEMS, lines: LINES }, required: ['title', 'adaptation', 'version', 'items'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['title', 'adaptation', 'version', 'items', 'lines']);
      const b = storyboardBody(args, agent.person);
      return { ...(await draftPiece(agent, 'storyboard', title(args.title), b.adaptation, b.body, b.words)), status: 'draft', words_by_agent: b.words };
    },
  },
  {
    name: 'draft_frames', title: 'Draft frames and prompts', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft image prompts for shots of a published version (no image is made here). Use them with your own image model, then bring_in_image the result.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, adaptation: { type: 'integer' }, version: { type: 'integer' }, frames: FRAMES }, required: ['title', 'adaptation', 'version', 'frames'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['title', 'adaptation', 'version', 'frames']);
      const b = framesBody(args);
      return { ...(await draftPiece(agent, 'frames', title(args.title), b.adaptation, b.body, false)), status: 'draft' };
    },
  },
  {
    name: 'draft_character_version', title: 'Draft a character version', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft a new version of one of the book\'s characters: how they look, in words (their sheet can be drawn from it later). Optionally name the sheet version it builds on.',
    inputSchema: { type: 'object', properties: { character: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, based_on: { type: 'string' } }, required: ['character', 'description'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['character', 'title', 'description', 'based_on']);
      const b = characterBody(args, agent.person);
      return { ...(await draftPiece(agent, 'character', title(args.title ?? `${String(args.character)}: a new version`), null, b.body, b.words)), status: 'draft' };
    },
  },
  {
    name: 'bring_in_image', title: 'Bring in an image', scope: 'images', writes: true, counts: 'images',
    description: 'Bring in a frame you made elsewhere, with its recipe as you declare it (prompt, model, inputs by sha256). PNG or JPEG, at most 3 MB, 16:9. It is scanned before it is stored, its metadata removed, and it is shown as "Brought in by @person\'s agent · recipe as declared, not checked" once your person publishes it.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, image_base64: { type: 'string' }, adaptation: { type: 'integer' }, version: { type: 'integer' }, shot: { type: 'string' }, revision_of: { type: 'string' },
        recipe: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'object', properties: { name: { type: 'string' }, maker: { type: 'string' }, weights: { enum: ['open', 'closed', 'unknown'] }, version: { type: 'string' }, ran_on: { type: 'string' } }, required: ['name', 'maker', 'weights'], additionalProperties: false }, inputs: { type: 'array', items: { type: 'object', properties: { sha256: { type: 'string' }, what: { type: 'string' } }, required: ['sha256'], additionalProperties: false } }, seed: { type: ['string', 'integer', 'null'] }, settings: { type: 'object' }, made_at: { type: 'string' } }, required: ['prompt', 'model', 'inputs'], additionalProperties: false },
      },
      required: ['title', 'image_base64', 'recipe'],
      additionalProperties: false,
    },
    run: async (agent, args) => {
      only(args, ['title', 'image_base64', 'adaptation', 'version', 'shot', 'revision_of', 'recipe']);
      const r = (args.recipe ?? {}) as Record<string, unknown>;
      const m = (r.model ?? {}) as Record<string, unknown>;
      const inputs = Array.isArray(r.inputs) ? r.inputs.slice(0, 30).map((i) => ({ sha256: String((i as Record<string, unknown>).sha256 ?? '').toLowerCase(), ...((i as Record<string, unknown>).what ? { what: checkPlain((i as Record<string, unknown>).what, 'input what', 120) } : {}) })) : [];
      if (inputs.some((i) => !/^[0-9a-f]{64}$/.test(i.sha256))) throw new ToolInputError('each input needs its sha256 (64 hex characters)');
      const declared: Declared = {
        prompt: checkPlain(r.prompt, 'recipe.prompt', 4000),
        model: { name: checkPlain(m.name, 'model.name', 80), maker: checkPlain(m.maker, 'model.maker', 80), weights: m.weights === 'open' || m.weights === 'closed' ? m.weights : 'unknown', ...(m.version ? { version: checkPlain(m.version, 'model.version', 80) } : {}), ...(m.ran_on ? { ran_on: checkPlain(m.ran_on, 'model.ran_on', 120) } : {}) },
        inputs, seed: typeof r.seed === 'string' || typeof r.seed === 'number' ? r.seed : null,
        ...(r.settings && typeof r.settings === 'object' ? { settings: JSON.parse(JSON.stringify(r.settings).slice(0, 4000) || '{}') } : {}),
        ...(typeof r.made_at === 'string' ? { made_at: r.made_at.slice(0, 40) } : {}),
      };
      if (typeof args.image_base64 !== 'string') throw new ToolInputError('image_base64 is required');
      const adaptation = args.adaptation === undefined ? null : posInt(args.adaptation, 'adaptation');
      let shot: string | null = null;
      if (args.shot !== undefined) {
        if (!adaptation) throw new ToolInputError('a shot needs its adaptation and version');
        const shots = shotsOf(adaptation, posInt(args.version, 'version'));
        if (typeof args.shot !== 'string' || !shots.has(args.shot)) throw new ToolInputError('no such shot in that version');
        shot = args.shot;
      }
      // Our inputs: the frames and cast cards of the named version, where the editor data lists them by hash.
      const ours = new Set<string>();
      if (adaptation && args.version !== undefined) {
        const d = editorData(adaptation, posInt(args.version, 'version'));
        JSON.stringify(d ?? {}).replace(/"sha256":"([0-9a-f]{64})"/g, (_, h) => (ours.add(h), ''));
      }
      let img;
      try {
        img = await bringIn(args.image_base64, declared, ours);
      } catch (e) {
        if (e instanceof ScanMatch) {
          // Never stored. The agent is disconnected at once; the reporting procedure (docs/agents/design.md §6) takes over.
          await revoke(agent.person, agent.id);
          console.error('brought-in image matched known material; agent disconnected', agent.id);
          throw new ToolInputError('This image was refused and this agent has been disconnected.');
        }
        throw e;
      }
      const body = { ...(adaptation ? { adaptation, version: posInt(args.version, 'version') } : {}), ...(shot ? { shot } : {}) };
      const image = { key: img.key, sha256: img.sha256, declared, checked: img.checked };
      if (args.revision_of !== undefined) {
        const base = await versionById(uuid(args.revision_of, 'revision_of'));
        if (!base || base.kind !== 'image' || !visibleTo(base, agent.person)) throw new ToolInputError('revision_of must be an image version you can see');
        const out = await revise(agent, base.id, body, false, typeof args.title === 'string' ? title(args.title) : undefined);
        await sql()`update studio.piece_versions set image_key = ${image.key}, image_sha256 = ${image.sha256}, declared = ${sql().json(declared as never)}, checked = ${sql().json(img.checked as never)} where id = ${out.version}`;
        return { ...out, status: 'draft', checked: img.checked, label: 'Brought in by your person\'s agent · recipe as declared, not checked' };
      }
      const out = await draftPiece(agent, 'image', title(args.title), adaptation, body, false, image);
      return { ...out, status: 'draft', checked: img.checked, label: 'Brought in by your person\'s agent · recipe as declared, not checked' };
    },
  },
  {
    name: 'read_feedback', title: 'Read feedback', scope: 'notes', writes: false,
    description: 'Published notes on your person\'s published work, and notes anywhere that mention your person or "@person\'s agent" (addressed to you). Newest first.',
    inputSchema: { type: 'object', properties: { since: { type: 'string', description: 'ISO time; only notes after it.' } }, additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['since']);
      const since = typeof args.since === 'string' && !Number.isNaN(Date.parse(args.since)) ? new Date(args.since) : null;
      return { notes: await feedbackFor(agent.person, since) };
    },
  },
  {
    name: 'propose_revision', title: 'Propose a revision', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft a new version of a version you can see, with the same fields as its kind (idea: text, lines; storyboard: adaptation, version, items, lines; frames: adaptation, version, frames; character: character, description). Your person\'s own piece gets its next version; anyone else\'s published version becomes a new piece of your person\'s, credited "revised from @them" (and their agent, if one made it).',
    inputSchema: { type: 'object', properties: { of: { type: 'string' }, title: { type: 'string' }, changes: { type: 'object', description: 'The fields of the new version.' } }, required: ['of', 'changes'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['of', 'title', 'changes']);
      const base = await versionById(uuid(args.of, 'of'));
      if (!base || !visibleTo(base, agent.person)) throw new ToolInputError('no version with that id that you can see');
      const c = (args.changes && typeof args.changes === 'object' ? args.changes : {}) as Record<string, unknown>;
      const kind: Kind = base.kind;
      const built =
        kind === 'idea' ? ideaBody({ ...base.body, ...c }, agent.person)
        : kind === 'storyboard' ? storyboardBody({ ...base.body, ...c }, agent.person)
        : kind === 'frames' ? { ...framesBody({ ...base.body, ...c }), words: false }
        : kind === 'character' ? characterBody({ ...base.body, ...c }, agent.person)
        : null;
      if (!built) throw new ToolInputError('to revise an image, bring_in_image with revision_of');
      const out = await revise(agent, base.id, built.body, built.words, typeof args.title === 'string' ? title(args.title) : undefined);
      return { ...out, status: 'draft', words_by_agent: built.words };
    },
  },
  {
    name: 'leave_note', title: 'Leave a note', scope: 'notes', writes: true, counts: 'notes',
    description: 'Draft a note (up to 500 characters) on a published version. It is labelled as from an agent, and is public only after your person publishes it. @mentions work once published; "@name\'s agent" addresses someone\'s agents.',
    inputSchema: { type: 'object', properties: { on: { type: 'string', description: 'A published version id.' }, text: { type: 'string' } }, required: ['on', 'text'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['on', 'text']);
      const t = checkText(args.text, 'text', 500, agent.person);
      const note = await addNote(uuid(args.on, 'on'), agent.person, agent, t.text);
      return { note: note.id, status: 'draft', label: `from ${note.agent}`, mentions: note.mentions };
    },
  },
];

/** The open read tools, as tools of a signed-in agent (scope read). */
const READ: AgentTool[] = READ_TOOLS.map((t) => ({ ...t, scope: 'read' as Scope, writes: false, run: (_agent: Agent, args: Record<string, unknown>) => t.run(args) }));

export const AGENT_TOOLS: AgentTool[] = [...READ, ...WRITE];
export const agentToolByName = (name: string) => AGENT_TOOLS.find((t) => t.name === name) ?? null;

/** Runs one tool for an agent: its scope, then its count, then the tool. */
export async function runTool(agent: Agent, name: string, args: Record<string, unknown>) {
  const tool = agentToolByName(name);
  if (!tool) throw new ToolInputError(`unknown tool: ${name}`);
  if (!agent.scopes.includes(tool.scope)) throw new ToolInputError(`your person didn’t give you the "${tool.scope}" scope`);
  const c = await countOk(agent, tool.counts ?? 'reads');
  if (!c.ok) throw new ToolInputError(c.why);
  return await tool.run(agent, args);
}
