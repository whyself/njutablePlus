// 工具层公共部分：工具定义、参数检查、接口错误

export class ApiError extends Error {
  constructor(message, status, detail, hint) {
    super(message);
    this.status = status;
    this.data = detail;
    this.hint = hint;
  }
}

// 按状态码给模型的处理建议
function hintFor(status) {
  if (status === 0 || status >= 500)
    return '平台没有正常响应。常见原因是参数不符合要求导致平台卡住（如链接列缺 other_table），也可能是网络问题。'
      + '写操作可能已生效也可能没有：先用查询类工具确认，再修正参数重试，不要原样重复同一个请求。';
  if (status === 400) return '参数不符合平台要求：按 detail 里平台的说明和工具说明修正后再试。';
  if (status === 401 || status === 403) return '没有权限或登录已过期：请用户确认已登录 table.nju.edu.cn 且对该表格有写权限。';
  if (status === 404) return '名称或 id 不存在：先用 list_bases / get_base_schema / list_apps 确认准确的名称和 id。';
  return undefined;
}

// 平台返回的错误说明，没有就返回 null
function platformMessage(data) {
  if (data && typeof data === 'object')
    return data.error_message || data.error_msg || data.detail || data.error || null;
  return null;
}

const isHtml = (data) => typeof data === 'string' && /^\s*</.test(data);

// session.request / gateway 的返回值 → 成功返回 data，失败抛 ApiError
export function check(r) {
  if (r.ok && !isHtml(r.data)) return r.data;
  const where = `${r.method} ${String(r.path).replace(/^\/api-gateway\/api\/v2\/dtables\/[^/]+\//, '…/')}`;
  if (r.ok) // 接口返回了网页：通常是登录过期被重定向到登录页
    throw new ApiError(`${where} 返回了网页而不是数据，可能登录已过期`, r.status, undefined, '请用户刷新 table.nju.edu.cn 并确认已登录。');
  const msg = platformMessage(r.data) ?? (isHtml(r.data) ? null : r.data);
  const detail = isHtml(r.data) ? undefined : r.data; // 网页（如 504 错误页）不交给模型
  throw new ApiError(`${where} 失败（${r.status || '无响应'}）${msg ? `：${typeof msg === 'string' ? msg : JSON.stringify(msg)}` : ''}`,
    r.status, detail, hintFor(r.status));
}

// 分组工具：检查当前 action 的必填参数
export function need(args, keys) {
  const missing = keys.filter((k) => args[k] === undefined || args[k] === null || args[k] === '');
  if (missing.length) throw new Error(`action=${args.action} 缺少参数：${missing.join(', ')}`);
}

export function tool(name, description, properties, required, run) {
  return { name, description, parameters: { type: 'object', properties, required }, run };
}

// 表格级接口前缀
export const basePath = (ws, name) => `/api/v2.1/workspace/${ws}/dtable/${encodeURIComponent(name)}`;

// 常用参数定义
export const P = {
  workspace_id: { type: 'integer', description: '工作区 id，来自 list_bases' },
  base_name: { type: 'string', description: '表格（base）名称' },
  table_name: { type: 'string', description: '子表名称' },
  column: { type: 'string', description: '列名或列 key' },
  app_id: { type: 'integer', description: '应用 id，来自 list_apps' },
  action: (values) => ({ type: 'string', enum: values }),
};
