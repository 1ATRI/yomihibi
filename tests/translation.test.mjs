import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/translation.js';
test('MyMemory sends only selected text with the correct language pair', async () => {
  const result = await translate('日本語', { provider: 'mymemory' }, async url => {
    const parsed = new URL(url); assert.equal(parsed.searchParams.get('q'), '日本語'); assert.equal(parsed.searchParams.get('langpair'), 'ja|zh-CN');
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: '日语' } }) };
  });
  assert.equal(result.meaning, '日语');
});
test('Microsoft sends API credentials in headers, never URLs', async () => {
  const result = await translate('猫', { provider: 'microsoft', azureKey: 'example-key', azureRegion: 'eastasia' }, async (url, options) => {
    assert(!url.includes('example-key')); assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'example-key');
    assert.deepEqual(JSON.parse(options.body), [{ Text: '猫' }]);
    return { ok: true, json: async () => [{ translations: [{ text: '猫' }] }] };
  });
  assert.equal(result.provider, 'Microsoft Translator');
  await assert.rejects(translate('猫', { provider: 'microsoft' }), /密钥/);
});
test('quota and network errors do not become stored translations', async () => {
  await assert.rejects(translate('猫', { provider: 'mymemory' }, async () => ({ ok: true, json: async () => ({ responseStatus: 429, quotaFinished: true }) })), /额度/);
  await assert.rejects(translate('猫', { provider: 'mymemory' }, async () => ({ ok: false, status: 503 })), /503/);
});
test('Bing mode makes no network request', async () => {
  const result = await translate('猫', { provider: 'bing' }, () => { throw new Error('Unexpected network call'); });
  assert.equal(result.external, true);
});
