import { $, request, notify } from './shared/api.js';
import { isDue } from './shared/review.js';
let tabId, settings, timer;
function render(state) {
  $('#toggle-reading').setAttribute('aria-checked', String(state.enabled));
  $('#status-dot').classList.toggle('active', !!state.enabled);
  $('#page-status').textContent = state.enabled ? '阅读辅助已开启' : '准备开始阅读';
  $('#status-message').textContent = state.error || (state.busy ? '正在分析日英词语与句子…' : state.enabled ? `已识别 ${state.count} 个词语，点击即可查词。` : '开启后，点击日语或英语词语查看释义。');
}
async function refresh() {
  if (!tabId) return;
  try { render(await request('PAGE_STATE', { tabId })); } catch { clearInterval(timer); }
}
async function init() {
  settings = await request('GET_SETTINGS');
  $('#show-furigana').checked = settings.showFurigana;
  $('#reading-language').value = settings.language;
  for (const [id, key] of [['highlight-subject', 'highlightSubject'], ['highlight-backbone', 'highlightBackbone'], ['chinese-ja', 'showChineseJa'], ['chinese-en', 'showChineseEn']]) $(`#${id}`).checked = settings[key];
  const words = await request('GET_WORDS'); $('#word-count').textContent = `${words.length} 词 →`;
  $('#due-count').textContent = `${words.filter(w => isDue(w) && w.meaning?.trim()).length} 词待复习 →`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  const isDemo = tab?.url === chrome.runtime.getURL('demo.html');
  if (isDemo) {
    $('#site-name').textContent = '读日和 · 阅读练习';
    $('#status-message').textContent = '在练习页面点击「开始注音」即可体验。';
    return;
  }
  try { $('#site-name').textContent = new URL(tab?.url).hostname || '当前页面'; }
  catch { $('#site-name').textContent = '请先打开日语或英语网页'; }
  $('#toggle-reading').disabled = false;
  await refresh(); timer = setInterval(refresh, 700);
}
$('#toggle-reading').onclick = async () => {
  $('#toggle-reading').disabled = true;
  try { render(await request('TOGGLE_TAB', { tabId })); }
  catch (error) { $('#status-message').textContent = error.message; }
  finally { $('#toggle-reading').disabled = false; }
};
for (const [id, key] of [['show-furigana', 'showFurigana'], ['reading-language', 'language'], ['highlight-subject', 'highlightSubject'], ['highlight-backbone', 'highlightBackbone'], ['chinese-ja', 'showChineseJa'], ['chinese-en', 'showChineseEn']]) {
  $(`#${id}`).onchange = async event => {
    if (!settings) return;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    try { await request('SAVE_SETTINGS', { settings: { [key]: value } }); settings[key] = value; }
    catch (error) { notify(error.message, true); }
  };
}
window.addEventListener('unload', () => clearInterval(timer));
init().catch(error => notify(error.message, true));
