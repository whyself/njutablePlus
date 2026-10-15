// 应用工具：list_apps / get_app_config / check_app_config / create_app / update_app / upload_image
//          + 分组 app / app_snapshot / app_role / app_user / app_invite_link / app_custom_url

import { request, gateway } from '../platform/session.js';
import { compile } from '../checker/app-compiler.js';
import * as history from '../store/history.js';
import { tool, check, need, basePath, P } from './common.js';

const { workspace_id, base_name, app_id } = P;
const WB = ['workspace_id', 'base_name'];
const config = { type: 'object', description: '完整的 app_config（整份覆盖）' };

const appsPath = (a) => `${basePath(a.workspace_id, a.base_name)}/external-apps/`;
const uaPath = (uuid) => `/api/v2.1/universal-apps/${uuid}/`;

async function listRaw(a) {
  return check(await request('GET', appsPath(a))).external_app_list;
}

async function getApp(a) {
  const app = (await listRaw(a)).find((x) => x.id === a.app_id);
  if (!app) throw new Error(`表格「${a.base_name}」下没有 app_id=${a.app_id} 的应用`);
  return { ...app, config: JSON.parse(app.app_config) };
}

async function metadata(a) {
  return check(await gateway('GET', a.workspace_id, a.base_name, 'metadata/')).metadata;
}

// 编译不通过时抛出，诊断信息由 tools/index.js 原样返回给模型
async function compileOrThrow(a, cfg, original) {
  const result = compile(cfg, await metadata(a), { original });
  if (!result.ok) {
    const e = new Error('编译失败，未写入');
    e.diagnostics = result.diagnostics;
    throw e;
  }
  return result;
}

const warnings = (result) => result.diagnostics.filter((d) => d.severity !== 'error');

