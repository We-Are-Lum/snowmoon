import Link from 'next/link';
import { adaptationsConfig, bountyOpen, longDate } from '~/lib/adaptations';
import { SceneCard } from '~/components/scene-card';
import { InfoLabel } from '~/components/info-label';

export const metadata = { title: 'Adaptations' };

/** The bounty's open or closed state is rechecked hourly. */
export const revalidate = 3600;

export default function Adaptations() {
  const { bounty, seeds } = adaptationsConfig();
  const open = bountyOpen(bounty.closes);
  return (
    <div className="page prose adaptations">
      <h1>Adaptations</h1>
      <div className="adaptations-published">
        <SceneCard as="list" />
      </div>
      <h2>Seed briefs</h2>
      {/* Less text, details behind ⓘ (owner, 2026-10-29). Model-drafted short line. */}
      <p>
        Starting points for adapting a scene, not canon.{' '}
        <InfoLabel word="About" kind="about" declaration="About seed briefs" title="Seed briefs" body={['Seed briefs for adapting scenes of the book. Each one lists what the text gives, what an adapter has to invent, and the passages to read, linked into the reader. They are starting points, not canon.']} />
      </p>

      <section className="notice" aria-label="Bounty">
        <p>
          {open ? 'Open bounty, closing' : 'The bounty closed on'} {longDate(bounty.closes)}.
        </p>
        <a className="notice-link" href={bounty.url}>
          {bounty.label}
        </a>
      </section>

      <ul className="seed-list">
        {seeds.map((s) => (
          <li key={s.slug}>
            <Link href={`/adaptations/${s.slug}`}>
              <span className="seed-title">{s.title}</span>
              <span className="seed-line">{s.line}</span>
              <span className="seed-meta">Spoilers through chapter {s.spoilers_through}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Open threads</h2>
      <p>
        <Link href="/adaptations/open-threads">Read the open threads</Link> (full spoilers).{' '}
        <InfoLabel word="About" kind="about" declaration="About the open threads" title="Open threads" body={['Eleven questions the book raises and never answers, each with the passages around it, as prompts for new adaptations.']} />
      </p>
    </div>
  );
}
