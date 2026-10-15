# 常见做法

把前面各篇资料组合起来，解决常见需求。所有做法都是先建好表格结构，再配置应用。

## 每人只看自己的记录
适用于"我的报名""我的申请""我的订单"这类页面。
1. 子表里要有创建者列：`{"column_name": "提交人", "column_type": "creator"}`，列 key 固定为 `_creator`。
   - 先建创建者列，再开放表单。之前的旧记录没有提交人，不会显示给任何人。
2. 表格页加固定过滤：
   ```json
   "filters": [{"column_key": "_creator", "filter_predicate": "include_me", "filter_term": []}], "filter_conjunction": "And"
   ```
- 不要用 `is_current_user_ID` 过滤创建者列（会显示"过滤无效"），也不要写 `pre_filters`（表格页会忽略）。
- 另一种做法：记录归属人需要能改派时，用文本列加默认值 `{creator.id}`，再用 `is_current_user_ID` 过滤（见 filters.md）。
- 管理员要看全部：另建一个不带过滤的表格页，页面 view 设为 admins。

## 自动记录提交人、学工号、提交时间
- 提交人：创建者列 creator（自动、不可改）。
- 学工号：文本列，二选一：
  - 列默认值 `{"enable_fill_default_value": true, "default_value": "{creator.id}"}`；
  - 在表单字段里设默认值 `{creator.id}` + `enable_not_change_default_value: true`，用户能看到但改不了。
- 提交时间：创建时间列 ctime（自动、不可改）。也可以用日期列加默认值 `default_date_type: "current_date"`，这样的日期列之后还能修改。
- 这些列不用放进表单（创建者、创建时间本来也不能放）。在表格页里设为只读显示。

## 状态字段和状态流转按钮
适用于"已报名 / 已取消""待审核 / 通过 / 驳回"。
1. 建单选列"状态"，例如选项"已报名""已取消"。用 get_base_schema 查到选项 id。
2. 给状态列设列默认值（单选写选项 id），这样新提交的记录自动是"已报名"。也可以在表单里放状态字段，设默认值并且不可修改。
3. 建按钮列，用 modify_row 改状态：
   ```json
   {"column_name": "取消", "column_type": "button",
    "column_data": {"button_name": "取消报名",
      "button_action_list": [{"action_type": "modify_row",
        "selected_columns": [{"key": "状态列key", "value": "已取消的选项id"}]}]}}
   ```
   - 需要时让按钮"满足条件才执行"，例如只有状态为已报名才能取消：动作里加 `enable_conditional_execution: true` 和 `filters`。
   - 审核类可以建多个按钮列（"通过""驳回"），或者让管理员在只给管理员看的表格页里直接改状态。
4. 表格页 shown_column_keys 放进状态列和按钮列。状态列放进 read_only_column_keys。edit 权限可以设为 none，只允许通过按钮改。
5. 统计、过滤时只算有效状态，例如 `countlinks("报名", "{状态}='已报名'")`。

## 级联选择：先选 A，再只能选与 A 匹配的 B
例如先选时间段，再只能选该时间段的讲座；先选学院，再只能选该学院的专业。
平台没有"按上一个字段的值动态筛选"的设置，用**条件显示 + 链接筛选**组合实现：
1. 主表（如"讲座"）有一个单选列 A（时间段），每条记录属于一个 A 值。
2. 提交表（如"报名"）里：
   - 建同样选项的单选列 A，让用户先选；
   - 为 A 的**每个选项**各建一个链接列，都链接到主表，例如"时段1讲座""时段2讲座"……
3. 表单里每个链接字段设两样：
   - `filters`：A = 第 n 个选项时才显示（条件显示）；
   - `link_filters`：只列出主表里 A = 第 n 个选项的记录。

   再加上 `link_at_most_one_record: true`、`is_required: true`。
   ```json
   {"key": "链接列n的key", "custom_name": "选择讲座", "is_required": true,
    "filters": [{"column_key": "提交表A列key", "filter_predicate": "is", "filter_term": "选项n的id"}],
    "enable_link_existing_records": true, "link_at_most_one_record": true,
    "link_filters": [{"column_key": "主表A列key", "filter_predicate": "is", "filter_term": "主表选项n的id"}]}
   ```
4. 要在一列里汇总用户选了什么：建 formula 列，按 A 的值取对应链接列：
   `if({时间段}="10月17日 10:30-11:10", rollup("时段1讲座", "讲座名称", "concatenate"), if({时间段}="…", rollup("时段2讲座", "讲座名称", "concatenate"), ""))`
   再在"我的记录"页面显示这个公式列。
- A 的选项不多（10 个以内）时适合这样做。选项很多时，改为一个链接字段加 `link_filters`，在 `link_visible_fields` 里显示 A 列，让用户自己看着选。

## 名额上限，满了就不能选
1. 主表加数字列"名额上限"。
2. 主表加 formula 列统计已报人数，再判断是否可报：
   `if(countlinks("报名", "{状态}='已报名'") < {名额上限}, "可报名", "已满")`
   - 第一个参数是主表里指向提交表的链接列名。建链接列时对方表自动生成，名字用 get_base_schema 查。
3. 表单链接字段加 `link_filters`：该公式列 is "可报名"。公式结果是文本，按文本条件写。
- 主表还可以加勾选列"开放报名"，由管理员控制，一起放进 link_filters。

## 防止重复提交
- 表单页 `add_duplicate_record_setting`：`{"duplicate_prohibition": true, "unique_column_keys": [...]}`，所列的列都相同时拦下。
- "每人每个时间段只能报一场"：去重列写学工号列 + 时间段列。
- 允许取消后重报：去重列再加上状态列，并让表单提交时状态固定为"已报名"（见 form-page.md「防止重复提交」）。

## 提交后跳到"我的记录"
表单页：
```json
"success_message_option": {"is_success_message_show": true, "success_message": "提交成功，可在「我的报名」查看或取消。"},
"enable_redirect": true,
"redirect_config": {"type": "current_app_page", "page_id": "我的记录页面id", "opening_mode": "current_tab", "link": ""}
```

## 数据展示页（只读）
- 表格页：view = default，add / edit / delete = none。shown_column_keys 只放要展示的列。
- 想要卡片式展示用画廊页；按状态分栏用看板页；按日期用日历页（见 other-pages.md）。
- 只想让人按编号查到自己的那条记录：用查询页 data_search，不会列出全部数据。

## 参考别人做好的应用
- 应用在用户能访问的表格里时：list_apps + get_app_config，再 get_base_schema 对照列 key 来学习它的做法。
- 应用不在用户的表格里时，读不到配置。这时请用户描述页面上看到的效果，或请应用作者把表格共享过来。
