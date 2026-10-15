# 表单页（type: form）

来源：
- 官方帮助《Form pages in SeaTable apps》《Conditional display of form fields》《Set default value》《User ID filter》；
- 平台前端代码（字段名）；
- 参考应用的真实配置。

## 结构
表单页有三部分，三者要对应：
- `columns`：每个表单字段的设置；
- `static_elements`：备注、分隔线等不对应列的元素；
- `elements_order`：表单上从上到下的显示顺序。

```json
{"id": "Fm01", "name": "报名", "type": "form", "table_id": "0000",
 "page_permissions": {"view_rows_permission": {"permission_type": "default", "permitted_roles": []}},
 "static_elements": [{"key": "Rm01", "type": "remarks", "value": "## 报名须知\n请如实填写。"}],
 "columns": [{"key": "0000", "is_required": true}, {"key": "aB3d"}],
 "elements_order": [{"key": "Rm01", "type": "remarks"}, {"key": "0000", "type": "column"}, {"key": "aB3d", "type": "column"}]}
```
- 加字段时 `columns` 和 `elements_order` 两边都要加。只在 columns 里、不在 elements_order 里的字段不显示。
- 系统计算的列不能做表单字段：公式、链接公式、创建者、创建时间、按钮、自动编号等。

## 字段设置（columns 里的每一项）

| 字段 | 含义 |
|---|---|
| `key` | 列 key（必填） |
| `custom_name` | 表单上显示的名字，不填用列名 |
| `description` | 字段下方的说明文字 |
| `is_required` | 必填 |
| `enable_fill_default_value` + `default_value` | 预填默认值，见「默认值」 |
| `enable_not_change_default_value` | 默认值不能修改（字段变成只读） |
| `options_show_type` | 单选、多选的显示方式：`dropdown` 下拉，或 `list` 平铺单选按钮 |
| `filters` + `filter_conjunction` | 满足条件才显示这个字段，见「条件显示」 |
| `enable_scan_code_entry` | 允许扫码填写 |
| 链接字段专用 | 见「链接字段」 |

## 默认值
- 单选写选项 **id**，数字写数字，文本写字符串，勾选写 true/false。
- 文本字段写 `{creator.id}` 填提交人学工号，写 `{creator.name}` 填姓名。再配合 `enable_not_change_default_value: true`，就是"自动填、改不了"：
  ```json
  {"key": "X9OH", "custom_name": "学工号", "is_required": true,
   "enable_fill_default_value": true, "default_value": "{creator.id}", "enable_not_change_default_value": true}
  ```
- 想让某列"提交时自动带值、用户看不到"：不要把它放进表单，改用**列默认值**（columns.md「列默认值」），它对表单提交同样生效。
- 列本身有默认值、表单字段也设了默认值时，表单提交用表单的值。

## 条件显示
字段的 `filters` 写条件，条件满足时才显示这个字段：
- 只能引用排在它**前面**的字段；
- 条件格式见 filters.md，单选要写选项 id。

前面那个字段建议设为必填，否则用户不选时后面的字段永远不出现。
```json
{"key": "y9XA", "custom_name": "选择讲座", "is_required": true,
 "filters": [{"column_key": "8RMN", "filter_predicate": "is", "filter_term": "slot2"}], "filter_conjunction": "And"}
```
上例：字段 8RMN（单选"时间段"）选中 id 为 slot2 的选项时，才显示 y9XA。
- 隐藏的字段即使设了必填，也不会拦住提交。
- 可以用来做"先选 A 再出现对应的 B"，完整做法见 patterns.md「级联选择」。

## 链接字段
链接列做表单字段时，用户从对方子表里选记录：

| 字段 | 含义 |
|---|---|
| `enable_link_existing_records` | 允许选择已有记录（一般为 true） |
| `enable_add_new_records` | 允许在表单里新建对方记录 |
| `link_at_most_one_record` | 最多只能选一条 |
| `link_visible_fields` | 选择框里显示对方表的哪些列（对方表的列 key） |
| `link_required_fields` | 新建对方记录时必填的列 |
| `link_filters` + `link_filter_conjunction` | 只列出满足条件的对方记录（条件里的列是**对方表**的列 key） |
| `existing_link_btn_name` + `enable_customize_existing_link_btn_name: true` | 选择按钮上的文字 |
| `new_link_btn_name` + `enable_customize_new_link_btn_name: true` | 新建按钮上的文字 |
| `enable_big_data` | 对方表超过 2 万行时开启 |

例：只能选"开放报名"且时间段为 slot1 的讲座，且只能选一场：
```json
{"key": "M3Ns", "custom_name": "选择讲座", "is_required": true,
 "enable_link_existing_records": true, "enable_add_new_records": false, "link_at_most_one_record": true,
 "link_visible_fields": ["0000", "Tvx4", "24EA"],
 "link_filters": [{"column_key": "48Jy", "filter_predicate": "is", "filter_term": true},
                  {"column_key": "Tvx4", "filter_predicate": "is", "filter_term": "slot1"}],
 "link_filter_conjunction": "And",
 "existing_link_btn_name": "选择讲座", "enable_customize_existing_link_btn_name": true}
```

## 备注和分隔线
- 备注：`static_elements` 里 `{"key": "Rm01", "type": "remarks", "value": "Markdown 内容"}`。
  - 内容写在 `value`，支持标题、加粗、列表、链接、图片 `![](url)`；
  - 可加 `text_color`、`background_color` 设文字和背景色。
- 分隔线：`{"key": "Sp01", "type": "split_line"}`。
- 它们也要按显示位置放进 `elements_order`，type 和 static_elements 里一致。

## 提交后的提示和跳转
```json
"success_message_option": {"is_success_message_show": true, "success_message": "报名成功！"},
"enable_redirect": true,
"redirect_config": {"type": "current_app_page", "page_id": "Tb01", "opening_mode": "current_tab", "link": ""}
```
- 跳到其他网站：`{"type": "other_web_page", "link": "https://…", "opening_mode": "new_tab", "page_id": ""}`。
- 不需要跳转时省略 `enable_redirect`。

## 防止重复提交
```json
"add_duplicate_record_setting": {"duplicate_prohibition": true, "unique_column_keys": ["X9OH", "8RMN"]}
```
- 所列的列取值完全相同时，提交会被拦下。所列的列必须是表单里的字段。
- 如果记录有"已取消"这类状态，并且取消后要允许重新提交：把状态列也加进 unique_column_keys，状态列再用默认值"已报名"放进表单（设为不可修改）。这样只有"已报名"的记录参与去重。

## 页面权限
表单页只有 `view_rows_permission`：能看到页面就能提交。不能用表单修改或删除已有记录。
