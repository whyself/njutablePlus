// njtc 核心：校验 / 规范化 南大表格(SeaTable 6.2) 通用应用 app_config
// 纯函数，无 Node 依赖，可在浏览器中直接 import 使用。
//
//   compile(source, metadata, { original, fill }) →
//     { ok, diagnostics: [{severity, code, path, message, hint}], output, changes }
//
// source   : app_config 的 JSON 字符串或对象
// metadata : 表格结构 { tables: [{ _id, name, columns: [{ key, name, type, data }] }] }
// original : 修改前的 app_config（可选，用于差异分析和风险提示）
// fill     : 是否补全可省略字段的默认值（默认 true）

import * as R from './rules.js';

// ---------------------------------------------------------------- 工具

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function didYouMean(value, candidates) {
  if (typeof value !== 'string' || !candidates.length) return null;
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(value.toLowerCase(), String(c).toLowerCase());
    if (dist < bestD) { best = c; bestD = dist; }
  }
  return bestD <= Math.max(2, Math.floor(value.length / 3)) ? best : null;
}

function positionToLineCol(text, pos) {
  const before = text.slice(0, pos).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

// ---------------------------------------------------------------- 诊断收集

class Diag {
  constructor() { this.list = []; }
  add(severity, code, path, message, hint) { this.list.push({ severity, code, path, message, ...(hint ? { hint } : {}) }); }
  error(...a) { this.add('error', ...a); }
  warn(...a) { this.add('warning', ...a); }
  info(...a) { this.add('info', ...a); }

  type(path, value, expected, { required = false } = {}) {
    if (value === undefined) {
      if (required) this.error('E103', path, `缺少必填字段`);
      return false;
    }
    const t = typeOf(value);
    const ok = Array.isArray(expected) ? expected.includes(t) : t === expected;
    if (!ok) this.error('E101', path, `类型错误：期望 ${[].concat(expected).join(' | ')}，实际是 ${t}`);
    return ok;
  }

  oneOf(path, value, allowed, code = 'E102') {
    if (value === undefined || allowed.includes(value)) return true;
    const guess = didYouMean(value, allowed);
    this.error(code, path, `非法取值 ${JSON.stringify(value)}，允许：${allowed.join(', ')}`,
      guess ? `是不是想写 ${JSON.stringify(guess)}？` : undefined);
    return false;
  }

  knownKeys(path, obj, known) {
    if (typeOf(obj) !== 'object') return;
    for (const k of Object.keys(obj)) {
      if (known.includes(k)) continue;
      const guess = didYouMean(k, known);
      this.warn('W104', `${path}.${k}`, `未知字段（平台会忽略或报错）`, guess ? `是不是想写 "${guess}"？` : undefined);
    }
  }
}

// ---------------------------------------------------------------- 表格结构索引

function indexMetadata(metadata) {
  const meta = metadata?.metadata ?? metadata;
  const tables = new Map();
  for (const t of meta?.tables ?? []) {
    const byKey = new Map(), byName = new Map();
    for (const c of t.columns ?? []) { byKey.set(c.key, c); byName.set(c.name, c); }
    tables.set(t._id, { id: t._id, name: t.name, byKey, byName });
  }
  return tables;
}

function checkColumnKey(d, path, key, table) {
  if (!table) return null;
  if (typeof key !== 'string') { d.error('E101', path, `列 key 必须是字符串`); return null; }
  const col = table.byKey.get(key);
  if (col) return col;
  const byName = table.byName.get(key);
  if (byName) {
    d.error('E301', path, `"${key}" 是列名，不是列 key`, `改成 "${byName.key}"`);
  } else {
    const guess = didYouMean(key, [...table.byKey.keys(), ...table.byName.keys()]);
    const g = guess && (table.byKey.get(guess) || table.byName.get(guess));
    d.error('E301', path, `列 "${key}" 在表「${table.name}」中不存在`,
      g ? `是不是 "${g.key}"（${g.name}）？` : `可用列：${[...table.byKey.values()].map((c) => `${c.key}=${c.name}`).join(', ')}`);
  }
  return null;
}

// ---------------------------------------------------------------- 规范化（补默认值）

function fillDefaults(cfg, tables) {
  const out = { ...R.ROOT_DEFAULTS, ...cfg };
  if (typeOf(out.settings) !== 'object') return out;
  out.settings = { links: [], ...out.settings };
  if (Array.isArray(out.settings.pages)) {
    out.settings.pages = out.settings.pages.map((p) => {
      if (typeOf(p) === 'object' && p.type === 'table') {
        const page = { ...clone(R.TABLE_PAGE_DEFAULTS), ...p };
        const table = tables?.get(page.table_id);
        if (page.shown_column_keys === undefined && table) page.shown_column_keys = [...table.byKey.keys()];
        return page;
      }
      if (typeOf(p) !== 'object' || p.type !== 'form') return p;
      const page = { ...clone(R.FORM_PAGE_DEFAULTS), ...p };
      if (Array.isArray(page.columns))
        page.columns = page.columns.map((c) => (typeOf(c) === 'object' ? { ...clone(R.FORM_COLUMN_DEFAULTS), ...c } : c));
      return page;
    });
  }
  return out;
}

// ---------------------------------------------------------------- 各部分检查

function checkRoot(d, cfg) {
  d.knownKeys('$', cfg, R.KNOWN_KEYS.root);
  if (cfg.app_type !== 'universal-app')
    d.error('E100', '$.app_type', `必须是 "universal-app"，实际是 ${JSON.stringify(cfg.app_type)}`);
  if (d.type('$.app_name', cfg.app_name, 'string', { required: true })) {
    if (!cfg.app_name.trim()) d.error('E100', '$.app_name', '应用名不能为空');
    if (cfg.app_name.length > 50) d.error('E100', '$.app_name', `应用名 ${cfg.app_name.length} 字，超过 50 字上限`);
  }
  d.oneOf('$.app_theme_mode', cfg.app_theme_mode, ['dark', 'light']);
  if (cfg.app_theme_color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(cfg.app_theme_color))
    d.warn('W105', '$.app_theme_color', `颜色应为 #RRGGBB 格式`);
  for (const k of ['enable_load_base_comments', 'use_custom_icon', 'can_anonymous_access', 'is_open_register',
    'auto_archive_to_big_data', 'can_anonymous_download_assets', 'is_anonymous_need_password'])
    d.type(`$.${k}`, cfg[k], 'boolean');
  d.type('$.version', cfg.version, 'number');
  d.type('$.settings', cfg.settings, 'object', { required: true });
}

function checkPermissions(d, path, perms, pageType) {
  if (!d.type(path, perms, 'object')) return;
  const allowed = R.PAGE_PERMISSIONS[pageType];
  for (const [name, p] of Object.entries(perms)) {
    const pp = `${path}.${name}`;
    if (allowed && !allowed.includes(name)) {
      const guess = didYouMean(name, allowed);
      d.error('E312', pp, `${pageType} 页面没有权限项 ${name}，可用：${allowed.join(', ')}`,
        guess ? `是不是想写 "${guess}"？` : undefined);
      continue;
    }
    if (!/_permission$/.test(name)) { d.warn('W104', pp, '未知的权限项'); continue; }
    if (!d.type(pp, p, 'object')) continue;
    d.oneOf(`${pp}.permission_type`, p.permission_type, R.PERMISSION_TYPES);
    if (name === 'view_rows_permission' && p.permission_type === 'none')
      d.warn('W312', `${pp}.permission_type`, '查看权限为 none，任何人都看不到该页面');
    if (d.type(`${pp}.permitted_roles`, p.permitted_roles, 'array')) {
      p.permitted_roles.forEach((r, i) => d.type(`${pp}.permitted_roles[${i}]`, r, 'number'));
      if (p.permission_type === 'specific_roles' && !p.permitted_roles.length)
        d.warn('W313', pp, 'permission_type 为 specific_roles，但 permitted_roles 为空');
    }
  }
}

function checkFilters(d, path, filters, table) {
  if (!d.type(path, filters, 'array')) return;
  filters.forEach((f, i) => {
    const fp = `${path}[${i}]`;
    if (!d.type(fp, f, 'object')) return;
    if (Array.isArray(f.filters)) { // 条件组
      d.oneOf(`${fp}.filter_conjunction`, f.filter_conjunction, R.CONJUNCTIONS);
      checkFilters(d, `${fp}.filters`, f.filters, table);
      return;
    }
    const col = checkColumnKey(d, `${fp}.column_key`, f.column_key, table);
    if (!d.type(`${fp}.filter_predicate`, f.filter_predicate, 'string', { required: true })) return;
    if (!d.oneOf(`${fp}.filter_predicate`, f.filter_predicate, R.FILTER_PREDICATES, 'E310') || !col) return;
    const allowed = R.FILTER_PREDICATES_BY_TYPE[col.type];
    if (allowed && !allowed.includes(f.filter_predicate)) {
      d.error('E310', `${fp}.filter_predicate`, `「${col.name}」是 ${col.type} 列，不能用 ${f.filter_predicate}，可用：${allowed.join(', ')}`,
        f.filter_predicate === 'is_current_user_ID' && allowed.includes('include_me') ? '筛"当前用户自己的记录"在这类列上用 include_me' : undefined);
      return;
    }
    checkSelectTerm(d, `${fp}.filter_term`, f, col);
  });
}

// 单选列按选项 id 过滤（is / is_not 写一个 id，is_any_of / is_none_of 写 id 数组）
function checkSelectTerm(d, path, f, col) {
  if (col.type !== 'single-select' || f.filter_term === undefined || f.filter_term === '') return;
  const opts = col.data?.options ?? [];
  const terms = Array.isArray(f.filter_term) ? f.filter_term : [f.filter_term];
  for (const t of terms) {
    if (opts.some((o) => o.id === t)) continue;
    const byName = opts.find((o) => o.name === t);
    d.error('E313', path, `单选列「${col.name}」的过滤值要写选项 id，"${t}" 不是有效的选项 id`,
      byName ? `"${t}" 是选项名称，改成它的 id "${byName.id}"` : `可选：${opts.map((o) => `${o.id}=${o.name}`).join(', ')}`);
  }
}

function checkSorts(d, path, sorts, table) {
  if (!d.type(path, sorts, 'array')) return;
  sorts.forEach((s, i) => {
    checkColumnKey(d, `${path}[${i}].column_key`, s?.column_key, table);
    d.oneOf(`${path}[${i}].sort_type`, s?.sort_type, R.SORT_TYPES, 'E311');
  });
}

function checkKeyList(d, path, list, table) {
  if (!d.type(path, list, 'array')) return;
  list.forEach((k, i) => checkColumnKey(d, `${path}[${i}]`, k, table));
}

function checkDefaultValue(d, path, entry, col) {
  const v = entry.default_value;
  const used = entry.enable_fill_default_value === true;
  if (!used && (v === '' || v === undefined || v === null)) return;
  if (used && !R.DEFAULT_VALUE_COLUMN_TYPES.includes(col.type)) {
    d.error('E308', path, `列「${col.name}」的类型 ${col.type} 不支持默认值`);
    return;
  }
  if (!used) { d.warn('W308', path, `设置了 default_value 但 enable_fill_default_value 不是 true，默认值不会生效`); }
  if (col.type === 'single-select' && v !== '' && v != null) {
    const opts = col.data?.options ?? [];
    if (opts.some((o) => o.id === v)) return;
    const byName = opts.find((o) => o.name === v);
    d.error('E308', path, `单选默认值必须是选项 id，"${v}" 不是「${col.name}」的有效选项 id`,
      byName ? `"${v}" 是选项名称，改成它的 id "${byName.id}"` : `可选：${opts.map((o) => `${o.id}=${o.name}`).join(', ')}`);
  }
  if (col.type === 'number' && v !== '' && v != null && typeof v !== 'number')
    d.warn('W308', path, `数字列的默认值应为 number 类型，而不是 ${typeOf(v)}`);
  if (col.type === 'checkbox' && v !== '' && v != null && typeof v !== 'boolean')
    d.warn('W308', path, `勾选列的默认值应为 boolean`);
}

function checkFormPage(d, pp, page, table) {
  const cols = page.columns, order = page.elements_order, statics = page.static_elements;
  const colKeys = new Set(), staticKeys = new Map();

  if (d.type(`${pp}.columns`, cols, 'array', { required: true })) {
    cols.forEach((c, i) => {
      const cp = `${pp}.columns[${i}]`;
      if (!d.type(cp, c, 'object')) return;
      d.knownKeys(cp, c, R.KNOWN_KEYS.formColumn);
      if (!d.type(`${cp}.key`, c.key, 'string', { required: true })) return;
      if (colKeys.has(c.key)) d.error('E303', `${cp}.key`, `列 ${c.key} 在 columns 中重复出现`);
      colKeys.add(c.key);
      const col = checkColumnKey(d, `${cp}.key`, c.key, table);
      for (const b of ['is_required', 'editable', 'enable_fill_default_value', 'enable_not_change_default_value',
        'require_fill_checked', 'enable_scan_code_entry'])
        d.type(`${cp}.${b}`, c[b], 'boolean');
      for (const s of ['description', 'custom_name']) d.type(`${cp}.${s}`, c[s], 'string');
      d.oneOf(`${cp}.options_show_type`, c.options_show_type, ['dropdown', 'list']);
      d.oneOf(`${cp}.permission`, c.permission, ['rw', 'r']);
      if (c.filters !== undefined) checkFilters(d, `${cp}.filters`, c.filters, table);
      d.oneOf(`${cp}.filter_conjunction`, c.filter_conjunction, R.CONJUNCTIONS);
      if (!col) return;
      if (!R.COLUMN_TYPES.includes(col.type))
        d.error('E314', `${cp}.key`, `列「${col.name}」的类型 ${col.type} 不是平台支持的类型，表单上不会显示`,
          `先用 column 工具把列类型改成合法类型${didYouMean(col.type, R.COLUMN_TYPES) ? `（是不是 ${didYouMean(col.type, R.COLUMN_TYPES)}？）` : ''}`);
      if (R.COMPUTED_COLUMN_TYPES.includes(col.type))
        d.error('E306', `${cp}.key`, `列「${col.name}」是 ${col.type} 类型，由系统计算，不能作为表单输入项`);
      if (c.is_required && (c.editable === false || c.permission === 'r'))
        d.warn('W309', cp, `「${col.name}」设为必填但不可编辑，用户将无法提交`);
      checkDefaultValue(d, `${cp}.default_value`, c, col);
    });
  }

  if (statics !== undefined && d.type(`${pp}.static_elements`, statics, 'array')) {
    statics.forEach((s, i) => {
      const sp = `${pp}.static_elements[${i}]`;
      if (!d.type(sp, s, 'object')) return;
      d.type(`${sp}.key`, s.key, 'string', { required: true });
      d.knownKeys(sp, s, R.KNOWN_KEYS.staticElement);
      d.oneOf(`${sp}.type`, s.type, R.STATIC_ELEMENT_TYPES);
      if (s.type === 'remarks' && s.value === undefined)
        d.error('E103', `${sp}.value`, '备注元素缺少 value，页面只会显示平台的默认提示文字', '备注内容（Markdown）写在 value 字段');
      else if (s.type === 'remarks') d.type(`${sp}.value`, s.value, 'string');
      if (staticKeys.has(s.key)) d.error('E303', `${sp}.key`, `静态元素 key ${s.key} 重复`);
      if (colKeys.has(s.key)) d.error('E303', `${sp}.key`, `静态元素 key ${s.key} 与表单列 key 冲突`);
      staticKeys.set(s.key, s.type);
    });
  }

  if (d.type(`${pp}.elements_order`, order, 'array', { required: true })) {
    const seen = new Set();
    order.forEach((e, i) => {
      const ep = `${pp}.elements_order[${i}]`;
      if (!d.type(ep, e, 'object')) return;
      if (seen.has(e.key)) d.error('E303', `${ep}.key`, `元素 ${e.key} 在 elements_order 中重复`);
      seen.add(e.key);
      if (e.type === 'column') {
        if (!colKeys.has(e.key)) d.error('E302', `${ep}.key`, `elements_order 引用了列 ${e.key}，但 columns 中没有它的配置`, '在 columns 中补一条 {"key": "' + e.key + '"}');
      } else if (R.STATIC_ELEMENT_TYPES.includes(e.type)) {
        if (!staticKeys.has(e.key)) d.error('E302', `${ep}.key`, `elements_order 引用了静态元素 ${e.key}，但 static_elements 中没有定义`);
        else if (staticKeys.get(e.key) !== e.type) d.error('E305', `${ep}.type`, `类型 ${e.type} 与 static_elements 中的 ${staticKeys.get(e.key)} 不一致`);
      } else d.oneOf(`${ep}.type`, e.type, ['column', ...R.STATIC_ELEMENT_TYPES]);
    });
    for (const k of colKeys) if (!seen.has(k)) d.warn('W304', `${pp}.columns`, `列 ${k} 已配置但不在 elements_order 中，表单上不会显示`);
    for (const k of staticKeys.keys()) if (!seen.has(k)) d.warn('W304', `${pp}.static_elements`, `静态元素 ${k} 不在 elements_order 中，不会显示`);
  }

  const dup = page.add_duplicate_record_setting;
  if (dup !== undefined && d.type(`${pp}.add_duplicate_record_setting`, dup, 'object')) {
    const uk = dup.unique_column_keys ?? [];
    if (d.type(`${pp}.add_duplicate_record_setting.unique_column_keys`, uk, 'array'))
      uk.forEach((k, i) => {
        const p2 = `${pp}.add_duplicate_record_setting.unique_column_keys[${i}]`;
        if (checkColumnKey(d, p2, k, table) && !colKeys.has(k)) d.error('E307', p2, `去重列 ${k} 不在表单字段中`);
      });
    if (dup.duplicate_prohibition === true && !uk.length)
      d.warn('W307', `${pp}.add_duplicate_record_setting`, '开启了禁止重复提交，但没有指定去重列');
  }
  const sm = page.success_message_option;
  if (sm !== undefined && sm !== null) d.type(`${pp}.success_message_option`, sm, 'object');
}

function checkPage(d, pp, page, tables, pageIds) {
  if (!d.type(pp, page, 'object')) return;
  d.knownKeys(pp, page, R.KNOWN_KEYS.page);
  if (d.type(`${pp}.id`, page.id, 'string', { required: true })) {
    if (pageIds.has(page.id)) d.error('E200', `${pp}.id`, `页面 id ${page.id} 重复`);
    if (!/^[A-Za-z0-9_-]+$/.test(page.id)) d.warn('W200', `${pp}.id`, `页面 id 建议只用字母数字（编辑器生成 4 位随机串）`);
  }
  d.type(`${pp}.name`, page.name, 'string', { required: true });
  if (!d.type(`${pp}.type`, page.type, 'string', { required: true })) return;
  if (!d.oneOf(`${pp}.type`, page.type, R.PAGE_TYPES)) return;
  const typeKeys = R.PAGE_TYPE_KEYS[page.type];
  if (typeKeys)
    for (const k of Object.keys(page))
      if (R.KNOWN_KEYS.page.includes(k) && !typeKeys.includes(k))
        d.warn('W106', `${pp}.${k}`, `${page.type} 页面不使用字段 ${k}，平台会忽略`,
          k.startsWith('pre_') && typeKeys.includes(k.slice(4)) ? `改用 ${k.slice(4)}` : undefined);

  let table = null;
  if (R.TABLE_BOUND_PAGE_TYPES.includes(page.type)) {
    if (d.type(`${pp}.table_id`, page.table_id, 'string', { required: true }) && tables) {
      table = tables.get(page.table_id);
      if (!table) d.error('E300', `${pp}.table_id`, `表 ${page.table_id} 不存在`,
        `可用：${[...tables.values()].map((t) => `${t.id}=${t.name}`).join(', ')}`);
    }
  }
  if (page.page_permissions !== undefined) checkPermissions(d, `${pp}.page_permissions`, page.page_permissions, page.type);
  else d.warn('W103', `${pp}.page_permissions`, '缺少 page_permissions，建议显式给出 view_rows_permission');

  if (page.filters !== undefined) checkFilters(d, `${pp}.filters`, page.filters, table);
  if (page.pre_filters !== undefined) checkFilters(d, `${pp}.pre_filters`, page.pre_filters, table);
  d.oneOf(`${pp}.filter_conjunction`, page.filter_conjunction, R.CONJUNCTIONS);
  d.oneOf(`${pp}.pre_filter_conjunction`, page.pre_filter_conjunction, R.CONJUNCTIONS);
  if (page.sorts !== undefined) checkSorts(d, `${pp}.sorts`, page.sorts, table);
  if (page.pre_sorts !== undefined) checkSorts(d, `${pp}.pre_sorts`, page.pre_sorts, table);
  if (page.groupbys !== undefined && d.type(`${pp}.groupbys`, page.groupbys, 'array'))
    page.groupbys.forEach((g, i) => checkColumnKey(d, `${pp}.groupbys[${i}].column_key`, g?.column_key, table));
  for (const k of ['shown_column_keys', 'read_only_column_keys', 'columns_key'])
    if (page[k] !== undefined) checkKeyList(d, `${pp}.${k}`, page[k], table);
  for (const k of ['shown_title_column_key', 'shown_image_column_key', 'sort_column_key'])
    if (page[k]) checkColumnKey(d, `${pp}.${k}`, page[k], table);
  if (Array.isArray(page.fields_shown_setting))
    page.fields_shown_setting.forEach((f, i) => checkColumnKey(d, `${pp}.fields_shown_setting[${i}].key`, f?.key, table));
  if (Array.isArray(page.link_columns_settings))
    page.link_columns_settings.forEach((f, i) => checkColumnKey(d, `${pp}.link_columns_settings[${i}].key`, f?.key, table));

  if (page.type === 'form') checkFormPage(d, pp, page, table);
  if (page.type === 'table' && page.shown_column_keys === undefined)
    d.error('E103', `${pp}.shown_column_keys`, '表格页缺少 shown_column_keys，页面会白屏', '写要显示的列 key 数组，如全部列');
}

function checkNavigation(d, settings, pageIds) {
  const refCount = new Map([...pageIds].map((id) => [id, 0]));
  const linkIds = new Set((settings.links ?? []).map((l) => l?.id));
  if (Array.isArray(settings.links))
    settings.links.forEach((l, i) => {
      d.type(`$.settings.links[${i}].id`, l?.id, 'string', { required: true });
      d.type(`$.settings.links[${i}].url`, l?.url, 'string', { required: true });
    });

  const visit = (items, path, depth) => {
    if (!d.type(path, items, 'array', { required: depth === 0 })) return;
    items.forEach((n, i) => {
      const np = `${path}[${i}]`;
      if (!d.type(np, n, 'object')) return;
      d.type(`${np}.id`, n.id, 'string', { required: true });
      if (!d.oneOf(`${np}.type`, n.type, R.NAV_TYPES)) return;
      if (n.type === 'page') {
        if (!refCount.has(n.id)) d.error('E201', `${np}.id`, `导航引用了不存在的页面 ${n.id}`,
          didYouMean(n.id, [...pageIds]) ? `是不是 ${didYouMean(n.id, [...pageIds])}？` : undefined);
        else refCount.set(n.id, refCount.get(n.id) + 1);
      } else if (n.type === 'folder') {
        if (depth > 0) d.error('E205', np, '文件夹不能嵌套');
        d.type(`${np}.name`, n.name, 'string', { required: true });
        visit(n.children ?? [], `${np}.children`, depth + 1);
      } else if (n.type === 'external_link') {
        if (!linkIds.has(n.id)) d.error('E204', `${np}.id`, `导航引用了不存在的外部链接 ${n.id}（应在 settings.links 中定义）`);
      }
    });
  };
  visit(settings.navigation, '$.settings.navigation', 0);
  for (const [id, n] of refCount) {
    if (n === 0) d.warn('W203', '$.settings.navigation', `页面 ${id} 没有挂到导航上，用户无法进入`);
    if (n > 1) d.error('E202', '$.settings.navigation', `页面 ${id} 在导航中出现了 ${n} 次`);
  }

  // 提交后跳转引用的页面
  (settings.pages ?? []).forEach((p, i) => {
    const pid = p?.redirect_config?.page_id;
    if (pid && !pageIds.has(pid)) d.error('E201', `$.settings.pages[${i}].redirect_config.page_id`, `跳转目标页面 ${pid} 不存在`);
  });
}

// ---------------------------------------------------------------- 差异与风险

const permRank = { none: 0, admins: 1, specific_roles: 2, default: 3 };

function diff(d, before, after) {
  const changes = [];
  const bp = new Map((before.settings?.pages ?? []).map((p) => [p.id, p]));
  const ap = new Map((after.settings?.pages ?? []).map((p) => [p.id, p]));
  for (const [id, p] of bp) if (!ap.has(id)) {
    changes.push(`删除页面 ${id}「${p.name}」`);
    d.warn('W400', '$.settings.pages', `删除了页面 ${id}「${p.name}」（页面上的设置将丢失）`);
  }
  for (const [id, p] of ap) {
    const o = bp.get(id);
    if (!o) { changes.push(`新增页面 ${id}「${p.name}」(${p.type})`); continue; }
    if (o.name !== p.name) changes.push(`页面 ${id} 改名：「${o.name}」→「${p.name}」`);
    if (o.type !== p.type) d.warn('W400', `$.settings.pages[id=${id}].type`, `页面类型由 ${o.type} 改为 ${p.type}`);
    if (o.table_id !== p.table_id) d.warn('W400', `$.settings.pages[id=${id}].table_id`, `页面绑定的表由 ${o.table_id} 改为 ${p.table_id}`);
    for (const [k, v] of Object.entries(p.page_permissions ?? {})) {
      const ov = o.page_permissions?.[k];
      if (ov && (permRank[v?.permission_type] ?? 0) > (permRank[ov.permission_type] ?? 0))
        d.warn('W401', `$.settings.pages[id=${id}].page_permissions.${k}`, `权限放宽：${ov.permission_type} → ${v.permission_type}`);
    }
    const oc = new Map((o.columns ?? []).map((c) => [c.key, c]));
    const nc = new Map((p.columns ?? []).map((c) => [c.key, c]));
    for (const k of nc.keys()) if (!oc.has(k)) changes.push(`页面 ${id} 新增字段 ${k}`);
    for (const k of oc.keys()) if (!nc.has(k)) changes.push(`页面 ${id} 移除字段 ${k}`);
    for (const [k, c] of nc) {
      const c0 = oc.get(k);
      if (c0 && !!c0.is_required !== !!c.is_required) changes.push(`页面 ${id} 字段 ${k} 必填：${!!c0.is_required} → ${!!c.is_required}`);
    }
  }
  for (const k of ['can_anonymous_access', 'is_open_register', 'can_anonymous_download_assets'])
    if (!before[k] && after[k] === true) d.warn('W401', `$.${k}`, `开启了 ${k}，应用将对更多人开放`);
  if (before.app_name !== after.app_name) changes.push(`应用改名：「${before.app_name}」→「${after.app_name}」`);
  return changes;
}

// ---------------------------------------------------------------- 入口

export function compile(source, metadata, { original, fill = true } = {}) {
  const d = new Diag();
  let cfg = source;
  if (typeof source === 'string') {
    try { cfg = JSON.parse(source); } catch (e) {
      const m = /position (\d+)/.exec(e.message) || /line (\d+) column (\d+)/.exec(e.message);
      const where = m && m.length === 2 ? positionToLineCol(source, +m[1]) : m ? { line: +m[1], column: +m[2] } : null;
      d.error('E000', where ? `第 ${where.line} 行第 ${where.column} 列` : '$', `JSON 语法错误：${e.message}`);
      return { ok: false, diagnostics: d.list, output: null, changes: [] };
    }
  }
  if (typeOf(cfg) !== 'object') {
    d.error('E101', '$', `顶层必须是对象，实际是 ${typeOf(cfg)}`);
    return { ok: false, diagnostics: d.list, output: null, changes: [] };
  }
  if (!metadata) d.warn('W001', '$', '未提供表格结构，跳过所有列 key / table_id 检查');

  const tables = indexMetadata(metadata);
  const out = fill ? fillDefaults(cfg, tables) : clone(cfg);
  checkRoot(d, out);

  const settings = out.settings;
  if (typeOf(settings) === 'object') {
    d.knownKeys('$.settings', settings, R.KNOWN_KEYS.settings);
    const pageIds = new Set();
    if (d.type('$.settings.pages', settings.pages, 'array', { required: true }))
      settings.pages.forEach((p, i) => {
        // 未提供 metadata 时 tables=null，所有 table_id / 列 key 检查跳过
        checkPage(d, `$.settings.pages[${i}]`, p, metadata ? tables : null, pageIds);
        if (typeof p?.id === 'string') pageIds.add(p.id);
      });
    checkNavigation(d, settings, pageIds);
  }

  const changes = original ? diff(d, typeof original === 'string' ? JSON.parse(original) : original, out) : [];
  const ok = !d.list.some((x) => x.severity === 'error');
  return { ok, diagnostics: d.list, output: ok ? out : null, changes };
}

export function format(result, { color = false } = {}) {
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const lines = result.diagnostics.map((x) => {
    const sev = x.severity === 'error' ? c(31, 'error') : x.severity === 'warning' ? c(33, 'warning') : c(36, 'info');
    return `${sev}[${x.code}] ${x.path}\n    ${x.message}${x.hint ? `\n    ${c(32, 'hint:')} ${x.hint}` : ''}`;
  });
  if (result.changes?.length) lines.push(c(36, '变更：') + '\n' + result.changes.map((s) => '    · ' + s).join('\n'));
  const e = result.diagnostics.filter((x) => x.severity === 'error').length;
  const w = result.diagnostics.filter((x) => x.severity === 'warning').length;
  lines.push(result.ok ? c(32, `✔ 编译通过（${w} 个警告）`) : c(31, `✘ 编译失败：${e} 个错误，${w} 个警告`));
  return lines.join('\n');
}
