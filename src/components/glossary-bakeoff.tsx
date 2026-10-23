'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, useAuth } from '~/lib/client-auth';
import { GLOSSARY_WRITTEN } from '~/lib/config';
import { blockHref } from '~/lib/glossary-view';
import type { BakeoffView } from '~/lib/glossary-written';

/**
 * The blind bake-off (owner, 2026-10-23): five entries, each written by three models from the same prompt and the
 * whole book, labelled A, B and C. Under each sentence, its citations; when the support check has run, whether a
 * fourth model found it supported by those blocks. At the top, per label: sentences, unsupported sentences, and the
 * program's problems (a citation that is not a block, a quote that is not word for word). Shows every chapter.
 * Wording: drafted by the coding agent.
 */
export function GlossaryBakeoff() {
  const auth = useAuth();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'none' } | { kind: 'empty' } | { kind: 'ready'; b: BakeoffView }>({ kind: 'loading' });
  const allowed = auth.kind === 'signed-in' && GLOSSARY_WRITTEN.fids.includes(auth.fid);
  useEffect(() => {
    if (auth.kind === 'loading') return;
    if (!allowed) return setState({ kind: 'none' });
    void authFetch('/api/glossary/bakeoff')
      .then(async (r) => (r.ok ? ((await r.json()) as { bakeoff: BakeoffView | null }) : null))
      .catch(() => null)
      .then((j) => setState(!j ? { kind: 'none' } : j.bakeoff ? { kind: 'ready', b: j.bakeoff } : { kind: 'empty' }));
  }, [auth.kind, allowed]);

  if (state.kind === 'loading') return <div className="page prose glossary" />;
  if (state.kind === 'none') return <div className="page prose glossary"><h1>Not found</h1></div>;
  if (state.kind === 'empty')
    return (
      <div className="page prose glossary">
        <p className="label">Glossary · bake-off · owner only</p>
        <h1>Not run yet</h1>
        <p>No model has been called. The run waits for your go-ahead (scripts/glossary-explain.ts bakeoff).</p>
      </div>
    );
  const b = state.b;
  const labels = Object.keys(b.labels).sort();
  const verdict = (label: string, slug: string, n: number) => b.support?.results[label]?.[slug]?.find((v) => v.n === n) ?? null;
  return (
    <div className="page prose glossary gl-bake">
      <p className="label">Glossary · bake-off · owner only</p>
      <h1>Three models, labelled A, B and C</h1>
      <p>
        The same prompt (<code>{b.promptFile}</code>) and the whole book, to each model, on {b.date}. Which label is which model is in a separate key
        file, not on this page. Every chapter is shown.
      </p>
      <table className="gl-bake-counts">
        <thead>
          <tr>
            <th>Label</th>
            <th>Sentences</th>
            <th>Unsupported</th>
            <th>Program problems</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((l) => {
            const n = b.labels[l].entries.reduce((a, e) => a + e.sentences.length, 0);
            const c = b.support?.counts[l];
            return (
              <tr key={l}>
                <td>{l}</td>
                <td>{n}</td>
                <td>{c ? `${c.unsupported} of ${c.sentences}` : 'not checked yet'}</td>
                <td>{b.labels[l].problems.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {b.support && (
        <p className="gl-meta">
          Checked by {b.support.checker.model} ({b.support.checker.maker}), not one of the three, against each sentence&apos;s cited blocks only, on{' '}
          {b.support.checker.date} (<code>{b.support.checker.prompt_file}</code>). A sentence that fails the program&apos;s checks counts as unsupported.
        </p>
      )}
      {b.slugs.map((slug) => (
        <section key={slug} className="gl-bake-entry">
          <h2>{b.labels[labels[0]].entries.find((e) => e.slug === slug)?.term ?? slug}</h2>
          {labels.map((l) => {
            const e = b.labels[l].entries.find((x) => x.slug === slug);
            return (
              <div key={l} className="gl-bake-col">
                <h3>{l}</h3>
                {!e?.sentences.length ? (
                  <p className="gl-none">No usable answer.</p>
                ) : (
                  <ol>
                    {e.sentences.map((s, i) => {
                      const v = verdict(l, slug, i + 1);
                      return (
                        <li key={i} data-supported={v ? String(v.supported) : undefined}>
                          {s.text}{' '}
                          <span className="gl-written-cites">
                            {s.cites.map((c, k) => (
                              <span key={c}>
                                {k > 0 && ', '}
                                <Link href={blockHref(c)}>{c}</Link>
                              </span>
                            ))}
                            {' · '}from Ch {s.gate}
                            {v && (v.supported ? ' · supported' : ` · UNSUPPORTED: ${v.why}`)}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {b.labels[l].problems.filter((p) => p.startsWith(`${slug} `) || p.startsWith(`${slug}:`)).map((p) => (
                  <p key={p} className="gl-none">Program: {p}</p>
                ))}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
