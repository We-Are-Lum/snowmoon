/**
 * check:principles P1c's rule, shared with scripts/test-publish-style.ts so the test runs the very same rule on a local
 * database: every version of a published element has a recipe. A style or character sheet (element_type 'design') keeps
 * a recipe inside its body for each of its pictures (samples, views) rather than a recipe_id (owner, 2026-10-14): it
 * passes only when it has at least one picture and every picture's recipe names its prompt and model. Anything else
 * needs recipe_id.
 */
export type P1cRow = { id: string; recipe_id: string | null; element_type: string; body: unknown };

export function p1cProblems(rows: readonly P1cRow[]): string[] {
  const pictures = (body: unknown) => {
    const b = (body ?? {}) as { samples?: unknown; views?: unknown };
    const views = b.views && typeof b.views === 'object' ? Object.values(b.views as Record<string, unknown>) : [];
    return [...(Array.isArray(b.samples) ? b.samples : []), ...views] as { recipe?: { prompt?: string; model?: string } }[];
  };
  const inBody = (r: P1cRow) => {
    const ps = pictures(r.body);
    return r.element_type === 'design' && ps.length > 0 && ps.every((p) => !!p?.recipe?.prompt && !!p?.recipe?.model);
  };
  return rows.filter((r) => !r.recipe_id && !inBody(r)).map((r) => `version ${r.id} has no recipe`);
}
