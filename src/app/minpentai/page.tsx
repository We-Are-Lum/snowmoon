import { MinpentaiApp } from './minpentai-app';

export const metadata = { title: 'Minpentai' };

/** Learn and Free play (minpentai-app.tsx). The sandbox (sandbox.tsx) is kept in the repo, out of the page. */
export default function MinpentaiPage() {
  return (
    <div className="page minpentai">
      <MinpentaiApp />
    </div>
  );
}
