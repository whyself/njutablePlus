// 写应用前后的配置存进 chrome.storage.local（快照 / 待修改版本）

export async function save(entry) {
  const { history = [] } = await chrome.storage.local.get('history');
  history.push({ time: new Date().toISOString(), ...entry });
  await chrome.storage.local.set({ history });
}

export async function list() {
  const { history = [] } = await chrome.storage.local.get('history');
  return history;
}
