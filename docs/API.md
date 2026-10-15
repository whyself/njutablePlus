# 南大表格 (SeaTable 6.2) 接口整理：认证 / 表格 / 应用

服务器：`https://table.nju.edu.cn`　·　核对日期：2026-10-15
来源标记：**[官方]** = api.seatable.com 参考文档（`llms-full.txt`）；**[前端]** = 从 table.nju.edu.cn 前端 JS 中提取、官方未公开；**[实测]** = 已在本账号上调用验证。

---

## 1. 登录状态需要的凭据

| 凭据 | 位置 | JS 可读 | 用途 | 状态 |
|---|---|---|---|---|
| 会话 cookie（推断名为 `dtable_sessionid`） | Cookie，HttpOnly | 否 | 所有 `/api/v2.1/*` 的身份；浏览器自动携带 | [实测] 带 cookie 200 / `credentials:'omit'` 403 |
| `dtable_csrftoken` | Cookie，32 位 | 是 | 写操作 (POST/PUT/DELETE `/api/v2.1/*`) 放进请求头 `X-CSRFToken` | [实测] |
| Base-Token（临时） | 由接口返回，不是 cookie | — | 所有 `/api-gateway/api/v2/dtables/{uuid}/*`，请求头 `Authorization: Bearer …` | [实测] |

- 在页面内 `fetch` 时只需要处理 `X-CSRFToken`，会话 cookie 由浏览器自动带上。
- 如果要脱离浏览器（Python/Node）调用：需要从 DevTools → Application → Cookies 复制 **会话 cookie + `dtable_csrftoken`** 两个值，
  并带上 `Referer: https://table.nju.edu.cn/`（Django 对 HTTPS 写请求会校验 Referer）。会话 cookie 等同于登录凭据，不要外泄。
- `window.app.pageOptions.csrfToken`（64 位）**不能**直接当 `X-CSRFToken` 用，会 403 "incorrect length"。[实测]
- 换 Base-Token：`GET /api/v2.1/workspace/{ws}/dtable/{base_name}/access-token/`（可选 `?exp=3d`），返回 `access_token`、`dtable_uuid`。[官方][实测]
- 南大是统一身份认证，`POST /api2/auth-token/`（账号密码换 Account-Token）基本不可用；`api-tokens/` 可为单个表格创建永久 API-Token（适合只操作数据的脚本）。

---

## 2. 表格：创建 / 修改（官方接口）

### 2.1 表格文件 (Base) 级 —— 会话 + CSRF

| 动作 | 方法 | 路径 | 关键参数 |
|---|---|---|---|
| 列出工作区和表格 | GET | `/api/v2.1/workspaces/` | — [实测] |
| **创建表格** | POST | `/api/v2.1/dtables/` | form: `name`, `workspace_id`, `icon?`, `color?`；新表自带 `Table1(0000)` / `Default View(0000)` / 文本列 `Name(0000)` |
| 重命名/改图标 | PUT | `/api/v2.1/workspace/{ws}/dtable/` | |
| 删除表格 | DELETE | `/api/v2.1/workspace/{ws}/dtable/` | 进回收站 |
| 复制表格 | POST | `/api/v2.1/dtable-copy/` | `src_workspace_id`, `name`, `dst_workspace_id`（会连同应用一起复制） |
| 导入 .dtable | POST | `/api/v2.1/workspace/{ws}/import-dtable/` | multipart `dtable` |
| 导出 .dtable | GET | `/api/v2.1/workspace/{ws}/synchronous-export/export-dtable/` | `dtable_name`, `ignore_asset?` |
| xlsx/csv 建表格 | POST | `/api/v2.1/workspace/{ws}/synchronous-import/import-excel-csv-to-base/` | |
| xlsx/csv 建子表 | POST | `/api/v2.1/workspace/{ws}/synchronous-import/import-excel-csv-to-table/` | |
| xlsx/csv 追加行 | POST | `/api/v2.1/workspace/{ws}/synchronous-import/append-excel-csv-to-table/` | |
| xlsx/csv 更新行 | POST | `/api/v2.1/workspace/{ws}/synchronous-import/update-table-via-excel-csv/` | |
| 表格快照列表/还原 | GET / POST | `/api/v2.1/workspace/{ws}/dtable/{name}/snapshots/` · `…/snapshots/{commit_id}/restore/` | |
| API-Token 增删改查 | GET/POST/PUT/DELETE | `/api/v2.1/workspace/{ws}/dtable/{name}/api-tokens/[{app_name}/]` | |
| 共享给用户/群组 | GET/POST/PUT/DELETE | `…/dtable/{name}/share/` · `…/group-shares/[{group_id}/]` | |
| 外链 | GET/POST/DELETE | `…/dtable/{name}/external-links/` · `…/view-external-links/` | |
| 自动化规则 | GET / POST | `…/dtable/{name}/automation-rules/` | |
| 文件夹 | POST/PUT/DELETE | `/api/v2.1/workspace/{ws}/folders/[{folder_id}/]` | |

