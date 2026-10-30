/**
 * For scripts/test-social-read.ts: renders "Posts that link here" (SocialPostsView) for the posts given as JSON on
 * stdin and prints the HTML. A separate process because the test runs with the react-server condition (for the
 * server code), where react-dom/server isn't available.
 */
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The app's JSX is compiled by Next; here tsx compiles it to React.createElement.
(globalThis as { React?: typeof React }).React = React;
const { SocialPostsView } = await import('../../src/components/social-posts-view');
process.stdout.write(renderToStaticMarkup(React.createElement(SocialPostsView, { posts: JSON.parse(readFileSync(0, 'utf8')) })));
