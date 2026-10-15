// 表格工具：list_bases / get_base_schema / query_rows
//          + 分组 base / table / column / select_option / row / row_link / view / base_snapshot

import { request, gateway } from '../platform/session.js';
import { tool, check, need, basePath, P } from './common.js';
import { COLUMN_TYPES } from '../checker/rules.js';

const { workspace_id, base_name, table_name, column } = P;
const WB = ['workspace_id', 'base_name'];

const gw = async (method, a, sub, json = null) => check(await gateway(method, a.workspace_id, a.base_name, sub, { json }));

// 平台不校验列类型，写错（如 single_select）会建出损坏的列，这里先拦下
function checkTypes(types) {
  const bad = types.filter((t) => !COLUMN_TYPES.includes(t));
  if (bad.length) throw new Error(`不支持的列类型：${bad.join('、')}。可用类型：${COLUMN_TYPES.join(', ')}`);
}

// 单选/多选选项的默认配色（平台要求每个选项都有 color，缺了会 400）
const PALETTE = [
  ['#FFFCB5', '#202428'], ['#FFEAB6', '#202428'], ['#C2F5E9', '#202428'], ['#B7CEF9', '#202428'],
  ['#E9E9E9', '#202428'], ['#FFD9C8', '#202428'], ['#DCDCFC', '#202428'], ['#F9D7F3', '#202428'],
];

// 补全选项：缺 id 补 6 位数字 id，缺 color 按调色板补
function withOptionDefaults(options) {
  const used = new Set(options.map((o) => o.id).filter(Boolean));
  const fresh = () => { let id; do id = String(100000 + Math.floor(Math.random() * 900000)); while (used.has(id)); used.add(id); return id; };
  return options.map((o, i) => {
    const [color, textColor] = PALETTE[i % PALETTE.length];
    return { ...o, id: o.id ?? fresh(), color: o.color ?? color, textColor: o.textColor ?? (o.color ? undefined : textColor) };
  });
}

// 建列前检查并补全：列类型、选项 id / 颜色、链接列的 table / other_table
// 按钮列：平台不校验 column_data，写错了也返回成功，但按钮显示为空白。格式见 knowledge/columns.md
// 动作类型来自平台前端；copy_row_to_another_table / run_data_processing / open_plugin 在应用里不能用
const BUTTON_ACTIONS = ['modify_row', 'lock_row', 'send_notification', 'send_email', 'run_script', 'open_url',
  'copy_row_to_another_table', 'run_data_processing', 'open_plugin', 'save_page_design_pdf_to_column',
  'send_wechat_message', 'send_dingtalk_message'];
const randomId = () => Math.random().toString(36).slice(2, 6);

function normalizeButton(c) {
  const data = c.column_data ?? {};
  const where = `按钮列「${c.column_name}」`;
  const actions = data.button_action_list;
  if (!Array.isArray(actions) || !actions.length)
    throw new Error(`${where}缺少 column_data.button_action_list（动作列表），`
      + '例如 {"button_name": "取消", "button_action_list": [{"action_type": "modify_row", "selected_columns": [{"key": "列key", "value": "单选选项id"}]}]}');
  for (const act of actions) {
    if (!BUTTON_ACTIONS.includes(act?.action_type))
      throw new Error(`${where}的 action_type "${act?.action_type}" 不支持，可用：${BUTTON_ACTIONS.join(', ')}`);
    if (act.action_type === 'modify_row' && (!Array.isArray(act.selected_columns) || !act.selected_columns.length))
      throw new Error(`${where}的 modify_row 动作缺少 selected_columns: [{key: 列key, value: 新值}]（单选写选项 id）`);
  }
  return {
    ...c,
    column_data: {
      button_name: c.column_name, button_color: '#FFFCB5', ...data,
      button_action_list: actions.map((act) => ({ _id: randomId(), ...act })),
    },
  };
}

// link-formula 各公式的必填参数（官方 API Insert Column）
const LINK_FORMULA_REQUIRED = {
  lookup: ['link_column', 'level1_linked_column'],
  count_links: ['link_column'],
  rollup: ['link_column', 'summary_column', 'summary_method'],
  findmax: ['link_column', 'searched_column', 'comparison_column'],
  findmin: ['link_column', 'searched_column', 'comparison_column'],
};

