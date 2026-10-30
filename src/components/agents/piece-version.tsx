import Link from 'next/link';
import { AGENT_WORDING } from '~/lib/agents/wording';
import type { Credit, NoteView, Stamp, VersionView } from '~/lib/agents/pieces';

/**
 * One version of a piece (owner, 2026-10-20, the main goal). The default view is the work and the stamp:
 * what the person did (idea, words, feedback, in their own words) kept apart from what the agent did. The
 * machinery (shot ids, timings, prompts, models, the agent's own notes, a brought-in image's recipe) sits
 * behind "Recipe", one tap away and still public. Labels:
 * - the stamp: "Idea and words by @x · feedback from @y · made by Claude, agent of @x";
 * - an idea the agent had itself is shown as the agent's, never as part of a person's stamp;
 * - a brought-in piece with AI-written words says so, and those words are no one's stamp;
 * - a brought-in image: "Brought in by @x's agent · recipe as declared, not checked", in its recipe.
 */
const S = AGENT_WORDING.stamp;
const L = AGENT_WORDING.labels;
const short = (h: string | null) => (h ? (h.startsWith('0x') ? `${h.slice(0, 6)}…${h.slice(-4)}` : h) : '?');
/** A mention of a full wallet address is shown short, as bylines are. */
export const shortMentions = (text: string) => text.replace(/@(0x[0-9a-fA-F]{40})/g, (_, a: string) => `@${short(a.toLowerCase())}`);
const blockHref = (b: string) => {
  const m = b.match(/^c(\d+)-b(\d+)$/);
  return m ? `/chapter/${m[1]}#${b}` : '#';
};
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The human stamp, then what the agent did. */
export function StampLine({ stamp, credit, person }: { stamp: Stamp; credit: Credit[]; person?: number }) {
  const human: string[] = [];
  const idea = stamp.idea && 'person' in stamp.idea ? stamp.idea : null;
  const wordsBy = stamp.words?.person ? `@${short(stamp.words.person.handle)}` : null;
  const ideaBy = idea ? `@${short(idea.handle)}` : null;
  if (ideaBy && wordsBy && ideaBy === wordsBy) human.push(`${S.idea} and ${S.words} by ${ideaBy}`);
  else {
    if (ideaBy) human.push(`${S.idea} by ${ideaBy}`);
    if (wordsBy) human.push(`${S.words[0].toUpperCase()}${S.words.slice(1)} by ${wordsBy}`);
  }
  if (stamp.words?.book) human.push(`lines from ${S.book}`);
  const fb = [...new Set((stamp.feedback ?? []).map((f) => `@${short(f.handle)}`))];
  if (fb.length) human.push(`${S.feedback} ${list(fb)}`);
  // Built on someone else's work: the earliest version in the chain that isn't this person's own.
  const built = credit.find((c) => c.person !== person) ?? null;
  return (
    <p className="piece-stamp">
      {human.length > 0 && <strong className="piece-stamp-human">{human.join(' · ')}</strong>}
      {human.length > 0 && ' · '}
      <span className="piece-stamp-made">
        {stamp.idea && 'agent' in stamp.idea ? `${S.agentIdea(stamp.idea.agent)} · ` : ''}
        {S.madeBy} {stamp.made_by ?? 'an agent'}
        {stamp.agent_notes?.length ? ` · notes from ${list([...new Set(stamp.agent_notes.map((n) => n.agent))])}` : ''}
      </span>
      {built && (
        <>
          {' · '}
          <span className="piece-stamp-made">built on <Link href={`/p/${built.piece}`}>@{short(built.handle)}’s</Link></span>
        </>
      )}
      {stamp.words?.ai && <span className="piece-chip piece-chip-words">{S.aiWords}</span>}
    </p>
  );
}

/** The person's own words that started it and steered it, shown as theirs. */
function TheirWords({ stamp }: { stamp: Stamp }) {
  const idea = stamp.idea && 'person' in stamp.idea ? stamp.idea : null;
  const notes = (stamp.feedback ?? []).filter((f) => f.words && f.words !== 'Try again.');
  if (!idea && !notes.length) return null;
  return (
    <div className="piece-their-words">
      {idea && (
        <blockquote>
          <p>{shortMentions(idea.words)}</p>
          <footer>@{short(idea.handle)}{idea.spoken ? `, ${S.spoken}` : ''}</footer>
        </blockquote>
      )}
      {notes.map((f, i) => (
        <blockquote key={i} className="piece-their-note">
          <p>{shortMentions(f.words)}</p>
          <footer>@{short(f.handle)}{f.spoken ? `, ${S.spoken}` : ''}</footer>
        </blockquote>
      ))}
    </div>
  );
}

