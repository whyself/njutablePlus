# njutablePlus —— 南大表格侧边栏 Agent 插件 v1 方案

v1 原则：越简单越好。不分权限、不做人工确认、不限制删除操作；附件只支持图片（上传或粘贴）。

## 目录

```
manifest.json            MV3；权限 sidePanel / storage / unlimitedStorage / scripting；host：table.nju.edu.cn、api.deepseek.com
background.js            点击扩展图标 → 打开侧边栏

sidepanel/                ✅
  index.html
  app.js                 对话窗口（流式显示、Markdown 渲染）、思考过程和工具调用（默认收起，点开看参数/结果）、
                         图片上传/粘贴（编号 img_1、img_2…，供 upload_image 引用）、
                         设置弹窗（base_url / api_key / 模型，存 chrome.storage.local）、新对话、停止
  markdown.js            极简 Markdown 渲染（先转义全部 HTML，链接只允许 http(s)），无第三方依赖
  style.css              南大紫主题，跟随系统浅色 / 深色

icons/                   扩展图标 16 / 32 / 48 / 128（scripts/make-icons.py 生成，需要 Pillow）

agent/
  loop.js                ✅ ★ agent loop（逐行审核）：调模型 → 有 tool_calls 就执行并回填 → 直到模型不再调用工具
  llm.js                 ✅ OpenAI 兼容的流式请求；默认 https://api.deepseek.com，模型 deepseek-flash
  prompt.js              ✅ system prompt

platform/
  session.js             ✅ 登录态：找到已登录的 table.nju.edu.cn 标签页，在页面内执行请求（cookie + CSRF），换取 Base-Token

tools/                   ✅ 24 个工具（平台工具均已在平台上实测）
  index.js               汇总所有工具：name / description / parameters / run
  common.js              工具定义、参数检查、接口错误
  base-tools.js          表格：list_bases / get_base_schema / query_rows + 分组 base / table / column / select_option / row / row_link / view / base_snapshot
  app-tools.js           应用：list_apps / get_app_config / check_app_config / create_app / update_app / upload_image
                         + 分组 app / app_snapshot / app_role / app_user / app_invite_link / app_custom_url
  doc-tools.js           分组 docs：在 knowledge/ 里 search / read

knowledge/               给模型看的平台资料（打包进插件）：列类型、公式、过滤条件、各页面字段、权限、常见做法
                         来源：SeaTable 官方帮助 / 官方 API / 官方前端库 dtable-utils，缺的由平台前端代码和实测补充

checker/
  rules.js               ✅ 已完成
  app-compiler.js        ✅ 已完成

store/
  history.js             ✅ 写应用前后的配置存进 chrome.storage.local（快照 / 待修改版本）
  chat.js                ✅ 当前对话（消息 + 图片）存进 chrome.storage.local，打开侧边栏时恢复，"新对话"清空

tests/                   Node 跑，不进插件包
docs/                    给开发者看：API.md（接口实测记录）、PLAN.md、TOOLS.md
```

## 一次修改的流程

```
用户消息(+图片) → loop → 模型
  → 读：list_bases / get_base_schema / list_apps / get_app_config …
  → 写：update_app(config)
        编译 ─ 失败 → 诊断信息作为工具结果返回给模型，不写入
             └ 通过 → history 保存 before/after → PUT 写回
  → 模型给出最终回复
```

## 对话管理（v1）

- 只保留一个当前对话，自动保存；"新对话"清空。不做历史对话列表。
- 中途关闭侧边栏导致工具结果没回填：恢复时补"执行被中断，结果未知"，不删除（工具可能已执行）。
- 停止或出错时，若历史末尾不是助手消息，补一条（已显示的部分文字或"（已停止）"），保证一问一答交替。
- 思考内容（reasoning_content）随消息保存。
- 已知限制：多个 Chrome 窗口的侧边栏共用同一个当前对话，后保存的覆盖先保存的。

## 实现前要验证

1. ~~DeepSeek 官方 API 的 `deepseek-flash` 是否支持函数调用。~~
   ✅ 2026-10-15 实测支持。默认开启思考模式；带工具时必须回传 `reasoning_content`，否则 400（已处理）。
   `tests/live-deepseek.mjs` 用真实 DeepSeek 跑通了多步工具调用（有思考内容和没有思考内容两种情况）。
2. ~~`chrome.scripting.executeScript` 在页面内 fetch 时，cookie / CSRF / Referer 是否都能带上。~~
   ✅ 2026-10-15 小样实测：默认隔离环境下读请求、带 CSRF 的写请求、Base-Token 表格接口全部通过。
3. ~~TOOLS.md 中标 ⏳ 的接口实现时逐个实测。~~ ✅ 2026-10-15 全部实测（移除应用用户仅部分验证）。
