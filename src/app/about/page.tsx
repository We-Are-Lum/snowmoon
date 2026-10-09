import { IMAGE_WORDING } from '~/lib/images/wording';
import { CHAT, CONTACT_EMAIL, IMAGES, REPO_URL, WORK } from '~/lib/config';
import { RULES } from '~/lib/images/rules';
import { SIGN_IN_SERVICES } from '~/lib/sign-in-text';
import { ThemeSwitch } from '~/components/theme-switch';
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
      <p id="podcast">
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
      <h2 id="pictures">Pictures ({IMAGES.label})</h2>
      {/* Model-drafted wording (docs/proposals/add-an-image.md, decisions of 2026-10-08). */}
      <p>
        Invited readers can make an image for a passage, with {IMAGES.model.name}, an open-weights model ({IMAGES.model.licence}). Your
        prompt is sent to {CHAT.providerName} to be checked against the published rules (with gpt-oss-safeguard-20b), then to{' '}
        {IMAGES.model.host} to make the image. Both are asked to keep nothing: fal.ai returns the image in its reply and keeps no copy
        of the request. The image is shown to you as a draft, kept only on your device; it becomes public only if you publish
        it. The book&apos;s text is never sent to a model.
      </p>
      <p>Rules: {RULES}</p>
      <p>
        A published image shows who made it, that it is AI-generated and not by the author, and its recipe with the exact prompt.
        The name shown is your Farcaster username: when you signed in on this website, the one Farcaster&apos;s relay gave our
        server then; otherwise our server asks Farcaster&apos;s public API (api.farcaster.xyz) for the username of your Farcaster
        ID, sending only the ID, and keeps the answer for a day.
        Its maker can hide it at once. Anyone signed in can report it: one report of anything sexual involving a minor hides it
        at once, and three reports from different people hide it until a moderator looks. Moderators can only hide. This app
        counts how many images each person makes a day; what they cost is kept only as daily totals, with no names.
      </p>
      {/* Model-drafted wording, draft (step 4, decision 9 of 2026-10-09). */}
      <p>{IMAGE_WORDING.designs.about.line}</p>
      <p>
        Contact, for legal or copyright notices or to report an image without signing in:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <h2>Signing in</h2>
      {/* Model-drafted wording; the same sentence is shown at the sign-in step (src/components/sign-in.tsx). */}
      <p>
        Reading needs no account. Saving cards, liking, making images and asking the assistant need a Farcaster sign-in. Inside a
        Farcaster app it happens by itself. On this website, {SIGN_IN_SERVICES.charAt(0).toLowerCase() + SIGN_IN_SERVICES.slice(1)}
      </p>
      <h2>Theme</h2>
      <ThemeSwitch name="theme-about" />
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

