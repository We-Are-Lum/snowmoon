import Link from 'next/link';
import { AGENT_WORDING } from '~/lib/agents/wording';
import type { Credit, NoteView, VersionView } from '~/lib/agents/pieces';

/**
 * One version of a piece, with every label it needs (owner, 2026-10-20; design §5). Used by the public
 * piece page and, as drafts, by the person's review list. Labels:
 * - who made it: "@person", or "<name>, agent of @person" when an agent drafted it;
 * - "words by @person's agent" on any version with an agent's story words;
 * - a brought-in image: "Brought in by @person's agent · recipe as declared, not checked", its AI label,
 *   and each recipe field marked checked by us or declared;
 * - the credit chain: "Revised from …", every step, linked.
 */
const L = AGENT_WORDING.labels;
const short = (h: string | null) => (h ? (h.startsWith('0x') ? `${h.slice(0, 6)}…${h.slice(-4)}` : h) : '?');
const blockHref = (b: string) => {
  const m = b.match(/^c(\d+)-b(\d+)$/);
  return m ? `/chapter/${m[1]}#${b}` : '#';
};

export function CreditChain({ credit }: { credit: Credit[] }) {
  if (!credit.length) return null;
  return (
    <p className="piece-credit">
      {L.revisedFrom}{' '}
      {credit.map((c, i) => (
        <span key={c.version}>
          {i > 0 && ', from '}
          <Link href={`/p/${c.piece}`}>{c.agent ?? `@${short(c.handle)}`}</Link> (version {c.n})
        </span>
      ))}
    </p>
  );
}

export function MadeBy({ v }: { v: VersionView }) {
  const handle = v.by.replace(/^@/, '');
  return (
    <p className="piece-by">
      <span className="piece-maker">{v.agent ?? v.by}</span>
      {v.agent && <span className="piece-chip">agent</span>}
      {v.wordsByAgent && <span className="piece-chip piece-chip-words">{L.words(handle)}</span>}
      {v.status === 'draft' && <span className="piece-chip">draft</span>}
    </p>
  );
}

function Lines({ lines }: { lines: { source: string; block?: string; speaker?: string; text: string }[] }) {
  return (
    <ul className="piece-lines">
      {lines.map((l, i) => (
        <li key={i}>
          {l.speaker && <strong>{l.speaker}: </strong>}
          {l.text}{' '}
          {l.source === 'book' && l.block ? <Link className="piece-cite" href={blockHref(l.block)}>book {l.block}</Link> : <span className="piece-chip piece-chip-words">agent’s words</span>}
        </li>
      ))}
    </ul>
  );
}

function Body({ v, imageSrc }: { v: VersionView; imageSrc?: string | null }) {
  const b = v.body as Record<string, unknown>;
  const lines = Array.isArray(b.lines) ? (b.lines as { source: string; block?: string; speaker?: string; text: string }[]) : [];
  if (v.kind === 'idea')
    return (
      <>
        {String(b.text ?? '').split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        {lines.length > 0 && <Lines lines={lines} />}
      </>
    );
  if (v.kind === 'storyboard')
    return (
      <>
        <ol className="piece-board">
          {(b.items as { shot: string; seconds?: number; note?: string }[]).map((it, i) => (
            <li key={i}>
              shot {it.shot}
              {it.seconds ? ` · ${it.seconds} s` : ''}
              {it.note ? ` · ${it.note}` : ''}
            </li>
          ))}
        </ol>
        {lines.length > 0 && <Lines lines={lines} />}
      </>
    );
  if (v.kind === 'frames')
    return (
      <ol className="piece-board">
        {(b.frames as { shot: string; prompt: string; note?: string }[]).map((f, i) => (
          <li key={i}>
            shot {f.shot}: <span className="piece-prompt">{f.prompt}</span>
            {f.note ? ` (${f.note})` : ''}
          </li>
        ))}
      </ol>
    );
  if (v.kind === 'character')
    return (
      <>
        <p className="piece-sub">{String(b.character)}{b.based_on ? ` · building on ${String(b.based_on)}` : ''}</p>
        <p>{String(b.description)}</p>
      </>
    );
  if (v.kind === 'image' && v.image) {
    const d = v.image.declared as { prompt: string; model: { name: string; maker: string; weights: string; version?: string; ran_on?: string }; inputs: { sha256: string; what?: string }[] };
    const c = v.image.checked as { width: number; height: number; stored_sha256: string; scanned_by: string; inputs_ours: { sha256: string; ours: boolean }[] };
    const handle = v.by.replace(/^@/, '');
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageSrc && <img className="piece-image" src={imageSrc} alt={`AI-made image, as declared by @${handle}’s agent, not by the author: ${v.title}`} width={c.width} height={c.height} />}
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
  }
  return null;
}

export function PieceVersion({ v, notes, imageSrc }: { v: VersionView; notes?: NoteView[]; imageSrc?: string | null }) {
  return (
    <article className="piece-version" id={`v${v.n}`}>
      <h3>Version {v.n}</h3>
      <MadeBy v={v} />
      <CreditChain credit={v.credit} />
      <Body v={v} imageSrc={imageSrc} />
      {notes && notes.length > 0 && (
        <ul className="piece-notes" aria-label="Notes">
          {notes.map((n) => (
            <li key={n.id}>
              <span className="piece-maker">{n.agent ?? n.by}</span>
              {n.agent && <span className="piece-chip">agent</span>} {n.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
