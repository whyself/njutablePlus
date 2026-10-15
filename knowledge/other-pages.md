# 其他页面类型

来源：
- 官方帮助：Gallery、Kanban、Calendar、Timeline、Query、Single record、Custom 各页面类型的文章；
- 平台前端代码（字段名和默认值）。

所有页面都有 `id`、`name`、`type`、`page_permissions`；绑定子表的页面还有 `table_id`。下面只列各类型特有的字段，列都用列 key。只有看板页、时间线页里以 `_column_name` 结尾的字段例外，写**列名**（按字段名推断，未实测；写完用 get_app_config 读回确认）。

## 画廊页 gallery
以卡片展示记录，适合带图片的数据，例如人员介绍、作品展示。

| 字段 | 含义 |
|---|---|
| `shown_title_column_key` | 卡片标题列（默认第一列） |
| `shown_image_column_key` | 卡片图片列（默认第一个图片列） |
| `fields_shown_setting` | 卡片上显示哪些字段 `[{key, shown: true}]` |
| `display_field_name` | 卡片上是否显示字段名 |
| `shown_column_keys` | 打开详情时显示的列 |
| `filters` / `filter_conjunction` / `sorts` | 固定过滤和排序 |
| `link_columns_settings` | 同表格页 |

权限：view / add / edit / delete。

## 看板页 kanban
按单选列把记录分成几栏，拖动卡片可以改状态，适合任务流程、审批进度。

| 字段 | 含义 |
|---|---|
| `groupby_column_name` | 分栏依据的单选列，写**列名** |
| `title_column_name` | 卡片标题列，写**列名** |
| `shown_column_keys` | 卡片上显示的列 |
| `filters` / `filter_conjunction` / `sorts` | 固定过滤和排序 |
| `hideEmptyValues` / `showFieldNames` | 隐藏空字段 / 显示字段名 |

权限：view / add / edit / delete。

## 日历页 calendar
按日期列把记录显示在日历上，例如会议、活动安排。

| 字段 | 含义 |
|---|---|
| `column_title` | 日历上显示的标题列 |
| `column_start_date` / `column_end_date` | 开始、结束日期列（结束可省略） |
| `column_color` | 按哪个单选列着色 |
| `week_start` | 每周从周几开始：0=周日，1=周一 |
| `shown_column_keys` / `filters` | 详情显示的列、固定过滤 |

权限：view / add / edit。

## 时间线页 timeline
按开始、结束时间显示时间段，例如请假、排班、项目周期。

| 字段 | 含义 |
|---|---|
| `start_time_column_name` / `end_time_column_name` | 开始、结束时间列，写**列名** |
| `record_end_type` | `end_time`（用结束时间列）或用时长列 `record_duration_column_name` |
| `label_column_name` | 条上显示的文字列，写**列名** |
| `single_select_column_name` | 按哪个单选列着色，写**列名** |
| `shown_column_keys` / `filters` / `sorts` | 详情显示的列、固定过滤、排序 |

权限：view / edit。

## 查询页 data_search
用户输入关键字查记录，例如凭学号查成绩、凭单号查进度。只显示查到的结果，不会列出全部数据。

| 字段 | 含义 |
|---|---|
| `columns_key` | 可以按哪些列查询 |
| `enable_fuzzy_query` | 模糊匹配，默认精确匹配 |
| `case_sensitive` | 区分大小写 |
| `shown_column_keys` | 结果显示的列 |
| `pre_filters` / `pre_filter_conjunction` / `pre_sorts` | 预设过滤和排序：查询结果再按这些条件限制 |
| `is_query_result_editable` | 结果能否编辑 |
| `is_note_show` + `note` | 在查询框下方显示说明文字 |

权限：只有 view。

## 单条记录页 single_record_page
一页展示一条记录，可以翻页浏览、搜索、编辑，适合个人档案、详情页。版式内容存在单独的文件里，工具**只能设置字段，不能设计版式**。

| 字段 | 含义 |
|---|---|
| `shown_column_keys` / `read_only_column_keys` | 显示的列、只读列 |
| `pre_filters` / `pre_filter_conjunction` / `pre_sorts` | 能浏览哪些记录 |
| `link_columns_settings` | 同表格页 |

权限：view / edit。

## 自定义页 custom_page、HTML 页 html_page
内容（排版、统计图、HTML）存在单独的文件里，用工具只能设置页面名和权限，**不能编辑内容**。用户需要时，请他在应用编辑器里手动搭建。
