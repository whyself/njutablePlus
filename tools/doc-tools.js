// 平台资料工具 docs：在 knowledge/ 下的 Markdown 资料里搜索、阅读
// 资料按 "## " 小节切分；search 按关键词命中数排序返回小节，read 返回整篇或某一节

import { tool, need, P } from './common.js';

// knowledge/ 下的文件（index.md 是目录）
export const DOC_FILES = ['index.md', 'columns.md', 'formulas.md', 'filters.md', 'app.md', 'form-page.md',
  'table-page.md', 'other-pages.md', 'permissions.md', 'patterns.md'];

const MAX_HITS = 6;
const MAX_SECTION = 2000;
const MAX_READ = 12000;

const cache = new Map();

// 扩展里用 fetch 读打包的文件；node 测试里直接读磁盘
async function load(file) {
  if (!cache.has(file)) {
    const url = new URL(`../knowledge/${file}`, import.meta.url);
    const text = globalThis.chrome?.runtime?.getURL
      ? await (await fetch(chrome.runtime.getURL(`knowledge/${file}`))).text()
      : await (await import('node:fs/promises')).readFile(url, 'utf8');
    cache.set(file, text.replace(/\r\n/g, '\n'));
  }
  return cache.get(file);
}

// 按 "## " 切成小节；第一节是文件开头到第一个 "## " 之间的内容
function sections(file, text) {
  const out = [];
  let cur = { file, heading: '', lines: [] };
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      if (cur.lines.join('').trim()) out.push(cur);
      cur = { file, heading: line.slice(3).trim(), lines: [] };
    }
    cur.lines.push(line);
  }
  if (cur.lines.join('').trim()) out.push(cur);
  return out.map((s) => ({ file: s.file, heading: s.heading, text: s.lines.join('\n').trim() }));
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}\n…（已截断，用 read 读全文）` : s);

export async function search(query) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('query 不能为空');
  const hits = [];
  for (const file of DOC_FILES.filter((f) => f !== 'index.md')) { // 目录不参与搜索
    for (const s of sections(file, await load(file))) {
      const body = s.text.toLowerCase(), head = s.heading.toLowerCase();
      const matched = words.filter((w) => body.includes(w));
      if (!matched.length) continue;
      // 命中词越多越靠前；标题命中加分
      const score = matched.length * 10 + words.filter((w) => head.includes(w)).length * 5;
      hits.push({ score, file, section: s.heading, text: s.text });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return { hits: [], tip: '没有找到。换个说法或拆成更短的关键词再试，或者 read index.md 看目录' };
  return { hits: hits.slice(0, MAX_HITS).map(({ file, section, text }) => ({ file, section, text: clip(text, MAX_SECTION) })) };
}

export async function read(file, section) {
  if (!DOC_FILES.includes(file)) throw new Error(`没有资料 ${file}，可用：${DOC_FILES.join(', ')}`);
  const text = await load(file);
  if (!section) return { file, text: clip(text, MAX_READ) };
  const found = sections(file, text).filter((s) => s.heading.includes(section));
  if (!found.length)
    throw new Error(`${file} 里没有标题含「${section}」的小节，可用：${sections(file, text).map((s) => s.heading).filter(Boolean).join('、')}`);
  return { file, text: clip(found.map((s) => s.text).join('\n\n'), MAX_READ) };
}

export const docTools = [
  tool('docs', '平台资料（列类型、公式、过滤条件、应用页面、权限、常见做法）：search 按关键词搜索（空格分隔多个词，中英文都可），'
    + 'read 读整篇或其中一节。字段名、取值格式不确定时先查资料，不要靠反复试错猜。',
  { action: P.action(['search', 'read']),
    query: { type: 'string', description: 'search 用：关键词，如 "按钮 modify_row" "include_me 自己"' },
    file: { type: 'string', description: `read 用：${DOC_FILES.join(' / ')}` },
    section: { type: 'string', description: 'read 用：小节标题（包含即可），省略时读整篇' } },
  ['action'], async (a) => {
    switch (a.action) {
      case 'search': need(a, ['query']); return search(a.query);
      case 'read': need(a, ['file']); return read(a.file, a.section);
    }
  }),
];
