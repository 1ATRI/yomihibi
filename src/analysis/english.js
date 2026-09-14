import nlp from 'compromise';

const posNames = { Pronoun: '代词', Noun: '名词', Verb: '动词', Adjective: '形容词', Adverb: '副词', Preposition: '介词', Determiner: '限定词', Conjunction: '连词', Value: '数词' };
const tagOf = term => Object.keys(posNames).find(tag => term.tags.includes(tag));

export function analyzeEnglish(text) {
  const doc = nlp(text);
  const sentences = doc.json({ terms: true, offset: true });
  const roles = new Map(), lemmas = new Map();
  const key = term => term.index.join(':');
  for (const verb of doc.verbs().json()) {
    for (const term of verb.terms) {
      if (term.tags.includes('Verb') || term.tags.includes('Negative')) roles.set(key(term), 'predicate');
      if (term.normal === verb.verb?.root) lemmas.set(key(term), verb.verb.infinitive);
    }
  }
  for (const group of doc.verbs().subjects().json()) for (const term of group.terms) roles.set(key(term), 'subject');
  for (const sentence of sentences) {
    const terms = sentence.terms;
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      if (term.normal === 'like' && term.chunk === 'Verb' && terms.slice(Math.max(0, i - 2), i).some(t => t.tags.includes('Auxiliary'))) {
        roles.set(key(term), 'predicate'); term.tags = [...term.tags.filter(t => t !== 'Preposition'), 'Verb'];
      }
      if (/^(who|what)$/i.test(term.normal) && i === 0 && roles.get(key(terms[i + 1] || { index: [] })) === 'predicate' && !terms[i + 1].tags.includes('Auxiliary')) roles.set(key(term), 'subject');
    }
    for (let i = 0; i < terms.length; i++) {
      if (roles.get(key(terms[i])) !== 'predicate') continue;
      let end = i;
      while (end + 1 < terms.length && (roles.get(key(terms[end + 1])) === 'predicate' || terms[end + 1].tags.includes('Adverb'))) end++;
      const copula = terms.slice(i, end + 1).some(t => t.tags.includes('Copula'));
      const candidates = [];
      for (let j = end + 1; j < terms.length; j++) {
        const t = terms[j];
        if (roles.has(key(t)) || t.tags.some(tag => ['Preposition', 'Conjunction', 'Adverb'].includes(tag)) || /^(every|each|yesterday|today|tomorrow)$/i.test(t.normal)) break;
        if (!t.tags.some(tag => ['Noun', 'Adjective', 'Determiner', 'Value'].includes(tag))) break;
        candidates.push(t);
        if (/[,:;]/.test(t.post)) break;
      }
      if (candidates.some(t => t.tags.includes('Noun') || (copula && t.tags.includes('Adjective')))) {
        for (const t of candidates) roles.set(key(t), copula ? 'complement' : 'object');
      }
      i = end;
    }
  }
  const tokens = []; let cursor = 0;
  for (const sentence of sentences) for (const term of sentence.terms) {
    const start = term.offset?.start, length = term.offset?.length;
    // Some contractions expand into implicit terms. Emit only ranges that exist in
    // the original string; their base word is left intact instead of inventing text.
    if (!Number.isInteger(start) || start < cursor || !length || start + length > text.length) continue;
    if (start > cursor) tokens.push({ surface: text.slice(cursor, start), pos: '記号', language: 'en' });
    const surface = text.slice(start, start + length);
    let base = lemmas.get(key(term)) || surface.toLowerCase();
    if (!lemmas.has(key(term)) && term.tags.includes('Plural') && !term.tags.includes('Pronoun')) base = nlp(surface).tag('Plural').nouns().toSingular().text().toLowerCase() || base;
    tokens.push({ surface, base, language: 'en', pos: posNames[tagOf(term)] || '词语', reading: '', romaji: '', role: roles.get(key(term)) || '' });
    cursor = start + length;
  }
  if (cursor < text.length) tokens.push({ surface: text.slice(cursor), pos: '記号', language: 'en' });
  return tokens;
}
