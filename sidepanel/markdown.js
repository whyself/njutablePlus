// 极简 Markdown → HTML，用于渲染模型回复。
// 安全：所有文本先转义，不保留任何原始 HTML；链接和图片只允许 http(s)（图片另允许 data:image）。
// 支持：标题、段落（单换行保留为换行）、粗体 / 斜体 / 删除线、行内代码、代码块、引用、
//       有序 / 无序列表（可嵌套）、表格、分隔线、链接、图片、裸 URL。

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (url, image) => /^https?:\/\//i.test(url) || (image && /^data:image\//i.test(url));

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

export function markdown(src) {
  return blocks(String(src ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n'));
}

function isTable(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-');
}

function startsBlock(lines, i) {
  const l = lines[i];
  return FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || LIST.test(l) || isTable(lines, i);
}

function blocks(lines) {
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) { i++; continue; }

    if ((m = FENCE.exec(line))) {
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(m[1]); i++) body.push(lines[i]);
      i++;
      out += `<pre><code>${esc(body.join('\n'))}</code></pre>`;
    } else if ((m = HEADING.exec(line))) {
      out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
      i++;
    } else if (HR.test(line)) {
      out += '<hr>';
      i++;
    } else if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out += `<blockquote>${blocks(body)}</blockquote>`;
    } else if (isTable(lines, i)) {
      i = table(lines, i, (html) => { out += html; });
    } else if (LIST.test(line)) {
      i = list(lines, i, (html) => { out += html; });
    } else {
      const body = [];
      do body.push(lines[i++]); while (i < lines.length && lines[i].trim() && !startsBlock(lines, i));
      out += `<p>${body.map((l) => inline(l.trim())).join('<br>')}</p>`;
    }
  }
  return out;
}

function cells(row) {
  return row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function table(lines, i, emit) {
  const head = cells(lines[i]);
  const align = cells(lines[i + 1]).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : ''));
  const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`;
  let html = `<table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>`;
  for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) {
    const row = cells(lines[i]);
    html += `<tr>${head.map((_, k) => td('td', row[k] ?? '', k)).join('')}</tr>`;
  }
  emit(`<div class="table-wrap">${html}</tbody></table></div>`);
  return i;
}

function list(lines, i, emit) {
  const first = LIST.exec(lines[i]);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  while (i < lines.length) {
    const line = lines[i];
    const m = LIST.exec(line);
    if (m && m[1].length === indent && /\d/.test(m[2]) === ordered) {
      items.push({ offset: m[0].length, lines: [line.slice(m[0].length)] });
      i++;
    } else if (!line.trim()) {
      // 空行：后面还是本列表的内容才继续
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const n = j < lines.length ? lines[j] : '';
      const nm = LIST.exec(n);
      const more = (nm && nm[1].length === indent && /\d/.test(nm[2]) === ordered) || (n.match(/^\s*/)[0].length > indent && n.trim());
      if (!more) break;
      items.at(-1).lines.push('');
      i++;
    } else if (line.match(/^\s*/)[0].length > indent) {
      const it = items.at(-1);
      it.lines.push(line.replace(new RegExp(`^ {0,${it.offset}}`), ''));
      i++;
    } else if (!m && !startsBlock(lines, i)) {
      items.at(-1).lines.push(line.trim()); // 懒惰续行
      i++;
    } else break;
  }
  const start = ordered ? parseInt(first[2], 10) : 1;
  const tag = ordered ? 'ol' : 'ul';
  const body = items.map((it) => {
    const [head, ...rest] = it.lines;
    const textLines = [head];
    while (rest.length && rest[0].trim() && !LIST.test(rest[0]) && !FENCE.test(rest[0])) textLines.push(rest.shift().trim());
    return `<li>${textLines.map(inline).join('<br>')}${blocks(rest)}</li>`;
  }).join('');
  emit(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${body}</${tag}>`);
  return i;
}

function inline(s) {
  const slots = [];
  const hold = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  s = s.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (all, alt, url) =>
    (safeUrl(url, true) ? hold(`<img src="${esc(url)}" alt="${esc(alt)}">`) : all));
  s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (all, text, url) =>
    (safeUrl(url) ? hold(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${emphasis(esc(text))}</a>`) : all));
  s = s.replace(/https?:\/\/[^\s<>"'()（）\u0000]*[^\s<>"'()（）.,;:!?，。；：！？、\u0000]/g, (url) =>
    hold(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`));
  s = emphasis(esc(s));
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[n]);
}

// 不支持 _斜体_：snake_case（如 single_select、column_key）很常见，容易误伤
function emphasis(s) {
  return s
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>');
}
