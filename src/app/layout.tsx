import type { Metadata, Viewport } from 'next';
import { Crimson_Pro, DM_Mono, Instrument_Sans } from 'next/font/google';
import { MiniappBar } from '~/components/miniapp-bar';
import { SideRail } from '~/components/side-rail';
import { AssistantColumn } from '~/components/assistant-column';
import { chapterDateline, chapterNumbers, loadChapter } from '~/lib/book';
import { WhatIsThis } from '~/components/first-visit';
import { loadIntro } from '~/lib/intro';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER, PAPER_DARK } from '~/lib/tokens';
import '../styles/tokens.css';
import './globals.css';

const url = appUrl();

/** The only two families in app chrome. In-world templates may use others, inside the template only. */
const crimson = Crimson_Pro({ subsets: ['latin'], weight: ['400', '500', '600'], style: ['normal', 'italic'], variable: '--font-reading' });
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-label' });
/** Veridian devices only (templates in src/templates/veridia-*). Not preloaded: most pages have none. */
const instrument = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-veridia', preload: false });

/** Embed shown when the app URL is cast. */
const miniappEmbed = JSON.stringify({
  version: '1',
  imageUrl: `${url}/embed.png`, // 3:2
  button: {
    title: 'Read Snowmoon',
    // The spec lists launch_frame and view_token as the action types.
    action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${url}/splash.png`, splashBackgroundColor: PAPER },
  },
});

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Snowmoon by Vitalik Buterin (GPL v3), read and illustrated in the open.',
  other: { 'fc:miniapp': miniappEmbed, 'fc:frame': miniappEmbed },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: PAPER },
    { media: '(prefers-color-scheme: dark)', color: PAPER_DARK },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${crimson.variable} ${dmMono.variable} ${instrument.variable}`}>
      <body>
        <MiniappBar />
        {/* Phone widths and the Farcaster frame: the page alone. Wider: a rail, and the assistant when signed in. */}
        <div className="shell">
          <SideRail chapters={chapterNumbers().map((n) => ({ n, dateline: chapterDateline(loadChapter(n)!) }))} />
          <div className="shell-main">
            <WhatIsThis intro={loadIntro()} />
            <main>{children}</main>
          </div>
          <AssistantColumn />
        </div>
      </body>
    </html>
  );
}
