# 列类型与 column_data

来源：
- 官方 API《Insert Column》《Models》；
- 官方帮助：各列类型文章、《Set default value for a column》《The button》；
- 平台前端代码（按钮动作）。

建列用 column 工具：
```json
{"action": "add", "workspace_id": 1, "base_name": "表格名", "table_name": "子表名",
 "columns": [{"column_name": "列名", "column_type": "类型", "column_data": {}}]}
```
column_type 一律用连字符写法（single-select，不是 single_select）。table 工具 create 时的 columns 写法相同，但不能含链接列。

## 列类型一览

| column_type | 中文名 | 行里的值（row append / update） | column_data |
|---|---|---|---|
| text | 文本 | `"张三"` | 可写默认值（见「列默认值」） |
| long-text | 长文本 | Markdown 字符串 | — |
| number | 数字 | `12.5` | `{format, decimal, thousands}` |
| checkbox | 勾选 | `true` / `false` | — |
| date | 日期 | `"2026-10-17"` 或 `"2026-10-17 10:30"` | `{format}` |
| duration | 时长 | 秒数 `5400` | `{format: "duration", duration_format: "h:mm"}` |
| single-select | 单选 | 选项**名称** `"已报名"` | `{options: [{name}]}` |
| multiple-select | 多选 | 名称数组 `["A", "B"]` | `{options: [{name}]}` |
| collaborator | 协作人 | 用户 id 数组 `["xxx@auth.local"]` | — |
| image | 图片 | URL 数组（先用 upload_image） | — |
| file | 文件 | 文件对象数组 | — |
| email / url | 邮箱 / 网址 | 字符串 | — |
| rate | 评分 | 整数 | `{rate_max_number: 5, rate_style_color: "#FF8000"}` |
| geolocation | 地理位置 | `{"lng":…, "lat":…}` 或 `{"country_region": "中国"}` | `{geo_format: "lng_lat"}` |
| link | 链接到其他记录 | 用 row_link 工具建链接 | `{other_table: "子表名"}` |
| link-formula | 链接公式 | 系统计算 | 见「链接公式」 |
| formula | 公式 | 系统计算 | `{formula: "…"}`，见 formulas.md |
| auto-number | 自动编号 | 系统生成 | `{format: "0000", digits: 4, prefix_type: "string", prefix: "NO-"}` |
| button | 按钮 | 永远是 null | 见「按钮」 |
| creator / ctime | 创建者 / 创建时间 | 系统填写 | — |
| last-modifier / mtime | 修改者 / 修改时间 | 系统填写 | — |
| digital-sign | 手写签名 | 系统填写 | — |
| department-single-select | 部门单选 | — | — |

只有 creator、ctime、last-modifier、mtime、auto-number、button、formula、link-formula 是系统计算的，不能手动填，也不能做表单输入项。

## 数字 number
- `format`：`number`（默认）、`percent`、`yuan`、`dollar`、`euro`。百分数存成小数：99% 存 0.99。
- `decimal`：`dot` / `comma`；`thousands`：`no` / `comma` / `space`。

## 日期 date
- `format` 只能取：`YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、`M/D/YYYY`、`M/D/YYYY HH:mm`、`DD/MM/YYYY`、`DD/MM/YYYY HH:mm`、`DD.MM.YYYY`、`DD.MM.YYYY HH:mm`。
- 带 `HH:mm` 的格式精确到分钟，否则只存日期，时间会被忽略。
- 新行自动填当前日期：见「列默认值」。

## 单选和多选
- 建列时 options 只写 name 即可，工具会自动补 id、color、textColor（平台要求必须有 id 和 color）。
- 各处要求的写法不同：
  - **写入行**时用选项**名称**；
  - **应用配置**（表单默认值、过滤条件、按钮动作）里用选项 **id**；
  - 选项 id 用 get_base_schema 查。
- 加、改、删选项用 select_option 工具。

## 链接 link
- 建列：`{"column_name": "讲座", "column_type": "link", "column_data": {"other_table": "讲座"}}`。
  - `other_table` 是要关联的子表名，必填；`table` 由工具自动填。
  - 缺 `other_table` 时平台会一直不响应，工具会提前拦下。
- 链接列只能用 column add 单独新建：
  - table create 时不能带链接列；
  - 已有的列不能改成链接列。
- 链接是双向的：建好后，对方子表也会多出一列指向本表。
- 一对一、一对多：链接列本身允许多条。"最多链接一条"的限制在应用里设置：
  - 表单字段写 `link_at_most_one_record: true`；
  - 表格页写 `link_columns_settings`。
- 行之间建链接用 row_link 工具，需要 link_id（get_base_schema 里链接列 data.link_id）。

## 链接公式 link-formula
从链接到的记录里取值、统计。column_data 里的列都写**列名**：

| formula | 作用 | 必填参数 |
|---|---|---|
| `lookup` | 取链接记录某一列的值 | `link_column`（本表的链接列）、`level1_linked_column`（对方表要取的列） |
| `count_links` | 数链接了几条 | `link_column` |
| `rollup` | 汇总对方表某列 | `link_column`、`summary_column`、`summary_method`（`sum` / `average` / `max` / `min` / `concatenate`） |
| `findmax` / `findmin` | 找最大/最小值所在记录 | `link_column`、`searched_column`（要返回的列）、`comparison_column`（比较的列） |

例：在「报名」表显示所选讲座的地点：
```json
{"column_name": "讲座地点", "column_type": "link-formula",
 "column_data": {"formula": "lookup", "link_column": "讲座", "level1_linked_column": "地点"}}
