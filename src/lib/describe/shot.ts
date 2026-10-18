/**
 * "Describe the shot" (owner, 2026-10-18; branch describe-shot): one box in the live shot editor where
 * the person says how to move the camera or the people ("lower, from behind Zei, tighter on Deluin").
 * The words and the shot's camera, people and the set's named places go to the assistant's model
 * (CHAT.model on CHAT.providerName), which may answer only through one tool call, set_shot, with new
 * values for the same controls the editor has. Nothing else: no text, no set pieces.
 *
 * This file is shared by the route and the tests (no server-only imports): the request's checks,
 * the tool's schema, and applyChange(), which checks the model's answer and clamps every value to
 * the editor's own ranges (the sliders and the drag limits in set3d.ts) before it is sent back.
 */

export type Vec3 = [number, number, number];
export interface Person {
  at: [number, number];
  /** Degrees: 0 faces +z (south), 90 faces +x (east). */
  face: number;
  pose: string;
  y?: number;
}
export interface Camera {
  cam: Vec3;
  look: Vec3;
  fov: number;
  people: Record<string, Person>;
}
export interface Place {
  name: string;
  kind: string;
  at: [number, number];
  /** The set's own short description of it, if it has one ("the long rectangular wooden table"). */
  what?: string;
}
export interface DescribeRequest {
  words: string;
  set: string;
  /** The set's ground width in metres: the drag limit is half of it plus 10 m (set3d.ts). */
  ground: number;
  camera: Camera;
  places: Place[];
  /** The shot's own size and setup, for the model's context (for example "OTS", "OTS-Z"). */
  size: string | null;
  setup: string | null;
}

/** The editor's ranges: the sliders in shot-editor.tsx and the drag limits in set3d.ts. */
export const RANGES = {
  fov: { min: 10, max: 90 },
  /** Camera height (the Height slider). */
  height: { min: 0.3, max: 8 },
  /** The point the camera looks at: its height (not a slider; kept to the same span, and a little below the floor for sunk sets). */
  lookHeight: { min: -2, max: 8 },
  /** Ground widths the sets use; the drag limit is ground / 2 + 10 m. */
  ground: { min: 2, max: 60 },
} as const;
export const halfExtent = (ground: number) => clamp(ground, RANGES.ground.min, RANGES.ground.max) / 2 + 10;

export const WORDS_MAX = 300;
export const PLACES_MAX = 40;
/** The people the editor knows (shot-editor.tsx NAMES). */
export const PEOPLE: Record<string, string> = { Z: 'Zei', B: 'Bai', D: 'Deluin', K: 'Kau', R: 'The robot waiter' };
/** Poses a person may be given (the editor's Pose menu). The robot keeps its own. */
export const POSES = ['seated', 'standing'] as const;
const KNOWN_POSES = ['seated', 'standing', 'seated-low', 'robot'];
const COMPASS: Record<string, number> = { N: 180, S: 0, E: 90, W: 270, NE: 135, NW: 225, SE: 45, SW: 315 };

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
const r3 = (v: number) => +v.toFixed(3);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(finite);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const deg = (v: number) => r3(((v % 360) + 360) % 360);
export const faceToDegrees = (f: unknown): number | null => (finite(f) ? deg(f) : typeof f === 'string' && f in COMPASS ? COMPASS[f] : null);

export class BadRequest extends Error {}

