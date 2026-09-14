import { request } from './shared/api.js';

// Only observed viewport words are translated. Two requests at a time, a visible
// per-page budget, and a pause on failure keep free translation quotas predictable.
export class InlineTranslations {
  constructor(onResult, onState) {
    this.onResult = onResult; this.onState = onState; this.epoch = 0; this.settings = {};
    this.cache = new Map(); this.reset({});
  }
  reset(settings) {
    this.epoch++; this.observer?.disconnect(); clearTimeout(this.timer);
    this.settings = settings; this.entries = new Map(); this.queue = [];
    this.active = 0; this.used = 0; this.done = 0; this.limit = 120; this.error = ''; this.paused = false;
    this.observer = new IntersectionObserver(changes => {
      for (const change of changes) if (change.isIntersecting) {
        const entry = this.nodes.get(change.target);
        if (entry && !entry.queued && !entry.finished) { entry.queued = true; this.queue.push(entry); }
        this.observer.unobserve(change.target);
      }
      this.pump();
    }, { rootMargin: '80px' });
    this.nodes = new WeakMap(); this.report();
  }
  wants(language) { return !!this.settings[language === 'en' ? 'showChineseEn' : 'showChineseJa']; }
  register(node, token) {
    if (!this.wants(token.language)) return;
    if (this.settings.provider === 'bing') { this.error = 'Bing 网页模式无法在原文上方显示中文，请在设置中选择自动翻译服务。'; this.report(); return; }
    if (!token.base?.trim() || token.base.length > 100) return;
    const key = `${this.settings.provider}:${token.language}:${token.base}`;
    if (this.cache.has(key)) { this.onResult(node, token, this.cache.get(key)); return; }
    let entry = this.entries.get(key);
    if (!entry) { entry = { key, token, nodes: new Set(), queued: false, finished: false }; this.entries.set(key, entry); }
    entry.nodes.add(node); this.nodes.set(node, entry); this.observer.observe(node);
  }
  report() { this.onState?.({ enabled: this.wants('ja') || this.wants('en'), used: this.used, done: this.done, pending: this.queue.length + this.active, limited: this.used >= this.limit && this.queue.length > 0, paused: this.paused, error: this.error }); }
  resume() { this.limit += 120; this.paused = false; this.error = ''; this.pump(); }
  pump() {
    clearTimeout(this.timer);
    if (this.paused || this.used >= this.limit || this.active >= 2 || !this.queue.length) { this.report(); return; }
    const entry = this.queue.shift();
    if (![...entry.nodes].some(node => node.isConnected)) { this.pump(); return; }
    const epoch = this.epoch;
    this.used++; this.active++; this.report();
    request('TRANSLATE_INLINE', { text: entry.token.base, language: entry.token.language }).then(result => {
      if (epoch !== this.epoch) return;
      entry.finished = true; this.done++;
      if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(entry.key, result);
      for (const node of entry.nodes) if (node.isConnected) this.onResult(node, this.nodes.get(node)?.token || entry.token, result);
    }).catch(error => {
      if (epoch !== this.epoch) return;
      this.error = error.message; this.paused = true; this.queue.unshift(entry);
    }).finally(() => {
      if (epoch !== this.epoch) return;
      this.active--; this.report();
      if (!this.paused) this.timer = setTimeout(() => this.pump(), 300);
    });
    this.timer = setTimeout(() => this.pump(), 300);
  }
  stop() { this.reset({}); }
}
