# 应用的权限、角色、用户

来源：
- 官方帮助《Page permissions in an app》《User and role management of an app》；
- 平台前端代码（各页面类型的权限项、缺省规则）。

## 页面权限 page_permissions
每个页面的 `page_permissions` 里有若干权限项，每项写法相同：
```json
"page_permissions": {
  "view_rows_permission": {"permission_type": "default", "permitted_roles": []},
  "edit_rows_permission": {"permission_type": "specific_roles", "permitted_roles": [23423]}}
```
- `permission_type`：
  - `default`：所有应用用户；
  - `admins`：仅应用管理员；
  - `specific_roles`：指定角色，`permitted_roles` 写角色 id；
  - `none`：谁都不行。
- **漏写的项按 `none` 处理**（前提是写了 page_permissions）。整个 page_permissions 都不写时，平台给该页面类型的全部权限项都设为 default。
- 角色 id 用 app_role 工具的 list 查，新建角色用 app_role create。

## 各页面类型有哪些权限项
关键词：查看、新增、编辑（修改）、删除权限。

| 页面类型 | view_rows | add_rows | edit_rows | delete_rows |
|---|---|---|---|---|
| table、gallery、kanban | ✓ | ✓ | ✓ | ✓ |
| calendar | ✓ | ✓ | ✓ | |
| timeline、single_record_page | ✓ | | ✓ | |
| form、data_search、custom_page、html_page、map | ✓ | | | |

- 权限项的完整名字是 `view_rows_permission`、`add_rows_permission`、`edit_rows_permission`、`delete_rows_permission`。**没有** `update_rows_permission`，编译器会报错。
- 表单页只有查看权限：能看到表单就能提交。
- 按钮列不受 edit 权限限制（见 table-page.md）。

## 应用用户和角色
- 谁能用应用由用户列表决定：
  - app_user 工具：list 查看用户，add 按邮箱或学工号加人并分配角色，update_role 改角色。
- 角色只有名字，具体权限在各页面的 page_permissions 里按角色设置。
- 加入方式：
  - **邀请链接**：app_invite_link create，指定角色，可设密码和有效期；
  - **自助加入**：应用配置根部 `is_open_register: true` + `authed_role_id: 角色id`，所有登录用户打开链接即加入，并获得该角色；
  - **匿名访问**：`can_anonymous_access: true`，不登录也能访问。这时没有"当前用户"，"只看自己"类的过滤不起作用。
- 把应用加到表格的人自动成为管理员，不能移除。

## 常见设置

| 需求 | 设置 |
|---|---|
| 所有人可提交表单 | 表单页 view = default |
| 只能看不能改 | 表格页 view = default，add / edit / delete = none |
| 只有管理员能改 | edit = admins |
| 每人只看到自己的记录 | 权限做不到，要用表格页的 filters（见 patterns.md「每人只看自己的记录」） |
| 某个页面只给工作人员看 | 新建角色"工作人员"，给他们分配角色，页面 view = specific_roles + 该角色 id |