/** Checks the editor's request; throws BadRequest with a reason a person can read. */
export function parseRequest(body: unknown): DescribeRequest {
  if (!plain(body)) throw new BadRequest('Send the words and the shot');
  const words = typeof body.words === 'string' ? body.words.trim() : '';
  if (!words) throw new BadRequest('Say how to change the shot');
  if (words.length > WORDS_MAX) throw new BadRequest(`At most ${WORDS_MAX} characters`);
  const set = typeof body.set === 'string' && /^[a-z0-9-]{1,40}$/.test(body.set) ? body.set : null;
  if (!set) throw new BadRequest('Unknown set');
  if (!finite(body.ground)) throw new BadRequest('Unknown set size');
  const c = body.camera;
  if (!plain(c) || !vec(c.cam, 3) || !vec(c.look, 3) || !finite(c.fov) || !plain(c.people)) throw new BadRequest('The shot’s camera is missing');
  const people: Record<string, Person> = {};
  const entries = Object.entries(c.people);
  if (entries.length > Object.keys(PEOPLE).length) throw new BadRequest('Too many people');
  for (const [who, p] of entries) {
    if (!(who in PEOPLE)) throw new BadRequest(`Unknown person ${who.slice(0, 8)}`);
    const face = plain(p) ? faceToDegrees(p.face) : null;
    if (!plain(p) || !vec(p.at, 2) || face === null || (p.pose !== undefined && !KNOWN_POSES.includes(p.pose as string)) || (p.y !== undefined && !finite(p.y)))
      throw new BadRequest(`${PEOPLE[who]}’s place is missing`);
    people[who] = { at: [p.at[0], p.at[1]], face, pose: (p.pose as string | undefined) ?? 'standing', ...(finite(p.y) ? { y: p.y } : {}) };
  }
  const places: Place[] = [];
  if (body.places !== undefined) {
    if (!Array.isArray(body.places) || body.places.length > PLACES_MAX) throw new BadRequest('Too many places');
    for (const p of body.places) {
      if (!plain(p) || typeof p.name !== 'string' || !/^[\w -]{1,40}$/.test(p.name) || typeof p.kind !== 'string' || !/^[a-z]{1,20}$/.test(p.kind) || !vec(p.at, 2)) throw new BadRequest('A place is not readable');
      if (p.what !== undefined && (typeof p.what !== 'string' || p.what.length > 100 || /[\u0000-\u001f]/.test(p.what))) throw new BadRequest('A place is not readable');
      places.push({ name: p.name, kind: p.kind, at: [r3(p.at[0]), r3(p.at[1])], ...(p.what ? { what: p.what as string } : {}) });
    }
  }
  const short = (v: unknown) => (typeof v === 'string' && /^[\w -]{1,24}$/.test(v) ? v : null);
  return {
    words,
    set,
    ground: clamp(body.ground, RANGES.ground.min, RANGES.ground.max),
    camera: { cam: c.cam.map(r3) as Vec3, look: c.look.map(r3) as Vec3, fov: r3(c.fov), people },
    places,
    size: short(body.size),
    setup: short(body.setup),
  };
}

