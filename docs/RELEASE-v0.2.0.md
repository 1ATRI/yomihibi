读日和第二版：**日英阅读 + 主干高亮 + 收藏背词**，支持 Chrome / Edge。

- 日语主语 / 话题与句子主干标记；明确区分 は 话题与 が 主语。
- 英语主语、谓语、宾语 / 补语高亮，点击卡片显示所在句的候选主干。
- 日语和英语均可独立开启「原文上方显示中文」，按可见区域查询，去重、限额、失败暂停。
- 英语查中文释义、英语朗读与独立语言收藏；原有日语收藏保留。
- 新增背词页：正反向翻面、自评、忘词本轮重现、到期复习和进度备份。
- 单词本语言筛选，兼容 JSON v1 / v2；界面、文档和依赖更新。

**下载 `yomihibi-v0.2.0.zip`，不要用 Source code ZIP 直接加载。** 解压后，在 Chrome / Edge 扩展页开启开发者模式，加载包含 manifest.json 的目录。

**升级请先导出 JSON，并覆盖原来的扩展目录后点击刷新。不要先卸载。** 更换目录导致 ID 改变时可导入备份恢复。

中文标注默认关闭，开启后发送可见词语到翻译服务，会使用其配额。主干是本地规则分析参考，复杂从句、倒装和省略可能误判。语音依赖对应语言语音包。

验证：18 项单元测试、28 项 Chromium 浏览器流程检查；外部翻译响应在自动测试中模拟，真实网络 / 配额另有影响。

[使用指南](https://github.com/1ATRI/yomihibi/blob/main/docs/USER_GUIDE.md) · [背词说明](https://github.com/1ATRI/yomihibi/blob/main/docs/REVIEW.md) · [隐私说明](https://github.com/1ATRI/yomihibi/blob/main/docs/PRIVACY.md)
