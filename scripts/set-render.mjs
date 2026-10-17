// Render shots from a grey-box set: a labelled frame for the owner and a plain one (no labels) for the model.
//   node scripts/set-render.mjs <seed> <set> [shot ...]
// With --line, writes only <shot>.line.png (outlines on white). Otherwise writes images-out/preprod/set/<shot>.labelled.png and <shot>.png, and adaptations/<seed>/preprod/sets/<set>.seen.json
// (per shot: the landmarks the camera sees, and each person's screen side and facing).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// node_modules is the main checkout's (a git worktree shares it; for a plain clone it is the clone's own), or SNOWMOON_NODE_MODULES.
const MAIN = (() => { try { return path.dirname(path.resolve(ROOT, execSync('git rev-parse --git-common-dir', { cwd: ROOT }).toString().trim())); } catch { return ROOT; } })();
const NODE = process.env.SNOWMOON_NODE_MODULES || path.join(MAIN, 'node_modules');
const { chromium } = await import(path.join(NODE, 'playwright-core', 'index.mjs'));
// --depth writes <shot>.depth.png (a depth map for the depth ControlNet); --look writes <shot>.look.png (readable: textures, shadows,
// people in their clothes' colours); --empty adds .empty to the name and draws nobody (plates).
const args = process.argv.slice(2); const LINE = args.includes('--line'), DEPTH = args.includes('--depth'), LOOK = args.includes('--look'), EMPTY = args.includes('--empty');
const [seed, setName, ...only] = args.filter(a => !a.startsWith('--'));
const setDir = path.join(ROOT, 'adaptations', seed, 'preprod', 'sets');
const SET = JSON.parse(fs.readFileSync(path.join(setDir, `${setName}.json`), 'utf8'));
const out = path.join(ROOT, 'images-out', 'preprod', 'set'); fs.mkdirSync(out, { recursive: true });
const THREE_DIR = path.join(NODE, 'three');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let f;
  if (u.pathname === '/') f = path.join(ROOT, 'scripts', 'set-render.html');
  else if (u.pathname.startsWith('/three/')) f = path.join(THREE_DIR, u.pathname.slice(7));
  else if (u.pathname.startsWith('/set/')) f = path.join(setDir, path.basename(u.pathname));
  if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'text/html' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1536, height: 864 } });
p.on('pageerror', e => console.error('page error:', e.message));
const seenPath = path.join(setDir, `${setName}.seen.json`);
const seen = fs.existsSync(seenPath) ? JSON.parse(fs.readFileSync(seenPath, 'utf8')) : {};
const shotsPath = path.join(setDir, `${setName}.shots.json`);
const ALL = { ...(SET.shots || {}), ...(fs.existsSync(shotsPath) ? JSON.parse(fs.readFileSync(shotsPath, 'utf8')) : {}) };
for (const shot of (only.length ? only : Object.keys(ALL))) {
  const modes = [...(LINE ? ['line'] : []), ...(DEPTH ? ['depth'] : []), ...(LOOK ? ['look'] : [])];
  for (const mode of modes.length ? modes : ['labels', 'plain']) {
    await p.goto(`http://localhost:${port}/?set=${setName}&shot=${shot}&labels=${mode === 'labels' ? 1 : 0}&${mode}=1&empty=${EMPTY ? 1 : 0}`);
    await p.waitForFunction(() => document.title === 'done', null, { timeout: 180000 });
    await p.screenshot({ path: path.join(out, `${shot}${mode === 'labels' ? '.labelled' : mode === 'plain' ? '' : '.' + mode}${EMPTY ? '.empty' : ''}.png`) });
    if (mode === 'plain' && !EMPTY) seen[shot] = await p.evaluate(() => window.RESULT);
  }
  process.stdout.write(shot + ' ');
}
fs.writeFileSync(seenPath, JSON.stringify(seen, null, 2) + '\n');
await b.close(); server.close();
