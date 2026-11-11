/**
 * The assistant panel on the remix challenge's pages (owner, 2026-11-10): closed at load, one tap opens it; opened on a
 * challenge page, it starts open there again on this device; closed there, it starts closed again. Elsewhere unchanged
 * (Minpentai closed and not remembered; every other page open unless closed). The browser side is check:ui
 * (checkChallengeLive, at 390 and 1440). Each check runs on the real code and on a planted violation, which it must catch.
 *
 *   npm run test:panel
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { CHALLENGE_PANEL_KEY, challengePanelOpen, isChallengePath } from '../src/lib/panel';

const ROOT = path.resolve(import.meta.dirname, '..');
const shell = readFileSync(path.join(ROOT, 'src/components/app-shell.tsx'), 'utf8');
let passed = 0;
const failed: string[] = [];
const need = (ok: boolean, what: string) => (ok ? [] : [what]);
function proven(name: string, real: string[], planted: string[]) {
  const ok = real.length === 0 && planted.length > 0;
  if (ok) passed++;
  else failed.push(`${name}: ${real.length ? `real: ${real.join('; ')}` : 'the planted violation was not caught'}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${real.length ? ` (${real.join('; ')})` : ''}${planted.length ? '' : ' (plant not caught)'}`);
}

// T1: which pages are the challenge's.
const CHALLENGE = ['/challenge', '/challenge/zei', '/challenge/make', '/challenge/make/0f0e', '/challenge/rules', '/challenge/entries', '/challenge/remixes', '/challenge/p/abc'];
const OTHER = ['/', '/chapter/1', '/minpentai', '/assistant', '/challenges', '/challenger/x', '/references', '/you'];
const pages = (f: typeof isChallengePath) => [...CHALLENGE.filter((p) => !f(p)).map((p) => `${p} isn't a challenge page`), ...OTHER.filter((p) => f(p)).map((p) => `${p} is taken for a challenge page`)];
proven('T1 the challenge\'s pages are /challenge and everything under it, and nothing else', pages(isChallengePath), pages((p) => p.startsWith('/challenge')));

// T2: the device's memory: open only once opened there.
const memory = (f: typeof challengePanelOpen) => [...need(f(null) === false, 'no memory: open'), ...need(f('open') === true, 'opened before: closed'), ...need(f('closed') === false && f('') === false, 'another value: open')];
proven('T2 on a challenge page the panel starts closed, and open only when the person opened it there before on this device', memory(challengePanelOpen), memory((s) => s !== 'closed'));

// T3: the shell: closed by default there, opening remembers, closing forgets; Minpentai and the rest unchanged.
const wiring = (src: string) => [
  ...need(/const \[chPanel, setChPanel\] = useState\(false\);/.test(src), 'the challenge panel does not start closed'),
  ...need(/setChPanel\(challengePanelOpen\(localStorage\.getItem\(CHALLENGE_PANEL_KEY\)\)\)/.test(src), 'the device\'s memory is not read'),
  ...need(/const showPanel = \(onMp \? mpPanel : onChallenge \? chPanel : panel\) && !path\.startsWith\('\/assistant'\);/.test(src), 'the challenge pages don\'t use their own state'),
  ...need(/onChallenge \? \(setChPanel\(true\), remember\(CHALLENGE_PANEL_KEY, 'open'\)\)/.test(src) && /onChallenge \? \(setChPanel\(false\), remember\(CHALLENGE_PANEL_KEY, null\)\)/.test(src), 'opening there isn\'t remembered, or closing there doesn\'t forget'),
  ...need(/const \[mpPanel, setMpPanel\] = useState\(false\);/.test(src) && /const \[panel, setPanel\] = useState\(true\);/.test(src) && /setPanel\(localStorage\.getItem\('snowmoon\.panel'\) !== 'closed'\);/.test(src), 'Minpentai or the other pages changed'),
  ...need(CHALLENGE_PANEL_KEY === 'snowmoon.panel.challenge', 'the key'),
];
proven('T3 the shell: closed by default on the challenge\'s pages, opening there remembered, closing there forgets; Minpentai and every other page unchanged', wiring(shell), wiring(shell.replace('const [chPanel, setChPanel] = useState(false);', 'const [chPanel, setChPanel] = useState(true);')));

console.log(`\ntest:panel: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