/** The one tool the model may call. Its fields are the editor's controls; people are the shot's own. */
export function toolFor(req: DescribeRequest) {
  const half = halfExtent(req.ground);
  const person = {
    type: 'object',
    additionalProperties: false,
    properties: {
      at: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: `Where they stand or sit, [x, z] in metres, each between -${half} and ${half}.` },
      face: { type: 'number', description: 'Which way they face, in degrees: 0 toward +z (south), 90 toward +x (east), 180 toward -z (north), 270 toward -x (west).' },
      pose: { type: 'string', enum: [...POSES] },
    },
  };
  return {
    type: 'function' as const,
    function: {
      name: 'set_shot',
      description: 'Change the shot: give only the controls that change. Every value is a number in metres or degrees, in the set’s own coordinates.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cam: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: `The camera's position [x, y, z]; y is its height, ${RANGES.height.min}–${RANGES.height.max} m.` },
          look: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'The point the camera looks at [x, y, z].' },
          fov: { type: 'number', minimum: RANGES.fov.min, maximum: RANGES.fov.max, description: 'Vertical field of view in degrees: smaller is tighter.' },
          people: {
            type: 'object',
            additionalProperties: false,
            description: 'Only the people who move, turn or change pose, by their letter.',
            properties: Object.fromEntries(Object.keys(req.camera.people).map((k) => [k, { ...person, description: PEOPLE[k] }])),
          },
        },
      },
    },
  };
}

/** What the model is shown: the controls as they are now, the people's names and the set's named places. */
export function stateFor(req: DescribeRequest) {
  return {
    set: req.set,
    shot: { size: req.size, setup: req.setup },
    limits: { xz: halfExtent(req.ground), height: RANGES.height, fov: RANGES.fov },
    camera: { cam: req.camera.cam, look: req.camera.look, fov: req.camera.fov },
    people: Object.fromEntries(Object.entries(req.camera.people).map(([k, p]) => [k, { name: PEOPLE[k], at: p.at, face: p.face, pose: p.pose }])),
    places: req.places,
  };
}

export type Applied = { ok: true; camera: Camera; clamped: string[]; changed: boolean } | { ok: false; reason: string };

/**
 * Checks the model's set_shot arguments and returns the shot's new camera. Refuses (ok: false) on
 * anything unknown: a field the tool doesn't have, a person not in the shot, a value of the wrong
 * type. Clamps every number to the editor's ranges and lists what was clamped.
 */
export function applyChange(req: DescribeRequest, args: unknown): Applied {
  if (!plain(args)) return { ok: false, reason: 'not an object' };
  for (const k of Object.keys(args)) if (!['cam', 'look', 'fov', 'people'].includes(k)) return { ok: false, reason: `unknown field ${k.slice(0, 20)}` };
  const half = halfExtent(req.ground);
  const clamped: string[] = [];
  const fit = (name: string, v: number, min: number, max: number) => {
    const c = clamp(v, min, max);
    if (c !== v) clamped.push(name);
    return r3(c);
  };
  const before = req.camera;
  const out: Camera = JSON.parse(JSON.stringify(before));
  if (args.cam !== undefined) {
    if (!vec(args.cam, 3)) return { ok: false, reason: 'cam is not [x, y, z]' };
    out.cam = [fit('cam.x', args.cam[0], -half, half), fit('cam.y', args.cam[1], RANGES.height.min, RANGES.height.max), fit('cam.z', args.cam[2], -half, half)];
  }
  if (args.look !== undefined) {
    if (!vec(args.look, 3)) return { ok: false, reason: 'look is not [x, y, z]' };
    out.look = [fit('look.x', args.look[0], -half, half), fit('look.y', args.look[1], RANGES.lookHeight.min, RANGES.lookHeight.max), fit('look.z', args.look[2], -half, half)];
  }
  if (args.fov !== undefined) {
    if (!finite(args.fov)) return { ok: false, reason: 'fov is not a number' };
    out.fov = fit('fov', args.fov, RANGES.fov.min, RANGES.fov.max);
  }
  if (args.people !== undefined) {
    if (!plain(args.people)) return { ok: false, reason: 'people is not an object' };
    for (const [who, p] of Object.entries(args.people)) {
      if (!(who in before.people)) return { ok: false, reason: `unknown person ${who.slice(0, 8)}` };
      if (!plain(p)) return { ok: false, reason: `${who} is not an object` };
      for (const k of Object.keys(p)) if (!['at', 'face', 'pose'].includes(k)) return { ok: false, reason: `unknown field ${who}.${k.slice(0, 20)}` };
      const to = out.people[who];
      if (p.at !== undefined) {
        if (!vec(p.at, 2)) return { ok: false, reason: `${who}.at is not [x, z]` };
        to.at = [fit(`${who}.x`, p.at[0], -half, half), fit(`${who}.z`, p.at[1], -half, half)];
      }
      if (p.face !== undefined) {
        if (!finite(p.face)) return { ok: false, reason: `${who}.face is not a number` };
        to.face = deg(p.face);
      }
      if (p.pose !== undefined) {
        if (!(POSES as readonly string[]).includes(p.pose as string)) return { ok: false, reason: `${who}.pose is not seated or standing` };
        // The robot keeps its own shape, as in the editor (no Pose menu for it).
        if (who !== 'R') to.pose = p.pose as string;
      }
    }
  }
  // A camera on top of the point it looks at has no direction: keep the old look point.
  if (Math.hypot(out.cam[0] - out.look[0], out.cam[1] - out.look[1], out.cam[2] - out.look[2]) < 0.1) {
    out.look = [...before.look] as Vec3;
    clamped.push('look');
  }
  return { ok: true, camera: out, clamped, changed: JSON.stringify(out) !== JSON.stringify(before) };
}
