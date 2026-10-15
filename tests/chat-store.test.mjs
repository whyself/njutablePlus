// store/chat.js：保存 / 恢复 / 清空当前对话；补全中断的工具调用
import { test } from 'node:test';
import assert from 'node:assert/strict';

const data = {};
globalThis.chrome = {
  storage: { local: {
    get: async (k) => ({ [k]: structuredClone(data[k]) }),
    set: async (o) => Object.assign(data, structuredClone(o)),
    remove: async (k) => { delete data[k]; },
  } },
};
const chat = await import('../store/chat.js');

const call = (id) => ({ id, type: 'function', function: { name: 'list_bases', arguments: '{}' } });
const toolMsg = (id) => ({ role: 'tool', tool_call_id: id, content: '{"ok":true}' });

test('repairIncomplete：完整的历史不变', () => {
  const m = [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', tool_calls: [call('a')] }, toolMsg('a'), { role: 'assistant', content: '好' }];
  assert.deepEqual(chat.repairIncomplete(structuredClone(m)), m);
});

test('repairIncomplete：未回填的工具调用补上"结果未知"，已回填的保留', () => {
  const m = [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', tool_calls: [call('a'), call('b')] }, toolMsg('a')];
  const r = chat.repairIncomplete(m);
  assert.equal(r.length, 4);
  assert.equal(r[3].tool_call_id, 'b');
  assert.match(JSON.parse(r[3].content).error, /中断/);
});

test('repairIncomplete：只检查最后一条带工具调用的助手消息', () => {
  const m = [
    { role: 'assistant', content: '', tool_calls: [call('old')] }, toolMsg('old'),
    { role: 'user', content: 'y' },
  ];
  assert.equal(chat.repairIncomplete(structuredClone(m)).length, 3);
});

test('save → load 恢复对话和图片；load 时自动补全中断的调用', async () => {
  await chat.save({
    messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: '', tool_calls: [call('a')] }],
    images: new Map([['img_1', { base64: 'AAA', name: 'a.png', type: 'image/png' }]]),
    nextImage: 2,
  });
  const s = await chat.load();
  assert.equal(s.messages.length, 3);
  assert.equal(s.messages[2].tool_call_id, 'a');
  assert.deepEqual(s.images.get('img_1'), { base64: 'AAA', name: 'a.png', type: 'image/png' });
  assert.equal(s.nextImage, 2);
});

test('clear 后 load 得到空对话', async () => {
  await chat.clear();
  const s = await chat.load();
  assert.deepEqual(s.messages, []);
  assert.equal(s.images.size, 0);
  assert.equal(s.nextImage, 1);
});
