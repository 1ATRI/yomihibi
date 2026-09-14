export async function translate(text, settings, fetcher = fetch) {
  if (settings.provider === 'bing') return { meaning: '', provider: 'Bing 网页', external: true };
  const signal = AbortSignal.timeout(12000);
  let response;
  if (settings.provider === 'microsoft') {
    if (!settings.azureKey) throw new Error('请先在设置中填写 Microsoft Translator 密钥');
    response = await fetcher('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=ja&to=zh-Hans', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': settings.azureKey, ...(settings.azureRegion ? { 'Ocp-Apim-Subscription-Region': settings.azureRegion } : {}) },
      body: JSON.stringify([{ Text: text }])
    });
    if (!response.ok) throw new Error(`微软翻译暂不可用（${response.status}），请检查密钥、区域和配额`);
    const json = await response.json();
    const meaning = json?.[0]?.translations?.[0]?.text;
    if (typeof meaning !== 'string' || !meaning.trim()) throw new Error('微软翻译未返回释义');
    return { meaning, provider: 'Microsoft Translator' };
  }
  const url = new URL('https://api.mymemory.translated.net/get');
  url.search = new URLSearchParams({ q: text, langpair: 'ja|zh-CN' }).toString();
  response = await fetcher(url.href, { signal });
  if (!response.ok) throw new Error(`免费翻译暂不可用（${response.status}），可使用 Bing 查看`);
  const json = await response.json();
  if (Number(json.responseStatus) !== 200 || json.quotaFinished) throw new Error('免费翻译额度不足或服务繁忙，可切换微软翻译或打开 Bing');
  const meaning = json.responseData?.translatedText;
  if (typeof meaning !== 'string' || !meaning.trim()) throw new Error('暂未查到中文释义，可在 Bing 中继续查询');
  return { meaning, provider: 'MyMemory' };
}
