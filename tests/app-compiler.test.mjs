// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from '../checker/app-compiler.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const META = load('./fixtures/base_metadata.json');
const APP = load('./fixtures/app_form.json');
// 列：0000 名称(text) ZI2u 校区(single-select) s7E2 学号(text) 1KRk 人数(number) 969m 日期(date) kZ8B 邮箱(email) uO5n 备注(long-text)

const page = (cfg) => cfg.settings.pages[0];
const mutate = (fn) => { const c = structuredClone(APP); fn(c); return c; };
const codes = (r) => r.diagnostics.map((d) => d.code);
const find = (r, code) => r.diagnostics.find((d) => d.code === code);

function expectCode(cfg, code, { meta = META, original, severity } = {}) {
  const r = compile(cfg, meta, { original });
  const d = find(r, code);
  assert.ok(d, `应报 ${code}，实际：${JSON.stringify(r.diagnostics, null, 1)}`);
  if (severity) assert.equal(d.severity, severity);
  return { r, d };
}

// ------------------------------------------------------------ 正例

test('平台实测创建成功的表单应用：0 错误 0 警告', () => {
  const r = compile(APP, META);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics, null, 1));
  assert.deepEqual(r.diagnostics, []);
});

test('agent 只写最少字段，编译器补全默认值后可用', () => {
  const minimal = {
    app_name: '最小表单',
    settings: {
      pages: [{
        id: 'pg01', name: '报名', type: 'form', table_id: '0000',
        page_permissions: { view_rows_permission: { permission_type: 'default', permitted_roles: [] } },
        columns: [{ key: '0000', is_required: true }, { key: 's7E2' }],
        elements_order: [{ key: '0000', type: 'column' }, { key: 's7E2', type: 'column' }],
      }],
      navigation: [{ id: 'pg01', type: 'page' }],
    },
  };
  const r = compile(minimal, META);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics, null, 1));
  assert.equal(r.output.app_type, 'universal-app');
  assert.equal(page(r.output).columns[1].options_show_type, 'dropdown');
  assert.equal(page(r.output).columns[0].is_required, true);
  assert.deepEqual(page(r.output).add_duplicate_record_setting, { duplicate_prohibition: false, unique_column_keys: [] });
});

test('字符串输入与对象输入结果一致', () => {
  assert.deepEqual(compile(JSON.stringify(APP), META).diagnostics, compile(APP, META).diagnostics);
});

// ------------------------------------------------------------ 语法 / 顶层

test('E000 JSON 语法错误给出行列号', () => {
  const src = JSON.stringify(APP, null, 2).replace('"报名表"', '"报名表",,');
  const { d } = expectCode(src, 'E000');
  assert.match(d.path, /第 \d+ 行第 \d+ 列/);
});

test('E100 app_type 错误 / 应用名超长', () => {
  expectCode(mutate((c) => { c.app_type = 'form-app'; }), 'E100');
  expectCode(mutate((c) => { c.app_name = '名'.repeat(51); }), 'E100');
});

test('E101 类型错误', () => {
  expectCode(mutate((c) => { page(c).columns[0].is_required = 'yes'; }), 'E101');
});

test('E102 页面类型拼写错误并给出建议', () => {
  const { d } = expectCode(mutate((c) => { page(c).type = 'from'; }), 'E102');
  assert.match(d.hint, /"form"/);
});

test('W104 未知字段拼写错误并给出建议', () => {
  const { d } = expectCode(mutate((c) => { page(c).columns[0].is_requird = true; }), 'W104', { severity: 'warning' });
  assert.match(d.hint, /is_required/);
});

// ------------------------------------------------------------ 表格引用

test('E300 table_id 不存在', () => {
  expectCode(mutate((c) => { page(c).table_id = 'ZZZZ'; }), 'E300');
});

test('E301 用了列名而不是列 key，提示正确 key', () => {
  const { d } = expectCode(mutate((c) => {
    page(c).columns.push({ key: '人数' }); page(c).elements_order.push({ key: '人数', type: 'column' });
  }), 'E301');
  assert.match(d.hint, /1KRk/);
});

test('E301 列 key 拼错，给出最接近的 key', () => {
  const { d } = expectCode(mutate((c) => { page(c).columns[1].key = 's7E3'; page(c).elements_order[1].key = 's7E3'; }), 'E301');
  assert.match(d.hint, /s7E2/);
});

test('E301 过滤条件 / 排序 / 去重列中的 key 同样检查', () => {
  expectCode(mutate((c) => { page(c).add_duplicate_record_setting.unique_column_keys = ['nope']; }), 'E301');
  expectCode(mutate((c) => { page(c).columns[0].filters = [{ column_key: 'nope', filter_predicate: 'is' }]; }), 'E301');
});

// ------------------------------------------------------------ 表单结构

test('E302 elements_order 引用未配置的列', () => {
  expectCode(mutate((c) => { page(c).elements_order.push({ key: '1KRk', type: 'column' }); }), 'E302');
});

