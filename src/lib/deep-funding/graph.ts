/**
 * The deep funding test's credit graph (docs/proposals/deep-funding-runner.md; the plan's "Deep funding test"), as pure
 * functions over rows already read from the database, so scripts/test-deep-funding.ts can prove it on stand-ins.
 *
 * How forks and uses are stored (src/lib/images/designs.ts, supabase/migrations/0001):
 * - a character sheet is a studio.elements row (element_type 'design') with element_versions; a fork is a new design
 *   whose first version has a 'remixed_from' link (studio.links, append-only) to the version it came from;
 * - a version can also have 'uses' links to other versions. The owner's final version credits several entries: one
 *   'remixed_from' plus extra 'uses' links to other design versions (the plan: "a small interface and server change,
 *   not a migration").
 *
 * The graph, for one character:
 * - the outcome is the owner's final version;
 * - a version's parents are the design versions it links to itself ('remixed_from' first, then 'uses'); if it has no
 *   'remixed_from' of its own (a later version of a fork), its design's first version's 'remixed_from' is added, so a
 *   fork's later versions still credit what the fork came from. A design that was never forked from anything (an
 *   original sheet) has the book as its parent;
 * - the book is the root and has no parents.
 * Links to anything that isn't a design version (an image, say) are not credit and are left out. A cycle is refused.
 */

export const BOOK = 'book' as const;

export interface VersionRow {
  id: string;
  elementId: string;
  elementType: string;
  versionNo: number;
  /** The record's maker: a FID (sheets are made with Farcaster only). */
  makerFid: number;
  /** The entity's name (for a sheet, the character's name) and kind. */
  entity: string;
  entityKind: string;
  /** 'published', 'draft' or 'hidden' (the design's status). */
  status: string;
  /** The version's body (DesignBody for a sheet); read loosely. */
  body: unknown;
  createdAt: string;
}

export interface LinkRow {
  from: string;
  to: string;
  kind: 'remixed_from' | 'uses';
}

/** studio.challenge_eligibility, decided once at publish (NEXT_remix_challenge.sql). */
export interface EligibilityRow {
  versionId: string;
  fid: number;
  decision: 'admin' | 'invited' | 'score' | 'below' | 'unchecked';
  eligible: boolean;
}

export interface NodeView {
  view: 'front' | 'side' | 'back' | 'sample';
  url: string;
  /** The recipe of that picture: the exact prompt, the model and where it ran. */
  prompt: string;
  model: string;
  host: string;
}

export interface GraphNode {
  id: string;
  kind: 'book' | 'version';
  /** Null for the book. */
  makerFid: number | null;
  versionNo: number | null;
  elementId: string | null;
  /** From the stored eligibility (never looked up here). */
  eligible: boolean;
  admin: boolean;
  /** Why it is (not) eligible: 'eligible', 'admin', 'below', 'unchecked', 'no-decision' (no stored row) or 'not-published'. */
  standing: 'eligible' | 'admin' | 'below' | 'unchecked' | 'no-decision' | 'not-published' | 'book';
  isFinal: boolean;
  /** The maker's own words: the sheet's title and text; `drafted` lists what a model drafted (body.assist), if anything. */
  words: { title: string; text: string; drafted: string[] };
  /** The pictures and each one's recipe. */
  views: NodeView[];
  /** Parent node ids, in credit order. */
  parents: string[];
}

export interface GraphEdge {
  /** The child (the newer work). */
  from: string;
  /** The parent (what it was built on). */
  to: string;
  /** 'remixed_from' or 'uses' as stored; 'fork-origin' when inherited from the design's first version; 'book' to the root. */
  kind: 'remixed_from' | 'uses' | 'fork-origin' | 'book';
}

