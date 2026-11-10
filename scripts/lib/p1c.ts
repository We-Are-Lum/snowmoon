/**
 * check:principles P1c's rule, shared with scripts/test-publish-style.ts so the test runs the very same rule on a local
 * database: every version of a published element has a recipe. A style or character sheet (element_type 'design') keeps
 * a recipe inside its body for each of its pictures (samples, views) rather than a recipe_id (owner, 2026-10-14): it
 * passes only when it has at least one picture and every picture's recipe names its prompt and model. Anything else
 * needs recipe_id.
 *
 * One narrow exception (owner, 2026-11-10, option a; docs/principles.md P1): a published STYLE version with no pictures
 * at all passes only when a LATER version of the same style element has samples, every one with its recipe. The latest
 * version of every style must always have samples with recipes (no exception). A version with pictures whose recipe is
 * missing always fails. Sheets (characters, places) are unchanged.
 */
export type P1cRow = {
  id: string;
  recipe_id: string | null;
  element_type: string;
  body: unknown;
  /** The design's element, version number and entity kind ('style', 'character', 'location'), for the exception. */
  element_id?: string;
  version_no?: number;
  kind?: string | null;
};

const picturesOf = (body: unknown) => {
  const b = (body ?? {}) as { samples?: unknown; views?: unknown };
  const views = b.views && typeof b.views === 'object' ? Object.values(b.views as Record<string, unknown>) : [];
  return [...(Array.isArray(b.samples) ? b.samples : []), ...views] as { recipe?: { prompt?: string; model?: string } }[];
};
const allRecipes = (body: unknown) => {
  const ps = picturesOf(body);
  return ps.length > 0 && ps.every((p) => !!p?.recipe?.prompt && !!p?.recipe?.model);
};
const samplesWithRecipes = (body: unknown) => {
  const s = (body ?? {}) as { samples?: unknown };
  return Array.isArray(s.samples) && s.samples.length > 0 && allRecipes(body);
};

export function p1cProblems(rows: readonly P1cRow[]): string[] {
  // Each style element's versions, to find the later ones and the latest.
  const styleVersions = new Map<string, P1cRow[]>();
  for (const r of rows) if (r.element_type === 'design' && r.kind === 'style' && r.element_id) styleVersions.set(r.element_id, [...(styleVersions.get(r.element_id) ?? []), r]);
  const ok = (r: P1cRow): boolean => {
    if (r.element_type !== 'design') return !!r.recipe_id;
    if (allRecipes(r.body)) return true;
    // The exception: a style version with no pictures at all, superseded by a later one with samples and their recipes.
    if (r.kind !== 'style' || !r.element_id || typeof r.version_no !== 'number' || picturesOf(r.body).length > 0) return false;
    const later = (styleVersions.get(r.element_id) ?? []).filter((v) => typeof v.version_no === 'number' && v.version_no > r.version_no!);
    return later.some((v) => samplesWithRecipes(v.body));
  };
  const problems = rows.filter((r) => !ok(r)).map((r) => `version ${r.id} has no recipe`);
  // The latest version of every style must have samples with recipes, whatever came before.
  for (const [el, vs] of styleVersions) {
    const latest = vs.reduce((a, b) => ((b.version_no ?? 0) > (a.version_no ?? 0) ? b : a));
    if (!samplesWithRecipes(latest.body) && !problems.includes(`version ${latest.id} has no recipe`)) problems.push(`version ${latest.id} (the latest of style ${el}) has no samples with recipes`);
  }
  return problems;
}
