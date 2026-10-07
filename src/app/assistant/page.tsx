import { Assistant } from '~/components/assistant';
import './assistant.css';

export const metadata = { title: 'Assistant' };

/** The reading assistant, slice 1: ask about the book (docs/proposals/chat.md). */
export default function AssistantPage() {
  return (
    <div className="page">
      <Assistant />
    </div>
  );
}
