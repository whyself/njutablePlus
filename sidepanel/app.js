// 侧边栏：对话窗口（流式、Markdown）、思考过程和工具调用（默认收起）、图片上传/粘贴、设置、新对话、停止

import { runAgent } from '../agent/loop.js';
import * as chat from '../store/chat.js';
import { markdown } from './markdown.js';

const DEFAULT_SETTINGS = { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-flash' };

const $ = (id) => document.getElementById(id);
const log = $('log');   // 滚动容器
const msgs = $('msgs'); // 消息列表
const input = $('input');
const sendBtn = $('send');
const attachBox = $('attachments');
const dialog = $('settings');
const form = dialog.querySelector('form');

let state = await chat.load(); // { messages, images: Map, nextImage }
let pending = [];              // 待发送的图片：[{ id, base64, name, type, url }]
let controller = null;         // 运行中时的 AbortController

// ------------------------------------------------------------ 渲染

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// 停在底部附近时才自动跟随；往上翻看历史时不打扰。
// 用"变高之前的内容高度"判断是否在底部，不依赖 scroll 事件（它晚一帧才到，会把用户的上翻覆盖掉）
let lastHeight = 0;
function scroll(force = false) {
  if (force || log.scrollTop + log.clientHeight >= lastHeight - 40) log.scrollTop = log.scrollHeight;
  lastHeight = log.scrollHeight;
}

// 消息列表高度一变（流式文字、新消息、图片加载完）就跟到底部；在绘制前执行，不闪
new ResizeObserver(() => scroll()).observe(msgs);

function renderUser(content) {
  const div = el('div', 'msg user');
  if (typeof content === 'string') div.textContent = content;
  else for (const part of content) {
    if (part.type === 'text') div.append(part.text);
    if (part.type === 'image_url') {
      const img = el('img');
      img.src = part.image_url.url;
      div.append(img);
    }
  }
  msgs.append(div);
}

// 助手回复按 Markdown 渲染；流式时每帧最多重渲染一次
function renderAssistant(text = '') {
  const div = el('div', 'msg md');
  div.raw = text;
  div.innerHTML = markdown(text);
  msgs.append(div);
  return div;
}

function appendAssistant(div, t) {
  div.raw += t;
  if (div.queued) return;
  div.queued = true;
  requestAnimationFrame(() => { div.queued = false; div.innerHTML = markdown(div.raw); });
}

// 思考过程、工具调用：默认收起的一行（<details>），点开看详情
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';

function fold(cls, name) {
  const d = el('details', `fold ${cls}`);
  const summary = el('summary');
  summary.innerHTML = CHEVRON;
  d.nameEl = el('span', 'name', name);
  d.bodyEl = el('div', 'body');
  summary.append(d.nameEl);
  d.append(summary, d.bodyEl);
  msgs.append(d);
  return d;
}

function renderThink(text, live = false) {
  const d = fold(live ? 'think live' : 'think', live ? '思考中…' : '思考过程');
  d.textNode = document.createTextNode(text); // 流式时往末尾追加
  d.bodyEl.append(d.textNode);
  d.startedAt = Date.now();
  return d;
}

function finishThink(d) {
  d.classList.remove('live');
  d.nameEl.textContent = `思考了 ${Math.max(1, Math.round((Date.now() - d.startedAt) / 1000))} 秒`;
}

const pretty = (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };

function renderTool(call) {
  let args = {};
  try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
  const d = fold('tool running', [call.function.name, args.action].filter(Boolean).join(' · '));
  d.nameEl.before(el('span', 'status'));
  d.bodyEl.append(el('div', 'label', '参数'), el('pre', '', pretty(call.function.arguments || '{}')));
  return d;
}

function finishTool(d, result) {
  if (!d) return;
  d.classList.remove('running');
  d.classList.add(result.ok ? 'ok' : 'fail');
  d.bodyEl.append(el('div', 'label', '结果'), el('pre', '', JSON.stringify(result, null, 2).slice(0, 5000)));
}

function renderError(text) {
  msgs.append(el('div', 'msg error', text));
}

// 按历史重新渲染（打开侧边栏时恢复对话）
function renderHistory() {
  msgs.textContent = '';
  const tools = new Map();
  for (const m of state.messages) {
    if (m.role === 'user') renderUser(m.content);
    if (m.role === 'assistant') {
      if (m.reasoning_content) renderThink(m.reasoning_content);
      if (m.content) renderAssistant(m.content);
      for (const c of m.tool_calls ?? []) tools.set(c.id, renderTool(c));
    }
    if (m.role === 'tool') finishTool(tools.get(m.tool_call_id), JSON.parse(m.content));
  }
}

function setRunning(running) {
  sendBtn.classList.toggle('stop', running);
  sendBtn.title = running ? '停止' : '发送';
  sendBtn.setAttribute('aria-label', sendBtn.title);
}

// 输入框随内容长高（上限见 CSS max-height）
function autosize() {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight}px`;
}
input.addEventListener('input', autosize);

// ------------------------------------------------------------ 图片

function addImage(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result; // data:image/png;base64,...
    pending.push({ id: `img_${state.nextImage++}`, base64: url.split(',')[1], name: file.name || 'paste.png', type: file.type, url });
    renderAttachments();
  };
  reader.readAsDataURL(file);
}

function renderAttachments() {
  attachBox.textContent = '';
  for (const p of pending) {
    const chip = el('div', 'chip');
    const img = el('img');
    img.src = p.url;
    const remove = el('button', '', '×');
    remove.type = 'button';
    remove.onclick = () => { pending = pending.filter((x) => x !== p); renderAttachments(); };
    chip.append(img, el('span', '', p.id), remove);
    attachBox.append(chip);
  }
}

input.addEventListener('paste', (e) => {
  for (const item of e.clipboardData.items)
    if (item.type.startsWith('image/')) addImage(item.getAsFile());
});

$('file').addEventListener('change', (e) => {
  for (const f of e.target.files) addImage(f);
  e.target.value = '';
});

// ------------------------------------------------------------ 发送 / 停止

async function send() {
  const text = input.value.trim();
  if (!text && !pending.length) return;
  const settings = await getSettings();
  if (!settings.apiKey) return openSettings();

  // 有图片时用多段内容，并在文字里注明编号，模型调用 upload_image 时引用
  let content = text;
  if (pending.length) {
    content = [
      { type: 'text', text: `${text}\n\n（附图：${pending.map((p) => p.id).join('、')}）` },
      ...pending.map((p) => ({ type: 'image_url', image_url: { url: p.url } })),
    ];
    for (const p of pending) state.images.set(p.id, { base64: p.base64, name: p.name, type: p.type });
  }
  state.messages.push({ role: 'user', content });
  renderUser(content);
  scroll(true);
  input.value = '';
  autosize();
  pending = [];
  renderAttachments();
  await chat.save(state);

  controller = new AbortController();
  setRunning(true);
  let bubble = null;            // 当前正在流式写入的助手回复
  let think = null;             // 当前正在流式写入的思考过程
  const endThink = () => { if (think) finishThink(think); think = null; };
  const toolEls = new Map();
  try {
    await runAgent({
      messages: state.messages,
      settings,
      ctx: { images: state.images },
      signal: controller.signal,
      on: {
        reasoning: (t) => { think ??= renderThink('', true); think.textNode.appendData(t); },
        text: (t) => { endThink(); bubble ??= renderAssistant(); appendAssistant(bubble, t); },
        toolStart: (call) => {
          endThink();
          bubble = null;
          toolEls.set(call.id, renderTool(call));
          chat.save(state); // 每步都存：中途关闭侧边栏也不丢已完成的步骤（未完成的调用恢复时记为"结果未知"）
        },
        toolEnd: (call, result) => finishTool(toolEls.get(call.id), result),
      },
    });
  } catch (e) {
    chat.repairIncomplete(state.messages);
    // 中断时补一条助手消息（已显示的部分文字），保证历史仍是一问一答交替
    if (state.messages.at(-1)?.role !== 'assistant')
      state.messages.push({ role: 'assistant', content: bubble?.raw || '（已停止）' });
    renderError(e.name === 'AbortError' ? '已停止' : `出错：${e.message}`);
  } finally {
    endThink();
    controller = null;
    setRunning(false);
    await chat.save(state);
  }
}

sendBtn.onclick = () => (controller ? controller.abort() : send());

input.addEventListener('keydown', (e) => {
  // isComposing：中文输入法选词时按 Enter 不发送
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!controller) send();
  }
});

// ------------------------------------------------------------ 新对话

$('new-chat').onclick = async () => {
  controller?.abort();
  await chat.clear();
  state = { messages: [], images: new Map(), nextImage: 1 };
  pending = [];
  renderAttachments();
  msgs.textContent = '';
};

// ------------------------------------------------------------ 设置

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function openSettings() {
  const s = await getSettings();
  for (const k of ['baseUrl', 'apiKey', 'model']) form.elements[k].value = s[k];
  dialog.showModal();
}

$('open-settings').onclick = openSettings;

$('save-settings').onclick = async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const s = {
    baseUrl: form.elements.baseUrl.value.trim(),
    apiKey: form.elements.apiKey.value.trim(),
    model: form.elements.model.value.trim(),
  };
  let origin;
  try { origin = new URL(s.baseUrl).origin; } catch { return alert('Base URL 格式不正确'); }
  // 换成其他供应商时，需要访问该域名的权限（DeepSeek 已在 manifest 中声明，不会弹窗）
  if (!(await chrome.permissions.request({ origins: [`${origin}/*`] })))
    return alert(`没有获得访问 ${origin} 的权限，无法调用该模型`);
  await chrome.storage.local.set({ settings: s });
  dialog.close();
};

// ------------------------------------------------------------ 启动

renderHistory();
scroll(true);
