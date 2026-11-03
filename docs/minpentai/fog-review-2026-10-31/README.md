# Fog review probes, 2026-10-31

The independent reviewer's probe scripts (a separate Claude agent, Anthropic's closed model), kept as run, as text so the site's build doesn't compile them. Findings and fixes: `docs/proposals/minpentai-overnight-2026-10-31.md`, Stage 5. To run one again, copy it to a `.ts` file and run it from the repository with `npx tsx` (probe 8 needs `npm run build` and `--conditions=react-server`). They import by absolute path from the worktree they were written in.
