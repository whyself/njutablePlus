# 通用应用（universal app）配置

来源：
- 官方帮助《Apps in SeaTable》《Page types in SeaTable apps》《Change universal app global settings》；
- 平台前端代码（各页面类型的字段）。

## 整体结构
create_app、update_app 的 config 是一整份应用配置：
```json
{"app_name": "活动报名",
 "settings": {
   "navigation": [{"id": "Fm01", "name": "报名", "type": "page"}, {"id": "Tb01", "name": "我的报名", "type": "page"}],
   "pages": [
     {"id": "Fm01", "name": "报名", "type": "form", "table_id": "0000", "...": "表单页字段见 form-page.md"},
     {"id": "Tb01", "name": "我的报名", "type": "table", "table_id": "0000", "...": "表格页字段见 table-page.md"}
   ]}}
```
- `table_id` 是子表 id（get_base_schema 里的 table_id，第一个子表通常是 "0000"）。
- 页面里引用列一律用**列 key**。
- 其余默认字段由编译器补全：app_type、主题、图标、页面默认设置等。
- `update_app` 是整份覆盖：先 get_app_config，在结果上改，再整份传回，不要丢掉原有字段。

## 页面 id 和导航
- 页面 id：4 位字母数字，不能重复，例如 "Fm01"、"Tb01"、"a8Kd"。
- 每个页面都要挂到 `settings.navigation`，否则用户进不去：`{"id": "页面id", "type": "page"}`。`name` 可省略，会用页面名。
- 文件夹：`{"id": "F001", "type": "folder", "name": "管理", "children": [{"id": "Tb02", "type": "page"}]}`。
- 页面之间的链接：`https://table.nju.edu.cn/external-apps/{app_uuid}/?page_id={页面id}`。可以写在表单备注的 Markdown 里，例如"点击[我的报名](…)查看"。

## 页面类型一览

| type | 页面 | 用途 | 绑定子表 | 资料 |
|---|---|---|---|---|
| `form` | 表单 | 收集数据，每次提交新增一行 | 是 | form-page.md |
| `table` | 表格 | 以表格形式查看、编辑数据，可放按钮 | 是 | table-page.md |
| `gallery` | 画廊 | 以卡片展示，适合带图片的数据 | 是 | other-pages.md |
| `kanban` | 看板 | 按单选列分组的卡片，适合流程状态 | 是 | other-pages.md |
| `calendar` | 日历 | 按日期列显示在日历上 | 是 | other-pages.md |
| `timeline` | 时间线 | 按开始、结束时间显示时间段 | 是 | other-pages.md |
| `data_search` | 查询 | 输入关键字查记录，例如凭学号查成绩 | 是 | other-pages.md |
| `single_record_page` | 单条记录 | 一页展示一条记录的详情 | 是 | other-pages.md |
| `custom_page` | 自定义页面 | 自由排版、统计图表 | 否 | 内容存在单独的文件里，工具**不能编辑内容** |
| `html_page` | HTML 页面 | 自己写 HTML/JS | 否 | 工具**不能编辑内容** |
| `map` / `map_cn` | 地图 | 地理位置列显示在地图上 | 是 | — |

需要自定义页面、HTML 页面时，告诉用户在应用编辑器里手动做，可以先用表格页或画廊页代替。

## 应用级设置（config 根部）

| 字段 | 含义 |
|---|---|
| `app_name` | 应用名，50 字以内 |
| `app_theme_mode` | `dark` / `light`（导航栏深色或浅色） |
| `app_theme_color` | 主题色 `#RRGGBB` |
| `icon_class_name` | 内置图标名，如 `default`、`warehouse-management` |
| `use_custom_icon` + `app_icon` | 自定义图标：图片 URL，先用 upload_image 上传 |
| `can_anonymous_access` | 允许不登录访问 |
| `is_open_register` + `authed_role_id` | 允许所有登录用户自助加入，并给他们一个角色（角色 id 来自 app_role list） |

## 修改应用的流程
1. list_apps 找到 app_id；get_app_config 读配置；get_base_schema 拿列 key 和选项 id。
2. 需要新列时先用 column 工具建列，再重新 get_base_schema 拿到列 key。
3. 在原配置上修改，check_app_config 检查（传 app_id 会列出与线上版本的差异），再 update_app。
4. 编译报错时按 diagnostics 里的 hint 修改。不要靠往配置里塞各种字段来试探，字段含义查本资料。
