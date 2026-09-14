export async function request(type, data = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || '插件连接已断开，请刷新网页后重试');
  return response.data;
}
export const $ = (selector, root = document) => root.querySelector(selector);
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function notify(text, isError = false) {
  const node = $('#toast');
  node.textContent = text;
  node.classList.toggle('error', isError);
  node.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { node.hidden = true; }, 4000);
}
export async function speak(text, language = 'ja') { return request('SPEAK', { text, language }); }
export function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = el('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
