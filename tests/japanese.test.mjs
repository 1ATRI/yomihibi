import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rubyParts, hiragana, romaji, normalizeToken, sanitizeWord, csvText } from '../src/shared/japanese.js';
import { loadTokenizer } from '../src/tokenizer.js';

test('ruby keeps okurigana and handles mixed scripts', () => {
  assert.deepEqual(rubyParts('読みます', 'ヨミマス'), [{ text: '読', reading: 'よ' }, { text: 'みます', reading: '' }]);
  assert.deepEqual(rubyParts('食べ物', 'タベモノ'), [{ text: '食', reading: 'た' }, { text: 'べ', reading: '' }, { text: '物', reading: 'もの' }]);
  assert.deepEqual(rubyParts('お茶', 'オチャ'), [{ text: 'お', reading: '' }, { text: '茶', reading: 'ちゃ' }]);
  assert.deepEqual(rubyParts('今日', 'キョウ'), [{ text: '今日', reading: 'きょう' }]);
  assert.deepEqual(rubyParts('未知語', ''), [{ text: '未知語', reading: '' }]);
  assert.equal(hiragana('コーヒー'), 'こーひー'); assert.equal(romaji('にほんご'), 'nihongo');
});
test('word validation, URL safety and CSV formula protection', () => {
  const word = sanitizeWord({ surface: '読む', reading: 'よむ', sourceUrl: 'javascript:alert(1)', azureKey: 'secret', note: '=1+1' });
  assert.equal(word.base, '読む'); assert.equal(word.sourceUrl, ''); assert.equal(word.azureKey, undefined);
  assert.match(csvText([word]), /'\=1\+1/);
  assert.throws(() => sanitizeWord({ surface: '' }), /无效/);
  assert.equal(sanitizeWord({ surface: '猫', sourceUrl: 'https://example.com/猫' }).sourceUrl, 'https://example.com/%E7%8C%AB');
});
test('real packaged IPADIC reads Japanese and preserves exact text', async () => {
  const tokenizer = await loadTokenizer(name => readFile(`node_modules/kuromoji/dict/${name}.dat.gz`));
  for (const text of ['日本語を勉強します。', '  私は本を読みます。\n猫もいる。 😀', '木漏れ日と新しい発見', '😀公園で珈琲を飲みます。']) {
    const tokens = tokenizer.tokenize(text).map(normalizeToken);
    assert.equal(tokens.map(t => t.surface).join(''), text);
  }
  const tokens = tokenizer.tokenize('日本語を勉強します。').map(normalizeToken);
  assert.equal(tokens[0].reading, 'にほんご');
  assert.equal(tokens.find(t => t.surface === '勉強').reading, 'べんきょう');
});
