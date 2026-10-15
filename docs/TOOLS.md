# v1 工具设计（24 个）

原则：功能齐全，设计简洁。
- 读取和应用配置的核心操作：**单独工具**，参数清楚、描述具体。
- 其余长尾操作：**按资源分组**，用 `action` 区分。
所有请求都通过 `platform/session.js` 在已登录的 table.nju.edu.cn 页面内发出。

## 通用约定

- 定位表格：`workspace_id` + `base_name`（由 `list_bases` 得到）。工具内部自动换取 Base-Token。
- 定位子表：`table_name`；定位列：列名或列 key（官方接口两者都接受）。
- 定位应用：`app_id`（由 `list_apps` 得到）。需要 uuid 的接口由工具内部转换。
- 下表参数中的 `…` = `workspace_id, base_name`。
- 返回：成功 `{ ok: true, data }`；失败 `{ ok: false, status, error }`；编译失败 `{ ok: false, diagnostics }`。
- 分组工具的 `run()` 先检查该 action 的必填参数，缺了直接返回错误，不发请求。
- ✅ 已实测（2026-10-15 用真实工具代码在平台上逐项验证）　◐ 部分验证

---

## 单独工具（9）

| 工具 | 参数 | 行为 / 接口 | |
|---|---|---|---|
| `list_bases` | — | GET `/api/v2.1/workspaces/` | ✅ |
| `get_base_schema` | … | GET `api-gateway …/metadata/` | ✅ |
| `query_rows` | …, sql | POST `api-gateway …/sql`（`convert_keys: true`） | ✅ |
| `list_apps` | … | GET `…/dtable/{base}/external-apps/`（不含配置正文） | ✅ |
| `get_app_config` | …, app_id | 返回该应用的 `app_config` | ✅ |
| `check_app_config` | …, config | 只编译不写入，返回诊断 | ✅ |
| `create_app` | …, config | 编译 → POST `…/external-apps/` | ✅ |
| `update_app` | …, app_id, config | 编译 → history 存 before/after → PUT `…/external-apps/{id}/`（整份覆盖） | ✅ |
| `upload_image` | …, image_id | 上传聊天里的图片到该表格，返回图片 URL（见下） | ✅ |

编译用的表格结构由工具内部现取，模型不需要传。

### `upload_image`

- 用户上传或粘贴的图片在侧边栏里编号为 `img_1`、`img_2`……，编号随消息一起告诉模型；模型只传 `image_id`，不传 base64。
- 流程（会话鉴权，已实测）：
  1. GET `/api/v2.1/workspace/{ws}/dtable-asset-upload-link/?name={base_name}` → `upload_link, parent_path, img_relative_path`
  2. POST `{upload_link}?ret-json=1`，FormData：`parent_dir`, `relative_path`, `file` → `[{name, size}]`
  3. URL = `{origin}/workspace/{ws}{parent_path}/{img_relative_path}/{name}`
- 返回的 URL 可以用在（均已实测渲染）：
  - 图片列的值：`row.append` 时传 `{"图片列名": [url]}`；
  - 表单 / 页面的备注元素：`static_elements[].value` 里写 Markdown `![](url)`；
  - 应用图标：`app_icon: url` + `use_custom_icon: true`。
- 官方文档里的 `/api/v2.1/dtable/app-upload-link/` 需要 API-Token，这里不用。

---

## 表格分组（8）

### `base`
| action | 参数 | 接口 | |
|---|---|---|---|
| create | workspace_id, base_name | POST `/api/v2.1/dtables/` | ✅ |
| rename | …, new_name | PUT `/api/v2.1/workspace/{ws}/dtable/` | ✅ |
| delete | … | DELETE `/api/v2.1/workspace/{ws}/dtable/`（进回收站） | ✅ |
| copy | …, dst_workspace_id | POST `/api/v2.1/dtable-copy/` | ✅ |

