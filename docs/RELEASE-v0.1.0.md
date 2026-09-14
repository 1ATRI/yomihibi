首个可安装版本：**读日和 · 日语阅读助手**，支持 Chrome / Edge。

- 离线分词与汉字假名注音，支持送假名对齐。
- 点击查词：假名、罗马音、词性、原形、中文翻译与日语朗读。
- 默认 MyMemory 免密钥翻译，可配置 Microsoft Translator，附带 Bing 翻译入口。
- 独立单词本：收藏、搜索、学习状态、笔记、JSON 备份和 CSV 导出。
- 内置阅读练习、假名字号设置与 Alt + J 快捷键。

**安装**：下载下方 `yomihibi-v0.1.0.zip` 并解压，在 `chrome://extensions/` 或 `edge://extensions/` 开启开发者模式，点击「加载已解压的扩展程序」，选择包含 manifest.json 的目录。

如果刚发布时还没有 ZIP 资产，请等待打包工作流完成；也可从源码执行 `npm ci && npm run package`。GitHub 自动提供的 Source code ZIP 是源码，不能直接加载为扩展。

[使用指南](https://github.com/1ATRI/yomihibi/blob/main/docs/USER_GUIDE.md) · [隐私说明](https://github.com/1ATRI/yomihibi/blob/main/docs/PRIVACY.md) · [测试说明](https://github.com/1ATRI/yomihibi/blob/main/docs/TESTING.md)

已通过 7 项单元测试、18 项 Chromium 浏览器检查；自动测试模拟外部翻译响应。实际翻译受服务与网络影响，朗读依赖日语语音包。词典注音可能误判人名 / 多音字。尚未上架扩展商店。
