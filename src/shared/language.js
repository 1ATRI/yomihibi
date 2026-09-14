export const languageName = language => language === 'en' ? '英语' : '日语';
export function detectLanguage(text, preferred = 'auto', hint = '') {
  const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  const han = /\p{Script=Han}/u.test(text);
  const latin = /[A-Za-z]/.test(text);
  if (preferred === 'ja') return japanese || han ? 'ja' : null;
  if (preferred === 'en') return latin && !japanese && !han ? 'en' : null;
  if (japanese) return 'ja';
  if (hint.toLowerCase().startsWith('ja') && han) return 'ja';
  if (han) return null;
  if (latin && (hint.toLowerCase().startsWith('en') || (text.match(/[A-Za-z]+/g)?.length || 0) >= 2)) return 'en';
  return null;
}
export const roleLabels = { subject: '主语 S', topic: '话题 T', predicate: '谓语 V', object: '宾语 O', complement: '补语 C' };
export function splitSentences(tokens) {
  const sentences = []; let current = [];
  for (const token of tokens) {
    current.push(token);
    if (/[。！？!?]|\n/u.test(token.surface) || /\.\s*$/.test(token.surface)) { sentences.push(current); current = []; }
  }
  if (current.length) sentences.push(current);
  return sentences;
}
