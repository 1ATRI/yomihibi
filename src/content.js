import { request, el } from './shared/api.js';
import { hasJapanese, rubyParts } from './shared/japanese.js';
import { detectLanguage, roleLabels, splitSentences } from './shared/language.js';
import { InlineTranslations } from './inline.js';
import cardStyles from './styles/card.css';

if (!globalThis.__yomihibiInstalled) {
  globalThis.__yomihibiInstalled = true;
  install();
}

function install() {
  const isDemo = location.href === chrome.runtime.getURL('demo.html');
  const readingRoot = isDemo ? document.querySelector('#demo-readings') || document.querySelector('#demo-article') : document.body;
  const skip = 'script,style,noscript,textarea,input,select,option,button,pre,code,kbd,samp,svg,math,ruby,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[hidden],[aria-hidden="true"],.yh-run,#yh-overlay';
  let enabled = false, busy = false, count = 0, generation = 0, timer, lastError = '';
  let settings = {}, inlineState = {}, inlineBar, legend;
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
  const inline = new InlineTranslations((node, _token, result) => {
    const token = tokenData.get(node);
    if (!enabled || !token) return;
    token.inline = { ...result, providerId: settings.provider, meaning: decodeEntities(result.meaning || '') };
    renderWord(node, token);
  }, state => { inlineState = state; if (enabled) updateBar(); });
  const status = () => ({ installed: true, enabled, busy, count, error: lastError, inline: inlineState });

  function ui() {
    if (overlay?.isConnected) return;
    overlay = el('div'); overlay.id = 'yh-overlay';
    overlay.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    shadow = overlay.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = cardStyles; shadow.append(style);
    toast = el('div', 'toast'); toast.setAttribute('role', 'status'); toast.hidden = true; shadow.append(toast);
    const tools = el('div', 'reading-tools');
    legend = el('div', 'grammar-legend'); legend.hidden = true;
    for (const [role, text] of Object.entries(roleLabels)) legend.append(el('span', `legend-${role}`, text));
    legend.append(el('small', '', '规则分析 · 仅供参考'));
    inlineBar = el('div', 'inline-progress'); inlineBar.hidden = true;
    tools.append(legend, inlineBar); shadow.append(tools);
    document.documentElement.append(overlay);
  }
  function updateBar() {
    ui(); legend.hidden = !settings.highlightSubject && !settings.highlightBackbone;
    for (const item of legend.children) {
      if (item.tagName === 'SMALL') continue;
      const subject = item.className.includes('subject') || item.className.includes('topic');
      item.hidden = subject ? !settings.highlightSubject : !settings.highlightBackbone;
    }
    inlineBar.hidden = !inlineState.enabled;
    inlineBar.replaceChildren(el('span', '', inlineState.error || (inlineState.limited ? `本轮已查询 ${inlineState.used} 个词` : `中文标注 · 本轮完成 ${inlineState.done} 个词${inlineState.pending ? '，查询中…' : '，滚动继续'}`)));
    if (inlineState.limited || inlineState.paused) {
      const more = el('button', '', inlineState.paused ? '重试' : '继续 120 词'); more.onclick = () => inline.resume(); inlineBar.append(more);
    }
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
  function preferences(next) {
    const oldLanguage = settings.language;
    settings = next;
    document.documentElement.classList.toggle('yh-hide-ruby', !settings.showFurigana);
    document.documentElement.classList.toggle('yh-subject-on', !!settings.highlightSubject);
    document.documentElement.classList.toggle('yh-backbone-on', !!settings.highlightBackbone);
    document.documentElement.style.setProperty('--yh-ruby-size', `${settings.rubySize || 60}%`);
    inline.reset(settings);
    if (oldLanguage && oldLanguage !== settings.language && enabled) {
      generation++; restore(); count = 0; queue(readingRoot);
    } else for (const run of runs) {
      if (!run.isConnected) { runs.delete(run); continue; }
      for (const node of run.querySelectorAll('.yh-word')) {
        const token = tokenData.get(node); if (!token) continue;
        renderWord(node, token); inline.register(node, token);
      }
    }
    updateBar();
  }
  function renderWord(word, token) {
    word.replaceChildren();
    const base = el('span', 'yh-surface');
    const parts = token.language === 'en' ? [{ text: token.surface }] : rubyParts(token.surface, token.reading);
    for (const part of parts) {
      if (part.reading) { const ruby = el('ruby', '', part.text); ruby.append(el('rt', 'yh-kana', part.reading)); base.append(ruby); }
      else base.append(document.createTextNode(part.text));
    }
    if (inline.wants(token.language) && token.inline?.meaning && token.inline.providerId === settings.provider) {
      const translated = el('ruby', 'yh-translated');
      const label = token.inline.meaning.replace(/\s+/g, ' ').trim();
      const rt = el('rt', 'yh-zh', label.length > 14 ? `${label.slice(0, 13)}…` : label); rt.title = label;
      translated.append(base, rt); word.append(translated);
    } else word.append(base);
  }
  function eligible(node) {
    return node?.nodeType === Node.TEXT_NODE && node.isConnected && node.parentElement && !node.parentElement.closest(skip) && node.nodeValue.trim() && languageOf(node);
  }
  const languageOf = node => detectLanguage(node.nodeValue, settings.language, node.parentElement.closest('[lang]')?.lang || '');
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
          const result = await request('TOKENIZE', { texts: current.map(item => item.text), languages: current.map(item => item.language) });
          if (!enabled || epoch !== generation) return;
          observer.disconnect();
          try {
            current.forEach(({ node, text }, i) => {
              if (!eligible(node) || node.nodeValue !== text) return;
              const tokens = result[i];
              // Never lose whitespace, emoji, or unsupported text if a tokenizer changes it.
              if (!tokens || tokens.map(t => t.surface).join('') !== text) return;
              const wrapper = el('span', 'yh-run');
              for (const sentence of splitSentences(tokens)) {
                const plain = sentence.map(t => t.surface).join('').trim().slice(0, 600);
                const backbone = [];
                for (const token of sentence) {
                  if (!token.role) continue;
                  const last = backbone.at(-1);
                  if (last?.role === token.role) last.text += (token.language === 'en' ? ' ' : '') + token.surface;
                  else backbone.push({ role: token.role, text: token.surface });
                }
                for (const token of sentence) { token.sentence = plain; token.backbone = backbone; }
              }
              for (const token of tokens) {
                if (token.pos === '記号' || !(token.language === 'en' ? /[A-Za-z]/.test(token.surface) : hasJapanese(token.surface))) { wrapper.append(document.createTextNode(token.surface)); continue; }
                const word = el('span', 'yh-word');
                word.lang = token.language; word.dataset.role = token.role || '';
                if (token.role) word.title = `${roleLabels[token.role]} · 自动分析，仅供参考`;
                word.tabIndex = 0; word.setAttribute('role', 'button');
                word.setAttribute('aria-label', `${token.surface}${token.reading ? `（${token.reading}）` : ''}，点击查词`);
                tokenData.set(word, token); renderWord(word, token); wrapper.append(word); count++;
              }
              node.replaceWith(wrapper); runs.add(wrapper);
              for (const node of wrapper.querySelectorAll('.yh-word')) inline.register(node, tokenData.get(node));
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
          batch.push({ node, text, language: languageOf(node) }); length += text.length;
        }
        await flush();
      }
      if (enabled && epoch === generation) feedback(count ? `已开启阅读辅助 · 点击词语查词` : '未找到可处理的日语或英语，可在弹窗手动选择语言');
    } catch (error) {
      if (enabled && epoch === generation) { lastError = error.message; feedback(lastError, true); }
    } finally {
      busy = false;
      if (enabled && pendingRoots.size) timer = setTimeout(process, 100);
    }
  }

  function restore() {
    observer.disconnect();
    for (const run of runs) {
      if (!run.isConnected) continue;
      for (const rt of run.querySelectorAll('rt')) rt.remove();
      run.replaceWith(document.createTextNode(run.textContent));
    }
    runs.clear();
    if (enabled) observer.observe(readingRoot, { childList: true, subtree: true, characterData: true });
  }
  function setEnabled(value, nextSettings) {
    enabled = value; generation++; lastError = '';
    if (enabled) {
      preferences(nextSettings); feedback('正在加载本地语言引擎并标记词语…', false, true);
      observer.observe(readingRoot, { childList: true, subtree: true, characterData: true });
      queue(readingRoot);
    } else {
      observer.disconnect(); clearTimeout(timer); pendingRoots.clear(); closeCard();
      inline.stop(); restore(); count = 0;
      if (legend) legend.hidden = true;
      if (inlineBar) inlineBar.hidden = true;
      document.documentElement.classList.remove('yh-hide-ruby', 'yh-subject-on', 'yh-backbone-on');
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
    const audio = el('button', 'audio', '▷ 朗读'); audio.onclick = () => request('SPEAK', { text: token.surface, language: token.language }).catch(e => feedback(e.message, true)); title.append(audio);
    const pronunciation = el('p', 'pronunciation', token.language === 'en' ? 'EN · 英语 · 点击朗读听发音' : `${token.reading || '暂无读音'}${token.romaji ? `  /  ${token.romaji}` : ''}`);
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
    bing.href = `https://www.bing.com/translator?from=${token.language}&to=zh-Hans&text=${encodeURIComponent(token.base)}`;
    actions.append(save, bing);
    const vocab = el('button', 'vocab-link', '打开我的单词本 →'); vocab.onclick = () => request('OPEN_VOCAB').catch(e => feedback(e.message, true));
    card.append(header, title, pronunciation, meta, meaning, source);
    if (settings.highlightSubject || settings.highlightBackbone) {
      const grammar = el('section', 'grammar-card'); grammar.append(el('small', '', '句子主干 · 规则分析，仅供参考'));
      for (const part of token.backbone || []) {
        if (['subject', 'topic'].includes(part.role) ? !settings.highlightSubject : !settings.highlightBackbone) continue;
        const row = el('div', `grammar-row legend-${part.role}`); row.append(el('strong', '', roleLabels[part.role]), el('span', '', part.text)); grammar.append(row);
      }
      if (grammar.children.length === 1) grammar.append(el('p', '', '本句未识别出明确主干，可能存在省略或复杂结构。'));
      card.append(grammar);
    }
    card.append(actions, vocab); shadow.append(card);
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
      const result = await request('TRANSLATE', { text: token.base, language: token.language });
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
