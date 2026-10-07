import type { Metadata } from 'next';
import { Assistant } from '~/components/assistant';
import { APP_NAME, appUrl } from '~/lib/config';
import { PAPER } from '~/lib/tokens';
import './assistant.css';

/** Cast this page's link and the button opens the assistant inside Farcaster, not the home page. */
const embed = () =>
  JSON.stringify({
    version: '1',
    imageUrl: `${appUrl()}/embed.png`,
    button: {
      // Model-drafted wording, like the rest of the assistant.
      title: 'Ask about the book',
      action: { type: 'launch_frame', name: APP_NAME, url: `${appUrl()}/assistant`, splashImageUrl: `${appUrl()}/splash.png`, splashBackgroundColor: PAPER },
    },
  });

export function generateMetadata(): Metadata {
  return { title: 'Assistant', other: { 'fc:miniapp': embed(), 'fc:frame': embed() } };
}

/** The reading assistant, slice 1: ask about the book (docs/proposals/chat.md). */
export default function AssistantPage() {
  return (
    <div className="page">
      <Assistant />
    </div>
  );
}
