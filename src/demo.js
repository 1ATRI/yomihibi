import './content.js';
import { $, request, notify } from './shared/api.js';
// Extension pages do not receive tabs.sendMessage; use the registered content handler
// via a local adapter established exclusively on this bundled exercise page.
$('#start-demo').onclick = async () => {
  try {
    const settings = await request('GET_SETTINGS');
    const next = !globalThis.__yomihibiDemo.enabled;
    globalThis.__yomihibiDemo.set(next, settings);
    $('#start-demo').textContent = next ? '关闭注音' : '开始注音';
    $('#demo-status').textContent = next ? '正在标注，完成后点击词语即可查词。' : '已恢复原文，可以重新开启。';
  } catch (error) { notify(error.message, true); }
};
const statusTimer = setInterval(() => {
  const state = globalThis.__yomihibiDemo.status();
  if (!state.enabled) return;
  $('#demo-status').textContent = state.error || (state.busy ? '正在标注假名…' : `已识别 ${state.count} 个词语，点击即可查词与收藏。`);
}, 500);
window.addEventListener('unload', () => clearInterval(statusTimer));
