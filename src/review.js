import { $, request, notify, speak } from './shared/api.js';
import { isDue, reviewQueue } from './shared/review.js';
import { languageName } from './shared/language.js';
let words = [], queue = [], current, revealed = false, processing = false, direction = 'forward';
let initial = 0, attempts = 0, remembered = 0, forgotten = 0;
async function load() { words = await request('GET_WORDS'); availability(); }
function availability() {
  const selected = words.filter(w => $('#review-language').value === 'all' || w.language === $('#review-language').value);
  const due = selected.filter(w => w.meaning?.trim() && isDue(w)).length;
  $('#due-total').textContent = due;
  const ready = selected.filter(w => w.meaning?.trim()).length;
  $('#review-availability').textContent = `共 ${ready} 个词可练习，${selected.length - ready} 个词待补充释义。${!due && ready ? '当前没有到期词，可选择全部收藏提前练习。' : ''}`;
  $('#start-review').disabled = ($('#review-mode').value === 'due' ? due : ready) === 0;
}
function showCurrent() {
  if (!queue.length) { finish(); return; }
  current = queue[0]; revealed = false;
  $('#review-answer').hidden = true; $('#review-grades').hidden = true; $('#reveal-answer').hidden = false;
  $('#review-badge').textContent = `${languageName(current.language)} · ${current.review?.reviews ? '再见的词' : '新的词'}`;
  $('#review-prompt').textContent = direction === 'forward' ? '这个词，是什么意思？' : '这个意思，如何表达？';
  $('#review-front').textContent = direction === 'forward' ? current.surface : current.meaning;
  $('#review-front').lang = direction === 'forward' ? current.language : 'zh-CN';
  $('#review-back').textContent = direction === 'forward' ? current.meaning : current.surface;
  $('#review-reading').textContent = [current.reading, current.romaji, current.pos].filter(Boolean).join(' · ');
  $('#review-example').textContent = current.sentence || ''; $('#review-example').lang = current.language;
  $('#review-note').textContent = current.note ? `我的笔记：${current.note}` : '';
  $('#review-progress').textContent = `已练 ${attempts} 次 · 剩余 ${queue.length} 词`;
  $('#review-progress-fill').style.width = `${Math.max(0, (initial - queue.length) / initial) * 100}%`;
  $('#reveal-answer').focus({ preventScroll: true });
}
function reveal() { if (!current || revealed || processing) return; revealed = true; $('#review-answer').hidden = false; $('#review-grades').hidden = false; $('#reveal-answer').hidden = true; $('[data-grade="good"]').focus({ preventScroll: true }); }
async function rate(grade) {
  if (!current || !revealed || processing) return;
  processing = true;
  const reviewId = crypto.randomUUID();
  for (const button of document.querySelectorAll('[data-grade]')) button.disabled = true;
  try {
    const { word } = await request('REVIEW_WORD', { id: current.id, grade, reviewId });
    attempts++; queue.shift();
    if (grade === 'again') { forgotten++; queue.push(word); }
    else remembered++;
    showCurrent();
  } catch (error) { notify(error.message, true); }
  finally { processing = false; for (const button of document.querySelectorAll('[data-grade]')) button.disabled = false; }
}
function finish() {
  current = null; queue = []; revealed = false;
  $('#review-session').hidden = true; $('#review-setup').hidden = true; $('#review-summary').hidden = false;
  $('#summary-text').textContent = `完成 ${attempts} 次回想，${remembered} 次安排到后续复习，${forgotten} 次选择再认一遍。`;
  $('#review-again').focus({ preventScroll: true });
}
$('#start-review').onclick = async () => {
  try {
    await load();
    queue = reviewQueue(words, { language: $('#review-language').value, mode: $('#review-mode').value, limit: Number($('#review-limit').value) });
    if (!queue.length) { notify('当前没有可练习的词，请调整范围或先收藏并补充释义。'); return; }
    direction = $('#review-direction').value; initial = queue.length; attempts = 0; remembered = 0; forgotten = 0;
    $('#review-setup').hidden = true; $('#review-summary').hidden = true; $('#review-session').hidden = false; showCurrent();
  } catch (error) { notify(error.message, true); }
};
$('#reveal-answer').onclick = reveal;
for (const button of document.querySelectorAll('[data-grade]')) button.onclick = () => rate(button.dataset.grade);
$('#review-audio').onclick = () => { if (current) speak(current.surface, current.language).catch(e => notify(e.message, true)); };
$('#end-review').onclick = () => { if (!processing) finish(); };
$('#review-again').onclick = () => { $('#review-summary').hidden = true; $('#review-setup').hidden = false; load().catch(e => notify(e.message, true)); };
$('#review-language').onchange = availability; $('#review-mode').onchange = availability;
document.addEventListener('keydown', event => {
  if (!current || event.ctrlKey || event.altKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); reveal(); }
  const grade = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }[event.key];
  if (grade && revealed) { event.preventDefault(); rate(grade); }
});
load().catch(e => notify(e.message, true));