### 2.2 表格内部 —— `Authorization: Bearer <Base-Token>`

前缀：`/api-gateway/api/v2/dtables/{base_uuid}/`

| 分类 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 结构 | GET | `metadata/` | 全部表/列/视图 [实测] |
| 子表 | POST / PUT / DELETE | `tables/` | 建（`table_name`, `columns[]`）/ 改名 / 删 |
| 子表 | POST | `tables/duplicate-table/` | 复制子表 |
| 列 | GET | `columns/?table_name=` | |
| 列 | POST | `columns/` | 插入一列：`table_name`, `column_name`, `column_type`, `column_data?`, `anchor_column?` |
| 列 | POST | `batch-append-columns/` | 批量追加：`table_name`, `columns:[{column_name,column_type,column_data}]` |
| 列 | PUT | `columns/` | `op_type`: `rename_column` / `modify_column_type` / `resize_column` / `move_column` / `freeze_column` |
| 列 | DELETE | `columns/` | |
| 单选/多选选项 | POST / PUT / DELETE | `column-options/` | `table_name`, `column`, `options:[{name,color,textColor}]` |
| 级联 | POST | `column-cascade-settings/` | |
| 行 | GET | `rows/?table_name=&convert_keys=` | 字段默认是列 key [实测] |
| 行 | GET | `rows/{row_id}/` | |
| 行 | POST / PUT / DELETE | `rows/` | 批量增 / 改 / 删 |
| 行 | PUT | `lock-rows/` · `unlock-rows/` | |
| SQL | POST | `sql` | `{sql, convert_keys}` [实测] |
| 链接 | POST/PUT/DELETE | `links/` | 另有 `query-links/`, `auto-links/`, `auto-link-task/` |
| 视图 | GET/POST | `views/?table_name=` | |
| 视图 | GET/PUT/DELETE | `views/{view_name}/` | |
| 评论 | GET/POST/DELETE | `comments/[{id}/]` | |
| 快照 | POST | `snapshot/` | |
| 大数据 | POST | `add-archived-rows/` · `archive-view/` · `unarchive/` | |
| 其他 | GET | `related-users/` · `operations/` · `activities/` · `notifications/` | |

附件：`GET /api/v2.1/dtable/app-upload-link/`（API-Token 鉴权）→ `POST /seafhttp/upload-api/{link}?ret-json=1`。

---

## 3. 应用 (Universal App)：创建 / 修改

官方文档 "Apps" 只有：列表、导入用户、用户列表、邀请链接、启停。**创建、修改配置、删除都没有公开文档**，以下来自前端代码。

### 3.1 应用实例本身 —— 会话 + CSRF

| 动作 | 方法 | 路径 | 请求体 | 来源 |
|---|---|---|---|---|
| 我的全部应用（含 `app_config`） | GET | `/api/v2.1/universal-apps/` | — | [官方][实测] |
| 某表格下的应用 | GET | `/api/v2.1/workspace/{ws}/dtable/{base_name}/external-apps/` | 返回 `external_app_list[]`：`id, app_uuid, app_type, app_config, …` | [前端][实测] |
| **创建应用** | POST | `/api/v2.1/workspace/{ws}/dtable/{base_name}/external-apps/` | FormData: `app_type=universal-app`, `app_config=<JSON 字符串>`；返回 `external_app{id, app_uuid…}` | [前端] |
| **修改应用（整份覆盖）** | PUT | `/api/v2.1/workspace/{ws}/dtable/{base_name}/external-apps/{app_id}/` | FormData: `app_config`, `page_id?`, `folder_id?` | [前端][实测] |
| 删除应用 | DELETE | `/api/v2.1/workspace/{ws}/dtable/{base_name}/external-apps/{app_id}/` | — | [前端] |
| 复制应用 | POST | `/api/v2.1/external-apps/{app_id}/duplicate/` | — | [前端] |
| 启用/停用 | PUT | `/api/v2.1/external-apps/{app_id}/status/` | `{is_inactive: bool}` | [官方][前端] |
| 版本升级 | POST | `/api/v2.1/universal-apps/{app_uuid}/version-update/` | — | [前端] |

编辑器新建应用时发送的初始 `app_config`：
```json
{"app_type": "universal-app", "app_name": "<≤50字>", "settings": {}, "enable_load_base_comments": true}
```

### 3.2 应用的附属资源 —— `/api/v2.1/universal-apps/{app_uuid}/…`

