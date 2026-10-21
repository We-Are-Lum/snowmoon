import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { TOOLS as READ_TOOLS, ToolInputError } from '../agent/tools';
import { editorData } from '../agent/data';
import { AGENTS } from '../config';
import { countOk, dailyLimits, sql, type Agent, type Counted, type Scope } from './core';
import { revoke, agentLabel } from './accounts';
import { checkLines, checkPlain, checkText, storyWordsAllowed } from './filter';
import { bringIn, imagesOpen, ScanMatch, type Declared } from './images';
import { addNote, draftPiece, feedbackFor, notesOn, pieceVersions, piecesOf, revise, versionById, visibleTo, type Answering, type Kind } from './pieces';
import { openRequests, personWords } from './requests';
import { addDirection, directionOf, findLine, rewriteLine } from './direction';
import { changeTiming, listTakes, logGap, markSpeaking, requestVideo, swapTake, tryFrame, frameEstimate, videoEstimate } from './edits';

/**
 * The tools an agent of a person can use (owner, 2026-10-20; design §2). Served as MCP at /mcp (the
 * "Add to Claude / Add to ChatGPT" connector) and as REST at /api/agent/v1/<tool> for wallet agents.
 * The main goal (owner, 2026-10-20): people do the creative acts (ideas, words, voice, feedback); the agent
 * does the work. So the agent's to-do list is its person's requests (read_requests): ideas and notes they
 * typed or said. Every draft says which request it answers, and its stamp keeps what the person did apart
 * from what the agent did. Story words are never the agent's: lines are the person's own (checked against
 * what they said) or the book's (checked against the block).
 * - Read: the seven read tools of the open read API, plus the person's requests, work and feedback.
 * - Draft: pieces from ideas, storyboards, frames and prompts, character versions, revisions, notes, images.
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
  description: 'Story lines, if any. Story words stay human: your person\'s own words, exactly as they typed or said them ({source:"person", speaker?, text}), or the book\'s, word for word ({source:"book", block:"c14-b32", speaker?, text}; "…" marks a cut). Never write lines yourself; if one is missing, leave it out.',
  items: { type: 'object', properties: { source: { enum: ['person', 'book'] }, block: { type: 'string' }, speaker: { type: 'string' }, text: { type: 'string' } }, required: ['source', 'text'], additionalProperties: false },
};
const ANSWERING = { type: 'string', description: 'The id of your person\'s request this answers (from read_requests). It goes into the stamp as their idea or their note.' };
const NOTES = { type: 'array', items: { type: 'string' }, description: 'Ids of published notes from other people that this takes up (from read_feedback); credited as their feedback.' };
const answeringOf = (args: Record<string, unknown>, lines?: { personWords: boolean; lines: { source: string }[]; wordsByAgent: boolean }): Answering => ({
  ...(typeof args.answering === 'string' ? { request: args.answering } : {}),
  ...(Array.isArray(args.notes) ? { notes: args.notes.filter((n): n is string => typeof n === 'string').slice(0, 10) } : {}),
  ...(lines ? { lines: { person: lines.personWords, book: lines.lines.some((l) => l.source === 'book'), ai: lines.wordsByAgent } } : {}),
});
const STORYBOARD_ITEMS = { type: 'array', minItems: 1, maxItems: 80, items: { type: 'object', properties: { shot: { type: 'string' }, seconds: { type: 'number' }, note: { type: 'string' } }, required: ['shot'], additionalProperties: false } };
const FRAMES = { type: 'array', minItems: 1, maxItems: 40, items: { type: 'object', properties: { shot: { type: 'string' }, prompt: { type: 'string' }, note: { type: 'string' } }, required: ['shot', 'prompt'], additionalProperties: false } };

function storyboardBody(args: Record<string, unknown>, person: number, words: string[]) {
  const adaptation = posInt(args.adaptation, 'adaptation');
  const version = posInt(args.version, 'version');
  const shots = shotsOf(adaptation, version);
  if (!Array.isArray(args.items) || !args.items.length || args.items.length > 80) throw new ToolInputError('items: 1 to 80 shots');
  let written = false;
  const items = args.items.map((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    if (typeof o.shot !== 'string' || !shots.has(o.shot)) throw new ToolInputError(`item ${i + 1}: no shot "${String(o.shot)}" in that version (see get_scene)`);
    const seconds = o.seconds === undefined ? undefined : Number(o.seconds);
    if (seconds !== undefined && !(seconds > 0 && seconds <= 30)) throw new ToolInputError(`item ${i + 1}: seconds from 0 to 30`);
    const note = o.note === undefined ? undefined : checkText(o.note, `item ${i + 1} note`, 300, person, words.join('\n'));
    if (note?.wordsByAgent) written = true;
    return { shot: o.shot, ...(seconds ? { seconds } : {}), ...(note ? { note: note.text } : {}) };
  });
  const lines = checkLines(args.lines, person, words);
  return { body: { adaptation, version, items, ...(lines.lines.length ? { lines: lines.lines } : {}) }, words: written || lines.wordsByAgent, adaptation, lines };
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

function characterBody(args: Record<string, unknown>, person: number, words: string[]) {
  const character = typeof args.character === 'string' ? args.character.toLowerCase() : '';
  if (!/^[a-z-]{2,30}$/.test(character) || !existsSync(path.join(process.cwd(), 'content/snowmoon/designs/characters', `${character}.json`)))
    throw new ToolInputError('character must be one of the book’s characters with a design sheet (e.g. zei, deluin, bai)');
  const d = checkText(args.description, 'description', 1200, person, words.join('\n'));
  return { body: { character, description: d.text, ...(typeof args.based_on === 'string' ? { based_on: checkPlain(args.based_on, 'based_on', 120) } : {}) }, words: d.wordsByAgent };
}

function ideaBody(args: Record<string, unknown>, person: number, words: string[]) {
  const t = checkText(args.text, 'text', 2000, person, words.join('\n'));
  const adaptation = args.adaptation === undefined ? null : posInt(args.adaptation, 'adaptation');
  const lines = checkLines(args.lines, person, words);
  const moments = Array.isArray(args.moments) ? args.moments.slice(0, 20).map((m) => checkPlain(m, 'moment', 80)) : undefined;
  return { body: { text: t.text, ...(adaptation ? { adaptation } : {}), ...(moments ? { moments } : {}), ...(lines.lines.length ? { lines: lines.lines } : {}) }, words: t.wordsByAgent || lines.wordsByAgent, adaptation, lines };
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
      return { you: who.label, person: `@${who.short}`, scopes: agent.scopes, ...(agent.spendCapUsd !== null ? { spend_cap_usd: agent.spendCapUsd, spend_note: 'Your key\'s cap for all the spending your person approves on your drafts.' } : {}), limits_per_day: dailyLimits(agent.person), story_words: storyWordsAllowed(agent.person) ? 'allowed (test switch), labelled' : 'never yours: place your person\'s own words (exactly as they said them) or the book\'s; if a line is missing, leave it out and ask', how_to_work: 'Call read_requests: your person\'s ideas and notes are your to-do list. Answer each with a draft (answering: its id). They react with keep, try again, or say more; those come back as requests. To edit their own scene, use list_takes, try_frame, swap_take, change_timing, mark_speaking or request_video_test; anything with a cost waits for their approval. If no tool can do what they asked, call log_gap.', bringing_in_images: imagesOpen() ? 'open' : 'not open yet', rule: 'You draft; your person publishes. Nothing you make is public until they do.' };
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
    name: 'read_requests', title: 'Read my person\'s requests', scope: 'read', writes: false,
    description: 'Your to-do list: what your person typed or said to you and you haven\'t answered yet, oldest first. Each is an idea, a note on a frame, moment or draft, "try again" (they discarded your draft), or "say more". Their words are theirs: use them as they are, never rewrite them as story lines. Answer each with a draft (answering: its id).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (agent, args) => {
      only(args, []);
      return { requests: await openRequests(agent.person) };
    },
  },
  {
    name: 'start_idea', title: 'Make a first piece from an idea', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Turn your person\'s idea (answering: the request id) into a first piece: what it is, which adaptation and moments it touches. Describe; don\'t write story lines. A private draft until they keep it.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string', description: 'What the piece is, up to 2,000 characters. Your working, not story words.' }, adaptation: { type: 'integer' }, moments: { type: 'array', items: { type: 'string' }, description: 'Shot ids or book blocks it touches.' }, lines: LINES, answering: ANSWERING }, required: ['title', 'text'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['title', 'text', 'adaptation', 'moments', 'lines', 'answering']);
      const b = ideaBody(args, agent.person, await personWords(agent.person));
      return { ...(await draftPiece(agent, 'idea', title(args.title), b.adaptation, b.body, b.words, undefined, answeringOf(args, b.lines))), status: 'draft' };
    },
  },
  {
    name: 'draft_storyboard', title: 'Draft a storyboard', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft a storyboard from a published version\'s shots, in your order, with timings and notes. A private draft until your person publishes it.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, adaptation: { type: 'integer' }, version: { type: 'integer' }, items: STORYBOARD_ITEMS, lines: LINES, answering: ANSWERING }, required: ['title', 'adaptation', 'version', 'items'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['title', 'adaptation', 'version', 'items', 'lines', 'answering']);
      const b = storyboardBody(args, agent.person, await personWords(agent.person));
      return { ...(await draftPiece(agent, 'storyboard', title(args.title), b.adaptation, b.body, b.words, undefined, answeringOf(args, b.lines))), status: 'draft' };
    },
  },
  {
    name: 'draft_frames', title: 'Draft frames and prompts', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft image prompts for shots of a published version (no image is made here). Use them with your own image model, then bring_in_image the result.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, adaptation: { type: 'integer' }, version: { type: 'integer' }, frames: FRAMES, answering: ANSWERING }, required: ['title', 'adaptation', 'version', 'frames'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['title', 'adaptation', 'version', 'frames', 'answering']);
      const b = framesBody(args);
      return { ...(await draftPiece(agent, 'frames', title(args.title), b.adaptation, b.body, false, undefined, answeringOf(args))), status: 'draft' };
    },
  },
  {
    name: 'draft_character_version', title: 'Draft a character version', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft a new version of one of the book\'s characters: how they look, in words (their sheet can be drawn from it later). Optionally name the sheet version it builds on.',
    inputSchema: { type: 'object', properties: { character: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, based_on: { type: 'string' }, answering: ANSWERING }, required: ['character', 'description'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['character', 'title', 'description', 'based_on', 'answering']);
      const b = characterBody(args, agent.person, await personWords(agent.person));
      return { ...(await draftPiece(agent, 'character', title(args.title ?? `${String(args.character)}: a new version`), null, b.body, b.words, undefined, answeringOf(args))), status: 'draft' };
    },
  },
  {
    name: 'bring_in_image', title: 'Bring in an image', scope: 'images', writes: true, counts: 'images',
    description: 'Bring in a frame you made elsewhere, with its recipe as you declare it (prompt, model, inputs by sha256). PNG or JPEG, at most 3 MB, 16:9. It is scanned before it is stored, its metadata removed, and it is shown as "Brought in by @person\'s agent · recipe as declared, not checked" once your person publishes it.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, image_base64: { type: 'string' }, adaptation: { type: 'integer' }, version: { type: 'integer' }, shot: { type: 'string' }, revision_of: { type: 'string' }, answering: ANSWERING,
        words: { enum: ['none', 'person', 'book', 'ai'], description: 'Story words shown in the image, if any: none, your person\'s, the book\'s, or written by an AI (labelled, and never your person\'s).' },
        recipe: { type: 'object', properties: { prompt: { type: 'string' }, model: { type: 'object', properties: { name: { type: 'string' }, maker: { type: 'string' }, weights: { enum: ['open', 'closed', 'unknown'] }, version: { type: 'string' }, ran_on: { type: 'string' } }, required: ['name', 'maker', 'weights'], additionalProperties: false }, inputs: { type: 'array', items: { type: 'object', properties: { sha256: { type: 'string' }, what: { type: 'string' } }, required: ['sha256'], additionalProperties: false } }, seed: { type: ['string', 'integer', 'null'] }, settings: { type: 'object' }, made_at: { type: 'string' } }, required: ['prompt', 'model', 'inputs'], additionalProperties: false },
      },
      required: ['title', 'image_base64', 'recipe'],
      additionalProperties: false,
    },
    run: async (agent, args) => {
      only(args, ['title', 'image_base64', 'adaptation', 'version', 'shot', 'revision_of', 'recipe', 'answering', 'words']);
      const wordsIn = args.words === 'person' || args.words === 'book' || args.words === 'ai' ? args.words : 'none';
      const aiWords = wordsIn === 'ai';
      const answering = { ...answeringOf(args), lines: { person: wordsIn === 'person', book: wordsIn === 'book', ai: aiWords } };
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
        const out = await revise(agent, base.id, body, aiWords, typeof args.title === 'string' ? title(args.title) : undefined, answering);
        await sql()`update studio.piece_versions set image_key = ${image.key}, image_sha256 = ${image.sha256}, declared = ${sql().json(declared as never)}, checked = ${sql().json(img.checked as never)} where id = ${out.version}`;
        return { ...out, status: 'draft', checked: img.checked, label: 'Brought in by your person\'s agent · recipe as declared, not checked' };
      }
      const out = await draftPiece(agent, 'image', title(args.title), adaptation, body, aiWords, image, answering);
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
    description: 'Draft a new version answering feedback: your person\'s note, "try again" or "say more" (answering: the request id), and/or other people\'s published notes (notes: their ids). Same fields as its kind (idea: text, lines; storyboard: adaptation, version, items, lines; frames: adaptation, version, frames; character: character, description). Your person\'s own piece gets its next version; anyone else\'s published version becomes a new piece of your person\'s, credited "revised from @them".',
    inputSchema: { type: 'object', properties: { of: { type: 'string' }, title: { type: 'string' }, changes: { type: 'object', description: 'The fields of the new version.' }, answering: ANSWERING, notes: NOTES }, required: ['of', 'changes'], additionalProperties: false },
    run: async (agent, args) => {
      only(args, ['of', 'title', 'changes', 'answering', 'notes']);
      const base = await versionById(uuid(args.of, 'of'));
      if (!base || !visibleTo(base, agent.person)) throw new ToolInputError('no version with that id that you can see');
      const c = (args.changes && typeof args.changes === 'object' ? args.changes : {}) as Record<string, unknown>;
      const kind: Kind = base.kind;
      const words = await personWords(agent.person);
      const built =
        kind === 'idea' ? ideaBody({ ...base.body, ...c }, agent.person, words)
        : kind === 'storyboard' ? storyboardBody({ ...base.body, ...c }, agent.person, words)
        : kind === 'frames' ? { ...framesBody({ ...base.body, ...c }), words: false, lines: undefined }
        : kind === 'character' ? { ...characterBody({ ...base.body, ...c }, agent.person, words), lines: undefined }
        : null;
      if (!built) throw new ToolInputError('to revise an image, bring_in_image with revision_of');
      const out = await revise(agent, base.id, built.body, built.words, typeof args.title === 'string' ? title(args.title) : undefined, answeringOf(args, built.lines));
      return { ...out, status: 'draft' };
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

const SHOT_ARGS = { adaptation: { type: 'integer' }, version: { type: 'integer' }, shot: { type: 'string' } };
const EDIT_NOTE = 'Your person\'s own words for what they want.';

/**
 * Editing the person's own adaptation (owner, 2026-10-20). Drafts only; a frame or a video costs money and
 * runs only after the person approves the shown estimate on /you.
 */
