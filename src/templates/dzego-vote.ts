/**
 * dzego/vote: the robot's voting view in a Pafogai Du courtyard (c7-b6). Kept in the look the
 * source draws it in (its device view, its five faces at double size, the "2" raised): this
 * template exists so the slider can go live, not to restyle the screen. The HTML is static,
 * with the thumb where the source's untouched slider sits (centre, under the middle face);
 * the reader's client island puts a real range input over the track (src/templates/live.ts).
 * Nothing is stored or sent.
 */
import type { BlockLike } from '~/lib/reading';
import type { ScreenTemplate } from './index';
import { RANGE_DEFAULTS, rangeDefaultValue, sliderFraction, type LiveSlider } from './live';

type Cell = string | { text: string; controls: { type: string; labels?: string[]; label?: string }[] };
interface VoteFields {
  title: string;
  sliderLabels: string[];
  button: string;
}

/** The block's fields, or null unless it is a Dzego screen of exactly this shape: a title, a slider, a button. */
function voteFields(b: BlockLike): VoteFields | null {
  if (b.kind !== 'screen' || b.data?.setting !== 'dzego') return null;
  const fields = b.data.fields as { type: string; header?: Cell[][]; rows?: Cell[][] }[] | undefined;
  if (fields?.length !== 1 || fields[0].type !== 'table') return null;
  const { header, rows } = fields[0];
  const title = header?.length === 1 && header[0].length === 1 ? header[0][0] : null;
  if (typeof title !== 'string' || !title || rows?.length !== 2) return null;
  const [[slider], [button]] = rows;
  const control = (c: Cell | undefined, type: string) =>
    typeof c === 'object' && c.text === '' && c.controls.length === 1 && c.controls[0].type === type ? c.controls[0] : null;
  const s = control(slider, 'slider');
  const btn = control(button, 'button');
  if (!s?.labels?.length || !btn?.label) return null;
  return { title, sliderLabels: s.labels, button: btn.label };
}

function slider(f: VoteFields): LiveSlider {
  const { min, max, step } = RANGE_DEFAULTS;
  return { name: f.title, min, max, step, start: rangeDefaultValue(min, max, step), labels: f.sliderLabels };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "🙁2" is drawn as 🙁 with a raised 2, as in the source; a mark without one keeps the space. */
function mark(l: string): string {
  const m = /^(.*?)(\d+)$/u.exec(l);
  return m ? `${esc(m[1])}<sup>${m[2]}</sup>` : `${esc(l)}<sup aria-hidden="true">&nbsp;</sup>`;
}

export const dzegoVote: ScreenTemplate = {
  id: 'dzego/vote',
  matches: (b) => voteFields(b) !== null,
  live: (b) => slider(voteFields(b)!),
  render(b) {
    const f = voteFields(b)!;
    const s = slider(f);
    return `<div class="device-view wide-device-view tpl-dzego-vote" data-template="dzego/vote"><table>
<thead><tr><th>${esc(f.title)}</th></tr></thead>
<tbody><tr><td>
<div class="dv-track" data-live-track style="--f:${sliderFraction(s, s.start)}"><span class="dv-thumb" aria-hidden="true"></span></div>
<div class="dv-labels">${f.sliderLabels.map((l) => `<span>${mark(l)}</span>`).join('')}</div>
</td></tr><tr><td><span class="dv-button">${esc(f.button)}</span></td></tr></tbody>
</table></div>`;
  },
};
