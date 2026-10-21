/** SCRATCH: the benchmark in Chromium, at normal speed and with the CPU slowed 4x (a mid-range phone). */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const out = await build({ stdin: { contents: "import { bench } from './scratch/minpentai-stronger/bench'; (window as any).__bench = bench;", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' });
const b = await chromium.launch({ channel: 'chrome' });
for (const rate of [1, 4]) {
  const p = await b.newPage();
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.setContent(`<script>${out.outputFiles[0].text}</script>`);
  for (const l of [3, 5]) console.log(`chromium x${rate}`, JSON.stringify(await p.evaluate((lvl) => (window as any).__bench(lvl, 10), l)));
  await p.close();
}
await b.close();
