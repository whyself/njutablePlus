// 当前对话：保存在 chrome.storage.local，侧边栏关闭再打开时恢复；"新对话"时清空。
// 结构：{ messages: [...], images: [[id, {base64, name, type}], ...], nextImage: 1 }

const KEY = 'chat';

export async function load() {
  const { [KEY]: saved } = await chrome.storage.local.get(KEY);
  const messages = repairIncomplete(saved?.messages ?? []);
  return { messages, images: new Map(saved?.images ?? []), nextImage: saved?.nextImage ?? 1 };
}

export async function save(state) {
  await chrome.storage.local.set({
    [KEY]: { messages: state.messages, images: [...state.images], nextImage: state.nextImage },
  });
}

export async function clear() {
  await chrome.storage.local.remove(KEY);
}

// 中途关闭侧边栏时，历史可能停在"模型要求调用工具，但结果没回填完"的状态，这样的历史再发给模型会报错。
// 不删除这些调用（工具可能已经在平台上执行了），而是补上"结果未知"，让模型先查询确认。
export function repairIncomplete(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant' || !m.tool_calls) continue;
    const answered = new Set(messages.slice(i + 1).filter((x) => x.role === 'tool').map((x) => x.tool_call_id));
    for (const c of m.tool_calls)
      if (!answered.has(c.id))
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: false, error: '执行被中断，结果未知，请先查询确认' }) });
    break;
  }
  return messages;
}
