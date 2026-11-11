/**
 * A sign-in that fails must show where the person is (2026-11-06; branch signin-error-visible). No network: the
 * browser's storage and the callback route are stand-ins.
 *
 *   npm run test:signin-error
 *
 * - finishBlueskySignIn (src/lib/social/client.ts): Bluesky's own refusal (?error=…) says Bluesky didn't sign you in
 *   (not Lens's "The signature was declined."); a sign-in started elsewhere says so; the server's error is passed on.
 * - The return page (src/app/sign-in/bluesky/finish.tsx) shows the error in an alert, then every way to sign in that
 *   is on, so trying again is one tap; the rail and the menu don't repeat them there (src/components/app-shell.tsx).
 * Each is also proven to fail on a planted fault.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = '') => (ok ? passed++ : failures.push(`${label}${detail ? `: ${detail}` : ''}`));
const proof = (label: string, caught: boolean) => check(`proof: ${label}`, caught, 'the planted fault was not caught');

// A stand-in browser: sessionStorage and the callback route.
const store = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage;
let callback: () => Response = () => new Response(JSON.stringify({ error: 'That sign-in didn’t check out.' }), { status: 400 });
globalThis.fetch = (async () => callback()) as typeof fetch;

// The app's components use the automatic JSX runtime under Next; tsx compiles them with React in scope.
(globalThis as unknown as { React: typeof React }).React = React;
const C = await import('../src/lib/social/client');
const run = async (q: string) => C.finishBlueskySignIn(new URLSearchParams(q)).then(() => 'ok', (e: Error) => e.message);

store.set('snowmoon.bluesky.pending', 'sealed');
const declined = await run('error=access_denied&state=x');
check('Bluesky\'s refusal says Bluesky didn\'t sign you in', declined === C.SOCIAL_WORDING.blueskyDeclined && /Bluesky didn’t sign you in/.test(declined), declined);
proof('Lens\'s "signature was declined" for a Bluesky refusal is caught', declined !== C.SOCIAL_WORDING.declined);
const lost = await run('code=c&state=s');
check('a sign-in started in another tab says so', lost === C.SOCIAL_WORDING.blueskyLost, lost);
store.set('snowmoon.bluesky.pending', 'sealed');
const server = await run('code=c&state=s&iss=https://bsky.social');
check('the server\'s refusal is passed on', server === 'That sign-in didn’t check out.', server);
store.set('snowmoon.bluesky.pending', 'sealed');
callback = () => new Response('not json', { status: 502 });
check('a server that doesn\'t answer says "Try again in a moment"', (await run('code=c&state=s')) === C.SOCIAL_WORDING.server);

// The return page: the error in an alert, then the ways to sign in.
const F = await import('../src/app/sign-in/bluesky/finish');
const html = renderToStaticMarkup(createElement(F.BlueskyFinishView, { state: { kind: 'error', message: C.SOCIAL_WORDING.blueskyDeclined } }));
const alertAt = html.indexOf('role="alert"');
const choicesAt = html.indexOf('signin-choices');
check('the error is shown first, in an alert, with the message', alertAt >= 0 && html.includes('Bluesky didn’t sign you in') && html.includes(F.FINISH_WORDING.failed), html.slice(0, 300));
check('the ways to sign in come right under it ("Try again:")', choicesAt > alertAt && html.includes(F.FINISH_WORDING.again) && /Sign in with Bluesky/.test(html), html.slice(0, 600));
const working = renderToStaticMarkup(createElement(F.BlueskyFinishView, { state: { kind: 'working' } }));
proof('a page that shows only "working" has no error to see', !working.includes('role="alert"'));
const shell = readFileSync(path.join(ROOT, 'src/components/app-shell.tsx'), 'utf8');
check('the rail and the menu don\'t repeat the ways to sign in on the return page', /const onYou = path === '\/you' \|\| path === '\/sign-in\/bluesky';/.test(shell) && /if \(name === null && onYou\) return null;/.test(shell));

if (failures.length) {
  console.error(`SIGN-IN ERROR TESTS FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`test:signin-error: ${passed} passed, 0 failed`);