```
- `level2_linked_column` 可以再往下一层：对方表的这一列也是链接列时用。
- 带条件的统计（例如只数状态为"已报名"的）用 formula 列的 `countlinks("报名", "{状态}='已报名'")`，见 formulas.md。

## 按钮 button
按钮列点一下执行一串动作。**column_data 写错时平台也会返回成功，但按钮显示为空白**，工具会先检查格式。
```json
{"column_name": "取消报名", "column_type": "button",
 "column_data": {"button_name": "取消报名", "button_color": "#FFFCB5",
   "button_action_list": [
     {"action_type": "modify_row", "selected_columns": [{"key": "状态列的 key", "value": "已取消选项的 id"}]}
   ]}}
```
- `button_name`：按钮上的文字，省略时用列名；`button_color`：按钮颜色（单选选项色板里的颜色）。
- `button_action_list` 的每个动作都有 `action_type`，按顺序执行。动作 `_id` 由工具补。
- 常用动作：
  - `modify_row`：修改本行。`selected_columns: [{key, value}]`，key 是**列 key**，value 的写法：
    - 单选：选项 **id**；
    - 多选：id 数组；
    - 文本：字符串；
    - 日期：`{"date_type": "current_day"}`（今天），或 `{"date_type": "after_days", "time_days": 3}`、`{"date_type": "before_days", "time_days": 3}`；
    - 数字或勾选：直接写值。
  - `lock_row`：锁定本行，锁定后不能再改。
  - `send_notification` / `send_email`：发通知、发邮件。
  - `open_url`：打开网址。
  - `run_script`：运行脚本（只支持 Python 脚本）。
- **应用里不能用的动作**：`copy_row_to_another_table`、`run_data_processing`、`open_plugin`，这些只能在表格里点。
- 动作可以设成满足条件才执行：在动作里写 `enable_conditional_execution: true`，再加 `filters` 和 `filter_conjunction`（格式见 filters.md）。例如只有状态是"已报名"时才能取消。
- 在应用表格页显示按钮，要把按钮列放进 `shown_column_keys`。**按钮不受页面编辑权限限制**：只读页面上也能点，这正好用来做"只允许通过按钮改状态"。
- 已实测：按上面的格式用 column add 建的按钮，在应用表格页正常显示、能点。即使目标列设为只读、页面只写了 view 权限，modify_row 也能把单选改成另一个选项。

## 创建者、创建时间、修改者、修改时间
- 每个子表最多各一列。列 key 固定：`_creator`、`_ctime`、`_last_modifier`、`_mtime`。
- 建列：`{"column_name": "提交人", "column_type": "creator"}`，不需要 column_data。
- 值由系统写入，不能修改。不要把已有的日期列改成 ctime，旧值会丢失；要用 add 新建。
- 在应用里提交表单时：创建者就是提交的人，创建时间就是提交时间。

## 自动编号 auto-number
`{"format": "0000", "digits": 4}`，需要前缀时加 `prefix_type: "string", prefix: "NO-"`，或 `prefix_type: "date"`（前缀为日期 YYYYMMDD）。

## 列默认值
新增一行时自动填的值，对所有新行生效：表格里新增、表单提交、应用表格页新增、按钮或自动化新增。写在 column_data 里：

| 列类型 | column_data |
|---|---|
| 文本 | `{"enable_fill_default_value": true, "default_value": "待审核"}` |
| 文本：提交人的学工号 | `{"enable_fill_default_value": true, "default_value": "{creator.id}"}` |
| 文本：提交人的姓名 | `{"enable_fill_default_value": true, "default_value": "{creator.name}"}` |
| 单选 | `{"options": [...], "enable_fill_default_value": true, "default_value": "选项id"}` |
| 日期：当天 | `{"format": "YYYY-MM-DD HH:mm", "enable_fill_default_value": true, "default_value": "", "default_date_type": "current_date"}` |
| 数字 / 勾选 / 评分 | `{"enable_fill_default_value": true, "default_value": 0}` |

- 单选默认值要写选项 id。新建列时选项 id 还不知道，可以先建列，用 get_base_schema 查到 id，再给已有列补默认值：
  ```json
  {"action": "update", "table_name": "报名", "column": "状态", "op_type": "modify_column_type", "new_column_type": "single-select",
   "column_data": {"options": [原有选项原样照抄], "enable_fill_default_value": true, "default_value": "选项id"}}
  ```
  new_column_type 写列原来的类型，column_data 写完整的列设置，会整份替换，所以单选要带上原有选项。
- 南大表格里，`{creator.id}` 填的是登录用户的学工号。它只在用户通过界面新增时生效，例如表单提交、应用页面新增；用 row 工具追加的行不会展开。
- row 工具 append 时，没填的列会自动按列默认值填。
- 已实测：用 column add 和 update 写入默认值；用 row append 新增时单选、日期、文本默认值都生效。
- 表单页字段也能单独设默认值（见 form-page.md），会覆盖列默认值。
- 公式、文件、签名、按钮等系统计算的列没有默认值。

## 修改列类型（column update，op_type: modify_column_type）
- 可能丢数据，例如文本改成数字。
- 创建者、创建时间、修改者、修改时间这类列不能改类型。
- 不能把已有列改成链接、创建时间、创建者这类列（工具会拦下），要新建一列。
- 子表的第一列只能是：文本、数字、日期、单选、自动编号、公式。
