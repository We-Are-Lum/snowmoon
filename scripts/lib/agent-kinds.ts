export type Listed = { name: string; title?: string; description?: string; annotations: Record<string, unknown>; inputSchema: Record<string, unknown> & { properties?: Record<string, unknown> } };
/** A served kind, as the old per-tool list showed it: its own name, schema and description, its group's hints. */
export type KindListed = Listed & { group: string };
/**
 * tools/list as one entry per kind (owner, 2026-11-04): a grouped tool's kinds are the branches of args.anyOf, each
 * titled with its kind; a tool on its own is itself. The old tests' list checks run on this.
 */
export function kindsOf(tools: Listed[] | undefined): KindListed[] {
  return (tools ?? []).flatMap((t): KindListed[] => {
    const p = t.inputSchema?.properties as { kind?: { enum?: string[] }; args?: { anyOf?: (Record<string, unknown> & { title: string; description?: string })[] } } | undefined;
    if (!p?.kind?.enum || !p.args?.anyOf) return [{ ...t, group: t.name }];
    return p.args.anyOf.map((b) => ({ name: b.title, title: b.title, description: b.description, annotations: t.annotations, inputSchema: b, group: t.name }));
  });
}
