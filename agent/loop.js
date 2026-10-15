// agent loop：调用模型 → 模型要求调用工具就执行并把结果回填 → 重复，直到模型不再调用工具。

import { chat } from './llm.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { toolSchemas, runTool } from '../tools/index.js';

// 防止模型陷入无限循环的上限（不是权限限制）
const MAX_STEPS = 300;

// messages：对话历史（不含 system），由侧边栏保存；本函数会把新消息追加进去
// settings：{ baseUrl, apiKey, model }
// ctx：传给工具的上下文，目前是 { images: Map<'img_1', {base64, name, type}> }
// on：界面回调 { text(delta), reasoning(delta), toolStart(call), toolEnd(call, result) }，都可省略
// signal：AbortSignal，用户点"停止"时中断
export async function runAgent({ messages, settings, ctx, on = {}, signal }) {
  for (let step = 0; step < MAX_STEPS; step++) {
    // 1. 调用模型（流式），文本和思考内容实时交给界面
    const reply = await chat({
      ...settings,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: toolSchemas,
      signal,
      onText: on.text,
      onReasoning: on.reasoning,
    });

    // 2. 把模型的回复记入历史
    const assistant = { role: 'assistant', content: reply.content };
    if (reply.reasoning_content) assistant.reasoning_content = reply.reasoning_content; // DeepSeek 思考模式 + 工具调用时必须回传，否则 400
    if (reply.tool_calls.length) assistant.tool_calls = reply.tool_calls;
    messages.push(assistant);

    // 3. 模型没有调用工具：本轮结束
    if (!reply.tool_calls.length) return;

    // 4. 依次执行工具，把结果作为 tool 消息回填
    for (const call of reply.tool_calls) {
      on.toolStart?.(call);
      let args = null;
      try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
      const result = args === null
        ? { ok: false, error: '工具参数不是合法的 JSON' }
        : await untilAbort(runTool(call.function.name, args, ctx), signal);
      on.toolEnd?.(call, result);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error(`已执行 ${MAX_STEPS} 步仍未结束，已停止`);
}

// 点"停止"时立即返回，不等工具执行完（工具里的页面请求无法中断，结果未知，由侧边栏记为"执行被中断"）
function untilAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const stop = () => reject(new DOMException('已停止', 'AbortError'));
    if (signal.aborted) return stop();
    signal.addEventListener('abort', stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}
