import { tokenizeTexts } from './tokenizer.js';
import { translate } from './translation.js';
import { sanitizeWord, wordId } from './shared/japanese.js';
import { analyzeEnglish } from './analysis/english.js';
import { japaneseRoles } from './analysis/japanese.js';
import { reviewState, scheduleReview } from './shared/review.js';

const defaults = { provider: 'mymemory', showFurigana: true, rubySize: 60, azureKey: '', azureRegion: '', language: 'auto', highlightSubject: true, highlightBackbone: true, showChineseJa: false, showChineseEn: false };
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
let writeQueue = Promise.resolve();
const cache = new Map();
const inFlight = new Map();
const serialize = action => {
  const next = writeQueue.then(action);
  writeQueue = next.catch(() => {});
  return next;
};
async function getSettings() {
  await storageReady;
  return { ...defaults, ...(await chrome.storage.local.get('settings')).settings };
}
async function getWords() {
  await storageReady;
  return ((await chrome.storage.local.get('words')).words || []).map(w => ({ ...w, language: w.language === 'en' ? 'en' : 'ja', review: reviewState(w.review) }));
}
const publicSettings = ({ azureKey, azureRegion, ...settings }) => settings;

async function pageState(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { type: 'YH_STATUS' }); }
  catch { return { enabled: false, count: 0, busy: false }; }
}

async function toggleReading(tabId) {
  if (!Number.isInteger(tabId)) throw new Error('找不到当前网页');
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//.test(tab.url || '') || /^(https?:\/\/)(chromewebstore.google.com|microsoftedge.microsoft.com)\//.test(tab.url)) {
    throw new Error('请在普通网页中使用；浏览器设置页、扩展商店和 PDF 不支持注音');
  }
  const state = await pageState(tabId);
  if (!state.installed) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch {
      throw new Error('无法访问此页面，请先打开普通网页，再点击插件图标重试');
    }
  }
  return chrome.tabs.sendMessage(tabId, { type: 'YH_SET', enabled: !state.enabled, settings: publicSettings(await getSettings()) });
}

