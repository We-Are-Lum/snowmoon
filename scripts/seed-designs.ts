/**
 * Publishes the project's starting style, "Techno vistas" (content/snowmoon/designs/styles/techno-vistas.json),
 * as a design (step 4, docs/proposals/style-guides-and-sheets.md), so readers can fork it and images
 * can say they used it. NOT RUN: whether to do this, and under which FID, is an owner decision
 * (decision 13 in the proposal). It refuses to write unless given --apply.
 *
 *   npm run seed:designs                 show what would be written
 *   npm run seed:designs -- --apply      write it (the maintainer, after the owner says so)
 *
 * The style text was drafted by the coding agent (a closed model), so the design records that in
 * its body (assist), and its page says so. The per-setting lines in the file are not included: a
 * design's text is one fixed string, shown in full.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { SYSTEM_FID, WORK_ID } from '../src/lib/config';

const apply = process.argv.includes('--apply');
const file = 'content/snowmoon/designs/styles/techno-vistas.json';
const style = JSON.parse(readFileSync(path.join(process.cwd(), file), 'utf8')) as { name: string; prompt: string };
const body = {
  title: style.name,
  text: style.prompt,
  samples: [],
  views: {},
  by_name: null,
  by_name_source: null,
  assist: { model: 'claude-coding-agent', drafted: ['style text'], source: file },
};
console.log(`style "${style.name}" by FID ${SYSTEM_FID}, ${style.prompt.length} characters, assist: coding agent`);
if (!apply) {
  console.log('Not written. Run with --apply once the owner has decided (proposal, decision 13).');
  process.exit(0);
}
const url = process.env.STUDIO_DATABASE_URL;
if (!url) throw new Error('STUDIO_DATABASE_URL is not set');
const sql = postgres(url, { prepare: false, max: 1 });
await sql.begin(async (tx) => {
  const [have] = await tx`select id from studio.entities where work_id = ${WORK_ID} and kind = 'style' and lower(name) = lower(${style.name})`;
  if (have) throw new Error(`a style named ${style.name} exists already`);
  const [en] = await tx`insert into studio.entities ${tx({ work_id: WORK_ID, kind: 'style', name: style.name })} returning id`;
  const [el] = await tx`insert into studio.elements ${tx({ work_id: WORK_ID, element_type: 'design', entity_id: en.id, created_by_fid: SYSTEM_FID })} returning id`;
  const [v] = await tx`insert into studio.element_versions ${tx({ element_id: el.id, version_no: 1, body: tx.json(body as never) })} returning id`;
  console.log(`published: /images/designs/${v.id}`);
});
await sql.end();