const EDITS: AgentTool[] = [
  {
    name: 'list_takes', title: 'List a shot\'s voice takes', scope: 'read', writes: false,
    description: 'For a shot of a version your person made: each line, the take in use, and the other takes there are for it (for swap_take).',
    inputSchema: { type: 'object', properties: SHOT_ARGS, required: ['adaptation', 'version', 'shot'], additionalProperties: false },
    run: async (agent, args) => listTakes(agent, args),
  },
  {
    name: 'try_frame', title: 'Try a new frame for a shot', scope: 'drafts', writes: true, counts: 'drafts',
    description: `Draft a new frame for a shot of your person's own version, from their note. Nothing is made yet: their You page shows the estimate (up to about $${frameEstimate()}) and makes it only when they approve; the frame comes from the site's own pipeline (the shot's camera, cast and place, plus the note) and stays private in the draft.`,
    inputSchema: { type: 'object', properties: { ...SHOT_ARGS, note: { type: 'string', description: EDIT_NOTE }, answering: ANSWERING }, required: ['adaptation', 'version', 'shot', 'note'], additionalProperties: false },
    run: async (agent, args) => tryFrame(agent, args),
  },
  {
    name: 'swap_take', title: 'Swap a voice take', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft using another take of a line in a shot of your person\'s own version (the takes are theirs; see list_takes).',
    inputSchema: { type: 'object', properties: { ...SHOT_ARGS, cue: { type: 'string' }, take: { type: 'string' }, answering: ANSWERING }, required: ['adaptation', 'version', 'shot', 'cue', 'take'], additionalProperties: false },
    run: async (agent, args) => swapTake(agent, args),
  },
  {
    name: 'change_timing', title: 'Change a shot\'s timing', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft a new start and end for a shot of your person\'s own version: from_s and to_s (seconds in the cut), or a new length in seconds.',
    inputSchema: { type: 'object', properties: { ...SHOT_ARGS, from_s: { type: 'number' }, to_s: { type: 'number' }, seconds: { type: 'number' }, answering: ANSWERING }, required: ['adaptation', 'version', 'shot'], additionalProperties: false },
    run: async (agent, args) => changeTiming(agent, args),
  },
  {
    name: 'mark_speaking', title: 'Mark who\'s speaking', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'Draft who is speaking in a shot of your person\'s own version (names, or the shot\'s letters such as Z and B).',
    inputSchema: { type: 'object', properties: { ...SHOT_ARGS, who: { type: 'array', items: { type: 'string' } }, answering: ANSWERING }, required: ['adaptation', 'version', 'shot', 'who'], additionalProperties: false },
    run: async (agent, args) => markSpeaking(agent, args),
  },
  {
    name: 'request_video_test', title: 'Request a video test for a shot', scope: 'drafts', writes: true, counts: 'drafts',
    description: `Draft a short video test of a shot of your person's own version (LongCat-Video, 480p, 5 seconds, from the shot's frame and their note). Its cost (about $${videoEstimate()}) is shown on their You page; nothing is spent until they approve.`,
    inputSchema: { type: 'object', properties: { ...SHOT_ARGS, note: { type: 'string', description: EDIT_NOTE }, answering: ANSWERING }, required: ['adaptation', 'version', 'shot'], additionalProperties: false },
    run: async (agent, args) => requestVideo(agent, args),
  },
  {
    name: 'find_line', title: 'Find a line in your person\'s version', scope: 'read', writes: false,
    description: 'Before filing a note or a rewrite: find the line your person means by some of its words and/or its speaker. Gives each match\'s shot, cue, time and who is on screen. If more than one fits, or none, ask your person which they mean; never guess.',
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' }, words: { type: 'string' }, speaker: { type: 'string' } }, required: ['adaptation', 'version'], additionalProperties: false },
    run: async (agent, args) => findLine(agent.person, args),
  },
  {
    name: 'get_direction', title: 'Read your person\'s direction notes', scope: 'read', writes: false,
    description: 'Your person\'s direction notes (intent, acting, delivery) and line rewrites on one of their versions, as filed.',
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' } }, required: ['adaptation', 'version'], additionalProperties: false },
    run: async (agent, args) => directionOf(agent.person, args),
  },
  {
    name: 'add_direction', title: 'File a direction note', scope: 'drafts', writes: true, counts: 'notes',
    description: 'File one of your person\'s direction notes on their own version, in their words exactly as they gave them (never reworded, summarised or added to). kind: "intent" for a moment (shot): where to take the viewer, the feeling, the thoughts; "acting" for a character in a shot: thinking, movement, where they look (needs character; it feeds that shot\'s frame and video prompts); "delivery" for a line: how it\'s said (needs cue; it goes on the re-record sheet). Name the shot (or the cue for delivery). If you aren\'t sure which shot or line, or which kind, ask your person first; never guess. Split a sentence covering several shots or kinds into one note each only if their words split cleanly; otherwise ask.',
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' }, kind: { enum: ['intent', 'acting', 'delivery'] }, shot: { type: 'string' }, character: { type: 'string' }, cue: { type: 'string' }, text: { type: 'string', description: 'Your person\'s words, exactly as they gave them.' }, answering: ANSWERING }, required: ['adaptation', 'version', 'kind', 'text'], additionalProperties: false },
    run: async (agent, args) => addDirection(agent.person, { agent, request: typeof args.answering === 'string' ? args.answering : null }, args),
  },
  {
    name: 'rewrite_line', title: 'File a line rewrite', scope: 'drafts', writes: true, counts: 'drafts',
    description: 'File your person\'s new line, exactly as they wrote or said it, as a draft against the line it replaces (by cue; find_line shows them). Story words are theirs: never write, fix or finish a line yourself; if they haven\'t given you the exact words, ask. The rewrite goes on their re-record sheet. If you aren\'t sure which line, ask; never guess.',
    inputSchema: { type: 'object', properties: { adaptation: { type: 'integer' }, version: { type: 'integer' }, cue: { type: 'string' }, text: { type: 'string', description: 'Your person\'s new line, exactly as they gave it.' }, answering: ANSWERING }, required: ['adaptation', 'version', 'cue', 'text'], additionalProperties: false },
    run: async (agent, args) => rewriteLine(agent.person, { agent, request: typeof args.answering === 'string' ? args.answering : null }, args),
  },
  {
    name: 'log_gap', title: 'Log something you couldn\'t do', scope: 'read', writes: true,
    description: 'When your person asks for something none of your tools can do, record it: what they asked (their words) and what was missing. It shows on their You page and becomes the build list. Use it instead of guessing or working around a missing tool.',
    inputSchema: { type: 'object', properties: { asked: { type: 'string' }, missing: { type: 'string' } }, required: ['asked', 'missing'], additionalProperties: false },
    run: async (agent, args) => logGap(agent, args),
  },
];

/** The open read tools, as tools of a signed-in agent (scope read). */
const READ: AgentTool[] = READ_TOOLS.map((t) => ({ ...t, scope: 'read' as Scope, writes: false, run: (_agent: Agent, args: Record<string, unknown>) => t.run(args) }));

export const AGENT_TOOLS: AgentTool[] = [...READ, ...WRITE, ...EDITS];
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
