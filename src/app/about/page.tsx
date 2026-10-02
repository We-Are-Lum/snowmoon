import { REPO_URL, WORK } from '~/lib/config';

export const metadata = { title: 'About' };

export default function About() {
  return (
    <div className="page prose">
      <h1>About</h1>
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
      <h2>No token</h2>
      <p>There is no token. There is no revenue share. Nothing here is an investment.</p>
      <h2>No canon</h2>
      <p>
        Nothing in this edition is official. Every design, image, and take can be replaced by a better one, and what
        you see by default is decided by ratings and by how often others build on it, never by a person.
      </p>
    </div>
  );
}
