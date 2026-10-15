// sidepanel/markdown.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown as md } from '../sidepanel/markdown.js';

test('安全：原始 HTML 一律转义', () => {
  const out = md('<img src=x onerror=alert(1)> <script>alert(1)</script> **<b>x</b>**');
  assert.ok(!/<img|<script|<b>/.test(out), out);
  assert.match(out, /&lt;script&gt;/);
});

test('安全：只允许 http(s) 链接；javascript: 原样显示为文本', () => {
  assert.ok(!md('[点我](javascript:alert(1))').includes('<a'));
  assert.ok(!md('![x](javascript:alert(1))').includes('<img'));
  const a = md('[文档](https://a.com/x?a=1&b="2")');
  assert.match(a, /<a href="https:\/\/a\.com\/x\?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener noreferrer">文档<\/a>/);
});

test('标题、段落、单换行、强调、删除线、行内代码', () => {
  assert.equal(md('## 访问地址'), '<h2>访问地址</h2>');
  assert.equal(md('第一行\n第二行\n\n第二段'), '<p>第一行<br>第二行</p><p>第二段</p>');
  assert.equal(md('**粗** *斜* ~~删~~ `a*b*c`'), '<p><strong>粗</strong> <em>斜</em> <del>删</del> <code>a*b*c</code></p>');
});

test('下划线不当作斜体（列类型 single_select 等）', () => {
  assert.equal(md('类型 single_select 和 column_key_x'), '<p>类型 single_select 和 column_key_x</p>');
});

test('代码块内容不解析', () => {
  assert.equal(md('```json\n{"a": "**x**"}\n<b>\n```'), '<pre><code>{&quot;a&quot;: &quot;**x**&quot;}\n&lt;b&gt;</code></pre>');
});

test('嵌套列表、有序列表起始号、列表项内的粗体', () => {
  const out = md('- **在线报名**（表单页）\n  - 姓名必填\n  - 提交写入表\n- 报名登记\n\n3. 三\n4. 四');
  assert.equal(out, '<ul><li><strong>在线报名</strong>（表单页）<ul><li>姓名必填</li><li>提交写入表</li></ul></li><li>报名登记</li></ul><ol start="3"><li>三</li><li>四</li></ol>');
});

test('列表项之间有空行仍是同一个列表', () => {
  assert.equal(md('1. 一\n\n2. 二'), '<ol><li>一</li><li>二</li></ol>');
});

test('表格（含对齐和缺单元格）', () => {
  const out = md('| 列名 | 类型 |\n|---|:-:|\n| 姓名 | 文本 |\n| 报名时间 |');
  assert.equal(out, '<div class="table-wrap"><table><thead><tr><th>列名</th><th style="text-align:center">类型</th></tr></thead>'
    + '<tbody><tr><td>姓名</td><td style="text-align:center">文本</td></tr><tr><td>报名时间</td><td style="text-align:center"></td></tr></tbody></table></div>');
});

test('引用、分隔线、图片、裸 URL（不吞中文标点）', () => {
  assert.equal(md('> 注意\n> 第二行'), '<blockquote><p>注意<br>第二行</p></blockquote>');
  assert.equal(md('---'), '<hr>');
  assert.equal(md('![logo](https://x.cn/a.png)'), '<p><img src="https://x.cn/a.png" alt="logo"></p>');
  assert.equal(md('地址：https://table.nju.edu.cn/external-apps/f6/。'),
    '<p>地址：<a href="https://table.nju.edu.cn/external-apps/f6/" target="_blank" rel="noopener noreferrer">https://table.nju.edu.cn/external-apps/f6/</a>。</p>');
});

test('流式输出到一半（未闭合的代码块 / 粗体）不报错', () => {
  assert.doesNotThrow(() => md('```js\nconst a'));
  assert.equal(md('**未闭合'), '<p>**未闭合</p>');
  assert.equal(md(''), '');
});