test('E303 elements_order 重复', () => {
  expectCode(mutate((c) => { page(c).elements_order.push({ ...page(c).elements_order[0] }); }), 'E303');
});

test('W304 列配置了但没放进 elements_order', () => {
  expectCode(mutate((c) => { page(c).elements_order = page(c).elements_order.filter((e) => e.key !== 'uO5n'); }), 'W304');
});

test('E305 静态元素类型不一致', () => {
  expectCode(mutate((c) => { page(c).elements_order.find((e) => e.key === 'sp01').type = 'remarks'; }), 'E305');
});

test('E306 系统计算列不能作为表单输入', () => {
  const meta = structuredClone(META);
  meta.tables[0].columns.push({ key: 'fx01', name: '合计', type: 'formula', data: {} });
  expectCode(mutate((c) => {
    page(c).columns.push({ key: 'fx01' }); page(c).elements_order.push({ key: 'fx01', type: 'column' });
  }), 'E306', { meta });
});

test('E307 去重列不在表单字段中', () => {
  expectCode(mutate((c) => {
    page(c).add_duplicate_record_setting = { duplicate_prohibition: true, unique_column_keys: ['1KRk'] };
  }), 'E307');
});

test('E308 单选默认值写了选项名称，提示改成 id', () => {
  const { d } = expectCode(mutate((c) => {
    const col = page(c).columns.find((x) => x.key === 'ZI2u');
    col.enable_fill_default_value = true; col.default_value = '鼓楼';
  }), 'E308');
  assert.match(d.hint, /100002/);
});

test('单选默认值写选项 id 可以通过', () => {
  const r = compile(mutate((c) => {
    const col = page(c).columns.find((x) => x.key === 'ZI2u');
    col.enable_fill_default_value = true; col.default_value = '100002';
  }), META);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
});

test('E308 不支持默认值的列类型', () => {
  expectCode(mutate((c) => {
    const col = page(c).columns.find((x) => x.key === 'kZ8B');
    col.enable_fill_default_value = true; col.default_value = 'a@b.c';
  }), 'E308');
});

test('W309 必填但不可编辑', () => {
  expectCode(mutate((c) => { page(c).columns[0].editable = false; }), 'W309');
});

test('E310 非法过滤谓词并给出建议', () => {
  const { d } = expectCode(mutate((c) => {
    page(c).columns[0].filters = [{ column_key: '0000', filter_predicate: 'contain', filter_term: 'x' }];
  }), 'E310');
  assert.match(d.hint, /contains/);
});

test('W313 指定角色但角色列表为空', () => {
  expectCode(mutate((c) => {
    page(c).page_permissions.view_rows_permission = { permission_type: 'specific_roles', permitted_roles: [] };
  }), 'W313');
});

// ------------------------------------------------------------ 导航

test('E201 导航引用不存在的页面', () => {
  expectCode(mutate((c) => { c.settings.navigation.push({ id: 'zzzz', type: 'page' }); }), 'E201');
});

test('E202 同一页面在导航中出现两次', () => {
  expectCode(mutate((c) => { c.settings.navigation.push({ id: 'pB01', type: 'page' }); }), 'E202');
});

test('W203 页面没挂到导航上', () => {
  expectCode(mutate((c) => { c.settings.navigation = []; }), 'W203');
});

test('E204 外部链接导航没有对应 link', () => {
  expectCode(mutate((c) => { c.settings.navigation.push({ id: 'lnk1', type: 'external_link' }); }), 'E204');
});

test('E200 页面 id 重复', () => {
  expectCode(mutate((c) => { c.settings.pages.push({ ...structuredClone(page(c)), name: '副本' }); }), 'E200');
});

// ------------------------------------------------------------ 差异 / 风险

test('差异分析：删除页面、放宽权限、开启匿名访问都会警告', () => {
  const twoPages = mutate((c) => {
    const p2 = structuredClone(page(c)); p2.id = 'pB02'; p2.name = '第二页';
    p2.page_permissions.view_rows_permission.permission_type = 'admins';
    c.settings.pages.push(p2); c.settings.navigation.push({ id: 'pB02', type: 'page' });
  });
  const after = structuredClone(twoPages);
  after.settings.pages.shift(); after.settings.navigation.shift();
  page(after).page_permissions.view_rows_permission.permission_type = 'default';
  after.can_anonymous_access = true;
  const r = compile(after, META, { original: twoPages });
  assert.ok(codes(r).includes('W400'));
  assert.equal(codes(r).filter((c) => c === 'W401').length, 2);
  assert.ok(r.changes.some((s) => s.includes('删除页面 pB01')));
});

test('差异分析：列出新增字段与必填变化', () => {
  const after = mutate((c) => {
    page(c).columns.push({ key: '1KRk', is_required: true }); page(c).elements_order.push({ key: '1KRk', type: 'column' });
    page(c).columns[0].is_required = false;
  });
  const r = compile(after, META, { original: APP });
  assert.equal(r.ok, true);
  assert.ok(r.changes.some((s) => s.includes('新增字段 1KRk')));
  assert.ok(r.changes.some((s) => s.includes('字段 0000 必填：true → false')));
});

