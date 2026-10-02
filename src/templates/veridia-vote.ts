/**
 * veridia/vote: the land-tax vote card on a Veridian hand device (c1-b18, c1-b31).
 * Drawn from the direction board (docs/design/direction-boards.png, "In-world
 * screens"): Instrument Sans, hairline rules, a light device face. Static: the
 * slider sits where the source's untouched slider sits (centre), and nothing reacts.
 */
import type { BlockLike } from '~/lib/reading';
import type { ScreenTemplate } from './index';

type Cell = string | { text: string; controls: { type: string; labels?: string[]; label?: string }[] };
interface VoteFields {
  title: string;
  summary: string;
  sliderLabels: string[];
  button: string;
}

/** The block's vote fields, or null if it is not a vote screen of this exact shape. */
function voteFields(b: BlockLike): VoteFields | null {
  if (b.kind !== 'screen' || b.data?.setting !== 'veridia') return null;
  const fields = b.data.fields as { type: string; header?: Cell[][]; rows?: Cell[][] }[] | undefined;
  if (fields?.length !== 1 || fields[0].type !== 'table') return null;
  const { header, rows } = fields[0];
  const title = header?.length === 1 && header[0].length === 1 ? header[0][0] : null;
  if (typeof title !== 'string' || !title.startsWith('Vote on: ') || rows?.length !== 3) return null;
  const [[summary], [slider], [button]] = rows;
  const control = (c: Cell | undefined, type: string) =>
    typeof c === 'object' && c.text === '' && c.controls.length === 1 && c.controls[0].type === type ? c.controls[0] : null;
  const s = control(slider, 'slider');
  const btn = control(button, 'button');
  if (typeof summary !== 'string' || !s?.labels?.length || !btn?.label) return null;
  return { title, summary, sliderLabels: s.labels, button: btn.label };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const veridiaVote: ScreenTemplate = {
  id: 'veridia/vote',
  matches: (b) => voteFields(b) !== null,
  render(b) {
    const f = voteFields(b)!;
    return `<div class="tpl-veridia-vote" data-template="veridia/vote">
<div class="vv-title">${esc(f.title)}</div>
<div class="vv-summary">${esc(f.summary)}</div>
<div class="vv-slider"><div class="vv-track" aria-hidden="true"><span class="vv-tick"></span><span class="vv-thumb"></span></div>
<div class="vv-labels">${f.sliderLabels.map((l) => `<span>${esc(l)}</span>`).join('')}</div></div>
<div class="vv-button">${esc(f.button)}</div>
</div>`;
  },
};
