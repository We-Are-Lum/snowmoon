/**
 * For scripts/test-challenge.ts: renders "Posted on" (PostedOn) and the share buttons (ChallengeShare) for the input
 * given as JSON on stdin ({ versionId, posts }) and prints { postedOn, share } as JSON. A separate process because the
 * test runs with the react-server condition (for the server code), where react-dom/server isn't available.
 */
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The app's JSX is compiled by Next; here tsx compiles it to React.createElement.
(globalThis as { React?: typeof React }).React = React;
const input = JSON.parse(readFileSync(0, 'utf8')) as { versionId: string; posts: never[] };
const { PostedOn } = await import('../../src/components/posted-on');
const { ChallengeShare } = await import('../../src/components/challenge-share');
process.stdout.write(
  JSON.stringify({
    postedOn: renderToStaticMarkup(React.createElement(PostedOn, { versionId: input.versionId, posts: input.posts })),
    share: renderToStaticMarkup(React.createElement(ChallengeShare, { versionId: input.versionId, what: 'Bai', posts: true })),
  }),
);
