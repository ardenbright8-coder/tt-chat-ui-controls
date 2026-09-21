# 随扩展提供的字体

四款均采用 SIL Open Font License 1.1，许可证在本目录；免费使用，不需要系统安装。
从官方原始 TTF 转为网页专用 WOFF2，不删字、不修改字形；不提供桌面安装版。
浏览器只加载当前选择的字体，从当前酒馆服务器的扩展目录读取，无第三方字体请求。

| 菜单名称 | 文件 | 官方原始来源 |
| --- | --- | --- |
| 霞鹜文楷 GB | wenkai.woff2 | https://github.com/lxgw/LxgwWenkaiGB/blob/6ceaf966f41aec8cae1e865167acc2bb7b5ae368/fonts/TTF/LXGWWenKaiGB-Regular.ttf |
| 霞鹜臻楷 GB | zhenkai.woff2 | https://github.com/lxgw/LxgwZhenKai/releases/tag/v0.825 |
| 小赖字体 | xiaolai.woff2 | https://github.com/lxgw/kose-font/releases/tag/v3.126 |
| 悠哉字体 | yozai.woff2 | https://github.com/lxgw/yozai-font/releases/tag/v0.868 |

字形覆盖有限，未收录字符仍使用浏览器备用字体。样式感受属个人偏好。

## 核查与已知限制（2026-09-21）

旧版文楷 TTF 约 25.8MB，旧 jsDelivr 地址实测返回 HTTP 403：文件超过 20MB 限制。
旧版臻楷 Release 文件实测 HTTP 200；不能据此保证所有手机网络都能访问。
其他旧菜单项只声明本地字体名称，没有提供字体文件；不能据此认定用户设备上没有安装。

社区样本不足以形成普遍的舒适度结论。以下是具体使用反馈，不能等同所有用户：
- 小赖：用户认为与 Monaspace 手写字体搭配好看，但指出中西文宽度搭配问题（2025-12-01，开放）：https://github.com/lxgw/kose-font/issues/21
- 小赖：用户反馈“媱”字形错误（2026-06-23，开放，未确认本次版本已修复）：https://github.com/lxgw/kose-font/issues/22
- 悠哉：用户反馈中文引号与感叹号重叠（2022-11-23，已关闭；旧版本反馈，不能视作当前仍存在）：https://github.com/lxgw/yozai-font/issues/4
- 文楷 GB：用户反馈全角引号排版问题：https://github.com/lxgw/LxgwWenkaiGB/issues/15

本次保留文楷、臻楷，增加小赖、悠哉作为个人阅读风格选择；并非适合出版校对的字形正确性保证。
