// 登录态：在已登录的 table.nju.edu.cn 标签页里代为发请求。
// 写请求需要 cookie + CSRF + 同源 Referer，只有在页面里发出才能满足，所以所有请求都注入到该标签页执行。

const ORIGIN = 'https://table.nju.edu.cn';

// 找一个 table.nju.edu.cn 的标签页，优先用当前激活的
export async function findTab() {
  const tabs = await chrome.tabs.query({ url: ORIGIN + '/*' });
  if (!tabs.length) throw new Error('没有找到 table.nju.edu.cn 的标签页，请先打开并登录');
  return tabs.find((t) => t.active) || tabs[0];
}

// 注入到页面里执行的函数：不能引用外部变量，参数必须可序列化
async function pageFetch(method, path, json, form, headers) {
  try {
    const csrf = (document.cookie.match(/(?:^|;\s*)dtable_csrftoken=([^;]+)/) || [])[1];
    const h = { ...headers };
    if (method !== 'GET' && csrf) h['X-CSRFToken'] = csrf;
    let body;
    if (json !== null) {
      h['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form !== null) {
      body = new FormData();
      for (const [k, v] of Object.entries(form)) {
        if (v && typeof v === 'object' && 'base64' in v) {
          const bytes = Uint8Array.from(atob(v.base64), (c) => c.charCodeAt(0));
          body.append(k, new File([bytes], v.name, { type: v.type }));
        } else {
          body.append(k, v);
        }
      }
    }
    // 60 秒没有响应就放弃：平台遇到某些错误参数（如链接列缺 other_table）会一直不返回
    const res = await fetch(new URL(path, location.origin), { method, headers: h, body, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    const data = e.name === 'TimeoutError' ? '请求超时（60 秒没有响应）' : `请求没有发出或连接中断：${e.message}`;
    return { ok: false, status: 0, data };
  }
}

// 发请求。json 和 form 二选一；form 里的文件写成 { base64, name, type }
// 在扩展的隔离环境中执行即可通过 CSRF 校验（已实测）
export async function request(method, path, { json = null, form = null, headers = {} } = {}) {
  const tab = await findTab();
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: pageFetch,
    args: [method, path, json, form, headers],
  });
  return { ...r.result, method, path }; // method / path 用于错误信息
}

// 是否已登录：未登录时接口返回 403 或登录页 HTML
export async function checkLogin() {
  const r = await request('GET', '/api/v2.1/workspaces/');
  return r.ok && typeof r.data === 'object';
}

// Base-Token 缓存（平台默认有效期 3 天，这里 2 小时后重新获取）
const tokens = new Map();

export async function baseToken(workspaceId, baseName) {
  const key = `${workspaceId}/${baseName}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now()) return cached;
  const r = await request('GET', `/api/v2.1/workspace/${workspaceId}/dtable/${encodeURIComponent(baseName)}/access-token/`);
  if (!r.ok)
    throw new Error(`无法访问表格「${baseName}」（workspace_id=${workspaceId}，状态 ${r.status || '无响应'}）：`
      + '名称或 workspace_id 不对、没有权限或登录过期；先用 list_bases 确认');
  const t = { token: r.data.access_token, uuid: r.data.dtable_uuid, expires: Date.now() + 2 * 3600 * 1000 };
  tokens.set(key, t);
  return t;
}

// 表格内部接口：/api-gateway/api/v2/dtables/{uuid}/{subpath}
export async function gateway(method, workspaceId, baseName, subpath, opts = {}) {
  const t = await baseToken(workspaceId, baseName);
  return request(method, `/api-gateway/api/v2/dtables/${t.uuid}/${subpath}`, {
    ...opts,
    headers: { ...opts.headers, Authorization: 'Bearer ' + t.token },
  });
}
