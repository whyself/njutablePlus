// agent/llm.js + agent/loop.js：用假的模型 SSE 和假的平台接口，跑通 模型 → 工具 → 平台 → 回填 → 模型
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- 浏览器环境替身：session.js 在"页面"里执行 fetch
globalThis.document = { cookie: 'dtable_csrftoken=csrf123' };
globalThis.location = { origin: 'https://table.nju.edu.cn' };
globalThis.chrome = {
  tabs: { query: async () => [{ id: 1, active: true }] },
  scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] },
};

const { runAgent } = await import('../agent/loop.js');
const { chat } = await import('../agent/llm.js');

// ---- fetch 替身：模型请求按脚本依次返回 SSE；平台请求返回固定数据
let modelScript = [];
let modelRequests = [];
let platformRequests = [];
let platform = null; // 测试可替换的平台响应：(url, init) => Response | Promise | undefined

const sse = (chunks) => new Response(new ReadableStream({
  start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); },
}), { status: 200 });

const ev = (delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;

globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.deepseek.com')) {
    modelRequests.push(JSON.parse(init.body));
    const next = modelScript.shift();
    if (!next) throw new Error('模型脚本已用完');
    return typeof next === 'function' ? next() : sse(next);
  }
  platformRequests.push({ url: u, method: init.method, headers: init.headers, body: init.body });
  if (u.endsWith('/access-token/')) return new Response(JSON.stringify({ access_token: 't', dtable_uuid: 'uuid1' }));
  const custom = platform?.(u, init);
  if (custom) return custom;
  if (u.endsWith('/api/v2.1/workspaces/'))
    return new Response(JSON.stringify({ workspace_list: [{ id: 7, type: 'personal', name: 'personal', table_list: [{ name: '报名' }] }] }));
  return new Response('{}', { status: 404 });
};

const settings = { baseUrl: 'https://api.deepseek.com/', apiKey: 'k', model: 'deepseek-flash' };

beforeEach(() => { modelScript = []; modelRequests = []; platformRequests = []; platform = null; });

// ------------------------------------------------------------ llm.js

