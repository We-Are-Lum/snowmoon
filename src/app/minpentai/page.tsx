import { Sandbox } from './sandbox';

export const metadata = { title: 'Minpentai sandbox' };

export default function MinpentaiPage() {
  return (
    <div className="page minpentai">
      <p className="mp-provenance">
        <strong>An unofficial reconstruction.</strong> The rule and the chapter 4 board come from the book; anything
        marked <em>invented</em> does not.
      </p>
      <h1>Minpentai sandbox</h1>
      <Sandbox />
      <p className="mp-note">
        From the book: the rule, recovered from the animated board in chapter 4 (figure c4-b5, the &ldquo;rotate one
        eighty if three&rdquo; rule), and that figure&rsquo;s opening frame. Invented: the 48 × 32 wrapping board,
        rocks, the symbol and how it is counted, the hidden side of the figure preset, and the glider-and-rock preset.
        How the rule was recovered is written up in <code>docs/minpentai-rules.md</code>; the sandbox&rsquo;s own
        choices are in <code>docs/minpentai-sandbox.md</code>.
      </p>
    </div>
  );
}
