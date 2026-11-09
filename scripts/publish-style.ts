/**
 * Publish the bases' style, "Animated series" (owner, 2026-11-09), so a remix starts in its base's own look
 * (src/lib/challenge/pictures.ts sourceOf: a base whose front recipe records this style's text starts on it). One style
 * of FID 6786's, the maintainer, with its text word for word (src/lib/challenge/base-style.ts) and no sample pictures.
 * Written by the coding agent (Claude, a closed model by Anthropic), branch challenge-models. DRAFT.
 *
 * Runs ONLY on the owner's machine, with his own env file (.env.local), which agents never read. Dry run first:
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env.local scripts/publish-style.ts
 *   npx tsx --conditions=react-server --env-file-if-exists=.env.local scripts/publish-style.ts --apply --confirm-owner-go
 *
 * The dry run reads in one read-only transaction and prints: whether the style is already published (and with the same
 * text), the body it would write, and for each base in CHALLENGE.bases whether its front records this text (those start
 * on the style once it is published). --apply refuses without --confirm-owner-go, and when a style named "Animated
 * series" already exists (it never writes twice). Options: --db=<url> (a local test database), --name=<byline>.
 */
import postgres from 'postgres';
import { BASE_STYLE } from '../src/lib/challenge/base-style';
import { applyStyle, planStyle } from './lib/publish-style';

const arg = (k: string) => {
  const a = process.argv.findLast((x) => x === `--${k}` || x.startsWith(`--${k}=`));
  return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : '') : null;
};
const has = (k: string) => process.argv.includes(`--${k}`);
const APPLY = has('apply');
const url = arg('db') || process.env.STUDIO_DATABASE_URL;
if (!url) { console.error('No database: set STUDIO_DATABASE_URL or --db. Nothing done.'); process.exit(2); }
const say = (s = '') => console.log(s);
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const finish = async (code: number) => { await sql.end(); process.exit(code); };

say(`publish-style: ${APPLY ? 'APPLY' : 'DRY RUN (reads only; nothing written)'}; database ${new URL(url).hostname}`);
const plan = await sql.begin('read only', (tx) => planStyle(tx));
say(`style "${BASE_STYLE.title}": ${plan.exists ? `already published, version ${plan.exists.versionId} (element ${plan.exists.elementId}), ${plan.exists.sameText ? 'same text' : 'DIFFERENT TEXT'}` : plan.nameTaken ? 'the name is taken by a style that is not published' : 'not published yet'}`);
say(`text (${BASE_STYLE.source}): ${BASE_STYLE.text}`);
say(`body: ${JSON.stringify(plan.body)}`);
for (const b of plan.bases) say(`  base ${b.character} ${b.versionId}: ${b.matches === null ? 'not found in this database' : b.matches ? 'its front records this style: starts on it' : 'its front records another style (or none): unchanged'}`);
if (!APPLY) { say('Dry run: nothing written.'); await finish(0); }
if (!has('confirm-owner-go')) { say('Refusing --apply without --confirm-owner-go. Nothing done.'); await finish(3); }
if (plan.exists || plan.nameTaken) { say('Refusing --apply: a style with this name already exists. Nothing done.'); await finish(3); }
const out = await applyStyle(sql, arg('name') || 'naaate');
say(`published: version ${out.versionId} (element ${out.elementId})`);
await finish(0);
