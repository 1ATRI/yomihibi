import { toHiragana, toRomaji } from 'wanakana';

export const hasJapanese = text => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
export const hasKanji = text => /[\p{Script=Han}々〆]/u.test(text);
export const hiragana = text => toHiragana(text || '', { passRomaji: true, convertLongVowelMark: false });
export const romaji = text => toRomaji(text || '');

// Anchor kana (送り仮名) so 読みます becomes 読[よ]みます instead of one large ruby.
export function rubyParts(surface, reading) {
  if (!reading || !hasKanji(surface)) return [{ text: surface, reading: '' }];
  const kana = hiragana(reading);
  const groups = surface.match(/[\p{Script=Han}々〆]+|[^\p{Script=Han}々〆]+/gu) || [surface];
  function align(index, offset) {
    if (index === groups.length) return offset === kana.length ? [] : null;
    const text = groups[index];
    if (!hasKanji(text)) {
      const anchor = hiragana(text);
      if (!kana.startsWith(anchor, offset)) return null;
      const rest = align(index + 1, offset + anchor.length);
      return rest && [{ text, reading: '' }, ...rest];
    }
    for (let end = offset + 1; end <= kana.length; end++) {
      const rest = align(index + 1, end);
      if (rest) return [{ text, reading: kana.slice(offset, end) }, ...rest];
    }
    return null;
  }
  return align(0, 0) || [{ text: surface, reading: kana }];
}

export function normalizeToken(token) {
  const surface = token.surface_form;
  const reading = token.reading && token.reading !== '*' ? hiragana(token.reading) : (hasKanji(surface) ? '' : hiragana(surface));
  return { surface, reading, base: token.basic_form && token.basic_form !== '*' ? token.basic_form : surface, pos: token.pos || '', romaji: romaji(reading) };
}

export function wordId(word) { return `${word.base || word.surface}\u241f${word.reading || ''}`; }

export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}

export function sanitizeWord(word) {
  if (!word || typeof word.surface !== 'string' || !word.surface.trim()) throw new Error('单词内容无效');
  const item = {};
  for (const [key, max] of Object.entries({ surface: 100, base: 100, reading: 150, romaji: 300, pos: 60, meaning: 2000, provider: 80, sentence: 600, sourceTitle: 300, note: 2000 })) {
    item[key] = typeof word[key] === 'string' ? word[key].slice(0, max) : '';
  }
  item.base ||= item.surface;
  item.sourceUrl = safeUrl(word.sourceUrl);
  item.id = wordId(item);
  item.mastered = word.mastered === true;
  item.createdAt = Number.isFinite(word.createdAt) && word.createdAt > 0 ? Math.min(word.createdAt, Date.now()) : Date.now();
  return item;
}

export function csvText(words) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [['单词', '原形', '假名', '罗马音', '释义', '例句', '笔记', '状态'], ...words.map(w => [w.surface, w.base, w.reading, w.romaji, w.meaning, w.sentence, w.note, w.mastered ? '已掌握' : '学习中'])].map(row => row.map(cell).join(',')).join('\r\n');
}
