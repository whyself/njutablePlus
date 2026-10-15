// 汇总所有工具：提供给模型的 schema + 统一的执行入口

import { baseTools } from './base-tools.js';
import { appTools } from './app-tools.js';
import { docTools } from './doc-tools.js';

const all = [...baseTools, ...appTools, ...docTools];

// OpenAI 兼容格式的 tools 参数
export const toolSchemas = all.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// 执行工具。结果统一为 { ok: true, data } 或 { ok: false, error, status?, detail?, hint?, diagnostics? }
export async function runTool(name, args, ctx) {
  const t = all.find((x) => x.name === name);
  if (!t) return { ok: false, error: `未知工具 ${name}` };
  try {
    return { ok: true, data: await t.run(args, ctx) };
  } catch (e) {
    const r = { ok: false, error: e.message };
    if (e.status !== undefined) r.status = e.status;
    if (e.data !== undefined) r.detail = e.data;
    if (e.hint) r.hint = e.hint;
    if (e.diagnostics) r.diagnostics = e.diagnostics;
    return r;
  }
}
