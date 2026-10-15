# 表格页（type: table）

来源：
- 官方帮助《Table pages in SeaTable apps》《Page permissions in an app》；
- 平台前端代码（字段名和默认值）；
- 参考应用的真实配置。

## 结构
```json
{"id": "Tb01", "name": "我的报名", "type": "table", "table_id": "0000",
 "shown_column_keys": ["0000", "aB3d", "xdvn", "_ctime"],
 "read_only_column_keys": ["0000", "aB3d", "_ctime"],
 "filters": [{"column_key": "_creator", "filter_predicate": "include_me", "filter_term": []}],
 "filter_conjunction": "And",
 "sorts": [{"column_key": "_ctime", "sort_type": "down"}],
 "page_permissions": {
   "view_rows_permission": {"permission_type": "default", "permitted_roles": []},
   "add_rows_permission": {"permission_type": "none", "permitted_roles": []},
   "edit_rows_permission": {"permission_type": "default", "permitted_roles": []},
   "delete_rows_permission": {"permission_type": "none", "permitted_roles": []}}}
```

## 字段

| 字段 | 含义 |
|---|---|
| `shown_column_keys` | **必填**。显示哪些列、按什么顺序（列 key 数组）。不写会白屏；编译器会默认补成全部列 |
| `read_only_column_keys` | 只读列：显示但不能改，显示为灰色带锁 |
| `filters` + `filter_conjunction` | 固定过滤：用户只能看到满足条件的行，自己去不掉（格式见 filters.md） |
| `sorts` | 默认排序 `[{column_key, sort_type: "up" / "down"}]`，用户可以自己改 |
| `groupbys` | 默认分组 `[{column_key}]`，用户可以自己改 |
| `row_height` | 行高：`""`（默认）或 `double` 等 |
| `link_columns_settings` | 链接列在本页的行为，见下 |
| `add_duplicate_record_setting` | 在本页新增行时防重复：`{duplicate_prohibition: true, unique_column_keys: [...]}` |
| `check_new_record_format` | 新增时按文本列设定的格式校验 |
| `show_cell_coloring` | 显示表格里设置的单元格颜色（默认 true） |
| `can_export_to_excel` | 允许用户导出 Excel（默认 false） |

- 表格页**没有** `pre_filters`，写了会被忽略。
- 表格里隐藏的列、锁定的列对应用不起作用，要在页面里用 shown_column_keys 和 read_only_column_keys 设置。

## 链接列设置 link_columns_settings
每个链接列一项，控制在本页能对链接做什么：
```json
"link_columns_settings": [{"key": "M3Ns",
  "enable_link_existing_records": false, "enable_add_new_records": false,
  "enable_modify_linked_records": false, "enable_remove_existing_links": false,
  "link_at_most_one_record": true,
  "link_visible_fields": ["0000", "Tvx4"], "link_editable_fields": [], "link_required_fields": [],
  "link_filters": [], "link_filter_conjunction": "And", "enable_big_data": false}]
```
- `enable_link_existing_records` / `enable_add_new_records`：能否链接已有记录、新建对方记录。
- `enable_modify_linked_records`：能否修改对方记录（可改哪些列看 `link_editable_fields`）。
- `enable_remove_existing_links`：能否解除链接。
- `link_filters`：链接时可选记录的范围（对方表的列 key）。
- 只想展示、不想让用户动链接：前四个开关都设为 false，再把链接列放进 read_only_column_keys。

## 按钮
- 把按钮列放进 shown_column_keys，每行就会出现按钮（按钮写法见 columns.md「按钮」）。
- 按钮**不受页面编辑权限限制**：edit_rows_permission 为 none、列设成只读时，按钮仍然可以点。
- 常用组合：页面只读，只允许通过按钮改状态。例如"取消报名"按钮把状态改为"已取消"。

## 页面权限
表格页有四项权限：
- `view_rows_permission`：谁能看到页面；
- `add_rows_permission`：谁能新增行；
- `edit_rows_permission`：谁能修改；
- `delete_rows_permission`：谁能删除。

**写了 page_permissions 但漏掉某一项时，这一项按 `none` 处理，谁都不能做。**例如只写 view，用户就只能看、不能改。要允许的项都要写上，详见 permissions.md。
