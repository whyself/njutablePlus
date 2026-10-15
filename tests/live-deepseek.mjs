// 手动运行（不在 npm test 中）：用真实 DeepSeek 跑一次带工具调用的 agent loop，
// 验证多步调用时回传 reasoning_content 不会报 400。平台侧用假数据，不访问南大表格。
//
// PowerShell：先设置 $env:DEEPSEEK_API_KEY，再运行 node tests/live-deepseek.mjs

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('请先设置环境变量 DEEPSEEK_API_KEY');
  process.exit(1);
}

// 任何平台请求都返回同一份假的工作区数据
globalThis.chrome = {
  tabs: { query: async () => [{ id: 1, active: true }] },
  scripting: {
    executeScript: async () => [{ result: { ok: true, status: 200, data: { workspace_list: [
      { id: 7, type: 'personal', name: 'personal', table_list: [{ name: '社团招新表' }, { name: '自习时间' }] },
    ] } } }],
  },
};

// 诊断：复制一份模型的流式响应，统计 delta 里出现过的字段
const deltaKeys = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const res = await realFetch(url, init);
  res.clone().text().then((raw) => {
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta ?? {};
      for (const [k, v] of Object.entries(delta)) if (v !== null && v !== '') deltaKeys.set(k, (deltaKeys.get(k) || 0) + 1);
    }
  });
  return res;
};

const { runAgent } = await import('../agent/loop.js');

const messages = [{ role: 'user', content: '我有哪些表格？' }];
await runAgent({
  messages,
  settings: { baseUrl: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY, model: 'deepseek-flash' },
  ctx: { images: new Map() },
  on: {
    text: (t) => process.stdout.write(t),
    toolStart: (c) => console.log(`\n[调用工具 ${c.function.name}]`),
    toolEnd: (c, r) => console.log(`[工具结果 ok=${r.ok}]`),
  },
});

await new Promise((r) => setTimeout(r, 200)); // 等诊断读完
console.log('\n\n流式 delta 中出现的字段（非空次数）：', Object.fromEntries(deltaKeys));
console.log('消息顺序：', messages.map((m) => m.role).join(' → '));
console.log('带 reasoning_content 的助手消息数：', messages.filter((m) => m.reasoning_content).length);
console.log('✔ 多步调用完成，没有出现 400');
