import { splitSentences } from '../shared/language.js';

// IPADIC is a morphological dictionary, not a dependency parser. These conservative
// phrase rules label a candidate backbone; は is always labelled topic, not subject.
export function japaneseRoles(tokens) {
  const result = tokens.map(t => ({ ...t, language: 'ja', role: '' }));
  for (const sentence of splitSentences(result)) {
    const wordlike = t => ['名詞', '接頭詞', '形容詞', '連体詞'].includes(t.pos) || t.surface === 'の';
    for (let i = 0; i < sentence.length; i++) {
      const particle = sentence[i];
      if (particle.pos !== '助詞' || !['は', 'が', 'を'].includes(particle.surface) || particle.detail === '接続助詞') continue;
      let start = i - 1;
      while (start >= 0 && /^\s+$/.test(sentence[start].surface)) start--;
      if (start < 0 || sentence[start].pos !== '名詞') continue;
      while (start > 0 && wordlike(sentence[start - 1])) start--;
      const role = particle.surface === 'は' ? 'topic' : particle.surface === 'が' ? 'subject' : 'object';
      for (let n = start; n <= i; n++) sentence[n].role = role;
    }
    // Prefer the final finite predicate. Include auxiliaries and suru verb nouns.
    let last = sentence.length - 1;
    while (last >= 0 && (sentence[last].pos === '記号' || /^\s*$/.test(sentence[last].surface) || sentence[last].detail === '終助詞')) last--;
    if (last < 0) continue;
    let start = last;
    while (start >= 0 && ['助動詞', '動詞', '形容詞'].includes(sentence[start].pos)) start--;
    if (start === last) continue;
    if (start >= 0 && sentence[start].pos === '名詞' && (sentence[start].detail === 'サ変接続' || ['だ', 'です', 'でし'].includes(sentence[start + 1]?.surface))) start--;
    for (let n = start + 1; n <= last; n++) if (!sentence[n].role) sentence[n].role = 'predicate';
  }
  return result;
}
