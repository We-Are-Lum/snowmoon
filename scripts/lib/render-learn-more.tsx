/**
 * For scripts/test-challenge-moments.ts and scripts/test-voice.ts: renders the Learn more panel (LearnMoreParts) for
 * each view given as JSON on stdin ({ views: { [key]: LearnMoreView } }), and the Ephelion challenge's intro
 * (EphelionIntro, /storyboard/record), and prints { views: { [key]: html }, intro: html }. A separate process because
 * the tests run with the react-server condition, where react-dom/server isn't available.
 */
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The app's JSX is compiled by Next; here tsx compiles it to React.createElement.
(globalThis as { React?: typeof React }).React = React;
const input = JSON.parse(readFileSync(0, 'utf8')) as { views: Record<string, never> };
const { LearnMoreParts } = await import('../../src/components/challenge-learn-more');
const { EphelionIntro } = await import('../../src/components/ephelion-intro');
process.stdout.write(
  JSON.stringify({
    views: Object.fromEntries(Object.entries(input.views).map(([k, learn]) => [k, renderToStaticMarkup(React.createElement(LearnMoreParts, { learn }))])),
    intro: renderToStaticMarkup(React.createElement(EphelionIntro)),
  }),
);