| 资源 | 方法 | 子路径 |
|---|---|---|
| 快照 | GET / POST | `snapshots/`（POST FormData `notes`）[实测] |
| 快照 | PUT / DELETE | `snapshots/{id}/` |
| 快照还原 | — | `snapshots/{id}/restore/` |
| 操作日志 | GET | `pages-operation-logs/` |
| 角色 | GET / POST | `app-roles/` [实测 GET] |
| 角色 | GET / PUT / DELETE | `app-roles/{role}/` |
| 用户 | GET | `app-users/`（`page`, `per_page`） |
| 用户 | POST | `app-users/batch/` |
| 用户 | PUT / DELETE | `app-users/{id}/` |
| 用户同步 | — | `app-users/sync/` · `search-user/` |
| 邀请链接 | GET / POST / DELETE | `invite-links/[{token}/]` |
| 匿名访问密码 | GET | `anonymous-access-password/` |
| 自定义短链 | POST / DELETE | `custom-url/`（字段 `custom_url`） |
| 页面 | — | `pages/` · `pages/{page_id}/` · `pages/move-page/` |
| 外部链接导航 | — | `external-links/` · `external-link/{id}/` · `links/` · `links/batch/` |
| HTML 页面资源 | — | `html-pages-assets/[{id}/]` |
| 运行时数据（应用用户视角） | — | `metadata/` · `rows/?page_id=` · `rows/batch/` · `query/` · `form-submit/` · `asset/*-upload-link/` · `run-script/{id}/` … |

---

## 4. 最简的"改应用 / 建应用"流程

所有步骤都在已登录的 `table.nju.edu.cn` 页面里 `fetch`；写请求统一带 `X-CSRFToken: <dtable_csrftoken>`。

### A. 修改已有应用（已实测闭环）
```
1  GET  /api/v2.1/universal-apps/                         → 找到 app：id / app_uuid / workspace_id / dtable_name / app_config
2  GET  …/dtable/{base}/access-token/  →  GET metadata/  → 列名 ↔ key、单选选项 id
3  (LLM) 按自然语言改 app_config；validate()
4  (若引用了不存在的列) POST batch-append-columns/   → 重新读 metadata 拿新 key
5  POST /api/v2.1/universal-apps/{uuid}/snapshots/       → 备份
6  PUT  …/dtable/{base}/external-apps/{id}/  app_config  → 写入
7  GET  /api/v2.1/universal-apps/  比对；出错 → 用快照还原
```

### B. 从零创建"表格 + 表单应用"（创建步骤尚未实测）
```
1  POST /api/v2.1/dtables/                      name, workspace_id      → 新表格（Table1 / Name 列）
2  GET  …/dtable/{name}/access-token/           → Base-Token + uuid
3  PUT  api-gateway tables/                      Table1 → 业务表名（可选）
   POST api-gateway batch-append-columns/        一次加齐所有字段（单选带 options）
4  GET  api-gateway metadata/                    → 拿到每列 key
5  POST …/dtable/{name}/external-apps/           app_type=universal-app,
                                                 app_config = 下面的完整模板（直接带页面）
      ↳ 若服务端只认空 settings：先用编辑器默认值创建，再 PUT 完整配置
6  返回的 external_app.id / app_uuid → 访问 /external-apps/{app_uuid}/ 验证
```

最小表单应用模板（从实测应用 "t" 中精简；`<PAGE_ID>` 为 4 位随机 id，`<KEY_n>` 为列 key）：
```json
{
  "app_type": "universal-app",
  "app_name": "报名表",
  "enable_load_base_comments": true,
  "settings": {
    "nav_sections": [{"id": "0000", "type": "pages"}],
    "pages": [{
      "id": "<PAGE_ID>", "name": "报名表", "type": "form", "icon": "app-gallery", "table_id": "0000",
      "form_column_description_color": "#666666",
      "success_message_option": null,
      "add_duplicate_record_setting": {"duplicate_prohibition": false, "unique_column_keys": []},
      "static_elements": [],
      "columns": [
        {"key": "<KEY_1>", "is_required": true, "description": "", "custom_name": "",
         "require_fill_checked": false, "filters": [], "filter_conjunction": "And", "editable": true,
         "enable_fill_default_value": false, "default_value": "", "enable_not_change_default_value": false,
         "enable_scan_code_entry": false, "options_show_type": "dropdown", "permission": "rw", "query_list": []}
      ],
      "elements_order": [{"key": "<KEY_1>", "type": "column"}],
      "page_permissions": {"view_rows_permission": {"permission_type": "default", "permitted_roles": []}},
      "trigger_workflow_option": {"can_trigger_workflow": false}
    }],
    "navigation": [{"id": "<PAGE_ID>", "type": "page"}],
    "links": []
  },
  "app_theme_mode": "dark", "app_theme_color": "#1D2838", "version": 1
}
```

### 交给 agent 时的最少工具集
| 工具 | 封装的接口 |
|---|---|
| `read_schema(base)` | access-token + metadata |
| `ensure_columns(base, table, cols)` | batch-append-columns / column-options |
| `read_app(app_uuid)` | universal-apps |
| `write_app(app, config)` | validate → snapshots → PUT external-apps |
| `create_app(base, name, config)` | POST external-apps |

LLM 只负责生成"列定义 + app_config"两段 JSON，其余全部由确定性代码完成，并在写入前校验、写入后回读比对。
