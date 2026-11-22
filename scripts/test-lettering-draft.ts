/**
 * Tests for decision C's drafts (scripts/lib/lettering-draft.ts; branch closed-lettering, 2026-11-18). No network, no cost.
 *   npx tsx scripts/test-lettering-draft.ts
 */
import { readFileSync } from 'node:fs';
import { compare, letteringLine, letteringPolicy, parseQuotes, phraseSource } from './lib/lettering-draft';

let failed = 0;
const check = (what: string, ok: boolean, got?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || got === undefined ? '' : `: ${JSON.stringify(got)}`}`);
};
const phrases = (s: string) => { const p = parseQuotes(s); return p.ok ? p.phrases : p.error; };

check('straight quotes', JSON.stringify(phrases('a sign "Night Market" here')) === '["Night Market"]');
check('curly quotes', JSON.stringify(phrases('a banner “Embrace the competition”')) === '["Embrace the competition"]');
check('mixed straight and curly (autocorrect)', JSON.stringify(phrases('a sign “Snow tonight"')) === '["Snow tonight"]');
check('an apostrophe stays inside the words', JSON.stringify(phrases('a mug "we don’t stop" and Zei\'s coat')) === '["we don’t stop"]');
check('single quotes are not lettering', JSON.stringify(phrases("a 'quiet' street")) === '[]');
check('two phrases', JSON.stringify(phrases('“the Path of Strength” and “Embrace the competition”')) === '["the Path of Strength","Embrace the competition"]');
check('an unclosed quote is refused', phrases('a sign "OPEN') === 'A quotation mark isn’t closed.');
check('empty quotes are refused', phrases('a sign ""') === 'Empty quotation marks.');
check('8 words pass', Array.isArray(phrases('"the first step is always the hardest one"')));
check('9 words are refused', phrases('"the first step is always the very hardest one"') === 'Up to 8 words in quotation marks per picture.');
check('49 characters are refused', typeof phrases('"Aaaaaaaaaaaaaaaaaaaaaaaa Bbbbbbbbbbbbbbbbbbbbbbbb"') === 'string');
check('4 phrases are refused', typeof phrases('"a" "b" "c" "d"') === 'string');
check('emoji are refused', typeof phrases('"hi 🙂"') === 'string');

check('"Embrace the competition" is c13-b64', JSON.stringify(phraseSource('Embrace the competition')) === '{"source":"book","block":"c13-b64","also_in":0}', phraseSource('Embrace the competition'));
check('"the Path of Strength" is c13-b64', JSON.stringify(phraseSource('the Path of Strength')) === '{"source":"book","block":"c13-b64","also_in":0}');
check('"The Path of Strength" (capital T) is own', phraseSource('The Path of Strength').source === 'own');
check('"Night Market" is own', phraseSource('Night Market').source === 'own');
check('a part of a word is not a match ("mbrace the")', phraseSource('mbrace the competition').source === 'own');

check('exact match', compare(['Embrace the competition'], ['Embrace the competition']).match);
check('curly apostrophe matches straight', compare(['we don’t stop'], ["we don't stop"]).match);
check('a line break inside a phrase matches', compare(['Snow tonight'], ['Snow\ntonight']).match);
check('a misspelling is a mismatch', !compare(['Embrace the competition'], ['Embrace the competiton']).match);
check('capitals differ: mismatch, but caseless match', !compare(['Night Market'], ['NIGHT MARKET']).match && compare(['Night Market'], ['NIGHT MARKET'], true).match);
check('extra lettering is a mismatch', !compare(['Night Market'], ['Night Market', 'OPEN']).match);
check('a trailing full stop is a mismatch', !compare(['Snow tonight'], ['Snow tonight.']).match);
check('two phrases, either order', compare(['A b', 'C d'], ['C d', 'A b']).match);
check('nothing read is a mismatch', !compare(['Night Market'], []).match);

check('one phrase line', letteringLine(['Night Market']).includes(': "Night Market". Put them in the upper half'));
check('two phrases line', letteringLine(['A', 'B']).includes('"A" and "B".'));
const base = readFileSync('config/prompts/image-guard.md', 'utf8');
const pol = letteringPolicy(['Night Market']);
check('the lettering policy keeps every other category line of image-guard.md', base.split('\n').filter((l) => l.startsWith('- **') && !l.startsWith('- **words**')).every((l) => pol.includes(l)));
check('the lettering policy lists the allowed phrase before the answer line', pol.indexOf('"Night Market"') < pol.indexOf('Answer with exactly one line of JSON'));
check('the base policy still refuses words outright', base.includes('- **words**: asking for words, letters, captions, signs or speech bubbles in the image.'));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