function Lines({ lines }: { lines: { source: string; block?: string; speaker?: string; text: string }[] }) {
  return (
    <ul className="piece-lines">
      {lines.map((l, i) => (
        <li key={i}>
          {l.speaker && <strong>{l.speaker}: </strong>}
          {l.text}{' '}
          {l.source === 'book' && l.block ? <Link className="piece-cite" href={blockHref(l.block)}>book {l.block}</Link> : l.source === 'agent' ? <span className="piece-chip piece-chip-words">AI-written</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** An edit to the person's own scene, said plainly: the shot, what changes, and what it made (if approved). */
function EditChange({ v, mediaSrc }: { v: VersionView; mediaSrc?: string | null }) {
  const b = v.body as { shot: string; change: { type: string; note?: string; cue?: string; line?: string; from?: string | null; to?: string; from_s?: number; to_s?: number; was?: { from_s?: number; to_s?: number } | string[]; who?: string[]; estimate_usd?: number; seconds?: number; angle_deg?: number | null; distance_m?: number | null; height_m?: number | null; people?: unknown[] } };
  const c = b.change;
  const shot = v.shots[0];
  const made = (v as VersionView & { made?: { kind: string } | null }).made;
  const sec = (x?: number) => (typeof x === 'number' ? `${x.toFixed(1)} s` : '?');
  const say =
    c.type === 'frame' ? `A new frame: “${c.note}”`
    : c.type === 'take' ? `Line ${c.cue}${c.line ? ` (“${c.line}”)` : ''}: take ${c.to}${c.from ? ` instead of ${c.from}` : ''}`
    : c.type === 'timing' ? `Runs ${sec(c.from_s)}–${sec(c.to_s)}${c.was && !Array.isArray(c.was) ? ` (was ${sec(c.was.from_s)}–${sec(c.was.to_s)})` : ''}`
    : c.type === 'speaking' ? `Speaking: ${(c.who ?? []).join(', ')}${Array.isArray(c.was) && c.was.length ? ` (in the shot: ${c.was.join(', ')})` : ''}`
    : c.type === 'video' ? `A ${c.seconds ?? 5}-second video test: “${c.note}”`
    : c.type === 'camera' ? `Camera: ${[typeof c.angle_deg === 'number' ? `${c.angle_deg}° ${c.angle_deg < 0 ? 'looking up' : 'looking down'}` : null, typeof c.distance_m === 'number' ? `${c.distance_m} m away` : null, typeof c.height_m === 'number' ? `${c.height_m} m high` : null, Array.isArray(c.people) && c.people.length ? `${c.people.length} moved` : null].filter(Boolean).join(', ')}`
    : '';
  return (
    <div className="piece-edit">
      {shot?.thumb && !mediaSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="piece-edit-shot" src={shot.thumb} alt={`AI-generated image: shot ${b.shot} as it is now`} />
      )}
      {mediaSrc && (made?.kind === 'video' ? (
        <video className="piece-image" src={mediaSrc} controls muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="piece-image" src={mediaSrc} alt={`AI-generated image: a new frame for shot ${b.shot}`} />
      ))}
      <p className="piece-made-text">{say}</p>
    </div>
  );
}

/** The work itself: pictures, the person's and the book's words, the agent's description of an idea. */
function Work({ v, imageSrc }: { v: VersionView; imageSrc?: string | null }) {
  const b = v.body as Record<string, unknown>;
  const lines = Array.isArray(b.lines) ? (b.lines as { source: string; block?: string; speaker?: string; text: string }[]) : [];
  return (
    <>
      {v.kind === 'idea' && String(b.text ?? '').split(/\n{2,}/).map((p, i) => <p key={i} className="piece-made-text">{p}</p>)}
      {v.kind === 'character' && <p className="piece-made-text"><strong>{String(b.character)}</strong>: {String(b.description)}</p>}
      {v.kind === 'edit' && <EditChange v={v} mediaSrc={imageSrc} />}
      {v.shots.length > 0 && v.kind !== 'edit' && (
        <ol className="piece-strip" aria-label={v.kind === 'storyboard' ? 'The storyboard' : 'The shots'}>
          {v.shots.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <li key={i}>{s.thumb ? <img src={s.thumb} alt={`AI-generated image: shot ${i + 1}`} loading="lazy" /> : <span className="piece-strip-missing">{i + 1}</span>}</li>
          ))}
        </ol>
      )}
      {v.kind === 'image' && v.image && imageSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="piece-image" src={imageSrc} alt={`AI-made image, as declared by ${v.by}’s agent, not by the author: ${v.title}`} width={(v.image.checked as { width: number }).width} height={(v.image.checked as { height: number }).height} />
      )}
      {lines.length > 0 && <Lines lines={lines} />}
    </>
  );
}

/** Everything that made it, one tap away. */
function Recipe({ v }: { v: VersionView }) {
  const b = v.body as Record<string, unknown>;
  const handle = v.by.replace(/^@/, '');
  return (
    <details className="piece-recipe-box">
      <summary>{AGENT_WORDING.recipe}</summary>
      <p className="you-note">Made by {v.agent ?? v.by}{v.agent ? ' (an AI agent; the model it runs is its own, not declared to us)' : ''}. A {v.kind}, version {v.n}.</p>
      {v.credit.length > 0 && (
        <p className="you-note">
          {L.revisedFrom}{' '}
          {v.credit.map((c, i) => (
            <span key={c.version}>{i > 0 && ', from '}<Link href={`/p/${c.piece}`}>{c.agent ?? `@${short(c.handle)}`}</Link> (version {c.n})</span>
          ))}
        </p>
      )}
      {Array.isArray(b.items) && (
        <ol className="piece-board">
          {(b.items as { shot: string; seconds?: number; note?: string }[]).map((it, i) => (
            <li key={i}>shot {it.shot}{it.seconds ? ` · ${it.seconds} s` : ''}{it.note ? ` · ${it.note}` : ''}</li>
          ))}
        </ol>
      )}
      {Array.isArray(b.frames) && (
        <ol className="piece-board">
          {(b.frames as { shot: string; prompt: string; note?: string }[]).map((f, i) => (
            <li key={i}>shot {f.shot}: <span className="piece-prompt">{f.prompt}</span>{f.note ? ` (${f.note})` : ''}</li>
          ))}
        </ol>
      )}
      {(() => {
        // The person's acting notes that went into this frame or video (owner, 2026-10-20: "both show in the recipe as mine").
        const direction = (v.made as { direction?: { character: string; text: string; filedBy?: string | null }[] } | null)?.direction ?? [];
        return direction.length ? (
          <p className="you-note">
            {AGENT_WORDING.direction.recipeActing(handle)}{' '}
            {direction.map((d, i) => <span key={i}>{i > 0 && ' · '}{d.character}: “{d.text}”{d.filedBy ? ` (${AGENT_WORDING.direction.recipeFiledBy(d.filedBy)})` : ''}</span>)}
          </p>
        ) : null;
      })()}
      {b.adaptation ? <p className="you-note">From adaptation {String(b.adaptation)}{b.version ? `, version ${String(b.version)}` : ''}.</p> : null}
      {v.kind === 'image' && v.image && (() => {
        const d = v.image!.declared as { prompt: string; model: { name: string; maker: string; weights: string; ran_on?: string } };
        const c = v.image!.checked as { width: number; height: number; stored_sha256: string; scanned_by: string; inputs_ours: { sha256: string; ours: boolean }[] };
        return (
          <>
            <p className="piece-label">{L.broughtIn(handle)}</p>
            <table className="piece-recipe">
              <tbody>
                <tr><th>prompt</th><td>{d.prompt}</td><td>declared</td></tr>
                <tr><th>model</th><td>{d.model.name} ({d.model.maker}, {d.model.weights === 'unknown' ? 'weights not stated' : `${d.model.weights} weights`}){d.model.ran_on ? `, ran on ${d.model.ran_on}` : ''}</td><td>declared</td></tr>
                {c.inputs_ours.map((i) => <tr key={i.sha256}><th>input</th><td><code>{i.sha256.slice(0, 12)}</code></td><td>{i.ours ? '✓ ours, checked' : 'not ours'}</td></tr>)}
                <tr><th>image</th><td>{c.width}×{c.height} JPEG, metadata removed, <code>{c.stored_sha256.slice(0, 12)}</code></td><td>✓ checked</td></tr>
                <tr><th>scan</th><td>{c.scanned_by}</td><td>✓ before storing</td></tr>
              </tbody>
            </table>
          </>
        );
      })()}
      <p className="you-note">GPL-3.0. The words people wrote or said are theirs; the pictures are AI-generated.</p>
    </details>
  );
}

export function PieceVersion({ v, notes, imageSrc, showN = true }: { v: VersionView; notes?: NoteView[]; imageSrc?: string | null; showN?: boolean }) {
  return (
    <article className="piece-version" id={`v${v.n}`}>
      {showN && <h3>Version {v.n}{v.status === 'draft' ? ' (draft)' : ''}</h3>}
      <StampLine stamp={v.stamp} credit={v.credit} person={v.person} />
      <TheirWords stamp={v.stamp} />
      <Work v={v} imageSrc={imageSrc} />
      <Recipe v={v} />
      {notes && notes.length > 0 && (
        <ul className="piece-notes" aria-label="Notes">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="piece-maker">{n.agent ?? n.by}</span>
              {n.agent && <span className="piece-chip">agent</span>} {shortMentions(n.text)}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** For lists: the stamp only. */
export function MadeBy({ v }: { v: VersionView }) {
  return <StampLine stamp={v.stamp} credit={v.credit} person={v.person} />;
}
