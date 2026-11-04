/**
 * The live match page's layout check (scripts/lib/live-layout.ts), on its own: run in server mode (it starts a local
 * stage with the agent-play code), printing one JSON line with the problems found. check:ui runs it as a child process.
 *   npx tsx --conditions=react-server scripts/check-live-layout.ts
 */
import { chromium } from 'playwright-core';
import { liveLayoutCheck } from './lib/live-layout';

const fails: string[] = [];
const browser = await chromium.launch({ channel: 'chrome' });
try { await liveLayoutCheck(browser, (m) => fails.push(m)); }
catch (e) { console.error(e); fails.push(`live page layout broke: ${String((e as Error)?.message ?? e).split("\n")[0]}`); }
finally { await browser.close(); }
console.log(`LIVE_LAYOUT ${JSON.stringify(fails)}`);
process.exit(0);
