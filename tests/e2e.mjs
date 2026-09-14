import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

const results = [], errors = [];
const mark = name => { results.push(name); console.log(`PASS ${name}`); };
await mkdir('artifacts', { recursive: true });
// Only the disposable fixture gets localhost host access, so injection can be tested
// headlessly without automating the browser toolbar's activeTab user gesture.
await cp('dist', 'artifacts/e2e-extension', { recursive: true });
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'tts']);
assert(!manifest.host_permissions.includes('<all_urls>'));
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile('artifacts/e2e-extension/manifest.json', JSON.stringify(manifest));
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html;charset=utf-8');
  res.end('<!doctype html><html lang="ja"><head><title>日本語テスト</title></head><body><h1>日本語の読書</h1><p id="article">  私は毎日、新しい本を読みます。 😀\n日本語を勉強します。</p><a id="link" href="/next">公園で散歩</a><p id="dynamic"></p><p id="changing">猫がいます。</p><textarea>日本語を編集します。</textarea><div contenteditable="true">編集する文章</div><pre>日本語コード</pre><ruby>東京<rt>とうきょう</rt></ruby><button>日本語ボタン</button><p id="long"></p></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let context;
try {
  const extension = resolve('artifacts/e2e-extension');
  context = await chromium.launchPersistentContext(resolve(`.test-profile/${Date.now()}`), { channel: 'chromium', headless: true, viewport: { width: 1440, height: 1060 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  const home = `chrome-extension://${id}/`;
  const settings = await context.newPage(); await settings.goto(home + 'settings.html');
  const rpc = (type, data = {}) => settings.evaluate(async message => {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || 'No response');
    return response.data;
  }, { type, ...data });
  // Stub external translation responses, leaving real worker, messaging, DOM and storage intact.
  await worker.evaluate(() => {
    const realFetch = globalThis.fetch;
    globalThis.__networkWords = [];
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://api.mymemory.translated.net/')) {
        const text = new URL(url).searchParams.get('q'); globalThis.__networkWords.push(text);
        if (text === '失敗') return new Response('{}', { status: 503 });
        const glossary = { 日本語: '日语', 公園: '公园', 読書: '读书', 発見: '发现', 日常: '日常', 珈琲: '咖啡', 毎日: '每天', 勉強: '学习', 日曜日: '星期日', 木漏れ日: '透过树叶洒下的阳光' };
        return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: glossary[text] || '测试中文释义' } }), { headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(url, options);
    };
  });
  await settings.locator('#ruby-size').fill('70');
  await settings.getByRole('button', { name: '保存偏好设置' }).click();
  await settings.waitForFunction(() => document.querySelector('#save-status').textContent.includes('已保存'));
  assert.equal((await rpc('GET_SETTINGS')).rubySize, 70); mark('settings saved in real extension storage');
  const page = await context.newPage(); await page.goto(url);
  const original = await page.locator('#article').textContent();
  const tabId = await settings.evaluate(async target => (await chrome.tabs.query({})).find(t => t.url === target).id, url);
  await rpc('TOGGLE_TAB', { tabId });
  await page.waitForSelector('#article rt');
  await page.waitForFunction(() => document.querySelector('#changing .yh-word'));
  assert.equal(await page.locator('#article ruby').filter({ hasText: '読' }).locator('rt').textContent(), 'よ');
  assert.equal(await page.locator('textarea .yh-word, [contenteditable] .yh-word, pre .yh-word, button .yh-word, ruby ruby').count(), 0);
  mark('real IPADIC annotations preserve okurigana and skip editable/code/existing ruby');
  const beforeLookups = await worker.evaluate(() => globalThis.__networkWords.length); assert.equal(beforeLookups, 0); mark('annotation makes no translation network request');
  await page.locator('#article .yh-word').filter({ hasText: '日本語' }).click();
  await page.waitForFunction(() => document.querySelector('#yh-overlay')?.shadowRoot?.querySelector('.meaning')?.textContent === '日语');
  assert(await page.getByRole('dialog', { name: '日本語的释义' }).isVisible());
  assert.match(await page.locator('#yh-overlay .pronunciation').textContent(), /にほんご/);
  await page.getByRole('button', { name: '＋ 收藏单词' }).click();
  await page.getByRole('button', { name: '✓ 已收藏' }).waitFor();
  let words = await rpc('GET_WORDS'); assert.equal(words.length, 1); assert.equal(words[0].meaning, '日语'); assert.equal(words[0].sourceUrl, url); mark('click → Chinese translation → save word with reading and source');
  await rpc('SAVE_WORD', { word: words[0] }); assert.equal((await rpc('GET_WORDS')).length, 1); mark('duplicate favorites are not added');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.querySelector('#dynamic').textContent = '新しい発見があります。'; document.querySelector('#long').textContent = '日本語を読みます。'.repeat(1000); });
  await page.waitForSelector('#dynamic rt');
  await page.waitForFunction(() => document.querySelector('#long').querySelectorAll('rt').length > 1000, { timeout: 30000 }); mark('dynamic content and long text get annotated');
  await page.locator('#link .yh-word').first().click(); assert.equal(page.url(), url); await page.keyboard.press('Escape'); mark('normal clicks on annotated links open lookup without navigating');
  await page.evaluate(() => { const run = document.querySelector('#changing .yh-run'); run.textContent = '変更された文章'; });
  await rpc('TOGGLE_TAB', { tabId });
  assert.equal(await page.locator('.yh-run').count(), 0);
  assert.equal(await page.locator('#article').textContent(), original);
  assert.equal(await page.locator('#changing').textContent(), '変更された文章'); mark('disabling restores exact text and preserves page updates');
  const blocked = await page.evaluate(() => typeof chrome?.runtime?.sendMessage); assert.equal(blocked, 'undefined');
  await assert.rejects(rpc('TOKENIZE', { texts: ['x'.repeat(16001)] }), /过长/); mark('tokenization input limits enforced');
  await rpc('TOGGLE_TAB', { tabId }); await page.waitForSelector('#article rt');
  const displaySettings = await rpc('GET_SETTINGS');
  await rpc('SAVE_SETTINGS', { settings: { ...displaySettings, showFurigana: false } });
  await page.waitForFunction(() => document.documentElement.classList.contains('yh-hide-ruby'));
  await rpc('SAVE_SETTINGS', { settings: { ...displaySettings, showFurigana: true } }); mark('display settings update active webpages');
  const vocabulary = await context.newPage(); await vocabulary.goto(home + 'vocabulary.html');
  await vocabulary.waitForSelector('.word-card');
  await vocabulary.locator('#search').fill('不存在'); await vocabulary.locator('#no-results').waitFor({ state: 'visible' });
  await vocabulary.locator('#search').fill('にほんご'); assert.equal(await vocabulary.locator('.word-card').count(), 1); mark('vocabulary searches kana and displays empty results');
  await vocabulary.getByRole('button', { name: '标为掌握 ✓' }).click();
  await vocabulary.waitForFunction(() => document.querySelector('#stat-mastered').textContent === '1');
  await vocabulary.locator('.word-open').click();
  await vocabulary.getByLabel('我的笔记').fill('明日も読みます。');
  await vocabulary.getByRole('button', { name: '保存笔记' }).click();
  words = await rpc('GET_WORDS'); assert.equal(words[0].note, '明日も読みます。'); assert.equal(words[0].mastered, true); mark('mastery state and notes persist');
  await vocabulary.getByRole('button', { name: '↑ 导出单词' }).click();
  const downloaded = vocabulary.waitForEvent('download'); await vocabulary.getByRole('button', { name: /JSON 完整备份/ }).click();
  const file = await downloaded; await file.saveAs('artifacts/e2e-backup.json');
  const exported = JSON.parse(await readFile('artifacts/e2e-backup.json', 'utf8')); assert.equal(exported.words[0].note, words[0].note); assert.equal(exported.azureKey, undefined);
  await rpc('DELETE_WORD', { id: words[0].id });
  await vocabulary.locator('#import-file').setInputFiles(resolve('artifacts/e2e-backup.json'));
  await vocabulary.waitForSelector('.word-card');
  assert.equal((await rpc('GET_WORDS'))[0].note, '明日も読みます。'); mark('JSON export/import restores favorites with notes');
  await assert.rejects(rpc('TRANSLATE', { text: '失敗' }), /503/); mark('translation service failure returns actionable error');
  await rpc('SAVE_SETTINGS', { settings: { ...displaySettings, provider: 'bing' } });
  const networkBefore = await worker.evaluate(() => globalThis.__networkWords.length);
  assert.equal((await rpc('TRANSLATE', { text: '静か' })).external, true);
  assert.equal(await worker.evaluate(() => globalThis.__networkWords.length), networkBefore); mark('Bing external mode stays offline until link is opened');
  const demo = await context.newPage(); await demo.goto(home + 'demo.html'); await demo.getByRole('button', { name: '开始注音' }).click(); await demo.waitForSelector('#demo-article rt');
  assert.equal(await demo.locator('.sidebar .yh-word').count(), 0); mark('built-in exercise only annotates Japanese article');
  await demo.getByRole('button', { name: '关闭注音' }).click(); assert.equal(await demo.locator('#demo-article rt').count(), 0);
  await demo.getByRole('button', { name: '开始注音' }).click(); await demo.waitForSelector('#demo-article rt');
  await demo.waitForFunction(() => document.querySelector('#demo-status').textContent.includes('已识别'));
  await demo.locator('#yh-overlay .toast').waitFor({ state: 'hidden' });
  await demo.screenshot({ path: 'artifacts/demo.png', fullPage: true });
  // Illustrative sample favorites for documentation screenshots, only in disposable profile.
  for (const word of [
    { surface: '木漏れ日', reading: 'こもれび', romaji: 'komorebi', meaning: '透过树叶间隙洒落的阳光', sentence: '木漏れ日が道を照らしていました。', pos: '名詞' },
    { surface: '発見', reading: 'はっけん', romaji: 'hakken', meaning: '发现；找到从前没有注意到的事物', sentence: '今日も、小さな発見がありました。', pos: '名詞' },
    { surface: '散歩', reading: 'さんぽ', romaji: 'sanpo', meaning: '散步；随意地走一走', sentence: '日曜日の朝、公園を散歩しました。', pos: '名詞', mastered: true },
    { surface: '穏やか', reading: 'おだやか', romaji: 'odayaka', meaning: '平静；温和；安稳', sentence: '穏やかな一日が始まります。', pos: '形容動詞' },
    { surface: '続ける', reading: 'つづける', romaji: 'tsuzukeru', meaning: '继续；坚持做某件事情', sentence: '楽しみながら勉強を続けましょう。', pos: '動詞' }
  ]) await rpc('SAVE_WORD', { word });
  await vocabulary.locator('#search').fill(''); await vocabulary.reload(); await vocabulary.waitForSelector('.word-card:nth-child(6)');
  await vocabulary.screenshot({ path: 'artifacts/vocabulary.png', fullPage: true });
  await vocabulary.setViewportSize({ width: 390, height: 844 });
  assert.equal(await vocabulary.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); mark('vocabulary mobile layout has no horizontal overflow');
  await vocabulary.screenshot({ path: 'artifacts/vocabulary-mobile.png', fullPage: true });
  const popup = await context.newPage(); await popup.goto(home + 'popup.html'); await popup.setViewportSize({ width: 360, height: 680 }); await popup.screenshot({ path: 'artifacts/popup.png' });
  assert.deepEqual(errors, []); mark('no page JavaScript errors');
  await writeFile('artifacts/e2e-results.json', JSON.stringify({ passed: results.length, checks: results, browser: context.browser()?.version(), externalTranslation: 'mocked', localhostPermission: 'test fixture only' }, null, 2));
  console.log(`All ${results.length} browser checks passed.`);
} catch (error) {
  console.error('E2E failed:', error);
  if (context) for (const [index, page] of context.pages().entries()) {
    console.error('Page', index, page.url(), (await page.locator('body').innerText().catch(() => '')).slice(-1800));
    await page.screenshot({ path: `artifacts/failure-${index}.png` }).catch(() => {});
  }
  console.error('Page errors:', errors); process.exitCode = 1;
} finally {
  await context?.close(); await new Promise(resolve => server.close(resolve));
}
