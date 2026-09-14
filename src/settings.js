import { $, request, notify } from './shared/api.js';
function preview() {
  $('#ruby-value').value = `${$('#ruby-size').value}%`;
  $('#ruby-preview').style.setProperty('--preview-ruby', `${$('#ruby-size').value}%`);
  $('#ruby-preview').classList.toggle('hide-ruby', !$('#furigana').checked);
}
function providerHint() {
  const value = $('#provider').value;
  $('#azure-fields').hidden = value !== 'microsoft';
  $('#provider-hint').textContent = value === 'mymemory' ? '免费服务有每日额度和频率限制，结果可能受网络影响。任何模式下都可点击 Bing 链接继续查询。' : value === 'microsoft' ? '使用微软官方文本翻译接口；额度与费用由你的 Azure 资源决定。' : '此模式不会自动发送查词请求；假名、原形、词性和收藏仍可离线使用。点击 Bing 链接后在网页查看释义。';
}
$('#ruby-size').oninput = preview; $('#furigana').onchange = preview; $('#provider').onchange = providerHint;
$('#settings-form').onsubmit = async event => {
  event.preventDefault();
  try {
    await request('SAVE_SETTINGS', { settings: { provider: $('#provider').value, showFurigana: $('#furigana').checked, rubySize: Number($('#ruby-size').value), azureKey: $('#azure-key').value, azureRegion: $('#azure-region').value } });
    $('#save-status').textContent = '✓ 已保存，已开启的页面会同步更新'; notify('偏好设置已保存');
  } catch (error) { notify(error.message, true); }
};
request('GET_SETTINGS').then(settings => {
  $('#provider').value = settings.provider; $('#furigana').checked = settings.showFurigana;
  $('#ruby-size').value = settings.rubySize; $('#azure-key').value = settings.azureKey; $('#azure-region').value = settings.azureRegion;
  preview(); providerHint();
}).catch(error => notify(error.message, true));
