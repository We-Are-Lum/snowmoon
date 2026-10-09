/**
 * Publishes the project's starting style, "Techno vistas" (content/snowmoon/designs/styles/techno-vistas.json),
 * as a design (step 4, docs/proposals/style-guides-and-sheets.md, decision 13 of 2026-10-09): under
 * FID 6786 as the maintainer, labelled the maintainer's, its text declared model-drafted (the coding
 * agent, a closed model). Once it exists the composer's file option retires and it is a style like
 * any other (it sorts by date and use, never first by rule).
 *
 * Runs at merge time, after the owner's go. A dry run unless --apply:
 *
 *   npm run seed:designs                               show what would be written
 *   npm run seed:designs -- --apply [--name=<username>] write it (the maintainer)
 *
 * The per-setting lines in the file are not included: a design's text is one fixed string, shown in full.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const MAINTAINER_FID = 6786;
const apply = process.argv.includes('--apply');
const name = process.argv.find((a) => a.startsWith('--name='))?.slice(7) || null;
const { STARTING_STYLE_FILE, seedStartingStyle } = await import('../src/lib/images/designs');
const style = JSON.parse(readFileSync(path.join(process.cwd(), STARTING_STYLE_FILE), 'utf8')) as { name: string; prompt: string };
console.log(`style "${style.name}" by FID ${MAINTAINER_FID} (maintainer${name ? `, @${name}` : ''}), ${style.prompt.length} characters, text drafted by the coding agent`);
if (!apply) {
  console.log('Dry run: nothing written. Run with --apply at merge time, after the owner\'s go.');
  process.exit(0);
}
const url = process.env.STUDIO_DATABASE_URL;
if (!url) throw new Error('STUDIO_DATABASE_URL is not set');
const sql = postgres(url, { prepare: false, max: 1 });
const out = await seedStartingStyle(sql as never, { fid: MAINTAINER_FID, byName: name, text: style.prompt, title: style.name });
console.log('exists' in out ? 'Already published as a design; nothing written.' : `published: /images/designs/${out.versionId}`);
await sql.end();
