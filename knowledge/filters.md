# 过滤条件

来源：
- 官方前端库 dtable-utils（各列类型可用的条件、条件值格式）；
- 官方帮助《Filter records》《User ID filter》《Combine filter rules》。

## 过滤条件的结构
所有地方的过滤条件都是同一种结构，引用列一律用**列 key**：
```json
{"filters": [{"column_key": "kTjb", "filter_predicate": "is", "filter_term": "选项id"}],
 "filter_conjunction": "And"}
```
- `filter_conjunction`：`And`（全部满足）或 `Or`（满足任一）。不同地方字段名不同，见「哪些地方用过滤条件」。
- 日期条件还要写 `filter_term_modifier`，见「日期条件」。
- 不需要值的条件（is_empty、is_not_empty、include_me）把 filter_term 写成 `""` 或 `[]`。

## 各列类型可用的条件
条件和列类型不匹配时，平台会显示"过滤无效"。编译器会检查这一点。

| 列类型 | 可用的 filter_predicate |
|---|---|
| text | contains, does_not_contain, is, is_not, is_empty, is_not_empty, is_current_user_ID |
| email, url | contains, does_not_contain, is, is_not, is_empty, is_not_empty |
| number, duration, rate | equal, not_equal, less, greater, less_or_equal, greater_or_equal, is_empty, is_not_empty |
| checkbox | is |
| date, ctime, mtime | is, is_not, is_within, is_before, is_after, is_on_or_before, is_on_or_after, is_empty, is_not_empty |
| single-select | is, is_not, is_any_of, is_none_of, is_empty, is_not_empty |
| multiple-select | has_any_of, has_all_of, has_none_of, is_exactly, is_empty, is_not_empty |
| collaborator | has_any_of, has_all_of, has_none_of, is_exactly, is_empty, is_not_empty, include_me |
| creator, last-modifier | contains, does_not_contain, include_me, is, is_not |
| auto-number | contains, does_not_contain, is, is_not |
| long-text, image, file, digital-sign | is_empty, is_not_empty |
| formula, link-formula | 按公式结果的类型：文本结果按 text，数字按 number，日期按 date |
| link | 按对方表显示列的类型 |

## filter_term 怎么写

| 列类型 | 写法 |
|---|---|
| 文本 | 字符串：`"已通过"` |
| 数字 | 数字：`60` |
| 勾选 | `true` / `false` |
| 单选 is / is_not | 一个**选项 id**：`"cancelled"`（不是选项名称） |
| 单选 is_any_of / is_none_of | 选项 id 数组：`["id1", "id2"]` |
| 多选 | 选项 id 数组 |
| 协作人、创建者 is / contains | 用户 id 数组：`["xxx@auth.local"]` |
| include_me / is_current_user_ID | 不需要值：`[]` 或 `""` |

## 当前用户相关的条件
- **只看自己创建的记录**：创建者列（key 固定 `_creator`）用 `include_me`：
  `{"column_key": "_creator", "filter_predicate": "include_me", "filter_term": []}`
  已实测：用在应用表格页的 filters 里正常生效，不会显示"过滤无效"。
- 协作人列、修改者列也能用 `include_me`。
- `is_current_user_ID` **只能用在文本列**：该列的值等于当前用户的学工号时显示。通常配合文本列默认值 `{creator.id}` 使用（见 columns.md「列默认值」）。
  - 适合"记录可以改派给别人"的场景：改了那一列，记录就转到另一个人名下。创建者列做不到，因为它的值不能改。

## 日期条件
日期条件写 `filter_term_modifier`，需要具体值时再写 `filter_term`：
- `filter_term_modifier` 可选：today, tomorrow, yesterday, one_week_ago, one_week_from_now, one_month_ago, one_month_from_now, number_of_days_ago, number_of_days_from_now, exact_date。
- `is_within` 用另一组：the_past_week, the_past_month, the_past_year, the_next_week, the_next_month, the_next_year, the_next_numbers_of_days, the_past_numbers_of_days, this_week, this_month, this_year。
- 例：截止日期在今天之后：
  `{"column_key": "aB3d", "filter_predicate": "is_after", "filter_term_modifier": "today", "filter_term": ""}`
- 例：指定日期：`{"filter_predicate": "is", "filter_term_modifier": "exact_date", "filter_term": "2026-10-17"}`

## 哪些地方用过滤条件

| 位置 | 字段 | 引用的列属于 |
|---|---|---|
| 表格页、画廊页、看板页、日历页、时间线页的固定过滤 | 页面的 `filters` + `filter_conjunction` | 页面绑定的子表 |
| 查询页、单条记录页的预设过滤 | 页面的 `pre_filters` + `pre_filter_conjunction` | 页面绑定的子表 |
| 表单字段"满足条件才显示" | 字段的 `filters` + `filter_conjunction` | 表单绑定的子表（只能引用排在前面的字段） |
| 表单链接字段"可选记录的范围" | 字段的 `link_filters` + `link_filter_conjunction` | **链接到的子表** |
| 表格页链接列"可选记录的范围" | `link_columns_settings[].link_filters` | **链接到的子表** |
| 按钮动作满足条件才执行 | 动作的 `enable_conditional_execution: true` + `filters` + `filter_conjunction` | 按钮所在子表 |
| 视图 | view 工具 update 的 settings.filters | 视图所在子表 |

注意：
- **表格页没有 pre_filters**，写了会被忽略，要用 `filters`。
- 应用里页面的固定过滤，用户改不掉；用户自己加的过滤只能在这个范围内再缩小。