export const appTools = [
  tool('list_apps', '列出某个表格下的所有通用应用（不含配置正文）。',
    { workspace_id, base_name }, WB, async (a) =>
      (await listRaw(a)).map((x) => ({
        app_id: x.id,
        app_uuid: x.app_uuid,
        app_name: JSON.parse(x.app_config).app_name,
        inactive: x.inactive,
        url: x.external_app_url,
      }))),

  tool('get_app_config', '读取应用的完整 app_config。修改应用前先调用，并配合 get_base_schema 获取列 key。',
    { workspace_id, base_name, app_id }, [...WB, 'app_id'], async (a) => (await getApp(a)).config),

  tool('check_app_config', '只编译检查 app_config，不写入。传 app_id 时额外列出与当前线上版本的差异。',
    { workspace_id, base_name, config, app_id }, [...WB, 'config'], async (a) => {
      const original = a.app_id ? (await getApp(a)).config : undefined;
      const r = compile(a.config, await metadata(a), { original });
      return { ok: r.ok, diagnostics: r.diagnostics, changes: r.changes };
    }),

  tool('create_app', '新建通用应用：先编译，通过后创建。',
    { workspace_id, base_name, config }, [...WB, 'config'], async (a) => {
      const result = await compileOrThrow(a, a.config);
      const data = check(await request('POST', appsPath(a), {
        form: { app_type: 'universal-app', app_config: JSON.stringify(result.output) },
      }));
      const app = data.external_app;
      return { app_id: app.id, app_uuid: app.app_uuid, url: app.external_app_url, warnings: warnings(result) };
    }),

  tool('update_app', '修改通用应用：传入修改后的完整 app_config，先编译，通过后整份覆盖写回。',
    { workspace_id, base_name, app_id, config }, [...WB, 'app_id', 'config'], async (a) => {
      const app = await getApp(a);
      const result = await compileOrThrow(a, a.config, app.config);
      await history.save({ op: 'update_app', app_id: a.app_id, base: a.base_name, before: app.config, after: result.output });
      check(await request('PUT', `${appsPath(a)}${a.app_id}/`, { form: { app_config: JSON.stringify(result.output) } }));
      return { changes: result.changes, warnings: warnings(result) };
    }),

  tool('upload_image', '把用户在对话中上传的图片（img_1、img_2…）上传到表格，返回图片 URL。'
    + 'URL 可用于图片列的值（[url]）、备注元素的 Markdown（![](url)）、应用图标（app_icon + use_custom_icon: true）。',
    { workspace_id, base_name, image_id: { type: 'string', description: '如 img_1' } }, [...WB, 'image_id'], async (a, ctx) => {
      const img = ctx.images.get(a.image_id);
      if (!img) throw new Error(`没有编号为 ${a.image_id} 的图片`);
      const link = check(await request('GET', `/api/v2.1/workspace/${a.workspace_id}/dtable-asset-upload-link/?name=${encodeURIComponent(a.base_name)}`));
      const uploaded = check(await request('POST', `${link.upload_link}?ret-json=1`, {
        form: { parent_dir: link.parent_path, relative_path: link.img_relative_path, file: img },
      }));
      return { url: `https://table.nju.edu.cn/workspace/${a.workspace_id}${link.parent_path}/${link.img_relative_path}/${encodeURIComponent(uploaded[0].name)}` };
    }),

  tool('app', '应用本身：delete 删除、duplicate 复制、set_active 启用/停用。',
    { action: P.action(['delete', 'duplicate', 'set_active']), workspace_id, base_name, app_id,
      active: { type: 'boolean', description: 'set_active 用' } },
    ['action', ...WB, 'app_id'], async (a) => {
      const app = await getApp(a);
      switch (a.action) {
        case 'delete':
          await history.save({ op: 'delete_app', app_id: a.app_id, base: a.base_name, before: app.config });
          return check(await request('DELETE', `${appsPath(a)}${a.app_id}/`));
        case 'duplicate': {
          const data = check(await request('POST', `/api/v2.1/external-apps/${app.app_uuid}/duplicate/`));
          return { app_id: data.external_app.id, app_uuid: data.external_app.app_uuid };
        }
        case 'set_active': need(a, ['active']);
          return check(await request('PUT', `/api/v2.1/external-apps/${app.app_uuid}/status/`, { json: { is_inactive: !a.active } }));
      }
    }),

  tool('app_snapshot', '应用快照：list 列出、create 创建（自上次快照无改动时返回 no need to save）、delete 删除、restore 还原到该快照。',
    { action: P.action(['list', 'create', 'delete', 'restore']), workspace_id, base_name, app_id,
      snapshot_id: { type: 'integer' }, notes: { type: 'string', description: 'create 用：备注' } },
    ['action', ...WB, 'app_id'], async (a) => {
      const p = uaPath((await getApp(a)).app_uuid) + 'snapshots/';
      switch (a.action) {
        case 'list': return check(await request('GET', p));
        case 'create': return check(await request('POST', p, { form: a.notes ? { notes: a.notes } : {} }));
        case 'delete': need(a, ['snapshot_id']); return check(await request('DELETE', `${p}${a.snapshot_id}/`));
        case 'restore': need(a, ['snapshot_id']); return check(await request('POST', `${p}${a.snapshot_id}/restore/`, { form: {} }));
      }
    }),

  tool('app_role', '应用角色：list 列出、create 新建、update 修改、delete 删除。permission 为 r（只读）或 rw（读写）。',
    { action: P.action(['list', 'create', 'update', 'delete']), workspace_id, base_name, app_id,
      role_id: { type: 'integer' }, role_name: { type: 'string' }, permission: { type: 'string', enum: ['r', 'rw'] } },
    ['action', ...WB, 'app_id'], async (a) => {
      const p = uaPath((await getApp(a)).app_uuid) + 'app-roles/';
      switch (a.action) {
        case 'list': return check(await request('GET', p));
        case 'create': need(a, ['role_name', 'permission']);
          return check(await request('POST', p, { json: { role_name: a.role_name, permission: a.permission } }));
        case 'update': need(a, ['role_id', 'role_name', 'permission']);
          return check(await request('PUT', `${p}${a.role_id}/`, { json: { role_name: a.role_name, permission: a.permission } }));
        case 'delete': need(a, ['role_id']); return check(await request('DELETE', `${p}${a.role_id}/`));
      }
    }),

  tool('app_user', '应用用户：list 列出、add 批量添加、update_role 修改角色、remove 移除（不能移除自己）。',
    { action: P.action(['list', 'add', 'update_role', 'remove']), workspace_id, base_name, app_id,
      users: { type: 'array', items: { type: 'object' }, description: 'add 用：[{email, role_id}]，email 为平台内部账号 id' },
      user_id: { type: 'integer', description: 'update_role / remove 用：list 返回的用户 id' },
      role_id: { type: 'integer', description: 'update_role 用' },
      page: { type: 'integer' } },
    ['action', ...WB, 'app_id'], async (a) => {
      const p = uaPath((await getApp(a)).app_uuid) + 'app-users/';
      switch (a.action) {
        case 'list': return check(await request('GET', `${p}?page=${a.page || 1}&per_page=100`));
        case 'add': need(a, ['users']); return check(await request('POST', `${p}batch/`, { json: { users_info: a.users } }));
        case 'update_role': need(a, ['user_id', 'role_id']);
          return check(await request('PUT', `${p}${a.user_id}/`, { json: { app_role_id: a.role_id } }));
        case 'remove': need(a, ['user_id']); return check(await request('DELETE', `${p}${a.user_id}/`));
      }
    }),

  tool('app_invite_link', '应用邀请链接：list 列出、create 创建、delete 删除。',
    { action: P.action(['list', 'create', 'delete']), workspace_id, base_name, app_id,
      role_name: { type: 'string', description: 'create 用：受邀者的角色名' },
      password: { type: 'string' }, expire_days: { type: 'integer' }, token: { type: 'string', description: 'delete 用' } },
    ['action', ...WB, 'app_id'], async (a) => {
      const p = uaPath((await getApp(a)).app_uuid) + 'invite-links/';
      switch (a.action) {
        case 'list': return check(await request('GET', p));
        case 'create': {
          need(a, ['role_name']);
          const form = { role_name: a.role_name };
          if (a.password) form.password = a.password;
          if (a.expire_days) form.expire_days = a.expire_days;
          return check(await request('POST', p, { form }));
        }
        case 'delete': need(a, ['token']); return check(await request('DELETE', `${p}${a.token}/`));
      }
    }),

  tool('app_custom_url', '应用自定义短链（/apps/custom/<custom_url>/）：set 设置、remove 移除。',
    { action: P.action(['set', 'remove']), workspace_id, base_name, app_id, custom_url: { type: 'string' } },
    ['action', ...WB, 'app_id'], async (a) => {
      const p = uaPath((await getApp(a)).app_uuid) + 'custom-url/';
      switch (a.action) {
        case 'set': need(a, ['custom_url']); return check(await request('POST', p, { form: { custom_url: a.custom_url } }));
        case 'remove': return check(await request('DELETE', p));
      }
    }),
];
