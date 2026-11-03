/**
 * The agent tools, grouped so a person approves fewer (owner's mapping, 2026-11-04). A grouped tool takes
 * {kind, args}: kind is one of the tools it groups, by that tool's old name, and args are that tool's own fields,
 * checked strictly (unknown fields refused). Every kind keeps its scope, its daily count, its cost estimate and its
 * approvals; a failed call is recorded under the kind's name, as before. A group with no kinds is one tool, unchanged.
 *
 * Words and names only: this file imports nothing (scripts/lib/p4a.ts checks it, and that every kind here is a tool).
 *
 * Hints (MCP tool annotations), decided per group from what its kinds can do:
 * - readOnlyHint: true only where no kind changes anything the person or anyone else sees (read, search_book,
 *   whoami, minpentai_read). match_request is in read by the owner's choice: when nothing makes what was asked it
 *   records a gap for the owner, as log_gap does; it changes nothing of the person's.
 * - destructiveHint: true only for minpentai_resign (it ends a match as a loss, for good). Every other write adds a
 *   private draft, note, suggestion or order and never overwrites or deletes the person's work.
 * - idempotentHint: true for the read-only groups and for minpentai_resign (resigning again changes nothing more);
 *   false for the rest, since each call adds another draft, note or turn.
 * - openWorldHint: false everywhere: every tool works only on this site's own data, never on the wider web.
 */
export type Hints = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
export interface Group {
  name: string;
  /** Null: a single tool, listed as it was. */
  kinds: string[] | null;
  title?: string;
  description?: string;
  hints: Hints;
}

const READS: Hints = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES: Hints = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const GROUPS: Group[] = [
  {
    name: 'read', hints: READS,
    title: 'Read the book, scenes and your person\'s work',
    description: 'Read-only. Pick a kind and give its fields in args.',
    kinds: ['get_scene', 'get_shot', 'get_moment', 'get_passage', 'get_piece', 'get_recipe', 'list_scenes', 'list_takes', 'list_my_work', 'find_line', 'get_direction', 'read_feedback', 'read_requests', 'read_my_suggestions', 'get_sheet', 'get_glossary', 'get_references', 'match_request'],
  },
  { name: 'search_book', kinds: null, hints: READS },
  { name: 'whoami', kinds: null, hints: READS },
  {
    name: 'draft', hints: WRITES,
    title: 'Draft something for your person',
    description: 'Saves a private draft for your person; nothing is public, kept or spent until they decide on their You page. Pick a kind and give its fields in args.',
    kinds: ['start_idea', 'draft_storyboard', 'draft_frames', 'draft_character_version', 'propose_revision', 'rewrite_line', 'add_direction', 'draft_picture', 'draft_sheet', 'draft_place', 'draft_style'],
  },
  {
    name: 'edit_my_version', hints: WRITES,
    title: 'Draft an edit to your person\'s own scene version',
    description: 'Drafts an edit on a scene version your person made; a frame or video waits for their approval of its estimate. Pick a kind and give its fields in args.',
    kinds: ['try_frame', 'swap_take', 'change_timing', 'mark_speaking', 'request_video_test', 'set_camera'],
  },
  { name: 'leave_note', kinds: null, hints: WRITES },
  {
    name: 'tell_the_site', hints: WRITES,
    title: 'Tell the site\'s owner',
    description: 'Passes something to the site\'s owner, never published: log_gap (what your person asked that no tool can do) or suggest_improvement (their words on how the site could be better). Pick a kind and give its fields in args.',
    kinds: ['log_gap', 'suggest_improvement'],
  },
  { name: 'bring_in_image', kinds: null, hints: WRITES },
  {
    name: 'minpentai_read', hints: READS,
    title: 'Read your person\'s Minpentai matches',
    description: 'Read-only: your side\'s view, plans tried against your guess, your matches, a finished match\'s record. Pick a kind and give its fields in args.',
    kinds: ['minpentai_get_record', 'minpentai_get_view', 'minpentai_list_my_matches', 'minpentai_simulate', 'minpentai_symbol_launches'],
  },
  {
    name: 'minpentai_play', hints: WRITES,
    title: 'Play your person\'s Minpentai match',
    description: 'Starts a match, sends your side\'s orders, sets the standing order, lets the site computer play a turn, or makes a new live link. Pick a kind and give its fields in args.',
    kinds: ['minpentai_start_solo', 'minpentai_submit_orders', 'minpentai_set_standing_order', 'minpentai_let_site_play_turn', 'minpentai_new_live_link'],
  },
  { name: 'minpentai_resign', kinds: null, hints: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
];

/** The group a tool's old name is now in, and how to call it: {name, arguments}. */
export function groupOf(kind: string): Group | null {
  return GROUPS.find((g) => (g.kinds ? g.kinds.includes(kind) : g.name === kind)) ?? null;
}
export function callFor(kind: string, args: Record<string, unknown> = {}): { name: string; arguments: Record<string, unknown> } {
  const g = groupOf(kind);
  if (!g) return { name: kind, arguments: args };
  return g.kinds ? { name: g.name, arguments: { kind, args } } : { name: kind, arguments: args };
}
