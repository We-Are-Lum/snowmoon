/**
 * For scripts/test-challenge.ts: renders "Published, not entered yet" (ChallengeNotEntered) on the server, as a cached
 * /challenge/entries would carry it, for the input given as JSON on stdin ({ all, w }), and prints { html } as JSON.
 * A separate process because the test runs with the react-server condition, where react-dom/server isn't available.
 */
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as { React?: typeof React }).React = React;
const input = JSON.parse(readFileSync(0, 'utf8')) as { all: never[]; w: never };
const { ChallengeNotEntered } = await import('../../src/components/challenge-not-entered');
process.stdout.write(JSON.stringify({ html: renderToStaticMarkup(React.createElement(ChallengeNotEntered, { all: input.all, w: input.w })) }));
