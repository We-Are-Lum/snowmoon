import { MinpentaiTags } from '../mp-tags';
import '../book/book.css';

export const metadata = { title: 'Minpentai: play with your AI (draft)', robots: { index: false } };

const SITE = 'https://snowmoon.party';

/**
 * "Play with your AI" (owner, 2026-11-01): what agent play is, how to connect the Snowmoon connector, five things to say,
 * and what becomes public. Draft wording by the coding agent. Agent play is invite-only (AGENTS.minpentaiPlay).
 */
export default function PlayWithYourAI() {
  return (
    <div className="page minpentai">
      <article className="mb">
        <h1>Play Minpentai with your AI</h1>
        <MinpentaiTags tags={['rules', 'draft']} />
        <p className="mb-note">Invite-only for now. Draft wording.</p>

        <h2>What it is</h2>
        <p>
          You play a Minpentai match against the site&rsquo;s computer, with your own AI (Claude, or another app that
          connects to MCP servers) as your adviser and hands. You tell it what you want in your own chat; it reads your
          side of the board, tries plans in a private sandbox, tells you what it would do, and sends the moves you agree
          to. Like the players in Snowmoon, you see only what your towers see. You can watch the match on your phone
          through a link that shows your side only. The site pays for no model: your AI runs on your own account.
        </p>
        <p>
          On Rocks and Mirrors, the book edition, four of the book&rsquo;s structures are pieces: mirror walls, symbol
          gliders, moving walls and glider factories. <a href="/minpentai/book/tutorial">The four pieces in four cards →</a>
        </p>

        <h2>Connect it in Claude</h2>
        <ol>
          <li>In Claude, open Settings, then Connectors, then <strong>Add custom connector</strong>.</li>
          <li>Name it <strong>Snowmoon</strong> and give the address <code>{SITE}/mcp</code>.</li>
          <li>Press Connect. Claude opens snowmoon.party: sign in with Farcaster, read what your AI will be able to do, and press Allow.</li>
          <li>If you connected Snowmoon before agent play opened, disconnect it and connect again, so the new permission is added.</li>
        </ol>
        <h2>ChatGPT</h2>
        <p>
          ChatGPT can add custom MCP connectors on some plans, in developer mode, with the same address. We haven&rsquo;t
          tried a match from ChatGPT yet; if it works for you, tell us.
        </p>

        <h2>Five things to say</h2>
        <ol>
          <li>&ldquo;Start a Rocks and Mirrors match on Snowmoon at level 2, and play defensively: keep my towers walled.&rdquo;</li>
          <li>&ldquo;What do you see on my side of the board?&rdquo;</li>
          <li>&ldquo;Before you send anything, simulate your plan against where you think their towers are, and show me what happens.&rdquo;</li>
          <li>&ldquo;Defend my symbol: if it&rsquo;s forming, wall it in this turn.&rdquo;</li>
          <li>&ldquo;Give me my live link so I can watch on my phone.&rdquo;</li>
        </ol>

        <h2>What becomes public</h2>
        <ul>
          <li>While a match is on: nothing. Only you see your side, through your AI and your link. Anyone you give the link to sees your side too, until your AI replaces it.</li>
          <li>When it ends: the match record. That is the board, every turn&rsquo;s moves, who chose them (you, your AI or the site&rsquo;s computer) and the model your AI said it runs. It doesn&rsquo;t show your Farcaster name or ID, or your AI&rsquo;s name.</li>
          <li>Never public: your standing order&rsquo;s words and your AI&rsquo;s notes.</li>
          <li>To have a match record removed, write to us. The details are in the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a> (section 6d).</li>
        </ul>
        <p className="mb-note">Rules invented for this edition, Rocks and Mirrors&rsquo; pieces drawn from passages in the book · not affiliated with the author.</p>
      </article>
    </div>
  );
}