async function translation(text, language = 'ja', inline = false) {
  if (typeof text !== 'string' || !text.trim() || text.length > 100) throw new Error('请选择 100 字以内的单词');
  if (!['ja', 'en'].includes(language)) throw new Error('不支持的语言');
  const settings = await getSettings();
  if (inline && (!settings[language === 'en' ? 'showChineseEn' : 'showChineseJa'] || settings.provider === 'bing')) throw new Error('当前语言未开启中文标注，或翻译服务为 Bing 网页模式');
  const key = `${settings.provider}:${language}:${text}`;
  if (cache.has(key)) return cache.get(key);
  if (!inFlight.has(key)) {
    inFlight.set(key, translate(text, settings, fetch, language).then(result => {
      if (cache.size >= 800) cache.delete(cache.keys().next().value);
      cache.set(key, result);
      return result;
    }).catch(error => {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('翻译请求超时，可重试或打开 Bing 翻译');
      if (error instanceof TypeError) throw new Error('网络连接失败，可重试或打开 Bing 翻译');
      throw error;
    }).finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

async function handle(message, sender) {
  if (!message || typeof message.type !== 'string') throw new Error('无效请求');
  const trusted = sender.url?.startsWith(chrome.runtime.getURL(''));
  const trustedTypes = new Set(['GET_SETTINGS', 'SAVE_SETTINGS', 'GET_WORDS', 'DELETE_WORD', 'UPDATE_WORD', 'IMPORT_WORDS', 'TOGGLE_TAB', 'PAGE_STATE', 'REVIEW_WORD']);
  if (trustedTypes.has(message.type) && !trusted) throw new Error('此操作仅允许在插件页面中执行');
  switch (message.type) {
    case 'GET_SETTINGS': return getSettings();
    case 'SAVE_SETTINGS': return serialize(async () => {
      const input = { ...await getSettings(), ...message.settings };
      if (!input || !['mymemory', 'microsoft', 'bing'].includes(input.provider)) throw new Error('翻译设置无效');
      const settings = {
        provider: input.provider, showFurigana: input.showFurigana !== false,
        language: ['auto', 'ja', 'en'].includes(input.language) ? input.language : 'auto',
        highlightSubject: input.highlightSubject === true, highlightBackbone: input.highlightBackbone === true,
        showChineseJa: input.showChineseJa === true, showChineseEn: input.showChineseEn === true,
        rubySize: Math.min(85, Math.max(45, Number(input.rubySize) || 60)),
        azureKey: String(input.azureKey || '').trim().slice(0, 300),
        azureRegion: String(input.azureRegion || '').trim().slice(0, 80)
      };
      await chrome.storage.local.set({ settings });
      cache.clear();
      // Broadcast only display preferences; API keys never enter web pages.
      const tabs = await chrome.tabs.query({});
      await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'YH_PREFERENCES', settings: publicSettings(settings) })));
      return true;
    });
    case 'TOKENIZE': {
      const texts = message.texts;
      if (!Array.isArray(texts) || texts.length > 80 || texts.some(t => typeof t !== 'string') || texts.reduce((n, t) => n + t.length, 0) > 16000) throw new Error('待注音文本过长');
      const languages = message.languages || texts.map(() => 'ja');
      if (!Array.isArray(languages) || languages.length !== texts.length || languages.some(l => !['ja', 'en'].includes(l))) throw new Error('语言参数无效');
      const ja = await (languages.includes('ja') ? tokenizeTexts(texts.filter((_, i) => languages[i] === 'ja')) : Promise.resolve([]));
      let index = 0;
      return texts.map((text, i) => languages[i] === 'en' ? analyzeEnglish(text) : japaneseRoles(ja[index++]));
    }
    case 'TRANSLATE': return translation(message.text, message.language || 'ja');
    case 'TRANSLATE_INLINE': return translation(message.text, message.language, true);
    case 'GET_WORDS': return getWords();
    case 'HAS_WORD': return (await getWords()).some(w => w.id === wordId(message.word || {}));
    case 'SAVE_WORD': return serialize(async () => {
      const word = sanitizeWord(message.word);
      const words = await getWords();
      const existing = words.find(w => w.id === word.id);
      if (existing) return { saved: true, duplicate: true };
      if (words.length >= 5000) throw new Error('单词本已达到 5000 词，请导出备份后整理');
      await chrome.storage.local.set({ words: [word, ...words] });
      return { saved: true };
    });
    case 'DELETE_WORD': return serialize(async () => {
      await chrome.storage.local.set({ words: (await getWords()).filter(w => w.id !== message.id) });
      return true;
    });
    case 'UPDATE_WORD': return serialize(async () => {
      const words = await getWords();
      const index = words.findIndex(w => w.id === message.id);
      if (index < 0) throw new Error('该单词已被移除');
      const changes = message.changes || {};
      for (const key of ['note', 'meaning']) if (typeof changes[key] === 'string') words[index][key] = changes[key].slice(0, 2000);
      if (typeof changes.mastered === 'boolean') {
        if (words[index].mastered && !changes.mastered) words[index].review = { ...reviewState(words[index].review), dueAt: 0 };
        words[index].mastered = changes.mastered;
      }
      await chrome.storage.local.set({ words });
      return true;
    });
    case 'REVIEW_WORD': return serialize(async () => {
      if (typeof message.reviewId !== 'string' || !/^[\w-]{8,100}$/.test(message.reviewId)) throw new Error('复习记录标识无效');
      const words = await getWords();
      const word = words.find(w => w.id === message.id);
      if (!word) throw new Error('这个词已被删除，请重新开始练习');
      if (!word.meaning.trim()) throw new Error('请先在单词本补充释义');
      if (word.review.lastReviewId === message.reviewId) return { word, duplicate: true };
      word.review = scheduleReview(word.review, message.grade, Date.now(), message.reviewId);
      await chrome.storage.local.set({ words });
      return { word };
    });
    case 'IMPORT_WORDS': return serialize(async () => {
      if (!Array.isArray(message.words) || message.words.length > 5000) throw new Error('备份格式不正确，或超过 5000 词上限');
      const incoming = message.words.map(sanitizeWord);
      const map = new Map((await getWords()).map(w => [w.id, w]));
      const before = map.size;
      for (const word of incoming) if (!map.has(word.id)) map.set(word.id, word);
      if (map.size > 5000) throw new Error('合并后超过 5000 词上限');
      await chrome.storage.local.set({ words: [...map.values()].sort((a, b) => b.createdAt - a.createdAt) });
      return { added: map.size - before };
    });
    case 'TOGGLE_TAB': return toggleReading(message.tabId);
    case 'PAGE_STATE': return pageState(message.tabId);
    case 'OPEN_VOCAB': await chrome.tabs.create({ url: chrome.runtime.getURL('vocabulary.html') }); return true;
    case 'SPEAK': {
      if (typeof message.text !== 'string' || message.text.length > 200) throw new Error('朗读内容无效');
      const language = message.language === 'en' ? 'en' : 'ja';
      const voices = await chrome.tts.getVoices();
      const voice = voices.find(v => v.lang?.startsWith(language));
      if (!voice) throw new Error(`浏览器没有${language === 'en' ? '英语' : '日语'}语音，请安装对应语音包，或使用 Bing 的朗读`);
      chrome.tts.stop();
      await chrome.tts.speak(message.text, { lang: language === 'en' ? 'en-US' : 'ja-JP', voiceName: voice.voiceName, rate: 0.85 });
      return true;
    }
    default: throw new Error('未知操作');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type?.startsWith('YH_')) return false;
  handle(message, sender).then(data => sendResponse({ ok: true, data })).catch(error => sendResponse({ ok: false, error: error.message || '操作失败，请重试' }));
  return true;
});
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-reading') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { await toggleReading(tab.id); }
  catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: error.message });
  }
});