### `table`
| action | 参数 | 接口 `api-gateway …` | |
|---|---|---|---|
| create | …, table_name, columns? | POST `tables/` | ✅ |
| rename | …, table_name, new_table_name | PUT `tables/` | ✅ |
| delete | …, table_name | DELETE `tables/` | ✅ |
| duplicate | …, table_name, is_duplicate_records | POST `tables/duplicate-table/` | ✅ |

### `column`
| action | 参数 | 接口 | |
|---|---|---|---|
| add | …, table_name, columns[{column_name, column_type, column_data?}] | POST `batch-append-columns/`；formula / link 类逐个走 POST `columns/` | ✅ |
| update | …, table_name, column, op_type, 对应参数 | PUT `columns/`（rename / modify_type / move / resize / freeze） | ✅ |
| delete | …, table_name, column | DELETE `columns/` | ✅ |

`add`（`table.create` 同）：
- 单选/多选选项缺 `id` 或 `color` 的由工具自动补上（实测缺任一个都会返回 400）。
- 链接列写 `column_data: {other_table: "子表名"}`，`table` 由工具填为当前子表。
  实测缺 `other_table` 时平台**一直不响应**（nginx 约 60 秒后 504），所以工具在发请求前就拦下。
- 按钮列必须有 `button_action_list`，动作类型在平台支持的范围内，modify_row 要有 `selected_columns`；
  工具补 `button_name`（默认列名）、`button_color`、动作 `_id`。平台对按钮的 column_data 不做校验，写错也返回成功但按钮空白（实测）。
- 链接公式列按官方 API 检查各公式的必填参数（lookup 要 link_column + level1_linked_column 等）。
- 列默认值写在 column_data（`enable_fill_default_value` + `default_value`），实测可写入。

`update` 的 `modify_column_type`：不允许改成 link / ctime / mtime / creator / last-modifier（官方：不能转成链接列；实测转 ctime 后旧值全部失效），提示改用 add。
新类型与原类型相同、带 `column_data` 时可用来修改列设置（如补默认值，实测）。

## 失败信息

工具失败时返回 `{ok: false, error, status?, detail?, hint?}`：
- `error`：哪个接口失败 + 平台的说明，如 `POST …/batch-append-columns/ 失败（400）：column x invalid.`；
- `detail`：平台返回的 JSON；返回的是网页（504 错误页、登录页）时不交给模型；
- `hint`：按状态码给的处理建议（0 / 5xx：先查询确认再修正重试，不要原样重复；400：按平台说明改参数；403；404）。
- 页面请求 60 秒超时；接口返回 200 但内容是网页时判为登录过期。

### `select_option`
| action | 参数 | 接口 | |
|---|---|---|---|
| add | …, table_name, column, options[{name, color, textColor}] | POST `column-options/` | ✅ |
| update | …, table_name, column, options[{id, …}] | PUT `column-options/` | ✅ |
| delete | …, table_name, column, option_names[] | DELETE `column-options/` | ✅ |

### `row`
| action | 参数 | 接口 | |
|---|---|---|---|
| append | …, table_name, rows[{列名: 值}] | POST `rows/`（带 `apply_default: true`，没填的列按列默认值填，实测） | ✅ |
| update | …, table_name, updates[{row_id, row}] | PUT `rows/` | ✅ |
| delete | …, table_name, row_ids[] | DELETE `rows/` | ✅ |

### `row_link`
| action | 参数 | 接口 | |
|---|---|---|---|
| add / update / remove | …, table_name, other_table_name, link_id, 行对应关系 | POST / PUT / DELETE `links/` | ✅ |

### `view`
| action | 参数 | 接口 | |
|---|---|---|---|
| list | …, table_name | GET `views/` | ✅ |
| create | …, table_name, view_name, 视图设置 | POST `views/` | ✅ |
| update | …, table_name, view_name, 视图设置 | PUT `views/{name}/` | ✅ |
| delete | …, table_name, view_name | DELETE `views/{name}/` | ✅ |