test('未提供表格结构时只做结构检查', () => {
  const r = compile(APP, null);
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r), ['W001']);
});

// ------------------------------------------------------------ 实际事故回归（活动报名应用）

test('E103 备注元素把内容写在 content 而不是 value', () => {
  const cfg = mutate((c) => {
    page(c).static_elements.push({ key: 'r1', type: 'remarks', content: '### 校园活动报名' });
    page(c).elements_order.unshift({ key: 'r1', type: 'remarks' });
  });
  const { d } = expectCode(cfg, 'E103', { severity: 'error' });
  assert.match(d.path, /static_elements\[\d+\]\.value/);
  assert.match(d.hint, /value/);
  assert.ok(compile(cfg, META).diagnostics.some((x) => x.code === 'W104' && x.path.endsWith('.content')));
});

test('E314 表单引用了类型非法的列（single_select）', () => {
  const meta = structuredClone(META);
  meta.tables[0].columns.find((c) => c.key === 'ZI2u').type = 'single_select';
  const { d } = expectCode(APP, 'E314', { meta, severity: 'error' });
  assert.match(d.hint, /single-select/);
});

test('表格页只写 id/name/type/table_id：补全 shown_column_keys（全部列）等字段', () => {
  const cfg = mutate((c) => {
    c.settings.pages.push({ id: 'tbl1', name: '报名登记', type: 'table', table_id: '0000', page_permissions: {} });
    c.settings.navigation.push({ id: 'tbl1', name: '报名登记', type: 'page' });
  });
  const r = compile(cfg, META);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics, null, 1));
  const p = r.output.settings.pages.find((x) => x.id === 'tbl1');
  assert.deepEqual(p.shown_column_keys, META.tables[0].columns.map((c) => c.key));
  assert.deepEqual(p.sorts, []);
  assert.equal(p.filter_conjunction, 'And');
});

test('E103 没有表格结构时，表格页缺 shown_column_keys 报错', () => {
  const cfg = mutate((c) => c.settings.pages.push({ id: 'tbl1', name: '登记', type: 'table', table_id: '0000' }));
  const r = compile(cfg, null);
  assert.ok(r.diagnostics.some((x) => x.code === 'E103' && x.path.endsWith('shown_column_keys')));
});

// ------------------------------------------------------------ 按官方资料加的检查

const USER_META = { tables: [{ _id: '0000', name: '报名', columns: [
  { key: '0000', name: '学号', type: 'text' },
  { key: '_creator', name: '提交人', type: 'creator' },
  { key: 'st01', name: '状态', type: 'single-select', data: { options: [{ id: 'act', name: '已报名' }, { id: 'can', name: '已取消' }] } },
] }] };
const tablePage = (extra) => ({ app_name: 'x', settings: {
  navigation: [{ id: 'Tb01', type: 'page' }],
  pages: [{ id: 'Tb01', name: '我的', type: 'table', table_id: '0000', shown_column_keys: ['0000'],
    page_permissions: { view_rows_permission: { permission_type: 'default', permitted_roles: [] } }, ...extra }] } });

test('E312 表格页写了不存在的权限项 update_rows_permission', () => {
  const { d } = expectCode(tablePage({ page_permissions: {
    view_rows_permission: { permission_type: 'default', permitted_roles: [] },
    update_rows_permission: { permission_type: 'default', permitted_roles: [] } } }), 'E312', { meta: USER_META });
  assert.match(d.hint, /edit_rows_permission/);
});

test('E312 表单页只有 view_rows_permission', () => {
  const cfg = mutate((c) => { page(c).page_permissions.edit_rows_permission = { permission_type: 'default', permitted_roles: [] }; });
  expectCode(cfg, 'E312');
});

test('E310 创建者列不能用 is_current_user_ID，提示改用 include_me', () => {
  const { d } = expectCode(tablePage({ filters: [{ column_key: '_creator', filter_predicate: 'is_current_user_ID', filter_term: '' }] }), 'E310', { meta: USER_META });
  assert.match(d.hint, /include_me/);
  const ok = compile(tablePage({ filters: [{ column_key: '_creator', filter_predicate: 'include_me', filter_term: [] }] }), USER_META);
  assert.equal(ok.ok, true, JSON.stringify(ok.diagnostics));
});

test('E313 单选过滤值写了选项名称', () => {
  const { d } = expectCode(tablePage({ filters: [{ column_key: 'st01', filter_predicate: 'is', filter_term: '已报名' }] }), 'E313', { meta: USER_META });
  assert.match(d.hint, /"act"/);
});

test('W106 表格页写 pre_filters 会被忽略，提示改用 filters', () => {
  const { d } = expectCode(tablePage({ pre_filters: [] }), 'W106', { meta: USER_META, severity: 'warning' });
  assert.match(d.hint, /filters/);
});
