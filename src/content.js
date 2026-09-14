import { request, el } from './shared/api.js';
import { hasJapanese, rubyParts } from './shared/japanese.js';
import cardStyles from './styles/card.css';

if (!globalThis.__yomihibiInstalled) {
  globalThis.__yomihibiInstalled = true;
  install();
}

function install() {
  const isDemo = location.href === chrome.runtime.getURL('demo.html');
  const readingRoot = isDemo ? document.querySelector('#demo-article') : document.body;
  const skip = 'script,style,noscript,textarea,input,select,option,button,pre,code,kbd,samp,svg,math,ruby,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[hidden],[aria-hidden="true"],.yh-run,#yh-overlay';
  let enabled = false, busy = false, count = 0, generation = 0, timer, lastError = '';
  const pendingRoots = new Set();
  const tokenData = new WeakMap();
  const runs = new Set();
  let overlay, shadow, card, toast, cardGeneration = 0, previousFocus;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') queue(record.target.parentElement);
      else for (const node of record.addedNodes) queue(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    }
  });
  const status = () => ({ installed: true, enabled, busy, count, error: lastError });

  function ui() {
    if (overlay?.isConnected) return;
    overlay = el('div'); overlay.id = 'yh-overlay';
    overlay.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    shadow = overlay.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = cardStyles; shadow.append(style);
    toast = el('div', 'toast'); toast.setAttribute('role', 'status'); toast.hidden = true; shadow.append(toast);
    document.documentElement.append(overlay);
  }
  function feedback(text, error = false, persistent = false) {
    ui(); toast.textContent = text; toast.classList.toggle('error', error); toast.hidden = false;
    clearTimeout(feedback.timer);
    if (!persistent) feedback.timer = setTimeout(() => { toast.hidden = true; }, 3500);
  }
  function closeCard() {
    cardGeneration++; card?.remove(); card = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function preferences(settings) {
    document.documentElement.classList.toggle('yh-hide-ruby', !settings.showFurigana);
    document.documentElement.style.setProperty('--yh-ruby-size', `${settings.rubySize || 60}%`);
  }
  function eligible(node) {
    return node?.nodeType === Node.TEXT_NODE && node.isConnected && node.parentElement && !node.parentElement.closest(skip) && node.nodeValue.trim() && hasJapanese(node.nodeValue);
  }
  function queue(root) {
    if (!enabled || !root?.isConnected || root.nodeType !== Node.ELEMENT_NODE || root.closest(skip)) return;
    pendingRoots.add(root);
    clearTimeout(timer); timer = setTimeout(process, 200);
  }
  async function process() {
    if (busy || !enabled) return;
    busy = true;
    const epoch = generation;
    try {
      while (pendingRoots.size && enabled && epoch === generation) {
        const roots = [...pendingRoots]; pendingRoots.clear();
        const nodes = new Set();
        for (const root of roots) {
          if (!root.isConnected || root.closest(skip)) continue;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => eligible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
          while (walker.nextNode()) nodes.add(walker.currentNode);
        }
        let batch = [], length = 0;
        const flush = async () => {
          const current = batch; batch = []; length = 0;
          if (!current.length || !enabled || epoch !== generation) return;
          const result = await request('TOKENIZE', { texts: current.map(item => item.text) });
          if (!enabled || epoch !== generation) return;
          observer.disconnect();
          try {
            current.forEach(({ node, text }, i) => {
              if (!eligible(node) || node.nodeValue !== text) return;
              const tokens = result[i];
              // Never lose whitespace, emoji, or unsupported text if a tokenizer changes it.
              if (!tokens || tokens.map(t => t.surface).join('') !== text) return;
              const wrapper = el('span', 'yh-run');
              const sentence = text.trim().slice(0, 600);
              for (const token of tokens) {
                if (!hasJapanese(token.surface) || token.pos === '記号') { wrapper.append(document.createTextNode(token.surface)); continue; }
                const word = el('span', 'yh-word');
                word.tabIndex = 0; word.setAttribute('role', 'button');
                word.setAttribute('aria-label', `${token.surface}${token.reading ? `（${token.reading}）` : ''}，点击查词`);
                for (const part of rubyParts(token.surface, token.reading)) {
                  if (part.reading) { const ruby = el('ruby', '', part.text); ruby.append(el('rt', '', part.reading)); word.append(ruby); }
                  else word.append(document.createTextNode(part.text));
                }
                tokenData.set(word, { ...token, sentence }); wrapper.append(word); count++;
              }
              node.replaceWith(wrapper); runs.add(wrapper);
            });
          } finally { if (enabled) observer.observe(readingRoot, { childList: true, subtree: true, characterData: true }); }
          await new Promise(resolve => setTimeout(resolve, 0));
        };
        for (const node of nodes) {
          if (!enabled || epoch !== generation) break;
          // Split very long text nodes into manageable pieces, preserving every character.
          if (node.length > 4000) {
            observer.disconnect();
            let rest = node;
            while (rest.length > 4000) {
              let at = 4000;
              if (/[\uD800-\uDBFF]/.test(rest.nodeValue[at - 1])) at--;
              const next = rest.splitText(at); nodes.add(next); rest = next;
            }
            observer.observe(readingRoot, { childList: true, subtree: true, characterData: true });
          }
          const text = node.nodeValue;
          if (length + text.length > 12000 || batch.length >= 40) await flush();
          batch.push({ node, text }); length += text.length;
        }
        await flush();
      }
      if (enabled && epoch === generation) feedback(count ? `已开启阅读辅助 · 点击词语查词` : '当前页面未找到可注音的日语文本');
    } catch (error) {
      if (enabled && epoch === generation) { lastError = error.message; feedback(lastError, true); }
    } finally {
      busy = false;
      if (enabled && pendingRoots.size) timer = setTimeout(process, 100);
    }
  }

  function setEnabled(value, settings) {
    enabled = value; generation++; lastError = '';
    if (enabled) {
      preferences(settings); feedback('正在加载离线词典并标注假名…', false, true);
      observer.observe(readingRoot, { childList: true, subtree: true, characterData: true });
      queue(readingRoot);
    } else {
      observer.disconnect(); clearTimeout(timer); pendingRoots.clear(); closeCard();
      for (const run of runs) {
        if (!run.isConnected) continue;
        for (const rt of run.querySelectorAll('rt')) rt.remove();
        // Preserve current page text; do not overwrite edits with a stale snapshot.
        run.replaceWith(document.createTextNode(run.textContent));
      }
      runs.clear(); count = 0;
      document.documentElement.classList.remove('yh-hide-ruby');
      document.documentElement.style.removeProperty('--yh-ruby-size');
      feedback('已关闭阅读辅助');
    }
    return status();
  }

  async function lookup(target) {
    const token = tokenData.get(target);
    if (!token) return;
    ui(); closeCard(); previousFocus = target;
    const current = ++cardGeneration;
    card = el('section', 'card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', `${token.surface}的释义`);
    const header = el('div', 'card-top'); header.append(el('span', 'brand', '読 · 读日和'));
    const close = el('button', 'icon', '×'); close.title = '关闭（Esc）'; close.setAttribute('aria-label', '关闭查词'); close.onclick = closeCard; header.append(close);
    const title = el('div', 'word-line'); title.append(el('h2', '', token.surface));
    const audio = el('button', 'audio', '▷ 朗读'); audio.onclick = () => request('SPEAK', { text: token.surface }).catch(e => feedback(e.message, true)); title.append(audio);
    const pronunciation = el('p', 'pronunciation', `${token.reading || '暂无读音'}${token.romaji ? `  /  ${token.romaji}` : ''}`);
    const meta = el('div', 'meta'); meta.append(el('span', 'tag', token.pos));
    if (token.base !== token.surface) meta.append(el('span', '', `原形 ${token.base}`));
    const meaning = el('p', 'meaning', '正在查询中文释义…'); meaning.setAttribute('aria-live', 'polite');
    const source = el('div', 'source', '仅将选中的词语发送给翻译服务');
    const actions = el('div', 'actions');
    const save = el('button', 'save', '＋ 收藏单词');
    save.disabled = true;
    let alreadySaved = false;
    let entry = { ...token, meaning: '', provider: '', sourceTitle: document.title, sourceUrl: location.href };
    save.onclick = async () => {
      save.disabled = true;
      try { await request('SAVE_WORD', { word: entry }); alreadySaved = true; save.textContent = '✓ 已收藏'; }
      catch (error) { save.disabled = false; feedback(error.message, true); }
    };
    const bing = el('a', 'external', 'Bing 翻译 ↗'); bing.target = '_blank'; bing.rel = 'noopener noreferrer';
    bing.href = `https://www.bing.com/translator?from=ja&to=zh-Hans&text=${encodeURIComponent(token.base)}`;
    actions.append(save, bing);
    const vocab = el('button', 'vocab-link', '打开我的单词本 →'); vocab.onclick = () => request('OPEN_VOCAB').catch(e => feedback(e.message, true));
    card.append(header, title, pronunciation, meta, meaning, source, actions, vocab); shadow.append(card);
    const rect = target.getBoundingClientRect();
    card.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - Math.min(360, innerWidth - 24) - 12))}px`;
    const height = card.getBoundingClientRect().height;
    card.style.top = `${Math.max(12, Math.min(rect.bottom + 10, innerHeight - height - 12))}px`;
    close.focus({ preventScroll: true });
    request('HAS_WORD', { word: token }).then(saved => {
      if (current !== cardGeneration || !saved) return;
      alreadySaved = true; save.textContent = '✓ 已收藏'; save.disabled = true;
    }).catch(() => {});
    try {
      const result = await request('TRANSLATE', { text: token.base });
      if (current !== cardGeneration) return;
      entry = { ...entry, ...result };
      meaning.textContent = result.external ? '点击下方「Bing 翻译」查看中文释义。' : decodeEntities(result.meaning);
      entry.meaning = result.external ? '' : meaning.textContent;
      source.textContent = `${result.provider} · 机器翻译仅供阅读参考`;
    } catch (error) {
      if (current !== cardGeneration) return;
      meaning.textContent = error.message; meaning.classList.add('error'); source.textContent = '仍可收藏词语，并在单词本中补充释义';
    } finally {
      if (current === cardGeneration) save.disabled = alreadySaved;
    }
  }
  function decodeEntities(text) {
    // A detached textarea decodes translation entities; it is never inserted or executed.
    const decoder = document.createElement('textarea'); decoder.innerHTML = text.replaceAll('<', '&lt;'); return decoder.value;
  }
  document.addEventListener('click', event => {
    if (!enabled || event.composedPath().includes(overlay)) return;
    const target = event.target.closest?.('.yh-word');
    if (target && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !getSelection()?.toString()) {
      event.preventDefault(); event.stopImmediatePropagation(); lookup(target);
    } else if (!target) closeCard();
  }, true);
  document.addEventListener('keydown', event => {
    if (!enabled) return;
    if (event.key === 'Escape') { closeCard(); return; }
    const target = event.target.closest?.('.yh-word');
    if (target && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); lookup(target); }
  }, true);
  window.addEventListener('resize', closeCard);
  if (isDemo) globalThis.__yomihibiDemo = { get enabled() { return enabled; }, set: setEnabled, status };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'YH_STATUS') respond(status());
    if (message.type === 'YH_SET') respond(setEnabled(message.enabled, message.settings));
    if (message.type === 'YH_PREFERENCES') { if (enabled) preferences(message.settings); respond(status()); }
  });
}
