import { CHAT, REPO_URL, WORK } from '~/lib/config';
import { loadIntro } from '~/lib/intro';
import { AboutEdition, ReplayIntro } from '~/components/first-visit';
import consent from '../../../config/consent.json';

const wording = consent.versions[consent.current as keyof typeof consent.versions];

export const metadata = { title: 'About' };

export default function About() {
  const intro = loadIntro();
  return (
    <div className="page prose">
      <ReplayIntro intro={intro} />
      <h1>About</h1>
      <p className="about-disclaimer">{intro.disclaimer}</p>
      <p>
        <em>{WORK.title}</em> was written by {WORK.author} and released under the GNU General Public License v3. The
        original is at <a href={WORK.sourceUrl}>{WORK.sourceUrl}</a>.
      </p>
      <p>
        This project is an independent adaptation. It is not affiliated with or endorsed by the author.
      </p>
      <h2>License</h2>
      <p>
        This app and everything used to make it are GPL-3.0: the code, the ingest and analysis scripts, the prompts,
        and the data. The source is at <a href={REPO_URL}>{REPO_URL}</a>.
      </p>
      <p>
        The author has said that he reads the GPL to mean that anyone may adapt the book, but must open-source the
        pipeline they used to make it: AI prompts, scripts, task-specific harness, and other non-commodity materials.
        That is his own stated reading, and it has not been tested. This project follows it because publishing how
        everything was made is the point, not because it is settled law.
      </p>
      <h2>Your words are public</h2>
      <p>
        <strong>{wording.line}</strong> Before your first contribution of your own words, you are asked to agree to
        this, and the app records who agreed, when, and to which wording:
      </p>
      {wording.text.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      <p>
        Every published image and voice links to its recipe, including the exact prompt, readable without signing in.
        The prompts of your drafts and abandoned attempts are not published.
      </p>
      <p>
        {/* The feed's own words are the owner's (config/podcast.json); this link is model-drafted. */}
        <a href="/podcast.xml">Listen as a podcast</a>: the house narration, one chapter per episode, as a feed for
        any podcast app.
      </p>
      <h2>The reading assistant</h2>
      {/* Model-drafted wording (owner decision 2026-10-07: say which data centre is unverified). */}
      <p>
        The assistant answers questions about the book with {CHAT.modelName}, an open-weights model. Your questions are
        saved only on your device and never published. To be answered, each one is sent to {CHAT.route}, with zero data
        retention required; this app keeps no copy, only a count and the cost.
      </p>
      <p>
        {CHAT.providerName} keeps customer data in the United States and runs data centres in the US, Canada, Finland,
        Saudi Arabia and Australia. Which of its data centres answers a given question is not known to this app; it is
        unverified.
      </p>
      {CHAT.testing && (
        <p>
          The assistant is being tested: its answers can be wrong, so check the quotes it shows, which are the book’s
          own words.
        </p>
      )}
      <h2>No token</h2>
      <p>There is no token. There is no revenue share. Nothing here is an investment.</p>
      <h2>No canon</h2>
      <p>
        Nothing in this edition is official. Every design, image, and take can be replaced by a better one.
      </p>
      <AboutEdition intro={intro} />
    </div>
  );
}

