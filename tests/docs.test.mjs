// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DOC_FILES, search, read } from '../tools/doc-tools.js';
import { compile } from '../checker/app-compiler.js';

const dir = new URL('../knowledge/', import.meta.url);
const text = (f) => readFileSync(new URL(f, dir), 'utf8').replace(/\r\n/g, '\n');

test('资料文件和 DOC_FILES 一致，目录列出了每一篇', () => {
  assert.deepEqual([...DOC_FILES].sort(), readdirSync(dir).filter((f) => f.endsWith('.md')).sort());
  for (const f of DOC_FILES.filter((x) => x !== 'index.md')) assert.ok(text('index.md').includes(f), `index.md 缺 ${f}`);
});

test('search 按命中词数排序，返回文件和小节标题', async () => {
  const { hits } = await search('按钮 modify_row');
  assert.ok(hits.length > 0);
  assert.equal(hits[0].file, 'columns.md');
  assert.match(hits[0].section, /按钮/);
  assert.ok(hits.length <= 6);
  const none = await search('完全不存在的词xyz');
  assert.deepEqual(none.hits, []);
  assert.match(none.tip, /index\.md/);
});

test('read 读整篇或小节；文件、小节不存在时报错并列出可选项', async () => {
  assert.match((await read('filters.md')).text, /^# 过滤条件/);
  assert.match((await read('filters.md', '当前用户')).text, /include_me/);
  await assert.rejects(read('nope.md'), /可用/);
  await assert.rejects(read('filters.md', '不存在的小节'), /可用/);
});

// 资料里写成完整对象的表单页、表格页示例，必须能通过编译（不带表格结构，只查结构和取值）
test('资料里的页面示例能通过编译', () => {
  let checked = 0;
  for (const f of DOC_FILES) {
    for (const [, body] of text(f).matchAll(/```json\n([\s\S]*?)```/g)) {
      let obj;
      try { obj = JSON.parse(body); } catch { continue; } // 片段，跳过
      if (!['form', 'table'].includes(obj.type)) continue;
      const cfg = { app_name: 'x', settings: { navigation: [{ id: obj.id, type: 'page' }], pages: [obj] } };
      const r = compile(cfg, null);
      assert.equal(r.ok, true, `${f}：${JSON.stringify(r.diagnostics, null, 1)}`);
      checked++;
    }
  }
  assert.ok(checked >= 2);
});
