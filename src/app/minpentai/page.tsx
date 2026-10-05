import { Sandbox } from './sandbox';

export const metadata = { title: 'Minpentai sandbox' };

export default function MinpentaiPage() {
  return (
    <div className="page minpentai">
      <p className="mp-provenance">
        <strong>An unofficial reconstruction.</strong> From the book: the rule, recovered from the animated board in
        chapter 4 (figure c4-b5, the &ldquo;rotate one eighty if three&rdquo; rule), and that figure&rsquo;s opening
        frame. Invented: the 48 × 32 wrapping board, rocks, the symbol and how it is counted, the hidden side of the
        figure preset, and the glider-and-rock preset.
      </p>
      <h1>Minpentai sandbox</h1>
      <Sandbox />
      <p className="mp-note">
        How the rule was recovered, and what the book does and does not say, is written up in{' '}
        <code>docs/minpentai-rules.md</code>; the sandbox&rsquo;s own choices are in <code>docs/minpentai-sandbox.md</code>.
      </p>
    </div>
  );
}