test('llm：拼接分片文本与分片 tool_calls，忽略 keep-alive，处理跨块断行', async () => {
  modelScript.push([
    ': keep-alive\n\n',
    ev({ content: '好' }), ev({ content: '的' }),
    ev({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_', arguments: '' } }] }),
    // 一行数据被拆进两个网络块
    ev({ tool_calls: [{ index: 0, function: { name: 'bases', arguments: '{"a"' } }] }).slice(0, 20),
    ev({ tool_calls: [{ index: 0, function: { name: 'bases', arguments: '{"a"' } }] }).slice(20),
    ev({ tool_calls: [{ index: 0, function: { arguments: ':1}' } }] }),
    'data: [DONE]\n\n',
  ]);
  let streamed = '';
  const r = await chat({ ...settings, messages: [], tools: [], onText: (t) => { streamed += t; } });
  assert.equal(r.content, '好的');
  assert.equal(streamed, '好的');
  assert.deepEqual(r.tool_calls, [{ id: 'c1', type: 'function', function: { name: 'list_bases', arguments: '{"a":1}' } }]);
  assert.equal(modelRequests[0].stream, true);
  assert.equal(modelRequests[0].model, 'deepseek-flash');
});

test('llm：拼接 reasoning_content，经 onReasoning 流式回调（不进入 onText）', async () => {
  modelScript.push([ev({ reasoning_content: '用户想' }), ev({ reasoning_content: '看表格。' }), ev({ content: '好' })]);
  let streamed = '', thought = [];
  const r = await chat({ ...settings, messages: [], tools: [], onText: (t) => { streamed += t; }, onReasoning: (t) => thought.push(t) });
  assert.equal(r.reasoning_content, '用户想看表格。');
  assert.deepEqual(thought, ['用户想', '看表格。']);
  assert.equal(streamed, '好');
});

test('loop：思考内容随助手消息保存，并在后续请求中回传（DeepSeek 带工具时必须）', async () => {
  modelScript.push(
    [ev({ reasoning_content: '该调用 list_bases。' }), ev({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_bases', arguments: '{}' } }] })],
    [ev({ content: '完成。' })],
  );
  const messages = [{ role: 'user', content: 'x' }];
  await runAgent({ messages, settings, ctx: {} });
  assert.equal(messages[1].reasoning_content, '该调用 list_bases。');
  const sent = modelRequests[1].messages.find((m) => m.role === 'assistant');
  assert.equal(sent.reasoning_content, '该调用 list_bases。');
  assert.equal(messages[3].reasoning_content, undefined); // 没有思考内容时不加该字段
});

test('llm：HTTP 错误时抛出并带上响应内容', async () => {
  modelScript.push(() => new Response('{"error":"bad key"}', { status: 401 }));
  await assert.rejects(chat({ ...settings, messages: [], tools: [] }), /401.*bad key/);
});

// ------------------------------------------------------------ loop.js

test('loop：模型调用工具 → 真实工具代码访问平台 → 结果回填 → 模型给出最终回复', async () => {
  modelScript.push(
    [ev({ content: '我先看看。' }), ev({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_bases', arguments: '{}' } }] }), 'data: [DONE]\n\n'],
    [ev({ content: '你有 1 个表格：报名。' }), 'data: [DONE]\n\n'],
  );
  const messages = [{ role: 'user', content: '我有哪些表格？' }];
  const events = [];
  await runAgent({
    messages, settings, ctx: {},
    on: { text: (t) => events.push(['text', t]), toolStart: (c) => events.push(['start', c.function.name]), toolEnd: (c, r) => events.push(['end', r.ok]) },
  });

  // 历史：user → assistant(tool_calls) → tool → assistant
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.equal(messages[1].tool_calls[0].function.name, 'list_bases');
  assert.equal(messages[2].tool_call_id, 'c1');
  assert.deepEqual(JSON.parse(messages[2].content), { ok: true, data: [{ workspace_id: 7, base_name: '报名', source: '个人' }] });
  assert.equal(messages[3].content, '你有 1 个表格：报名。');
  assert.equal(messages[3].tool_calls, undefined);

  // 每次请求都带 system prompt 和全部工具；第二次请求包含工具结果
  assert.equal(modelRequests[0].messages[0].role, 'system');
  assert.equal(modelRequests[0].tools.length, 24);
  assert.equal(modelRequests[1].messages.at(-1).role, 'tool');

  // 平台请求在"页面"里发出（GET 不带 CSRF）
  assert.equal(platformRequests.length, 1);
  assert.equal(platformRequests[0].url, 'https://table.nju.edu.cn/api/v2.1/workspaces/');
  assert.equal(platformRequests[0].headers['X-CSRFToken'], undefined);

  assert.deepEqual(events, [['text', '我先看看。'], ['start', 'list_bases'], ['end', true], ['text', '你有 1 个表格：报名。']]);
});

test('loop：工具参数不是合法 JSON 时回填错误，让模型继续', async () => {
  modelScript.push(
    [ev({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_bases', arguments: '{oops' } }] })],
    [ev({ content: '参数写错了，抱歉。' })],
  );
  const messages = [{ role: 'user', content: 'x' }];
  await runAgent({ messages, settings, ctx: {} });
  assert.deepEqual(JSON.parse(messages[2].content), { ok: false, error: '工具参数不是合法的 JSON' });
  assert.equal(platformRequests.length, 0);
});

test('loop：未知工具与工具报错都作为结果回填', async () => {
  modelScript.push(
    [ev({ tool_calls: [
      { index: 0, id: 'c1', function: { name: 'no_such_tool', arguments: '{}' } },
      { index: 1, id: 'c2', function: { name: 'column', arguments: '{"action":"update","workspace_id":7,"base_name":"报名","table_name":"T"}' } },
    ] })],
    [ev({ content: '好。' })],
  );
  const messages = [{ role: 'user', content: 'x' }];
  await runAgent({ messages, settings, ctx: {} });
  assert.deepEqual(JSON.parse(messages[2].content), { ok: false, error: '未知工具 no_such_tool' });
  assert.match(JSON.parse(messages[3].content).error, /缺少参数：column, op_type/);
});

test('loop：超过步数上限时停止', async () => {
  // 脚本条数远多于上限，确保是上限先触发，而不是脚本用完
  for (let i = 0; i < 5000; i++)
    modelScript.push([ev({ tool_calls: [{ index: 0, id: `c${i}`, function: { name: 'list_bases', arguments: '{}' } }] })]);
  await assert.rejects(runAgent({ messages: [{ role: 'user', content: 'x' }], settings, ctx: {} }), /步仍未结束/);
  assert.ok(modelScript.length > 0);
});

test('loop：用户中止时抛出 AbortError', async () => {
  const ac = new AbortController();
  modelScript.push(() => { ac.abort(); throw new DOMException('aborted', 'AbortError'); });
  await assert.rejects(runAgent({ messages: [{ role: 'user', content: 'x' }], settings, ctx: {}, signal: ac.signal }), { name: 'AbortError' });
});

test('column / table 工具拒绝非法列类型（single_select），不发请求', async () => {
  const { runTool } = await import('../tools/index.js');
  const base = { workspace_id: 7, base_name: '报名', table_name: 'T' };
  for (const [name, args] of [
    ['column', { action: 'add', ...base, columns: [{ column_name: '项目', column_type: 'single_select' }] }],
    ['table', { action: 'create', ...base, columns: [{ column_name: '项目', column_type: 'single_select' }] }],
    ['column', { action: 'update', ...base, column: '项目', op_type: 'modify_column_type', new_column_type: 'single_select' }],
  ]) {
    const r = await runTool(name, args, {});
    assert.equal(r.ok, false);
    assert.match(r.error, /不支持的列类型：single_select/);
  }
});

// ------------------------------------------------------------ 建列补全、失败信息、停止

const B = { workspace_id: 7, base_name: '报名', table_name: '报名' };
const gwBodies = () => platformRequests.filter((r) => r.url.includes('/api-gateway/')).map((r) => JSON.parse(r.body));

test('column add：单选选项补 id 和颜色；链接列自动填 table', async () => {
  const { runTool } = await import('../tools/index.js');
  platform = () => new Response('{}');
  const r = await runTool('column', { action: 'add', ...B, columns: [
    { column_name: '时间段', column_type: 'single-select', column_data: { options: [{ name: 'a' }, { name: 'b', color: '#123456' }] } },
    { column_name: '讲座', column_type: 'link', column_data: { other_table: '讲座' } },
  ] }, {});
  assert.equal(r.ok, true, JSON.stringify(r));
  const [batch, link] = gwBodies();
  const [o1, o2] = batch.columns[0].column_data.options;
  assert.match(o1.id, /^\d{6}$/);
  assert.ok(o1.color && o1.textColor);
  assert.equal(o2.color, '#123456');
  assert.deepEqual(link.column_data, { other_table: '讲座', table: '报名' });
});

test('column add：链接列缺 other_table 时直接报错，不发请求（平台会一直不响应）', async () => {
  const { runTool } = await import('../tools/index.js');
  const r = await runTool('column', { action: 'add', ...B, columns: [{ column_name: '讲座', column_type: 'link', column_data: { table: '讲座' } }] }, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /other_table/);
  assert.equal(platformRequests.length, 0);
});

test('失败信息：400 带出平台说明和接口；504 网页不交给模型并附处理建议；200 网页判为登录过期', async () => {
  const { runTool } = await import('../tools/index.js');
  const add = { action: 'add', ...B, columns: [{ column_name: 'x', column_type: 'text' }] };

  platform = () => new Response(JSON.stringify({ error_type: 'parameter_error', error_message: 'column x invalid.' }), { status: 400 });
  let r = await runTool('column', add, {});
  assert.match(r.error, /^POST …\/batch-append-columns\/ 失败（400）：column x invalid\.$/);
  assert.equal(r.detail.error_type, 'parameter_error');
  assert.match(r.hint, /修正/);

  platform = () => new Response('<html><h1>504 Gateway Time-out</h1></html>', { status: 504 });
  r = await runTool('column', add, {});
  assert.match(r.error, /失败（504）$/);
  assert.equal(r.detail, undefined);
  assert.match(r.hint, /先用查询类工具确认/);

  platform = () => new Response('<!DOCTYPE html><title>登录</title>', { status: 200 });
  r = await runTool('list_bases', {}, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /登录已过期/);
});

test('loop：工具执行中点停止，立即结束（不等卡住的请求）', async () => {
  platform = () => new Promise(() => {}); // 平台永不响应
  const ac = new AbortController();
  modelScript.push([ev({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'column', arguments: JSON.stringify({ action: 'add', ...B, columns: [{ column_name: 'x', column_type: 'text' }] }) } }] })]);
  const messages = [{ role: 'user', content: 'x' }];
  setTimeout(() => ac.abort(), 50);
  const t0 = Date.now();
  await assert.rejects(runAgent({ messages, settings, ctx: {}, signal: ac.signal, on: { toolEnd: () => assert.fail('不应等到工具结束') } }), { name: 'AbortError' });
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(messages.at(-1).tool_calls[0].id, 'c1'); // 未回填，由侧边栏 repairIncomplete 记为结果未知
});

test('系统提示词里的应用示例能通过编译', async () => {
  const { EXAMPLE_APP } = await import('../agent/prompt.js');
  const { compile } = await import('../checker/app-compiler.js');
  const meta = { tables: [{ _id: '0000', name: '报名', columns: [{ key: '0000', name: '姓名', type: 'text' }, { key: 'aB3d', name: '学院', type: 'text' }] }] };
  const r = compile(EXAMPLE_APP, meta);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics, null, 1));
  assert.deepEqual(r.diagnostics, []);
});

test('column add：按钮列缺动作列表时报错；正确时补 _id 和按钮名', async () => {
  const { runTool } = await import('../tools/index.js');
  let r = await runTool('column', { action: 'add', ...B, columns: [{ column_name: '取消', column_type: 'button', column_data: { action: { type: 'update_row' } } }] }, {});
  assert.equal(r.ok, false);
  assert.match(r.error, /button_action_list/);
  platform = () => new Response('{}');
  r = await runTool('column', { action: 'add', ...B, columns: [{ column_name: '取消', column_type: 'button', column_data: {
    button_action_list: [{ action_type: 'modify_row', selected_columns: [{ key: 'st01', value: 'can' }] }] } }] }, {});
  assert.equal(r.ok, true, JSON.stringify(r));
  const data = gwBodies().at(-1).columns[0].column_data;
  assert.equal(data.button_name, '取消');
  assert.ok(data.button_action_list[0]._id);
});

test('column：链接公式缺参数、把已有列改成 ctime，都在发请求前拦下', async () => {
  const { runTool } = await import('../tools/index.js');
  let r = await runTool('column', { action: 'add', ...B, columns: [{ column_name: '地点', column_type: 'link-formula', column_data: { formula: 'lookup', link_column: '讲座' } }] }, {});
  assert.match(r.error, /level1_linked_column/);
  r = await runTool('column', { action: 'update', ...B, column: '报名时间', op_type: 'modify_column_type', new_column_type: 'ctime' }, {});
  assert.match(r.error, /新建一列/);
  assert.equal(platformRequests.length, 0);
});
