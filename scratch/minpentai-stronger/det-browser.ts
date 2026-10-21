/** SCRATCH: Chromium and Node play the search player's matches identically. */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { keccak256, toBytes } from 'viem';
import { digest } from './det-digest';
{
  const out = await build({ stdin: { contents: "import { digest } from './scratch/minpentai-stronger/det-digest'; (window as any).__d = digest();", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' });
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  await p.setContent(`<script>${out.outputFiles[0].text}</script>`);
  const inBrowser = await p.evaluate(() => (window as any).__d as string);
  await b.close();
  const here = digest();
  console.log(`node ${keccak256(toBytes(here)).slice(0, 18)}  chromium ${keccak256(toBytes(inBrowser)).slice(0, 18)}  ${here === inBrowser ? 'identical' : 'DIFFERENT'} (10 matches, search levels 3 and 5)`);
}
