import type { Metadata, Viewport } from 'next';
import { MiniappBar } from '~/components/miniapp-bar';
import { APP_NAME, appUrl } from '~/lib/config';
import './globals.css';

const url = appUrl();

/** Embed shown when the app URL is cast. */
const miniappEmbed = JSON.stringify({
  version: '1',
  imageUrl: `${url}/embed.png`, // 3:2
  button: {
    title: 'Read Snowmoon',
    // The spec lists launch_frame and view_token as the action types.
    action: { type: 'launch_frame', name: APP_NAME, url, splashImageUrl: `${url}/splash.png`, splashBackgroundColor: '#f4f1ea' },
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
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#16151a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MiniappBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