### `base_snapshot`
| action | 参数 | 接口 | |
|---|---|---|---|
| create | … | POST `api-gateway …/snapshot/`，body `{dtable_name}`（文档未写） | ✅ |
| list | … | GET `/api/v2.1/workspace/{ws}/dtable/{base}/snapshots/` | ✅ |
| restore | …, commit_id | POST `…/snapshots/{commit_id}/restore/` | ✅ |

---

## 应用分组（6）

以下接口除 `app` 外都在 `/api/v2.1/universal-apps/{uuid}/` 下。

### `app`
| action | 参数 | 行为 / 接口 | |
|---|---|---|---|
| delete | …, app_id | history 存 before → DELETE `…/external-apps/{id}/` | ✅ |
| duplicate | …, app_id | POST `/api/v2.1/external-apps/{uuid}/duplicate/` | ✅ |
| set_active | …, app_id, active | PUT `/api/v2.1/external-apps/{uuid}/status/` | ✅ |

### `app_snapshot`
| action | 参数 | 接口 | |
|---|---|---|---|
| list | …, app_id | GET `snapshots/` | ✅ |
| create | …, app_id, notes? | POST `snapshots/` | ✅ |
| delete | …, app_id, snapshot_id | DELETE `snapshots/{id}/` | ✅ |
| restore | …, app_id, snapshot_id | POST `snapshots/{id}/restore/` | ✅ |

### `app_role`
| action | 参数 | 接口 | |
|---|---|---|---|
| list | …, app_id | GET `app-roles/` | ✅ |
| create | …, app_id, role_name, permission | POST `app-roles/` | ✅ |
| update | …, app_id, role_id, role_name, permission | PUT `app-roles/{id}/` | ✅ |
| delete | …, app_id, role_id | DELETE `app-roles/{id}/` | ✅ |

### `app_user`
| action | 参数 | 接口 | |
|---|---|---|---|
| list | …, app_id, page? | GET `app-users/` | ✅ |
| add | …, app_id, users[{email, role_id}] | POST `app-users/batch/` | ✅ |
| update_role | …, app_id, user_id, role_id | PUT `app-users/{id}/` | ✅ |
| remove | …, app_id, user_id | DELETE `app-users/{id}/` | ◐ 平台不允许移除自己，未用他人账号验证 |

### `app_invite_link`
| action | 参数 | 接口 | |
|---|---|---|---|
| list | …, app_id | GET `invite-links/` | ✅ |
| create | …, app_id, role_name, password?, expire_days? | POST `invite-links/` | ✅ |
| delete | …, app_id, token | DELETE `invite-links/{token}/` | ✅ |

### `app_custom_url`
| action | 参数 | 接口 | |
|---|---|---|---|
| set | …, app_id, custom_url | POST `custom-url/` | ✅ |
| remove | …, app_id | DELETE `custom-url/` | ✅ |

---

## 资料分组（1）

### `docs`
| action | 参数 | 行为 |
|---|---|---|
| search | query | 在 `knowledge/*.md`（不含目录 index.md）里按 `## ` 小节搜索，空格分词、不区分大小写，按命中词数排序，最多 6 节、每节 2000 字 |
| read | file, section? | 读整篇（12000 字以内）或标题包含 section 的小节 |

插件里用 `fetch(chrome.runtime.getURL('knowledge/…'))` 读打包的文件，测试里直接读磁盘。

## 本地记录

`store/history.js`：`update_app` 和 `app.delete` 执行前，把修改前的配置（以及 update 的修改后配置）存进 `chrome.storage.local`。

## 未纳入（请确认）

| 功能 | 原因 |
|---|---|
| 共享表格、外链 | 协作管理，不是表格内容本身 |
| 自动化规则、旧版表单 | 与通用应用功能重叠 |
| Excel / CSV / .dtable 导入导出 | v1 附件只支持图片 |
| 行评论、通知 | 与创建/修改无关 |
| 应用表单提交（运行时） | 需要应用页面内的令牌；写数据用 `row.append` 即可 |