export interface CreditGraph {
  character: string;
  final: string;
  /** In walk order: the final first, the book last. */
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphError extends Error {}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function wordsOf(body: unknown): GraphNode['words'] {
  const b = (body ?? {}) as { title?: unknown; text?: unknown; description?: unknown; assist?: { drafted?: unknown } | null };
  const drafted = Array.isArray(b.assist?.drafted) ? (b.assist!.drafted as unknown[]).map(String) : [];
  return { title: str(b.title), text: str(b.text) || str(b.description), drafted };
}

function viewsOf(body: unknown): NodeView[] {
  const b = (body ?? {}) as { views?: Record<string, unknown>; samples?: unknown[] };
  const out: NodeView[] = [];
  const pic = (view: NodeView['view'], p: unknown) => {
    const q = (p ?? {}) as { url?: unknown; recipe?: { prompt?: unknown; model?: unknown; host?: unknown } };
    if (typeof q.url !== 'string' || !q.url) return;
    out.push({ view, url: q.url, prompt: str(q.recipe?.prompt), model: str(q.recipe?.model), host: str(q.recipe?.host) });
  };
  for (const v of ['front', 'side', 'back'] as const) pic(v, b.views?.[v]);
  if (!out.length) for (const s of b.samples ?? []) pic('sample', s);
  return out;
}

/**
 * Builds the credit graph for one character from rows: every version that may be reached (`versions`), every link
 * from them (`links`), and the stored eligibility. `admins` are never eligible (their credit goes to the Lake).
 */
export function buildGraph(input: {
  character: string;
  final: string;
  versions: VersionRow[];
  links: LinkRow[];
  eligibility: EligibilityRow[];
  admins: readonly number[];
}): CreditGraph {
  const byId = new Map(input.versions.map((v) => [v.id, v]));
  const firstOf = new Map<string, VersionRow>();
  for (const v of input.versions) if (v.versionNo === 1) firstOf.set(v.elementId, v);
  const elig = new Map(input.eligibility.map((e) => [e.versionId, e]));
  const isDesign = (id: string) => byId.get(id)?.elementType === 'design';

  const final = byId.get(input.final);
  if (!final || final.elementType !== 'design') throw new GraphError(`the final version ${input.final} is not a design version in the rows given`);

  const linksFrom = (id: string) =>
    input.links.filter((l) => {
      if (l.from !== id) return false;
      if (!byId.has(l.to)) throw new GraphError(`version ${id} links to ${l.to}, which is not in the rows given`);
      return true;
    });
  const parentsOf = (v: VersionRow): { to: string; kind: GraphEdge['kind'] }[] => {
    const own = linksFrom(v.id).filter((l) => isDesign(l.to));
    const remix = own.filter((l) => l.kind === 'remixed_from').sort((a, b) => a.to.localeCompare(b.to));
    const uses = own.filter((l) => l.kind === 'uses').sort((a, b) => a.to.localeCompare(b.to));
    const out: { to: string; kind: GraphEdge['kind'] }[] = [...remix, ...uses].map((l) => ({ to: l.to, kind: l.kind }));
    if (!remix.length) {
      const first = firstOf.get(v.elementId);
      const origin = first && first.id !== v.id ? linksFrom(first.id).find((l) => l.kind === 'remixed_from' && isDesign(l.to)) : undefined;
      if (origin) out.unshift({ to: origin.to, kind: 'fork-origin' });
      else if (first === undefined && v.versionNo !== 1) throw new GraphError(`version ${v.id}: its design's first version is not in the rows given`);
    }
    const seen = new Set<string>();
    const dedup = out.filter((p) => p.to !== v.id && !seen.has(p.to) && seen.add(p.to));
    return dedup.length ? dedup : [{ to: BOOK, kind: 'book' }];
  };

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const onPath = new Set<string>();
  const visit = (id: string) => {
    if (onPath.has(id)) throw new GraphError(`a cycle through ${id}`);
    if (nodes.has(id)) return;
    const v = byId.get(id);
    if (!v) throw new GraphError(`version ${id} is linked to but not in the rows given`);
    onPath.add(id);
    const ps = parentsOf(v);
    const e = elig.get(id);
    const admin = input.admins.includes(v.makerFid);
    const published = v.status === 'published';
    const standing: GraphNode['standing'] = !published ? 'not-published' : admin ? 'admin' : !e ? 'no-decision' : e.eligible && e.fid === v.makerFid ? 'eligible' : e.decision === 'below' ? 'below' : e.decision === 'admin' ? 'admin' : 'unchecked';
    nodes.set(id, {
      id,
      kind: 'version',
      makerFid: v.makerFid,
      versionNo: v.versionNo,
      elementId: v.elementId,
      eligible: standing === 'eligible',
      admin,
      standing,
      isFinal: id === input.final,
      words: wordsOf(v.body),
      views: viewsOf(v.body),
      parents: ps.map((p) => p.to),
    });
    for (const p of ps) {
      edges.push({ from: id, to: p.to, kind: p.kind });
      if (p.to !== BOOK) visit(p.to);
    }
    onPath.delete(id);
  };
  visit(input.final);
  nodes.set(BOOK, { id: BOOK, kind: 'book', makerFid: null, versionNo: null, elementId: null, eligible: false, admin: false, standing: 'book', isFinal: false, words: { title: '', text: '', drafted: [] }, views: [], parents: [] });
  return { character: input.character, final: input.final, nodes: [...nodes.values()], edges };
}

export const nodeOf = (g: CreditGraph, id: string) => {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new GraphError(`no node ${id}`);
  return n;
};

/** The nodes the models are asked about: every version (the book has no question). */
export const askedNodes = (g: CreditGraph) => g.nodes.filter((n) => n.kind === 'version');

/** The FIDs that made any version in the graph (they can't be jurors for it). */
export const makersIn = (g: CreditGraph) => new Set(g.nodes.flatMap((n) => (n.makerFid === null ? [] : [n.makerFid])));
