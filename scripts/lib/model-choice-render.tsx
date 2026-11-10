/**
 * The rendering half of scripts/test-model-choice.ts (M12, M13), run in its own process without
 * --conditions=react-server, where the Node renderer works. Prints JSON: each case's rendered HTML.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelNotice, ModelPicker } from '../../src/components/model-picker';
import { modelChoicesFor } from '../../src/lib/images/model-choice-view';

const choices = modelChoicesFor('fork', 'character', true)!;
const picker = (cs: typeof choices) => renderToStaticMarkup(createElement(ModelPicker, { choices: cs, modelId: cs[0].id, onPick: () => {} }));
const notice = (askAdult: boolean) => renderToStaticMarkup(createElement(ModelNotice, { maker: 'OpenAI', askAdult, adultTicked: false, onTick: () => {}, onAnswer: () => {} }));
console.log(JSON.stringify({
  choices,
  picker: picker(choices),
  pickerNoLabels: picker(choices.map((c) => ({ ...c, retention: null }))),
  noticeFirst: notice(true),
  noticeLater: notice(false),
}));