function checkLinkFormula(c) {
  const data = c.column_data ?? {};
  const required = LINK_FORMULA_REQUIRED[data.formula];
  if (!required)
    throw new Error(`链接公式列「${c.column_name}」的 column_data.formula 必须是 ${Object.keys(LINK_FORMULA_REQUIRED).join(' / ')}`);
  const missing = required.filter((k) => !data[k]);
  if (missing.length)
    throw new Error(`链接公式列「${c.column_name}」（${data.formula}）缺少 column_data.${missing.join('、')}（都写列名）`);
}

function normalizeColumns(columns, tableName) {
  checkTypes(columns.map((c) => c.column_type));
  return columns.map((c) => {
    const data = c.column_data ?? {};
    if (c.column_type === 'button') return normalizeButton(c);
    if (c.column_type === 'link-formula') checkLinkFormula(c);
    if (['single-select', 'multiple-select'].includes(c.column_type) && Array.isArray(data.options))
      return { ...c, column_data: { ...data, options: withOptionDefaults(data.options) } };
    if (c.column_type === 'link') {
      // 缺 other_table 时平台不返回任何响应（实测），必须在这里拦下
      if (typeof data.other_table !== 'string' || !data.other_table)
        throw new Error(`链接列「${c.column_name}」缺少 column_data.other_table（要关联的子表名称），例如 {"other_table": "讲座"}`);
      return { ...c, column_data: { ...data, table: tableName } };
    }
    return c;
  });
}

