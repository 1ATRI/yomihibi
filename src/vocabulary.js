import { $, el, request, notify, download, speak } from './shared/api.js';
import { csvText, safeUrl } from './shared/japanese.js';
let words = [], filter = 'all', page = 1;
const pageSize = 24;
$('#today').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

async function reload() { words = await request('GET_WORDS'); render(); }
function render() {
  const mastered = words.filter(w => w.mastered).length;
  $('#stat-total').textContent = words.length;
  $('#stat-mastered').textContent = mastered;
  $('#stat-learning').textContent = words.length - mastered;
  $('#nav-count').textContent = words.length;
  const query = $('#search').value.trim().toLocaleLowerCase();
  let visible = words.filter(w => (filter === 'all' || w.mastered === (filter === 'mastered')) && [w.surface, w.base, w.reading, w.meaning, w.romaji, w.note].some(t => t?.toLocaleLowerCase().includes(query)));
  const sort = $('#sort').value;
  visible.sort(sort === 'kana' ? (a, b) => (a.reading || a.surface).localeCompare(b.reading || b.surface, 'ja') : (a, b) => sort === 'oldest' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  $('#collection-count').textContent = visible.length;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize)); page = Math.min(page, pages);
  $('#words').replaceChildren(...visible.slice((page - 1) * pageSize, page * pageSize).map(wordCard));
  $('#empty').hidden = words.length > 0;
  $('#no-results').hidden = !words.length || !!visible.length;
  $('#pagination').hidden = pages === 1;
  $('#page-number').textContent = `${page} / ${pages}`;
  $('#previous').disabled = page <= 1; $('#next').disabled = page >= pages;
}
function wordCard(word) {
  const article = el('article', 'word-card');
  const top = el('div', 'word-card-top');
  top.append(el('span', `study-tag ${word.mastered ? 'mastered' : ''}`, word.mastered ? '✓ 已掌握' : '• 学习中'));
  const audio = el('button', 'audio-button', '▷'); audio.title = `朗读 ${word.surface}`; audio.setAttribute('aria-label', `朗读 ${word.surface}`); audio.onclick = () => speak(word.surface).catch(e => notify(e.message, true)); top.append(audio);
  const open = el('button', 'word-open'); open.onclick = () => showDetail(word.id);
  open.append(el('span', 'card-reading', word.reading || '暂无读音'), el('h3', '', word.surface), el('span', 'card-romaji', word.romaji || '—'));
  const meaning = el('p', 'card-meaning', word.meaning || '尚未添加释义，点击词语补充');
  const sentence = el('p', 'card-sentence', word.sentence || '在阅读中遇见这个词'); sentence.lang = 'ja';
  const footer = el('div', 'word-card-footer'); footer.append(el('span', '', word.pos || '词语'));
  const learned = el('button', 'text-button', word.mastered ? '重新学习 ↺' : '标为掌握 ✓');
  learned.onclick = () => request('UPDATE_WORD', { id: word.id, changes: { mastered: !word.mastered } }).then(reload).catch(e => notify(e.message, true));
  footer.append(learned); article.append(top, open, meaning, sentence, footer); return article;
}
function showDetail(id) {
  const word = words.find(w => w.id === id); if (!word) return;
  const container = $('#word-detail'); container.replaceChildren();
  container.append(el('div', 'eyebrow', 'A WORD TO REMEMBER'), el('p', 'detail-reading', word.reading), el('h2', 'detail-title', word.surface), el('p', 'muted', `${word.romaji} · ${word.pos} · 原形 ${word.base}`));
  const meaningLabel = el('label', 'field-label', '中文释义'); const meaning = el('textarea'); meaning.value = word.meaning; meaning.rows = 3; meaning.maxLength = 2000; meaningLabel.append(meaning);
  const example = el('blockquote', 'detail-example', word.sentence || '还没有例句'); example.lang = 'ja';
  const noteLabel = el('label', 'field-label', '我的笔记'); const note = el('textarea'); note.value = word.note || ''; note.rows = 3; note.maxLength = 2000; note.placeholder = '用自己的话记住这个词…'; noteLabel.append(note);
  container.append(meaningLabel, example, noteLabel);
  if (safeUrl(word.sourceUrl)) { const link = el('a', 'source-link', `${word.sourceTitle || '回到原文'} ↗`); link.href = safeUrl(word.sourceUrl); link.target = '_blank'; link.rel = 'noopener noreferrer'; container.append(link); }
  const actions = el('div', 'dialog-actions');
  const remove = el('button', 'danger-link', '移除收藏'); let confirmRemove = false;
  remove.onclick = async () => {
    if (!confirmRemove) { confirmRemove = true; remove.textContent = '再次点击确认移除'; return; }
    try { await request('DELETE_WORD', { id }); $('#word-dialog').close(); await reload(); notify('已移除收藏'); }
    catch (error) { notify(error.message, true); }
  };
  const save = el('button', 'primary', '保存笔记'); save.onclick = async () => {
    try { await request('UPDATE_WORD', { id, changes: { note: note.value, meaning: meaning.value } }); $('#word-dialog').close(); await reload(); notify('已保存'); }
    catch (error) { notify(error.message, true); }
  };
  actions.append(remove, save); container.append(actions); $('#word-dialog').showModal();
}
for (const button of document.querySelectorAll('[data-filter]')) button.onclick = () => {
  filter = button.dataset.filter; page = 1;
  for (const tab of document.querySelectorAll('[data-filter]')) tab.setAttribute('aria-selected', String(tab === button));
  render();
};
$('#search').oninput = () => { page = 1; render(); }; $('#sort').onchange = () => { page = 1; render(); };
$('#previous').onclick = () => { page--; render(); }; $('#next').onclick = () => { page++; render(); };
$('#export').onclick = () => $('#export-dialog').showModal();
$('#export-json').onclick = () => { download('yomihibi-words.json', JSON.stringify({ app: 'yomihibi', version: 1, exportedAt: new Date().toISOString(), words }, null, 2), 'application/json'); $('#export-dialog').close(); };
$('#export-csv').onclick = () => { download('yomihibi-words.csv', csvText(words), 'text/csv;charset=utf-8'); $('#export-dialog').close(); };
$('#import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) throw new Error('备份文件不能超过 8 MB');
    const json = JSON.parse(await file.text());
    if (json.app !== 'yomihibi' || json.version !== 1) throw new Error('请选择读日和导出的 JSON 备份文件');
    const result = await request('IMPORT_WORDS', { words: json.words }); await reload(); notify(`导入成功，新增 ${result.added} 个词语（重复词保留原笔记）`);
  } catch (error) { notify(error instanceof SyntaxError ? '文件不是有效的 JSON 备份' : error.message, true); }
  finally { event.target.value = ''; }
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.words) reload().catch(e => notify(e.message, true)); });
reload().catch(error => notify(error.message, true));
