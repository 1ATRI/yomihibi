import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTokenizer } from '../src/tokenizer.js';
import { normalizeToken } from '../src/shared/japanese.js';
import { japaneseRoles } from '../src/analysis/japanese.js';
import { analyzeEnglish } from '../src/analysis/english.js';
import { detectLanguage, splitSentences } from '../src/shared/language.js';

test('automatic language detection respects Japanese and avoids Chinese pages', () => {
  assert.equal(detectLanguage('日本語を読む', 'auto', 'zh'), 'ja');
  assert.equal(detectLanguage('京都', 'auto', 'ja'), 'ja');
  assert.equal(detectLanguage('中文页面', 'auto', 'zh'), null);
  assert.equal(detectLanguage('Read a book.', 'auto'), 'en');
  assert.equal(detectLanguage('Book', 'auto', 'en'), 'en');
  assert.equal(detectLanguage('Read a book.', 'ja'), null);
  assert.equal(detectLanguage('日本語', 'en'), null);
});
test('English identifies noun-phrase subject, verb and object without time adjuncts', () => {
  const tokens = analyzeEnglish('The curious student reads a new book every morning.');
  assert.deepEqual(tokens.filter(t => t.role === 'subject').map(t => t.surface), ['The', 'curious', 'student']);
  assert.deepEqual(tokens.filter(t => t.role === 'object').map(t => t.surface), ['a', 'new', 'book']);
  assert.equal(tokens.find(t => t.surface === 'reads').base, 'read');
  assert.equal(tokens.find(t => t.surface === 'morning').role, '');
});
test('English copula, auxiliary negation, contractions and plural bases', () => {
  assert.equal(analyzeEnglish('She is happy.').find(t => t.surface === 'happy').role, 'complement');
  const negative = analyzeEnglish('We have not finished the work.');
  assert.deepEqual(negative.filter(t => t.role === 'predicate').map(t => t.surface), ['have', 'not', 'finished']);
  const contraction = analyzeEnglish("I don't like coffee.");
  assert.equal(contraction.find(t => t.surface === 'like').role, 'predicate');
  assert.equal(contraction.find(t => t.surface === 'coffee').role, 'object');
  const question = analyzeEnglish('Who reads books?');
  assert.equal(question[0].role, 'subject');
  assert.equal(question.find(t => t.surface === 'books').base, 'book');
});
test('English preserves original punctuation, contractions, whitespace and Unicode', () => {
  for (const text of ["  I don't know.\nShe smiled. 😀", '“Read this,” she said.', 'She’s happy. We can’t wait!', 'A well-known writer reads e-books.', 'Hello.\n\nGood morning!']) {
    assert.equal(analyzeEnglish(text).map(t => t.surface).join(''), text);
  }
  assert.equal(splitSentences(analyzeEnglish('She reads. He writes.')).filter(s => s.some(t => t.role)).length, 2);
});
test('Japanese separates topic from subject and marks object and finite predicate', async () => {
  const tokenizer = await loadTokenizer(name => readFile(`node_modules/kuromoji/dict/${name}.dat.gz`));
  const tokens = japaneseRoles(tokenizer.tokenize('私は本を読みます。猫が魚を食べました。').map(normalizeToken));
  assert.equal(tokens.find(t => t.surface === '私').role, 'topic');
  assert.equal(tokens.find(t => t.surface === '猫').role, 'subject');
  assert.equal(tokens.find(t => t.surface === '本').role, 'object');
  assert.equal(tokens.find(t => t.surface === '読み').role, 'predicate');
  assert.equal(tokens.find(t => t.surface === 'まし').role, 'predicate');
  const absent = japaneseRoles(tokenizer.tokenize('読みます。').map(normalizeToken));
  assert(!absent.some(t => ['subject', 'topic'].includes(t.role)));
  const copula = japaneseRoles(tokenizer.tokenize('彼は学生です。').map(normalizeToken));
  assert.equal(copula.find(t => t.surface === '学生').role, 'predicate');
});
