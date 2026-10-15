// OpenAI 兼容的流式 chat/completions 请求（默认 DeepSeek）。
// 边接收边通过 onText 回调文本、onReasoning 回调思考内容；结束后返回完整的 content、reasoning_content 和 tool_calls。
// reasoning_content：DeepSeek 思考模式的思考内容，带工具调用时必须在后续请求中回传。

export async function chat({ baseUrl, apiKey, model, messages, tools, signal, onText, onReasoning }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}：${(await res.text()).slice(0, 300)}`);

  let content = '';
  let reasoning = '';
  const calls = [];   // 按 index 累积分片到达的 tool_calls
  let buffer = '';    // 未成行的残余数据
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;           // 跳过空行和 ": keep-alive" 注释
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      const delta = JSON.parse(payload).choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        onReasoning?.(delta.reasoning_content);
      }
      if (delta.content) {
        content += delta.content;
        onText?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.function.name += tc.function.name;
        if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
      }
    }
  }
  return { content, reasoning_content: reasoning, tool_calls: calls.filter(Boolean) };
}