export const baseTools = [
  tool('list_bases', '列出当前账号可访问的所有表格（base）：个人的、群组的、别人共享给我的。每项含 workspace_id 和 base_name。', {}, [], async () => {
    const data = check(await request('GET', '/api/v2.1/workspaces/'));
    const out = [];
    for (const w of data.workspace_list) {
      if (w.type === 'personal' || w.type === 'group')
        for (const t of w.table_list || [])
          out.push({ workspace_id: w.id, base_name: t.name, source: w.type === 'group' ? `群组：${w.name}` : '个人' });
      if (w.type === 'shared')
        for (const t of w.shared_table_list || [])
          out.push({ workspace_id: t.workspace_id, base_name: t.name, source: `${t.from_user_name} 共享`, permission: t.permission });
    }
    return out;
  }),

  tool('get_base_schema', '读取表格结构：所有子表、列（key / 名称 / 类型 / 选项等）、视图名称。修改表格或应用前先调用。',
    { workspace_id, base_name }, WB, async (a) => {
      const { metadata } = await gw('GET', a, 'metadata/');
      return metadata.tables.map((t) => ({
        table_id: t._id,
        name: t.name,
        columns: t.columns.map((c) => ({ key: c.key, name: c.name, type: c.type, data: c.data ?? null })),
        views: (t.views || []).map((v) => v.name),
      }));
    }),

  tool('query_rows', '用 SQL 查询行，例如 select * from 子表名 where 列名 = \'x\' limit 100。返回的字段名是列名，_id 是行 id。',
    { workspace_id, base_name, sql: { type: 'string' } }, [...WB, 'sql'], async (a) => {
      const data = await gw('POST', a, 'sql', { sql: a.sql, convert_keys: true });
      return data.results;
    }),

  tool('base', '表格（base）本身：create 新建、rename 改名、delete 删除（进回收站）、copy 复制到另一个工作区。',
    { action: P.action(['create', 'rename', 'delete', 'copy']), workspace_id, base_name,
      new_name: { type: 'string', description: 'rename 用' },
      dst_workspace_id: { type: 'integer', description: 'copy 用：目标工作区 id' } },
    ['action', ...WB], async (a) => {
      const path = `/api/v2.1/workspace/${a.workspace_id}/dtable/`;
      switch (a.action) {
        case 'create': return check(await request('POST', '/api/v2.1/dtables/', { form: { name: a.base_name, workspace_id: a.workspace_id } }));
        case 'rename': need(a, ['new_name']); return check(await request('PUT', path, { form: { name: a.base_name, new_name: a.new_name } }));
        case 'delete': return check(await request('DELETE', path, { form: { name: a.base_name } }));
        case 'copy': need(a, ['dst_workspace_id']);
          return check(await request('POST', '/api/v2.1/dtable-copy/', { form: { src_workspace_id: a.workspace_id, name: a.base_name, dst_workspace_id: a.dst_workspace_id } }));
      }
    }),

  tool('table', '子表：create 新建（可同时带列）、rename 改名、delete 删除、duplicate 复制。',
    { action: P.action(['create', 'rename', 'delete', 'duplicate']), workspace_id, base_name, table_name,
      new_table_name: { type: 'string', description: 'rename 用' },
      columns: { type: 'array', items: { type: 'object' }, description: 'create 用：[{column_name, column_type, column_data?}]' },
      is_duplicate_records: { type: 'boolean', description: 'duplicate 用：是否连同数据一起复制' } },
    ['action', ...WB, 'table_name'], async (a) => {
      switch (a.action) {
        case 'create': return gw('POST', a, 'tables/', { table_name: a.table_name, columns: normalizeColumns(a.columns || [], a.table_name) });
        case 'rename': need(a, ['new_table_name']); return gw('PUT', a, 'tables/', { table_name: a.table_name, new_table_name: a.new_table_name });
        case 'delete': return gw('DELETE', a, 'tables/', { table_name: a.table_name });
        case 'duplicate': return gw('POST', a, 'tables/duplicate-table/', { table_name: a.table_name, is_duplicate_records: !!a.is_duplicate_records });
      }
    }),

  tool('column', '列：add 批量添加、update 修改（op_type: rename_column / modify_column_type / resize_column / move_column / freeze_column）、delete 删除。',
    { action: P.action(['add', 'update', 'delete']), workspace_id, base_name, table_name, column,
      columns: { type: 'array', items: { type: 'object' }, description: 'add 用：[{column_name, column_type, column_data?}]。column_type 用连字符写法（single-select、long-text 等）；'
        + '单选选项写在 column_data.options: [{name}]（id 和颜色自动补）；链接列写 column_data: {other_table: "要关联的子表名"}。'
        + '按钮、链接公式、默认值等的 column_data 写法先用 docs 工具查 columns.md' },
      op_type: { type: 'string', enum: ['rename_column', 'modify_column_type', 'resize_column', 'move_column', 'freeze_column'] },
      new_column_name: { type: 'string' }, new_column_type: { type: 'string' }, new_column_width: { type: 'integer' },
      target_column: { type: 'string', description: 'move_column 用：移到哪一列之后' }, frozen: { type: 'boolean' } },
    ['action', ...WB, 'table_name'], async (a) => {
      switch (a.action) {
        case 'add': {
          need(a, ['columns']);
          // formula / link 类不能批量添加，逐个插入
          const single = (c) => ['formula', 'link', 'link-formula'].includes(c.column_type);
          const cols = normalizeColumns(a.columns, a.table_name);
          const out = [];
          const batch = cols.filter((c) => !single(c));
          if (batch.length) out.push(await gw('POST', a, 'batch-append-columns/', { table_name: a.table_name, columns: batch }));
          for (const c of cols.filter(single)) out.push(await gw('POST', a, 'columns/', { table_name: a.table_name, ...c }));
          return out;
        }
        case 'update': {
          need(a, ['column', 'op_type']);
          if (a.op_type === 'modify_column_type') {
            checkTypes([a.new_column_type]);
            // 官方：已有列不能转成链接列；转成自动填充的列旧值会全部失效（实测转 ctime 后整列为空）
            if (['link', 'ctime', 'mtime', 'creator', 'last-modifier'].includes(a.new_column_type))
              throw new Error(`不能把已有列改成 ${a.new_column_type} 类型，请用 add 新建一列（需要的话再删掉旧列）`);
          }
          const { action, workspace_id, base_name, columns, ...body } = a;
          return gw('PUT', a, 'columns/', body);
        }
        case 'delete': need(a, ['column']); return gw('DELETE', a, 'columns/', { table_name: a.table_name, column: a.column });
      }
    }),

  tool('select_option', '单选/多选列的选项：add 添加、update 修改（按 id）、delete 删除（按名称）。',
    { action: P.action(['add', 'update', 'delete']), workspace_id, base_name, table_name, column,
      options: { type: 'array', items: { type: 'object' }, description: 'add：[{name, color, textColor}]；update：[{id, name?, color?, textColor?}]' },
      option_names: { type: 'array', items: { type: 'string' }, description: 'delete 用' } },
    ['action', ...WB, 'table_name', 'column'], async (a) => {
      const base = { table_name: a.table_name, column: a.column };
      switch (a.action) {
        case 'add': need(a, ['options']); return gw('POST', a, 'column-options/', { ...base, options: withOptionDefaults(a.options) });
        case 'update': need(a, ['options']); return gw('PUT', a, 'column-options/', { ...base, options: a.options });
        case 'delete': need(a, ['option_names']); return gw('DELETE', a, 'column-options/', { ...base, option_names: a.option_names });
      }
    }),

  tool('row', '行：append 追加（没填的列按列默认值填）、update 修改、delete 删除。行数据以列名为键；单选填选项名称；图片列填 URL 数组。',
    { action: P.action(['append', 'update', 'delete']), workspace_id, base_name, table_name,
      rows: { type: 'array', items: { type: 'object' }, description: 'append 用：[{列名: 值}]' },
      updates: { type: 'array', items: { type: 'object' }, description: 'update 用：[{row_id, row: {列名: 值}}]' },
      row_ids: { type: 'array', items: { type: 'string' }, description: 'delete 用' } },
    ['action', ...WB, 'table_name'], async (a) => {
      switch (a.action) {
        // apply_default：没填的列按列默认值填（与表格里新增一行一致）
        case 'append': need(a, ['rows']); return gw('POST', a, 'rows/', { table_name: a.table_name, rows: a.rows, apply_default: true });
        case 'update': need(a, ['updates']); return gw('PUT', a, 'rows/', { table_name: a.table_name, updates: a.updates });
        case 'delete': need(a, ['row_ids']); return gw('DELETE', a, 'rows/', { table_name: a.table_name, row_ids: a.row_ids });
      }
    }),

  tool('row_link', '链接列的行间关联：add 添加、update 覆盖、remove 移除。link_id 见 get_base_schema 中链接列的 data.link_id。',
    { action: P.action(['add', 'update', 'remove']), workspace_id, base_name, table_name,
      other_table_name: { type: 'string' }, link_id: { type: 'string' },
      other_rows_ids_map: { type: 'object', description: '{本表行id: [对方行id, ...]}' } },
    ['action', ...WB, 'table_name', 'other_table_name', 'link_id', 'other_rows_ids_map'], async (a) => {
      const body = { link_id: a.link_id, table_name: a.table_name, other_table_name: a.other_table_name, other_rows_ids_map: a.other_rows_ids_map };
      switch (a.action) {
        case 'add': return gw('POST', a, 'links/', body);
        case 'update': return gw('PUT', a, 'links/', { ...body, row_id_list: Object.keys(a.other_rows_ids_map) });
        case 'remove': return gw('DELETE', a, 'links/', body);
      }
    }),

  tool('view', '视图：list 列出、create 新建、update 修改（settings 里可写 name / filters / sorts / groupbys / hidden_columns 等，'
    + '其中引用列的地方一律写列 key，如 filters: [{column_key, filter_predicate, filter_term}]）、delete 删除。',
    { action: P.action(['list', 'create', 'update', 'delete']), workspace_id, base_name, table_name,
      view_name: { type: 'string' }, settings: { type: 'object', description: 'update 用：要修改的视图设置' } },
    ['action', ...WB, 'table_name'], async (a) => {
      const q = `?table_name=${encodeURIComponent(a.table_name)}`;
      const one = () => `views/${encodeURIComponent(a.view_name)}/${q}`;
      switch (a.action) {
        case 'list': return gw('GET', a, `views/${q}`);
        case 'create': need(a, ['view_name']); return gw('POST', a, `views/${q}`, { name: a.view_name });
        case 'update': need(a, ['view_name', 'settings']); return gw('PUT', a, one(), a.settings);
        case 'delete': need(a, ['view_name']); return gw('DELETE', a, one());
      }
    }),

  tool('base_snapshot', '表格快照：create 立即创建（距上次快照需有改动且超过 10 分钟）、list 列出、restore 还原为一个新表格。',
    { action: P.action(['create', 'list', 'restore']), workspace_id, base_name,
      commit_id: { type: 'string', description: 'restore 用，来自 list' },
      snapshot_name: { type: 'string', description: 'restore 用：还原出的新表格名称，可省略' } },
    ['action', ...WB], async (a) => {
      const path = `${basePath(a.workspace_id, a.base_name)}/snapshots/`;
      switch (a.action) {
        // 请求体必须带 dtable_name（文档未写，实测）；距上次快照不足 10 分钟时返回 {status: 'time_is_short'}
        case 'create': return gw('POST', a, 'snapshot/', { dtable_name: a.base_name });
        case 'list': return check(await request('GET', path));
        case 'restore': need(a, ['commit_id']);
          return check(await request('POST', `${path}${a.commit_id}/restore/`, { form: a.snapshot_name ? { snapshot_name: a.snapshot_name } : {} }));
      }
    }),
];
